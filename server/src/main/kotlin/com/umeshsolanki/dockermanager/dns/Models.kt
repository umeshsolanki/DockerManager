package com.umeshsolanki.dockermanager.dns

import kotlinx.serialization.Serializable

// ========== Enums ==========

@Serializable
enum class DnsRecordType {
    A, AAAA, CNAME, MX, TXT, NS, SRV, PTR, CAA, SOA, TLSA, SSHFP, HTTPS, NAPTR
}

@Serializable
enum class ZoneType {
    FORWARD, REVERSE
}

@Serializable
enum class ZoneRole {
    MASTER, SLAVE, STUB, FORWARD_ONLY
}

@Serializable
enum class TsigAlgorithm {
    HMAC_SHA256, HMAC_SHA512, HMAC_SHA1, HMAC_MD5;

    fun toBindName(): String = when (this) {
        HMAC_SHA256 -> "hmac-sha256"
        HMAC_SHA512 -> "hmac-sha512"
        HMAC_SHA1 -> "hmac-sha1"
        HMAC_MD5 -> "hmac-md5"
    }
}

// ========== Core Models ==========

@Serializable
data class DnsRecord(
    val id: String = "",
    val name: String,
    val type: DnsRecordType,
    val value: String,
    val ttl: Int = 3600,
    val priority: Int? = null,
    val weight: Int? = null,
    val port: Int? = null
)

@Serializable
data class SoaRecord(
    val primaryNs: String = "ns1.localhost.",
    val adminEmail: String = "admin.localhost.",
    val serial: Long = 1,
    val refresh: Int = 3600,
    val retry: Int = 600,
    val expire: Int = 604800,
    val minimumTtl: Int = 300
)

@Serializable
data class DnsZone(
    val id: String,
    val name: String,
    val type: ZoneType = ZoneType.FORWARD,
    val role: ZoneRole = ZoneRole.MASTER,
    val filePath: String = "",
    val enabled: Boolean = true,
    val soa: SoaRecord = SoaRecord(),
    val records: List<DnsRecord> = emptyList(),
    val createdAt: Long = System.currentTimeMillis(),
    // Advanced zone options
    val masterAddresses: List<String> = emptyList(),
    val allowTransfer: List<String> = emptyList(),
    val allowUpdate: List<String> = emptyList(),
    val allowQuery: List<String> = emptyList(),
    val alsoNotify: List<String> = emptyList(),
    val forwarders: List<String> = emptyList(),
    val dnssecEnabled: Boolean = false
)

// ========== Service Status ==========

@Serializable
data class DnsServiceStatus(
    val running: Boolean,
    val version: String = "",
    val configValid: Boolean = false,
    val configOutput: String = "",
    val uptime: String = "",
    val zoneCount: Int = 0,
    val loadedZoneCount: Int = 0
)

@Serializable
data class ZoneValidationResult(
    val valid: Boolean,
    val output: String
)

@Serializable
data class DnsActionResult(
    val success: Boolean,
    val message: String
)

// ========== ACLs ==========

@Serializable
data class DnsAcl(
    val id: String = "",
    val name: String,
    val entries: List<String> = emptyList(),
    val comment: String = ""
)

// ========== TSIG Keys ==========

@Serializable
data class TsigKey(
    val id: String = "",
    val name: String,
    val algorithm: TsigAlgorithm = TsigAlgorithm.HMAC_SHA256,
    val secret: String = "",
    val createdAt: Long = System.currentTimeMillis()
)

// ========== Forwarders ==========

@Serializable
data class DnsForwarderConfig(
    val forwarders: List<String> = emptyList(),
    val forwardOnly: Boolean = false
)

// ========== DNSSEC ==========

@Serializable
data class DnssecStatus(
    val enabled: Boolean = false,
    val signed: Boolean = false,
    val kskKeyTag: String = "",
    val zskKeyTag: String = "",
    val dsRecords: List<String> = emptyList(),
    val signedAt: Long? = null
)

// ========== Professional Hosting Structures ==========

@Serializable
data class SpfConfig(
    val allowMx: Boolean = true,
    val allowA: Boolean = true,
    val ipAddresses: List<String> = emptyList(),
    val includeDomains: List<String> = emptyList(),
    val allMechanism: String = "~all" // "-all", "~all", "?all"
)

@Serializable
data class DmarcConfig(
    val policy: String = "none", // none, quarantine, reject
    val pct: Int = 100,
    val rua: String = "",
    val ruf: String = "",
    val aspf: String = "r", // r (relaxed), s (strict)
    val adkim: String = "r"
)

@Serializable
data class SrvConfig(
    val service: String, // e.g. _sip, _autodiscover
    val protocol: String, // e.g. _tcp, _udp
    val priority: Int = 0,
    val weight: Int = 0,
    val port: Int,
    val target: String
)

@Serializable
data class EmailHealthStatus(
    val zoneId: String,
    val hasMx: Boolean,
    val hasSpf: Boolean,
    val hasDkim: Boolean,
    val hasDmarc: Boolean,
    val issues: List<String> = emptyList()
)

@Serializable
data class ReverseDnsDashboard(
    val serverIps: List<String>,
    val managedReverseZones: List<String>,
    val ptrStatuses: List<PtrStatus>
)

@Serializable
data class PtrStatus(
    val ip: String,
    val ptrValue: String?,
    val isManagedLocally: Boolean,
    val health: String // OK, MISSING, ERROR
)

@Serializable
data class DkimKey(
    val selector: String,
    val publicKey: String,
    val privateKey: String,
    val dnsRecord: String = ""
)

