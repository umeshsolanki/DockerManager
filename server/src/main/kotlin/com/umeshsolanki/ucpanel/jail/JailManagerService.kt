package com.umeshsolanki.ucpanel.jail

import com.umeshsolanki.ucpanel.*
import com.umeshsolanki.ucpanel.ServiceContainer
import com.umeshsolanki.ucpanel.system.IpLookupService
import com.umeshsolanki.ucpanel.constants.TimeoutConstants
import com.umeshsolanki.ucpanel.firewall.IFirewallService
import com.umeshsolanki.ucpanel.firewall.BlockIPRequest
import com.umeshsolanki.ucpanel.proxy.ProxyJailRuleType
import com.umeshsolanki.ucpanel.proxy.ProxyJailRuleTarget
import com.umeshsolanki.ucpanel.proxy.ProxyJailMatchMode
import com.umeshsolanki.ucpanel.fcm.FcmService
import kotlinx.coroutines.*
import org.slf4j.LoggerFactory
import java.util.concurrent.ConcurrentHashMap

interface IJailManagerService {
    fun listJails(): List<JailedIP>
    suspend fun jailIP(ip: String, durationMinutes: Int, reason: String): Boolean
    suspend fun performJailExecution(ip: String, durationMinutes: Int, reason: String): Boolean
    fun unjailIP(ip: String): Boolean
    fun getCountryCode(ip: String): String
    fun isIPJailed(ip: String): Boolean
    
    // Failed login attempt tracking
    fun recordFailedLoginAttempt(ip: String)
    fun recordInvalidApiAttempt(ip: String)
    fun clearFailedAttempts(ip: String)
    
    // Proxy security violation checking
    fun checkProxySecurityViolation(ip: String, userAgent: String, method: String, path: String, status: Int, errorCount: Long, hostHeader: String = "")
}

