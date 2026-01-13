package com.umeshsolanki.dockermanager.proxy

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.constants.FileConstants
import com.umeshsolanki.dockermanager.utils.JsonPersistence
import kotlinx.serialization.Serializable
import org.slf4j.LoggerFactory
import java.io.File
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@Serializable
data class DailyProxyStats(
    val date: String, // YYYY-MM-DD format
    val totalHits: Long,
    val hitsByStatus: Map<Int, Long> = emptyMap(),
    val hitsOverTime: Map<String, Long> = emptyMap(),
    val topPaths: List<PathHit> = emptyList(),
    val hitsByDomain: Map<String, Long> = emptyMap(),
    val topIps: List<GenericHitEntry> = emptyList(),
    val topIpsWithErrors: List<GenericHitEntry> = emptyList(),
    val topUserAgents: List<GenericHitEntry> = emptyList(),
    val topReferers: List<GenericHitEntry> = emptyList(),
    val topMethods: List<GenericHitEntry> = emptyList(),
    val websocketConnections: Long = 0,
    val websocketConnectionsByEndpoint: Map<String, Long> = emptyMap(),
    val websocketConnectionsByIp: Map<String, Long> = emptyMap()
)


class AnalyticsPersistenceService {
    private val logger = LoggerFactory.getLogger(AnalyticsPersistenceService::class.java)
    private val analyticsDir = File(AppConfig.projectRoot, "analytics").apply {
        if (!exists()) mkdirs()
    }
    private val dateFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")

    /**
     * Save stats for a specific date (defaults to today)
     */
    fun saveDailyStats(stats: ProxyStats, date: String? = null): Boolean {
        return try {
            val targetDate = date ?: LocalDate.now().format(dateFormatter)
            val file = File(analyticsDir, "stats-$targetDate.json")
            val dailyStats = DailyProxyStats(
                date = targetDate,
                totalHits = stats.totalHits,
                hitsByStatus = stats.hitsByStatus,
                hitsOverTime = stats.hitsOverTime,
                topPaths = stats.topPaths,
                hitsByDomain = stats.hitsByDomain,
                topIps = stats.topIps.map { GenericHitEntry(it.label, it.count) },
                topIpsWithErrors = stats.topIpsWithErrors.map { GenericHitEntry(it.label, it.count) },
                topUserAgents = stats.topUserAgents.map { GenericHitEntry(it.label, it.count) },
                topReferers = stats.topReferers.map { GenericHitEntry(it.label, it.count) },
                topMethods = stats.topMethods.map { GenericHitEntry(it.label, it.count) },
                websocketConnections = stats.websocketConnections,
                websocketConnectionsByEndpoint = stats.websocketConnectionsByEndpoint,
                websocketConnectionsByIp = stats.websocketConnectionsByIp
            )
            
            val persistence = JsonPersistence.create<DailyProxyStats>(
                file = file,
                defaultContent = dailyStats,
                loggerName = AnalyticsPersistenceService::class.java.name
            )
            persistence.save(dailyStats)
            logger.info("Saved daily analytics stats for $targetDate")
            true
        } catch (e: Exception) {
            logger.error("Failed to save daily analytics stats", e)
            false
        }
    }

    /**
     * Load stats for a specific date
     */
    fun loadDailyStats(date: String): DailyProxyStats? {
        return try {
            val file = File(analyticsDir, "stats-$date.json")
            if (!file.exists()) return null
            
            val persistence = JsonPersistence.create<DailyProxyStats>(
                file = file,
                defaultContent = DailyProxyStats(date = date, totalHits = 0),
                loggerName = AnalyticsPersistenceService::class.java.name
            )
            persistence.load()
        } catch (e: Exception) {
            logger.error("Failed to load daily analytics stats for $date", e)
            null
        }
    }

    /**
     * Get all available dates with saved stats
     */
    fun listAvailableDates(): List<String> {
        return try {
            analyticsDir.listFiles()
                ?.filter { it.name.startsWith("stats-") && it.name.endsWith(".json") }
                ?.map { it.name.removePrefix("stats-").removeSuffix(".json") }
                ?.sorted()
                ?.reversed() // Most recent first
                ?: emptyList()
        } catch (e: Exception) {
            logger.error("Failed to list available dates", e)
            emptyList()
        }
    }

    /**
     * Get stats for a date range
     */
    fun getStatsForDateRange(startDate: String, endDate: String): List<DailyProxyStats> {
        return try {
            val start = LocalDate.parse(startDate, dateFormatter)
            val end = LocalDate.parse(endDate, dateFormatter)
            val dates = generateSequence(start) { it.plusDays(1) }
                .takeWhile { !it.isAfter(end) }
                .map { it.format(dateFormatter) }
                .toList()
            
            dates.mapNotNull { date -> loadDailyStats(date) }
        } catch (e: Exception) {
            logger.error("Failed to get stats for date range $startDate to $endDate", e)
            emptyList()
        }
    }
}

