package com.umeshsolanki.dockermanager.docker

import com.github.dockerjava.api.DockerClient
import com.github.dockerjava.api.async.ResultCallback
import com.umeshsolanki.dockermanager.AppConfig
import kotlinx.serialization.json.*
import org.slf4j.LoggerFactory
import java.time.Instant
import java.util.concurrent.TimeUnit

interface IContainerService {
    fun listContainers(): List<DockerContainer>
    fun startContainer(id: String): Boolean
    fun stopContainer(id: String): Boolean
    fun removeContainer(id: String, force: Boolean = false): Boolean
    fun removeContainers(ids: List<String>, force: Boolean = false): Map<String, Boolean>
    fun pruneContainers(): Boolean
    fun inspectContainer(id: String): ContainerDetails?
    fun createContainer(request: CreateContainerRequest): String?
    fun getContainerLogs(id: String, tail: Int = 100): String
}

class ContainerServiceImpl(private val dockerClient: DockerClient) :
    IContainerService {
    override fun listContainers(): List<DockerContainer> {
        val containers = dockerClient.listContainersCmd().withShowAll(true).exec()
        return containers.map { container ->
            DockerContainer(
                id = container.id,
                names = container.names.joinToString(", ").removePrefix("/"),
                image = container.image,
                status = container.status,
                state = container.state,
                ipAddress = container.networkSettings?.networks?.values?.firstOrNull()?.ipAddress ?: ""
            )
        }
    }

    override fun createContainer(request: CreateContainerRequest): String? {
        return try {
            val cmd = dockerClient.createContainerCmd(request.image).withName(request.name)

            // Port Mappings
            if (request.ports.isNotEmpty()) {
                val portBindings = request.ports.map {
                    com.github.dockerjava.api.model.ExposedPort(
                        it.containerPort,
                        com.github.dockerjava.api.model.InternetProtocol.parse(it.protocol)
                    ) to com.github.dockerjava.api.model.Ports.Binding.bindPort(it.hostPort)
                }
                val ports = com.github.dockerjava.api.model.Ports()
                portBindings.forEach { (exposed, binding) ->
                    ports.bind(exposed, binding)
                }
                cmd.withHostConfig(
                    com.github.dockerjava.api.model.HostConfig.newHostConfig()
                        .withPortBindings(ports)
                )
            }

            // Environment Variables
            if (request.env.isNotEmpty()) {
                cmd.withEnv(request.env.map { "${it.key}=${it.value}" })
            }

            // Volumes
            if (request.volumes.isNotEmpty()) {
                val binds = request.volumes.map {
                    com.github.dockerjava.api.model.Bind(
                        it.hostPath, com.github.dockerjava.api.model.Volume(it.containerPath)
                    )
                }
                val currentHostConfig =
                    cmd.hostConfig ?: com.github.dockerjava.api.model.HostConfig.newHostConfig()
                cmd.withHostConfig(currentHostConfig.withBinds(binds))
            }

            // Networks - Note: docker-java usually requires connecting to extra networks after creation
            // if we want more than one. But we can set the primary one here or use NetworkingConfig.

            val response = cmd.exec()

            // Connect to networks if specified
            request.networks.forEach { networkIdOrName ->
                try {
                    dockerClient.connectToNetworkCmd().withContainerId(response.id)
                        .withNetworkId(networkIdOrName).exec()
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
                createdAt = details.created?.let { 
                    try { Instant.parse(it).toEpochMilli() } catch(e: Exception) { 0L }
                } ?: 0L,
                startedAt = details.state.startedAt?.let { 
                    try { Instant.parse(it).toEpochMilli() } catch(e: Exception) { 0L }
                } ?: 0L,
                finishedAt = details.state.finishedAt?.let { 
                    try { Instant.parse(it).toEpochMilli() } catch(e: Exception) { 0L }
                } ?: 0L,
                exitCode = details.state.exitCodeLong?.toInt(),
                error = details.state.error,
                platform = details.platform ?: "unknown",
                driver = details.driver ?: "unknown",
                hostname = details.config.hostName,
                workingDir = details.config.workingDir,
                command = details.config.cmd?.toList() ?: emptyList(),
                entrypoint = details.config.entrypoint?.toList() ?: emptyList(),
                restartPolicy = details.hostConfig.restartPolicy.name,
                autoRemove = details.hostConfig.autoRemove ?: false,
                privileged = details.hostConfig.privileged ?: false,
                tty = details.config.tty ?: false,
                stdinOpen = details.config.stdinOpen ?: false,
                env = details.config.env?.toList() ?: emptyList(),
                labels = details.config.labels ?: emptyMap(),
                mounts = details.mounts?.map { mount ->
                    DockerMount(
                        type = if (mount.driver != null) "volume" else "bind",
                        source = mount.source ?: "",
                        destination = mount.destination?.toString(),
                        mode = mount.mode,
                        rw = mount.rw ?: false
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
                }.distinct(),
                networks = details.networkSettings.networks?.mapValues { (name, network) ->
                    NetworkContainerDetails(
                        name = name,
                        endpointId = network.endpointId ?: "",
                        macAddress = network.macAddress ?: "",
                        ipv4Address = network.ipAddress ?: "",
                        ipv6Address = network.globalIPv6Address ?: ""
                    )
                } ?: emptyMap())
        } catch (e: Exception) {
            // Check if it's the Jackson deserialization error (e.g. for Capability CAP_MKNOD)
            // or any other issue that makes library fails to parse the response
            System.err.println("Docker library inspection failed for $id, falling back to CLI: ${e.message}")
            inspectContainerFallback(id)
        }
    }

    private fun inspectContainerFallback(id: String): ContainerDetails? {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf(AppConfig.dockerCommand, "inspect", id))
            val output = process.inputStream.readBytes().decodeToString()
            if (output.isBlank() || output == "[]") return null
            
            val jsonArray = AppConfig.json.parseToJsonElement(output).jsonArray
            if (jsonArray.isEmpty()) return null
            val details = jsonArray[0].jsonObject
            
            val config = details["Config"]?.jsonObject
            val state = details["State"]?.jsonObject
            val networkSettings = details["NetworkSettings"]?.jsonObject
            val mounts = details["Mounts"]?.jsonArray
            
            val hostConfig = details["HostConfig"]?.jsonObject
            
            ContainerDetails(
                id = details["Id"]?.jsonPrimitive?.content ?: id,
                name = details["Name"]?.jsonPrimitive?.content?.removePrefix("/") ?: "unknown",
                image = config?.get("Image")?.jsonPrimitive?.content ?: "unknown",
                state = state?.get("Status")?.jsonPrimitive?.content ?: "unknown",
                status = state?.get("Status")?.jsonPrimitive?.content ?: "unknown",
                createdAt = details["Created"]?.jsonPrimitive?.content?.let { 
                    try { Instant.parse(it).toEpochMilli() } catch(e: Exception) { 0L }
                } ?: 0L,
                startedAt = state?.get("StartedAt")?.jsonPrimitive?.content?.let { 
                    try { Instant.parse(it).toEpochMilli() } catch(e: Exception) { 0L }
                } ?: 0L,
                finishedAt = state?.get("FinishedAt")?.jsonPrimitive?.content?.let { 
                    try { Instant.parse(it).toEpochMilli() } catch(e: Exception) { 0L }
                } ?: 0L,
                exitCode = state?.get("ExitCode")?.jsonPrimitive?.intOrNull,
                error = state?.get("Error")?.jsonPrimitive?.content,
                platform = details["Platform"]?.jsonPrimitive?.content ?: "unknown",
                driver = details["Driver"]?.jsonPrimitive?.content ?: "unknown",
                hostname = config?.get("Hostname")?.jsonPrimitive?.content,
                workingDir = config?.get("WorkingDir")?.jsonPrimitive?.content,
                command = config?.get("Cmd")?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
                entrypoint = config?.get("Entrypoint")?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
                restartPolicy = hostConfig?.get("RestartPolicy")?.jsonObject?.get("Name")?.jsonPrimitive?.content ?: "no",
                autoRemove = hostConfig?.get("AutoRemove")?.jsonPrimitive?.boolean ?: false,
                privileged = hostConfig?.get("Privileged")?.jsonPrimitive?.boolean ?: false,
                tty = config?.get("Tty")?.jsonPrimitive?.boolean ?: false,
                stdinOpen = config?.get("OpenStdin")?.jsonPrimitive?.boolean ?: false,
                env = config?.get("Env")?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
                labels = config?.get("Labels")?.jsonObject?.mapValues { it.value.jsonPrimitive.content } ?: emptyMap(),
                mounts = mounts?.map { m ->
                    val mo = m.jsonObject
                    DockerMount(
                        type = mo["Type"]?.jsonPrimitive?.content ?: "bind",
                        source = mo["Source"]?.jsonPrimitive?.content ?: "",
                        destination = mo["Destination"]?.jsonPrimitive?.content,
                        mode = mo["Mode"]?.jsonPrimitive?.content,
                        rw = mo["RW"]?.jsonPrimitive?.boolean ?: false
                    )
                } ?: emptyList(),
                ports = (networkSettings?.get("Ports")?.jsonObject?.flatMap { (portSpec, bindings) ->
                    val specParts = portSpec.split("/")
                    val port = specParts[0].toIntOrNull() ?: 0
                    val proto = if (specParts.size > 1) specParts[1] else "tcp"
                    
                    if (bindings is JsonNull) {
                        listOf(PortMapping(port, 0, proto))
                    } else {
                        bindings.jsonArray.map { b ->
                            val bo = b.jsonObject
                            PortMapping(
                                containerPort = port,
                                hostPort = bo["HostPort"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0,
                                protocol = proto
                            )
                        }
                    }
                } ?: emptyList()).distinct(),
                networks = networkSettings?.get("Networks")?.jsonObject?.mapValues { (name, network) ->
                    val no = network.jsonObject
                    NetworkContainerDetails(
                        name = name,
                        endpointId = no["EndpointID"]?.jsonPrimitive?.content ?: "",
                        macAddress = no["MacAddress"]?.jsonPrimitive?.content ?: "",
                        ipv4Address = no["IPAddress"]?.jsonPrimitive?.content ?: "",
                        ipv6Address = no["GlobalIPv6Address"]?.jsonPrimitive?.content ?: ""
                    )
                } ?: emptyMap()
            )
        } catch (e: Exception) {
            System.err.println("Fallback inspection also failed for $id")
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

    private val logger = LoggerFactory.getLogger(ContainerServiceImpl::class.java)

    override fun stopContainer(id: String): Boolean {
        return try {
            dockerClient.stopContainerCmd(id).exec()
            true
        } catch (e: Exception) {
            logger.error("Failed to stop container $id", e)
            false
        }
    }

    override fun removeContainer(id: String, force: Boolean): Boolean {
        return try {
            dockerClient.removeContainerCmd(id).withForce(force).exec()
            true
        } catch (e: com.github.dockerjava.api.exception.NotFoundException) {
            logger.info("Container $id already removed or not found (404)")
            true
        } catch (e: Exception) {
            logger.error("Failed to remove container $id (force=$force)", e)
            false
        }
    }

    override fun removeContainers(ids: List<String>, force: Boolean): Map<String, Boolean> {
        val results = mutableMapOf<String, Boolean>()
        ids.forEach { id ->
            results[id] = removeContainer(id, force)
        }
        return results
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
            val logCallback =
                object : ResultCallback.Adapter<com.github.dockerjava.api.model.Frame>() {
                    val logs = StringBuilder()
                    override fun onNext(frame: com.github.dockerjava.api.model.Frame) {
                        logs.append(String(frame.payload))
                    }
                }

            dockerClient.logContainerCmd(id).withStdOut(true).withStdErr(true).withTail(tail)
                .exec(logCallback).awaitCompletion(5, TimeUnit.SECONDS)

            logCallback.logs.toString()
        } catch (e: Exception) {
            e.printStackTrace()
            "Error fetching logs: ${e.message}"
        }
    }
}
