package com.umeshsolanki.dockermanager.utils

import com.umeshsolanki.dockermanager.constants.TimeoutConstants
import com.umeshsolanki.dockermanager.constants.SystemConstants
import org.slf4j.LoggerFactory
import java.util.concurrent.TimeUnit

/**
 * Result of command execution.
 */
data class ExecuteResult(
    val output: String,
    val error: String,
    val exitCode: Int
)

/**
 * Utility class for executing shell commands with common patterns.
 */
class CommandExecutor(
    private val timeoutSeconds: Long = TimeoutConstants.COMMAND_EXECUTION_SECONDS,
    private val loggerName: String = CommandExecutor::class.java.name
) {
    private val logger = LoggerFactory.getLogger(loggerName)

    /**
     * Executes a shell command and returns the result.
     */
    fun execute(command: String, suppressCheckCommandLogs: Boolean = true): ExecuteResult {
        return try {
            val processBuilder = ProcessBuilder("sh", "-c", command)
            processBuilder.environment()[SystemConstants.ENV_LC_ALL] = SystemConstants.ENV_LC_ALL_VALUE
            val currentPath = processBuilder.environment()["PATH"] ?: ""
            val extraPaths = listOf("/usr/local/bin", "/opt/homebrew/bin")
                .filter { !currentPath.contains(it) }
            if (extraPaths.isNotEmpty()) {
                processBuilder.environment()["PATH"] = (extraPaths + currentPath).joinToString(":")
            }
            val process = processBuilder.start()
            
            val output = process.inputStream.bufferedReader().readText()
            val error = process.errorStream.bufferedReader().readText()
            
            if (!process.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                process.destroy()
                logger.error("Command timed out: $command")
                return ExecuteResult("", "Timed out", -1)
            }

            val exitCode = process.exitValue()
            
            if (exitCode != 0) {
                // Log only if it's not a Check command (checking usually fails which is fine)
                if (!suppressCheckCommandLogs || !command.contains(" -C ")) {
                    logger.warn("Command failed [${exitCode}]: $command\nError: $error")
                }
            } else {
                logger.debug("Command success: $command")
            }
            
            ExecuteResult(output, error, exitCode)
        } catch (e: Exception) {
            logger.error("Error executing command: $command", e)
            ExecuteResult("", e.message ?: "Unknown error", -1)
        }
    }

    /**
     * Executes a command and returns true if exit code is 0, false otherwise.
     */
    fun executeSuccess(command: String, suppressCheckCommandLogs: Boolean = true): Boolean {
        return execute(command, suppressCheckCommandLogs).exitCode == 0
    }

    /**
     * Executes a command and returns the output if successful, null otherwise.
     */
    fun executeOutput(command: String, suppressCheckCommandLogs: Boolean = true): String? {
        val result = execute(command, suppressCheckCommandLogs)
        return if (result.exitCode == 0) result.output.trim() else null
    }
}

/**
 * Default instance for convenience.
 */
private val defaultCommandExecutor = CommandExecutor()

/**
 * Convenience functions using default executor instance.
 */
fun executeCommand(command: String, suppressCheckCommandLogs: Boolean = true): ExecuteResult {
    return defaultCommandExecutor.execute(command, suppressCheckCommandLogs)
}

fun executeCommandSuccess(command: String, suppressCheckCommandLogs: Boolean = true): Boolean {
    return defaultCommandExecutor.executeSuccess(command, suppressCheckCommandLogs)
}

fun executeCommandOutput(command: String, suppressCheckCommandLogs: Boolean = true): String? {
    return defaultCommandExecutor.executeOutput(command, suppressCheckCommandLogs)
}

