package com.umeshsolanki.dockermanager

import java.io.File

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
                command.addAll(listOf("last", "-f", path))
            } else {
                command.addAll(listOf("cat", path))
            }

            // Pipe through tail
            val processBuilder = ProcessBuilder("sh", "-c", buildString {
                append(command.joinToString(" "))
                if (!filter.isNullOrBlank()) {
                    append(" | awk '$filter'")
                }
                append(" | tail -n $tail")
            })
            
            val process = processBuilder.start()
            val output = process.inputStream.bufferedReader().readText()
            val error = process.errorStream.bufferedReader().readText()
            process.waitFor()
            
            if (output.isBlank() && error.isNotBlank()) {
                "Error processing log: $error"
            } else {
                output.ifBlank { "No entries found" }
            }
        } catch (e: Exception) {
            "Error reading log: ${e.message}"
        }
    }
}
