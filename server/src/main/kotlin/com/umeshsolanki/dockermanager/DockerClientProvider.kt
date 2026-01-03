package com.umeshsolanki.dockermanager

import com.github.dockerjava.api.DockerClient
import com.github.dockerjava.core.DefaultDockerClientConfig
import com.github.dockerjava.core.DockerClientImpl
import com.github.dockerjava.httpclient5.ApacheDockerHttpClient
import java.time.Duration

object DockerClientProvider {
    private var _client: DockerClient? = null

    val client: DockerClient
        get() {
            if (_client == null) {
                _client = createClient()
            }
            return _client!!
        }

    fun refreshClient() {
        _client = createClient()
    }

    private fun createClient(): DockerClient {
        val dockerHost = if (AppConfig.dockerSocket.startsWith("tcp://") || AppConfig.dockerSocket.startsWith("unix://")) {
            AppConfig.dockerSocket
        } else {
            "unix://${AppConfig.dockerSocket}"
        }

        val config = DefaultDockerClientConfig.createDefaultConfigBuilder()
            .withDockerHost(dockerHost)
            .build()

        val httpClient = ApacheDockerHttpClient.Builder()
            .dockerHost(config.dockerHost)
            .sslConfig(config.sslConfig)
            .maxConnections(100)
            .connectionTimeout(Duration.ofSeconds(30))
            .responseTimeout(Duration.ofSeconds(45))
            .build()

        return DockerClientImpl.getInstance(config, httpClient)
    }
}
