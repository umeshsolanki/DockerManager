package com.umeshsolanki.dockermanager.proxy

import kotlinx.serialization.Serializable

// ========== Proxy Models ==========

@Serializable
data class PathRoute(
    val id: String = java.util.UUID.randomUUID().toString(),
    val path: String, // e.g., "/api", "/static", "/admin"
    val target: String, // Backend target URL
    val websocketEnabled: Boolean = false,
    val allowedIps: List<String> = emptyList(),
    val stripPrefix: Boolean = false, // If true, removes the path prefix before forwarding
    val customConfig: String? = null, // Custom Nginx config for this path
    val enabled: Boolean = true, // Enable/disable this path route
    val name: String? = null, // Optional name/description for UI display
    val order: Int = 0 // Order/priority for path matching (higher = more priority)
)

@Serializable
data class ProxyHost(
    val id: String = "",
    val domain: String,
    val upstream: String? = null, // Optional: defaults to target if not provided
    val target: String,
    val ssl: Boolean = false,
    val enabled: Boolean = true,
    val customConfig: String? = null,
    val websocketEnabled: Boolean = false,
    val allowedIps: List<String> = emptyList(),
    val customSslPath: String? = null,
    val hstsEnabled: Boolean = false,
    val paths: List<PathRoute> = emptyList() // Custom path-based routes
) {
    // Computed property to get upstream, defaulting to target if not provided
    val effectiveUpstream: String get() = upstream ?: target
}

@Serializable
data class ProxyStats(
    val totalHits: Long,
    val hitsByStatus: Map<Int, Long> = emptyMap(),
    val hitsOverTime: Map<String, Long> = emptyMap(),
    val topPaths: List<PathHit> = emptyList(),
    val recentHits: List<ProxyHit> = emptyList(),
    val hitsByDomain: Map<String, Long> = emptyMap(),
    val topIps: List<GenericHitEntry> = emptyList(),
    val topIpsWithErrors: List<GenericHitEntry> = emptyList(),
    val topUserAgents: List<GenericHitEntry> = emptyList(),
    val topReferers: List<GenericHitEntry> = emptyList(),
    val topMethods: List<GenericHitEntry> = emptyList(),
    val websocketConnections: Long = 0,
    val websocketConnectionsByEndpoint: Map<String, Long> = emptyMap(),
    val websocketConnectionsByIp: Map<String, Long> = emptyMap(),
    val recentWebSocketConnections: List<WebSocketConnection> = emptyList()
)

@Serializable
data class ProxyHit(
    val timestamp: Long,
    val ip: String,
    val method: String,
    val path: String,
    val status: Int,
    val responseTime: Long = 0,
    val userAgent: String? = null,
    val referer: String? = null,
    val domain: String? = null
)

@Serializable
data class PathHit(
    val path: String,
    val hits: Long
)

@Serializable
data class SSLCertificate(
    val id: String,
    val domain: String,
    val certPath: String,
    val keyPath: String,
    val type: String = "letsencrypt", // "letsencrypt" or "custom"
    val expiresAt: Long? = null,
    val issuer: String? = null
)

@Serializable
data class ProxyContainerStatus(
    val exists: Boolean,
    val running: Boolean,
    val imageExists: Boolean = false,
    val containerId: String? = null,
    val status: String? = null,
    val uptime: String? = null
)

@Serializable
data class ProxyActionResult(
    val success: Boolean,
    val message: String
)

@Serializable
enum class ProxyJailRuleType {
    USER_AGENT, METHOD, PATH, STATUS_CODE, IP, REFERER, DOMAIN
}

@Serializable
data class ProxyJailRule(
    val id: String = java.util.UUID.randomUUID().toString(),
    val type: ProxyJailRuleType,
    val pattern: String,
    val description: String? = null
)

// New advanced rule system with AND/OR logic
@Serializable
enum class RuleOperator {
    AND, OR
}

@Serializable
enum class RuleAction {
    JAIL, // Jail the IP (existing behavior)
    NGINX_BLOCK, // Block at nginx gateway level (return 403 or 444)
    NGINX_DENY, // Deny at nginx gateway level (return 444 - close connection)
    LOG_ONLY // Just log, don't take action
}

@Serializable
data class RuleCondition(
    val id: String = java.util.UUID.randomUUID().toString(),
    val type: ProxyJailRuleType,
    val pattern: String, // Regex pattern or exact match
    val negate: Boolean = false, // If true, match when condition is NOT met
    val description: String? = null
)

@Serializable
data class RuleChain(
    val id: String = java.util.UUID.randomUUID().toString(),
    val name: String,
    val description: String? = null,
    val enabled: Boolean = true,
    val operator: RuleOperator = RuleOperator.OR, // AND or OR logic between conditions
    val conditions: List<RuleCondition> = emptyList(),
    val action: RuleAction = RuleAction.JAIL,
    val actionConfig: RuleActionConfig? = null, // Additional config for action
    val order: Int = 0 // Evaluation order (lower = evaluated first)
)

@Serializable
data class RuleActionConfig(
    val jailDurationMinutes: Int? = null, // Override default jail duration
    val nginxResponseCode: Int = 403, // HTTP response code for nginx block (403, 444, etc.)
    val nginxResponseMessage: String? = null // Custom response message
)

@Serializable
data class GenericHitEntry(
    val label: String,
    val count: Long
)

@Serializable
data class WebSocketConnection(
    val timestamp: Long,
    val endpoint: String, // e.g., "/shell/server", "/shell/container/{id}"
    val ip: String,
    val userAgent: String? = null,
    val containerId: String? = null,
    val authenticated: Boolean = true,
    var duration: Long? = null // Duration in milliseconds, null if still connected
)

