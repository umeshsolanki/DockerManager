package com.umeshsolanki.dockermanager.system

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.database.IpRangesTable
import com.umeshsolanki.dockermanager.utils.IpUtils
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.java.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.serialization.json.*
import com.umeshsolanki.dockermanager.database.DatabaseFactory.dbQuery
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.deleteWhere
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.slf4j.LoggerFactory
import java.math.BigDecimal

object IpRangeFetchService {
    private val logger = LoggerFactory.getLogger(IpRangeFetchService::class.java)
    private val client = HttpClient(Java)

    suspend fun fetchCloudflareRanges(): Int {
        logger.info("Fetching Cloudflare IP ranges...")
        val ipv4 = client.get("https://www.cloudflare.com/ips-v4").bodyAsText().lines().filter { it.isNotBlank() }
        val ipv6 = client.get("https://www.cloudflare.com/ips-v6").bodyAsText().lines().filter { it.isNotBlank() }
        
        val allCidrs = ipv4 + ipv6
        return importCidrs(allCidrs, "Cloudflare", "CDN")
    }

    suspend fun fetchAwsRanges(): Int {
        logger.info("Fetching AWS IP ranges...")
        val response = client.get("https://ip-ranges.amazonaws.com/ip-ranges.json").bodyAsText()
        val cidrs = parseAwsJson(response)
        return importCidrs(cidrs, "AWS", "hosting")
    }

    suspend fun parseAwsJson(jsonString: String): List<String> = withContext(Dispatchers.Default) {
        val json = AppConfig.json.parseToJsonElement(jsonString).jsonObject
        val prefixes = json["prefixes"]?.jsonArray ?: JsonArray(emptyList())
        val ipv6Prefixes = json["ipv6_prefixes"]?.jsonArray ?: JsonArray(emptyArray<JsonElement>().toList())
        
        val cidrs = mutableListOf<String>()
        prefixes.forEach { 
            it.jsonObject["ip_prefix"]?.jsonPrimitive?.content?.let { cidr -> cidrs.add(cidr) }
        }
        ipv6Prefixes.forEach { 
            it.jsonObject["ipv6_prefix"]?.jsonPrimitive?.content?.let { cidr -> cidrs.add(cidr) }
        }
        cidrs
    }

    suspend fun fetchGoogleRanges(): Int {
        logger.info("Fetching Google IP ranges...")
        val response = client.get("https://www.gstatic.com/ipranges/goog.json").bodyAsText()
        val cidrs = parseGoogleJson(response)
        return importCidrs(cidrs, "Google", "hosting")
    }

    suspend fun parseGoogleJson(jsonString: String): List<String> = withContext(Dispatchers.Default) {
        val json = AppConfig.json.parseToJsonElement(jsonString).jsonObject
        val prefixes = json["prefixes"]?.jsonArray ?: JsonArray(emptyList())
        
        val cidrs = mutableListOf<String>()
        prefixes.forEach { prefix ->
            prefix.jsonObject["ipv4Prefix"]?.jsonPrimitive?.content?.let { cidrs.add(it) }
            prefix.jsonObject["ipv6Prefix"]?.jsonPrimitive?.content?.let { cidrs.add(it) }
        }
        cidrs
    }

    suspend fun fetchDigitalOceanRanges(): Int {
        logger.info("Fetching DigitalOcean IP ranges...")
        // DigitalOcean provides a CSV formatted for Google Geo protocol
        val response = client.get("https://www.digitalocean.com/geo/google.csv").bodyAsText()
        val lines = response.lines().filter { it.isNotBlank() && !it.startsWith("#") }
        
        var imported = 0
        dbQuery {
            val batch = lines.mapNotNull { line ->
                val parts = line.split(",")
                if (parts.size < 4) return@mapNotNull null
                
                val cidr = parts[0].trim()
                val countryCode = parts[1].trim()
                val countryName = parts[3].trim() // DigitalOcean format: range, country, state, city
                
                val range = IpUtils.cidrToRange(cidr) ?: return@mapNotNull null
                object {
                    val start = range.first
                    val end = range.second
                    val cc = countryCode
                    val cn = countryName
                    val p = "DigitalOcean"
                    val t = "hosting"
                    val cidr = cidr
                }
            }
            
            // Clear old ranges for this provider first
            IpRangesTable.deleteWhere { IpRangesTable.provider eq "DigitalOcean" }

            IpRangesTable.batchInsert(batch) { item ->
                this[IpRangesTable.startIp] = BigDecimal(item.start)
                this[IpRangesTable.endIp] = BigDecimal(item.end)
                this[IpRangesTable.countryCode] = item.cc
                this[IpRangesTable.countryName] = item.cn
                this[IpRangesTable.provider] = item.p
                this[IpRangesTable.type] = item.t
                this[IpRangesTable.cidr] = item.cidr
            }
            imported = batch.size
        }
        IpLookupService.clearCache()
        return imported
    }

