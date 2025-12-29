package com.umeshsolanki.dockermanager

interface IContainerService {
    fun listContainers(): List<DockerContainer>
    fun startContainer(id: String): Boolean
    fun stopContainer(id: String): Boolean
    fun removeContainer(id: String): Boolean
    fun pruneContainers(): Boolean
}

class ContainerServiceImpl(private val dockerClient: com.github.dockerjava.api.DockerClient) : IContainerService {
    override fun listContainers(): List<DockerContainer> {
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

    override fun startContainer(id: String): Boolean {
        return try {
            dockerClient.startContainerCmd(id).exec()
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    override fun stopContainer(id: String): Boolean {
        return try {
            dockerClient.stopContainerCmd(id).exec()
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    override fun removeContainer(id: String): Boolean {
        return try {
            dockerClient.removeContainerCmd(id).exec()
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    override fun pruneContainers(): Boolean {
        return try {
            dockerClient.pruneCmd(com.github.dockerjava.api.model.PruneType.CONTAINERS).exec()
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
}
