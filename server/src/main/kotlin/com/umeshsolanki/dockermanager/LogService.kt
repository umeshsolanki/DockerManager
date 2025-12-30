package com.umeshsolanki.dockermanager

import java.io.File

interface ILogService {
    fun listSystemLogs(): List<SystemLog>
    fun getLogContent(path: String, tail: Int = 100): String
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

    override fun getLogContent(path: String, tail: Int): String {
        val file = File(path)
        // Basic security check: ensure the path is within /host/var/log
        if (!file.absolutePath.startsWith("/host/var/log")) {
            return "Access denied"
        }
        
        if (!file.exists() || !file.isFile) return "Log file not found"

        return try {
            val lines = file.readLines()
            lines.takeLast(tail).joinToString("\n")
        } catch (e: Exception) {
            "Error reading log: ${e.message}"
        }
    }
}
