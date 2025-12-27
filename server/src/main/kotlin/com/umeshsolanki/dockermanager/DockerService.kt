package com.umeshsolanki.dockermanager

import com.github.dockerjava.api.DockerClient
import com.github.dockerjava.core.DefaultDockerClientConfig
import com.github.dockerjava.core.DockerClientImpl
import com.github.dockerjava.httpclient5.ApacheDockerHttpClient
import java.time.Duration


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
}
