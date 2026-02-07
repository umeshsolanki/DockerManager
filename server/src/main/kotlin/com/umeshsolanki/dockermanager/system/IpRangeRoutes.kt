package com.umeshsolanki.dockermanager.system

import com.umeshsolanki.dockermanager.database.IpRangesTable
import com.umeshsolanki.dockermanager.utils.IpUtils
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.deleteAll
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.SqlExpressionBuilder.greaterEq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.lessEq
import com.umeshsolanki.dockermanager.database.DatabaseFactory.dbQuery
import java.math.BigDecimal

fun Route.ipRangeRoutes() {
    route("/ip-ranges") {
        /**
         * Import IP ranges from CSV
         * Body: CSV text with columns: cidr,country_code,country_name,provider,type
         */
        post("/import") {
            try {
                val csvContent = call.receiveText()
                val lines = csvContent.lines().filter { it.isNotBlank() }
                
                var importedCount = 0
                dbQuery {
                    // Option to clear old data or just append
                    // IpRangesTable.deleteAll() 
                    
                    val batch = lines.mapNotNull { line ->
                        val parts = line.split(",")
                        if (parts.size < 4) return@mapNotNull null
                        
                        val cidr = parts[0].trim()
                        val countryCode = parts[1].trim()
                        val countryName = parts[2].trim()
                        val provider = parts[3].trim()
                        val type = if (parts.size > 4) parts[4].trim() else "unknown"
                        
                        val range = IpUtils.cidrToRange(cidr) ?: return@mapNotNull null
                        
                        object {
                            val start = range.first
                            val end = range.second
                            val cc = countryCode
                            val cn = countryName
                            val p = provider
                            val t = type
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
                    importedCount = batch.size
                }
                
                IpLookupService.clearCache()
                call.respond(HttpStatusCode.OK, mapOf("status" to "success", "imported" to importedCount))
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, mapOf("error" to (e.message ?: "Unknown error")))
            }
        }

        post("/fetch") {
            try {
                val req = call.receive<IpFetchRequest>()
                val provider = req.provider
                
                val imported = when(provider.lowercase()) {
                    "cloudflare" -> IpRangeFetchService.fetchCloudflareRanges()
                    "aws" -> IpRangeFetchService.fetchAwsRanges()
                    "google" -> IpRangeFetchService.fetchGoogleRanges()
                    "digitalocean" -> IpRangeFetchService.fetchDigitalOceanRanges()
                    "custom" -> {
                        val url = req.url ?: throw IllegalArgumentException("URL is required for custom fetch")
                        val customProvider = req.customProvider ?: "Custom"
                        IpRangeFetchService.fetchFromCustomCsvUrl(url, customProvider)
                    }
                    else -> throw IllegalArgumentException("Unsupported provider: $provider")
                }
                
                call.respond(HttpStatusCode.OK, IpFetchResponse("success", imported))
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, IpFetchResponse("error", 0, e.message ?: "Unknown error"))
            }
        }

        get("/stats") {
            try {
                val count: Long = dbQuery {
                    IpRangesTable.selectAll().count()
                }
                call.respond(HttpStatusCode.OK, mapOf("totalRanges" to count))
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, mapOf("error" to (e.message ?: "Unknown error")))
            }
        }
    }
}
