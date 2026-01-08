package com.umeshsolanki.dockermanager.jail

import com.umeshsolanki.dockermanager.*
import com.umeshsolanki.dockermanager.firewall.IFirewallService
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
                delay(60000) // Check every minute
            }
        }
    }

    private fun checkAndReleaseExpiredRules() {
        val now = System.currentTimeMillis()
        val expiredRules = firewallService.listRules().filter { 
            it.expiresAt != null && it.expiresAt!! <= now 
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
        return firewallService.listRules().filter { 
            it.expiresAt != null && it.expiresAt!! > now 
        }.map { rule ->
            JailedIP(
                ip = rule.ip,
                country = rule.country ?: getCountryCode(rule.ip),
                reason = rule.comment ?: "Auto-jailed",
                expiresAt = rule.expiresAt!!,
                createdAt = rule.createdAt
            )
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
                val jsonBody = java.net.URL("http://ip-api.com/json/$ip?fields=countryCode").readText()
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
    
    override fun checkProxySecurityViolation(ip: String, userAgent: String, method: String, path: String, status: Int, errorCount: Long) {
        if (ip.isBlank() || AppConfig.isLocalIP(ip)) return
        
        val secSettings = AppConfig.proxySecuritySettings
        if (!secSettings.proxyJailEnabled) return
        
        // Check if already jailed
        if (isIPJailed(ip)) return
        
        var shouldJail = false
        var reason = ""
        
        // Rule check
        for (rule in secSettings.proxyJailRules) {
            val match = when (rule.type) {
                ProxyJailRuleType.USER_AGENT -> rule.pattern.toRegex().containsMatchIn(userAgent)
                ProxyJailRuleType.METHOD -> rule.pattern.equals(method, ignoreCase = true)
                ProxyJailRuleType.PATH -> rule.pattern.toRegex().containsMatchIn(path)
                ProxyJailRuleType.STATUS_CODE -> rule.pattern == status.toString()
            }
            if (match) {
                shouldJail = true
                reason = "Matched rule: ${rule.description ?: rule.pattern}"
                break
            }
        }
        
        // Threshold check
        if (!shouldJail) {
            if (errorCount >= secSettings.proxyJailThresholdNon200) {
                shouldJail = true
                reason = "Too many non-200 responses ($errorCount)"
            }
        }
        
        if (shouldJail) {
            logger.warn("Jailing IP $ip for proxy violation: $reason")
            val duration = AppConfig.jailSettings.jailDurationMinutes
            jailIP(ip, duration, "Proxy: $reason")
        }
    }
}

