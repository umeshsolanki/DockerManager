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
    val topMethods: List<GenericHitEntry> = emptyList()
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
    USER_AGENT, METHOD, PATH, STATUS_CODE
}

@Serializable
data class ProxyJailRule(
    val id: String = java.util.UUID.randomUUID().toString(),
    val type: ProxyJailRuleType,
    val pattern: String,
    val description: String? = null
)

@Serializable
data class GenericHitEntry(
    val label: String,
    val count: Long
)

