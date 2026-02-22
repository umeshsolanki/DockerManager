package com.umeshsolanki.dockermanager.system

import com.umeshsolanki.dockermanager.database.IpRangesTable
import com.umeshsolanki.dockermanager.utils.IpUtils
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import org.jetbrains.exposed.sql.*
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

        get("/list") {
            try {
                val page  = call.request.queryParameters["page"]?.toIntOrNull()  ?: 0
                val limit = (call.request.queryParameters["limit"]?.toIntOrNull() ?: 50).coerceIn(1, 500)
                val search = call.request.queryParameters["search"]?.trim()?.lowercase() ?: ""
                val offset = (page * limit).toLong()

                data class IpRangeRow(
                    val id: Int,
                    val cidr: String?,
                    val countryCode: String?,
                    val countryName: String?,
                    val provider: String?,
                    val type: String?
                )

                val rows: List<IpRangeRow> = dbQuery {
                    val query = if (search.isNotBlank()) {
                        IpRangesTable.selectAll().where {
                            (IpRangesTable.cidr.lowerCase() like "%$search%") or
                            (IpRangesTable.countryCode.lowerCase() like "%$search%") or
                            (IpRangesTable.countryName.lowerCase() like "%$search%") or
                            (IpRangesTable.provider.lowerCase() like "%$search%")
                        }
                    } else {
                        IpRangesTable.selectAll()
                    }
                    query.orderBy(IpRangesTable.id)
                        .limit(limit, offset)
                        .map { row ->
                            IpRangeRow(
                                id = row[IpRangesTable.id],
                                cidr = row[IpRangesTable.cidr],
                                countryCode = row[IpRangesTable.countryCode],
                                countryName = row[IpRangesTable.countryName],
                                provider = row[IpRangesTable.provider],
                                type = row[IpRangesTable.type]
                            )
                        }
                }

                val total: Long = dbQuery {
                    if (search.isNotBlank()) {
                        IpRangesTable.selectAll().where {
                            (IpRangesTable.cidr.lowerCase() like "%$search%") or
                            (IpRangesTable.countryCode.lowerCase() like "%$search%") or
                            (IpRangesTable.countryName.lowerCase() like "%$search%") or
                            (IpRangesTable.provider.lowerCase() like "%$search%")
                        }.count()
                    } else {
                        IpRangesTable.selectAll().count()
                    }
                }

                call.respond(HttpStatusCode.OK, mapOf(
                    "rows" to rows,
                    "total" to total,
                    "page" to page,
                    "limit" to limit
                ))
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, mapOf("error" to (e.message ?: "Unknown error")))
            }
        }
    }
}
