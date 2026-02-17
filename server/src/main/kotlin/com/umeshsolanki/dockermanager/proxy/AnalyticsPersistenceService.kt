package com.umeshsolanki.dockermanager.proxy
import com.umeshsolanki.dockermanager.analytics.ClickHouseService

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.database.ProxyLogsTable
import com.umeshsolanki.dockermanager.utils.JsonPersistence
import kotlinx.serialization.Serializable
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.javatime.date
import org.jetbrains.exposed.sql.transactions.transaction
import org.slf4j.LoggerFactory
import java.io.File
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter

@Serializable
data class DailyProxyStats(
    val date: String, // YYYY-MM-DD format
    val totalHits: Long,
    val securityHits: Long = 0,
    val hitsByStatus: Map<Int, Long> = emptyMap(),
    val hitsOverTime: Map<String, Long> = emptyMap(),
    val topPaths: List<PathHit> = emptyList(),
    val hitsByDomain: Map<String, Long> = emptyMap(),
    val hitsByDomainErrors: Map<String, Long> = emptyMap(),
    val topIps: List<GenericHitEntry> = emptyList(),
    val topIpsWithErrors: List<GenericHitEntry> = emptyList(),
    val topUserAgents: List<GenericHitEntry> = emptyList(),
    val topReferers: List<GenericHitEntry> = emptyList(),
    val topMethods: List<GenericHitEntry> = emptyList(),
    val hitsByCountry: Map<String, Long> = emptyMap(),
    val hitsByProvider: Map<String, Long> = emptyMap(),
    val websocketConnections: Long = 0,
    val websocketConnectionsByEndpoint: Map<String, Long> = emptyMap(),
    val websocketConnectionsByIp: Map<String, Long> = emptyMap(),
    val hostwiseStats: Map<String, DetailedHostStats> = emptyMap()
)

class AnalyticsPersistenceService {
    private val logger = LoggerFactory.getLogger(AnalyticsPersistenceService::class.java)
    private val analyticsDir = File(AppConfig.nginxLogDir, "analytics").apply {
        if (!exists()) mkdirs()
    }
    private val dateFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")

    /**
     * Save stats for a specific date. 
     * In DB mode, logs are already inserted, so we don't need to do anything special here 
     * except maybe keeping the file backup if desired.
     */
    fun saveDailyStats(stats: ProxyStats, date: String? = null): Boolean {
        try {
            val targetDate = date ?: LocalDate.now().format(dateFormatter)
            
            // For File fallback users
            val dailyStats = DailyProxyStats(
                date = targetDate,
                totalHits = stats.totalHits,
                securityHits = stats.securityHits,
                hitsByStatus = stats.hitsByStatus,
                hitsOverTime = stats.hitsOverTime,
                topPaths = stats.topPaths,
                hitsByDomain = stats.hitsByDomain,
                hitsByDomainErrors = stats.hitsByDomainErrors,
                topIps = stats.topIps,
                topIpsWithErrors = stats.topIpsWithErrors,
                topUserAgents = stats.topUserAgents,
                topReferers = stats.topReferers,
                topMethods = stats.topMethods,
                hitsByCountry = emptyMap(), // This is tricky as ProxyStats doesn't have it yet, 
                hitsByProvider = emptyMap(), // but saveDailyStats is mostly for daily rotation/backup
                websocketConnections = stats.websocketConnections,
                websocketConnectionsByEndpoint = stats.websocketConnectionsByEndpoint,
                websocketConnectionsByIp = stats.websocketConnectionsByIp
            )

            val file = File(analyticsDir, "stats-$targetDate.json")
            val persistence = JsonPersistence.create<DailyProxyStats>(
                file = file,
                defaultContent = dailyStats,
                loggerName = AnalyticsPersistenceService::class.java.name
            )
            persistence.save(dailyStats)
            logger.debug("Daily stats backup for $targetDate saved to file")
            
            return true
        } catch (e: Exception) {
            logger.error("Failed to save daily analytics stats", e)
            return false
        }
    }

