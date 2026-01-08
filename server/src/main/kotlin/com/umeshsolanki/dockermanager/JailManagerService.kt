package com.umeshsolanki.dockermanager

import kotlinx.coroutines.*
import org.slf4j.LoggerFactory
import java.util.concurrent.ConcurrentHashMap

interface IJailManagerService {
    fun listJails(): List<JailedIP>
    fun jailIP(ip: String, durationMinutes: Int, reason: String): Boolean
    fun unjailIP(ip: String): Boolean
    fun getCountryCode(ip: String): String
}

class JailManagerServiceImpl(
    private val firewallService: IFirewallService
) : IJailManagerService {
    private val logger = LoggerFactory.getLogger(JailManagerServiceImpl::class.java)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var unjailJob: Job? = null
    private val countryCache = ConcurrentHashMap<String, String>()

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
}
