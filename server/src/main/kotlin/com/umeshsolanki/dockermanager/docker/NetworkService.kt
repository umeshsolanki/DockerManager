package com.umeshsolanki.dockermanager.docker
import com.umeshsolanki.dockermanager.*

interface INetworkService {
    fun listNetworks(): List<DockerNetwork>
    fun removeNetwork(id: String): Boolean
    fun inspectNetwork(id: String): NetworkDetails?
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

    override fun inspectNetwork(id: String): NetworkDetails? {
        return try {
            val network = dockerClient.inspectNetworkCmd().withNetworkId(id).exec()
            NetworkDetails(
                id = network.id,
                name = network.name,
                driver = network.driver ?: "unknown",
                scope = network.scope ?: "unknown",
                internal = network.internal ?: false,
                attachable = false, // Field access is private and getter is unresolved
                ingress = false, // Field not available in this version of docker-java
                enableIPv6 = network.enableIPv6 ?: false,
                ipam = IpamConfig(
                    driver = network.ipam?.driver ?: "default",
                    config = network.ipam?.config?.map {
                        IpamData(
                            subnet = it.subnet,
                            gateway = it.gateway,
                            ipRange = it.ipRange,
                            auxAddresses = emptyMap() // Field not available in this version
                        )
                    } ?: emptyList()
                ),
                containers = network.containers?.mapValues { (containerId, details) ->
                    NetworkContainerDetails(
                        name = details.name ?: containerId,
                        endpointId = details.endpointId ?: "",
                        macAddress = details.macAddress ?: "",
                        ipv4Address = details.ipv4Address ?: "",
                        ipv6Address = details.ipv6Address ?: ""
                    )
                } ?: emptyMap(),
                options = network.options ?: emptyMap(),
                labels = network.labels ?: emptyMap(),
                createdAt = network.created?.toString()
            )
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }
}
