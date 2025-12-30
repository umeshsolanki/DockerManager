package com.umeshsolanki.dockermanager

import kotlinx.serialization.Serializable

@Serializable
data class DockerContainer(
    val id: String,
    val names: String,
    val image: String,
    val status: String,
    val state: String // running, exited, etc.
)

@Serializable
data class DockerImage(
    val id: String,
    val tags: List<String>,
    val size: Long,
    val created: Long
)

@Serializable
data class ComposeFile(
    val path: String,
    val name: String,
    val status: String // active, inactive
)

@Serializable
data class BatteryStatus(
    val percentage: Int,
    val isCharging: Boolean,
    val source: String
)

@Serializable
data class DockerSecret(
    val id: String,
    val name: String,
    val createdAt: String,
    val updatedAt: String
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
data class DockerVolume(
    val name: String,
    val driver: String,
    val mountpoint: String,
    val createdAt: String? = null,
    val size: String? = null
)

@Serializable
data class ContainerDetails(
    val id: String,
    val name: String,
    val image: String,
    val state: String,
    val status: String,
    val createdAt: String,
    val platform: String,
    val env: List<String>,
    val labels: Map<String, String>,
    val mounts: List<DockerMount>
)

@Serializable
data class DockerMount(
    val type: String?,
    val source: String?,
    val destination: String?,
    val mode: String?,
    val rw: Boolean?
)

@Serializable
data class VolumeDetails(
    val name: String,
    val driver: String,
    val mountpoint: String,
    val labels: Map<String, String>,
    val scope: String,
    val options: Map<String, String>,
    val createdAt: String?
)

@Serializable
data class BackupResult(
    val success: Boolean,
    val fileName: String?,
    val filePath: String?,
    val message: String
)

@Serializable
data class CreateContainerRequest(
    val name: String,
    val image: String,
    val ports: List<PortMapping> = emptyList(),
    val env: Map<String, String> = emptyMap(),
    val volumes: List<VolumeMapping> = emptyList(),
    val networks: List<String> = emptyList(),
    val restartPolicy: String = "no"
)

@Serializable
data class PortMapping(
    val containerPort: Int,
    val hostPort: Int,
    val protocol: String = "tcp"
)

@Serializable
data class VolumeMapping(
    val containerPath: String,
    val hostPath: String,
    val mode: String = "rw"
)
