package com.umeshsolanki.dockermanager

import java.io.File
import java.util.concurrent.TimeUnit

interface ILogService {
    fun listSystemLogs(subPath: String = ""): List<SystemLog>
    fun getLogContent(path: String, tail: Int = 100, filter: String? = null, since: String? = null, until: String? = null): String
}

class LogServiceImpl : ILogService {
    private val baseLogDir = File("/host/var/log")

    override fun listSystemLogs(subPath: String): List<SystemLog> {
        val targetDir = if (subPath.isBlank()) baseLogDir else File(baseLogDir, subPath)
        
        // Security check: ensure targetDir is within baseLogDir
        if (!targetDir.absolutePath.startsWith(baseLogDir.absolutePath)) {
            return emptyList()
        }

        if (!targetDir.exists() || !targetDir.isDirectory) return emptyList()

        return targetDir.listFiles()?.map { file ->
            SystemLog(
                name = file.name,
                path = file.absolutePath.removePrefix(baseLogDir.absolutePath).removePrefix("/"),
                size = file.length(),
                lastModified = file.lastModified(),
                isDirectory = file.isDirectory
            )
        } ?: emptyList()
    }

    override fun getLogContent(path: String, tail: Int, filter: String?, since: String?, until: String?): String {
        val file = if (path.startsWith("/host/var/log")) File(path) else File(baseLogDir, path)
        
        if (!file.absolutePath.startsWith(baseLogDir.absolutePath)) {
            return "Access denied"
        }

        if (!file.exists() || !file.isFile) return "Log file not found"

        return try {
            val command = mutableListOf<String>()

            if (file.name.startsWith("wtmp") || file.name.startsWith("btmp")) {
                val lastCmd = StringBuilder("lastb -f $path")
                since?.takeIf { it.isNotBlank() }?.let {
                    val formatted = it.replace("-", "").replace("T", "").replace(":", "") + "00"
                    lastCmd.append(" -s $formatted")
                }
                until?.takeIf { it.isNotBlank() }?.let {
                    val formatted = it.replace("-", "").replace("T", "").replace(":", "") + "00"
                    lastCmd.append(" -t $formatted")
                }
                command.add(lastCmd.toString())
            } else {
                command.add("cat $path")
            }

            val processBuilder = ProcessBuilder("sh", "-c", buildString {
                append("timeout 10s ")
                append(command.joinToString(" "))
                
                // Add time filtering for text logs if not wtmp/btmp
                if (file.name != "wtmp" && file.name != "btmp") {
                    if (!since.isNullOrBlank() || !until.isNullOrBlank()) {
                        // Very basic time filtering attempt for standard log formats (ISO or Syslog)
                        // This is a best-effort approach as log formats vary wildly
                        val s = since?.takeIf { it.isNotBlank() }?.replace("T", " ") ?: ""
                        val u = until?.takeIf { it.isNotBlank() }?.replace("T", " ") ?: "9999-12-31"
                        append(" | awk '$0 >= \"$s\" && $0 <= \"$u\"'")
                    }
                }

                append(" | head -n $tail")
                
                if (!filter.isNullOrBlank()) {
                    if (filter.startsWith("|")) {
                        append(" $filter")
                    } else {
                        append(" | awk $filter")
                    }
                }
            })

            val process = processBuilder.start()
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
