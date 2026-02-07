package com.umeshsolanki.dockermanager.ip

import com.umeshsolanki.dockermanager.database.DatabaseFactory.dbQuery
import com.umeshsolanki.dockermanager.database.IpReputationTable
import com.umeshsolanki.dockermanager.database.IpReputation
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

object IpReputationService {

    suspend fun getIpReputation(ip: String): IpReputation? = dbQuery {
        IpReputationTable.selectAll().where { IpReputationTable.ip eq ip }
            .map { toIpReputation(it) }
            .singleOrNull()
    }

    suspend fun listIpReputations(limit: Int = 100, offset: Long = 0, search: String? = null): List<IpReputation> = dbQuery {
        val query = IpReputationTable.selectAll()
        
        search?.takeIf { it.isNotBlank() }?.let { term ->
            query.andWhere { 
                (IpReputationTable.ip like "%$term%") or 
                (IpReputationTable.country like "%$term%") or
                (IpReputationTable.reasons like "%$term%")
            }
        }
        
        query.limit(limit, offset)
            .orderBy(IpReputationTable.lastActivity to SortOrder.DESC)
            .map { toIpReputation(it) }
    }

    suspend fun recordActivity(ipAddress: String, countryCode: String? = null) = dbQuery {
        val existing = IpReputationTable.selectAll().where { IpReputationTable.ip eq ipAddress }.singleOrNull()
        val now = LocalDateTime.now()

        if (existing == null) {
            IpReputationTable.insert {
                it[ip] = ipAddress
                it[firstObserved] = now
                it[lastActivity] = now
                it[blockedTimes] = 0
                it[reasons] = "[]"
                it[country] = countryCode
            }
        } else {
            IpReputationTable.update({ IpReputationTable.ip eq ipAddress }) {
                it[lastActivity] = now
                countryCode?.let { code -> it[country] = code }
            }
        }
    }

    suspend fun recordBlock(ipAddress: String, reason: String, countryCode: String? = null) = dbQuery {
        val shortReason = reason.trim().take(64)
        val existing = IpReputationTable.selectAll().where { IpReputationTable.ip eq ipAddress }.singleOrNull()
        val now = LocalDateTime.now()

        if (existing == null) {
            IpReputationTable.insert {
                it[ip] = ipAddress
                it[firstObserved] = now
                it[lastActivity] = now // Block implies activity
                it[firstBlocked] = now
                it[lastBlocked] = now
                it[blockedTimes] = 1
                it[reasons] = Json.encodeToString(listOf(shortReason))
                it[country] = countryCode
            }
        } else {
            val currentReasonsString = existing[IpReputationTable.reasons]
            val currentReasons = try {
                Json.decodeFromString<List<String>>(currentReasonsString)
            } catch (e: Exception) { emptyList() }
            
            val updatedReasons = (currentReasons + shortReason).distinct()

            IpReputationTable.update({ IpReputationTable.ip eq ipAddress }) {
                it[lastActivity] = now
                it[lastBlocked] = now
                if (existing[IpReputationTable.firstBlocked] == null) {
                    it[firstBlocked] = now
                }
                
                // Only increment if not blocked very recently? Or always? Assuming always for now.
                it[blockedTimes] = existing[IpReputationTable.blockedTimes] + 1
                it[reasons] = Json.encodeToString(updatedReasons)
                countryCode?.let { code -> it[country] = code }
            }
        }
    }
    
    suspend fun deleteIpReputation(ipAddress: String): Boolean = dbQuery {
        IpReputationTable.deleteWhere { IpReputationTable.ip eq ipAddress } > 0
    }

    private fun toIpReputation(row: ResultRow): IpReputation {
        val reasonsString = row[IpReputationTable.reasons]
        val reasons = try {
            Json.decodeFromString<List<String>>(reasonsString)
        } catch (e: Exception) { emptyList() }
        
        return IpReputation(
            ip = row[IpReputationTable.ip],
            firstObserved = row[IpReputationTable.firstObserved].format(DateTimeFormatter.ISO_DATE_TIME),
            lastActivity = row[IpReputationTable.lastActivity].format(DateTimeFormatter.ISO_DATE_TIME),
            firstBlocked = row[IpReputationTable.firstBlocked]?.format(DateTimeFormatter.ISO_DATE_TIME),
            blockedTimes = row[IpReputationTable.blockedTimes],
            lastBlocked = row[IpReputationTable.lastBlocked]?.format(DateTimeFormatter.ISO_DATE_TIME),
            reasons = reasons,
            country = row[IpReputationTable.country]
        )
    }
}
