package com.umeshsolanki.dockermanager.jail

import com.sun.jna.Native
import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.ServiceContainer
import com.umeshsolanki.dockermanager.firewall.FirewallServiceImpl
import com.umeshsolanki.dockermanager.firewall.IFirewallService
import com.umeshsolanki.dockermanager.jna.Utmpx
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File
import java.io.RandomAccessFile
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.attribute.BasicFileAttributes

interface IBtmpService {
    fun getStats(): BtmpStats
    suspend fun refreshStats(): BtmpStats
    fun updateAutoJailSettings(enabled: Boolean, threshold: Int, durationMinutes: Int)
    fun updateMonitoringSettings(active: Boolean, intervalMinutes: Int)
    fun recordFailedAttempt(user: String, ip: String)
    fun clearFailedAttempts(ip: String)
    fun isIPJailed(ip: String): Boolean
}

class BtmpServiceImpl(
    private val jailManagerService: IJailManagerService,
) : IBtmpService {
    private val logger = org.slf4j.LoggerFactory.getLogger(BtmpServiceImpl::class.java)
    val simpleDateFormat = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss")
    private val btmpPath = AppConfig.btmpLogFile.toPath()
    private var totalFailedAttempts = 0L
    private val userCounts = mutableMapOf<String, Int>()
    private val ipCounts = mutableMapOf<String, Int>()
    private val recentFailuresList = mutableListOf<BtmpEntry>()

    private var lastInode: Any? = null
    private var lastPosition = 0L

    private var autoJailEnabled = AppConfig.jailSettings.jailEnabled
    private var jailThreshold = AppConfig.jailSettings.jailThreshold
    private var jailDurationMinutes = AppConfig.jailSettings.jailDurationMinutes
    private val jailedIps = java.util.concurrent.CopyOnWriteArrayList<JailedIP>()

    private var cachedBtmpStats: BtmpStats = BtmpStats(
        totalFailedAttempts = 0L,
        topUsers = emptyList(),
        topIps = emptyList(),
        recentFailures = emptyList(),
        lastUpdated = 0L,
        jailedIps = emptyList(),
        autoJailEnabled = false,
        jailThreshold = 0,
        jailDurationMinutes = 0,
        refreshIntervalMinutes = 0,
        isMonitoringActive = false
    )

    private var refreshIntervalMinutes = AppConfig.jailSettings.monitoringIntervalMinutes
    private var isMonitoringActive = AppConfig.jailSettings.monitoringActive

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var workerJob: Job? = null

    init {
        loadExistingJails()
        startWorker()
        syncJailsPeriodically()
    }

    private fun loadExistingJails() {
        try {
            val jails = jailManagerService.listJails()
            jailedIps.clear()
            jailedIps.addAll(jails)
            updateCachedStats()
            logger.debug("Synced ${jailedIps.size} jailed IPs from firewall")
        } catch (e: Exception) {
            logger.error("Failed to sync jailed IPs", e)
        }
    }

    private fun startWorker() {
        workerJob?.cancel()
        workerJob = scope.launch {
            while (isActive) {
                if (isMonitoringActive) {
                    try {
                        updateStats()
                    } catch (e: Exception) {
                        logger.error("Error in Btmp worker", e)
                    }
                }
                delay(refreshIntervalMinutes * 60_000L)
            }
        }
    }


    override fun getStats(): BtmpStats = cachedBtmpStats

    override suspend fun refreshStats(): BtmpStats {
        loadExistingJails()
        updateStats()
        return cachedBtmpStats
    }

    // Periodically sync jails from JailManagerService to update cached stats
    private fun syncJailsPeriodically() {
        scope.launch {
            while (isActive) {
                try {
                    loadExistingJails()
                } catch (e: Exception) {
                    logger.error("Error syncing jails", e)
                }
                delay(60000) // Sync every minute
            }
        }
    }

    override fun updateAutoJailSettings(enabled: Boolean, threshold: Int, durationMinutes: Int) {
        this.autoJailEnabled = enabled
        this.jailThreshold = threshold
        this.jailDurationMinutes = durationMinutes

        AppConfig.updateJailSettings(enabled, threshold, durationMinutes)

        updateCachedStats()
    }

    override fun updateMonitoringSettings(active: Boolean, intervalMinutes: Int) {
        val needRestart = intervalMinutes != this.refreshIntervalMinutes

        this.isMonitoringActive = active
        this.refreshIntervalMinutes = intervalMinutes.coerceAtLeast(1)

        AppConfig.updateJailSettings(
            enabled = this.autoJailEnabled,
            threshold = this.jailThreshold,
            durationMinutes = this.jailDurationMinutes,
            monitoringActive = active,
            monitoringIntervalMinutes = this.refreshIntervalMinutes
        )

        updateCachedStats()

        if (needRestart) {
            startWorker()
        }
    }

    override fun recordFailedAttempt(user: String, ip: String) {
        handleFailedAttempt(user, ip, System.currentTimeMillis())
        updateCachedStats()
    }

    override fun clearFailedAttempts(ip: String) {
        jailManagerService.clearFailedAttempts(ip)
    }

    override fun isIPJailed(ip: String): Boolean {
        return jailManagerService.isIPJailed(ip)
    }

    private fun updateStats() {
        val file = btmpPath.toFile()
        if (!file.exists()) return

        try {
            val attrs = Files.readAttributes(
                btmpPath, BasicFileAttributes::class.java, LinkOption.NOFOLLOW_LINKS
            )
            val currentInode = attrs.fileKey()
            val currentSize = attrs.size()

            if (lastInode != null && currentInode != lastInode) {
                // File rotated. Try to finish processing the old file if possible.
                val rotated = File(btmpPath.parent.toFile(), "btmp.1")
                if (rotated.exists()) {
                    try {
                        val rotAttrs = Files.readAttributes(
                            rotated.toPath(),
                            BasicFileAttributes::class.java,
                            LinkOption.NOFOLLOW_LINKS
                        )
                        if (rotAttrs.fileKey() == lastInode) {
                            processBtmpFile(rotated, lastPosition)
                        }
                    } catch (ignore: Exception) {
                    }
                }
                lastPosition = 0L
            }

            lastInode = currentInode

            if (currentSize > lastPosition) {
                lastPosition = processBtmpFile(file, lastPosition)
                updateCachedStats()
            } else if (currentSize < lastPosition) {
                // File truncated
                lastPosition = 0L
                lastPosition = processBtmpFile(file, lastPosition)
                updateCachedStats()
            }
        } catch (e: Exception) {
            logger.error("Error updating Btmp stats", e)
        }
    }

    private fun processBtmpFile(file: File, startOffset: Long): Long {
        var currentOffset = startOffset
        val utmpx = Utmpx()
        // Ensure structure memory is allocated
        // size() returns the size of the structure in bytes
        val structSize = utmpx.size()

        RandomAccessFile(file, "r").use { raf ->
            val len = raf.length()
            if (currentOffset >= len) return len

            raf.seek(currentOffset)
            val buffer = ByteArray(structSize)

            while (currentOffset + structSize <= len && raf.read(buffer) == structSize) {
                // Copy buffer to structure memory
                utmpx.pointer.write(0, buffer, 0, structSize)
                // Sync fields from memory
                utmpx.read()

                val user = Native.toString(utmpx.ut_user)
                val host = Native.toString(utmpx.ut_host)
                // ut_tv is struct timeval { int32_t tv_sec; int32_t tv_usec; }
                val timestamp = (utmpx.ut_tv.tv_sec.toLong() * 1000L)
                val type = utmpx.ut_type.toInt()

                // Usually type 7 (USER_PROCESS) or 6 (LOGIN_PROCESS) appear in btmp for failed logins
                // But generally anything in btmp is a failed login.
                if (user.isNotBlank() && type != 0) {
                    handleFailedAttempt(user, host, timestamp)
                }

                currentOffset += structSize
            }
        }
        return currentOffset
    }

    private fun getCountryCode(ip: String): String = jailManagerService.getCountryCode(ip)

    private fun handleFailedAttempt(user: String, ip: String, timestamp: Long) {
        if (ip.isBlank()) return

        totalFailedAttempts++
        userCounts[user] = (userCounts[user] ?: 0) + 1
        ipCounts[ip] = (ipCounts[ip] ?: 0) + 1

        // Background fetch country if not cached, to populate cache for UI
        scope.launch(Dispatchers.IO) { jailManagerService.getCountryCode(ip) }

        // Record failed attempt and check for auto-jail (handled by JailManagerService)
        if (autoJailEnabled) {
            jailManagerService.recordFailedLoginAttempt(ip)
            // Reload jails to update cache
            loadExistingJails()
        }

        // Add to history
        val entry = BtmpEntry(
            user = user,
            ip = ip,
            country = getCountryCode(ip),
            session = "",
            timestampString = simpleDateFormat.format(java.util.Date(timestamp)),
            timestamp = timestamp,
            duration = ""
        )

        recentFailuresList.add(0, entry)
        if (recentFailuresList.size > 1000) {
            recentFailuresList.removeAt(recentFailuresList.size - 1)
        }
    }

    private fun updateCachedStats() {
        cachedBtmpStats = BtmpStats(
            totalFailedAttempts = totalFailedAttempts,
            topUsers = userCounts.toList().sortedByDescending { it.second }.take(100)
                .map { TopUserEntry(it.first, it.second.toLong()) },
            topIps = ipCounts.toList().sortedByDescending { it.second }.take(100).map {
                TopIpEntry(it.first, it.second.toLong(), getCountryCode(it.first))
            },
            recentFailures = recentFailuresList.take(200).toList(),
            lastUpdated = System.currentTimeMillis(),
            jailedIps = jailedIps.toList(),
            autoJailEnabled = autoJailEnabled,
            jailThreshold = jailThreshold,
            jailDurationMinutes = jailDurationMinutes,
            refreshIntervalMinutes = refreshIntervalMinutes,
            isMonitoringActive = isMonitoringActive
        )
    }
}

// Service object for easy access
object BtmpService {
    private val service: IBtmpService by lazy {
        BtmpServiceImpl(ServiceContainer.jailManagerService)
    }

    fun getStats() = service.getStats()
    suspend fun refreshStats() = service.refreshStats()
    fun updateAutoJailSettings(enabled: Boolean, threshold: Int, durationMinutes: Int) =
        service.updateAutoJailSettings(enabled, threshold, durationMinutes)

    fun updateMonitoringSettings(active: Boolean, intervalMinutes: Int) =
        service.updateMonitoringSettings(active, intervalMinutes)

    fun recordFailedAttempt(user: String, ip: String) = service.recordFailedAttempt(user, ip)
    fun clearFailedAttempts(ip: String) = service.clearFailedAttempts(ip)
    fun isIPJailed(ip: String) = service.isIPJailed(ip)
}