    suspend fun fetchFromCustomCsvUrl(url: String, provider: String): Int {
        logger.info("Fetching IP ranges from custom URL: $url")
        val response = client.get(url).bodyAsText()
        
        // 1. Try JSON First
        if (response.trimStart().startsWith("{")) {
            try {
                val json = AppConfig.json.parseToJsonElement(response).jsonObject
                val cidrs = mutableListOf<String>()
                
                // Strategy A: "prefixes" array (AWS, Google)
                val prefixes = json["prefixes"]?.jsonArray
                if (prefixes != null) {
                    prefixes.forEach { 
                        // AWS: ip_prefix, ipv6_prefix
                        // Google: ipv4Prefix, ipv6Prefix
                        val p = it.jsonObject
                        p["ip_prefix"]?.jsonPrimitive?.content?.let { c -> cidrs.add(c) }
                        p["ipv6_prefix"]?.jsonPrimitive?.content?.let { c -> cidrs.add(c) }
                        p["ipv4Prefix"]?.jsonPrimitive?.content?.let { c -> cidrs.add(c) }
                        p["ipv6Prefix"]?.jsonPrimitive?.content?.let { c -> cidrs.add(c) }
                        // Generic "cidr" or "ip" field
                        p["cidr"]?.jsonPrimitive?.content?.let { c -> cidrs.add(c) }
                        p["ip"]?.jsonPrimitive?.content?.let { c -> cidrs.add(c) }
                    }
                }
                
                // Strategy B: "ipv6_prefixes" (AWS specific separate array)
                json["ipv6_prefixes"]?.jsonArray?.forEach {
                    it.jsonObject["ipv6_prefix"]?.jsonPrimitive?.content?.let { c -> cidrs.add(c) }
                }

                // Strategy C: "items" or "ranges"
                (json["items"]?.jsonArray ?: json["ranges"]?.jsonArray)?.forEach {
                     val p = it.jsonObject
                     p["cidr"]?.jsonPrimitive?.content?.let { c -> cidrs.add(c) }
                     p["val"]?.jsonPrimitive?.content?.let { c -> cidrs.add(c) }
                }

                if (cidrs.isNotEmpty()) {
                    logger.info("Parsed ${cidrs.size} ranges from JSON")
                    return importCidrs(cidrs, provider, "custom-json")
                }
            } catch (e: Exception) {
                logger.warn("Failed to parse custom URL as JSON, falling back to line-based parsing", e)
            }
        }

        // 2. Fallback to Line-based (CSV / Plain list)
        val lines = response.lines().filter { it.isNotBlank() && !it.trim().startsWith("#") && !it.trim().startsWith("//") }
        
        var imported = 0
        dbQuery {
            val batch = lines.mapNotNull { line ->
                val parts = line.split(",").map { it.trim() }
                // Try to find first valid CIDR in parts
                val cidrIndex = parts.indexOfFirst { IpUtils.cidrToRange(it) != null }
                
                if (cidrIndex == -1) return@mapNotNull null
                
                val cidr = parts[cidrIndex]
                val range = IpUtils.cidrToRange(cidr) ?: return@mapNotNull null
                
                // Attempt to deduce metadata
                // If CSV: cidr, cc, name
                val cc = if (parts.size > 1 && cidrIndex == 0) parts[1].take(2).uppercase() else "GL"
                val cn = if (parts.size > 2 && cidrIndex == 0) parts[2] else "Global"
                
                object {
                    val start = range.first
                    val end = range.second
                    val ccVal = cc
                    val cnVal = cn
                    val p = provider
                    val t = "custom"
                    val cidrVal = cidr
                }
            }
            
            // Clear old ranges for this provider
            if (provider != "Custom") {
                 IpRangesTable.deleteWhere { IpRangesTable.provider eq provider }
            }

            IpRangesTable.batchInsert(batch) { item ->
                this[IpRangesTable.startIp] = BigDecimal(item.start)
                this[IpRangesTable.endIp] = BigDecimal(item.end)
                this[IpRangesTable.countryCode] = item.ccVal
                this[IpRangesTable.countryName] = item.cnVal
                this[IpRangesTable.provider] = item.p
                this[IpRangesTable.type] = item.t
                this[IpRangesTable.cidr] = item.cidrVal
            }
            imported = batch.size
        }
        IpLookupService.clearCache()
        return imported
    }

    private suspend fun importCidrs(cidrs: List<String>, provider: String, type: String): Int {
        var imported = 0
        dbQuery {
            val batch = cidrs.mapNotNull { cidr ->
                val range = IpUtils.cidrToRange(cidr.trim()) ?: return@mapNotNull null
                object {
                    val start = range.first
                    val end = range.second
                    val p = provider
                    val t = type
                    val c = cidr
                }
            }
            
            // Clear old ranges for this provider first
            IpRangesTable.deleteWhere { IpRangesTable.provider eq provider }

            IpRangesTable.batchInsert(batch) { item ->
                this[IpRangesTable.startIp] = BigDecimal(item.start)
                this[IpRangesTable.endIp] = BigDecimal(item.end)
                this[IpRangesTable.countryCode] = "GLOBAL"
                this[IpRangesTable.countryName] = "Global / Multiple"
                this[IpRangesTable.provider] = item.p
                this[IpRangesTable.type] = item.t
                this[IpRangesTable.cidr] = item.c
            }
            imported = batch.size
        }
        IpLookupService.clearCache()
        return imported
    }
}
