package com.umeshsolanki.dockermanager.docker

import kotlinx.serialization.Serializable

// ========== Docker Models ==========

@Serializable
data class DockerContainer(
    val id: String,
    val names: String,
    val image: String,
    val status: String,
    val state: String,
    val ipAddress: String = ""
)

@Serializable
data class CreateContainerRequest(
    val name: String,
    val image: String,
    val ports: List<PortMapping> = emptyList(),
    val env: Map<String, String> = emptyMap(),
    val volumes: List<VolumeMapping> = emptyList(),
    val networks: List<String> = emptyList()
)

@Serializable
data class PortMapping(
    val containerPort: Int,
    val hostPort: Int,
    val protocol: String = "tcp"
)

@Serializable
data class VolumeMapping(
    val hostPath: String,
    val containerPath: String
)

@Serializable
data class ContainerDetails(
    val id: String,
    val name: String,
    val image: String,
    val state: String,
    val status: String,
    val createdAt: Long,
    val startedAt: Long = 0L,
    val finishedAt: Long = 0L,
    val exitCode: Int? = null,
    val error: String? = null,
    val platform: String,
    val driver: String = "",
    val hostname: String? = null,
    val workingDir: String? = null,
    val command: List<String> = emptyList(),
    val entrypoint: List<String> = emptyList(),
    val restartPolicy: String = "no",
    val autoRemove: Boolean = false,
    val privileged: Boolean = false,
    val tty: Boolean = false,
    val stdinOpen: Boolean = false,
    val env: List<String> = emptyList(),
    val labels: Map<String, String> = emptyMap(),
    val mounts: List<DockerMount> = emptyList(),
    val ports: List<PortMapping> = emptyList(),
    val networks: Map<String, NetworkContainerDetails> = emptyMap()
)

@Serializable
data class DockerMount(
    val type: String,
    val source: String,
    val destination: String?,
    val mode: String?,
    val rw: Boolean
)

@Serializable
data class DockerImage(
    val id: String,
    val tags: List<String>,
    val size: Long,
    val created: Long
)

@Serializable
data class DockerNetwork(
    val id: String,
    val name: String,
    val driver: String,
    val scope: String,
    val internal: Boolean
)

@Serializable
data class NetworkDetails(
    val id: String,
    val name: String,
    val driver: String,
    val scope: String,
    val internal: Boolean,
    val attachable: Boolean = false,
    val ingress: Boolean = false,
    val enableIPv6: Boolean = false,
    val ipam: IpamConfig,
    val containers: Map<String, NetworkContainerDetails> = emptyMap(),
    val options: Map<String, String> = emptyMap(),
    val labels: Map<String, String> = emptyMap(),
    val createdAt: String? = null
)

@Serializable
data class IpamConfig(
    val driver: String,
    val config: List<IpamData> = emptyList()
)

@Serializable
data class IpamData(
    val subnet: String? = null,
    val gateway: String? = null,
    val ipRange: String? = null,
    val auxAddresses: Map<String, String> = emptyMap()
)

@Serializable
data class NetworkContainerDetails(
    val name: String,
    val endpointId: String,
    val macAddress: String,
    val ipv4Address: String,
    val ipv6Address: String
)

@Serializable
data class DockerVolume(
    val name: String,
    val driver: String,
    val mountpoint: String,
    val createdAt: String? = null
)

@Serializable
data class VolumeDetails(
    val name: String,
    val driver: String,
    val mountpoint: String,
    val labels: Map<String, String> = emptyMap(),
    val scope: String,
    val options: Map<String, String> = emptyMap(),
    val createdAt: String? = null
)

@Serializable
data class BackupResult(
    val success: Boolean,
    val fileName: String? = null,
    val filePath: String? = null,
    val message: String
)

@Serializable
data class DockerSecret(
    val id: String,
    val name: String,
    val createdAt: String,
    val updatedAt: String
)

@Serializable
data class SystemLog(
    val name: String,
    val path: String,
    val size: Long,
    val lastModified: Long,
    val isDirectory: Boolean
)

@Serializable
data class SaveComposeRequest(
    val name: String,
    val content: String
)

@Serializable
data class SaveProjectFileRequest(
    val projectName: String,
    val fileName: String,
    val content: String
)

@Serializable
data class ComposeFile(
    val path: String,
    val name: String,
    val status: String
)

@Serializable
data class ComposeResult(
    val success: Boolean,
    val message: String
)

@Serializable
data class DockerStack(
    val name: String,
    val services: Int = 0,
    val orchestrator: String = "swarm"
)

@Serializable
data class StackService(
    val id: String,
    val name: String,
    val image: String,
    val mode: String,
    val replicas: String,
    val ports: String? = null
)

@Serializable
data class StackTask(
    val id: String,
    val name: String,
    val image: String,
    val node: String,
    val desiredState: String,
    val currentState: String,
    val error: String? = null,
    val ports: String? = null
)

@Serializable
data class DeployStackRequest(
    val stackName: String,
    val composeFile: String
)

@Serializable
data class MigrateComposeToStackRequest(
    val composeFile: String,
    val stackName: String
)

@Serializable
data class StopStackRequest(
    val stackName: String
)



