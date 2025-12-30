package com.umeshsolanki.dockermanager

interface IContainerService {
    fun listContainers(): List<DockerContainer>
    fun startContainer(id: String): Boolean
    fun stopContainer(id: String): Boolean
    fun removeContainer(id: String): Boolean
    fun pruneContainers(): Boolean
    fun inspectContainer(id: String): ContainerDetails?
    fun createContainer(request: CreateContainerRequest): String?
    fun getContainerLogs(id: String, tail: Int = 100): String
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

    override fun createContainer(request: CreateContainerRequest): String? {
        return try {
            val cmd = dockerClient.createContainerCmd(request.image)
                .withName(request.name)
            
            // Port Mappings
            if (request.ports.isNotEmpty()) {
                val portBindings = request.ports.map { 
                    com.github.dockerjava.api.model.ExposedPort(it.containerPort, com.github.dockerjava.api.model.InternetProtocol.parse(it.protocol)) to 
                    com.github.dockerjava.api.model.Ports.Binding.bindPort(it.hostPort)
                }
                val ports = com.github.dockerjava.api.model.Ports()
                portBindings.forEach { (exposed, binding) ->
                    ports.bind(exposed, binding)
                }
                cmd.withHostConfig(com.github.dockerjava.api.model.HostConfig.newHostConfig().withPortBindings(ports))
            }

            // Environment Variables
            if (request.env.isNotEmpty()) {
                cmd.withEnv(request.env.map { "${it.key}=${it.value}" })
            }

            // Volumes
            if (request.volumes.isNotEmpty()) {
                val binds = request.volumes.map { 
                    com.github.dockerjava.api.model.Bind(it.hostPath, com.github.dockerjava.api.model.Volume(it.containerPath))
                }
                val currentHostConfig = cmd.hostConfig ?: com.github.dockerjava.api.model.HostConfig.newHostConfig()
                cmd.withHostConfig(currentHostConfig.withBinds(binds))
            }

            // Networks - Note: docker-java usually requires connecting to extra networks after creation
            // if we want more than one. But we can set the primary one here or use NetworkingConfig.
            
            val response = cmd.exec()
            
            // Connect to networks if specified
            request.networks.forEach { networkIdOrName ->
                try {
                    dockerClient.connectToNetworkCmd()
                        .withContainerId(response.id)
                        .withNetworkId(networkIdOrName)
                        .exec()
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }

            response.id
        } catch (e: Exception) {
            e.printStackTrace()
            null
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
                        type = if (mount.driver != null) "volume" else "bind",
                        source = mount.source,
                        destination = mount.destination?.toString(),
                        mode = mount.mode,
                        rw = mount.rw
                    )
                } ?: emptyList(),
                ports = details.networkSettings.ports.bindings.flatMap { (exposedPort, bindings) ->
                    bindings?.map { binding ->
                        PortMapping(
                            containerPort = exposedPort.port,
                            hostPort = binding.hostPortSpec.toIntOrNull() ?: 0,
                            protocol = exposedPort.protocol.toString()
                        )
                    } ?: emptyList()
                }
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

    override fun getContainerLogs(id: String, tail: Int): String {
        return try {
            val logCallback = object : com.github.dockerjava.api.async.ResultCallback.Adapter<com.github.dockerjava.api.model.Frame>() {
                val logs = StringBuilder()
                override fun onNext(frame: com.github.dockerjava.api.model.Frame) {
                    logs.append(String(frame.payload))
                }
            }
            
            dockerClient.logContainerCmd(id)
                .withStdOut(true)
                .withStdErr(true)
                .withTail(tail)
                .exec(logCallback)
                .awaitCompletion(5, java.util.concurrent.TimeUnit.SECONDS)
            
            logCallback.logs.toString()
        } catch (e: Exception) {
            e.printStackTrace()
            "Error fetching logs: ${e.message}"
        }
    }
}
