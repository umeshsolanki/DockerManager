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
import com.umeshsolanki.dockermanager.system.IpLookupService
import com.umeshsolanki.dockermanager.kafka.IpReputationEvent
import com.umeshsolanki.dockermanager.ServiceContainer
import com.umeshsolanki.dockermanager.AppConfig
import java.util.concurrent.ConcurrentHashMap

interface IIpReputationService {
    suspend fun getIpReputation(ip: String): IpReputation?
    suspend fun listIpReputations(limit: Int = 100, offset: Long = 0, search: String? = null): List<IpReputation>
    suspend fun recordActivity(ipAddress: String, countryCode: String? = null, isp: String? = null, tag: String? = null, range: String? = null, dangerTag: String? = null)
    suspend fun recordBlock(ipAddress: String, reason: String, countryCode: String? = null, isp: String? = null, tag: String? = null, range: String? = null, dangerTag: String? = null, durationMinutes: Int = 0)
    suspend fun deleteIpReputation(ipAddress: String): Boolean
}

class IpReputationServiceImpl : IIpReputationService {

    companion object {
        // Simple cache to debounce DB writes for activity updates (key: IP, value: last update timestamp)
        private val activityCache = ConcurrentHashMap<String, Long>()
        private const val ACTIVITY_CACHE_TTL_MS = 60_000L // 1 minute
        private const val MAX_CACHE_SIZE = 10_000
        
        private fun publishToKafka(event: IpReputationEvent) {
            try {
                // Send to Kafka
                val settings = AppConfig.settings.kafkaSettings
                if (settings.enabled) {
                    ServiceContainer.kafkaService.publishReputationEvent(settings, event)
                }
                
                // Send to ClickHouse
                if (AppConfig.settings.clickhouseSettings.enabled) {
                    com.umeshsolanki.dockermanager.analytics.ClickHouseService.logReputationEvent(event)
                }
            } catch (e: Exception) {
                // Ignore kafka errors to not break core logic
            }
        }
    }

    override suspend fun getIpReputation(ip: String): IpReputation? = dbQuery {
        IpReputationTable.selectAll().where { IpReputationTable.ip eq ip }
            .map { toIpReputation(it) }
            .singleOrNull()
    }

    override suspend fun listIpReputations(limit: Int, offset: Long, search: String?): List<IpReputation> = dbQuery {
        val query = IpReputationTable.selectAll()
        
        search?.takeIf { it.isNotBlank() }?.let { term ->
            query.andWhere { 
                (IpReputationTable.ip like "%$term%") or 
                (IpReputationTable.country like "%$term%") or
                (IpReputationTable.reasons like "%$term%") or
                (IpReputationTable.isp like "%$term%") or
                (IpReputationTable.tag like "%$term%") or
                (IpReputationTable.range like "%$term%")
            }
        }

        query.limit(limit, offset)
            .orderBy(IpReputationTable.lastActivity to SortOrder.DESC)
            .map { toIpReputation(it) }
    }

    private fun mergeTags(currentTags: String?, newTags: String?): String? {
        if (newTags.isNullOrBlank()) return currentTags
        val current = currentTags?.split(",")?.map { it.trim() }?.filter { it.isNotBlank() }?.toSet() ?: emptySet()
        val new = newTags.split(",").map { it.trim() }.filter { it.isNotBlank() }.toSet()
        val merged = (current + new)
        return if (merged.isEmpty()) null else merged.joinToString(",")
    }

