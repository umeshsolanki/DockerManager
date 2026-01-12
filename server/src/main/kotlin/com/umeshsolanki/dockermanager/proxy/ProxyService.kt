@file:OptIn(ExperimentalSerializationApi::class)

package com.umeshsolanki.dockermanager.proxy

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.ServiceContainer
import com.umeshsolanki.dockermanager.cache.CacheService
import com.umeshsolanki.dockermanager.jail.IJailManagerService
import com.umeshsolanki.dockermanager.utils.CommandExecutor
import com.umeshsolanki.dockermanager.utils.JsonPersistence
import com.umeshsolanki.dockermanager.utils.ResourceLoader
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.UUID

interface IProxyService {
    fun listHosts(): List<ProxyHost>
    fun createHost(host: ProxyHost): Pair<Boolean, String>
    fun deleteHost(id: String): Boolean
    fun getStats(): ProxyStats
    fun toggleHost(id: String): Boolean
    fun updateHost(host: ProxyHost): Pair<Boolean, String>
    fun requestSSL(id: String): Boolean
    fun listCertificates(): List<SSLCertificate>

    // Proxy Container Management
    fun buildProxyImage(): Pair<Boolean, String>
    fun createProxyContainer(): Pair<Boolean, String>
    fun startProxyContainer(): Pair<Boolean, String>
    fun stopProxyContainer(): Pair<Boolean, String>
    fun restartProxyContainer(): Pair<Boolean, String>
    fun getProxyContainerStatus(): ProxyContainerStatus
    fun ensureProxyContainerExists(): Boolean
    fun getComposeConfig(): String
    fun updateComposeConfig(content: String): Pair<Boolean, String>
    fun updateStatsSettings(active: Boolean, intervalMs: Long, filterLocalIps: Boolean? = null)
    fun updateSecuritySettings(enabled: Boolean, thresholdNon200: Int, rules: List<ProxyJailRule>)

    // Analytics History
    fun getHistoricalStats(date: String): DailyProxyStats?
    fun listAvailableDates(): List<String>
    fun getStatsForDateRange(startDate: String, endDate: String): List<DailyProxyStats>
    fun forceReprocessLogs(date: String): DailyProxyStats?
    fun updateStatsForAllDaysInCurrentLog(): Map<String, Boolean>
}

