package com.umeshsolanki.dockermanager

import com.github.dockerjava.api.DockerClient
import com.github.dockerjava.core.DefaultDockerClientConfig
import com.github.dockerjava.core.DockerClientImpl
import com.github.dockerjava.httpclient5.ApacheDockerHttpClient
import java.time.Duration
import java.io.File
import java.util.concurrent.TimeUnit
import com.github.dockerjava.api.model.PruneType


object DockerService {

    private val config = DefaultDockerClientConfig.createDefaultConfigBuilder().build()

    private val httpClient =
        ApacheDockerHttpClient.Builder().dockerHost(config.dockerHost).sslConfig(config.sslConfig)
            .maxConnections(100).connectionTimeout(Duration.ofSeconds(30))
            .responseTimeout(Duration.ofSeconds(45)).build()

    var dockerClient: DockerClient = DockerClientImpl.getInstance(config, httpClient)

    fun listContainers(): List<DockerContainer> {
        val containers = dockerClient.listContainersCmd().withShowAll(true).exec()

        return containers.map { container ->
            DockerContainer(
                id = container.id,
                names = container.names.joinToString(", ").removePrefix("/"),
                image = container.image,
                status = container.status,
                state = container.state
            )
        }
    }

    fun startContainer(id: String): Boolean {
        return try {
            dockerClient.startContainerCmd(id).exec()
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    fun stopContainer(id: String): Boolean {
        return try {
            dockerClient.stopContainerCmd(id).exec()
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    fun removeContainer(id: String): Boolean {
        return try {
            dockerClient.removeContainerCmd(id).exec()
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    fun pruneContainers(): Boolean {
         return try {
            dockerClient.pruneCmd(PruneType.CONTAINERS).exec()
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    fun listImages(): List<DockerImage> {
        val images = dockerClient.listImagesCmd().exec()
        return images.map { image ->
             DockerImage(
                id = image.id,
                tags = image.repoTags?.toList() ?: emptyList(),
                size = image.size ?: 0L,
                created = image.created ?: 0L
            )
        }
    }

    fun pullImage(name: String): Boolean {
        return try {
            dockerClient.pullImageCmd(name).start().awaitCompletion(300, TimeUnit.SECONDS)
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    fun removeImage(id: String): Boolean {
        return try {
            dockerClient.removeImageCmd(id).exec()
            true
        } catch (e: Exception) {
             e.printStackTrace()
            false
        }
    }
    
    // Compose Management
    private val composeDir = File("compose_projects")

    fun listComposeFiles(): List<ComposeFile> {
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

    fun composeUp(filePath: String): Boolean {
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

    fun composeDown(filePath: String): Boolean {
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
}
