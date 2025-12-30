package com.umeshsolanki.dockermanager

import kotlinx.serialization.Serializable
import kotlin.time.Clock

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
    val mounts: List<DockerMount>,
    val ports: List<PortMapping> = emptyList()
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

@Serializable
data class SaveComposeRequest(
    val name: String,
    val content: String
)

@Serializable
data class ComposeResult(
    val success: Boolean,
    val message: String
)

@Serializable
data class SystemLog(
    val name: String,
    val path: String,
    val size: Long,
    val lastModified: Long
)

@Serializable
data class FirewallRule(
    val id: String,
    val ip: String,
    val port: String? = null,
    val protocol: String = "ALL",
    val comment: String? = null,
    val createdAt: Long = Clock.System.now().toEpochMilliseconds()
)

@Serializable
data class BlockIPRequest(
    val ip: String,
    val port: String? = null,
    val protocol: String = "ALL",
    val comment: String? = null
)

@Serializable
data class ProxyHost(
    val id: String,
    val domain: String,
    val target: String,
    val enabled: Boolean = true,
    val ssl: Boolean = false,
    val createdAt: Long = Clock.System.now().toEpochMilliseconds()
)

@Serializable
data class ProxyHit(
    val timestamp: Long,
    val ip: String,
    val method: String,
    val path: String,
    val status: Int,
    val responseTime: Int,
    val userAgent: String
)

@Serializable
data class ProxyStats(
    val totalHits: Long,
    val hitsByStatus: Map<Int, Long>,
    val hitsOverTime: Map<String, Long>, // Key: HH:00
    val topPaths: List<Pair<String, Long>>,
    val recentHits: List<ProxyHit>
)

@Serializable
data class BtmpEntry(
    val user: String,
    val ip: String,
    val timestamp: Long,
    val count: Int = 1
)

@Serializable
data class BtmpStats(
    val totalFailedAttempts: Int,
    val topUsers: List<Pair<String, Int>>,
    val topIps: List<Pair<String, Int>>,
    val recentFailures: List<BtmpEntry>
)
