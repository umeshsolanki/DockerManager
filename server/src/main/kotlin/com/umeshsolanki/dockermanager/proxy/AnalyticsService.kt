package com.umeshsolanki.dockermanager.proxy

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.ServiceContainer
import com.umeshsolanki.dockermanager.cache.CacheService
import com.umeshsolanki.dockermanager.jail.IJailManagerService
import com.umeshsolanki.dockermanager.utils.CommandExecutor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.slf4j.LoggerFactory
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedDeque

interface IAnalyticsService {
    fun getStats(): ProxyStats
    fun getHistoricalStats(date: String): DailyProxyStats?
    fun listAvailableDates(): List<String>
    fun getStatsForDateRange(startDate: String, endDate: String): List<DailyProxyStats>
    fun forceReprocessLogs(date: String): DailyProxyStats?
    fun updateStatsForAllDaysInCurrentLog(): Map<String, Boolean>
    fun updateStatsSettings(active: Boolean, intervalMs: Long, filterLocalIps: Boolean? = null)
}

class AnalyticsServiceImpl(
    private val jailManagerService: IJailManagerService,
) : IAnalyticsService {
    private val logger = LoggerFactory.getLogger(AnalyticsServiceImpl::class.java)
    private val logFile = AppConfig.proxyLogFile
    private val analyticsPersistence = AnalyticsPersistenceService()
    private val commandExecutor = CommandExecutor(loggerName = AnalyticsServiceImpl::class.java.name)

    private var cachedStats: ProxyStats = ProxyStats(
        totalHits = 0,
        hitsByStatus = emptyMap(),
        hitsOverTime = emptyMap(),
        topPaths = emptyList(),
        recentHits = emptyList()
    )

    // Incremental state
    private var lastProcessedOffset = 0L
    private val totalHitsCounter = java.util.concurrent.atomic.AtomicLong(0)
    private val hitsByStatusMap = ConcurrentHashMap<Int, Long>()
    private val hitsByDomainMap = ConcurrentHashMap<String, Long>()
    private val hitsByPathMap = ConcurrentHashMap<String, Long>()
    private val hitsByIpMap = ConcurrentHashMap<String, Long>()
    private val hitsByIpErrorMap = ConcurrentHashMap<String, Long>()
    private val hitsByMethodMap = ConcurrentHashMap<String, Long>()
    private val hitsByRefererMap = ConcurrentHashMap<String, Long>()
    private val hitsByUserAgentMap = ConcurrentHashMap<String, Long>()
    private val hitsByTimeMap = ConcurrentHashMap<String, Long>()
    private val recentHitsList = ConcurrentLinkedDeque<ProxyHit>()
    private val MAX_RECENT_HITS = 100
    
    // WebSocket tracking
    private val websocketConnectionsCounter = java.util.concurrent.atomic.AtomicLong(0)
    private val websocketConnectionsByEndpointMap = ConcurrentHashMap<String, Long>()
    private val websocketConnectionsByIpMap = ConcurrentHashMap<String, Long>()
    private val recentWebSocketConnectionsList = ConcurrentLinkedDeque<WebSocketConnection>()
    private val MAX_RECENT_WEBSOCKET_CONNECTIONS = 50

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var lastResetDate: String? = null
    private var lastRotationDate: String? = null // Track when we last rotated logs

    // Cache key prefix for historical stats
    private val CACHE_KEY_PREFIX = "proxy:historical:stats:"

    init {
        // Ensure log directory exists for Nginx
        logFile.parentFile?.mkdirs()

        // Start background worker for stats
        startStatsWorker()

        // Start daily reset worker
        startDailyResetWorker()
    }

    private fun startStatsWorker() {
        scope.launch {
            while (isActive) {
                try {
                    val settings = AppConfig.proxyStatsSettings
                    if (settings.proxyStatsActive) {
                        updateStatsNatively()
                    }
                    delay(settings.proxyStatsIntervalMs)
                } catch (e: Exception) {
                    logger.error("Error updating stats", e)
                    delay(60000) // Fallback delay on error
                }
            }
        }
    }

    private fun startDailyResetWorker() {
        scope.launch {
            while (isActive) {
                try {
                    val today = java.time.LocalDate.now()
                        .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"))

                    // Check if we need to reset (new day)
                    if (lastResetDate != null && lastResetDate != today) {
                        // Only rotate logs once per day - check if we've already rotated for yesterday
                        if (lastRotationDate != lastResetDate) {
                            // Save yesterday's stats before resetting
                            val yesterdayStats = cachedStats
                            analyticsPersistence.saveDailyStats(yesterdayStats, lastResetDate)
                            logger.info("Saved daily stats for $lastResetDate")

                            // Rotate log file: copy access.log to access_YYYY-MM-DD.log and truncate
                            // Only rotate if log file has substantial content (at least 1KB to avoid rotating empty files)
                            if (logFile.exists() && logFile.length() > 1024) {
                                rotateAccessLog(lastResetDate!!)
                                lastRotationDate = lastResetDate
                            } else {
                                logger.info("Skipping log rotation for $lastResetDate - log file is too small or doesn't exist")
                            }
                        } else {
                            logger.debug("Log rotation already completed for $lastResetDate, skipping")
                        }

                        // Reset counters
                        resetDailyStats()
                        logger.info("Reset daily stats for $today")
                    }

                    // Initialize lastResetDate if not set
                    if (lastResetDate == null) {
                        lastResetDate = today
                    }

                    // If date is today, persist current stats (update existing stats file)
                    if (lastResetDate == today) {
                        val currentStats = cachedStats
                        analyticsPersistence.saveDailyStats(currentStats, today)
                        logger.debug("Updated daily stats for $today")
                    }

                    // Check every hour
                    delay(3600000) // 1 hour
                } catch (e: Exception) {
                    logger.error("Error in daily reset worker", e)
                    delay(3600000) // Fallback delay
                }
            }
        }
    }

    /**
     * Rotate access.log by copying it to access_YYYY-MM-DD.log and truncating the original
     * Only rotates if the log file has substantial content to prevent accidental data loss
     */
    private fun rotateAccessLog(date: String) {
        try {
            if (!logFile.exists()) {
                logger.debug("Access log file does not exist, skipping rotation")
                return
            }

            val currentSize = logFile.length()
            if (currentSize == 0L) {
                logger.debug("Access log file is empty, skipping rotation")
                return
            }

            // Additional safety check: don't rotate if file is suspiciously small (might have been recently rotated)
            // Only rotate if file is at least 10KB to avoid rotating files that were just created
            if (currentSize < 10240) {
                logger.warn("Access log file is too small (${currentSize} bytes), skipping rotation to prevent data loss. File may have been recently rotated.")
                return
            }

            val logDir = logFile.parentFile
            val rotatedLogFile = File(logDir, "access_$date.log")

            // Check if rotated file already exists and is larger - don't overwrite with smaller file
            if (rotatedLogFile.exists() && rotatedLogFile.length() > currentSize) {
                logger.warn("Rotated log file ${rotatedLogFile.name} already exists and is larger (${rotatedLogFile.length()} > $currentSize bytes). Skipping rotation to prevent data loss.")
                return
            }

            // Copy access.log to access_YYYY-MM-DD.log
            logFile.copyTo(rotatedLogFile, overwrite = true)
            logger.info("Copied access.log (${currentSize} bytes) to ${rotatedLogFile.name}")

            // Verify copy was successful before truncating
            if (rotatedLogFile.exists() && rotatedLogFile.length() == currentSize) {
                // Truncate access.log only after successful copy
                logFile.writeText("")
                logger.info("Truncated access.log after successful rotation")

                // Reset lastProcessedOffset since we've rotated the log
                lastProcessedOffset = 0L
            } else {
                logger.error("Rotated log file size mismatch! Expected ${currentSize} bytes but got ${rotatedLogFile.length()} bytes. Aborting truncation to prevent data loss.")
            }

        } catch (e: Exception) {
            logger.error("Failed to rotate access log for date $date", e)
        }
    }

    private fun resetDailyStats() {
        totalHitsCounter.set(0)
        hitsByStatusMap.clear()
        hitsByDomainMap.clear()
        hitsByPathMap.clear()
        hitsByIpMap.clear()
        hitsByIpErrorMap.clear()
        hitsByMethodMap.clear()
        hitsByRefererMap.clear()
        hitsByUserAgentMap.clear()
        hitsByTimeMap.clear()
        recentHitsList.clear()
        lastProcessedOffset = 0L
        
        // Reset WebSocket stats
        websocketConnectionsCounter.set(0)
        websocketConnectionsByEndpointMap.clear()
        websocketConnectionsByIpMap.clear()
        recentWebSocketConnectionsList.clear()

        cachedStats = ProxyStats(
            totalHits = 0,
            hitsByStatus = emptyMap(),
            hitsOverTime = emptyMap(),
            topPaths = emptyList(),
            recentHits = emptyList(),
            hitsByDomain = emptyMap(),
            topIps = emptyList(),
            topIpsWithErrors = emptyList(),
            topUserAgents = emptyList(),
            topReferers = emptyList(),
            topMethods = emptyList(),
            websocketConnections = 0,
            websocketConnectionsByEndpoint = emptyMap(),
            websocketConnectionsByIp = emptyMap(),
            recentWebSocketConnections = emptyList()
        )
    }

    private fun updateStatsNatively() {
        if (!logFile.exists()) return

        val currentLength = logFile.length()

        // Handle log rotation or truncated file
        // Only reset if the file was significantly reduced (more than 50% smaller)
        // This prevents false positives from minor file changes or external processes
        if (currentLength < lastProcessedOffset && lastProcessedOffset > 0) {
            val reductionPercent =
                ((lastProcessedOffset - currentLength).toDouble() / lastProcessedOffset.toDouble()) * 100
            if (reductionPercent > 50) {
                logger.info("Log file rotated or truncated (was ${lastProcessedOffset} bytes, now ${currentLength} bytes, ${reductionPercent.toInt()}% reduction), resetting offset")
                lastProcessedOffset = 0
            } else {
                // File got smaller but not significantly - might be external truncation or write issue
                logger.warn("Log file size decreased unexpectedly (was ${lastProcessedOffset} bytes, now ${currentLength} bytes, ${reductionPercent.toInt()}% reduction). Adjusting offset instead of resetting.")
                lastProcessedOffset =
                    currentLength // Adjust offset instead of resetting to avoid reprocessing
            }
        }

        if (currentLength == lastProcessedOffset) return

        val lineRegex =
            """^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d+) (\d+) "([^"]*)" "([^"]*)" "([^"]*)".*$""".toRegex()
        val dateFormat = SimpleDateFormat("dd/MMM/yyyy:HH:mm:ss Z", Locale.US)

        // Get settings once per update cycle
        val settings = AppConfig.proxyStatsSettings
        val shouldFilterLocalIps = settings.filterLocalIps

        try {
            java.io.RandomAccessFile(logFile, "r").use { raf ->
                raf.seek(lastProcessedOffset)
                var line: String? = raf.readLine()
                while (line != null) {
                    val trimmedLine = line.trim()
                    if (trimmedLine.isNotEmpty()) {
                        lineRegex.find(trimmedLine)?.let { match ->
                            val (ip, dateStr, fullRequest, statusStr, _, referer, ua, _) = match.destructured
                            val status = statusStr.toIntOrNull() ?: 0

                            // Filter local IPs if enabled
                            if (shouldFilterLocalIps && IpFilterUtils.isLocalIp(ip)) {
                                // Skip this entry - it's a local IP
                                return@let
                            }

                            val reqParts = fullRequest.split(" ")
                            val method = reqParts.getOrNull(0) ?: "-"
                            val path = reqParts.getOrNull(1) ?: fullRequest
                            val domain = if (referer != "-") try {
                                java.net.URI(referer).host
                            } catch (e: Exception) {
                                null
                            } else null

                            // Update stats
                            totalHitsCounter.incrementAndGet()
                            hitsByStatusMap.merge(status, 1L, Long::plus)
                            hitsByIpMap.merge(ip, 1L, Long::plus)
                            hitsByMethodMap.merge(method, 1L, Long::plus)
                            hitsByPathMap.merge(path, 1L, Long::plus)
                            if (ua != "-") hitsByUserAgentMap.merge(ua, 1L, Long::plus)
                            if (referer != "-") hitsByRefererMap.merge(referer, 1L, Long::plus)
                            if (domain != null) hitsByDomainMap.merge(domain, 1L, Long::plus)

                            if (status >= 400 || status == 0) {
                                hitsByIpErrorMap.merge(ip, 1L, Long::plus)
                            }

                            // Security Jailing check (delegated to JailManagerService)
                            val errCount = hitsByIpErrorMap[ip] ?: 0L
                            jailManagerService.checkProxySecurityViolation(
                                ip = ip,
                                userAgent = ua,
                                method = method,
                                path = path,
                                status = status,
                                errorCount = errCount,
                                referer = referer,
                                domain = domain
                            )

                            // Time-based aggregation (HH:00)
                            try {
                                val timestamp = dateFormat.parse(dateStr)
                                val hourKey = SimpleDateFormat("HH:00", Locale.US).format(timestamp)
                                hitsByTimeMap.merge(hourKey, 1L, Long::plus)

                                // Update recent hits
                                val hit = ProxyHit(
                                    timestamp = timestamp.time,
                                    ip = ip,
                                    method = method,
                                    path = path,
                                    status = status,
                                    responseTime = 0,
                                    userAgent = ua,
                                    referer = if (referer == "-") null else referer,
                                    domain = domain
                                )
                                recentHitsList.addFirst(hit)
                                while (recentHitsList.size > MAX_RECENT_HITS) {
                                    recentHitsList.removeLast()
                                }
                            } catch (e: Exception) {
                                // Ignore date parse errors
                            }
                        }
                    }
                    line = raf.readLine()
                }
                lastProcessedOffset = raf.filePointer
            }
        } catch (e: Exception) {
            logger.error("Error processing log file incrementally", e)
        }

        // Update cached stats for UI
        updateCachedStats()
    }
    
    private fun updateCachedStats() {
        cachedStats = ProxyStats(
            totalHits = totalHitsCounter.get(),
            hitsByStatus = hitsByStatusMap.toMap(),
            hitsOverTime = hitsByTimeMap.toSortedMap(),
            topPaths = hitsByPathMap.entries.sortedByDescending { it.value }
                .map { PathHit(it.key, it.value) },
            recentHits = recentHitsList.toList(),
            hitsByDomain = hitsByDomainMap.toMap(),
            topIps = hitsByIpMap.entries.sortedByDescending { it.value }
                .map { GenericHitEntry(it.key, it.value) },
            topIpsWithErrors = hitsByIpErrorMap.entries.sortedByDescending { it.value }
                .map { GenericHitEntry(it.key, it.value) },
            topUserAgents = hitsByUserAgentMap.entries.sortedByDescending { it.value }
                .map { GenericHitEntry(it.key, it.value) },
            topReferers = hitsByRefererMap.entries.sortedByDescending { it.value }
                .map { GenericHitEntry(it.key, it.value) },
            topMethods = hitsByMethodMap.entries.sortedByDescending { it.value }
                .map { GenericHitEntry(it.key, it.value) },
            websocketConnections = websocketConnectionsCounter.get(),
            websocketConnectionsByEndpoint = websocketConnectionsByEndpointMap.toMap(),
            websocketConnectionsByIp = websocketConnectionsByIpMap.toMap(),
            recentWebSocketConnections = recentWebSocketConnectionsList.toList()
        )
    }
    
    /**
     * Track a WebSocket connection
     */
    fun trackWebSocketConnection(endpoint: String, ip: String, userAgent: String? = null, containerId: String? = null, authenticated: Boolean = true) {
        websocketConnectionsCounter.incrementAndGet()
        websocketConnectionsByEndpointMap.merge(endpoint, 1L, Long::plus)
        websocketConnectionsByIpMap.merge(ip, 1L, Long::plus)
        
        val connection = WebSocketConnection(
            timestamp = System.currentTimeMillis(),
            endpoint = endpoint,
            ip = ip,
            userAgent = userAgent,
            containerId = containerId,
            authenticated = authenticated,
            duration = null // Will be updated when connection closes
        )
        
        recentWebSocketConnectionsList.addFirst(connection)
        while (recentWebSocketConnectionsList.size > MAX_RECENT_WEBSOCKET_CONNECTIONS) {
            recentWebSocketConnectionsList.removeLast()
        }
        
        updateCachedStats()
    }
    
    /**
     * Update WebSocket connection duration when it closes
     */
    fun updateWebSocketConnectionDuration(endpoint: String, ip: String, startTime: Long) {
        val duration = System.currentTimeMillis() - startTime
        // Find and update the most recent matching connection
        recentWebSocketConnectionsList.find { 
            it.endpoint == endpoint && it.ip == ip && it.duration == null 
        }?.let { connection ->
            connection.duration = duration
        }
    }

    override fun getStats(): ProxyStats = cachedStats

    override fun getHistoricalStats(date: String): DailyProxyStats? {
        // Validate date format
        try {
            java.time.LocalDate.parse(
                date,
                java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd")
            )
        } catch (e: Exception) {
            logger.error("Invalid date format: $date", e)
            return null
        }

        val cacheKey = "$CACHE_KEY_PREFIX$date"

        // Check cache first (Redis or in-memory)
        val cachedStats = try {
            CacheService.get<DailyProxyStats>(cacheKey)
        } catch (e: Exception) {
            logger.warn("Error reading cached stats for $date", e)
            null
        }
        cachedStats?.let {
            logger.debug("Returning cached historical stats for $date")
            return it
        }

        // Try to load from saved file
        val existingStats = try {
            analyticsPersistence.loadDailyStats(date)
        } catch (e: Exception) {
            logger.error("Error loading saved stats for $date", e)
            null
        }
        if (existingStats != null) {
            // Cache it for future requests (24 hour TTL)
            try {
                CacheService.set(cacheKey, existingStats, ttlSeconds = 86400)
            } catch (e: Exception) {
                logger.warn("Error caching stats for $date", e)
            }
            logger.debug("Loaded historical stats for $date from file and cached")
            return existingStats
        }

        // If not found, process logs for that date and create stats
        logger.info("Historical stats not found for $date, processing logs...")
        val processedStats = try {
            processLogsForDate(date)
        } catch (e: Exception) {
            logger.error("Error processing logs for date $date", e)
            null
        }
        if (processedStats != null) {
            // Save the processed stats for future use
            try {
                analyticsPersistence.saveDailyStats(
                    ProxyStats(
                        totalHits = processedStats.totalHits,
                        hitsByStatus = processedStats.hitsByStatus,
                        hitsOverTime = processedStats.hitsOverTime,
                        topPaths = processedStats.topPaths,
                        recentHits = emptyList(),
                        hitsByDomain = processedStats.hitsByDomain,
                        topIps = processedStats.topIps,
                        topIpsWithErrors = processedStats.topIpsWithErrors,
                        topUserAgents = processedStats.topUserAgents,
                        topReferers = processedStats.topReferers,
                        topMethods = processedStats.topMethods
                    ), date
                )
                // Cache the processed stats (24 hour TTL)
                CacheService.set(cacheKey, processedStats, ttlSeconds = 86400)
                logger.info("Created and cached historical stats for $date from logs")
            } catch (e: Exception) {
                logger.error("Error saving processed stats for $date", e)
            }
        } else {
            logger.warn("No stats processed for date $date - log file may not exist or contain no entries for this date")
        }

        return processedStats
    }

    /**
     * Get the appropriate log file for a specific date
     * Checks rotated log files first (access_YYYY-MM-DD.log), then falls back to current access.log
     */
    private fun getLogFileForDate(targetDate: String): File? {
        val logDir = logFile.parentFile
        val rotatedLogFile = File(logDir, "access_$targetDate.log")

        // Check if rotated log file exists for this date
        if (rotatedLogFile.exists() && rotatedLogFile.length() > 0) {
            logger.info("Using rotated log file for date $targetDate: ${rotatedLogFile.name}")
            return rotatedLogFile
        }

        // Check if it's today - use current log file
        val today = java.time.LocalDate.now()
            .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"))
        if (targetDate == today && logFile.exists()) {
            logger.info("Using current log file for today's date: ${logFile.name}")
            return logFile
        }

        // Check current log file as fallback
        if (logFile.exists() && logFile.length() > 0) {
            logger.info("Using current log file as fallback for date $targetDate: ${logFile.name}")
            return logFile
        }

        logger.warn("No log file found for date $targetDate")
        return null
    }

    /**
     * Process log file for a specific date and generate stats
     */
    private fun processLogsForDate(targetDate: String): DailyProxyStats? {
        val fileToProcess = getLogFileForDate(targetDate) ?: run {
            logger.warn("Log file does not exist, cannot process historical stats for $targetDate")
            return null
        }

        val lineRegex =
            """^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d+) (\d+) "([^"]*)" "([^"]*)" "([^"]*)".*$""".toRegex()
        val dateFormat = SimpleDateFormat("dd/MMM/yyyy:HH:mm:ss Z", Locale.US)
        val targetLocalDate = try {
            java.time.LocalDate.parse(
                targetDate,
                java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd")
            )
        } catch (e: Exception) {
            logger.error("Invalid date format: $targetDate", e)
            return null
        }

        // Get settings
        val settings = AppConfig.proxyStatsSettings
        val shouldFilterLocalIps = settings.filterLocalIps

        // Temporary maps for this date's stats
        val tempTotalHits = java.util.concurrent.atomic.AtomicLong(0)
        val tempHitsByStatusMap = ConcurrentHashMap<Int, Long>()
        val tempHitsByDomainMap = ConcurrentHashMap<String, Long>()
        val tempHitsByPathMap = ConcurrentHashMap<String, Long>()
        val tempHitsByIpMap = ConcurrentHashMap<String, Long>()
        val tempHitsByIpErrorMap = ConcurrentHashMap<String, Long>()
        val tempHitsByMethodMap = ConcurrentHashMap<String, Long>()
        val tempHitsByRefererMap = ConcurrentHashMap<String, Long>()
        val tempHitsByUserAgentMap = ConcurrentHashMap<String, Long>()
        val tempHitsByTimeMap = ConcurrentHashMap<String, Long>()

        return try {
            // Read entire log file (or check rotated logs) - use BufferedReader for better UTF-8 support
            fileToProcess.bufferedReader(Charsets.UTF_8).use { reader ->
                var line: String? = reader.readLine()
                var processedCount = 0L
                var skippedCount = 0L

                while (line != null) {
                    try {
                        val trimmedLine = line.trim()
                        if (trimmedLine.isNotEmpty()) {
                            lineRegex.find(trimmedLine)?.let { match ->
                                val (ip, dateStr, fullRequest, statusStr, _, referer, ua, _) = match.destructured
                                val status = statusStr.toIntOrNull() ?: 0

                                // Parse date from log entry
                                try {
                                    val timestamp = dateFormat.parse(dateStr)
                                    val logDate = java.time.LocalDate.ofInstant(
                                        timestamp.toInstant(), java.time.ZoneId.systemDefault()
                                    )

                                    // Only process entries for the target date
                                    // Compare dates directly (ignoring time)
                                    if (!logDate.isEqual(targetLocalDate)) {
                                        skippedCount++
                                        return@let
                                    }

                                    logger.debug("Processing log entry for date $targetDate: $dateStr -> $logDate")

                                    // Filter local IPs if enabled
                                    if (shouldFilterLocalIps && IpFilterUtils.isLocalIp(ip)) {
                                        return@let
                                    }

                                    val reqParts = fullRequest.split(" ")
                                    val method = reqParts.getOrNull(0) ?: "-"
                                    val path = reqParts.getOrNull(1) ?: fullRequest
                                    val domain = if (referer != "-") try {
                                        java.net.URI(referer).host
                                    } catch (e: Exception) {
                                        null
                                    } else null

                                    // Update stats
                                    tempTotalHits.incrementAndGet()
                                    tempHitsByStatusMap.merge(status, 1L, Long::plus)
                                    tempHitsByIpMap.merge(ip, 1L, Long::plus)
                                    tempHitsByMethodMap.merge(method, 1L, Long::plus)
                                    tempHitsByPathMap.merge(path, 1L, Long::plus)
                                    if (ua != "-") tempHitsByUserAgentMap.merge(ua, 1L, Long::plus)
                                    if (referer != "-") tempHitsByRefererMap.merge(
                                        referer,
                                        1L,
                                        Long::plus
                                    )
                                    if (domain != null) tempHitsByDomainMap.merge(
                                        domain,
                                        1L,
                                        Long::plus
                                    )

                                    if (status >= 400 || status == 0) {
                                        tempHitsByIpErrorMap.merge(ip, 1L, Long::plus)
                                    }

                                    // Time-based aggregation (HH:00)
                                    val hourKey =
                                        SimpleDateFormat("HH:00", Locale.US).format(timestamp)
                                    tempHitsByTimeMap.merge(hourKey, 1L, Long::plus)

                                    processedCount++
                                } catch (e: Exception) {
                                    // Log parse errors for debugging but continue processing
                                    logger.debug("Error parsing date from log entry: $dateStr", e)
                                }
                            }
                        }
                    } catch (e: Exception) {
                        logger.debug("Error processing log line", e)
                    }
                    line = reader.readLine()
                }

                logger.info("Processed $processedCount log entries for date $targetDate (skipped $skippedCount entries from other dates)")
            }

            // Convert to DailyProxyStats
            DailyProxyStats(
                date = targetDate,
                totalHits = tempTotalHits.get(),
                hitsByStatus = tempHitsByStatusMap.toMap(),
                hitsOverTime = tempHitsByTimeMap.toSortedMap(),
                topPaths = tempHitsByPathMap.entries.sortedByDescending { it.value }
                    .map { PathHit(it.key, it.value) },
                hitsByDomain = tempHitsByDomainMap.toMap(),
                topIps = tempHitsByIpMap.entries.sortedByDescending { it.value }
                    .map { GenericHitEntry(it.key, it.value) },
                topIpsWithErrors = tempHitsByIpErrorMap.entries.sortedByDescending { it.value }
                    .map { GenericHitEntry(it.key, it.value) },
                topUserAgents = tempHitsByUserAgentMap.entries.sortedByDescending { it.value }
                    .map { GenericHitEntry(it.key, it.value) },
                topReferers = tempHitsByRefererMap.entries.sortedByDescending { it.value }
                    .map { GenericHitEntry(it.key, it.value) },
                topMethods = tempHitsByMethodMap.entries.sortedByDescending { it.value }
                    .map { GenericHitEntry(it.key, it.value) })
        } catch (e: Exception) {
            logger.error("Error processing logs for date $targetDate", e)
            null
        }
    }

    /**
     * Force reprocess logs for a specific date, even if stats already exist
     * This will regenerate stats from the log files and overwrite existing stats
     */
    override fun forceReprocessLogs(date: String): DailyProxyStats? {
        logger.info("Force reprocessing logs for date: $date")

        // Validate date format
        try {
            java.time.LocalDate.parse(
                date,
                java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd")
            )
        } catch (e: Exception) {
            logger.error("Invalid date format: $date", e)
            return null
        }

        // Process logs for the date
        val processedStats = processLogsForDate(date)

        if (processedStats != null) {
            // Save/overwrite the stats
            analyticsPersistence.saveDailyStats(
                ProxyStats(
                totalHits = processedStats.totalHits,
                hitsByStatus = processedStats.hitsByStatus,
                hitsOverTime = processedStats.hitsOverTime,
                topPaths = processedStats.topPaths,
                recentHits = emptyList(),
                hitsByDomain = processedStats.hitsByDomain,
                topIps = processedStats.topIps.map { GenericHitEntry(it.label, it.count) },
                topIpsWithErrors = processedStats.topIpsWithErrors.map {
                    GenericHitEntry(
                        it.label,
                        it.count
                    )
                },
                topUserAgents = processedStats.topUserAgents.map {
                    GenericHitEntry(
                        it.label,
                        it.count
                    )
                },
                topReferers = processedStats.topReferers.map {
                    GenericHitEntry(
                        it.label,
                        it.count
                    )
                },
                topMethods = processedStats.topMethods.map {
                    GenericHitEntry(
                        it.label,
                        it.count
                    )
                }), date)
            logger.info("Force reprocessed and saved stats for $date")
        } else {
            logger.warn("Failed to process logs for date $date")
        }

        return processedStats
    }

    /**
     * Extract all unique dates from the current access.log file (scans entire file)
     */
    private fun extractAllDatesFromCurrentLog(): Set<String> {
        if (!logFile.exists()) return emptySet()

        val dateFormat = SimpleDateFormat("dd/MMM/yyyy:HH:mm:ss Z", Locale.US)
        val dateFormatter = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd")
        val dates = mutableSetOf<String>()

        return try {
            java.io.RandomAccessFile(logFile, "r").use { raf ->
                raf.seek(0)
                var line: String? = raf.readLine()

                while (line != null) {
                    val trimmedLine = line.trim()
                    if (trimmedLine.isNotEmpty()) {
                        // Try to extract date from log line
                        val dateMatch = """\[([^\]]+)\]""".toRegex().find(trimmedLine)
                        dateMatch?.let { match ->
                            val dateStr = match.groupValues[1]
                            try {
                                val timestamp = dateFormat.parse(dateStr)
                                val logDate = java.time.LocalDate.ofInstant(
                                    timestamp.toInstant(), java.time.ZoneId.systemDefault()
                                )
                                dates.add(logDate.format(dateFormatter))
                            } catch (e: Exception) {
                                // Ignore parse errors
                            }
                        }
                    }
                    line = raf.readLine()
                }
            }
            logger.info(
                "Found ${dates.size} unique dates in current access.log: ${
                    dates.sorted().joinToString(", ")
                }"
            )
            dates
        } catch (e: Exception) {
            logger.error("Error extracting all dates from logs", e)
            emptySet()
        }
    }

    /**
     * Update stats for all days found in the current access.log file
     * Processes logs for each unique date and saves stats
     */
    override fun updateStatsForAllDaysInCurrentLog(): Map<String, Boolean> {
        logger.info("Starting to update stats for all days in current access.log")

        if (!logFile.exists() || logFile.length() == 0L) {
            logger.warn("Access log file does not exist or is empty")
            return emptyMap()
        }

        // Extract all unique dates from current log file
        val dates = extractAllDatesFromCurrentLog()

        if (dates.isEmpty()) {
            logger.warn("No dates found in current access.log")
            return emptyMap()
        }

        val results = mutableMapOf<String, Boolean>()

        // Process each date
        dates.forEach { date ->
            try {
                logger.info("Processing stats for date: $date")
                val processedStats = processLogsForDate(date)

                if (processedStats != null) {
                    // Save/update the stats
                    analyticsPersistence.saveDailyStats(
                        ProxyStats(
                        totalHits = processedStats.totalHits,
                        hitsByStatus = processedStats.hitsByStatus,
                        hitsOverTime = processedStats.hitsOverTime,
                        topPaths = processedStats.topPaths,
                        recentHits = emptyList(),
                        hitsByDomain = processedStats.hitsByDomain,
                        topIps = processedStats.topIps.map {
                            GenericHitEntry(
                                it.label,
                                it.count
                            )
                        },
                        topIpsWithErrors = processedStats.topIpsWithErrors.map {
                            GenericHitEntry(
                                it.label,
                                it.count
                            )
                        },
                        topUserAgents = processedStats.topUserAgents.map {
                            GenericHitEntry(
                                it.label,
                                it.count
                            )
                        },
                        topReferers = processedStats.topReferers.map {
                            GenericHitEntry(
                                it.label,
                                it.count
                            )
                        },
                        topMethods = processedStats.topMethods.map {
                            GenericHitEntry(
                                it.label,
                                it.count
                            )
                        }), date)
                    // Cache the processed stats (24 hour TTL)
                    val cacheKey = "$CACHE_KEY_PREFIX$date"
                    CacheService.set(cacheKey, processedStats, ttlSeconds = 86400)
                    results[date] = true
                    logger.info("Successfully updated stats for date: $date (${processedStats.totalHits} hits)")
                } else {
                    results[date] = false
                    logger.warn("Failed to process stats for date: $date")
                }
            } catch (e: Exception) {
                logger.error("Error processing stats for date: $date", e)
                results[date] = false
            }
        }

        val successCount = results.values.count { it }
        val failureCount = results.size - successCount
        logger.info("Completed updating stats for all days. Success: $successCount, Failed: $failureCount")

        return results
    }

    override fun listAvailableDates(): List<String> {
        val savedDates = try {
            analyticsPersistence.listAvailableDates().toMutableSet()
        } catch (e: Exception) {
            logger.error("Error loading saved dates from analytics persistence", e)
            mutableSetOf<String>()
        }

        // Also scan log file for dates that can be processed
        val datesFromLogs = try {
            extractDatesFromLogs()
        } catch (e: Exception) {
            logger.error("Error extracting dates from logs", e)
            emptySet<String>()
        }
        savedDates.addAll(datesFromLogs)

        // Include today's date if stats are active
        val today = try {
            java.time.LocalDate.now()
                .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"))
        } catch (e: Exception) {
            logger.error("Error formatting today's date", e)
            null
        }
        if (today != null) {
            savedDates.add(today)
        }

        val result = savedDates.sorted().reversed() // Most recent first
        logger.debug("Listed ${result.size} available dates for analytics")
        return result
    }

    /**
     * Extract all unique dates from the log file
     */
    private fun extractDatesFromLogs(): Set<String> {
        if (!logFile.exists()) {
            logger.debug("Log file does not exist: ${logFile.absolutePath}")
            return emptySet()
        }

        val dateFormat = SimpleDateFormat("dd/MMM/yyyy:HH:mm:ss Z", Locale.US)
        val dateFormatter = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd")
        val dates = mutableSetOf<String>()

        return try {
            // Use BufferedReader for better UTF-8 support and error handling
            logFile.bufferedReader(Charsets.UTF_8).use { reader ->
                var line: String? = reader.readLine()
                var lineCount = 0
                val maxLinesToScan = 100000 // Limit scanning to avoid performance issues

                while (line != null && lineCount < maxLinesToScan) {
                    try {
                        val trimmedLine = line.trim()
                        if (trimmedLine.isNotEmpty()) {
                            // Try to extract date from log line - support multiple formats
                            val dateMatch = """\[([^\]]+)\]""".toRegex().find(trimmedLine)
                            dateMatch?.let { match ->
                                val dateStr = match.groupValues[1]
                                try {
                                    val timestamp = dateFormat.parse(dateStr)
                                    val logDate = java.time.LocalDate.ofInstant(
                                        timestamp.toInstant(), java.time.ZoneId.systemDefault()
                                    )
                                    dates.add(logDate.format(dateFormatter))
                                } catch (e: Exception) {
                                    // Try alternative date format (dd/MMM/yyyy:HH:mm:ss)
                                    try {
                                        val altDateFormat =
                                            SimpleDateFormat("dd/MMM/yyyy:HH:mm:ss", Locale.US)
                                        val altTimestamp = altDateFormat.parse(dateStr)
                                        val logDate = java.time.LocalDate.ofInstant(
                                            altTimestamp.toInstant(),
                                            java.time.ZoneId.systemDefault()
                                        )
                                        dates.add(logDate.format(dateFormatter))
                                    } catch (e2: Exception) {
                                        // Ignore parse errors - log format might be different
                                        logger.debug(
                                            "Could not parse date from log line: $dateStr",
                                            e2
                                        )
                                    }
                                }
                            }
                        }
                    } catch (e: Exception) {
                        logger.debug("Error processing log line $lineCount", e)
                    }
                    line = reader.readLine()
                    lineCount++
                }
                logger.debug("Extracted ${dates.size} unique dates from logs (scanned $lineCount lines)")
            }
            dates
        } catch (e: Exception) {
            logger.error("Error extracting dates from logs: ${logFile.absolutePath}", e)
            emptySet()
        }
    }

    override fun getStatsForDateRange(startDate: String, endDate: String): List<DailyProxyStats> {
        val start = try {
            java.time.LocalDate.parse(
                startDate,
                java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd")
            )
        } catch (e: Exception) {
            logger.error("Invalid start date format: $startDate", e)
            return emptyList()
        }

        val end = try {
            java.time.LocalDate.parse(
                endDate,
                java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd")
            )
        } catch (e: Exception) {
            logger.error("Invalid end date format: $endDate", e)
            return emptyList()
        }

        val dates = generateSequence(start) { it.plusDays(1) }.takeWhile { !it.isAfter(end) }
            .map { it.format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd")) }.toList()

        // Process each date, creating stats if they don't exist
        return dates.mapNotNull { date ->
            getHistoricalStats(date)
        }
    }

    override fun updateStatsSettings(active: Boolean, intervalMs: Long, filterLocalIps: Boolean?) {
        AppConfig.updateProxyStatsSettings(active, intervalMs, filterLocalIps)
    }
}

