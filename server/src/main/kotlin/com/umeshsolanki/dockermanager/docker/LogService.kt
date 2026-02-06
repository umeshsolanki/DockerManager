package com.umeshsolanki.dockermanager.docker
import com.umeshsolanki.dockermanager.*

import java.io.File
import java.util.concurrent.TimeUnit

interface ILogService {
    fun listSystemLogs(subPath: String = ""): List<SystemLog>
    fun getLogContent(path: String, tail: Int = 100, filter: String? = null, since: String? = null, until: String? = null): String
    fun getJournalLogs(tail: Int = 100, unit: String? = null, filter: String? = null, since: String? = null, until: String? = null): String
    fun getSystemSyslogLogs(tail: Int = 100, filter: String? = null): String
}

class LogServiceImpl : ILogService {
    private val logger = org.slf4j.LoggerFactory.getLogger(LogServiceImpl::class.java)
    private val baseLogDir = AppConfig.systemLogDir

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
        val file = if (path.startsWith(baseLogDir.absolutePath)) File(path) else File(baseLogDir, path)
        
        if (!file.absolutePath.startsWith(baseLogDir.absolutePath)) {
            return "Access denied"
        }

        if (!file.exists() || !file.isFile) return "Log file not found"

        return try {
            val command = mutableListOf<String>()

            if (file.name.startsWith("wtmp") || file.name.startsWith("btmp")) {
                val binary = if (file.name.startsWith("btmp")) "lastb" else "last"
                val lastCmd = StringBuilder("$binary -f ${file.absolutePath}")
                
                since?.takeIf { it.isNotBlank() }?.let {
                    if (it.matches(Regex("""^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*"""))) {
                        // Standard ISO format from frontend, convert to -s format
                        val formatted = it.replace("-", "").replace("T", "").replace(":", "").take(12) + "00"
                        lastCmd.append(" -s $formatted")
                    } else {
                        // Human readable format (e.g. "5 minutes ago", "today")
                        lastCmd.append(" --since \"$it\"")
                    }
                }
                until?.takeIf { it.isNotBlank() }?.let {
                    if (it.matches(Regex("""^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*"""))) {
                        val formatted = it.replace("-", "").replace("T", "").replace(":", "").take(12) + "00"
                        lastCmd.append(" -t $formatted")
                    } else {
                        lastCmd.append(" --until \"$it\"")
                    }
                }
                command.add(lastCmd.toString())
            } else {
                command.add("cat ${file.absolutePath}")
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
                    append(" | tail -n $tail")
                } else {
                    append(" | head -n $tail")
                }

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
            logger.error("Error reading log content from $path", e)
            "Error reading log: ${e.message}"
        }
    }

    override fun getJournalLogs(tail: Int, unit: String?, filter: String?, since: String?, until: String?): String {
        return try {
            val isLinux = System.getProperty("os.name").lowercase().contains("linux")
            if (!isLinux) {
                return "Journalctl is only available on Linux systems. (Current OS: ${System.getProperty("os.name")})"
            }

            val command = StringBuilder("journalctl")
            
            if (!unit.isNullOrBlank()) {
                command.append(" -u $unit")
            }
            
            if (!since.isNullOrBlank()) {
                command.append(" --since \"$since\"")
            }
            
            if (!until.isNullOrBlank()) {
                command.append(" --until \"$until\"")
            }
            
            command.append(" -n $tail")
            
            if (!filter.isNullOrBlank()) {
                if (filter.startsWith("|")) {
                    command.append(" $filter")
                } else {
                    command.append(" | awk $filter")
                }
            }

            val processBuilder = ProcessBuilder("sh", "-c", "timeout 15s $command")
            val process = processBuilder.start()
            val output = process.inputStream.bufferedReader().use { it.readText() }
            val error = process.errorStream.bufferedReader().use { it.readText() }
            val completed = process.waitFor(10, TimeUnit.SECONDS)

            if (!completed) {
                process.destroyForcibly()
                return "Journalctl command timed out"
            }

            if (output.isBlank() && error.isNotBlank()) {
                "Error reading journal: $error"
            } else {
                output.ifBlank { "No journal entries found" }
            }
        } catch (e: Exception) {
            logger.error("Error reading journal logs", e)
            "Error reading journal: ${e.message}"
        }
    }

    override fun getSystemSyslogLogs(tail: Int, filter: String?): String {
        val isLinux = System.getProperty("os.name").lowercase().contains("linux")
        if (!isLinux) {
            return "Rsyslog logs are only available on Linux systems."
        }

        val syslogFile = File(baseLogDir, "syslog").takeIf { it.exists() }
            ?: File(baseLogDir, "messages").takeIf { it.exists() }
            ?: File("/var/log/syslog").takeIf { it.exists() }
            ?: File("/var/log/messages").takeIf { it.exists() }

        if (syslogFile == null) {
            return "Could not find rsyslog file (syslog or messages) in ${baseLogDir.absolutePath}"
        }

        return getLogContent(syslogFile.absolutePath, tail, filter)
    }
}
