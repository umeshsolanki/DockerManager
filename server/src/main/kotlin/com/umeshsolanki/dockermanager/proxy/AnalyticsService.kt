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
import com.umeshsolanki.dockermanager.database.ProxyLogsTable
import com.umeshsolanki.dockermanager.system.IpLookupService
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.deleteAll
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.ZoneId
import org.slf4j.LoggerFactory
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedDeque
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

import kotlinx.serialization.json.intOrNull

interface IAnalyticsService {
    fun getStats(): ProxyStats
    fun getHistoricalStats(date: String): DailyProxyStats?
    fun listAvailableDates(): List<String>
    fun getStatsForDateRange(startDate: String, endDate: String): List<DailyProxyStats>
    fun forceReprocessLogs(date: String): DailyProxyStats?
    fun updateStatsForAllDaysInCurrentLog(): Map<String, Boolean>
    fun updateStatsSettings(active: Boolean, intervalMs: Long, filterLocalIps: Boolean? = null)
    fun truncateProxyLogs(): Boolean
    
    // Log Browsing
    fun getAccessLogs(type: String, page: Int, limit: Int, search: String? = null, date: String? = null): List<ProxyHit>
    fun getErrorLogs(page: Int, limit: Int, search: String? = null, date: String? = null): List<ErrorLogEntry>
}

