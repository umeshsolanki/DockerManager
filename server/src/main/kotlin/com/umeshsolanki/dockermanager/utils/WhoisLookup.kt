package com.umeshsolanki.dockermanager.utils

import org.slf4j.LoggerFactory

/**
 * Local WHOIS lookup — runs the system `whois` binary and parses the output.
 * Used as a fallback when external IP-API is rate-limited (429).
 *
 * Parses ARIN, RIPE, APNIC, LACNIC, and AFRINIC formats.
 */
object WhoisLookup {
    private val logger = LoggerFactory.getLogger(WhoisLookup::class.java)
    private val executor = CommandExecutor(timeoutSeconds = 10, loggerName = WhoisLookup::class.java.name)

    data class WhoisResult(
        val country: String? = null,
        val org: String? = null,
        val isp: String? = null,
        val netRange: String? = null,
        val cidr: String? = null,
        val asn: String? = null
    )

    fun lookup(ip: String): WhoisResult? {
        if (ip.isBlank()) return null
        return try {
            val result = executor.execute("whois $ip")
            if (result.exitCode != 0 || result.output.isBlank()) {
                logger.debug("whois command failed for $ip: exit=${result.exitCode}")
                return null
            }
            parseWhoisOutput(result.output)
        } catch (e: Exception) {
            logger.debug("whois lookup error for $ip: ${e.message}")
            null
        }
    }

    internal fun parseWhoisOutput(output: String): WhoisResult {
        var country: String? = null
        var org: String? = null
        var isp: String? = null
        var netRange: String? = null
        var cidr: String? = null
        var asn: String? = null

        for (line in output.lines()) {
            val trimmed = line.trim()
            if (trimmed.isEmpty() || trimmed.startsWith('%') || trimmed.startsWith('#')) continue

            val colonIdx = trimmed.indexOf(':')
            if (colonIdx <= 0) continue

            val key = trimmed.substring(0, colonIdx).trim().lowercase()
            val value = trimmed.substring(colonIdx + 1).trim()
            if (value.isEmpty()) continue

            when (key) {
                "country" -> if (country == null) country = value.uppercase().take(2)
                "orgname", "org-name", "owner" -> if (org == null) org = value
                "descr", "netname" -> if (isp == null) isp = value
                "netrange" -> if (netRange == null) netRange = value
                "cidr", "inetnum", "inet6num" -> if (cidr == null) cidr = value
                "originas", "origin" -> if (asn == null) asn = value.removePrefix("AS").let { "AS$it" }
            }
        }

        return WhoisResult(
            country = country,
            org = org,
            isp = isp ?: org,
            netRange = netRange,
            cidr = cidr,
            asn = asn
        )
    }
}
