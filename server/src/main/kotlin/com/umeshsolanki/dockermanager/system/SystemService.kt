package com.umeshsolanki.dockermanager.system

import com.umeshsolanki.dockermanager.*
import com.umeshsolanki.dockermanager.ServiceContainer
import com.umeshsolanki.dockermanager.auth.AuthService
import com.umeshsolanki.dockermanager.docker.DockerClientProvider
import com.umeshsolanki.dockermanager.docker.DockerService
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import com.umeshsolanki.dockermanager.database.SettingsTable
import java.sql.ResultSet
import kotlinx.coroutines.*
import java.util.concurrent.TimeUnit

object SystemService {
    private val osName = System.getProperty("os.name").lowercase()
    private val logger = org.slf4j.LoggerFactory.getLogger(SystemService::class.java)

    private val monitor = BackgroundStorageMonitor()

    init {
        monitor.start()
    }

    fun getBatteryStatus(): BatteryStatus {
        return when {
            osName.contains("mac") -> getMacBattery()
            osName.contains("linux") -> getLinuxBattery()
            osName.contains("win") -> getWindowsBattery()
            else -> BatteryStatus(-1, false, "Unsupported OS ($osName)")
        }
    }

    private fun getMacBattery(): BatteryStatus {
        return try {
            val output = executeCommand("pmset -g batt")
            parseMacBattery(output)
        } catch (e: Exception) {
            BatteryStatus(0, false, "Error (Mac)")
        }
    }

    private fun getLinuxBattery(): BatteryStatus {
        return try {
            // Ubuntu/Debian standard paths
            val capacity = executeCommand("cat /sys/class/power_supply/BAT0/capacity").trim().toIntOrNull() ?: 0
            val status = executeCommand("cat /sys/class/power_supply/BAT0/status").trim().lowercase()
            val isCharging = status == "charging"
            val source = if (status == "discharging") "Battery" else "AC Power"
            
            BatteryStatus(capacity, isCharging, source)
        } catch (e: Exception) {
            BatteryStatus(0, false, "Error (Linux)")
        }
    }

    private fun getWindowsBattery(): BatteryStatus {
        return try {
            val percentageOutput = executeCommand("wmic path Win32_Battery get EstimatedChargeRemaining")
            val percentage = percentageOutput.lines().getOrNull(1)?.trim()?.toIntOrNull() ?: 0
            
            val statusOutput = executeCommand("wmic path Win32_Battery get BatteryStatus")
            val statusCode = statusOutput.lines().getOrNull(1)?.trim()?.toIntOrNull() ?: 0
            // 1 = Discharging, 2 = AC Power, 3 = Fully Charged, 6 = Charging
            val isCharging = statusCode == 6
            val source = if (statusCode == 1) "Battery" else "AC Power"
            
            BatteryStatus(percentage, isCharging, source)
        } catch (e: Exception) {
            BatteryStatus(0, false, "Error (Windows)")
        }
    }

    private fun executeCommand(command: String): String {
        val process = ProcessBuilder("sh", "-c", command).start()
        process.waitFor(2, TimeUnit.SECONDS)
        return process.inputStream.bufferedReader().readText()
    }

    private fun parseMacBattery(output: String): BatteryStatus {
        val lines = output.lines()
        val source = if (lines.getOrNull(0)?.contains("Battery Power") == true) "Battery" else "AC Power"
        val batteryLine = lines.find { it.contains("InternalBattery") } ?: return BatteryStatus(0, false, "Not Found")
        
        val percentage = batteryLine.substringAfter("\t")
            .substringBefore("%")
            .trim()
            .toIntOrNull() ?: 0
            
        val isCharging = batteryLine.contains("charging") && !batteryLine.contains("discharging")
        return BatteryStatus(percentage, isCharging, source)
    }
    