class ProxyServiceImpl(
    private val jailManagerService: IJailManagerService,
) : IProxyService {
    private val logger = org.slf4j.LoggerFactory.getLogger(ProxyServiceImpl::class.java)
    private val configDir = AppConfig.proxyConfigDir
    private val logFile = AppConfig.proxyLogFile
    private val hostsFile = AppConfig.proxyHostsFile
    private val jsonPersistence = JsonPersistence.create<List<ProxyHost>>(
        file = hostsFile,
        defaultContent = emptyList(),
        loggerName = ProxyServiceImpl::class.java.name
    )

    val proxyDockerComposeDir: File
        get() {
            return File(AppConfig.projectRoot, "proxy").let {
                if (!it.exists()) {
                    it.mkdirs()
                }
                it
            }
        }

    private val nginxPath = AppConfig.proxyDir.absolutePath
    private val certbotPath = AppConfig.certbotDir.absolutePath
    private val customCertsPath = AppConfig.customCertDir.absolutePath

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
    private val hitsByStatusMap = java.util.concurrent.ConcurrentHashMap<Int, Long>()
    private val hitsByDomainMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val hitsByPathMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val hitsByIpMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val hitsByIpErrorMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val hitsByMethodMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val hitsByRefererMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val hitsByUserAgentMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val hitsByTimeMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val recentHitsList = java.util.concurrent.ConcurrentLinkedDeque<ProxyHit>()
    private val MAX_RECENT_HITS = 100

    private val refreshIntervalMs = 60000L // Configurable interval: 10 seconds
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val commandExecutor = CommandExecutor(loggerName = ProxyServiceImpl::class.java.name)
    private val analyticsPersistence = AnalyticsPersistenceService()
    private var lastResetDate: String? = null
    private var lastRotationDate: String? = null // Track when we last rotated logs

    // Cache key prefix for historical stats
    private val CACHE_KEY_PREFIX = "proxy:historical:stats:"

    override fun updateSecuritySettings(
        enabled: Boolean,
        thresholdNon200: Int,
        rules: List<ProxyJailRule>,
    ) {
        AppConfig.updateProxySecuritySettings(enabled, thresholdNon200, rules)
    }

    init {
        if (!configDir.exists()) configDir.mkdirs()

        // Ensure log directory exists for Nginx
        AppConfig.proxyLogFile.parentFile?.mkdirs()

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
            topMethods = emptyList()
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
                                errorCount = errCount
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
                .map { GenericHitEntry(it.key, it.value) })
    }

    override fun getStats(): ProxyStats = cachedStats

    private fun loadHosts(): MutableList<ProxyHost> {
        // Load from file first (source of truth)
        val hosts = try {
            // Try to load normally first
            if (hostsFile.exists()) {
                val content = hostsFile.readText()
                if (content.isBlank()) {
                    emptyList<ProxyHost>().toMutableList()
                } else {
                    try {
                        // Try normal deserialization
                        AppConfig.json.decodeFromString<List<ProxyHost>>(content).toMutableList()
                    } catch (e: kotlinx.serialization.MissingFieldException) {
                        // Handle migration for old data format missing 'upstream' field
                        if (e.message?.contains("upstream") == true) {
                            logger.warn("Detected old proxy host format missing 'upstream' field, attempting migration...")
                            migrateOldHostsFormat(content)
                        } else {
                            logger.error("Error loading proxy hosts: ${e.message}", e)
                            emptyList<ProxyHost>().toMutableList()
                        }
                    }
                }
            } else {
                jsonPersistence.load().toMutableList()
            }
        } catch (e: Exception) {
            logger.error("Error loading proxy hosts", e)
            // Fallback to JsonPersistence which handles errors gracefully
            try {
                jsonPersistence.load().toMutableList()
            } catch (fallbackError: Exception) {
                logger.error("Fallback load also failed", fallbackError)
                emptyList<ProxyHost>().toMutableList()
            }
        }

        // If Redis is enabled, try to sync to Redis (in case Redis is empty or out of sync)
        if (CacheService.currentConfig.enabled && hosts.isNotEmpty()) {
            try {
                val cachedHosts = CacheService.get<List<ProxyHost>>("proxy:hosts")
                // If Redis is empty or has different data, sync file data to Redis
                if (cachedHosts == null || cachedHosts.isEmpty() || cachedHosts.size != hosts.size) {
                    CacheService.set("proxy:hosts", hosts, null)
                    logger.debug("Synced ${hosts.size} proxy hosts from file to Redis")
                } else {
                    logger.debug("Loaded ${hosts.size} proxy hosts from file (Redis already in sync)")
                }
            } catch (e: Exception) {
                logger.warn("Failed to sync proxy hosts to Redis: ${e.message}", e)
            }
        }

        logger.debug("Loaded ${hosts.size} proxy hosts from file")
        return hosts
    }

    /**
     * Migrates old proxy host format that may be missing the 'upstream' field.
     * Old entries had 'target' but not 'upstream', so we use 'target' as 'upstream'.
     */
    private fun migrateOldHostsFormat(content: String): MutableList<ProxyHost> {
        return try {
            if (content.isBlank()) {
                logger.debug("Hosts file content is empty, returning empty list")
                return emptyList<ProxyHost>().toMutableList()
            }

            // Parse as JSON array manually to migrate old entries
            val jsonArray = AppConfig.json.parseToJsonElement(content).jsonArray
            val migratedHosts = mutableListOf<ProxyHost>()

            for (jsonElement in jsonArray) {
                val jsonObject = jsonElement.jsonObject

                // Extract fields, handling missing 'upstream'
                val id = jsonObject["id"]?.jsonPrimitive?.content ?: ""
                val domain = jsonObject["domain"]?.jsonPrimitive?.content ?: ""
                val target = jsonObject["target"]?.jsonPrimitive?.content ?: ""
                val upstream = jsonObject["upstream"]?.jsonPrimitive?.content
                    ?: target // Use target as upstream if missing
                val ssl = jsonObject["ssl"]?.jsonPrimitive?.booleanOrNull ?: false
                val enabled = jsonObject["enabled"]?.jsonPrimitive?.booleanOrNull ?: true
                val customConfig = jsonObject["customConfig"]?.jsonPrimitive?.contentOrNull
                val websocketEnabled =
                    jsonObject["websocketEnabled"]?.jsonPrimitive?.booleanOrNull ?: false
                val allowedIps =
                    jsonObject["allowedIps"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }
                        ?: emptyList()
                val customSslPath = jsonObject["customSslPath"]?.jsonPrimitive?.contentOrNull
                val hstsEnabled = jsonObject["hstsEnabled"]?.jsonPrimitive?.booleanOrNull ?: false

                // Migrate paths if present
                val paths = jsonObject["paths"]?.jsonArray?.mapNotNull { pathElement ->
                    val pathObj = pathElement.jsonObject
                    PathRoute(
                        id = pathObj["id"]?.jsonPrimitive?.content
                        ?: UUID.randomUUID().toString(),
                        path = pathObj["path"]?.jsonPrimitive?.content ?: "",
                        target = pathObj["target"]?.jsonPrimitive?.content ?: "",
                        websocketEnabled = pathObj["websocketEnabled"]?.jsonPrimitive?.booleanOrNull
                            ?: false,
                        allowedIps = pathObj["allowedIps"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }
                            ?: emptyList(),
                        stripPrefix = pathObj["stripPrefix"]?.jsonPrimitive?.booleanOrNull ?: false,
                        customConfig = pathObj["customConfig"]?.jsonPrimitive?.contentOrNull,
                        enabled = pathObj["enabled"]?.jsonPrimitive?.booleanOrNull ?: true,
                        name = pathObj["name"]?.jsonPrimitive?.contentOrNull,
                        order = pathObj["order"]?.jsonPrimitive?.intOrNull ?: 0)
                } ?: emptyList()

                // Create migrated host - set upstream to null if it equals target (to avoid redundancy)
                val migratedHost = ProxyHost(
                    id = id,
                    domain = domain,
                    upstream = if (upstream == target) null else upstream,
                    target = target.ifEmpty { upstream }, // Use upstream if target is empty
                    ssl = ssl,
                    enabled = enabled,
                    customConfig = customConfig,
                    websocketEnabled = websocketEnabled,
                    allowedIps = allowedIps,
                    customSslPath = customSslPath,
                    hstsEnabled = hstsEnabled,
                    paths = paths
                )

                migratedHosts.add(migratedHost)
            }

            // Save migrated hosts back to file
            if (migratedHosts.isNotEmpty()) {
                saveHosts(migratedHosts)
                logger.info("Successfully migrated ${migratedHosts.size} proxy hosts to new format")
            }

            migratedHosts
        } catch (e: Exception) {
            logger.error("Failed to migrate old proxy hosts format, returning empty list", e)
            // Backup the corrupted file
            try {
                val backupFile = File(
                    hostsFile.parentFile,
                    "${hostsFile.nameWithoutExtension}.backup.${System.currentTimeMillis()}.json"
                )
                hostsFile.copyTo(backupFile, overwrite = true)
                logger.info("Created backup of corrupted hosts file: ${backupFile.name}")
            } catch (backupError: Exception) {
                logger.error("Failed to create backup of corrupted hosts file", backupError)
            }
            emptyList<ProxyHost>().toMutableList()
        }
    }

    private fun saveHosts(hosts: List<ProxyHost>) {
        // Ensure parent directory exists
        hostsFile.parentFile?.mkdirs()

        // Save to file first
        val saved = jsonPersistence.save(hosts)
        if (!saved) {
            val errorMsg = "Failed to save proxy hosts to ${hostsFile.absolutePath}"
            logger.error(errorMsg)
            throw IllegalStateException(errorMsg)
        }
        logger.debug("Saved ${hosts.size} proxy hosts to ${hostsFile.absolutePath}")

        // If Redis is enabled, also sync to Redis
        if (CacheService.currentConfig.enabled) {
            try {
                CacheService.set("proxy:hosts", hosts, null)
                logger.debug("Synced ${hosts.size} proxy hosts to Redis")
            } catch (e: Exception) {
                logger.warn("Failed to sync proxy hosts to Redis: ${e.message}", e)
            }
        }
    }

    override fun listHosts(): List<ProxyHost> = loadHosts()

    private fun validatePathRoute(pathRoute: PathRoute): Pair<Boolean, String> {
        if (pathRoute.path.isBlank()) {
            return false to "Path cannot be empty"
        }
        if (pathRoute.target.isBlank()) {
            return false to "Target URL cannot be empty"
        }
        // Validate target URL format
        try {
            val uri = java.net.URI(pathRoute.target)
            if (uri.scheme == null || uri.host == null) {
                return false to "Target URL must include scheme and host (e.g., http://backend:8080)"
            }
        } catch (e: Exception) {
            return false to "Invalid target URL format: ${e.message}"
        }
        return true to ""
    }

    private fun validateHostPaths(paths: List<PathRoute>): Pair<Boolean, String> {
        for (path in paths) {
            val validation = validatePathRoute(path)
            if (!validation.first) {
                return false to "Invalid path route '${path.name ?: path.path}': ${validation.second}"
            }
        }
        return true to ""
    }

    override fun createHost(host: ProxyHost): Pair<Boolean, String> {
        return try {
            // Validate required fields
            if (host.domain.isBlank()) {
                return false to "Domain is required"
            }
            if (host.target.isBlank()) {
                return false to "Target is required"
            }

            // Validate domain format (basic check)
            if (!host.domain.matches(Regex("^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$"))) {
                return false to "Invalid domain format"
            }

            // Validate upstream/target URL format (upstream defaults to target if not provided)
            val effectiveUpstream = host.effectiveUpstream
            try {
                val upstreamUri = java.net.URI(effectiveUpstream)
                if (upstreamUri.scheme == null || upstreamUri.host == null) {
                    return false to "Upstream must include scheme and host (e.g., http://backend:8080)"
                }
            } catch (e: Exception) {
                return false to "Invalid upstream URL format: ${e.message}"
            }

            try {
                val targetUri = java.net.URI(host.target)
                if (targetUri.scheme == null || targetUri.host == null) {
                    return false to "Target must include scheme and host (e.g., http://backend:8080)"
                }
            } catch (e: Exception) {
                return false to "Invalid target URL format: ${e.message}"
            }

            // Validate paths
            val pathValidation = validateHostPaths(host.paths)
            if (!pathValidation.first) {
                return pathValidation
            }

            val hosts = loadHosts()
            
            // Check for duplicate domain
            if (hosts.any { it.domain == host.domain && it.id != host.id }) {
                return false to "A proxy host with domain '${host.domain}' already exists"
            }

            val newHost =
                if (host.id.isEmpty()) host.copy(id = UUID.randomUUID().toString()) else host
            hosts.add(newHost)

            val result = generateConfigAndReload(newHost, hosts)
            if (!result.first) return result

            // Check if we fell back to HTTP due to missing certs
            if (result.second.startsWith("SSL Certificate missing")) {
                scope.launch { requestSSL(newHost.id) }
                return true to "Host created. Requesting SSL certificate in background..."
            }

            true to "Host created successfully"
        } catch (e: Exception) {
            logger.error("Error creating host", e)
            false to (e.message ?: "Unknown error")
        }
    }

    override fun deleteHost(id: String): Boolean {
        return try {
            val hosts = loadHosts()
            val host = hosts.find { it.id == id } ?: return false
            File(configDir, "${host.domain}.conf").delete()
            hosts.remove(host)
            try {
                saveHosts(hosts)
            } catch (e: Exception) {
                logger.error("Failed to save hosts when deleting", e)
                return false
            }
            val reloadResult = reloadNginx()
            if (!reloadResult.first) {
                logger.error("Failed to reload nginx when deleting host: ${reloadResult.second}")
                return false
            }
            true
        } catch (e: Exception) {
            logger.error("Error deleting host $id", e)
            false
        }
    }

    override fun updateHost(host: ProxyHost): Pair<Boolean, String> {
        return try {
            // Validate required fields
            if (host.domain.isBlank()) {
                return false to "Domain is required"
            }
            if (host.target.isBlank()) {
                return false to "Target is required"
            }

            // Validate domain format (basic check)
            if (!host.domain.matches(Regex("^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$"))) {
                return false to "Invalid domain format"
            }

            // Validate upstream/target URL format (upstream defaults to target if not provided)
            val effectiveUpstream = host.effectiveUpstream
            try {
                val upstreamUri = java.net.URI(effectiveUpstream)
                if (upstreamUri.scheme == null || upstreamUri.host == null) {
                    return false to "Upstream must include scheme and host (e.g., http://backend:8080)"
                }
            } catch (e: Exception) {
                return false to "Invalid upstream URL format: ${e.message}"
            }

            try {
                val targetUri = java.net.URI(host.target)
                if (targetUri.scheme == null || targetUri.host == null) {
                    return false to "Target must include scheme and host (e.g., http://backend:8080)"
                }
            } catch (e: Exception) {
                return false to "Invalid target URL format: ${e.message}"
            }

            // Validate paths
            val pathValidation = validateHostPaths(host.paths)
            if (!pathValidation.first) {
                return pathValidation
            }

            val hosts = loadHosts()
            val index = hosts.indexOfFirst { it.id == host.id }
            if (index == -1) return false to "Host not found"

            // Check for duplicate domain (excluding current host)
            if (hosts.any { it.domain == host.domain && it.id != host.id }) {
                return false to "A proxy host with domain '${host.domain}' already exists"
            }

            val oldHost = hosts[index]
            // If domain changed or disabled, remove old config
            if (oldHost.domain != host.domain || !host.enabled) {
                File(configDir, "${oldHost.domain}.conf").delete()
            }

            hosts[index] = host

            if (host.enabled) {
                val result = generateConfigAndReload(host, hosts)
                if (!result.first) return result

                // Check if we fell back to HTTP due to missing certs
                if (result.second.startsWith("SSL Certificate missing")) {
                    scope.launch { requestSSL(host.id) }
                    return true to "Host updated. Requesting SSL certificate in background..."
                }
            } else {
                try {
                    saveHosts(hosts)
                } catch (e: Exception) {
                    logger.error("Failed to save hosts when updating", e)
                    return false to "Failed to save proxy hosts: ${e.message}"
                }
                val reloadResult = reloadNginx()
                if (!reloadResult.first) {
                    logger.error("Failed to reload nginx when updating host: ${reloadResult.second}")
                    return false to "Config saved, but failed to reload nginx: ${reloadResult.second}"
                }
            }

            true to "Host updated successfully"
        } catch (e: Exception) {
            logger.error("Error updating host", e)
            false to (e.message ?: "Unknown error")
        }
    }

    private fun generateConfigAndReload(
        host: ProxyHost,
        hosts: MutableList<ProxyHost>,
    ): Pair<Boolean, String> {
        val configResult = generateNginxConfig(host)
        if (!configResult.first) return configResult
        
        // Save hosts first
        try {
            saveHosts(hosts)
        } catch (e: Exception) {
            logger.error("Failed to save proxy hosts", e)
            return false to "Failed to save proxy hosts: ${e.message}"
        }
        
        // Ensure proxy container exists before reloading
        if (!ensureProxyContainerExists()) {
            logger.warn("Proxy container does not exist, but config was generated and saved")
            return true to "Config generated and saved, but proxy container is not running. Please start the proxy container."
        }
        
        // Reload nginx
        val reloadResult = reloadNginx()
        if (!reloadResult.first) {
            logger.error("Failed to reload nginx: ${reloadResult.second}")
            return false to "Config generated and saved, but failed to reload nginx: ${reloadResult.second}"
        }
        
        return configResult
    }

    override fun toggleHost(id: String): Boolean {
        return try {
            val hosts = loadHosts()
            val index = hosts.indexOfFirst { it.id == id }
            if (index == -1) return false

            val updated = hosts[index].copy(enabled = !hosts[index].enabled)
            hosts[index] = updated

            if (updated.enabled) {
                val result = generateConfigAndReload(updated, hosts)
                if (!result.first) {
                    logger.error("Failed to toggle host $id: ${result.second}")
                    return false
                }
            } else {
                File(configDir, "${updated.domain}.conf").delete()
                try {
                    saveHosts(hosts)
                } catch (e: Exception) {
                    logger.error("Failed to save hosts when toggling", e)
                    return false
                }
                val reloadResult = reloadNginx()
                if (!reloadResult.first) {
                    logger.error("Failed to reload nginx when toggling host: ${reloadResult.second}")
                    return false
                }
            }
            true
        } catch (e: Exception) {
            logger.error("Error toggling host $id", e)
            false
        }
    }

    override fun requestSSL(id: String): Boolean {
        return try {
            val hosts = loadHosts()
            val index = hosts.indexOfFirst { it.id == id }
            if (index == -1) return false

            val host = hosts[index]

            // Ensure we have a basic HTTP config for ACME challenge
            val httpConfigResult = generateNginxConfig(host.copy(ssl = false))
            if (!httpConfigResult.first) {
                logger.error("Failed to generate HTTP config for SSL request: ${httpConfigResult.second}")
                return false
            }
            
            val reloadResult = reloadNginx()
            if (!reloadResult.first) {
                logger.error("Failed to reload nginx for SSL request: ${reloadResult.second}")
                return false
            }

            try {
                // Run certbot via docker using absolute paths map to the certbot volume
                // Updated to run in proxy container with standard paths
                val certCmd =
                    "${AppConfig.dockerCommand} exec docker-manager-proxy certbot certonly --webroot -w /var/www/certbot -d ${host.domain} --non-interactive --agree-tos --email admin@${host.domain}"
                val result = executeCommand(certCmd)

                if (result.contains("Successfully received certificate") || result.contains("Certificate not yet due for renewal")) {
                    // Fix permissions so host process can see them (recursive 755 for live/archive)
                    executeCommand("${AppConfig.dockerCommand} exec docker-manager-proxy chmod -R 755 /etc/letsencrypt")

                    val updated = host.copy(ssl = true)
                    hosts[index] = updated
                    try {
                        saveHosts(hosts)
                    } catch (e: Exception) {
                        logger.error("Failed to save hosts after SSL certificate obtained", e)
                        return false
                    }
                    
                    val sslConfigResult = generateNginxConfig(updated)
                    if (!sslConfigResult.first) {
                        logger.error("Failed to generate SSL config: ${sslConfigResult.second}")
                        return false
                    }
                    
                    val reloadResult = reloadNginx()
                    if (!reloadResult.first) {
                        logger.error("Failed to reload nginx after SSL certificate: ${reloadResult.second}")
                        return false
                    }
                    return true
                }
            } catch (e: Exception) {
                logger.error("SSL request failed for ${host.domain}", e)
            }
            false
        } catch (e: Exception) {
            logger.error("Error requesting SSL for host $id", e)
            false
        }
    }

    override fun listCertificates(): List<SSLCertificate> {
        val certs = mutableListOf<SSLCertificate>()

        // Scan LetsEncrypt
        val leDir = AppConfig.letsEncryptDir
        if (leDir.exists()) {
            leDir.listFiles()?.filter { it.isDirectory }?.forEach { dir ->
                val fullchain = File(dir, "fullchain.pem")
                val privkey = File(dir, "privkey.pem")
                if (fullchain.exists() && privkey.exists()) {
                    certs.add(
                        SSLCertificate(
                            id = dir.name,
                            domain = dir.name,
                            certPath = fullchain.absolutePath,
                            keyPath = privkey.absolutePath
                        )
                    )
                }
            }
        }

        // Scan custom certs dir
        val custDir = AppConfig.customCertDir
        if (custDir.exists()) {
            custDir.listFiles()?.filter { it.extension == "crt" || it.extension == "pem" }
                ?.forEach { cert ->
                    val keyName = cert.nameWithoutExtension + ".key"
                    val keyFile = File(cert.parentFile, keyName)
                    if (keyFile.exists()) {
                        certs.add(
                            SSLCertificate(
                                id = cert.nameWithoutExtension,
                                domain = cert.nameWithoutExtension,
                                certPath = cert.absolutePath,
                                keyPath = keyFile.absolutePath
                            )
                        )
                    }
                }
        }

        return certs
    }

    private fun executeCommand(command: String): String {
        return commandExecutor.execute(command).output
    }

    private fun generateNginxConfig(host: ProxyHost): Pair<Boolean, String> {
        // Load websocket config if enabled
        val wsConfigRaw = if (host.websocketEnabled) {
            ResourceLoader.loadResourceOrThrow("templates/proxy/websocket-config.conf")
        } else ""

        // Indent websocket config for use in location blocks (8 spaces)
        val wsConfig = if (wsConfigRaw.isNotEmpty()) {
            wsConfigRaw.lines().joinToString("\n        ") { it.trim() }
        } else ""

        // Generate IP restrictions
        val ipConfig = if (host.allowedIps.isNotEmpty()) {
            host.allowedIps.joinToString("\n        ") { "allow $it;" } + "\n        deny all;"
        } else ""

        // Generate path-based location blocks
        val pathLocations = generatePathLocations(host.paths, wsConfig)

        // Generate HTTPS server block if SSL is enabled
        val sslConfig = if (host.ssl) {
            val (hostCert, hostKey) = resolveSslCertPaths(host)

            val hostCertFile = File(hostCert)
            val hostKeyFile = File(hostKey)

            logger.info("Checking SSL files for ${host.domain} at:\nCert: ${hostCertFile.absolutePath}\nKey: ${hostKeyFile.absolutePath}")

            if (!hostCertFile.exists() || !hostKeyFile.exists()) {
                logger.warn("SSL fallback for ${host.domain}: Host files missing or inaccessible.")
                return generateNginxConfig(host.copy(ssl = false)).copy(second = "SSL Certificate missing on disk (checked ${hostCertFile.parent})")
            }

            val containerCert = translateToContainerPath(hostCert)
            val containerKey = translateToContainerPath(hostKey)

            logger.info("Using SSL config for ${host.domain}: $containerCert")

            val hstsHeader = if (host.hstsEnabled) {
                "add_header Strict-Transport-Security \"max-age=31536000; includeSubDomains\" always;"
            } else ""

            val httpsTemplate =
                ResourceLoader.loadResourceOrThrow("templates/proxy/server-https.conf")
            ResourceLoader.replacePlaceholders(
                httpsTemplate, mapOf(
                    "domain" to host.domain,
                    "sslCert" to containerCert,
                    "sslKey" to containerKey,
                    "hstsHeader" to hstsHeader,
                    "target" to host.target,
                    "websocketConfig" to wsConfig,
                    "ipRestrictions" to ipConfig,
                    "pathLocations" to pathLocations
                )
            )
        } else ""

        // Generate HTTP server block
        val httpRedirect = if (host.ssl) {
            "        return 301 https://\$host\$request_uri;\n"
        } else ""

        val httpProxyConfig = if (!host.ssl) {
            val proxyTemplate =
                ResourceLoader.loadResourceOrThrow("templates/proxy/http-proxy-config.conf")
            val proxyContent = ResourceLoader.replacePlaceholders(
                proxyTemplate, mapOf(
                    "target" to host.target,
                    "websocketConfig" to wsConfig,
                    "ipRestrictions" to ipConfig
                )
            )
            // Indent each line (8 spaces for location block)
            proxyContent.lines().joinToString("\n") { if (it.isBlank()) it else "        $it" }
        } else ""

        val httpTemplate = ResourceLoader.loadResourceOrThrow("templates/proxy/server-http.conf")
        val httpConfig = ResourceLoader.replacePlaceholders(
            httpTemplate, mapOf(
                "domain" to host.domain,
                "httpRedirect" to httpRedirect,
                "httpProxyConfig" to httpProxyConfig,
                "pathLocations" to pathLocations
            )
        )

        val config = "$httpConfig\n\n$sslConfig".trim()

        try {
            File(configDir, "${host.domain}.conf").writeText(config)
            return true to "Config generated"
        } catch (e: Exception) {
            logger.error("Failed to generate nginx config for ${host.domain}", e)
            return false to "Failed to write config: ${e.message}"
        }
    }

    private fun generatePathLocations(paths: List<PathRoute>, defaultWsConfig: String): String {
        // Filter out disabled paths
        val enabledPaths = paths.filter { it.enabled }
        if (enabledPaths.isEmpty()) return ""

        // Ensure all paths start with /
        val normalizedPaths = enabledPaths.map { route ->
            val normalizedPath = if (route.path.startsWith("/")) route.path else "/${route.path}"
            route.copy(path = normalizedPath)
        }

        // Sort paths by order (higher first), then by specificity (longer/more specific paths first)
        // This ensures paths with explicit ordering are matched first, then by specificity
        val sortedPaths =
            normalizedPaths.sortedWith(compareByDescending<PathRoute> { it.order }.thenByDescending { it.path.length })

        return sortedPaths.joinToString("\n\n") { pathRoute ->
            // Load websocket config if enabled for this path
            val wsConfigRaw = if (pathRoute.websocketEnabled) {
                ResourceLoader.loadResourceOrThrow("templates/proxy/websocket-config.conf")
            } else ""

            val wsConfig = if (wsConfigRaw.isNotEmpty()) {
                wsConfigRaw.lines().joinToString("\n        ") { it.trim() }
            } else ""

            // Generate IP restrictions for this path
            val ipConfig = if (pathRoute.allowedIps.isNotEmpty()) {
                pathRoute.allowedIps.joinToString("\n        ") { "allow $it;" } + "\n        deny all;"
            } else ""

            // Determine proxy_pass directive
            val proxyPass = if (pathRoute.stripPrefix) {
                // Remove the path prefix before forwarding
                // e.g., /api -> http://backend:8080 (removes /api prefix)
                val targetUrl = pathRoute.target.trimEnd('/')
                "proxy_pass $targetUrl/;"
            } else {
                // Keep the path prefix
                // e.g., /api -> http://backend:8080/api (keeps /api prefix)
                val targetUrl = pathRoute.target.trimEnd('/')
                "proxy_pass $targetUrl\$request_uri;"
            }

            // Custom config for this path
            val customConfig = pathRoute.customConfig?.let { config ->
                config.lines().joinToString("\n        ") { it.trim() }
            } ?: ""

            val locationTemplate =
                ResourceLoader.loadResourceOrThrow("templates/proxy/location-block.conf")
            ResourceLoader.replacePlaceholders(
                locationTemplate, mapOf(
                    "path" to pathRoute.path,
                    "proxyPass" to proxyPass,
                    "websocketConfig" to wsConfig,
                    "ipRestrictions" to ipConfig,
                    "customConfig" to customConfig
                )
            )
        }
    }

    private fun reloadNginx(): Pair<Boolean, String> {
        return try {
            logger.info("Reloading Nginx...")
            
            // Check if container is running first
            val checkCmd = "${AppConfig.dockerCommand} ps --filter name=$PROXY_CONTAINER_NAME --filter status=running --format '{{.Names}}'"
            val runningCheck = executeCommand(checkCmd).trim()
            if (runningCheck != PROXY_CONTAINER_NAME) {
                return false to "Proxy container is not running"
            }
            
            val reloadCmd = "${AppConfig.dockerCommand} exec $PROXY_CONTAINER_NAME openresty -s reload"
            val result = executeCommand(reloadCmd)
            
            // Check if reload was successful (nginx reload returns empty string on success)
            // Also check for common error patterns
            if (result.contains("error", ignoreCase = true) || 
                result.contains("failed", ignoreCase = true) ||
                result.contains("invalid", ignoreCase = true)) {
                logger.error("Nginx reload failed: $result")
                return false to result.ifBlank { "Nginx reload failed" }
            }
            
            if (result.isNotBlank()) {
                logger.info("Nginx Reload Output: $result")
            } else {
                logger.info("Nginx reloaded successfully")
            }
            
            true to "Nginx reloaded successfully"
        } catch (e: Exception) {
            logger.error("Error reloading nginx", e)
            false to "Error reloading nginx: ${e.message}"
        }
    }

    // ========== Proxy Container Management ==========

    companion object {
        const val PROXY_CONTAINER_NAME = "docker-manager-proxy"
        const val PROXY_IMAGE_NAME = "docker-manager-proxy"
        const val PROXY_IMAGE_TAG = "latest"
    }

    override fun buildProxyImage(): Pair<Boolean, String> {
        return try {
            logger.info("Building proxy Docker image using compose...")
            val composeFile = ensureComposeFile()
            val buildCmd =
                "${AppConfig.dockerComposeCommand} -f ${composeFile.absolutePath} build proxy"

            val result = executeComposeCommand(buildCmd, truncateOutput = true)
            if (result.exitCode == 0) {
                logger.info("Proxy image built successfully")
                true to "Proxy image built successfully\n${result.output}"
            } else {
                logger.error("Failed to build proxy image. Exit code: ${result.exitCode}")
                false to "Failed to build proxy image. Exit code: ${result.exitCode}\n${result.output}"
            }
        } catch (e: Exception) {
            logger.error("Error building proxy image", e)
            false to "Error building proxy image: ${e.message}"
        }
    }

    override fun createProxyContainer(): Pair<Boolean, String> {
        return try {
            logger.info("Creating proxy container using compose...")
            ensureComposeFile()
            ensureProxyDirectories()

            val result =
                executeComposeCommand("${AppConfig.dockerComposeCommand} up --no-start proxy")
            if (result.exitCode == 0) {
                logger.info("Proxy container created successfully")
                true to "Proxy container created successfully\n${result.output}"
            } else {
                logger.error("Failed to create proxy container. Exit code: ${result.exitCode}")
                false to "Failed to create proxy container. Exit code: ${result.exitCode}\n${result.output}"
            }
        } catch (e: Exception) {
            logger.error("Error creating proxy container", e)
            false to "Error creating proxy container: ${e.message}"
        }
    }

    override fun startProxyContainer(): Pair<Boolean, String> {
        return executeContainerCommand("start", "Starting", "started")
    }

    override fun stopProxyContainer(): Pair<Boolean, String> {
        return executeContainerCommand("stop", "Stopping", "stopped")
    }

    override fun restartProxyContainer(): Pair<Boolean, String> {
        return executeContainerCommand("restart", "Restarting", "restarted")
    }

    private fun executeContainerCommand(
        action: String,
        actionPresent: String,
        actionPast: String,
    ): Pair<Boolean, String> {
        return try {
            logger.info("$actionPresent proxy container using compose...")
            ensureComposeFile()

            val result = executeComposeCommand("${AppConfig.dockerComposeCommand} $action proxy")
            if (result.exitCode == 0) {
                logger.info("Proxy container $actionPast successfully")
                true to "Proxy container $actionPast successfully"
            } else {
                logger.error("Failed to $action proxy container. Exit code: ${result.exitCode}")
                false to "Failed to $action proxy container. Exit code: ${result.exitCode}\n${result.output}"
            }
        } catch (e: Exception) {
            logger.error("Error ${action}ing proxy container", e)
            false to "Error ${action}ing proxy container: ${e.message}"
        }
    }

    private fun executeComposeCommand(
        command: String,
        truncateOutput: Boolean = false,
    ): com.umeshsolanki.dockermanager.utils.ExecuteResult {
        val processBuilder = ProcessBuilder("sh", "-c", command).directory(proxyDockerComposeDir)
            .redirectErrorStream(true)

        val process = processBuilder.start()
        val outputFull = process.inputStream.bufferedReader().readText()
        val exitCode = process.waitFor()

        val output = if (truncateOutput && outputFull.length > 10000) {
            " (Truncated...)\n" + outputFull.takeLast(10000)
        } else {
            outputFull
        }

        return com.umeshsolanki.dockermanager.utils.ExecuteResult(output, "", exitCode)
    }

    private fun ensureProxyDirectories() {
        val nginxDir = AppConfig.proxyDir
        val certbotDir = AppConfig.certbotDir

        nginxDir.mkdirs()
        File(nginxDir, "conf.d").mkdirs()

        val logsDir = File(nginxDir, "logs")
        logsDir.mkdirs()
        logsDir.setWritable(true, false)
        logsDir.setReadable(true, false)
        logsDir.setExecutable(true, false)

        ensureLogFile(File(logsDir, "access.log"))
        ensureLogFile(File(logsDir, "error.log"))

        certbotDir.mkdirs()
        File(certbotDir, "conf").mkdirs()
        File(certbotDir, "www").mkdirs()

        // Create www/html directory for default page
        val wwwHtmlDir = File(nginxDir, "www/html")
        wwwHtmlDir.mkdirs()

        ensureNginxMainConfig()
        ensureDefaultServer()
        ensureDefaultPage(wwwHtmlDir)
    }

    private fun ensureLogFile(logFile: File) {
        if (!logFile.exists()) {
            logFile.createNewFile()
        }
        logFile.setWritable(true, false)
        logFile.setReadable(true, false)
    }

    override fun getProxyContainerStatus(): ProxyContainerStatus {
        return try {
            // Check if container exists
            val existsCmd =
                "${AppConfig.dockerCommand} ps -a --filter name=$PROXY_CONTAINER_NAME --format '{{.Names}}'"
            val exists = executeCommand(existsCmd).trim() == PROXY_CONTAINER_NAME

            if (!exists) {
                return ProxyContainerStatus(
                    exists = false,
                    running = false,
                    imageExists = checkImageExists(),
                    containerId = null,
                    status = "not created",
                    uptime = null
                )
            }

            // Get container details
            val inspectCmd =
                "${AppConfig.dockerCommand} inspect $PROXY_CONTAINER_NAME --format '{{.Id}}|{{.State.Running}}|{{.State.Status}}|{{.State.StartedAt}}'"
            val inspectOutput = executeCommand(inspectCmd).trim()

            if (inspectOutput.isBlank()) {
                return ProxyContainerStatus(
                    exists = exists,
                    running = false,
                    imageExists = checkImageExists(),
                    containerId = null,
                    status = "unknown",
                    uptime = null
                )
            }

            val parts = inspectOutput.split("|")
            val containerId = parts.getOrNull(0)
            val running = parts.getOrNull(1)?.toBoolean() ?: false
            val status = parts.getOrNull(2) ?: "unknown"
            val startedAt = parts.getOrNull(3)

            ProxyContainerStatus(
                exists = true,
                running = running,
                imageExists = checkImageExists(),
                containerId = containerId,
                status = status,
                uptime = startedAt
            )
        } catch (e: Exception) {
            logger.error("Error getting proxy container status", e)
            ProxyContainerStatus(
                exists = false,
                running = false,
                imageExists = false,
                containerId = null,
                status = "error: ${e.message}",
                uptime = null
            )
        }
    }

    override fun ensureProxyContainerExists(): Boolean {
        return try {
            logger.info("Ensuring proxy container is ready (using compose up -d)...")
            ensureComposeFile()
            ensureProxyDirectories()

            val result = executeComposeCommand("${AppConfig.dockerComposeCommand} up -d proxy")
            if (result.exitCode == 0) {
                logger.info("Proxy container is ready via compose")
                true
            } else {
                logger.error("Failed to ensure proxy container. Exit code: ${result.exitCode}\n${result.output}")
                false
            }
        } catch (e: Exception) {
            logger.error("Error ensuring proxy container exists", e)
            false
        }
    }

    override fun getComposeConfig(): String {
        return ensureComposeFile().readText()
    }

    private fun getDefaultComposeConfig(): String {
        val template = ResourceLoader.loadResourceOrThrow("templates/proxy/docker-compose.yml")
        return ResourceLoader.replacePlaceholders(
            template, mapOf(
                "nginxPath" to nginxPath,
                "certbotPath" to certbotPath,
                "customCertsPath" to customCertsPath
            )
        )
    }

    private fun getDefaultDockerfileConfig(): String {
        return ResourceLoader.loadResourceOrThrow("templates/proxy/Dockerfile.proxy")
    }

    private fun ensureComposeFile(): File {

        val composeFile = File(proxyDockerComposeDir, "docker-compose.yml")
        if (!composeFile.exists()) {
            logger.info("Creating default docker-compose.yml in ${proxyDockerComposeDir.absolutePath}")
            composeFile.writeText(getDefaultComposeConfig())
        }
        ensureDockerfile()
        return composeFile
    }

    private fun ensureDockerfile(): File {

        val dockerfile = File(proxyDockerComposeDir, "Dockerfile.proxy")
        if (!dockerfile.exists()) {
            logger.info("Creating default Dockerfile.proxy in ${proxyDockerComposeDir.absolutePath}")
            dockerfile.writeText(getDefaultDockerfileConfig())
        }
        return dockerfile
    }

    private fun translateToContainerPath(hostPath: String): String {
        val path = File(hostPath).absolutePath

        // Map dataRoot/certbot/conf -> /etc/letsencrypt
        val certbotConfHost = File(AppConfig.certbotDir, "conf").absolutePath
        if (path.startsWith(certbotConfHost)) {
            return path.replace(certbotConfHost, "/etc/letsencrypt")
        }

        // Map dataRoot/certs -> /etc/nginx/custom_certs
        val customCertHost = AppConfig.customCertDir.absolutePath
        if (path.startsWith(customCertHost)) {
            return path.replace(customCertHost, "/etc/nginx/custom_certs")
        }

        // If already a container path mentioned in custom path
        if (path.startsWith("/etc/letsencrypt") || path.startsWith("/etc/nginx/custom_certs")) {
            return path
        }

        return hostPath
    }

    private fun resolveSslCertPaths(host: ProxyHost): Pair<String, String> {
        val certsDir = AppConfig.letsEncryptDir

        return if (!host.customSslPath.isNullOrBlank() && host.customSslPath.contains("|")) {
            val parts = host.customSslPath.split("|")
            if (parts.size >= 2) {
                parts[0] to parts[1]
            } else {
                getDefaultCertPaths(certsDir, host.domain)
            }
        } else {
            getDefaultCertPaths(certsDir, host.domain)
        }
    }

    private fun getDefaultCertPaths(certsDir: File, domain: String): Pair<String, String> {
        val folder = findDomainFolder(certsDir, domain)
        return File(folder, "fullchain.pem").absolutePath to File(
            folder,
            "privkey.pem"
        ).absolutePath
    }

    private fun findDomainFolder(liveDir: File, domain: String): File {
        if (!liveDir.exists()) return File(liveDir, domain)

        // Exact match
        val exact = File(liveDir, domain)
        if (exact.exists()) return exact

        // Partial match (handles domain-0001 etc)
        val matches = liveDir.listFiles()?.filter { it.isDirectory && it.name.startsWith(domain) }
        return matches?.firstOrNull() ?: exact
    }

    private fun ensureNginxMainConfig() {
        val nginxConf = File(AppConfig.proxyDir, "nginx.conf")
        if (!nginxConf.exists()) {
            logger.info("Creating default nginx.conf in ${nginxConf.absolutePath}")
            nginxConf.writeText(getDefaultNginxConfig())
        }
    }

    private fun getDefaultNginxConfig(): String {
        return ResourceLoader.loadResourceOrThrow("templates/proxy/nginx.conf")
    }

    /**
     * Ensures the default server block is created for unmatched requests.
     * This provides a friendly landing page when no proxy host matches.
     * File is named with 'zz-' prefix to ensure it loads last (nginx loads configs alphabetically).
     */
    private fun ensureDefaultServer() {
        val defaultServerFile = File(configDir, "zz-default-server.conf")
        if (!defaultServerFile.exists()) {
            try {
                val defaultServerTemplate =
                    ResourceLoader.loadResourceOrThrow("templates/proxy/default-server.conf")
                defaultServerFile.writeText(defaultServerTemplate)
                logger.info("Created default nginx server block: ${defaultServerFile.absolutePath}")
            } catch (e: Exception) {
                logger.error("Failed to create default server block", e)
            }
        }
    }

    /**
     * Ensures the default HTML page exists for the default server.
     */
    private fun ensureDefaultPage(wwwHtmlDir: File) {
        val indexFile = File(wwwHtmlDir, "index.html")
        if (!indexFile.exists()) {
            try {
                val defaultPageTemplate =
                    ResourceLoader.loadResourceOrThrow("templates/proxy/default-index.html")
                indexFile.writeText(defaultPageTemplate)
                logger.info("Created default HTML page: ${indexFile.absolutePath}")
            } catch (e: Exception) {
                logger.error("Failed to create default HTML page", e)
            }
        }
    }

    override fun updateComposeConfig(content: String): Pair<Boolean, String> {
        return try {
            val composeFile = File(proxyDockerComposeDir, "docker-compose.yml")
            composeFile.writeText(content)
            true to "Compose configuration updated"
        } catch (e: Exception) {
            false to "Failed to update compose configuration: ${e.message}"
        }
    }

    override fun updateStatsSettings(active: Boolean, intervalMs: Long, filterLocalIps: Boolean?) {
        AppConfig.updateProxyStatsSettings(active, intervalMs, filterLocalIps)
    }

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
        val tempHitsByStatusMap = java.util.concurrent.ConcurrentHashMap<Int, Long>()
        val tempHitsByDomainMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
        val tempHitsByPathMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
        val tempHitsByIpMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
        val tempHitsByIpErrorMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
        val tempHitsByMethodMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
        val tempHitsByRefererMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
        val tempHitsByUserAgentMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
        val tempHitsByTimeMap = java.util.concurrent.ConcurrentHashMap<String, Long>()

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

    private fun checkImageExists(): Boolean {
        return try {
            val cmd =
                "${AppConfig.dockerCommand} images -q ${'$'}PROXY_IMAGE_NAME:${'$'}PROXY_IMAGE_TAG"
            val output = executeCommand(cmd).trim()
            output.isNotBlank()
        } catch (e: Exception) {
            logger.error("Error checking if image exists", e)
            false
        }
    }
}