@Serializable
data class PropagationStatus(
    val serverName: String, // Google, Cloudflare, etc.
    val serverIp: String,
    val resolvedValues: List<String>,
    val matches: Boolean,
    val error: String? = null
)

@Serializable
data class IpPtrSuggestion(
    val ip: String,
    val domain: String,
    val reverseZone: String,
    val ptrRecordName: String
)

// ========== DNS Lookup (dig) ==========

@Serializable
data class DnsLookupRequest(
    val query: String,
    val type: String = "A",
    val server: String? = null
)

@Serializable
data class DnsLookupResult(
    val success: Boolean,
    val query: String,
    val type: String,
    val answers: List<DnsLookupAnswer> = emptyList(),
    val rawOutput: String = "",
    val queryTime: String = "",
    val server: String = "",
    val status: String = ""
)

@Serializable
data class DnsLookupAnswer(
    val name: String,
    val ttl: Int,
    val type: String,
    val value: String
)

// ========== Query Statistics ==========

@Serializable
data class DnsQueryStats(
    val totalQueries: Long = 0,
    val successQueries: Long = 0,
    val failedQueries: Long = 0,
    val nxdomainQueries: Long = 0,
    val servfailQueries: Long = 0,
    val refusedQueries: Long = 0,
    val droppedQueries: Long = 0,
    val recursiveQueries: Long = 0,
    val tcpQueries: Long = 0,
    val udpQueries: Long = 0,
    val qps: Double = 0.0,
    val queryTypes: Map<String, Long> = emptyMap(),
    val topDomains: Map<String, Long> = emptyMap(),
    val rawStats: String = ""
)

// ========== Global Security Config ==========

@Serializable
data class GlobalSecurityConfig(
    val recursionEnabled: Boolean = false,
    val allowRecursion: List<String> = listOf("localnets", "localhost"),
    val rateLimitEnabled: Boolean = false,
    val rateLimitResponsesPerSecond: Int = 10,
    val rateLimitWindow: Int = 5,
    val defaultNameServers: List<String> = emptyList(),
    val allowQuery: List<String> = listOf("any"),
    val minimalResponses: Boolean = false,
    val ednsUdpSize: Int = 1232,
    val ipv4Enabled: Boolean = true,
    val ipv6Enabled: Boolean = true,
    val tcpClients: Int = 100,
    val maxCacheSize: String = "128M",
    val reuseport: Boolean = false
)


@Serializable
data class ZoneTemplate(
    val id: String = "",
    val name: String,
    val description: String = "",
    val records: List<DnsRecord> = emptyList()
)

// ========== New Requests/Results ==========

@Serializable
data class DkimKeyGenRequest(
    val domain: String,
    val selector: String = "default",
    val keySize: Int = 2048
)

@Serializable
data class PropagationCheckResult(
    val zoneId: String,
    val recordName: String,
    val recordType: DnsRecordType,
    val expectedValue: String,
    val checks: List<PropagationStatus> = emptyList()
)

// ========== Bulk Import ==========

@Serializable
data class BulkImportRequest(
    val zoneId: String,
    val content: String,
    val format: String = "bind",
    val replace: Boolean = false
)

@Serializable
data class BulkImportResult(
    val success: Boolean,
    val imported: Int = 0,
    val skipped: Int = 0,
    val errors: List<String> = emptyList()
)

// ========== Installation ==========

@Serializable
enum class DnsInstallMethod { DOCKER, APT }

@Serializable
data class DnsInstallRequest(
    val method: DnsInstallMethod,
    val dockerImage: String = "ubuntu/bind9:latest",
    val containerName: String = "bind9",
    val hostPort: Int = 53,
    val dataPath: String = "dns/bind9/data",
    val configPath: String = "dns/bind9/config"
)

@Serializable
data class DnsInstallStatus(
    val installed: Boolean = false,
    val method: DnsInstallMethod? = null,
    val running: Boolean = false,
    val version: String = "",
    val dockerContainerId: String? = null,
    val dockerImage: String? = null,
    val composeFile: String? = null,
    val osType: String = ""
)

// ========== Requests ==========

@Serializable
data class CreateZoneRequest(
    val name: String,
    val type: ZoneType = ZoneType.FORWARD,
    val role: ZoneRole = ZoneRole.MASTER,
    val soa: SoaRecord = SoaRecord(),
    val masterAddresses: List<String> = emptyList(),
    val allowTransfer: List<String> = emptyList(),
    val allowUpdate: List<String> = emptyList(),
    val allowQuery: List<String> = emptyList(),
    val alsoNotify: List<String> = emptyList(),
    val forwarders: List<String> = emptyList()
)

@Serializable
data class UpdateRecordRequest(
    val records: List<DnsRecord>
)

@Serializable
data class UpdateZoneOptionsRequest(
    val allowTransfer: List<String>? = null,
    val allowUpdate: List<String>? = null,
    val allowQuery: List<String>? = null,
    val alsoNotify: List<String>? = null,
    val forwarders: List<String>? = null,
    val masterAddresses: List<String>? = null
)

@Serializable
data class UpdateZoneRequest(
    val soa: SoaRecord? = null,
    val role: ZoneRole? = null,
    val type: ZoneType? = null,
    val allowTransfer: List<String>? = null,
    val allowUpdate: List<String>? = null,
    val allowQuery: List<String>? = null,
    val alsoNotify: List<String>? = null,
    val forwarders: List<String>? = null,
    val masterAddresses: List<String>? = null
)
