package com.umeshsolanki.dockermanager.jail

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.ServiceContainer
import com.umeshsolanki.dockermanager.constants.TimeoutConstants
import com.umeshsolanki.dockermanager.fcm.FcmService
import com.umeshsolanki.dockermanager.firewall.BlockIPRequest
import com.umeshsolanki.dockermanager.firewall.IFirewallService
import com.umeshsolanki.dockermanager.proxy.ProxyJailRuleType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
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
    fun checkProxySecurityViolation(
        ip: String,
        userAgent: String,
        method: String,
        path: String,
        status: Int,
        errorCount: Long,
        referer: String? = null,
        domain: String? = null,
    )
}

class JailManagerServiceImpl(
    private val firewallService: IFirewallService,
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
        return firewallService.blockIP(
            BlockIPRequest(
                ip = ip, comment = reason, expiresAt = expiresAt, country = country
            )
        )
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

    override fun checkProxySecurityViolation(
        ip: String,
        userAgent: String,
        method: String,
        path: String,
        status: Int,
        errorCount: Long,
        referer: String?,
        domain: String?,
    ) {
        if (ip.isBlank() || AppConfig.isLocalIP(ip)) return

        val secSettings = AppConfig.proxySecuritySettings
        if (!secSettings.proxyJailEnabled) return

        // Check if already jailed
        if (isIPJailed(ip)) return

        // Use new rule chain system first
        val ruleMatches = com.umeshsolanki.dockermanager.proxy.RuleEvaluationService.evaluateRules(
            ip = ip,
            userAgent = userAgent,
            method = method,
            path = path,
            status = status,
            referer = referer,
            domain = domain
        )

        // Process rule matches
        for (match in ruleMatches) {
            val chain = match.chain
            val reason =
                "Matched rule chain: ${chain.name} (${match.matchedConditions.joinToString(", ") { it.description ?: it.pattern }})"

            when (chain.action) {
                com.umeshsolanki.dockermanager.proxy.RuleAction.JAIL -> {
                    val duration = chain.actionConfig?.jailDurationMinutes
                        ?: AppConfig.jailSettings.jailDurationMinutes
                    logger.warn("Jailing IP $ip for proxy violation: $reason")
                    jailIP(ip, duration, "Proxy: $reason")
                }

                com.umeshsolanki.dockermanager.proxy.RuleAction.LOG_ONLY -> {
                    logger.warn("Rule matched (log only) for IP $ip: $reason")
                }

                com.umeshsolanki.dockermanager.proxy.RuleAction.NGINX_BLOCK,
                com.umeshsolanki.dockermanager.proxy.RuleAction.NGINX_DENY,
                    -> {
                    // Nginx blocking is handled at config generation time
                    logger.warn("Rule matched (nginx block) for IP $ip: $reason - nginx config will be regenerated")
                }
            }
        }

        // Fallback to legacy rules if no rule chains matched
        if (ruleMatches.isEmpty()) {
            var shouldJail = false
            var reason = ""

            // Legacy rule check
            for (rule in secSettings.proxyJailRules) {
                val match = when (rule.type) {
                    ProxyJailRuleType.USER_AGENT -> rule.pattern.toRegex()
                        .containsMatchIn(userAgent)

                    ProxyJailRuleType.METHOD -> rule.pattern.equals(method, ignoreCase = true)
                    ProxyJailRuleType.PATH -> rule.pattern.toRegex().containsMatchIn(path)
                    ProxyJailRuleType.STATUS_CODE -> rule.pattern == status.toString()
                    else -> {
                        false
                    }
                }
                if (match) {
                    shouldJail = true
                    reason = "Matched legacy rule: ${rule.description ?: rule.pattern}"
                    break
                }
            }

            // Legacy threshold check removed - use rule chains instead

            if (shouldJail) {
                logger.warn("Jailing IP $ip for proxy violation: $reason")
                val duration = AppConfig.jailSettings.jailDurationMinutes
                jailIP(ip, duration, "Proxy: $reason")
            }
        }
    }
}

// Service object for easy access
object JailManagerService {
    private val service: IJailManagerService get() = ServiceContainer.jailManagerService

    fun listJails() = service.listJails()
    fun jailIP(ip: String, durationMinutes: Int, reason: String) =
        service.jailIP(ip, durationMinutes, reason)

    fun unjailIP(ip: String) = service.unjailIP(ip)
    fun getCountryCode(ip: String) = service.getCountryCode(ip)
    fun isIPJailed(ip: String) = service.isIPJailed(ip)
    fun recordFailedLoginAttempt(ip: String) = service.recordFailedLoginAttempt(ip)
    fun clearFailedAttempts(ip: String) = service.clearFailedAttempts(ip)
    fun checkProxySecurityViolation(
        ip: String,
        userAgent: String,
        method: String,
        path: String,
        status: Int,
        errorCount: Long,
        referer: String? = null,
        domain: String? = null,
    ) = service.checkProxySecurityViolation(
        ip,
        userAgent,
        method,
        path,
        status,
        errorCount,
        referer,
        domain
    )
}

