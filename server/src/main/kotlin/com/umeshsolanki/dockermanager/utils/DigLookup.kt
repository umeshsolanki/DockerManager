package com.umeshsolanki.dockermanager.utils

import org.slf4j.LoggerFactory

/**
 * Team Cymru DNS-based ASN/CIDR lookup via `dig`.
 * No rate limits, free, updated every 4 hours from BGP feeds.
 *
 * IP → ASN + CIDR + Country: dig +short [reversed-ip].origin.asn.cymru.com TXT
 * Response: "23028 | 216.90.108.0/24 | US | arin | 1998-09-25"
 *
 * ASN → CIDR blocks: dig +short AS12345.asn.cymru.com TXT
 * Response: one or more "ASN | prefix | CC | registry | date" lines
 */
object DigLookup {
    private val logger = LoggerFactory.getLogger(DigLookup::class.java)
    private val executor = CommandExecutor(timeoutSeconds = 5, loggerName = DigLookup::class.java.name)

    data class DigResult(
        val asn: String? = null,
        val cidr: String? = null,
        val countryCode: String? = null,
        val registry: String? = null
    )

    /**
     * Look up IP via Team Cymru origin.asn.cymru.com (IPv4) or origin6.asn.cymru.com (IPv6).
     * Returns ASN, the BGP prefix (CIDR) for that IP, and country code.
     */
    fun lookupIp(ip: String): DigResult? {
        if (ip.isBlank()) return null
        val (reversed, zone) = reverseIpAndZone(ip) ?: return null
        return try {
            val result = executor.execute("dig +short $reversed.$zone TXT")
            if (result.exitCode != 0 || result.output.isBlank()) {
                logger.debug("dig origin lookup failed for $ip: exit=${result.exitCode}")
                return null
            }
            parseOriginResponse(result.output)
        } catch (e: Exception) {
            logger.debug("dig lookup error for $ip: ${e.message}")
            null
        }
    }

    /**
     * Look up all CIDR blocks for an ASN via ASN.asn.cymru.com.
     * Returns list of CIDR prefixes announced by that ASN.
     */
    fun lookupAsnPrefixes(asn: String): List<String> {
        val cleanAsn = asn.removePrefix("AS").trim()
        if (cleanAsn.isBlank()) return emptyList()
        return try {
            val result = executor.execute("dig +short AS$cleanAsn.asn.cymru.com TXT")
            if (result.exitCode != 0 || result.output.isBlank()) return emptyList()
            parseAsnPrefixesResponse(result.output)
        } catch (e: Exception) {
            logger.debug("dig ASN prefixes lookup error for $asn: ${e.message}")
            emptyList()
        }
    }

    private fun reverseIpAndZone(ip: String): Pair<String, String>? {
        return try {
            val addr = java.net.InetAddress.getByName(ip)
            when (addr.address.size) {
                4 -> {
                    val reversed = addr.address.reversed().joinToString(".") { it.toInt().and(0xff).toString() }
                    reversed to "origin.asn.cymru.com"
                }
                16 -> {
                    val hex = addr.address.joinToString("") { "%02x".format(it) }
                    val reversed = hex.reversed().chunked(1).joinToString(".")
                    reversed to "origin6.asn.cymru.com"
                }
                else -> null
            }
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Parse "23028 | 216.90.108.0/24 | US | arin | 1998-09-25"
     */
    private fun parseOriginResponse(output: String): DigResult? {
        val line = output.lines().firstOrNull()?.trim()?.removeSurrounding("\"") ?: return null
        val parts = line.split("|").map { it.trim() }
        if (parts.size < 3) return null
        val asnNum = parts[0].takeIf { it.all { c -> c.isDigit() } } ?: return null
        return DigResult(
            asn = "AS$asnNum",
            cidr = parts.getOrNull(1)?.takeIf { it.contains("/") },
            countryCode = parts.getOrNull(2)?.uppercase()?.take(2),
            registry = parts.getOrNull(3)
        )
    }

    /**
     * Parse multiple "ASN | prefix | CC | registry | date" lines
     */
    private fun parseAsnPrefixesResponse(output: String): List<String> {
        return output.lines()
            .mapNotNull { line ->
                val trimmed = line.trim().removeSurrounding("\"")
                val parts = trimmed.split("|").map { it.trim() }
                parts.getOrNull(1)?.takeIf { it.contains("/") }
            }
            .distinct()
    }
}
