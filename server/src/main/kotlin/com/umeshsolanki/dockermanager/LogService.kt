package com.umeshsolanki.dockermanager

import java.io.File
import java.util.concurrent.TimeUnit

interface ILogService {
    fun listSystemLogs(): List<SystemLog>
    fun getLogContent(path: String, tail: Int = 100, filter: String? = null): String
    fun getBtmpStats(): BtmpStats
}

class LogServiceImpl : ILogService {
    private val logDir = File("/host/var/log")
    private val btmpFile = File("/host/var/log/btmp")
    private var cachedBtmpStats: BtmpStats = BtmpStats(0, emptyList(), emptyList(), emptyList())

    init {
        startBtmpWorker()
    }

    private fun startBtmpWorker() {
        Thread {
            while (true) {
                try {
                    updateBtmpStats()
                } catch (e: Exception) {
                    e.printStackTrace()
                }
                Thread.sleep(30000) // Every 30 seconds
            }
        }.apply {
            isDaemon = true
            start()
        }
    }

    private fun updateBtmpStats() {
        if (!btmpFile.exists()) return

        // Use host's utmpdump via chroot to parse btmp and extract user/ip
        val output =
            executeCommand($$"/host/usr/bin/lastb -f /var/log/btmp | awk '{print $4\" \"$6}'")

        val entries = output.lineSequence().filter { it.isNotBlank() }.map { line ->
            val parts = line.trim().split(" ")
            val user = if (parts.size > 0) parts[0].replace("[", "").replace("]", "") else "unknown"
            val ip = if (parts.size > 1) parts[1].replace("[", "").replace("]", "") else "unknown"
            user to ip
        }.toList()

        val totalFailed = entries.size
        val topUsers =
            entries.groupingBy { it.first }.eachCount().toList().sortedByDescending { it.second }
                .take(5)
        val topIps =
            entries.groupingBy { it.second }.eachCount().toList().sortedByDescending { it.second }
                .take(5)

        // Last 10 failures
        val recentFailures = entries.takeLast(10).reversed().map { (user, ip) ->
            BtmpEntry(user, ip, System.currentTimeMillis())
        }

        cachedBtmpStats = BtmpStats(totalFailed, topUsers, topIps, recentFailures)
    }

    private fun executeCommand(command: String): String {
        return try {
            val process = ProcessBuilder("sh", "-c", command).start()
            process.inputStream.bufferedReader().readText()
        } catch (e: Exception) {
            ""
        }
    }

    override fun getBtmpStats(): BtmpStats = cachedBtmpStats

    override fun listSystemLogs(): List<SystemLog> {
        if (!logDir.exists() || !logDir.isDirectory) return emptyList()

        return logDir.listFiles()?.filter { it.isFile }?.map { file ->
            SystemLog(
                name = file.name,
                path = file.absolutePath,
                size = file.length(),
                lastModified = file.lastModified()
            )
        } ?: emptyList()
    }

    override fun getLogContent(path: String, tail: Int, filter: String?): String {
        val file = File(path)
        // Basic security check: ensure the path is within /host/var/log
        if (!file.absolutePath.startsWith("/host/var/log")) {
            return "Access denied"
        }

        if (!file.exists() || !file.isFile) return "Log file not found"

        return try {
            val command = mutableListOf<String>()

            if (file.name == "wtmp" || file.name == "btmp") {
                command.add("/host/usr/bin/lastb -f $path")
            } else {
                command.add("cat $path")
            }

            // Pipe through tail/awk with strictly enforced timeout and size limits
            val processBuilder = ProcessBuilder("sh", "-c", buildString {
                // Wrap in timeout to prevent hanging the server
                append("timeout 5s ")
                append(command.joinToString(" "))
                append(" | tail -n $tail")
                if (!filter.isNullOrBlank()) {
                    append(" | awk '$filter'")
                }
//                // Final safety: never return more than 1MB of text
//                append(" | head -c 1048576")
            })

            val process = processBuilder.start()

            // Read stream carefully
            val output = process.inputStream.bufferedReader().use { it.readText() }
            val error = process.errorStream.bufferedReader().use { it.readText() }

            val completed = process.waitFor(6, TimeUnit.SECONDS)

            if (!completed) {
                process.destroyForcibly()
                return "Command timed out (log file might be too large for this filter)"
            }

            if (output.isBlank() && error.isNotBlank()) {
                "Error processing log: $error"
            } else {
                output.ifBlank { "No entries found (or filter returned nothing)" }
            }
        } catch (e: Exception) {
            "Error reading log: ${e.message}"
        }
    }
}
