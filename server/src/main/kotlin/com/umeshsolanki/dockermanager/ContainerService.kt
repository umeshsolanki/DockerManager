package com.umeshsolanki.dockermanager

interface IContainerService {
    fun listContainers(): List<DockerContainer>
    fun startContainer(id: String): Boolean
    fun stopContainer(id: String): Boolean
    fun removeContainer(id: String): Boolean
    fun pruneContainers(): Boolean
    fun inspectContainer(id: String): ContainerDetails?
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

    override fun inspectContainer(id: String): ContainerDetails? {
        return try {
            val details = dockerClient.inspectContainerCmd(id).exec()
            ContainerDetails(
                id = details.id,
                name = details.name.removePrefix("/"),
                image = details.config.image ?: "unknown",
                state = details.state.status ?: "unknown",
                status = details.state.toString(),
                createdAt = details.created,
                platform = details.platform ?: "unknown",
                env = details.config.env?.toList() ?: emptyList(),
                labels = details.config.labels ?: emptyMap(),
                mounts = details.mounts?.map { mount ->
                    DockerMount(
                        type = mount.type?.name,
                        source = mount.source,
                        destination = mount.destination?.path,
                        mode = mount.mode,
                        rw = mount.rw
                    )
                } ?: emptyList()
            )
        } catch (e: Exception) {
            e.printStackTrace()
            null
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
