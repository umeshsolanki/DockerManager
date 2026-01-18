package com.umeshsolanki.dockermanager.jail

import com.umeshsolanki.dockermanager.*
import com.umeshsolanki.dockermanager.ServiceContainer
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
    fun jailIP(ip: String, durationMinutes: Int, reason: String): Boolean
    fun unjailIP(ip: String): Boolean
    fun getCountryCode(ip: String): String
    fun isIPJailed(ip: String): Boolean
    
    // Failed login attempt tracking
    fun recordFailedLoginAttempt(ip: String)
    fun clearFailedAttempts(ip: String)
    
    // Proxy security violation checking
    fun checkProxySecurityViolation(ip: String, userAgent: String, method: String, path: String, status: Int, errorCount: Long)
}

class JailManagerServiceImpl(
    private val firewallService: IFirewallService
) : IJailManagerService {
    private val logger = LoggerFactory.getLogger(JailManagerServiceImpl::class.java)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var unjailJob: Job? = null
    private val countryCache = ConcurrentHashMap<String, String>()
    
    // Failed login attempt tracking (for BtmpService)
    private val failedAttemptsInWindow = ConcurrentHashMap<String, Int>()

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
    }

    override fun listJails(): List<JailedIP> {
        val now = System.currentTimeMillis()
        return firewallService.listRules().filter { rule ->
            rule.expiresAt?.let { it > now } ?: false
        }.mapNotNull { rule ->
            rule.expiresAt?.let { expiresAt ->
                JailedIP(
                    ip = rule.ip,
                    country = rule.country ?: getCountryCode(rule.ip),
                    reason = rule.comment ?: "Auto-jailed",
                    expiresAt = expiresAt,
                    createdAt = rule.createdAt
                )
            }
        }
    }

    override fun jailIP(ip: String, durationMinutes: Int, reason: String): Boolean {
        val expiresAt = System.currentTimeMillis() + (durationMinutes * 60_000L)
        val country = getCountryCode(ip)
        return firewallService.blockIP(BlockIPRequest(
            ip = ip,
            comment = reason,
            expiresAt = expiresAt,
            country = country
        ))
    }

    override fun unjailIP(ip: String): Boolean {
        return firewallService.unblockIPByAddress(ip)
    }

    override fun getCountryCode(ip: String): String {
        if (AppConfig.isLocalIP(ip)) return "LOC"
        
        return countryCache.computeIfAbsent(ip) { _ ->
            try {
                val url = java.net.URI("http://ip-api.com/json/$ip?fields=countryCode").toURL()
                val jsonBody = url.readText()
                val match = "\"countryCode\":\"([^\"]+)\"".toRegex().find(jsonBody)
                match?.groupValues?.get(1) ?: "??"
            } catch (e: Exception) {
                logger.debug("Failed to fetch country code for $ip: ${e.message}")
                "??"
            }
        }
    }
    
    override fun isIPJailed(ip: String): Boolean {
        val now = System.currentTimeMillis()
        return listJails().any { it.ip == ip && it.expiresAt > now }
    }
    
    override fun recordFailedLoginAttempt(ip: String) {
        if (ip.isBlank() || AppConfig.isLocalIP(ip)) return
        
        val settings = AppConfig.jailSettings
        if (!settings.jailEnabled) return
        
        // Check if already jailed
        if (isIPJailed(ip)) return
        
        // Increment failed attempts
        val count = failedAttemptsInWindow.merge(ip, 1, Int::plus) ?: 1
        
        // Check threshold
        if (count >= settings.jailThreshold) {
            val reason = "Failed login >= ${settings.jailThreshold} failed attempts"
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
    
    override fun clearFailedAttempts(ip: String) {
        failedAttemptsInWindow.remove(ip)
    }
    
    // Proxy security violation checking
    private val proxyViolationsInWindow = ConcurrentHashMap<String, Int>()
    
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

    private fun updateRuleCache(currentRules: List<com.umeshsolanki.dockermanager.proxy.ProxyJailRule>) {
        if (cachedRulesVersion === currentRules) return // Same object, no update needed
        
        // Rebuild cache
        val uaRules = mutableListOf<CachedRule>()
        val pathRules = mutableListOf<CachedRule>()
        val methodRules = mutableListOf<CachedRule>()
        val statusRules = mutableListOf<CachedRule>()
        
        for (rule in currentRules) {
            when (rule.type) {
                ProxyJailRuleType.USER_AGENT -> uaRules.add(CachedRule(rule, rule.pattern.toRegex(RegexOption.IGNORE_CASE)))
                ProxyJailRuleType.PATH -> pathRules.add(CachedRule(rule, rule.pattern.toRegex(RegexOption.IGNORE_CASE)))
                ProxyJailRuleType.METHOD -> methodRules.add(CachedRule(rule, null)) // Method is exact match
                ProxyJailRuleType.STATUS_CODE -> statusRules.add(CachedRule(rule, null)) // Status is exact match
            }
        }
        
        cachedUserAgentRules = uaRules
        cachedPathRules = pathRules
        cachedMethodRules = methodRules
        cachedStatusRules = statusRules
        cachedRulesVersion = currentRules
        logger.debug("Proxy Jail Rules cache updated. UA: ${uaRules.size}, Path: ${pathRules.size}")
    }

    private fun startViolationCleanupWorker() {
        scope.launch {
            while (isActive) {
                try {
                    // Reset violation counts every monitoring interval (default 5 mins)
                    // This implements a simple "errors per interval" rate limit.
                    // A proper sliding window is more complex but this should suffice to prevent
                    // long-term accumulation of errors.
                    val interval = AppConfig.jailSettings.monitoringIntervalMinutes * 60_000L
                    delay(interval)
                    if (proxyViolationsInWindow.isNotEmpty()) {
                        logger.debug("Clearing ${proxyViolationsInWindow.size} proxy violation records (window reset)")
                        proxyViolationsInWindow.clear()
                    }
                } catch (e: Exception) {
                    logger.error("Error in ViolationCleanup worker", e)
                    delay(60_000)
                }
            }
        }
    }

    override fun checkProxySecurityViolation(ip: String, userAgent: String, method: String, path: String, status: Int, errorCount: Long) {
        if (ip.isBlank() || AppConfig.isLocalIP(ip)) return
        
        val secSettings = AppConfig.proxySecuritySettings
        if (!secSettings.proxyJailEnabled) return
        
        // Check if already jailed
        if (isIPJailed(ip)) return
        
        // Update cache if needed
        updateRuleCache(secSettings.proxyJailRules)
        
        var shouldJail = false
        var reason = ""
        
        // 1. Check Path Rules (Most common violation)
        if (!shouldJail) {
            for (cached in cachedPathRules) {
                if (cached.regex?.containsMatchIn(path) == true) {
                    shouldJail = true
                    reason = "Matched PATH rule: ${cached.rule.description ?: cached.rule.pattern}"
                    break
                }
            }
        }

        // 2. Check User Agent Rules
        if (!shouldJail) {
             for (cached in cachedUserAgentRules) {
                if (cached.regex?.containsMatchIn(userAgent) == true) {
                    shouldJail = true
                    reason = "Matched UA rule: ${cached.rule.description ?: cached.rule.pattern}"
                    break
                }
            }
        }
        
        // 3. Check Method Rules
        if (!shouldJail) {
             for (cached in cachedMethodRules) {
                if (cached.rule.pattern.equals(method, ignoreCase = true)) {
                    shouldJail = true
                    reason = "Matched METHOD rule: ${cached.rule.description ?: cached.rule.pattern}"
                    break
                }
            }
        }
        
        // 4. Check Status Rules
        if (!shouldJail) {
             for (cached in cachedStatusRules) {
                if (cached.rule.pattern == status.toString()) {
                    shouldJail = true
                    reason = "Matched STATUS rule: ${cached.rule.description ?: cached.rule.pattern}"
                    break
                }
            }
        }
        
        // Threshold check (Windowed)
        if (!shouldJail) {
            // Only count non-200, non-300 status codes as errors
            if (status >= 400 || status == 0) {
                val currentViolations = proxyViolationsInWindow.merge(ip, 1, Int::plus) ?: 1
                if (currentViolations >= secSettings.proxyJailThresholdNon200) {
                    shouldJail = true
                    reason = "Too many non-200 responses ($currentViolations in window)"
                    // Reset counter after jailing
                    proxyViolationsInWindow.remove(ip)
                }
            }
        }
        
        if (shouldJail) {
            logger.warn("Jailing IP $ip for proxy violation: $reason")
            val duration = AppConfig.jailSettings.jailDurationMinutes
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

// Service object for easy access
object JailManagerService {
    private val service: IJailManagerService get() = ServiceContainer.jailManagerService
    
    fun listJails() = service.listJails()
    fun jailIP(ip: String, durationMinutes: Int, reason: String) = service.jailIP(ip, durationMinutes, reason)
    fun unjailIP(ip: String) = service.unjailIP(ip)
    fun getCountryCode(ip: String) = service.getCountryCode(ip)
    fun isIPJailed(ip: String) = service.isIPJailed(ip)
    fun recordFailedLoginAttempt(ip: String) = service.recordFailedLoginAttempt(ip)
    fun clearFailedAttempts(ip: String) = service.clearFailedAttempts(ip)
    fun checkProxySecurityViolation(ip: String, userAgent: String, method: String, path: String, status: Int, errorCount: Long) = 
        service.checkProxySecurityViolation(ip, userAgent, method, path, status, errorCount)
}

