package com.umeshsolanki.dockermanager.proxy

import kotlinx.serialization.Serializable

// ========== Proxy Models ==========

@Serializable
data class RateLimit(
    val enabled: Boolean = false,
    val rate: Int = 10, // requests
    val period: String = "s", // "s" or "m" (r/s or r/m)
    val burst: Int = 20,
    val nodelay: Boolean = true
)

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
    val order: Int = 0, // Order/priority for path matching (higher = more priority)
    val rateLimit: RateLimit? = null,
    val isStatic: Boolean = false
)

@Serializable
data class DnsConfig(
    val id: String = "",
    val name: String,                    // User-friendly name (e.g., "Cloudflare Production")
    val provider: String,                // cloudflare, digitalocean, manual
    val apiToken: String? = null,        // API token for cloudflare/digitalocean
    val dnsHost: String? = null,         // For manual default mode
    val authUrl: String? = null,         // For manual API hook mode
    val cleanupUrl: String? = null,      // For manual API hook mode
    val authScript: String? = null,      // For manual script mode
    val cleanupScript: String? = null,   // For manual script mode
    val createdAt: Long = System.currentTimeMillis()
)

@Serializable
data class CustomPage(
    val id: String = java.util.UUID.randomUUID().toString(),
    val title: String,
    val content: String, // HTML content
    val createdAt: Long = System.currentTimeMillis()
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
    val isWildcard: Boolean = false, // Enable wildcard SSL certificate (*.domain.com)
    val dnsConfigId: String? = null, // Reference to saved DNS config
    val paths: List<PathRoute> = emptyList(), // Custom path-based routes
    val sslChallengeType: String = "http", // "http" or "dns"
    val dnsProvider: String? = null, // e.g., "cloudflare", "manual", "http-api"
    val dnsApiToken: String? = null, // API token for DNS provider
    val dnsHost: String? = null, // Base host for custom DNS API
    val dnsAuthUrl: String? = null, // Custom HTTP API URL to set TXT record
    val dnsCleanupUrl: String? = null, // Custom HTTP API URL to remove TXT record
    val dnsAuthScript: String? = null, // Full custom script for auth hook
    val dnsCleanupScript: String? = null, // Full custom script for cleanup hook
    val rateLimit: RateLimit? = null,
    val isStatic: Boolean = false,
    val silentDrop: Boolean = false, // If true, returns 444 for blocked requests
    val underConstruction: Boolean = false,
    val underConstructionPageId: String? = null
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
    val hitsByDomainErrors: Map<String, Long> = emptyMap(),
    val topIps: List<GenericHitEntry> = emptyList(),
    val topIpsWithErrors: List<GenericHitEntry> = emptyList(),
    val topUserAgents: List<GenericHitEntry> = emptyList(),
    val topReferers: List<GenericHitEntry> = emptyList(),
    val topMethods: List<GenericHitEntry> = emptyList(),
    val hitsByCountry: Map<String, Long> = emptyMap(),
    val hitsByProvider: Map<String, Long> = emptyMap(),
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
data class ErrorLogEntry(
    val timestamp: Long,
    val level: String,
    val message: String,
    val client: String? = null,
    val server: String? = null,
    val request: String? = null,
    val host: String? = null
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
    val isWildcard: Boolean = false,
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
data class KafkaActionResult(
    val success: Boolean,
    val message: String? = null
)

@Serializable
enum class ProxyJailRuleType {
    USER_AGENT, METHOD, PATH, STATUS_CODE, COMPOSITE
}

@Serializable
data class ProxyJailRule(
    val id: String = java.util.UUID.randomUUID().toString(),
    val type: ProxyJailRuleType,
    val pattern: String,
    val description: String? = null,
    val statusCodePattern: String? = null // For COMPOSITE rules: regex pattern to match status codes (e.g., "404|403")
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