// Service object for easy access
object ProxyService {
    private val service: IProxyService by lazy {
        ProxyServiceImpl(ServiceContainer.jailManagerService)
    }

    fun listHosts() = service.listHosts()
    fun createHost(host: ProxyHost) = service.createHost(host)
    fun deleteHost(id: String) = service.deleteHost(id)
    fun getStats() = service.getStats()
    fun toggleHost(id: String) = service.toggleHost(id)
    fun updateHost(host: ProxyHost) = service.updateHost(host)
    fun requestSSL(id: String) = service.requestSSL(id)
    fun listCertificates() = service.listCertificates()
    fun buildProxyImage() = service.buildProxyImage()
    fun createProxyContainer() = service.createProxyContainer()
    fun startProxyContainer() = service.startProxyContainer()
    fun stopProxyContainer() = service.stopProxyContainer()
    fun restartProxyContainer() = service.restartProxyContainer()
    fun getProxyContainerStatus() = service.getProxyContainerStatus()
    fun ensureProxyContainerExists() = service.ensureProxyContainerExists()
    fun getComposeConfig() = service.getComposeConfig()
    fun updateComposeConfig(content: String) = service.updateComposeConfig(content)
    fun updateStatsSettings(active: Boolean, intervalMs: Long, filterLocalIps: Boolean? = null) =
        service.updateStatsSettings(active, intervalMs, filterLocalIps)

    fun updateSecuritySettings(enabled: Boolean, thresholdNon200: Int, rules: List<ProxyJailRule>) =
        service.updateSecuritySettings(enabled, thresholdNon200, rules)

    fun getProxySecuritySettings() = AppConfig.proxySecuritySettings

    // Analytics History
    fun getHistoricalStats(date: String) = service.getHistoricalStats(date)
    fun listAvailableDates() = service.listAvailableDates()
    fun getStatsForDateRange(startDate: String, endDate: String) =
        service.getStatsForDateRange(startDate, endDate)

    fun forceReprocessLogs(date: String) = service.forceReprocessLogs(date)
    fun updateStatsForAllDaysInCurrentLog() = service.updateStatsForAllDaysInCurrentLog()
}