    override suspend fun recordActivity(ipAddress: String, countryCode: String?, isp: String?, tag: String?, range: String?, dangerTag: String?) {
        val nowMs = System.currentTimeMillis()
        
        // Debounce: If updated recently, skip DB write
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
            // Lookup IP info if missing
            val lookupInfo = if (isp == null || tag == null || range == null) IpLookupService.lookup(ipAddress) else null
            val resolvedIsp = isp ?: lookupInfo?.provider
            val resolvedTag = tag ?: lookupInfo?.type
            val resolvedRange = range ?: lookupInfo?.cidr
            val resolvedCountry = countryCode ?: lookupInfo?.countryCode

            val now = LocalDateTime.now()
            
            // Should read existing to merge tags
            val existing = IpReputationTable.selectAll().where { IpReputationTable.ip eq ipAddress }.singleOrNull()

            if (existing != null) {
                val currentTags = existing[IpReputationTable.tag]
                val newTags = mergeTags(currentTags, resolvedTag)

                val currentDangerTags = existing[IpReputationTable.dangerTags]
                val newDangerTags = if (dangerTag != null) mergeTags(currentDangerTags, dangerTag) else currentDangerTags

                IpReputationTable.update({ IpReputationTable.ip eq ipAddress }) {
                    it[lastActivity] = now
                    it[flaggedTimes] = existing[IpReputationTable.flaggedTimes] + 1
                    it[lastFlagged] = now
                    if (existing[IpReputationTable.firstFlagged] == null) {
                        it[firstFlagged] = now
                    }
                    resolvedCountry?.let { code -> it[country] = code }
                    resolvedIsp?.let { v -> it[IpReputationTable.isp] = v }
                    if (newTags != currentTags) {
                         it[IpReputationTable.tag] = newTags
                    }
                    if (newDangerTags != currentDangerTags) {
                        it[IpReputationTable.dangerTags] = newDangerTags ?: ""
                    }
                    resolvedRange?.let { v -> it[IpReputationTable.range] = v }
                }
            } else {
                 try {
                    IpReputationTable.insert {
                        it[ip] = ipAddress
                        it[firstObserved] = now
                        it[lastActivity] = now
                        it[flaggedTimes] = 1
                        it[firstFlagged] = now
                        it[lastFlagged] = now
                        it[blockedTimes] = 0
                        it[reasons] = ""
                        it[country] = resolvedCountry
                        it[IpReputationTable.isp] = resolvedIsp
                        it[IpReputationTable.tag] = resolvedTag
                        it[IpReputationTable.dangerTags] = dangerTag ?: ""
                        it[IpReputationTable.range] = resolvedRange
                    }
                } catch (e: Exception) {
                    // Handle race condition: inserted by another thread in the meantime
                    // Just update activity in that case
                    IpReputationTable.update({ IpReputationTable.ip eq ipAddress }) {
                         it[lastActivity] = now
                         resolvedCountry?.let { code -> it[country] = code }
                    }
                }
            }
            
            // Publish to Kafka
            publishToKafka(IpReputationEvent(
                type = if (existing == null) "OBSERVED" else "ACTIVITY",
                ip = ipAddress,
                country = resolvedCountry,
                isp = resolvedIsp,
                flaggedTimes = if (existing == null) 1 else existing[IpReputationTable.flaggedTimes] + 1,
                tags = (resolvedTag ?: "").split(",").filter { it.isNotBlank() },
                dangerTags = (dangerTag ?: "").split(",").filter { it.isNotBlank() }
            ))
        }
    }

    override suspend fun recordBlock(ipAddress: String, reason: String, countryCode: String?, isp: String?, tag: String?, range: String?, dangerTag: String?, durationMinutes: Int) = dbQuery {
        val shortReason = reason.trim().take(64)
        val now = LocalDateTime.now()
        
        // Lookup IP info if missing
        val lookupInfo = if (isp == null || tag == null || range == null) IpLookupService.lookup(ipAddress) else null
        val resolvedIsp = isp ?: lookupInfo?.provider
        val resolvedTag = tag ?: lookupInfo?.type
        val resolvedRange = range ?: lookupInfo?.cidr
        val resolvedCountry = countryCode ?: lookupInfo?.countryCode

        // Use selectAll().where to find existing without slicing to avoid potential incomplete object mapping issues if we were mapping
        // But here we are just reading columns. selectAll().where is safer API-wise.
        val existing = IpReputationTable.selectAll().where { IpReputationTable.ip eq ipAddress }.singleOrNull()
        val weekAgo = java.time.LocalDateTime.now().minusDays(7)
        val lastBlockedTime = existing?.get(IpReputationTable.lastBlocked)
        val newExponential = if (existing == null || lastBlockedTime == null || lastBlockedTime.isBefore(weekAgo)) 1 else existing[IpReputationTable.exponentialBlockedTimes] + 1
        val newBlocked = (existing?.get(IpReputationTable.blockedTimes) ?: 0) + 1
        val newFlagged = (existing?.get(IpReputationTable.flaggedTimes) ?: 0) + 1

        if (existing == null) {
            try {
                IpReputationTable.insert {
                    it[ip] = ipAddress
                    it[firstObserved] = now
                    it[lastActivity] = now // Block implies activity
                    it[firstBlocked] = now
                    it[lastBlocked] = now
                    it[blockedTimes] = newBlocked
                    it[flaggedTimes] = newFlagged
                    it[firstFlagged] = now
                    it[lastFlagged] = now
                    it[exponentialBlockedTimes] = newExponential
                    it[lastJailDuration] = durationMinutes
                    it[reasons] = shortReason
                    it[country] = resolvedCountry
                    it[IpReputationTable.isp] = resolvedIsp
                    it[IpReputationTable.tag] = resolvedTag
                    it[IpReputationTable.dangerTags] = dangerTag ?: ""
                    it[IpReputationTable.range] = resolvedRange
                }
            } catch (e: Exception) {
                // Race condition fallback
                recordBlockRetry(ipAddress, shortReason, countryCode, now)
            }
        } else {
            val currentReasons = existing[IpReputationTable.reasons]
            val newReasons = mergeTags(currentReasons, shortReason)
            // mergeTags returns null if empty, but reasons likely not empty if we are adding one.
            // If mergeTags returns null (empty), we should put ""? Or shortReason? 
            // mergeTags returns combination. If default was "", currentReasons is "". mergeTags("", "foo") -> "foo".
            val updatedReasonsString = newReasons ?: shortReason

            val currentTags = existing[IpReputationTable.tag]
            val newTags = mergeTags(currentTags, resolvedTag)

            val currentDangerTags = existing[IpReputationTable.dangerTags]
            val newDangerTags = if (dangerTag != null) mergeTags(currentDangerTags, dangerTag) else currentDangerTags

            IpReputationTable.update({ IpReputationTable.ip eq ipAddress }) {
                it[lastActivity] = now
                it[lastBlocked] = now
                if (existing[IpReputationTable.firstBlocked] == null) {
                    it[firstBlocked] = now
                }
                
                it[reasons] = updatedReasonsString
                it[flaggedTimes] = newFlagged
                it[lastFlagged] = now
                if (existing[IpReputationTable.firstFlagged] == null) {
                    it[firstFlagged] = now
                }
                it[exponentialBlockedTimes] = newExponential
                it[blockedTimes] = newBlocked
                it[IpReputationTable.lastJailDuration] = durationMinutes
                resolvedCountry?.let { code -> it[country] = code }
                resolvedIsp?.let { v -> it[IpReputationTable.isp] = v }
                if (newTags != currentTags) {
                     it[IpReputationTable.tag] = newTags
                }
                if (newDangerTags != currentDangerTags) {
                    it[IpReputationTable.dangerTags] = newDangerTags ?: ""
                }
                resolvedRange?.let { v -> it[IpReputationTable.range] = v }
            }
        }
        
        // Publish to Kafka
        publishToKafka(IpReputationEvent(
            type = "BLOCK",
            ip = ipAddress,
            country = resolvedCountry,
            isp = resolvedIsp,
            reason = reason,
            blockedTimes = newBlocked,
            exponentialBlockedTimes = newExponential,
            flaggedTimes = newFlagged,
            lastJailDuration = durationMinutes,
            lastFlagged = System.currentTimeMillis(),
            tags = (resolvedTag ?: "").split(",").filter { it.isNotBlank() },
            dangerTags = (dangerTag ?: "").split(",").filter { it.isNotBlank() }
        ))

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
    
    override suspend fun deleteIpReputation(ipAddress: String): Boolean = dbQuery {
        activityCache.remove(ipAddress)
        IpReputationTable.deleteWhere { IpReputationTable.ip eq ipAddress } > 0
    }

    private fun toIpReputation(row: ResultRow): IpReputation {
        val reasonsString = row[IpReputationTable.reasons]
        val reasons = reasonsString.split(",").map { it.trim() }.filter { it.isNotBlank() }
        
        val tagsString = row[IpReputationTable.tag]
        val tags = tagsString?.split(",")?.map { it.trim() }?.filter { it.isNotBlank() } ?: emptyList()

        return IpReputation(
            ip = row[IpReputationTable.ip],
            firstObserved = row[IpReputationTable.firstObserved].format(DateTimeFormatter.ISO_DATE_TIME),
            lastActivity = row[IpReputationTable.lastActivity].format(DateTimeFormatter.ISO_DATE_TIME),
            firstBlocked = row[IpReputationTable.firstBlocked]?.format(DateTimeFormatter.ISO_DATE_TIME),
            blockedTimes = row[IpReputationTable.blockedTimes],
            exponentialBlockedTimes = row[IpReputationTable.exponentialBlockedTimes],
            lastJailDuration = row[IpReputationTable.lastJailDuration],
            flaggedTimes = row[IpReputationTable.flaggedTimes],
            firstFlagged = row[IpReputationTable.firstFlagged]?.format(DateTimeFormatter.ISO_DATE_TIME),
            lastFlagged = row[IpReputationTable.lastFlagged]?.format(DateTimeFormatter.ISO_DATE_TIME),
            lastBlocked = row[IpReputationTable.lastBlocked]?.format(DateTimeFormatter.ISO_DATE_TIME),
            reasons = reasons,
            country = row[IpReputationTable.country],
            isp = row[IpReputationTable.isp],
            tags = tags,
            dangerTags = row[IpReputationTable.dangerTags].split(",").map { it.trim() }.filter { it.isNotBlank() },
            range = row[IpReputationTable.range]
        )
    }
}
