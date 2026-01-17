package com.umeshsolanki.dockermanager.system

import com.umeshsolanki.dockermanager.database.IpRangesTable
import com.umeshsolanki.dockermanager.utils.IpUtils
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.SqlExpressionBuilder.greaterEq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.lessEq
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import java.math.BigDecimal
import java.util.concurrent.ConcurrentHashMap

data class IpInfo(
    val countryCode: String?,
    val countryName: String?,
    val provider: String?,
    val type: String?
)

object IpLookupService {
    private val logger = org.slf4j.LoggerFactory.getLogger(IpLookupService::class.java)
    private val cache = ConcurrentHashMap<String, IpInfo>()

    fun lookup(ip: String): IpInfo? {
        if (ip == "127.0.0.1" || ip == "::1" || ip == "localhost") return IpInfo("LOCAL", "Local Address", "Internal", "loopback")
        
        // Check cache first
        cache[ip]?.let { return it }

        val numericIp = IpUtils.ipToBigInteger(ip) ?: return null
        val bigDecimalIp = BigDecimal(numericIp)

        return try {
            val info = transaction {
                IpRangesTable.selectAll().where {
                    (IpRangesTable.startIp lessEq bigDecimalIp) and (IpRangesTable.endIp greaterEq bigDecimalIp)
                }.firstOrNull()?.let {
                    IpInfo(
                        countryCode = it[IpRangesTable.countryCode],
                        countryName = it[IpRangesTable.countryName],
                        provider = it[IpRangesTable.provider],
                        type = it[IpRangesTable.type]
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
