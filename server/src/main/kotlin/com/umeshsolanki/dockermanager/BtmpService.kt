package com.umeshsolanki.dockermanager

import kotlinx.coroutines.*
import java.io.File
import java.util.concurrent.TimeUnit

interface IBtmpService {
    fun getStats(): BtmpStats
    suspend fun refreshStats(): BtmpStats
    fun updateAutoJailSettings(enabled: Boolean, threshold: Int, durationMinutes: Int)
}

class BtmpServiceImpl(
    private val firewallService: IFirewallService
) : IBtmpService {
    private val btmpFile = File("/host/var/log/btmp")
    private var totalFailedAttempts = 0
    private val userCounts = mutableMapOf<String, Int>()
    private val ipCounts = mutableMapOf<String, Int>()
    private val recentFailuresList = mutableListOf<BtmpEntry>()
    private var lastProcessedSize = 0L

    private var autoJailEnabled = false
    private var jailThreshold = 5
    private var jailDurationMinutes = 30
    private val jailedIps = mutableListOf<JailedIP>()
    private val failedAttemptsInWindow = mutableMapOf<String, Int>()

    private var cachedBtmpStats: BtmpStats = BtmpStats(0, emptyList(), emptyList(), emptyList(), 0)
    
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var workerJob: Job? = null
    private var unjailJob: Job? = null

    init {
        startWorker()
        startUnjailWorker()
    }

    private fun startWorker() {
        workerJob = scope.launch {
            while (isActive) {
                try {
                    updateStats()
                } catch (e: Exception) {
                    e.printStackTrace()
                }
                delay(30000)
            }
        }
    }

    private fun startUnjailWorker() {
        unjailJob = scope.launch {
            while (isActive) {
                try {
                    checkAndReleaseJails()
                } catch (e: Exception) {
                    e.printStackTrace()
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
        updateCachedStats()
    }


    private fun processFileRange(file: File, startByte: Long) {
        val deltaFile = File("/tmp/btmp_delta_${System.currentTimeMillis()}")
        try {
            executeCommand("head -c +${startByte + 1} ${file.absolutePath} > ${deltaFile.absolutePath}")
            val output = executeCommand("lastb -f ${deltaFile.absolutePath}")
            
            val lines = output.lines().filter { it.isNotBlank() }
            if (lines.isNotEmpty()) {
                lines.forEach { line ->
                    val parts = line.trim().split(Regex("\\s+"))
                    if (parts.size >= 4) {
                        val user = parts[0]
                        val session = parts[1]
                        val ip = parts[2]
                        val timeStr = parts.slice(3 until minOf(parts.size, 7)).joinToString(" ")
                        val duration = if (parts.size > 10) parts.last() else ""

                        if (user != "last" && user != "btmp" && user != "btmp_delta" && session != "begins") {
                            totalFailedAttempts++
                            userCounts[user] = (userCounts[user] ?: 0) + 1
                            ipCounts[ip] = (ipCounts[ip] ?: 0) + 1
                            
                            if (autoJailEnabled && jailedIps.none { it.ip == ip }) {
                                failedAttemptsInWindow[ip] = (failedAttemptsInWindow[ip] ?: 0) + 1
                                if (failedAttemptsInWindow[ip]!! >= jailThreshold) {
                                    val expiresAt = System.currentTimeMillis() + (jailDurationMinutes * 60 * 1000)
                                    val jail = JailedIP(ip, "Automatic jail after $jailThreshold failed attempts", expiresAt)
                                    firewallService.blockIP(BlockIPRequest(ip, comment = jail.reason))
                                    jailedIps.add(jail)
                                    failedAttemptsInWindow.remove(ip)
                                }
                            }

                            recentFailuresList.add(0, BtmpEntry(
                                user = user,
                                ip = ip,
                                session = session,
                                timestampString = timeStr,
                                timestamp = System.currentTimeMillis(),
                                duration = duration
                            ))
                        }
                    }
                }
                if (recentFailuresList.size > 1000) {
                    val toRemove = recentFailuresList.size - 1000
                    repeat(toRemove) { recentFailuresList.removeAt(recentFailuresList.size - 1) }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            if (deltaFile.exists()) deltaFile.delete()
        }
    }

    private fun updateStats() {
        if (!btmpFile.exists()) return

        val currentSize = btmpFile.length()
        if (currentSize == lastProcessedSize) return

        if (currentSize < lastProcessedSize) {
            // Process the end of rotated file
            val rotatedFile = File("/host/var/log/btmp.1")
            if (rotatedFile.exists()) {
                processFileRange(rotatedFile, lastProcessedSize)
            }
            lastProcessedSize = 0
        }

        try {
            processFileRange(btmpFile, lastProcessedSize)
            lastProcessedSize = currentSize
            updateCachedStats()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun updateCachedStats() {
        cachedBtmpStats = BtmpStats(
            totalFailedAttempts = totalFailedAttempts,
            topUsers = userCounts.toList().sortedByDescending { it.second }.take(100),
            topIps = ipCounts.toList().sortedByDescending { it.second }.take(100),
            recentFailures = recentFailuresList.take(200).toList(),
            lastUpdated = System.currentTimeMillis(),
            jailedIps = jailedIps.toList(),
            autoJailEnabled = autoJailEnabled,
            jailThreshold = jailThreshold,
            jailDurationMinutes = jailDurationMinutes
        )
    }

    private fun executeCommand(command: String): String {
        return try {
            val process = ProcessBuilder("sh", "-c", command).start()
            process.inputStream.bufferedReader().readText()
        } catch (e: Exception) {
            ""
        }
    }
}
