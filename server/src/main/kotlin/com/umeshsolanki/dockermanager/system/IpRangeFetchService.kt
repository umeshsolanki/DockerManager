package com.umeshsolanki.dockermanager.system

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.database.IpRangesTable
import com.umeshsolanki.dockermanager.utils.IpUtils
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.java.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.greaterEq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.lessEq
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.transactions.transaction
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

    fun parseAwsJson(jsonString: String): List<String> {
        val json = AppConfig.json.parseToJsonElement(jsonString).jsonObject
        val prefixes = json["prefixes"]?.jsonArray ?: JsonArray(emptyList())
        val ipv6Prefixes = json["ipv6_prefixes"]?.jsonArray ?: JsonArray(emptyList())
        
        val cidrs = mutableListOf<String>()
        prefixes.forEach { 
            it.jsonObject["ip_prefix"]?.jsonPrimitive?.content?.let { cidr -> cidrs.add(cidr) }
        }
        ipv6Prefixes.forEach { 
            it.jsonObject["ipv6_prefix"]?.jsonPrimitive?.content?.let { cidr -> cidrs.add(cidr) }
        }
        return cidrs
    }

    suspend fun fetchGoogleRanges(): Int {
        logger.info("Fetching Google IP ranges...")
        val response = client.get("https://www.gstatic.com/ipranges/goog.json").bodyAsText()
        val cidrs = parseGoogleJson(response)
        return importCidrs(cidrs, "Google", "hosting")
    }

    fun parseGoogleJson(jsonString: String): List<String> {
        val json = AppConfig.json.parseToJsonElement(jsonString).jsonObject
        val prefixes = json["prefixes"]?.jsonArray ?: JsonArray(emptyList())
        
        val cidrs = mutableListOf<String>()
        prefixes.forEach { prefix ->
            prefix.jsonObject["ipv4Prefix"]?.jsonPrimitive?.content?.let { cidrs.add(it) }
            prefix.jsonObject["ipv6Prefix"]?.jsonPrimitive?.content?.let { cidrs.add(it) }
        }
        return cidrs
    }

    suspend fun fetchDigitalOceanRanges(): Int {
        logger.info("Fetching DigitalOcean IP ranges...")
        // DigitalOcean provides a CSV formatted for Google Geo protocol
        val response = client.get("https://www.digitalocean.com/geo/google.csv").bodyAsText()
        val lines = response.lines().filter { it.isNotBlank() && !it.startsWith("#") }
        
        var imported = 0
        transaction {
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
                }
            }
            
            IpRangesTable.batchInsert(batch) { item ->
                this[IpRangesTable.startIp] = BigDecimal(item.start)
                this[IpRangesTable.endIp] = BigDecimal(item.end)
                this[IpRangesTable.countryCode] = item.cc
                this[IpRangesTable.countryName] = item.cn
                this[IpRangesTable.provider] = item.p
                this[IpRangesTable.type] = item.t
            }
            imported = batch.size
        }
        IpLookupService.clearCache()
        return imported
    }

    suspend fun fetchFromCustomCsvUrl(url: String, provider: String): Int {
        logger.info("Fetching IP ranges from custom URL: $url")
        val response = client.get(url).bodyAsText()
        val lines = response.lines().filter { it.isNotBlank() }
        
        // Assume format: cidr,countryCode,countryName,provider,type
        // Or just cidr
        var imported = 0
        transaction {
            val batch = lines.mapNotNull { line ->
                val parts = line.split(",")
                val cidr = parts[0].trim()
                val range = IpUtils.cidrToRange(cidr) ?: return@mapNotNull null
                
                object {
                    val start = range.first
                    val end = range.second
                    val cc = parts.getOrNull(1)?.trim() ?: "GLOBAL"
                    val cn = parts.getOrNull(2)?.trim() ?: "Global"
                    val p = parts.getOrNull(3)?.trim() ?: provider
                    val t = parts.getOrNull(4)?.trim() ?: "unknown"
                }
            }
            
            IpRangesTable.batchInsert(batch) { item ->
                this[IpRangesTable.startIp] = BigDecimal(item.start)
                this[IpRangesTable.endIp] = BigDecimal(item.end)
                this[IpRangesTable.countryCode] = item.cc
                this[IpRangesTable.countryName] = item.cn
                this[IpRangesTable.provider] = item.p
                this[IpRangesTable.type] = item.t
            }
            imported = batch.size
        }
        IpLookupService.clearCache()
        return imported
    }

    private fun importCidrs(cidrs: List<String>, provider: String, type: String): Int {
        var imported = 0
        transaction {
            val batch = cidrs.mapNotNull { cidr ->
                val range = IpUtils.cidrToRange(cidr.trim()) ?: return@mapNotNull null
                object {
                    val start = range.first
                    val end = range.second
                    val p = provider
                    val t = type
                }
            }
            
            IpRangesTable.batchInsert(batch) { item ->
                this[IpRangesTable.startIp] = BigDecimal(item.start)
                this[IpRangesTable.endIp] = BigDecimal(item.end)
                this[IpRangesTable.countryCode] = "GLOBAL"
                this[IpRangesTable.countryName] = "Global / Multiple"
                this[IpRangesTable.provider] = item.p
                this[IpRangesTable.type] = item.t
            }
            imported = batch.size
        }
        IpLookupService.clearCache()
        return imported
    }
}
