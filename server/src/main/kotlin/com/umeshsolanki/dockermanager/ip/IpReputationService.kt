package com.umeshsolanki.dockermanager.ip

import com.umeshsolanki.dockermanager.database.DatabaseFactory.dbQuery
import com.umeshsolanki.dockermanager.database.DatabaseFactory.dbQueryWithRetry
import com.umeshsolanki.dockermanager.database.IpReputationTable
import com.umeshsolanki.dockermanager.database.IpReputation
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.slf4j.LoggerFactory
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import com.umeshsolanki.dockermanager.system.IpLookupService
import com.umeshsolanki.dockermanager.kafka.IpReputationEvent
import com.umeshsolanki.dockermanager.ServiceContainer
import com.umeshsolanki.dockermanager.AppConfig
import java.util.concurrent.ConcurrentHashMap

interface IIpReputationService {
    fun start()
    suspend fun getIpReputation(ip: String): IpReputation?
    suspend fun listIpReputations(limit: Int = 100, offset: Long = 0, search: String? = null): List<IpReputation>
    suspend fun recordActivity(ipAddress: String, countryCode: String? = null, isp: String? = null, tag: String? = null, range: String? = null, dangerTag: String? = null)
    suspend fun recordBlock(ipAddress: String, reason: String, countryCode: String? = null, isp: String? = null, tag: String? = null, range: String? = null, dangerTag: String? = null, durationMinutes: Int = 0)
    suspend fun updateStats(stats: Map<String, Pair<Long, Long>>) // Map<IP, Pair<RequestCount, ErrorCount>>
    suspend fun deleteIpReputation(ipAddress: String): Boolean
    suspend fun saveGeoInfo(ip: String, city: String?, lat: Double?, lon: Double?, timezone: String?, zip: String?, region: String?, regionName: String?, asName: String?, countryCode: String?, isp: String?)
    /**
     * Manually add or remove tags for an IP.
     * @param add   Tags to add (merged with existing)
     * @param remove Tags to remove
     * @param danger If true, writes to dangerTags; otherwise to the regular tags field
     */
    suspend fun tagIpReputation(ip: String, add: List<String> = emptyList(), remove: List<String> = emptyList(), danger: Boolean = false)
}

private data class ActivityEntry(
    val countryCode: String?,
    val isp: String?,
    val tag: String?,
    val range: String?,
    val dangerTag: String?
)

class IpReputationServiceImpl : IIpReputationService {

    private val logger = LoggerFactory.getLogger(IpReputationServiceImpl::class.java)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val activityFlushLock = Any()
    private var flushWorkerStarted = false

