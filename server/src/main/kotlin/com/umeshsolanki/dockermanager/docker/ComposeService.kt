package com.umeshsolanki.dockermanager.docker
import com.umeshsolanki.dockermanager.*

import java.io.File
import java.util.concurrent.TimeUnit

interface IComposeService {
    fun listComposeFiles(): List<ComposeFile>
    fun composeUp(filePath: String): ComposeResult
    fun composeDown(filePath: String): ComposeResult
    fun saveComposeFile(name: String, content: String): Boolean
    fun getComposeFileContent(filePath: String): String
    fun backupCompose(name: String): BackupResult
    fun backupAllCompose(): BackupResult
}

class ComposeServiceImpl : IComposeService {
    private val composeDir = AppConfig.composeProjDir
    private val backupDir = File(AppConfig.backupDir, "compose")

    init {
        if (!composeDir.exists()) composeDir.mkdirs()
        if (!backupDir.exists()) backupDir.mkdirs()
    }

    override fun listComposeFiles(): List<ComposeFile> {
        if (!composeDir.exists()) composeDir.mkdirs()

        return composeDir.walk()
            .filter { it.isFile && (it.name == "docker-compose.yml" || it.name == "docker-compose.yaml") }
            .map { file ->
                ComposeFile(
                    path = file.absolutePath, name = file.parentFile.name, status = "unknown"
                )
            }.toList()
    }

    override fun composeUp(filePath: String): ComposeResult {
        val file = File(filePath)
        if (!file.exists()) return ComposeResult(false, "File not found: $filePath")

        return try {
            // Use AppConfig.dockerComposeCommand which handles different compose command formats
            val composeCmd = AppConfig.dockerComposeCommand
            val process = if (composeCmd.contains("docker compose") || composeCmd == "docker compose") {
                // New docker compose plugin format
                ProcessBuilder("docker", "compose", "-f", filePath, "up", "-d")
            } else {
                // Legacy docker-compose format
                ProcessBuilder(composeCmd, "-f", filePath, "up", "-d")
            }
                .directory(file.parentFile)
                .redirectErrorStream(true)
                .start()
            
            val output = process.inputStream.bufferedReader().readText()
            val success = process.waitFor(5, TimeUnit.MINUTES) && process.exitValue() == 0

            ComposeResult(success, output.ifBlank { if (success) "Up" else "Failed to start" })
        } catch (e: Exception) {
            e.printStackTrace()
            ComposeResult(false, "Error: ${e.message ?: "Unknown error"}. Command: ${AppConfig.dockerComposeCommand}")
        }
    }

    override fun composeDown(filePath: String): ComposeResult {
        val file = File(filePath)
        if (!file.exists()) return ComposeResult(false, "File not found")

        return try {
            val process = ProcessBuilder("docker", "compose", "-f", filePath, "down")
                .directory(file.parentFile)
                .redirectErrorStream(true)
                .start()
            
            val output = process.inputStream.bufferedReader().readText()
            val success = process.waitFor(2, TimeUnit.MINUTES) && process.exitValue() == 0

            ComposeResult(success, output.ifBlank { if (success) "Down" else "Failed to stop" })
        } catch (e: Exception) {
            e.printStackTrace()
            ComposeResult(false, e.message ?: "Unknown error")
        }
    }

    override fun saveComposeFile(name: String, content: String): Boolean {
        return try {
            if (!composeDir.exists()) composeDir.mkdirs()
            val projectDir = File(composeDir, name)
            if (!projectDir.exists()) projectDir.mkdirs()

            val file = File(projectDir, "docker-compose.yml")
            file.writeText(content)
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    override fun getComposeFileContent(filePath: String): String {
        return try {
            val file = File(filePath)
            if (file.exists()) {
                file.readText()
            } else {
                ""
            }
        } catch (e: Exception) {
            e.printStackTrace()
            ""
        }
    }

    override fun backupCompose(name: String): BackupResult {
        return try {
            val projectDir = File(composeDir, name)
            if (!projectDir.exists()) return BackupResult(false, null, null, "Project not found")

            val fileName = "compose_${name}_${System.currentTimeMillis()}.tar.gz"
            val fullPath = File(backupDir, fileName).absolutePath

            val process =
                ProcessBuilder("tar", "-czf", fullPath, "-C", projectDir.parent, name).start()
            val exitCode = process.waitFor()

            if (exitCode == 0) {
                BackupResult(true, fileName, fullPath, "Backup created successfully")
            } else {
                BackupResult(false, null, null, "Failed to create backup")
            }
        } catch (e: Exception) {
            e.printStackTrace()
            BackupResult(false, null, null, "Error: ${e.message}")
        }
    }

    override fun backupAllCompose(): BackupResult {
        return try {
            if (!composeDir.exists()) return BackupResult(
                false,
                null,
                null,
                "No compose projects found"
            )

            val fileName = "compose_all_${System.currentTimeMillis()}.tar.gz"
            val fullPath = File(backupDir, fileName).absolutePath

            val process = ProcessBuilder(
                "tar",
                "-czf",
                fullPath,
                "-C",
                composeDir.parent,
                composeDir.name
            ).start()
            val exitCode = process.waitFor()

            if (exitCode == 0) {
                BackupResult(true, fileName, fullPath, "Full backup created successfully")
            } else {
                BackupResult(false, null, null, "Failed to create full backup")
            }
        } catch (e: Exception) {
            e.printStackTrace()
            BackupResult(false, null, null, "Error: ${e.message}")
        }
    }
}
