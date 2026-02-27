package com.umeshsolanki.dockermanager.jail

import com.umeshsolanki.dockermanager.*
import com.umeshsolanki.dockermanager.ServiceContainer
import com.umeshsolanki.dockermanager.system.IpLookupService
import com.umeshsolanki.dockermanager.constants.TimeoutConstants
import com.umeshsolanki.dockermanager.firewall.IFirewallService
import com.umeshsolanki.dockermanager.firewall.BlockIPRequest
import com.umeshsolanki.dockermanager.proxy.ProxyJailRuleType
import com.umeshsolanki.dockermanager.fcm.FcmService
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
    private val ipReputationService: com.umeshsolanki.dockermanager.ip.IIpReputationService,
    private val kafkaService: com.umeshsolanki.dockermanager.kafka.IKafkaService,
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
                val request = com.umeshsolanki.dockermanager.kafka.IpBlockRequest(
                    ip = ip,
                    durationMinutes = durationMinutes,
                    reason = reason
                )
                val json = kotlinx.serialization.json.Json.encodeToString(com.umeshsolanki.dockermanager.kafka.IpBlockRequest.serializer(), request)
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
    
    
    // Cached Rules Optimization
    private data class CachedRule(
        val rule: com.umeshsolanki.dockermanager.proxy.ProxyJailRule,
        val regex: Regex?
    )
    
    private var cachedRulesVersion: List<com.umeshsolanki.dockermanager.proxy.ProxyJailRule>? = null
    private var cachedUserAgentRules: List<CachedRule> = emptyList()
    private var cachedPathRules: List<CachedRule> = emptyList()
    private var cachedMethodRules: List<CachedRule> = emptyList()
    private var cachedStatusRules: List<CachedRule> = emptyList()
    private var cachedCompositeRules: List<CachedRule> = emptyList()
    private var cachedHostHeaderRules: List<CachedRule> = emptyList()

    private fun updateRuleCache(currentRules: List<com.umeshsolanki.dockermanager.proxy.ProxyJailRule>) {
        if (cachedRulesVersion === currentRules) return // Same object, no update needed
        
        // Rebuild cache
        val uaRules = mutableListOf<CachedRule>()
        val pathRules = mutableListOf<CachedRule>()
        val methodRules = mutableListOf<CachedRule>()
        val statusRules = mutableListOf<CachedRule>()
        val compositeRules = mutableListOf<CachedRule>()
        val hostHeaderRules = mutableListOf<CachedRule>()
        
        for (rule in currentRules) {
            when (rule.type) {
                ProxyJailRuleType.USER_AGENT -> uaRules.add(CachedRule(rule, rule.pattern.toRegex(RegexOption.IGNORE_CASE)))
                ProxyJailRuleType.PATH -> pathRules.add(CachedRule(rule, rule.pattern.toRegex(RegexOption.IGNORE_CASE)))
                ProxyJailRuleType.METHOD -> methodRules.add(CachedRule(rule, null)) // Method is exact match
                ProxyJailRuleType.STATUS_CODE -> statusRules.add(CachedRule(rule, null)) // Status is exact match
                ProxyJailRuleType.COMPOSITE -> compositeRules.add(CachedRule(rule, rule.pattern.toRegex(RegexOption.IGNORE_CASE)))
                ProxyJailRuleType.HOST_HEADER -> hostHeaderRules.add(CachedRule(rule, rule.pattern.toRegex(RegexOption.IGNORE_CASE)))
            }
        }
        
        cachedUserAgentRules = uaRules
        cachedPathRules = pathRules
        cachedMethodRules = methodRules
        cachedStatusRules = statusRules
        cachedCompositeRules = compositeRules
        cachedHostHeaderRules = hostHeaderRules
        cachedRulesVersion = currentRules
        logger.debug("Proxy Jail Rules cache updated. UA: ${uaRules.size}, Path: ${pathRules.size}, Composite: ${compositeRules.size}, Host: ${hostHeaderRules.size}")
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

    private fun checkRuleThreshold(rule: com.umeshsolanki.dockermanager.proxy.ProxyJailRule, ip: String): Boolean {
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

        // 1. Check Composite Rules (PATH + STATUS) - Most specific, check first
        if (!shouldJail) {
            for (cached in cachedCompositeRules) {
                val pathMatches = cached.regex?.containsMatchIn(path) == true
                val statusMatches = cached.rule.statusCodePattern?.let {
                    it.toRegex().containsMatchIn(status.toString())
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

        // 2. Check Path Rules (Common violations)
        if (!shouldJail) {
            for (cached in cachedPathRules) {
                if (cached.regex?.containsMatchIn(path) == true) {
                    if (checkRuleThreshold(cached.rule, ip)) {
                        shouldJail = true
                        reason = "Matched PATH rule: ${cached.rule.description ?: cached.rule.pattern}"
                    }
                    break
                }
            }
        }

        // 3. Check User Agent Rules
        if (!shouldJail) {
            for (cached in cachedUserAgentRules) {
                val matches = (userAgent.isBlank() && cached.rule.matchEmpty) || cached.regex?.containsMatchIn(userAgent) == true
                if (matches) {
                    if (checkRuleThreshold(cached.rule, ip)) {
                        shouldJail = true
                        reason = "Matched UA rule: ${cached.rule.description ?: cached.rule.pattern}"
                    }
                    break
                }
            }
        }
        
        // 4. Check Method Rules
        if (!shouldJail) {
            for (cached in cachedMethodRules) {
                if (cached.rule.pattern.equals(method, ignoreCase = true)) {
                    if (checkRuleThreshold(cached.rule, ip)) {
                        shouldJail = true
                        reason = "Matched METHOD rule: ${cached.rule.description ?: cached.rule.pattern}"
                    }
                    break
                }
            }
        }
        
        // 5. Check Status Rules (support regex patterns like "5\\d\\d")
        if (!shouldJail) {
            val statusStr = status.toString()
            for (cached in cachedStatusRules) {
                val matches = cached.regex?.containsMatchIn(statusStr) == true
                    || cached.rule.pattern == statusStr
                if (matches) {
                    if (checkRuleThreshold(cached.rule, ip)) {
                        shouldJail = true
                        reason = "Matched STATUS rule: ${cached.rule.description ?: cached.rule.pattern}"
                    }
                    break
                }
            }
        }
        
        // 6. Check Host Header Rules
        if (!shouldJail) {
            for (cached in cachedHostHeaderRules) {
                val matches = (hostHeader.isBlank() && cached.rule.matchEmpty) || (hostHeader.isNotBlank() && cached.regex?.containsMatchIn(hostHeader) == true)
                if (matches) {
                    if (checkRuleThreshold(cached.rule, ip)) {
                        shouldJail = true
                        reason = "Matched HOST_HEADER rule: ${cached.rule.description ?: cached.rule.pattern}"
                    }
                    break
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
