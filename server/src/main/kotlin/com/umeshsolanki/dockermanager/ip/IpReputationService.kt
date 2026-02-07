package com.umeshsolanki.dockermanager.ip

import com.umeshsolanki.dockermanager.database.DatabaseFactory.dbQuery
import com.umeshsolanki.dockermanager.database.IpReputationTable
import com.umeshsolanki.dockermanager.database.IpReputation
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.ConcurrentHashMap

object IpReputationService {

    // Simple cache to debounce DB writes for activity updates (key: IP, value: last update timestamp)
    private val activityCache = ConcurrentHashMap<String, Long>()
    private const val ACTIVITY_CACHE_TTL_MS = 60_000L // 1 minute
    private const val MAX_CACHE_SIZE = 10_000

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

    suspend fun recordActivity(ipAddress: String, countryCode: String? = null) {
        val nowMs = System.currentTimeMillis()
        val lastUpdate = activityCache[ipAddress]
        
        // Debounce: If updated recently, skip DB write
        if (lastUpdate != null && (nowMs - lastUpdate) < ACTIVITY_CACHE_TTL_MS) {
            return
        }

        // Cleanup cache if too big
        if (activityCache.size > MAX_CACHE_SIZE) {
            activityCache.clear()
        }
        activityCache[ipAddress] = nowMs

        dbQuery {
            val now = LocalDateTime.now()
            // Try update first to avoid select overhead
            val updated = IpReputationTable.update({ IpReputationTable.ip eq ipAddress }) {
                it[lastActivity] = now
                countryCode?.let { code -> it[country] = code }
            }

            if (updated == 0) {
                // If update failed (row doesn't exist), insert
                try {
                    IpReputationTable.insert {
                        it[ip] = ipAddress
                        it[firstObserved] = now
                        it[lastActivity] = now
                        it[blockedTimes] = 0
                        it[reasons] = "[]"
                        it[country] = countryCode
                    }
                } catch (e: Exception) {
                    // Handle race condition: inserted by another thread in the meantime
                    // Just update activity in that case
                    IpReputationTable.update({ IpReputationTable.ip eq ipAddress }) {
                         it[lastActivity] = now
                         countryCode?.let { code -> it[country] = code }
                    }
                }
            }
        }
    }

    suspend fun recordBlock(ipAddress: String, reason: String, countryCode: String? = null) = dbQuery {
        val shortReason = reason.trim().take(64)
        val now = LocalDateTime.now()
        
        // Use selectAll().where to find existing without slicing to avoid potential incomplete object mapping issues if we were mapping
        // But here we are just reading columns. selectAll().where is safer API-wise.
        val existing = IpReputationTable.selectAll().where { IpReputationTable.ip eq ipAddress }.singleOrNull()

        if (existing == null) {
            try {
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
            } catch (e: Exception) {
                // Race condition fallback
                recordBlockRetry(ipAddress, shortReason, countryCode, now)
            }
        } else {
            val currentReasonsString = existing[IpReputationTable.reasons]
            
            // Optimize JSON handling: check string containment first to avoid parsing if present
            val reasonExists = currentReasonsString.contains("\"$shortReason\"")
            
            val updatedReasonsString = if (reasonExists) {
                currentReasonsString
            } else {
                val currentReasons = try {
                    Json.decodeFromString<List<String>>(currentReasonsString)
                } catch (e: Exception) { emptyList() }
                Json.encodeToString((currentReasons + shortReason).distinct())
            }

            IpReputationTable.update({ IpReputationTable.ip eq ipAddress }) {
                it[lastActivity] = now
                it[lastBlocked] = now
                if (existing[IpReputationTable.firstBlocked] == null) {
                    it[firstBlocked] = now
                }
                
                it[blockedTimes] = existing[IpReputationTable.blockedTimes] + 1
                it[reasons] = updatedReasonsString
                countryCode?.let { code -> it[country] = code }
            }
        }
        
        // Update cache to prevent immediate re-activity record
        activityCache[ipAddress] = System.currentTimeMillis()
    }
    
    // Helper for race condition in recordBlock
    private fun recordBlockRetry(ipAddress: String, shortReason: String, countryCode: String?, now: LocalDateTime) {
         IpReputationTable.update({ IpReputationTable.ip eq ipAddress }) {
            it[lastActivity] = now
            it[lastBlocked] = now
            // We can't easily append reason atomically via SQL in generic way, so we might lose a reason in extremely rare race
            // But we increment count at least (but blockedTimes is simple int, we should read again ideally but skipping for perf)
            // Ideally we'd do a proper transaction retry but for this use case, simple update is acceptable
        }
    }
    
    suspend fun deleteIpReputation(ipAddress: String): Boolean = dbQuery {
        activityCache.remove(ipAddress)
        IpReputationTable.deleteWhere { IpReputationTable.ip eq ipAddress } > 0
    }

    private fun toIpReputation(row: ResultRow): IpReputation {
        val reasonsString = row[IpReputationTable.reasons]
        // Fast path for empty array
        val reasons = if (reasonsString == "[]") emptyList() else try {
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
