package com.umeshsolanki.ucpanel.system
import com.umeshsolanki.ucpanel.AppConfig

import com.umeshsolanki.ucpanel.database.IpRangesTable
import com.umeshsolanki.ucpanel.utils.IpUtils
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import java.math.BigDecimal
import java.util.concurrent.ConcurrentHashMap

data class IpInfo(
    val countryCode: String?,
    val countryName: String?,
    val provider: String?,
    val type: String?,
    val cidr: String?,
    val asn: String?
)

object IpLookupService {
    private val logger = org.slf4j.LoggerFactory.getLogger(IpLookupService::class.java)
    private val cache = ConcurrentHashMap<String, IpInfo>()

    fun lookup(ip: String): IpInfo? {
        if (ip == "127.0.0.1" || ip == "::1" || ip == "localhost") return IpInfo("LOCAL", "Local Address", "Internal", "loopback", "127.0.0.0/8", "AS0")
        
        // Check cache first
        cache[ip]?.let { return it }

        val numericIp = IpUtils.ipToBigInteger(ip) ?: return null
        val bigDecimalIp = BigDecimal(numericIp)

        return try {
            if (AppConfig.storageBackend != "database") return null
            
            val info = transaction {
                IpRangesTable.selectAll().where {
                    (IpRangesTable.startIp lessEq bigDecimalIp) and (IpRangesTable.endIp greaterEq bigDecimalIp)
                }.firstOrNull()?.let {
                    IpInfo(
                        countryCode = it[IpRangesTable.countryCode],
                        countryName = it[IpRangesTable.countryName],
                        provider = it[IpRangesTable.provider],
                        type = it[IpRangesTable.type],
                        cidr = it[IpRangesTable.cidr],
                        asn = it[IpRangesTable.asn]
                    )
                }
            }
            if (info != null) {
                cache[ip] = info
            }
            info
        } catch (e: Exception) {
            logger.error("Error looking up IP $ip", e)
            null
        }
    }

    fun clearCache() {
        cache.clear()
    }
}
