package com.umeshsolanki.dockermanager

import java.io.File
import java.util.concurrent.TimeUnit

interface IComposeService {
    fun listComposeFiles(): List<ComposeFile>
    fun composeUp(filePath: String): Boolean
    fun composeDown(filePath: String): Boolean
    fun saveComposeFile(name: String, content: String): Boolean
    fun getComposeFileContent(filePath: String): String
}

class ComposeServiceImpl : IComposeService {
    private val composeDir = File("compose_projects")

    override fun listComposeFiles(): List<ComposeFile> {
        if (!composeDir.exists()) composeDir.mkdirs()

        return composeDir.walk()
            .filter { it.isFile && (it.name == "docker-compose.yml" || it.name == "docker-compose.yaml") }
            .map { file ->
                ComposeFile(
                    path = file.absolutePath,
                    name = file.parentFile.name,
                    status = "unknown"
                )
            }.toList()
    }

    override fun composeUp(filePath: String): Boolean {
        val file = File(filePath)
        if (!file.exists()) return false

        return try {
            val process = ProcessBuilder("docker", "compose", "-f", filePath, "up", "-d")
                .directory(file.parentFile)
                .start()
            process.waitFor(5, TimeUnit.MINUTES)
            process.exitValue() == 0
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    override fun composeDown(filePath: String): Boolean {
        val file = File(filePath)
        if (!file.exists()) return false

        return try {
            val process = ProcessBuilder("docker", "compose", "-f", filePath, "down")
                .directory(file.parentFile)
                .start()
            process.waitFor(2, TimeUnit.MINUTES)
            process.exitValue() == 0
        } catch (e: Exception) {
            e.printStackTrace()
            false
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
}