class JailManagerServiceImpl(
    private val firewallService: IFirewallService,
    private val ipReputationService: com.umeshsolanki.ucpanel.ip.IIpReputationService,
    private val kafkaService: com.umeshsolanki.ucpanel.kafka.IKafkaService,
    private val settingsProvider: () -> AppSettings = { AppConfig.settings }
) : IJailManagerService {
    private val logger = LoggerFactory.getLogger(JailManagerServiceImpl::class.java)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var unjailJob: Job? = null
    private val countryCache = ConcurrentHashMap<String, String>()
    
    // Failed login attempt tracking
    private val failedAttemptsInWindow = ConcurrentHashMap<String, Int>()
    
    // specialized mirror tracking
    private val dangerViolationsInWindow = ConcurrentHashMap<String, Int>()
    private val burstViolationsInWindow = ConcurrentHashMap<String, Int>()
    private val cidrViolationsInWindow = ConcurrentHashMap<String, Int>()
    
    // Generic proxy error tracking (4xx/5xx from logs)
    private val proxyViolationsInWindow = ConcurrentHashMap<String, Int>()
    
    // Per-rule threshold tracking: key = "ruleId:ip", value = hit count
    private val ruleViolationsInWindow = ConcurrentHashMap<String, Int>()

    init {
        startUnjailWorker()
        startViolationCleanupWorker()
    }

    private fun startUnjailWorker() {
        unjailJob?.cancel()
        unjailJob = scope.launch {
            while (isActive) {
                try {
                    checkAndReleaseExpiredRules()
                } catch (e: Exception) {
                    logger.error("Error in JailManager unjail worker", e)
                }
                delay(TimeoutConstants.UNJAIL_WORKER_INTERVAL_MS) // Check every minute
            }
        }
    }

    private fun checkAndReleaseExpiredRules() {
        val now = System.currentTimeMillis()
        val expiredRules = firewallService.listRules().filter { rule ->
            rule.expiresAt?.let { it <= now } ?: false
        }

        if (expiredRules.isNotEmpty()) {
            logger.info("JailManager: Releasing ${expiredRules.size} expired jails")
            expiredRules.forEach { rule ->
                firewallService.unblockIP(rule.id)
            }
        }

        // Clean up expired CIDR rules
        val expiredCidr = firewallService.listCidrRules().filter { rule ->
            rule.expiresAt?.let { it <= now } ?: false
        }
        if (expiredCidr.isNotEmpty()) {
            logger.info("JailManager: Removing ${expiredCidr.size} expired CIDR rules")
            expiredCidr.forEach { rule ->
                firewallService.removeCidrRule(rule.id)
            }
        }
    }

    override fun listJails(): List<JailedIP> {
        val now = System.currentTimeMillis()
        return firewallService.listRules().filter { rule ->
            rule.expiresAt?.let { it > now } ?: false
        }.mapNotNull { rule -> // Removed mapNotNull + side-effect logic
            rule.expiresAt?.let { expiresAt ->
                JailedIP(
                    ip = rule.ip,
                    country = rule.country ?: "??",
                    city = rule.city,
                    isp = rule.isp,
                    lat = rule.lat,
                    lon = rule.lon,
                    asn = rule.asn,
                    reason = rule.comment ?: "Auto-jailed",
                    expiresAt = expiresAt,
                    createdAt = rule.createdAt
                )
            }
        }
    }

    override suspend fun jailIP(ip: String, durationMinutes: Int, reason: String): Boolean {
        if (firewallService.isIpWhitelisted(ip)) {
            logger.info("Skipping jail for whitelisted CIDR IP: $ip")
            return false
        }

        val settings = settingsProvider()
        
        // If Kafka is enabled, publish the request and let the consumer handle the actual jailing.
        // This effectively centralizes all blocking logic through Kafka.
        if (settings.kafkaSettings.enabled) {
            try {
                val request = com.umeshsolanki.ucpanel.kafka.IpBlockRequest(
                    ip = ip,
                    durationMinutes = durationMinutes,
                    reason = reason
                )
                val json = kotlinx.serialization.json.Json.encodeToString(com.umeshsolanki.ucpanel.kafka.IpBlockRequest.serializer(), request)
                kafkaService.publishMessage(settings.kafkaSettings, settings.kafkaSettings.topic, ip, json)
                logger.info("Published jail request for $ip to topic ${settings.kafkaSettings.topic}")
                return true
            } catch (e: Exception) {
                logger.error("Failed to publish jail request to Kafka, falling back to direct execution", e)
            }
        }
        
        // Fallback or if Kafka disabled
        return performJailExecution(ip, durationMinutes, reason)
    }

    override suspend fun performJailExecution(ip: String, durationMinutes: Int, reason: String): Boolean {
        val settings = settingsProvider()
        var finalDuration = durationMinutes

        if (settings.exponentialJailEnabled) {
            try {
                val reputation = ipReputationService.getIpReputation(ip)
                if (reputation != null && reputation.blockedTimes > 0) {
                    val lastBlocked = reputation.lastBlocked?.let {
                        try {
                            java.time.LocalDateTime.parse(it, java.time.format.DateTimeFormatter.ISO_DATE_TIME)
                        } catch (e: Exception) {
                            null
                        }
                    }

                    val weekAgo = java.time.LocalDateTime.now().minusDays(7)
                    if (lastBlocked != null && lastBlocked.isAfter(weekAgo)) {
                        // Exponential backoff: base_duration * (2 ^ exponentialBlockedTimes)
                        val multiplier = Math.pow(2.0, reputation.exponentialBlockedTimes.toDouble()).toLong()
                        finalDuration = (durationMinutes * multiplier).toInt()
                            .coerceAtMost(settings.maxJailDurationMinutes)
                        
                        logger.warn("Exponential jail for $ip: ${reputation.exponentialBlockedTimes} previous streaks. Multiplier: ${multiplier}x. Escalated duration: $finalDuration mins (base $durationMinutes)")
                    } else if (lastBlocked != null) {
                        logger.info("Last block for $ip was > 1 week ago (${reputation.lastBlocked}). Resetting exponential backoff strike count.")
                    }
                }
            } catch (e: Exception) {
                logger.error("Failed to calculate exponential jail duration for $ip", e)
            }
        }

        val expiresAt = System.currentTimeMillis() + (finalDuration * 60_000L)
        
        // Fast path: use reputation cache for geo data. Enrichment happens asynchronously.
        val cached = ipReputationService.getIpReputation(ip)

        return firewallService.blockIP(BlockIPRequest(
            ip = ip,
            comment = reason,
            expiresAt = expiresAt,
            country = cached?.country,
            city = cached?.city,
            isp = cached?.isp,
            lat = cached?.lat,
            lon = cached?.lon,
            timezone = cached?.timezone,
            zip = cached?.zip,
            region = cached?.region
        ))
    }

    override fun unjailIP(ip: String): Boolean {
        return firewallService.unblockIPByAddress(ip)
    }

    override fun getCountryCode(ip: String): String {
        return countryCache.getOrPut(ip) {
            // Synchronous fast-path: check in-memory reputation cache isn't available synchronously,
            // so we keep a small countryCache populated whenever we jail an IP.
            countryCache[ip] ?: "??"
        }
    }
    
    override fun isIPJailed(ip: String): Boolean {
        val now = System.currentTimeMillis()
        return firewallService.listRules().any { 
            it.ip == ip && it.expiresAt?.let { it > now } ?: false 
        }
    }
    
    override fun recordFailedLoginAttempt(ip: String) {
        if (ip.isBlank() || AppConfig.isLocalIP(ip)) return
        
        // Record activity in reputation service
        scope.launch {
            try {
                ipReputationService.recordActivity(ip)
            } catch(e: Exception) {
                logger.error("Failed to record activity", e)
            }
        }
        
        val settings = settingsProvider()
        if (!settings.jailEnabled) return
        
        // Check if already jailed
        if (isIPJailed(ip)) return
        
        // Increment failed attempts
        val count = failedAttemptsInWindow.merge(ip, 1, Int::plus) ?: 1
        
        // Check threshold
        if (count >= settings.jailThreshold) {
            val reason = "Failed login >= ${settings.jailThreshold} failed attempts"
            
            scope.launch {
                val success = jailIP(ip, settings.jailDurationMinutes, reason)
                if (success) {
                    failedAttemptsInWindow.remove(ip)
                    
                    // Send notification
                    try {
                        FcmService.sendNotification(
                            title = "Security Alert: IP Jailed",
                            body = "IP $ip has been jailed for ${settings.jailThreshold} failed attempts.",
                            data = mapOf("type" to "security", "ip" to ip, "action" to "jail")
                        )
                    } catch (e: Exception) {
                        logger.warn("Failed to send FCM notification", e)
                    }
                }
            }
        }
    }
    
    override fun recordInvalidApiAttempt(ip: String) {
        if (ip.isBlank() || AppConfig.isLocalIP(ip)) return
        
        // Record activity in reputation service
        scope.launch {
            try {
                ipReputationService.recordActivity(ip)
            } catch(e: Exception) {
                logger.error("Failed to record activity", e)
            }
        }
        
        val settings = settingsProvider()
        if (!settings.jailEnabled) return
        
        // Check if already jailed
        if (isIPJailed(ip)) return
        
        // Increment failed attempts (we re-use the same failedAttempts bucket for simplicity, or we could use another map if we want separate thresholds)
        val count = failedAttemptsInWindow.merge(ip, 1, Int::plus) ?: 1
        
        // Check threshold
        if (count >= settings.jailThreshold) {
            val reason = "Failed API access >= ${settings.jailThreshold} failed attempts"
            
            scope.launch {
                val success = jailIP(ip, settings.jailDurationMinutes, reason)
                if (success) {
                    failedAttemptsInWindow.remove(ip)
                    
                    // Send notification
                    try {
                        FcmService.sendNotification(
                            title = "Security Alert: IP Jailed",
                            body = "IP $ip has been jailed for ${settings.jailThreshold} failed API attempts.",
                            data = mapOf("type" to "security", "ip" to ip, "action" to "jail")
                        )
                    } catch (e: Exception) {
                        logger.warn("Failed to send FCM notification", e)
                    }
                }
            }
        }
    }

    override fun clearFailedAttempts(ip: String) {
        failedAttemptsInWindow.remove(ip)
    }
    
    
    // Cached Rules Optimization — O(1) map lookups for EXACT rules, regex fallback for REGEX rules
    private data class CachedRule(
        val rule: com.umeshsolanki.ucpanel.proxy.ProxyJailRule,
        val regex: Regex?
    )

    private data class TypedRuleCache(
        val exactMap: HashMap<String, CachedRule> = HashMap(),
        val regexList: MutableList<CachedRule> = mutableListOf(),
        val matchEmptyRules: MutableList<CachedRule> = mutableListOf()
    )

    @Volatile private var cachedRulesVersion: List<com.umeshsolanki.ucpanel.proxy.ProxyJailRule>? = null
    private var pathCache = TypedRuleCache()
    private var uaCache = TypedRuleCache()
    private var methodCache = TypedRuleCache()
    private var statusCache = TypedRuleCache()
    private var hostCache = TypedRuleCache()
    private var compositeRegexList: List<CachedRule> = emptyList()
    private var compositeExactMap: HashMap<String, CachedRule> = HashMap()

    private fun updateRuleCache(currentRules: List<com.umeshsolanki.ucpanel.proxy.ProxyJailRule>) {
        if (cachedRulesVersion === currentRules) return

        val newPath = TypedRuleCache()
        val newUa = TypedRuleCache()
        val newMethod = TypedRuleCache()
        val newStatus = TypedRuleCache()
        val newHost = TypedRuleCache()
        val newCompositeRegex = mutableListOf<CachedRule>()
        val newCompositeExact = HashMap<String, CachedRule>()

        val filteredRules = currentRules.filter { it.target == ProxyJailRuleTarget.INTERNAL || it.target == ProxyJailRuleTarget.BOTH }

        for (rule in filteredRules) {
            val isExact = rule.matchMode == ProxyJailMatchMode.EXACT

            when (rule.type) {
                ProxyJailRuleType.USER_AGENT -> {
                    if (rule.matchEmpty) newUa.matchEmptyRules.add(CachedRule(rule, null))
                    if (isExact) {
                        newUa.exactMap[rule.pattern.lowercase()] = CachedRule(rule, null)
                    } else {
                        newUa.regexList.add(CachedRule(rule, rule.pattern.toRegex(RegexOption.IGNORE_CASE)))
                    }
                }
                ProxyJailRuleType.PATH -> {
                    if (isExact) {
                        newPath.exactMap[rule.pattern.lowercase()] = CachedRule(rule, null)
                    } else {
                        newPath.regexList.add(CachedRule(rule, rule.pattern.toRegex(RegexOption.IGNORE_CASE)))
                    }
                }
                ProxyJailRuleType.METHOD -> {
                    newMethod.exactMap[rule.pattern.uppercase()] = CachedRule(rule, null)
                }
                ProxyJailRuleType.STATUS_CODE -> {
                    if (isExact || rule.pattern.all { it.isDigit() }) {
                        newStatus.exactMap[rule.pattern] = CachedRule(rule, null)
                    } else {
                        newStatus.regexList.add(CachedRule(rule, rule.pattern.toRegex()))
                    }
                }
                ProxyJailRuleType.COMPOSITE -> {
                    if (isExact) {
                        val statusKey = rule.statusCodePattern ?: "*"
                        val compositeKey = "${rule.pattern.lowercase()}|${statusKey}"
                        newCompositeExact[compositeKey] = CachedRule(rule, null)
                    } else {
                        newCompositeRegex.add(CachedRule(rule, rule.pattern.toRegex(RegexOption.IGNORE_CASE)))
                    }
                }
                ProxyJailRuleType.HOST_HEADER -> {
                    if (rule.matchEmpty) newHost.matchEmptyRules.add(CachedRule(rule, null))
                    if (isExact) {
                        newHost.exactMap[rule.pattern.lowercase()] = CachedRule(rule, null)
                    } else {
                        newHost.regexList.add(CachedRule(rule, rule.pattern.toRegex(RegexOption.IGNORE_CASE)))
                    }
                }
            }
        }

        pathCache = newPath
        uaCache = newUa
        methodCache = newMethod
        statusCache = newStatus
        hostCache = newHost
        compositeRegexList = newCompositeRegex
        compositeExactMap = newCompositeExact
        cachedRulesVersion = currentRules

        val totalExact = newPath.exactMap.size + newUa.exactMap.size + newMethod.exactMap.size + newStatus.exactMap.size + newHost.exactMap.size + newCompositeExact.size
        val totalRegex = newPath.regexList.size + newUa.regexList.size + newStatus.regexList.size + newHost.regexList.size + newCompositeRegex.size
        logger.debug("Rule cache updated: $totalExact exact (O(1)), $totalRegex regex (fallback)")
    }

    private fun startViolationCleanupWorker() {
        scope.launch {
            while (isActive) {
                try {
                    val windowMinutes = settingsProvider().proxyJailWindowMinutes
                    val interval = windowMinutes * 60_000L
                    
                    delay(interval)
                    
                    proxyViolationsInWindow.clear()
                    failedAttemptsInWindow.clear()
                    dangerViolationsInWindow.clear()
                    burstViolationsInWindow.clear()
                    cidrViolationsInWindow.clear()
                    ruleViolationsInWindow.clear()
                    
                    logger.debug("Cleared all violation records (window reset: ${windowMinutes}m)")
                } catch (e: Exception) {
                    logger.error("Error in ViolationCleanup worker", e)
                    delay(60_000)
                }
            }
        }
    }

    private fun checkRuleThreshold(rule: com.umeshsolanki.ucpanel.proxy.ProxyJailRule, ip: String): Boolean {
        if (rule.threshold <= 1) return true
        val key = "${rule.id}:$ip"
        val count = ruleViolationsInWindow.merge(key, 1, Int::plus) ?: 1
        if (count >= rule.threshold) {
            ruleViolationsInWindow.remove(key)
            return true
        }
        return false
    }

    override fun checkProxySecurityViolation(ip: String, userAgent: String, method: String, path: String, status: Int, errorCount: Long, hostHeader: String) {
        if (ip.isBlank() || AppConfig.isLocalIP(ip)) return

        // Skip IPs in whitelisted CIDR ranges
        if (firewallService.isIpWhitelisted(ip)) {
            logger.debug("Skipping proxy jail check for whitelisted CIDR IP: $ip")
            return
        }

        // Allow IPs from trusted CIDR ranges (e.g. GitHub webhooks, Actions, API)
        IpLookupService.lookup(ip)?.provider?.let { provider ->
            if (provider.equals("GitHub", ignoreCase = true)) {
                logger.debug("Skipping proxy jail check for IP in GitHub range: $ip")
                return
            }
        }
        
        // Record activity in reputation service
        scope.launch {
            try {
                ipReputationService.recordActivity(ip)
            } catch(e: Exception) {
                logger.error("Failed to record activity", e)
            }
        }
        
        val secSettings = settingsProvider()
        if (!secSettings.proxyJailEnabled) return
        
        // Ignore common assets for 404 jailing noise reduction
        if (status == 404) {
            val ignorePatterns = secSettings.proxyJailIgnore404Patterns
            val lowerPath = path.lowercase()
            
            val isIgnorable = ignorePatterns.any { pattern ->
                val lowerPattern = pattern.lowercase()
                when {
                    lowerPattern.startsWith("/") -> lowerPath.startsWith(lowerPattern)
                    lowerPattern.endsWith("/") -> lowerPath.contains(lowerPattern)
                    lowerPattern.startsWith(".") -> lowerPath.endsWith(lowerPattern)
                    else -> lowerPath.endsWith("/$lowerPattern") || lowerPath == lowerPattern
                }
            }
                             
            if (isIgnorable) {
                logger.debug("Ignoring 404 for configured ignorable asset: $path")
                return
            }
        }

        // Check if already jailed
        if (isIPJailed(ip)) return
        
        // Update cache if needed
        updateRuleCache(secSettings.proxyJailRules)
        
        var shouldJail = false
        var reason = ""
        
        // specialized MIRROR violation tracking
        if (!shouldJail) {
            when (status) {
                403 -> { // Danger
                    val count = dangerViolationsInWindow.merge(ip, 1, Int::plus) ?: 1
                    if (count >= secSettings.proxyJailThresholdDanger) {
                        shouldJail = true
                        reason = "Danger/Path violations ($count)"
                        dangerViolationsInWindow.remove(ip)
                    }
                }
                429 -> { // Burst
                    val count = burstViolationsInWindow.merge(ip, 1, Int::plus) ?: 1
                    if (count >= secSettings.proxyJailThresholdBurst) {
                        shouldJail = true
                        reason = "Rate Limit violations ($count)"
                        burstViolationsInWindow.remove(ip)
                    }
                }
                444 -> { // CIDR
                    val count = cidrViolationsInWindow.merge(ip, 1, Int::plus) ?: 1
                    if (count >= secSettings.proxyJailThresholdCidr) {
                        shouldJail = true
                        reason = "Blocked CIDR violations ($count)"
                        cidrViolationsInWindow.remove(ip)
                    }
                }
            }
        }

        val lowerPath = path.lowercase()
        val lowerUa = userAgent.lowercase()
        val lowerHost = hostHeader.lowercase()
        val upperMethod = method.uppercase()
        val statusStr = status.toString()

        // 1. Check Composite Rules (PATH + STATUS) — exact map O(1) then regex fallback
        if (!shouldJail) {
            val compositeKey = "$lowerPath|${statusStr}"
            val exactHit = compositeExactMap[compositeKey]
            if (exactHit != null && checkRuleThreshold(exactHit.rule, ip)) {
                shouldJail = true
                reason = "Matched COMPOSITE rule: ${exactHit.rule.description ?: exactHit.rule.pattern}"
            }
            if (!shouldJail) {
                for (cached in compositeRegexList) {
                    val pathMatches = cached.regex?.containsMatchIn(path) == true
                    val statusMatches = cached.rule.statusCodePattern?.let {
                        it.toRegex().containsMatchIn(statusStr)
                    } ?: true
                    if (pathMatches && statusMatches) {
                        if (checkRuleThreshold(cached.rule, ip)) {
                            shouldJail = true
                            reason = "Matched COMPOSITE rule: ${cached.rule.description ?: cached.rule.pattern}"
                        }
                        break
                    }
                }
            }
        }

        // 2. Check Path Rules — exact map O(1) then regex fallback
        if (!shouldJail) {
            val exactHit = pathCache.exactMap[lowerPath]
            if (exactHit != null && checkRuleThreshold(exactHit.rule, ip)) {
                shouldJail = true
                reason = "Matched PATH rule: ${exactHit.rule.description ?: exactHit.rule.pattern}"
            }
            if (!shouldJail) {
                for (cached in pathCache.regexList) {
                    if (cached.regex?.containsMatchIn(path) == true) {
                        if (checkRuleThreshold(cached.rule, ip)) {
                            shouldJail = true
                            reason = "Matched PATH rule: ${cached.rule.description ?: cached.rule.pattern}"
                        }
                        break
                    }
                }
            }
        }

        // 3. Check User Agent Rules — matchEmpty first, then exact map O(1), then regex fallback
        if (!shouldJail) {
            if (userAgent.isBlank()) {
                for (cached in uaCache.matchEmptyRules) {
                    if (checkRuleThreshold(cached.rule, ip)) {
                        shouldJail = true
                        reason = "Matched UA rule: ${cached.rule.description ?: cached.rule.pattern}"
                        break
                    }
                }
            }
            if (!shouldJail && userAgent.isNotBlank()) {
                val exactHit = uaCache.exactMap[lowerUa]
                if (exactHit != null && checkRuleThreshold(exactHit.rule, ip)) {
                    shouldJail = true
                    reason = "Matched UA rule: ${exactHit.rule.description ?: exactHit.rule.pattern}"
                }
                if (!shouldJail) {
                    for (cached in uaCache.regexList) {
                        if (cached.regex?.containsMatchIn(userAgent) == true) {
                            if (checkRuleThreshold(cached.rule, ip)) {
                                shouldJail = true
                                reason = "Matched UA rule: ${cached.rule.description ?: cached.rule.pattern}"
                            }
                            break
                        }
                    }
                }
            }
        }

        // 4. Check Method Rules — map O(1) (always exact match)
        if (!shouldJail) {
            val exactHit = methodCache.exactMap[upperMethod]
            if (exactHit != null && checkRuleThreshold(exactHit.rule, ip)) {
                shouldJail = true
                reason = "Matched METHOD rule: ${exactHit.rule.description ?: exactHit.rule.pattern}"
            }
        }

        // 5. Check Status Rules — exact map O(1) then regex fallback
        if (!shouldJail) {
            val exactHit = statusCache.exactMap[statusStr]
            if (exactHit != null && checkRuleThreshold(exactHit.rule, ip)) {
                shouldJail = true
                reason = "Matched STATUS rule: ${exactHit.rule.description ?: exactHit.rule.pattern}"
            }
            if (!shouldJail) {
                for (cached in statusCache.regexList) {
                    if (cached.regex?.containsMatchIn(statusStr) == true) {
                        if (checkRuleThreshold(cached.rule, ip)) {
                            shouldJail = true
                            reason = "Matched STATUS rule: ${cached.rule.description ?: cached.rule.pattern}"
                        }
                        break
                    }
                }
            }
        }

        // 6. Check Host Header Rules — matchEmpty first, then exact map O(1), then regex fallback
        if (!shouldJail) {
            if (hostHeader.isBlank()) {
                for (cached in hostCache.matchEmptyRules) {
                    if (checkRuleThreshold(cached.rule, ip)) {
                        shouldJail = true
                        reason = "Matched HOST_HEADER rule: ${cached.rule.description ?: cached.rule.pattern}"
                        break
                    }
                }
            }
            if (!shouldJail && hostHeader.isNotBlank()) {
                val exactHit = hostCache.exactMap[lowerHost]
                if (exactHit != null && checkRuleThreshold(exactHit.rule, ip)) {
                    shouldJail = true
                    reason = "Matched HOST_HEADER rule: ${exactHit.rule.description ?: exactHit.rule.pattern}"
                }
                if (!shouldJail) {
                    for (cached in hostCache.regexList) {
                        if (cached.regex?.containsMatchIn(hostHeader) == true) {
                            if (checkRuleThreshold(cached.rule, ip)) {
                                shouldJail = true
                                reason = "Matched HOST_HEADER rule: ${cached.rule.description ?: cached.rule.pattern}"
                            }
                            break
                        }
                    }
                }
            }
        }
        
        // Threshold check (Windowed)
        if (!shouldJail) {
            // Only count Client Errors (4xx) as violations.
            // Ignore Server Errors (5xx) as they are likely app issues.
            // Ignore Nginx special codes: 444 (No Response/Blocked), 499 (Client Closed Request)
            if (status in 400..499 && status != 444 && status != 499) {
                
                // Weighted Scoring
                var weight = 1
                
                // Auth/Forbidden failures are more suspicious than 404s
                if (status == 401 || status == 403 || status == 405) {
                    weight = 5
                }
                
                val currentViolations = proxyViolationsInWindow.merge(ip, weight, Int::plus) ?: weight
                
                if (currentViolations >= secSettings.proxyJailThresholdNon200) {
                    shouldJail = true
                    reason = "Too many client errors ($currentViolations points in window)"
                    // Reset counter after jailing
                    proxyViolationsInWindow.remove(ip)
                }
            }
        }
        
        if (shouldJail) {
            logger.warn("Jailing IP $ip for proxy violation: $reason")
            val duration = settingsProvider().jailDurationMinutes
            
            scope.launch {
                val success = jailIP(ip, duration, "Proxy: $reason")
                if (success) {
                    try {
                        FcmService.sendNotification(
                            title = "Security Alert: IP Jailed (Proxy)",
                            body = "IP $ip jailed. Reason: $reason",
                            data = mapOf("type" to "security", "ip" to ip, "action" to "jail", "reason" to reason)
                        )
                    } catch (e: Exception) {
                        logger.warn("Failed to send FCM notification", e)
                    }
                }
            }
        }
    }
}

// Service object for easy access
object JailManagerService {
    private val service: IJailManagerService get() = ServiceContainer.jailManagerService
    
    fun listJails() = service.listJails()
    suspend fun jailIP(ip: String, durationMinutes: Int, reason: String) = service.jailIP(ip, durationMinutes, reason)
    fun unjailIP(ip: String) = service.unjailIP(ip)
    fun getCountryCode(ip: String) = service.getCountryCode(ip)
    fun isIPJailed(ip: String) = service.isIPJailed(ip)
    fun recordFailedLoginAttempt(ip: String) = service.recordFailedLoginAttempt(ip)
    fun recordInvalidApiAttempt(ip: String) = service.recordInvalidApiAttempt(ip)
    fun clearFailedAttempts(ip: String) = service.clearFailedAttempts(ip)
    fun checkProxySecurityViolation(ip: String, userAgent: String, method: String, path: String, status: Int, errorCount: Long, hostHeader: String = "") = 
        service.checkProxySecurityViolation(ip, userAgent, method, path, status, errorCount, hostHeader)
        
    // Access to underlying IP DB
    // fun getIpInfo(ip: String) = (service as JailManagerServiceImpl).ipInfoService.getIpInfo(ip) // Accessor if needed
}
