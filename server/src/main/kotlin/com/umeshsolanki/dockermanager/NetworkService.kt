package com.umeshsolanki.dockermanager

interface INetworkService {
    fun listNetworks(): List<DockerNetwork>
    fun removeNetwork(id: String): Boolean
}

class NetworkServiceImpl(private val dockerClient: com.github.dockerjava.api.DockerClient) : INetworkService {
    override fun listNetworks(): List<DockerNetwork> {
        val networks = dockerClient.listNetworksCmd().exec()
        return networks.map { network ->
            DockerNetwork(
                id = network.id,
                name = network.name,
                driver = network.driver ?: "unknown",
                scope = network.scope ?: "unknown",
                internal = network.internal ?: false
            )
        }
    }

    override fun removeNetwork(id: String): Boolean {
        return try {
            dockerClient.removeNetworkCmd(id).exec()
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
}