class AnalyticsServiceImpl(
    private val jailManagerService: IJailManagerService,
) : IAnalyticsService {
    
    private data class ParsedLogEntry(
        val ip: String,
        val dateStr: String,
        val method: String,
        val path: String,
        val status: Int,
        val referer: String,
        val userAgent: String,
        val host: String?
    )

    private val lineRegex = """^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d+) (\d+) "([^"]*)" "([^"]*)" "([^"]*)".*$""".toRegex()

    private fun parseLogLine(line: String): ParsedLogEntry? {
        val trimmed = line.trim()
        if (trimmed.isEmpty()) return null

        if (trimmed.startsWith("{")) {
            return try {
                val jsonElement = AppConfig.json.parseToJsonElement(trimmed)
                val json = jsonElement.jsonObject
                
                val ip = json["ip"]?.jsonPrimitive?.content ?: return null
                val timeLocal = json["ts"]?.jsonPrimitive?.content ?: return null
                val request = json["req"]?.jsonPrimitive?.content ?: "" 
                // Status might be string or int in JSON depending on Nginx config, usually string in my config
                val statusStr = json["st"]?.jsonPrimitive?.content ?: "0"
                val status = statusStr.toIntOrNull() ?: 0
                val referer = json["ref"]?.jsonPrimitive?.content ?: "-"
                val ua = json["ua"]?.jsonPrimitive?.content ?: "-"
                val host = json["hst"]?.jsonPrimitive?.content

                val reqParts = request.split(" ")
                val method = reqParts.getOrNull(0) ?: "-"
                val path = reqParts.getOrNull(1) ?: request

                ParsedLogEntry(ip, timeLocal, method, path, status, referer, ua, host)
            } catch (e: Exception) {
                null
            }
        } else {
             return lineRegex.find(trimmed)?.let { match ->
                val (ip, dateStr, fullRequest, statusStr, _, referer, ua, _, host) = match.destructured
                val status = statusStr.toIntOrNull() ?: 0
                val reqParts = fullRequest.split(" ")
                val method = reqParts.getOrNull(0) ?: "-"
                val path = reqParts.getOrNull(1) ?: fullRequest
                
                ParsedLogEntry(ip, dateStr, method, path, status, referer, ua, if (host != "-") host else null)
            }
        }
    }
    private val logger = LoggerFactory.getLogger(AnalyticsServiceImpl::class.java)
    private val logDir: File
        get() = AppConfig.nginxLogDir
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
    private val lastProcessedOffsets = ConcurrentHashMap<String, Long>()
    private val totalHitsCounter = java.util.concurrent.atomic.AtomicLong(0)
    private val hitsByStatusMap = ConcurrentHashMap<Int, Long>()
    private val hitsByDomainMap = ConcurrentHashMap<String, Long>()
    private val hitsByDomainErrorMap = ConcurrentHashMap<String, Long>()
    private val hitsByPathMap = ConcurrentHashMap<String, Long>()
    private val hitsByIpMap = ConcurrentHashMap<String, Long>()
    private val hitsByIpErrorMap = ConcurrentHashMap<String, Long>()
    private val hitsByMethodMap = ConcurrentHashMap<String, Long>()
    private val hitsByRefererMap = ConcurrentHashMap<String, Long>()
    private val hitsByUserAgentMap = ConcurrentHashMap<String, Long>()
    private val hitsByCountryMap = ConcurrentHashMap<String, Long>()
    private val hitsByProviderMap = ConcurrentHashMap<String, Long>()
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
        logDir.mkdirs()

        // Start background worker for stats
        startStatsWorker()

        // Start daily reset worker
        startDailyResetWorker()
    }

    private fun startStatsWorker() {
        scope.launch {
            while (isActive) {
                try {
                    val settings = AppConfig.settings
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

    /**
     * Determines if a request is suspicious and should be logged to database
     * Criteria:
     * - 4xx or 5xx status codes (errors)
     * - Non-standard HTTP methods
     * - Suspicious paths (matching jail rules)
     * - Suspicious user agents (scanners, bots)
     */
    private fun isSuspiciousRequest(hit: ProxyHit): Boolean {
        // Log all error responses
        if (hit.status >= 400) return true
        
        // Check for non-standard methods
        val standardMethods = setOf("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD")
        if (hit.method !in standardMethods) return true
        
        // Check for suspicious paths using jail rules
        val rules = AppConfig.settings.proxyJailRules
        for (rule in rules) {
            when (rule.type) {
                ProxyJailRuleType.PATH -> {
                    if (rule.pattern.toRegex(RegexOption.IGNORE_CASE).containsMatchIn(hit.path)) {
                        return true
                    }
                }
                ProxyJailRuleType.USER_AGENT -> {
                    val ua = hit.userAgent ?: ""
                    if (rule.pattern.toRegex(RegexOption.IGNORE_CASE).containsMatchIn(ua)) {
                        return true
                    }
                }
                else -> {} // Skip METHOD and STATUS_CODE rules for log filtering
            }
        }
        
        return false
    }

    private fun startDailyResetWorker() {
        scope.launch {
            // Initial check on startup
            checkLogRotation()

            while (isActive) {
                try {
                   checkLogRotation()
                } catch (e: Exception) {
                    logger.error("Error in daily reset worker", e)
                }
                delay(60000) // Check every minute
            }
        }
    }

    private suspend fun checkLogRotation() {
        val today = java.time.LocalDate.now()
            .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"))

        // 1. Standard Day Transition Logic
        if (lastResetDate != null && lastResetDate != today) {
            // Only rotate logs once per day - check if we've already rotated for yesterday
            if (lastRotationDate != lastResetDate) {
                // Save yesterday's stats before resetting
                val yesterdayStats = cachedStats
                analyticsPersistence.saveDailyStats(yesterdayStats, lastResetDate!!)
                logger.info("Saved daily stats for $lastResetDate")

                // Rotate logs
                val logFiles = logDir.listFiles { _, name -> 
                    name.endsWith("_access.log") || name == "access.log" || name.endsWith("_danger.log") || name == "nginx_main_access.log"
                } ?: emptyArray()

                for (file in logFiles) {
                    if (file.exists() && file.length() > 1024) {
                        rotateAccessLog(file, lastResetDate!!)
                    }
                }
                lastRotationDate = lastResetDate
            }

            // Reset counters
            resetDailyStats()
            logger.info("Reset daily stats for $today")
        }

        // Initialize lastResetDate if not set (first run)
        if (lastResetDate == null) {
            lastResetDate = today
        }
        
        // 2. Recovery Logic would be complex with multiple files; relied on daily transition for now.
        // We could implement older-file detection here if strictly necessary.

        // If date is today, persist current stats
        if (lastResetDate == today) {
             val currentStats = cachedStats
             analyticsPersistence.saveDailyStats(currentStats, today)
        }
    }

    /**
     * Rotate access log file
     */
    private fun rotateAccessLog(file: File, date: String) {
        try {
            if (!file.exists()) return

            val currentSize = file.length()
            if (currentSize < 10240) {
                 // Skip small files
                 return
            }

            val baseName = file.nameWithoutExtension
            // e.g. domain_access -> domain_access_2023-10-27.log
            val rotatedLogFile = File(logDir, "${baseName}_$date.log")

            if (rotatedLogFile.exists() && rotatedLogFile.length() > currentSize) {
                return
            }

            file.copyTo(rotatedLogFile, overwrite = true)
            logger.info("Rotated ${file.name} to ${rotatedLogFile.name}")

            if (rotatedLogFile.exists() && rotatedLogFile.length() == currentSize) {
                file.writeText("")
                // Reset offset for this file
                lastProcessedOffsets[file.name] = 0L
            }
        } catch (e: Exception) {
            logger.error("Failed to rotate log file ${file.name} for date $date", e)
        }
    }

    private fun resetDailyStats() {
        totalHitsCounter.set(0)
        hitsByStatusMap.clear()
        hitsByDomainMap.clear()
        hitsByDomainErrorMap.clear()
        hitsByPathMap.clear()
        hitsByIpMap.clear()
        hitsByIpErrorMap.clear()
        hitsByMethodMap.clear()
        hitsByRefererMap.clear()
        hitsByUserAgentMap.clear()
        hitsByCountryMap.clear()
        hitsByProviderMap.clear()
        hitsByTimeMap.clear()
        recentHitsList.clear()
        lastProcessedOffsets.clear()
        
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
            hitsByDomainErrors = emptyMap(),
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
        val logFiles = logDir.listFiles { _, name -> 
            name.endsWith("_access.log") || name == "access.log" || name.endsWith("_danger.log") || name == "nginx_main_access.log"
        } ?: return

        // Regex now captures host as the 9th group
        val lineRegex =
            """^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d+) (\d+) "([^"]*)" "([^"]*)" "([^"]*)".*$""".toRegex()
        val dateFormat = SimpleDateFormat("dd/MMM/yyyy:HH:mm:ss Z", Locale.US)
        val hitsToInsert = mutableListOf<ProxyHit>()
        val settings = AppConfig.settings
        val shouldFilterLocalIps = settings.filterLocalIps

        for (logFile in logFiles) {
             try {
                val lastProcessedOffset = lastProcessedOffsets.getOrDefault(logFile.name, 0L)
                val currentLength = logFile.length()

                if (currentLength < lastProcessedOffset) {
                    // File truncated
                    lastProcessedOffsets[logFile.name] = 0L
                    continue
                }
                
                if (currentLength == lastProcessedOffset) continue

                java.io.RandomAccessFile(logFile, "r").use { raf ->
                    raf.seek(lastProcessedOffset)
                    var line: String? = raf.readLine()
                    while (line != null) {
                        parseLogLine(line)?.let { logEntry ->
                                val ip = logEntry.ip
                                val dateStr = logEntry.dateStr
                                val method = logEntry.method
                                val path = logEntry.path
                                val status = logEntry.status
                                val referer = logEntry.referer
                                val ua = logEntry.userAgent
                                val host = logEntry.host ?: "-"

                                // Filter local IPs if enabled
                                if (shouldFilterLocalIps && IpFilterUtils.isLocalIp(ip)) {
                                    return@let
                                }

                                // Filter 200 responses for static assets
                                if (status == 200) {
                                    val cleanPath = path.substringBefore('?')
                                    val isStaticAsset = cleanPath.endsWith(".js", ignoreCase = true) ||
                                            cleanPath.endsWith(".css", ignoreCase = true) ||
                                            cleanPath.endsWith(".png", ignoreCase = true) ||
                                            cleanPath.endsWith(".jpg", ignoreCase = true) ||
                                            cleanPath.endsWith(".jpeg", ignoreCase = true) ||
                                            cleanPath.endsWith(".gif", ignoreCase = true) ||
                                            cleanPath.endsWith(".svg", ignoreCase = true) ||
                                            cleanPath.endsWith(".woff", ignoreCase = true) ||
                                            cleanPath.endsWith(".woff2", ignoreCase = true) ||
                                            cleanPath.endsWith(".ttf", ignoreCase = true) ||
                                            cleanPath.endsWith(".webp", ignoreCase = true)
                                    if (isStaticAsset) return@let
                                }

                                if (status >= 400 && path.substringBefore('?').endsWith(".ico", ignoreCase = true)) {
                                    return@let
                                }

                                // Use captured host, fallback to referer
                                val domain = if (host != "-") host else if (referer != "-") try {
                                    java.net.URI(referer).host
                                } catch (e: Exception) { null } else null

                                // Update stats
                                totalHitsCounter.incrementAndGet()
                                hitsByStatusMap.merge(status, 1L, Long::plus)
                                hitsByIpMap.merge(ip, 1L, Long::plus)
                                hitsByMethodMap.merge(method, 1L, Long::plus)
                                hitsByPathMap.merge(path, 1L, Long::plus)
                                if (ua != "-") hitsByUserAgentMap.merge(ua, 1L, Long::plus)
                                if (referer != "-") hitsByRefererMap.merge(referer, 1L, Long::plus)
                                if (domain != null) {
                                    hitsByDomainMap.merge(domain, 1L, Long::plus)
                                    if (status >= 400) {
                                        hitsByDomainErrorMap.merge(domain, 1L, Long::plus)
                                    }
                                }
                                
                                // IP Lookup
                                val ipInfo = IpLookupService.lookup(ip)
                                ipInfo?.countryCode?.let { hitsByCountryMap.merge(it, 1L, Long::plus) }
                                ipInfo?.provider?.let { hitsByProviderMap.merge(it, 1L, Long::plus) }

                                if (status >= 400 || status == 0) {
                                    hitsByIpErrorMap.merge(ip, 1L, Long::plus)
                                }

                                // Security Jailing check
                                val errCount = hitsByIpErrorMap[ip] ?: 0L
                                jailManagerService.checkProxySecurityViolation(
                                    ip = ip,
                                    userAgent = ua,
                                    method = method,
                                    path = path,
                                    status = status,
                                    errorCount = errCount
                                )

                                try {
                                    val timestamp = dateFormat.parse(dateStr)
                                    val hourKey = SimpleDateFormat("yyyy-MM-dd'T'HH:00:00XXX", Locale.US).format(timestamp)
                                    hitsByTimeMap.merge(hourKey, 1L, Long::plus)

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
                                    
                                    if (isSuspiciousRequest(hit)) {
                                        hitsToInsert.add(hit)
                                    }
                                } catch (e: Exception) { }
                        }
                        line = raf.readLine()
                    }
                    lastProcessedOffsets[logFile.name] = raf.filePointer
                }
             } catch(e: Exception) {
                 logger.error("Error processing log file ${logFile.name}", e)
             }
        }
            
        // Batch insert logs
        if (AppConfig.storageBackend == "database" && settings.dbPersistenceLogsEnabled && hitsToInsert.isNotEmpty()) {
            try {
                transaction {
                    ProxyLogsTable.batchInsert(hitsToInsert) { hit ->
                        this[ProxyLogsTable.timestamp] = java.time.Instant.ofEpochMilli(hit.timestamp)
                            .atZone(ZoneId.systemDefault()).toLocalDateTime()
                        this[ProxyLogsTable.remoteIp] = hit.ip
                        this[ProxyLogsTable.method] = hit.method
                        this[ProxyLogsTable.path] = hit.path
                        this[ProxyLogsTable.status] = hit.status
                        this[ProxyLogsTable.responseTime] = hit.responseTime
                        this[ProxyLogsTable.userAgent] = hit.userAgent
                        this[ProxyLogsTable.referer] = hit.referer
                        this[ProxyLogsTable.domain] = hit.domain
                        
                        val ipInfo = IpLookupService.lookup(hit.ip)
                        this[ProxyLogsTable.countryCode] = ipInfo?.countryCode
                        this[ProxyLogsTable.provider] = ipInfo?.provider
                    }
                }
                logger.debug("Inserted ${hitsToInsert.size} suspicious proxy logs into Database")
            } catch (e: Exception) {
                logger.error("Failed to batch insert proxy logs to Database", e)
            }
        }
        
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
            hitsByDomainErrors = hitsByDomainErrorMap.toMap(),
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
            hitsByCountry = hitsByCountryMap.toMap(),
            hitsByProvider = hitsByProviderMap.toMap(),
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
                        hitsByDomainErrors = processedStats.hitsByDomainErrors,
                        topIps = processedStats.topIps,
                        topIpsWithErrors = processedStats.topIpsWithErrors,
                        topUserAgents = processedStats.topUserAgents,
                        topReferers = processedStats.topReferers,
                        topMethods = processedStats.topMethods
                    ), date
                )
                CacheService.set(cacheKey, processedStats, ttlSeconds = 86400)
                logger.info("Created and cached historical stats for $date from logs")
            } catch (e: Exception) {
                logger.error("Error saving processed stats for $date", e)
            }
        } else {
            logger.warn("No stats processed for date $date")
        }

        return processedStats
    }

    /**
     * Get the appropriate log file for a specific date
     * Checks rotated log files first (access_YYYY-MM-DD.log), then falls back to current access.log
     */
    private fun getLogFilesForDate(targetDate: String): List<File> {
        val allFiles = logDir.listFiles() ?: return emptyList()
        val matchingFiles = mutableListOf<File>()

        for (file in allFiles) {
            // Match standard rotated files: access_YYYY-MM-DD.log
            if (file.name == "access_$targetDate.log") {
                matchingFiles.add(file)
            }
            // Match domain-specific rotated files: domain_access_YYYY-MM-DD.log
            else if (file.name.endsWith("_access_$targetDate.log")) {
                matchingFiles.add(file)
            }
            // Match domain-specific rotated danger files: domain_danger_YYYY-MM-DD.log
            else if (file.name.endsWith("_danger_$targetDate.log")) {
                matchingFiles.add(file)
            }
            // Match nginx_main rotated files: nginx_main_access_YYYY-MM-DD.log
            else if (file.name == "nginx_main_access_$targetDate.log") {
                matchingFiles.add(file)
            }
        }

        if (matchingFiles.isNotEmpty()) {
            return matchingFiles
        }

        // Fallback to active logs if date is today
        val today = java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"))
        if (targetDate == today) {
            return allFiles.filter { 
                it.name == "access.log" || it.name.endsWith("_access.log") || 
                it.name.endsWith("_danger.log") || it.name == "nginx_main_access.log"
            }
        }

        return emptyList()
    }

    /**
     * Process log file for a specific date and generate stats
     */
    private fun processLogsForDate(targetDate: String): DailyProxyStats? {
        val filesToProcess = getLogFilesForDate(targetDate)
        if (filesToProcess.isEmpty()) {
            logger.warn("No log files found for $targetDate")
            return null
        }

        val lineRegex =
            """^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d+) (\d+) "([^"]*)" "([^"]*)" "([^"]*)" "([^"]*)".*$""".toRegex()
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

        // Temporary maps for aggregation
        val tempTotalHits = java.util.concurrent.atomic.AtomicLong(0)
        val tempHitsByStatusMap = ConcurrentHashMap<Int, Long>()
        val tempHitsByDomainMap = ConcurrentHashMap<String, Long>()
        val tempHitsByDomainErrorMap = ConcurrentHashMap<String, Long>()
        val tempHitsByPathMap = ConcurrentHashMap<String, Long>()
        val tempHitsByIpMap = ConcurrentHashMap<String, Long>()
        val tempHitsByIpErrorMap = ConcurrentHashMap<String, Long>()
        val tempHitsByMethodMap = ConcurrentHashMap<String, Long>()
        val tempHitsByRefererMap = ConcurrentHashMap<String, Long>()
        val tempHitsByUserAgentMap = ConcurrentHashMap<String, Long>()
        val tempHitsByTimeMap = ConcurrentHashMap<String, Long>()
        // Additional maps to match ProxyStats structure
        val tempHitsByCountryMap = ConcurrentHashMap<String, Long>()
        val tempHitsByProviderMap = ConcurrentHashMap<String, Long>()

        val settings = AppConfig.settings
        val shouldFilterLocalIps = settings.filterLocalIps

        for (file in filesToProcess) {
            try {
                file.bufferedReader(Charsets.UTF_8).use { reader ->
                    var line: String? = reader.readLine()
                    while (line != null) {
                        val trimmedLine = line.trim()
                        if (trimmedLine.isNotEmpty()) {
                            lineRegex.find(trimmedLine)?.let { match ->
                                val (ip, dateStr, fullRequest, statusStr, _, referer, ua, _, host) = match.destructured
                                val status = statusStr.toIntOrNull() ?: 0

                                // Parse date and check match
                                try {
                                    val timestamp = dateFormat.parse(dateStr)
                                    val logDate = java.time.LocalDate.ofInstant(
                                        timestamp.toInstant(), java.time.ZoneId.systemDefault()
                                    )
                                    if (!logDate.isEqual(targetLocalDate)) {
                                        return@let
                                    }

                                    if (shouldFilterLocalIps && IpFilterUtils.isLocalIp(ip)) return@let

                                    val reqParts = fullRequest.split(" ")
                                    val method = reqParts.getOrNull(0) ?: "-"
                                    val path = reqParts.getOrNull(1) ?: fullRequest

                                    if (status == 200) {
                                        val cleanPath = path.substringBefore('?')
                                        val isStaticAsset = cleanPath.endsWith(".js", ignoreCase = true) ||
                                                cleanPath.endsWith(".css", ignoreCase = true) ||
                                                cleanPath.endsWith(".png", ignoreCase = true) ||
                                                cleanPath.endsWith(".jpg", ignoreCase = true) ||
                                                cleanPath.endsWith(".jpeg", ignoreCase = true) ||
                                                cleanPath.endsWith(".gif", ignoreCase = true) ||
                                                cleanPath.endsWith(".svg", ignoreCase = true) ||
                                                cleanPath.endsWith(".woff", ignoreCase = true) ||
                                                cleanPath.endsWith(".woff2", ignoreCase = true) ||
                                                cleanPath.endsWith(".ttf", ignoreCase = true) ||
                                                cleanPath.endsWith(".webp", ignoreCase = true)
                                        if (isStaticAsset) return@let
                                    }

                                    val domain = if (host != "-") host else if (referer != "-") try {
                                        java.net.URI(referer).host
                                    } catch (e: Exception) { null } else null

                                    tempTotalHits.incrementAndGet()
                                    tempHitsByStatusMap.merge(status, 1L, Long::plus)
                                    tempHitsByIpMap.merge(ip, 1L, Long::plus)
                                    tempHitsByMethodMap.merge(method, 1L, Long::plus)
                                    tempHitsByPathMap.merge(path, 1L, Long::plus)
                                    if (ua != "-") tempHitsByUserAgentMap.merge(ua, 1L, Long::plus)
                                    if (referer != "-") tempHitsByRefererMap.merge(referer, 1L, Long::plus)
                                    if (domain != null) {
                                        tempHitsByDomainMap.merge(domain, 1L, Long::plus)
                                        if (status >= 400) tempHitsByDomainErrorMap.merge(domain, 1L, Long::plus)
                                    }
                                    if (status >= 400) tempHitsByIpErrorMap.merge(ip, 1L, Long::plus)

                                    val hourKey = SimpleDateFormat("yyyy-MM-dd'T'HH:00:00XXX", Locale.US).format(timestamp)
                                    tempHitsByTimeMap.merge(hourKey, 1L, Long::plus)

                                    // IP Lookup (Optional for historical, but robust)
                                    val ipInfo = IpLookupService.lookup(ip)
                                    ipInfo?.countryCode?.let { tempHitsByCountryMap.merge(it, 1L, Long::plus) }
                                    ipInfo?.provider?.let { tempHitsByProviderMap.merge(it, 1L, Long::plus) }

                                } catch (e: Exception) { }
                            }
                        }
                        line = reader.readLine()
                    }
                }
            } catch (e: Exception) {
                logger.error("Error processing log file ${file.name}", e)
            }
        }

        return DailyProxyStats(
            date = targetDate,
            totalHits = tempTotalHits.get(),
            hitsByStatus = tempHitsByStatusMap.toMap(),
            hitsOverTime = tempHitsByTimeMap.toSortedMap(),
            topPaths = tempHitsByPathMap.entries.sortedByDescending { it.value }.take(100).map { PathHit(it.key, it.value) },
            hitsByDomain = tempHitsByDomainMap.toMap(),
            hitsByDomainErrors = tempHitsByDomainErrorMap.toMap(),
            topIps = tempHitsByIpMap.entries.sortedByDescending { it.value }.take(100).map { GenericHitEntry(it.key, it.value) },
            topIpsWithErrors = tempHitsByIpErrorMap.entries.sortedByDescending { it.value }.take(100).map { GenericHitEntry(it.key, it.value) },
            topUserAgents = tempHitsByUserAgentMap.entries.sortedByDescending { it.value }.take(100).map { GenericHitEntry(it.key, it.value) },
            topReferers = tempHitsByRefererMap.entries.sortedByDescending { it.value }.take(100).map { GenericHitEntry(it.key, it.value) },
            topMethods = tempHitsByMethodMap.entries.sortedByDescending { it.value }.map { GenericHitEntry(it.key, it.value) },
            hitsByCountry = tempHitsByCountryMap.toMap(),
            hitsByProvider = tempHitsByProviderMap.toMap()
        )
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
    /**
     * Extract all unique dates from all current access log files
     */
    private fun extractAllDatesFromCurrentLog(): Set<String> {
        val logFiles = logDir.listFiles { _, name -> 
            name.endsWith("_access.log") || name == "access.log" || name.endsWith("_danger.log") || name == "nginx_main_access.log"
        } ?: return emptySet()

        val dateFormat = SimpleDateFormat("dd/MMM/yyyy:HH:mm:ss Z", Locale.US)
        val dateFormatter = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd")
        val dates = mutableSetOf<String>()

        for (logFile in logFiles) {
            if (!logFile.exists()) continue
            
            try {
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
            } catch (e: Exception) {
                logger.error("Error extracting dates from log file ${logFile.name}", e)
            }
        }
        
        logger.info(
            "Found ${dates.size} unique dates in current access logs: ${
                dates.sorted().joinToString(", ")
            }"
        )
        return dates
    }

    /**
     * Update stats for all days found in the current access.log file
     * Processes logs for each unique date and saves stats
     */
    override fun updateStatsForAllDaysInCurrentLog(): Map<String, Boolean> {
        logger.info("Starting to update stats for all days in current access log files")


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
    /**
     * Extract all unique dates from the log files
     */
    private fun extractDatesFromLogs(): Set<String> {
        val logFiles = logDir.listFiles { _, name -> 
            name.endsWith("_access.log") || name == "access.log" || name.endsWith("_danger.log") || name == "nginx_main_access.log"
        } ?: return emptySet()
        
        val dateFormat = SimpleDateFormat("dd/MMM/yyyy:HH:mm:ss Z", Locale.US)
        val dateFormatter = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd")
        val dates = mutableSetOf<String>()

        for (logFile in logFiles) {
            try {
                // Use BufferedReader for better UTF-8 support and error handling
                logFile.bufferedReader(Charsets.UTF_8).use { reader ->
                    var line: String? = reader.readLine()
                    var lineCount = 0
                    val maxLinesToScan = 50000 // Limit scanning per file
    
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
                                            // Ignore parse errors
                                        }
                                    }
                                }
                            }
                        } catch (e: Exception) {
                            // Ignore line errors
                        }
                        line = reader.readLine()
                        lineCount++
                    }
                }
            } catch (e: Exception) {
                logger.error("Error extracting dates from log file: ${logFile.name}", e)
            }
        }
        return dates
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

    override fun truncateProxyLogs(): Boolean {
        return try {
            if (AppConfig.storageBackend != "database") {
                logger.warn("Cannot truncate proxy logs: storage backend is not database")
                return false
            }
            
            val deletedCount = transaction {
                ProxyLogsTable.deleteAll()
            }
            logger.info("Successfully truncated proxy_logs table ($deletedCount rows deleted)")
            true
        } catch (e: Exception) {
            logger.error("Failed to truncate proxy_logs table", e)
            false
        }
    }


    // ========== Log Browsing Implementation ==========
    
    override fun getAccessLogs(type: String, page: Int, limit: Int, search: String?, date: String?): List<ProxyHit> {
        val targetDate = date ?: java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"))
        
        // Select files based on type and date
        val logFiles = if (type == "danger") {
            logDir.listFiles { _, name -> 
                (name.endsWith("_danger.log") || name.endsWith("_danger_$targetDate.log"))
            }?.toList() ?: emptyList()
        } else {
            // Default to access logs
            logDir.listFiles { _, name -> 
                (name == "access.log" || name.endsWith("_access.log") || name == "nginx_main_access.log" ||
                 name == "access_$targetDate.log" || name.endsWith("_access_$targetDate.log") || name == "nginx_main_access_$targetDate.log")
            }?.toList() ?: emptyList()
        }
        
        val lineRegex = """^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d+) (\d+) "([^"]*)" "([^"]*)" "([^"]*)".*$""".toRegex()
        val dateFormat = SimpleDateFormat("dd/MMM/yyyy:HH:mm:ss Z", Locale.US)
        
        val logs = mutableListOf<ProxyHit>()
        // Read lines from files
        // Optimization: For large files, we should use RandomAccessFile and read backwards.
        // For now, simpler implementation: Read all lines, filter, sort.
        // Limit max lines read per request to avoid OOM
        val maxLinesToRead = 50000 
        
        for (file in logFiles) {
            if (!file.exists()) continue
            try {
                // Determine if file matches date (active log might contain older entries, rotated logs are date-specific)
                val isRotated = file.name.contains(targetDate)
                
                // Read reverse lines (using reversed() on readLines is memory intensive for large files)
                // Better approach: use useLines and takeLast if possible, but File.useLines is forward only.
                // We'll use a simple approach: readLines() but limit size.
                val lines = file.readLines()
                val linesToProcess = if (lines.size > maxLinesToRead) lines.takeLast(maxLinesToRead) else lines
                
                for (line in linesToProcess.asReversed()) {
                    val trimmedLine = line.trim()
                    if (trimmedLine.isBlank()) continue
                    
                    // Basic search filter before regex (faster)
                    if (search != null && !trimmedLine.contains(search, ignoreCase = true)) continue
                    
                    lineRegex.find(trimmedLine)?.let { match ->
                        val (ip, dateStr, fullRequest, statusStr, _, referer, ua, _, host) = match.destructured
                        
                        try {
                            val timestamp = dateFormat.parse(dateStr).time
                            // Check date match if file is not rotated (active log)
                            // Or trust the file selection
                            
                            val status = statusStr.toIntOrNull() ?: 0
                            val reqParts = fullRequest.split(" ")
                            val method = reqParts.getOrNull(0) ?: "-"
                            val path = reqParts.getOrNull(1) ?: fullRequest
                            
                            val domain = if (host != "-") host else if (referer != "-") try {
                                java.net.URI(referer).host
                            } catch (e: Exception) { null } else null
                            
                            logs.add(ProxyHit(
                                timestamp = timestamp,
                                ip = ip,
                                method = method,
                                path = path,
                                status = status,
                                responseTime = 0,
                                userAgent = ua,
                                referer = if (referer == "-") null else referer,
                                domain = domain
                            ))
                        } catch (e: Exception) { }
                    }
                }
            } catch (e: Exception) {
                logger.error("Error reading log file ${file.name}", e)
            }
        }
        
        // Sort by timestamp desc
        logs.sortByDescending { it.timestamp }
        
        // Pagination
        val startIndex = (page - 1) * limit
        val endIndex = minOf(startIndex + limit, logs.size)
        
        if (startIndex >= logs.size) return emptyList()
        return logs.subList(startIndex, endIndex)
    }

    override fun getErrorLogs(page: Int, limit: Int, search: String?, date: String?): List<ErrorLogEntry> {
        val targetDate = date ?: java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"))
        val targetDateSlashed = targetDate.replace("-", "/") // Nginx error log uses YYYY/MM/DD
        
        // Select files
        val logFiles = logDir.listFiles { _, name -> 
            (name == "error.log" || name.endsWith("_error.log") || 
             name == "error_$targetDate.log" || name.endsWith("_error_$targetDate.log"))
        }?.toList() ?: emptyList()
        
        // Log format: 2023/10/27 10:00:00 [error] ...
        val lineRegex = """^(\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\] \d+#\d+: \*?\d+ (.*)$""".toRegex()
        val dateFormat = SimpleDateFormat("yyyy/MM/dd HH:mm:ss", Locale.US)
        
        val logs = mutableListOf<ErrorLogEntry>()
        val maxLinesToRead = 50000
        
        for (file in logFiles) {
            if (!file.exists()) continue
            try {
                val lines = file.readLines()
                val linesToProcess = if (lines.size > maxLinesToRead) lines.takeLast(maxLinesToRead) else lines
                
                for (line in linesToProcess.asReversed()) {
                    val trimmedLine = line.trim()
                    if (trimmedLine.isBlank()) continue
                    
                    if (search != null && !trimmedLine.contains(search, ignoreCase = true)) continue
                    if (!trimmedLine.startsWith(targetDateSlashed)) continue // Date filter check
                    
                    lineRegex.find(trimmedLine)?.let { match ->
                        val (dateStr, level, content) = match.destructured
                        
                        try {
                            val timestamp = dateFormat.parse(dateStr).time
                            
                            // Parse key-values from content
                            val clientMatch = """client: ([^,]+)""".toRegex().find(content)
                            val serverMatch = """server: ([^,]+)""".toRegex().find(content)
                            val requestMatch = """request: "([^"]+)"""".toRegex().find(content)
                            val hostMatch = """host: "([^"]+)"""".toRegex().find(content)
                            
                            val client = clientMatch?.groupValues?.get(1)
                            val server = serverMatch?.groupValues?.get(1)
                            val request = requestMatch?.groupValues?.get(1)
                            val host = hostMatch?.groupValues?.get(1)
                            
                            // Message is content minus the keys (roughly)
                            // A simple way is to take everything before ", client:"
                            val message = content.substringBefore(", client:")
                            
                            logs.add(ErrorLogEntry(
                                timestamp = timestamp,
                                level = level,
                                message = message,
                                client = client,
                                server = server,
                                request = request,
                                host = host
                            ))
                        } catch (e: Exception) { }
                    }
                }
            } catch (e: Exception) {
                logger.error("Error reading error log file ${file.name}", e)
            }
        }
        
        logs.sortByDescending { it.timestamp }
        
        val startIndex = (page - 1) * limit
        val endIndex = minOf(startIndex + limit, logs.size)
        
        if (startIndex >= logs.size) return emptyList()
        return logs.subList(startIndex, endIndex)
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
    fun truncateProxyLogs() = service.truncateProxyLogs()
    
    // Log Browsing
    fun getAccessLogs(type: String, page: Int, limit: Int, search: String? = null, date: String? = null) = service.getAccessLogs(type, page, limit, search, date)
    fun getErrorLogs(page: Int, limit: Int, search: String? = null, date: String? = null) = service.getErrorLogs(page, limit, search, date)
    
    // WebSocket tracking
    fun trackWebSocketConnection(endpoint: String, ip: String, userAgent: String? = null, containerId: String? = null, authenticated: Boolean = true) {
        serviceImpl.trackWebSocketConnection(endpoint, ip, userAgent, containerId, authenticated)
    }
    
    fun updateWebSocketConnectionDuration(endpoint: String, ip: String, startTime: Long) {
        serviceImpl.updateWebSocketConnectionDuration(endpoint, ip, startTime)
    }
}