    companion object {
        // Cache to prevent re-processing same IP right after flush (key: IP, value: last flush timestamp)
        private val activityCache = ConcurrentHashMap<String, Long>()
        private const val ACTIVITY_CACHE_TTL_MS = 60_000L // 1 minute
        private const val MAX_CACHE_SIZE = 10_000
        private const val FLUSH_INTERVAL_MS = 10_000L
        private const val MAX_ACTIVITY_BUFFER_SIZE = 5_000

        private val activityBuffer = ConcurrentHashMap<String, ActivityEntry>()
        
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

    override fun start() {
        synchronized(activityFlushLock) {
            if (flushWorkerStarted) return
            flushWorkerStarted = true
        }
        scope.launch {
            while (isActive) {
                delay(FLUSH_INTERVAL_MS)
                try {
                    flushActivityBuffer()
                } catch (e: Exception) {
                    logger.error("Activity buffer flush failed", e)
                }
            }
        }
        logger.info("IpReputationService activity flush worker started")
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
        if (ipAddress.isBlank() || AppConfig.isLocalIP(ipAddress)) return

        val entry = ActivityEntry(countryCode, isp, tag, range, dangerTag)
        activityBuffer[ipAddress] = entry

        if (activityBuffer.size >= MAX_ACTIVITY_BUFFER_SIZE) {
            scope.launch {
                try { flushActivityBuffer() } catch (e: Exception) { logger.error("Emergency activity flush failed", e) }
            }
        }
    }

    private suspend fun flushActivityBuffer() {
        val snapshot = synchronized(activityFlushLock) {
            if (activityBuffer.isEmpty()) return
            val s = activityBuffer.toMap()
            activityBuffer.clear()
            s
        }

        if (snapshot.isEmpty()) return

        dbQueryWithRetry {
            val now = LocalDateTime.now()
            for ((ipAddress, entry) in snapshot) {
                try {
                    processActivityForIp(ipAddress, entry, now)
                } catch (e: Exception) {
                    logger.warn("Failed to process activity for IP $ipAddress: ${e.message}")
                }
            }
        }

        val nowMs = System.currentTimeMillis()
        snapshot.keys.forEach { activityCache[it] = nowMs }
        if (activityCache.size > MAX_CACHE_SIZE) activityCache.clear()
    }

    private fun processActivityForIp(ipAddress: String, entry: ActivityEntry, now: LocalDateTime) {
        val lookupInfo = if (entry.isp == null || entry.tag == null || entry.range == null) IpLookupService.lookup(ipAddress) else null
        val resolvedIsp = entry.isp ?: lookupInfo?.provider
        val resolvedTag = entry.tag ?: lookupInfo?.type
        val resolvedRange = entry.range ?: lookupInfo?.cidr
        val resolvedCountry = entry.countryCode ?: lookupInfo?.countryCode

        val existing = IpReputationTable.selectAll().where { IpReputationTable.ip eq ipAddress }.singleOrNull()

        if (existing != null) {
            val currentTags = existing[IpReputationTable.tag]
            val newTags = mergeTags(currentTags, resolvedTag)
            val currentDangerTags = existing[IpReputationTable.dangerTags]
            val newDangerTags = if (entry.dangerTag != null) mergeTags(currentDangerTags, entry.dangerTag) else currentDangerTags

            val updatedDangerTags = computeAutoTags(
                blocked = existing[IpReputationTable.blockedTimes],
                flagged = existing[IpReputationTable.flaggedTimes] + 1,
                errorCount = existing[IpReputationTable.errorCount],
                requestCount = existing[IpReputationTable.requestCount],
                existingDanger = newDangerTags ?: ""
            )

            IpReputationTable.update({ IpReputationTable.ip eq ipAddress }) {
                it[lastActivity] = now
                it[flaggedTimes] = existing[IpReputationTable.flaggedTimes] + 1
                it[lastFlagged] = now
                if (existing[IpReputationTable.firstFlagged] == null) it[firstFlagged] = now
                resolvedCountry?.let { code -> it[country] = code }
                resolvedIsp?.let { v -> it[IpReputationTable.isp] = v }
                if (newTags != currentTags) it[IpReputationTable.tag] = newTags
                it[IpReputationTable.dangerTags] = updatedDangerTags
                it[IpReputationTable.lastTaggedOn] = now
                resolvedRange?.let { v -> it[IpReputationTable.range] = v }
            }
            publishToKafka(IpReputationEvent(
                type = "ACTIVITY", ip = ipAddress, country = resolvedCountry, isp = resolvedIsp,
                flaggedTimes = existing[IpReputationTable.flaggedTimes] + 1,
                tags = (resolvedTag ?: "").split(",").filter { it.isNotBlank() },
                dangerTags = updatedDangerTags.split(",").filter { it.isNotBlank() }
            ))
        } else {
            val initialDangerTags = computeAutoTags(0, 1, 0, 0, entry.dangerTag ?: "")
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
                    it[isp] = resolvedIsp
                    it[tag] = resolvedTag
                    it[dangerTags] = initialDangerTags
                    it[lastTaggedOn] = now
                    it[range] = resolvedRange
                }
                publishToKafka(IpReputationEvent(
                    type = "OBSERVED", ip = ipAddress, country = resolvedCountry, isp = resolvedIsp,
                    flaggedTimes = 1, tags = (resolvedTag ?: "").split(",").filter { it.isNotBlank() },
                    dangerTags = initialDangerTags.split(",").filter { it.isNotBlank() }
                ))
            } catch (e: Exception) {
                IpReputationTable.update({ IpReputationTable.ip eq ipAddress }) {
                    it[lastActivity] = now
                    resolvedCountry?.let { code -> it[country] = code }
                }
            }
        }
    }

    // ── Auto-tagging ─────────────────────────────────────────────────────────
    /**
     * Derives behavioral threat tags from the current row stats and merges them
     * into the danger_tags column. Called synchronously inside the DB transaction.
     */
    private fun computeAutoTags(
        blocked: Int, flagged: Int, errorCount: Long, requestCount: Long, existingDanger: String
    ): String {
        val auto = mutableSetOf<String>()

        if (blocked >= 10)        auto += "high-threat"
        if (blocked >= 3)         auto += "repeat-offender"
        if (flagged >= 20)        auto += "scanner"
        if (errorCount >= 50 && requestCount > 0 && errorCount.toDouble() / requestCount > 0.5)
                                  auto += "brute-force"
        if (errorCount >= 100)    auto += "api-abuser"

        val existing = existingDanger.split(",").map { it.trim() }.filter { it.isNotBlank() }.toMutableSet()
        existing += auto
        return existing.joinToString(",")
    }

     // ── Manual tag management ─────────────────────────────────────────────────
    override suspend fun tagIpReputation(ip: String, add: List<String>, remove: List<String>, danger: Boolean) {
        if (ip.isBlank()) return
        val now = LocalDateTime.now()
        dbQuery {
            val row = IpReputationTable.selectAll().where { IpReputationTable.ip eq ip }.singleOrNull() ?: return@dbQuery
            if (danger) {
                val current = row[IpReputationTable.dangerTags].split(",").map { it.trim() }.filter { it.isNotBlank() }.toMutableSet()
                current += add.map { it.trim() }.filter { it.isNotBlank() }
                current -= remove.map { it.trim() }.toSet()
                IpReputationTable.update({ IpReputationTable.ip eq ip }) {
                    it[dangerTags] = current.joinToString(",")
                    it[lastTaggedOn] = now
                }
            } else {
                val current = (row[IpReputationTable.tag] ?: "").split(",").map { it.trim() }.filter { it.isNotBlank() }.toMutableSet()
                current += add.map { it.trim() }.filter { it.isNotBlank() }
                current -= remove.map { it.trim() }.toSet()
                IpReputationTable.update({ IpReputationTable.ip eq ip }) {
                    it[tag] = current.joinToString(",").ifBlank { null }
                    it[lastTaggedOn] = now
                }
            }
        }
    }

    override suspend fun recordBlock(ipAddress: String, reason: String, countryCode: String?, isp: String?, tag: String?, range: String?, dangerTag: String?, durationMinutes: Int) = dbQueryWithRetry {
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
            val initialDangerTags = computeAutoTags(newBlocked, newFlagged, 0, 0, dangerTag ?: "")
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
                    it[IpReputationTable.country] = resolvedCountry
                    it[IpReputationTable.isp] = resolvedIsp
                    it[IpReputationTable.tag] = resolvedTag
                    it[IpReputationTable.dangerTags] = initialDangerTags
                    it[IpReputationTable.lastTaggedOn] = now
                    it[IpReputationTable.range] = resolvedRange
                }
            } catch (e: Exception) {
                // Race condition fallback
                recordBlockRetry(ipAddress, shortReason, countryCode, now)
            }
        } else {
            val currentReasons = existing[IpReputationTable.reasons]
            val newReasons = mergeTags(currentReasons, shortReason)
            val updatedReasonsString = newReasons ?: shortReason

            val currentTags = existing[IpReputationTable.tag]
            val newTags = mergeTags(currentTags, resolvedTag)

            val currentDangerTags = existing[IpReputationTable.dangerTags]
            val newDangerTags = if (dangerTag != null) mergeTags(currentDangerTags, dangerTag) else currentDangerTags
            
            val updatedDangerTags = computeAutoTags(
                blocked = newBlocked,
                flagged = newFlagged,
                errorCount = existing[IpReputationTable.errorCount],
                requestCount = existing[IpReputationTable.requestCount],
                existingDanger = newDangerTags ?: ""
            )

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
                it[lastJailDuration] = durationMinutes
                resolvedCountry?.let { code -> it[country] = code }
                resolvedIsp?.let { v -> it[IpReputationTable.isp] = v }
                if (newTags != currentTags) {
                     it[IpReputationTable.tag] = newTags
                }
                it[IpReputationTable.dangerTags] = updatedDangerTags
                it[IpReputationTable.lastTaggedOn] = now
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

    override suspend fun updateStats(stats: Map<String, Pair<Long, Long>>) {
        if (stats.isEmpty()) return
        
        dbQueryWithRetry {
            // Process each IP update
            val now = LocalDateTime.now()
            
            stats.forEach { (ipAddress, counts) ->
                val (requests, errors) = counts
                
                // Try update
                val rowsUpdated = IpReputationTable.update({ IpReputationTable.ip eq ipAddress }) {
                    with(SqlExpressionBuilder) {
                        it.update(IpReputationTable.requestCount, IpReputationTable.requestCount + requests)
                        it.update(IpReputationTable.errorCount, IpReputationTable.errorCount + errors)
                        it[lastActivity] = now
                    }
                }
                
                // If no row updated, it means IP does not exist, insert it
                if (rowsUpdated == 0) {
                    try {
                        // Resolve IP info (might slow down batch, ideally should be cached or resolved outside)
                        // For stats update, we can skip detailed lookup if not critical, or do a quick lookup
                        // Using IpLookupService might be too slow for batch if not cached. 
                        // But we want to have basic entries.
                        // Let's do a quick lookup or just insert basic
                        
                        // We will rely on recordActivity or subsequent calls to fill details. 
                        // Just insert basic stats.
                        IpReputationTable.insert {
                            it[ip] = ipAddress
                            it[firstObserved] = now
                            it[lastActivity] = now
                            it[requestCount] = requests
                            it[errorCount] = errors
                            it[blockedTimes] = 0
                            it[flaggedTimes] = 0
                            it[exponentialBlockedTimes] = 0
                            it[lastJailDuration] = 0
                        }
                    } catch (e: Exception) {
                        // Race condition, try update again
                        IpReputationTable.update({ IpReputationTable.ip eq ipAddress }) {
                            with(SqlExpressionBuilder) {
                                it.update(IpReputationTable.requestCount, IpReputationTable.requestCount + requests)
                                it.update(IpReputationTable.errorCount, IpReputationTable.errorCount + errors)
                                it[lastActivity] = now
                            }
                        }
                    }
                }
            }
        }
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

    override suspend fun saveGeoInfo(
        ip: String,
        city: String?, lat: Double?, lon: Double?,
        timezone: String?, zip: String?,
        region: String?, regionName: String?,
        asName: String?,
        countryCode: String?, isp: String?
    ) {
        val now = LocalDateTime.now()
        dbQuery {
            val updated = IpReputationTable.update({ IpReputationTable.ip eq ip }) {
                it[IpReputationTable.city]           = city
                it[IpReputationTable.lat]            = lat
                it[IpReputationTable.lon]            = lon
                it[IpReputationTable.timezone]       = timezone
                it[IpReputationTable.zip]            = zip
                it[IpReputationTable.region]         = region
                it[IpReputationTable.regionName]     = regionName
                it[IpReputationTable.asName]         = asName
                it[IpReputationTable.geoInfoUpdatedOn] = now
                countryCode?.let { cc -> it[country] = cc }
                isp?.let { v -> it[IpReputationTable.isp] = v }
            }
            // If IP not yet in reputation table, create a minimal entry so geo data isn't lost
            if (updated == 0 && !ip.isBlank()) {
                try {
                    IpReputationTable.insert {
                        it[IpReputationTable.ip]           = ip
                        it[firstObserved]                  = now
                        it[lastActivity]                   = now
                        it[IpReputationTable.city]         = city
                        it[IpReputationTable.lat]          = lat
                        it[IpReputationTable.lon]          = lon
                        it[IpReputationTable.timezone]     = timezone
                        it[IpReputationTable.zip]          = zip
                        it[IpReputationTable.region]       = region
                        it[IpReputationTable.regionName]   = regionName
                        it[IpReputationTable.asName]       = asName
                        it[IpReputationTable.geoInfoUpdatedOn] = now
                        countryCode?.let { cc -> it[country] = cc }
                        isp?.let { v -> it[IpReputationTable.isp] = v }
                        it[blockedTimes]                   = 0
                        it[flaggedTimes]                   = 0
                        it[exponentialBlockedTimes]        = 0
                        it[lastJailDuration]               = 0
                        it[reasons]                        = ""
                    }
                } catch (e: Exception) {
                    // Row created by concurrent request — safe to ignore
                }
            }
        }
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
            range = row[IpReputationTable.range],
            requestCount = row[IpReputationTable.requestCount],
            errorCount = row[IpReputationTable.errorCount],
            // Geo-enrichment
            city = row[IpReputationTable.city],
            lat = row[IpReputationTable.lat],
            lon = row[IpReputationTable.lon],
            timezone = row[IpReputationTable.timezone],
            zip = row[IpReputationTable.zip],
            region = row[IpReputationTable.region],
            regionName = row[IpReputationTable.regionName],
            asName = row[IpReputationTable.asName],
            geoInfoUpdatedOn = row[IpReputationTable.geoInfoUpdatedOn]?.format(DateTimeFormatter.ISO_DATE_TIME),
            lastTaggedOn = row[IpReputationTable.lastTaggedOn]?.format(DateTimeFormatter.ISO_DATE_TIME)
        )
    }
}