    fun loadDailyStats(date: String): DailyProxyStats? {
        if (AppConfig.settings.clickhouseSettings.enabled) {
            loadDailyStatsFromClickHouse(date)?.let { return it }
        }

        if (AppConfig.storageBackend == "database") {
            try {
                return transaction {
                    val targetDate = LocalDate.parse(date, dateFormatter)
                    val start = targetDate.atStartOfDay()
                    val end = targetDate.plusDays(1).atStartOfDay()

                    val totalHits = ProxyLogsTable.selectAll()
                        .where { (ProxyLogsTable.timestamp greaterEq start) and (ProxyLogsTable.timestamp less end) }
                        .count()

                    if (totalHits == 0L) return@transaction null

                    val hitsByStatus = ProxyLogsTable.select(ProxyLogsTable.status, ProxyLogsTable.status.count())
                        .where { (ProxyLogsTable.timestamp greaterEq start) and (ProxyLogsTable.timestamp less end) }
                        .groupBy(ProxyLogsTable.status)
                        .associate { it[ProxyLogsTable.status] to it[ProxyLogsTable.status.count()] }

                    val topPaths = ProxyLogsTable.select(ProxyLogsTable.path, ProxyLogsTable.path.count())
                        .where { (ProxyLogsTable.timestamp greaterEq start) and (ProxyLogsTable.timestamp less end) }
                        .groupBy(ProxyLogsTable.path)
                        .orderBy(ProxyLogsTable.path.count(), SortOrder.DESC)
                        .limit(20)
                        .map { PathHit(it[ProxyLogsTable.path], it[ProxyLogsTable.path.count()]) }

                    val hitsByDomain = ProxyLogsTable.select(ProxyLogsTable.domain, ProxyLogsTable.domain.count())
                        .where { (ProxyLogsTable.timestamp greaterEq start) and (ProxyLogsTable.timestamp less end) }
                        .groupBy(ProxyLogsTable.domain)
                        .mapNotNull { 
                            val domain = it[ProxyLogsTable.domain] ?: return@mapNotNull null
                            domain to it[ProxyLogsTable.domain.count()] 
                        }
                        .toMap()

                    val hitsByDomainErrors = ProxyLogsTable.select(ProxyLogsTable.domain, ProxyLogsTable.domain.count())
                        .where { (ProxyLogsTable.timestamp greaterEq start) and (ProxyLogsTable.timestamp less end) and (ProxyLogsTable.status greaterEq 400) }
                        .groupBy(ProxyLogsTable.domain)
                        .mapNotNull { 
                            val domain = it[ProxyLogsTable.domain] ?: return@mapNotNull null
                            domain to it[ProxyLogsTable.domain.count()] 
                        }
                        .toMap()

                    val topIps = ProxyLogsTable.select(ProxyLogsTable.remoteIp, ProxyLogsTable.remoteIp.count())
                        .where { (ProxyLogsTable.timestamp greaterEq start) and (ProxyLogsTable.timestamp less end) }
                        .groupBy(ProxyLogsTable.remoteIp)
                        .orderBy(ProxyLogsTable.remoteIp.count(), SortOrder.DESC)
                        .limit(20)
                        .map { GenericHitEntry(it[ProxyLogsTable.remoteIp], it[ProxyLogsTable.remoteIp.count()]) }

                    val topMethods = ProxyLogsTable.select(ProxyLogsTable.method, ProxyLogsTable.method.count())
                        .where { (ProxyLogsTable.timestamp greaterEq start) and (ProxyLogsTable.timestamp less end) }
                        .groupBy(ProxyLogsTable.method)
                        .map { GenericHitEntry(it[ProxyLogsTable.method], it[ProxyLogsTable.method.count()]) }

                    val topUserAgents = ProxyLogsTable.select(ProxyLogsTable.userAgent, ProxyLogsTable.userAgent.count())
                        .where { (ProxyLogsTable.timestamp greaterEq start) and (ProxyLogsTable.timestamp less end) }
                        .groupBy(ProxyLogsTable.userAgent)
                        .orderBy(ProxyLogsTable.userAgent.count(), SortOrder.DESC)
                        .limit(10)
                        .mapNotNull { 
                            val ua = it[ProxyLogsTable.userAgent] ?: return@mapNotNull null
                            GenericHitEntry(ua, it[ProxyLogsTable.userAgent.count()]) 
                        }

                    val hitsByCountry = ProxyLogsTable.select(ProxyLogsTable.countryCode, ProxyLogsTable.countryCode.count())
                        .where { (ProxyLogsTable.timestamp greaterEq start) and (ProxyLogsTable.timestamp less end) }
                        .groupBy(ProxyLogsTable.countryCode)
                        .associate { (it[ProxyLogsTable.countryCode] ?: "Unknown") to it[ProxyLogsTable.countryCode.count()] }

                    val hitsByProvider = ProxyLogsTable.select(ProxyLogsTable.provider, ProxyLogsTable.provider.count())
                        .where { (ProxyLogsTable.timestamp greaterEq start) and (ProxyLogsTable.timestamp less end) }
                        .groupBy(ProxyLogsTable.provider)
                        .associate { (it[ProxyLogsTable.provider] ?: "Unknown") to it[ProxyLogsTable.provider.count()] }

                    // For hitsOverTime, we'd ideally use SQL HOUR() function, but Exposed support varies.
                    // Doing a simple aggregation for now.
                    val hitsOverTime = mutableMapOf<String, Long>()
                    for (hour in 0..23) {
                        val hStart = start.with(LocalTime.of(hour, 0))
                        val hEnd = hStart.plusHours(1)
                        val hCount = ProxyLogsTable.selectAll()
                            .where { (ProxyLogsTable.timestamp greaterEq hStart) and (ProxyLogsTable.timestamp less hEnd) }
                            .count()
                        if (hCount > 0) {
                            hitsOverTime["%02d:00".format(hour)] = hCount
                        }
                    }

                    DailyProxyStats(
                        date = date,
                        totalHits = totalHits,
                        hitsByStatus = hitsByStatus,
                        hitsOverTime = hitsOverTime,
                        topPaths = topPaths,
                        hitsByDomain = hitsByDomain,
                        hitsByDomainErrors = hitsByDomainErrors,
                        topIps = topIps,
                        topMethods = topMethods,
                        topUserAgents = topUserAgents,
                        hitsByCountry = hitsByCountry,
                        hitsByProvider = hitsByProvider
                    )
                }
            } catch (e: Exception) {
                logger.error("Failed to query daily stats from Database for $date", e)
            }
        }

        // Fallback to file load
        return try {
            val file = File(analyticsDir, "stats-$date.json")
            if (!file.exists()) return null
            JsonPersistence.create<DailyProxyStats>(file, DailyProxyStats(date, 0)).load()
        } catch (e: Exception) {
            logger.error("Failed to load daily analytics stats for $date from file", e)
            null
        }
    }

