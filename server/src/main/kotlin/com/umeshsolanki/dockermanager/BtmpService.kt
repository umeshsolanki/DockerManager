package com.umeshsolanki.dockermanager

import com.sun.jna.Native
import com.umeshsolanki.dockermanager.jna.Utmpx
import kotlinx.coroutines.*
import java.io.File
import java.io.RandomAccessFile
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.Paths
import java.nio.file.attribute.BasicFileAttributes
import java.util.concurrent.TimeUnit

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
    private val firewallService: IFirewallService
) : IBtmpService {
    private val logger = org.slf4j.LoggerFactory.getLogger(BtmpServiceImpl::class.java)
    val simpleDateFormat = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss")
    private val btmpPath = AppConfig.btmpLogFile.toPath()
    private var totalFailedAttempts = 0
    private val userCounts = mutableMapOf<String, Int>()
    private val ipCounts = mutableMapOf<String, Int>()
    private val recentFailuresList = mutableListOf<BtmpEntry>()
    
    private var lastInode: Any? = null
    private var lastPosition = 0L

    private var autoJailEnabled = AppConfig.jailSettings.jailEnabled
    private var jailThreshold = AppConfig.jailSettings.jailThreshold
    private var jailDurationMinutes = AppConfig.jailSettings.jailDurationMinutes
    private val jailedIps = mutableListOf<JailedIP>()
    private val failedAttemptsInWindow = mutableMapOf<String, Int>()

    private var cachedBtmpStats: BtmpStats = BtmpStats(0, emptyList(), emptyList(), emptyList(), 0)
    
    private var refreshIntervalMinutes = AppConfig.jailSettings.monitoringIntervalMinutes
    private var isMonitoringActive = AppConfig.jailSettings.monitoringActive
    
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var workerJob: Job? = null
    private var unjailJob: Job? = null

    init {
        startWorker()
        startUnjailWorker()
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

    private fun startUnjailWorker() {
        unjailJob = scope.launch {
            while (isActive) {
                try {
                    checkAndReleaseJails()
                } catch (e: Exception) {
                    logger.error("Error in Unjail worker", e)
                }
                delay(60000)
            }
        }
    }

    private fun checkAndReleaseJails() {
        val now = System.currentTimeMillis()
        val toRelease = jailedIps.filter { it.expiresAt <= now }
        
        if (toRelease.isNotEmpty()) {
            toRelease.forEach { jail ->
                firewallService.unblockIPByAddress(jail.ip)
                jailedIps.remove(jail)
            }
            updateCachedStats()
        }
    }

    override fun getStats(): BtmpStats = cachedBtmpStats

    override suspend fun refreshStats(): BtmpStats {
        updateStats()
        return cachedBtmpStats
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
        failedAttemptsInWindow.remove(ip)
    }

    override fun isIPJailed(ip: String): Boolean {
        val now = System.currentTimeMillis()
        return jailedIps.any { it.ip == ip && it.expiresAt > now }
    }

    private fun updateStats() {
        val file = btmpPath.toFile()
        if (!file.exists()) return

        try {
            val attrs = Files.readAttributes(btmpPath, BasicFileAttributes::class.java, LinkOption.NOFOLLOW_LINKS)
            val currentInode = attrs.fileKey()
            val currentSize = attrs.size()

            if (lastInode != null && currentInode != lastInode) {
                 // File rotated. Try to finish processing the old file if possible.
                 val rotated = File(btmpPath.parent.toFile(), "btmp.1")
                 if (rotated.exists()) {
                     try {
                         val rotAttrs = Files.readAttributes(rotated.toPath(), BasicFileAttributes::class.java, LinkOption.NOFOLLOW_LINKS)
                         if (rotAttrs.fileKey() == lastInode) {
                             processBtmpFile(rotated, lastPosition)
                         }
                     } catch(ignore: Exception) {}
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

    private val countryCache = java.util.concurrent.ConcurrentHashMap<String, String>()

    private fun getCountryCode(ip: String): String {
        if (ip == "0.0.0.0" || ip.startsWith("127.") || ip.startsWith("192.168.") || ip.startsWith("10.")) return "LOC"
        
        return "??"
    //countryCache.computeIfAbsent(ip) { _ ->
//            try {
                // Rate limit protection: simple sleep if cache miss (not ideal for main thread but worker is async)
                // Better: just fetch
//                val json = java.net.URL("http://ip-api.com/json/$ip?fields=countryCode").readText()
//                // Simple regex extract
//                val match = "\"countryCode\":\"([^\"]+)\"".toRegex().find(json)
//                match?.groupValues?.get(1) ?: "??"

//            } catch (e: Exception) {
//                "??"
//            }
//        }
    }

    private fun handleFailedAttempt(user: String, ip: String, timestamp: Long) {
        if (ip.isBlank()) return

        totalFailedAttempts++
        userCounts[user] = (userCounts[user] ?: 0) + 1
        ipCounts[ip] = (ipCounts[ip] ?: 0) + 1
        
        // Background fetch country if not cached, to populate cache for UI
        if (!countryCache.containsKey(ip)) {
             scope.launch(Dispatchers.IO) { getCountryCode(ip) }
        }
        
        if (autoJailEnabled && jailedIps.none { it.ip == ip }) {
            failedAttemptsInWindow[ip] = (failedAttemptsInWindow[ip] ?: 0) + 1
            if (failedAttemptsInWindow[ip]!! >= jailThreshold) {
                val expiresAt = System.currentTimeMillis() + (jailDurationMinutes * 60_000)
                val jail = JailedIP(
                    ip = ip, 
                    country = getCountryCode(ip),
                    reason = "Failed login >= $jailThreshold failed attempts", 
                    expiresAt = expiresAt
                )
                firewallService.blockIP(BlockIPRequest(ip, comment = jail.reason))
                jailedIps.add(jail)
                failedAttemptsInWindow.remove(ip)
            }
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
            topUsers = userCounts.toList().sortedByDescending { it.second }.take(100),
            topIps = ipCounts.toList().sortedByDescending { it.second }.take(100).map {
                TopIpEntry(it.first, it.second, getCountryCode(it.first))
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
