package com.umeshsolanki.dockermanager.proxy

import com.umeshsolanki.dockermanager.AppConfig
import org.slf4j.LoggerFactory
import kotlin.experimental.and

private val logger = LoggerFactory.getLogger("RuleEvaluationService")

/**
 * Evaluates rule chains against a request
 */
class RuleEvaluationServiceImpl {

    /**
     * Evaluates all enabled rule chains and returns matching rules with their actions
     */
    fun evaluateRules(
        ip: String,
        userAgent: String?,
        method: String,
        path: String,
        status: Int,
        referer: String?,
        domain: String?,
    ): List<RuleMatchResult> {
        val secSettings = AppConfig.proxySecuritySettings
        if (!secSettings.proxyJailEnabled) return emptyList()

        val matches = mutableListOf<RuleMatchResult>()

        // Evaluate rule chains in order
        val sortedChains = secSettings.ruleChains.filter { it.enabled }.sortedBy { it.order }

        for (chain in sortedChains) {
            if (evaluateRuleChain(chain, ip, userAgent, method, path, status, referer, domain)) {
                matches.add(
                    RuleMatchResult(
                    chain = chain, matchedConditions = chain.conditions.filter { condition ->
                        evaluateCondition(
                            condition,
                            ip,
                            userAgent,
                            method,
                            path,
                            status,
                            referer,
                            domain
                        )
                    }))
            }
        }

        return matches
    }

    /**
     * Evaluates a single rule chain using AND/OR logic
     */
    private fun evaluateRuleChain(
        chain: RuleChain,
        ip: String,
        userAgent: String?,
        method: String,
        path: String,
        status: Int,
        referer: String?,
        domain: String?,
    ): Boolean {
        if (chain.conditions.isEmpty()) return false

        val conditionResults = chain.conditions.map { condition ->
            evaluateCondition(condition, ip, userAgent, method, path, status, referer, domain)
        }

        return when (chain.operator) {
            RuleOperator.AND -> conditionResults.all { it }
            RuleOperator.OR -> conditionResults.any { it }
        }
    }

    /**
     * Evaluates a single condition
     */
    private fun evaluateCondition(
        condition: RuleCondition,
        ip: String,
        userAgent: String?,
        method: String,
        path: String,
        status: Int,
        referer: String?,
        domain: String?,
    ): Boolean {
        val match = try {
            when (condition.type) {
                ProxyJailRuleType.IP -> {
                    // Support CIDR notation and exact match
                    if (condition.pattern.contains("/")) {
                        // CIDR notation
                        isIpInCidr(ip, condition.pattern)
                    } else {
                        // Exact match or regex
                        condition.pattern.toRegex().containsMatchIn(ip)
                    }
                }

                ProxyJailRuleType.USER_AGENT -> {
                    userAgent?.let { condition.pattern.toRegex().containsMatchIn(it) } ?: false
                }

                ProxyJailRuleType.METHOD -> {
                    condition.pattern.toRegex(RegexOption.IGNORE_CASE).containsMatchIn(method)
                }

                ProxyJailRuleType.PATH -> {
                    condition.pattern.toRegex().containsMatchIn(path)
                }

                ProxyJailRuleType.STATUS_CODE -> {
                    condition.pattern.toRegex().containsMatchIn(status.toString())
                }

                ProxyJailRuleType.REFERER -> {
                    referer?.let { condition.pattern.toRegex().containsMatchIn(it) } ?: false
                }

                ProxyJailRuleType.DOMAIN -> {
                    domain?.let { condition.pattern.toRegex().containsMatchIn(it) } ?: false
                }
            }
        } catch (e: Exception) {
            logger.warn("Error evaluating condition ${condition.id}: ${e.message}")
            false
        }

        return if (condition.negate) !match else match
    }

    /**
     * Checks if IP is in CIDR range
     */
    private fun isIpInCidr(ip: String, cidr: String): Boolean {
        return try {
            val parts = cidr.split("/")
            if (parts.size != 2) return false

            val cidrIp = parts[0]
            val prefixLength = parts[1].toInt()

            val ipBytes = ipToBytes(ip)
            val cidrBytes = ipToBytes(cidrIp)

            if (ipBytes == null || cidrBytes == null) return false

            val maskBytes = createMask(prefixLength)

            for (i in ipBytes.indices) {
                if ((ipBytes[i] and maskBytes[i]) != (cidrBytes[i] and maskBytes[i])) {
                    return false
                }
            }
            true
        } catch (e: Exception) {
            logger.warn("Error checking CIDR for $ip in $cidr: ${e.message}")
            false
        }
    }

    private fun ipToBytes(ip: String): ByteArray? {
        return try {
            val parts = ip.split(".").map { it.toInt() }
            if (parts.size != 4) return null
            byteArrayOf(
                parts[0].toByte(), parts[1].toByte(), parts[2].toByte(), parts[3].toByte()
            )
        } catch (e: Exception) {
            null
        }
    }

    private fun createMask(prefixLength: Int): ByteArray {
        val mask = ByteArray(4)
        for (i in 0 until 4) {
            val bits = minOf(8, maxOf(0, prefixLength - i * 8))
            mask[i] = ((0xFF shl (8 - bits)) and 0xFF).toByte()
        }
        return mask
    }
}

/**
 * Result of rule evaluation
 */
data class RuleMatchResult(
    val chain: RuleChain,
    val matchedConditions: List<RuleCondition>,
)

// Service object
object RuleEvaluationService {
    private val service = RuleEvaluationServiceImpl()

    fun evaluateRules(
        ip: String,
        userAgent: String?,
        method: String,
        path: String,
        status: Int,
        referer: String? = null,
        domain: String? = null,
    ): List<RuleMatchResult> {
        return service.evaluateRules(ip, userAgent, method, path, status, referer, domain)
    }
}