    private fun loadDailyStatsFromClickHouse(date: String): DailyProxyStats? {
        try {
            val totalHits = ClickHouseService.query("SELECT count() FROM proxy_logs WHERE toDate(timestamp) = '$date'") { it.getLong(1) }.firstOrNull() ?: 0L
            if (totalHits == 0L) return null

            val hitsByStatus = ClickHouseService.queryMap("SELECT toString(status), count() FROM proxy_logs WHERE toDate(timestamp) = '$date' GROUP BY status")
            val hitsByStatusInt = hitsByStatus.mapKeys { it.key.toIntOrNull() ?: 0 }
            
            val hitsOverTime = ClickHouseService.queryMap("SELECT formatDateTime(timestamp, '%H:00'), count() FROM proxy_logs WHERE toDate(timestamp) = '$date' GROUP BY toHour(timestamp) ORDER BY toHour(timestamp)")
            
            val topPaths = ClickHouseService.query("SELECT path, count() as c FROM proxy_logs WHERE toDate(timestamp) = '$date' GROUP BY path ORDER BY c DESC LIMIT 20") {
                PathHit(it.getString(1), it.getLong(2))
            }

            val topIps = ClickHouseService.query("SELECT ip, count() as c FROM proxy_logs WHERE toDate(timestamp) = '$date' GROUP BY ip ORDER BY c DESC LIMIT 20") {
                GenericHitEntry(it.getString(1), it.getLong(2))
            }

            val topMethods = ClickHouseService.query("SELECT method, count() as c FROM proxy_logs WHERE toDate(timestamp) = '$date' GROUP BY method ORDER BY c DESC") {
                GenericHitEntry(it.getString(1), it.getLong(2))
            }

            val hitsByDomain = ClickHouseService.queryMap("SELECT domain, count() FROM proxy_logs WHERE toDate(timestamp) = '$date' GROUP BY domain")
            val hitsByDomainErrors = ClickHouseService.queryMap("SELECT domain, count() FROM proxy_logs WHERE toDate(timestamp) = '$date' AND status >= 400 GROUP BY domain")
            
            val hitsByCountry = ClickHouseService.queryMap("SELECT country_code, count() FROM proxy_logs WHERE toDate(timestamp) = '$date' GROUP BY country_code")
            val hitsByProvider = ClickHouseService.queryMap("SELECT provider, count() FROM proxy_logs WHERE toDate(timestamp) = '$date' GROUP BY provider")

            // Hostwise stats for ClickHouse
            val domains = hitsByDomain.keys
            val hostwiseStats = domains.associateWith { domain ->
                val hTotal = hitsByDomain[domain] ?: 0L
                val hStatus = ClickHouseService.queryMap("SELECT toString(status), count() FROM proxy_logs WHERE toDate(timestamp) = '$date' AND domain = '$domain' GROUP BY status").mapKeys { it.key.toIntOrNull() ?: 0 }
                val hPaths = ClickHouseService.query("SELECT path, count() as c FROM proxy_logs WHERE toDate(timestamp) = '$date' AND domain = '$domain' GROUP BY path ORDER BY c DESC LIMIT 10") {
                    PathHit(it.getString(1), it.getLong(2))
                }
                val hIps = ClickHouseService.query("SELECT ip, count() as c FROM proxy_logs WHERE toDate(timestamp) = '$date' AND domain = '$domain' GROUP BY ip ORDER BY c DESC LIMIT 10") {
                    GenericHitEntry(it.getString(1), it.getLong(2))
                }
                val hMethods = ClickHouseService.query("SELECT method, count() as c FROM proxy_logs WHERE toDate(timestamp) = '$date' AND domain = '$domain' GROUP BY method ORDER BY c DESC LIMIT 10") {
                    GenericHitEntry(it.getString(1), it.getLong(2))
                }
                
                DetailedHostStats(
                    totalHits = hTotal,
                    hitsByStatus = hStatus,
                    topPaths = hPaths,
                    topIps = hIps,
                    topMethods = hMethods
                )
            }

            return DailyProxyStats(
                date = date,
                totalHits = totalHits,
                hitsByStatus = hitsByStatusInt,
                hitsOverTime = hitsOverTime,
                topPaths = topPaths,
                hitsByDomain = hitsByDomain,
                hitsByDomainErrors = hitsByDomainErrors,
                topIps = topIps,
                topMethods = topMethods,
                hitsByCountry = hitsByCountry,
                hitsByProvider = hitsByProvider,
                hostwiseStats = hostwiseStats
            )

        } catch (e: Exception) {
            logger.error("ClickHouse query failed for date $date", e)
            return null
        }
    }

