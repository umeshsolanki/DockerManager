package com.umeshsolanki.dockermanager.dns

import kotlinx.serialization.Serializable

// ========== Enums ==========

@Serializable
enum class DnsRecordType {
    A, AAAA, CNAME, MX, TXT, NS, SRV, PTR, CAA, SOA
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
    val retry: Int = 900,
    val expire: Int = 1209600,
    val minimumTtl: Int = 86400
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
    val zoneCount: Int = 0
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
    val recursiveQueries: Long = 0,
    val queryTypes: Map<String, Long> = emptyMap(),
    val topDomains: Map<String, Long> = emptyMap(),
    val rawStats: String = ""
)

// ========== Zone Templates ==========

@Serializable
data class ZoneTemplate(
    val id: String = "",
    val name: String,
    val description: String = "",
    val records: List<DnsRecord> = emptyList()
)

// ========== Bulk Import ==========

@Serializable
data class BulkImportRequest(
    val zoneId: String,
    val content: String,
    val format: String = "bind"
)

@Serializable
data class BulkImportResult(
    val success: Boolean,
    val imported: Int = 0,
    val skipped: Int = 0,
    val errors: List<String> = emptyList()
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
    val forwarders: List<String> = emptyList()
)

@Serializable
data class UpdateRecordRequest(
    val records: List<DnsRecord>
)

@Serializable
data class UpdateZoneOptionsRequest(
    val allowTransfer: List<String>? = null,
    val alsoNotify: List<String>? = null,
    val forwarders: List<String>? = null
)