    fun getSystemConfig() = SystemConfig(
        dockerCommand = AppConfig.dockerCommand,
        dockerComposeCommand = AppConfig.dockerComposeCommand,
        dockerSocket = AppConfig.dockerSocket,
        dataRoot = AppConfig.dataRoot.absolutePath,
        jamesWebAdminUrl = AppConfig.jamesWebAdminUrl,
        appVersion = AppConfig.appVersion,
        twoFactorEnabled = AuthService.is2FAEnabled(),
        username = AuthService.getUsername(),
        proxyStatsActive = AppConfig.settings.proxyStatsActive,
        proxyStatsIntervalMs = AppConfig.settings.proxyStatsIntervalMs,
        storageBackend = AppConfig.storageBackend,
        dockerBuildKit = AppConfig.settings.dockerBuildKit,
        dockerCliBuild = AppConfig.settings.dockerCliBuild,
        autoStorageRefresh = AppConfig.settings.autoStorageRefresh,
        autoStorageRefreshIntervalMinutes = AppConfig.settings.autoStorageRefreshIntervalMinutes,
        kafkaSettings = AppConfig.settings.kafkaSettings,
        dbPersistenceLogsEnabled = AppConfig.settings.dbPersistenceLogsEnabled,
        osName = osName,
        syslogEnabled = AppConfig.settings.syslogEnabled,
        syslogServer = AppConfig.settings.syslogServer,
        syslogServerInternal = AppConfig.settings.syslogServerInternal,
        syslogPort = AppConfig.settings.syslogPort,
        syslogIsRunning = false,
        proxyRsyslogEnabled = AppConfig.settings.proxyRsyslogEnabled,
        proxyDualLoggingEnabled = AppConfig.settings.proxyDualLoggingEnabled,
        nginxLogDir = AppConfig.nginxLogDir.absolutePath,
        logBufferingEnabled = AppConfig.settings.logBufferingEnabled,
        logBufferSizeKb = AppConfig.settings.logBufferSizeKb,
        logFlushIntervalSeconds = AppConfig.settings.logFlushIntervalSeconds,
        jailEnabled = AppConfig.settings.jailEnabled,
        jailThreshold = AppConfig.settings.jailThreshold,
        jailDurationMinutes = AppConfig.settings.jailDurationMinutes,
        exponentialJailEnabled = AppConfig.settings.exponentialJailEnabled,
        maxJailDurationMinutes = AppConfig.settings.maxJailDurationMinutes
    )
    
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO + CoroutineName("SystemService"))

    fun updateSystemConfig(request: UpdateSystemConfigRequest) {
        // Fast updates: Save settings to disk/DB
        AppConfig.updateSettings(
            dockerSocket = request.dockerSocket,
            jamesWebAdminUrl = request.jamesWebAdminUrl,
            dockerBuildKit = request.dockerBuildKit,
            dockerCliBuild = request.dockerCliBuild,
            autoStorageRefresh = request.autoStorageRefresh,
            autoStorageRefreshIntervalMinutes = request.autoStorageRefreshIntervalMinutes,
            kafkaSettings = request.kafkaSettings
        )

        if (request.jailEnabled != null || request.jailThreshold != null || request.jailDurationMinutes != null || 
            request.exponentialJailEnabled != null || request.maxJailDurationMinutes != null) {
            
            AppConfig.updateJailSettings(
                enabled = request.jailEnabled ?: AppConfig.settings.jailEnabled,
                threshold = request.jailThreshold ?: AppConfig.settings.jailThreshold,
                durationMinutes = request.jailDurationMinutes ?: AppConfig.settings.jailDurationMinutes,
                exponentialEnabled = request.exponentialJailEnabled,
                maxDuration = request.maxJailDurationMinutes
            )
        }

        // Slow updates: Background service management
        serviceScope.launch {
            try {
                // Handle Logging Settings (Includes Nginx Reload)
                if (request.dbPersistenceLogsEnabled != null || request.nginxLogDir != null ||
                    request.logBufferingEnabled != null || request.logBufferSizeKb != null || request.logFlushIntervalSeconds != null) {
                    ServiceContainer.proxyService.updateLoggingSettings(
                        request.dbPersistenceLogsEnabled,
                        request.nginxLogDir,
                        logBufferingEnabled = request.logBufferingEnabled,
                        logBufferSizeKb = request.logBufferSizeKb,
                        logFlushIntervalSeconds = request.logFlushIntervalSeconds
                    )
                }
                
                // Handle Syslog Settings (Includes Nginx Reload)
                val syslogPort = request.syslogPort ?: AppConfig.settings.syslogPort
                val syslogServer = request.syslogServer ?: AppConfig.settings.syslogServer
                val syslogServerInternal = request.syslogServerInternal ?: AppConfig.settings.syslogServerInternal
                val syslogEnabled = request.syslogEnabled ?: AppConfig.settings.syslogEnabled
                
                val syslogChanged = syslogPort != AppConfig.settings.syslogPort || 
                                   syslogServer != AppConfig.settings.syslogServer || 
                                   syslogServerInternal != AppConfig.settings.syslogServerInternal ||
                                   syslogEnabled != AppConfig.settings.syslogEnabled
                
                if (syslogChanged) {
                    AppConfig.updateSyslogSettings(syslogEnabled, syslogServer, syslogPort, syslogServerInternal)
                    ServiceContainer.proxyService.updateRsyslogSettings(
                        AppConfig.settings.proxyRsyslogEnabled,
                        AppConfig.settings.proxyDualLoggingEnabled
                    )
                }
                
                if (request.proxyRsyslogEnabled != null || request.proxyDualLoggingEnabled != null) {
                    val enabled = request.proxyRsyslogEnabled ?: AppConfig.settings.proxyRsyslogEnabled
                    val dual = request.proxyDualLoggingEnabled ?: AppConfig.settings.proxyDualLoggingEnabled
                    ServiceContainer.proxyService.updateRsyslogSettings(enabled, dual)
                }

                // Refresh Docker client
                DockerClientProvider.refreshClient()
                DockerService.refreshServices()
                
                // Restart Kafka in background if settings provided
                if (request.kafkaSettings != null) {
                    logger.info("Restarting Kafka service with new settings...")
                    ServiceContainer.kafkaService.stop()
                    ServiceContainer.kafkaService.start(AppConfig.settings.kafkaSettings)
                    logger.info("Kafka service restarted successfully.")
                }
            } catch (e: Exception) {
                logger.error("Failed to apply some system configurations in background", e)
            }
        }
    }

    fun getStorageInfo(): StorageInfo {
        val root = AppConfig.dataRoot
        val total = root.totalSpace
        val free = root.usableSpace
        val used = total - free
        
        // All Partitions (Lightweight)
        val partitions = java.io.File.listRoots().map { f ->
            val pTotal = f.totalSpace
            val pFree = f.usableSpace
             DiskPartition(
                path = f.absolutePath,
                total = pTotal,
                free = pFree,
                used = pTotal - pFree,
                usagePercentage = if (pTotal > 0) ((pTotal - pFree).toDouble() / pTotal.toDouble()) * 100 else 0.0
            )
        }.filter { it.total > 0 }

        val backgroundStats = monitor.getLatestStats()

        return StorageInfo(
            total = total,
            free = free,
            used = used,
            dataRootSize = backgroundStats.dataRootSize,
            dataRootPath = root.absolutePath,
            partitions = partitions,
            dockerUsage = backgroundStats.dockerUsage
        )
    }

    fun refreshStorageInfo() {
        monitor.triggerManualRefresh()
    }

    private fun getDockerStorageUsage(): DockerStorageUsage? {
        return try {
            val output = executeCommand("${AppConfig.dockerCommand} system df")
            var imagesSize = 0L
            var containersSize = 0L
            var volumesSize = 0L
            var buildCacheSize = 0L

            output.lines().forEach { line ->
                val parts = line.trim().split(Regex("\\s{2,}")).filter { it.isNotBlank() }
                if (parts.size >= 4) {
                    val type = parts[0]
                    val sizeStr = parts[3]
                    val sizeBytes = parseSizeToBytes(sizeStr)
                    when {
                        type.contains("Images", ignoreCase = true) -> imagesSize = sizeBytes
                        type.contains("Containers", ignoreCase = true) -> containersSize = sizeBytes
                        type.contains("Local Volumes", ignoreCase = true) || type.contains("Volumes", ignoreCase = true) -> volumesSize = sizeBytes
                        type.contains("Build Cache", ignoreCase = true) -> buildCacheSize = sizeBytes
                    }
                }
            }
            DockerStorageUsage(imagesSize, containersSize, volumesSize, buildCacheSize)
        } catch (e: Exception) {
            logger.warn("Failed to parse docker system df: ${e.message}")
            null
        }
    }

    private fun parseSizeToBytes(sizeStr: String): Long {
        try {
            val clean = sizeStr.uppercase().trim().replace(" ", "")
            val valueStr = clean.filter { it.isDigit() || it == '.' }
            val value = valueStr.toDoubleOrNull() ?: return 0L
            
            return when {
                clean.endsWith("PB") -> (value * 1125899906842624L).toLong()
                clean.endsWith("TB") -> (value * 1099511627776L).toLong()
                clean.endsWith("GB") -> (value * 1073741824L).toLong()
                clean.endsWith("MB") -> (value * 1048576L).toLong()
                clean.endsWith("KB") -> (value * 1024L).toLong()
                else -> value.toLong()
            }
        } catch (e: Exception) {
            return 0L
        }
    }

    private class BackgroundStorageMonitor {
        private val logger = org.slf4j.LoggerFactory.getLogger(BackgroundStorageMonitor::class.java)
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO + CoroutineName("StorageMonitor"))

        @Serializable
        data class StorageStats(
            val dataRootSize: Long = 0,
            val dockerUsage: DockerStorageUsage? = null
        )

        @Volatile
        private var latestStats = loadStatsFromDb()

        private val isRunning = java.util.concurrent.atomic.AtomicBoolean(false)
        private var currentJob: Job? = null

        fun start() {
            scope.launch {
                while (isActive) {
                    if (AppConfig.settings.autoStorageRefresh && !isRunning.get()) {
                        updateStats()
                    }
                    val interval = AppConfig.settings.autoStorageRefreshIntervalMinutes.coerceAtLeast(1)
                    delay(TimeUnit.MINUTES.toMillis(interval.toLong()))
                }
            }
        }

        fun triggerManualRefresh() {
            synchronized(this) {
                if (isRunning.get()) {
                    logger.info("Cancelling current storage sync for manual refresh...")
                    currentJob?.cancel()
                }
                currentJob = scope.launch {
                    updateStats()
                }
            }
        }

        fun getLatestStats() = latestStats

        private suspend fun updateStats() {
            if (!isRunning.compareAndSet(false, true)) return
            try {
                logger.info("Starting storage sync...")
                val root = AppConfig.dataRoot
                var dataRootSize = 0L
                if (root.exists()) {
                    // Cooperative walking to allow cancellation
                    root.walkBottomUp().forEach { file ->
                        yield() // Check for cancellation and give others a chance
                        if (file.isFile) {
                            dataRootSize += file.length()
                        }
                    }
                }

                yield()

                val dockerUsage = try {
                    val output = SystemService.executeCommand("${AppConfig.dockerCommand} system df")
                    yield()

                    var imagesSize = 0L
                    var containersSize = 0L
                    var volumesSize = 0L
                    var buildCacheSize = 0L

                    output.lines().forEach { line ->
                        val parts = line.trim().split(Regex("\\s{2,}")).filter { it.isNotBlank() }
                        if (parts.size >= 4) {
                            val type = parts[0]
                            val sizeStr = parts[3]
                            val sizeBytes = parseSizeToBytes(sizeStr)
                            when {
                                type.contains("Images", ignoreCase = true) -> imagesSize = sizeBytes
                                type.contains("Containers", ignoreCase = true) -> containersSize = sizeBytes
                                type.contains("Local Volumes", ignoreCase = true) || type.contains("Volumes", ignoreCase = true) -> volumesSize = sizeBytes
                                type.contains("Build Cache", ignoreCase = true) -> buildCacheSize = sizeBytes
                            }
                        }
                    }
                    DockerStorageUsage(imagesSize, containersSize, volumesSize, buildCacheSize)
                } catch (e: Exception) {
                    null
                }

                yield()

                latestStats = StorageStats(dataRootSize, dockerUsage)
                saveStatsToDb(latestStats)
                logger.info("Storage sync complete.")
            } catch (e: CancellationException) {
                logger.info("Storage sync was cancelled.")
                throw e
            } catch (e: Exception) {
                logger.error("Error in storage monitor", e)
            } finally {
                isRunning.set(false)
            }
        }
    }

    private fun saveStatsToDb(stats: BackgroundStorageMonitor.StorageStats) {
        try {
            val json = AppConfig.json.encodeToString(BackgroundStorageMonitor.StorageStats.serializer(), stats)
            AppConfig.saveStorageStats(json)
        } catch (e: Exception) {
            logger.error("Failed to save storage stats to DB", e)
        }
    }

    private fun loadStatsFromDb(): BackgroundStorageMonitor.StorageStats {
        try {
            val json = AppConfig.loadStorageStats()
            return if (json != null) {
                AppConfig.json.decodeFromString(BackgroundStorageMonitor.StorageStats.serializer(), json)
            } else {
                BackgroundStorageMonitor.StorageStats()
            }
        } catch (e: Exception) {
            logger.error("Failed to load storage stats from DB", e)
            return BackgroundStorageMonitor.StorageStats()
        }
    }
}