    /**
     * Get all available dates with saved stats
     */
    fun listAvailableDates(): List<String> {
        val datesList = mutableSetOf<String>()

        if (AppConfig.settings.clickhouseSettings.enabled) {
            try {
                ClickHouseService.query("SELECT DISTINCT toDate(timestamp) FROM proxy_logs ORDER BY toDate(timestamp) DESC") {
                    it.getString(1)
                }.forEach { datesList.add(it) }
            } catch (e: Exception) {
                logger.warn("ClickHouse list dates failed: ${e.message}")
            }
        }

        if (AppConfig.storageBackend == "database") {
            try {
                transaction {
                    // Extract unique dates from timestamp column
                    ProxyLogsTable.select(ProxyLogsTable.timestamp.date().alias("log_date"))
                        .groupBy(ProxyLogsTable.timestamp.date())
                        .orderBy(ProxyLogsTable.timestamp.date(), SortOrder.DESC)
                        .forEach {
                            datesList.add(it[ProxyLogsTable.timestamp.date().alias("log_date")].toString())
                        }
                }
            } catch (e: Exception) {
                logger.warn("Failed to list dates from DB: ${e.message}")
            }
        }

        // Also check files for legacy data
        try {
            analyticsDir.listFiles()
                ?.filter { it.name.startsWith("stats-") && it.name.endsWith(".json") }
                ?.map { it.name.removePrefix("stats-").removeSuffix(".json") }
                ?.forEach { datesList.add(it) }
        } catch (e: Exception) {
            logger.error("Failed to list dates from file system", e)
        }

        return datesList.sortedDescending()
    }

    /**
     * Get stats for a date range
     */
    fun getStatsForDateRange(startDate: String, endDate: String): List<DailyProxyStats> {
        try {
            val start = LocalDate.parse(startDate, dateFormatter)
            val end = LocalDate.parse(endDate, dateFormatter)
            val dates = generateSequence(start) { it.plusDays(1) }
                .takeWhile { !it.isAfter(end) }
                .map { it.format(dateFormatter) }
                .toList()
            
            return dates.mapNotNull { date -> loadDailyStats(date) }
        } catch (e: Exception) {
            logger.error("Failed to get stats for date range $startDate to $endDate", e)
            return emptyList()
        }
    }
}

