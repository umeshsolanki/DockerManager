package com.umeshsolanki.dockermanager

import java.io.File
import java.util.concurrent.TimeUnit

interface ILogService {
    fun listSystemLogs(): List<SystemLog>
    fun getLogContent(path: String, tail: Int = 100, filter: String? = null): String
}

class LogServiceImpl : ILogService {
    private val logDir = File("/host/var/log")

    override fun listSystemLogs(): List<SystemLog> {
        if (!logDir.exists() || !logDir.isDirectory) return emptyList()

        return logDir.listFiles()?.filter { it.isFile } ?.map { file ->
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
            
            // Handle binary logs (wtmp, btmp)
            if (file.name == "wtmp" || file.name == "btmp") {
                command.addAll(listOf("utmpdump", path))
            } else {
                command.addAll(listOf("cat", path))
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