// Service object for easy access
object AnalyticsService {
    private val service: IAnalyticsService by lazy {
        AnalyticsServiceImpl(ServiceContainer.jailManagerService)
    }
    
    private val serviceImpl: AnalyticsServiceImpl by lazy {
        service as AnalyticsServiceImpl
    }

    fun getStats() = service.getStats()
    fun getHistoricalStats(date: String) = service.getHistoricalStats(date)
    fun listAvailableDates() = service.listAvailableDates()
    fun getStatsForDateRange(startDate: String, endDate: String) = service.getStatsForDateRange(startDate, endDate)
    fun forceReprocessLogs(date: String) = service.forceReprocessLogs(date)
    fun updateStatsForAllDaysInCurrentLog() = service.updateStatsForAllDaysInCurrentLog()
    fun updateStatsSettings(active: Boolean, intervalMs: Long, filterLocalIps: Boolean? = null) = service.updateStatsSettings(active, intervalMs, filterLocalIps)
    
    // WebSocket tracking
    fun trackWebSocketConnection(endpoint: String, ip: String, userAgent: String? = null, containerId: String? = null, authenticated: Boolean = true) {
        serviceImpl.trackWebSocketConnection(endpoint, ip, userAgent, containerId, authenticated)
    }
    
    fun updateWebSocketConnectionDuration(endpoint: String, ip: String, startTime: Long) {
        serviceImpl.updateWebSocketConnectionDuration(endpoint, ip, startTime)
    }
}

