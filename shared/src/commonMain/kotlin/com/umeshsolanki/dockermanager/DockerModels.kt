package com.umeshsolanki.dockermanager

import kotlinx.serialization.Serializable
import kotlin.time.Clock

@Serializable
class DockerContainer(
    val id: String,
    val names: String,
    val image: String,
    val status: String,
    val state: String, // running, exited, etc.
)

@Serializable
class DockerImage(
    val id: String,
    val tags: List<String>,
    val size: Long,
    val created: Long,
)

@Serializable
class ComposeFile(
    val path: String,
    val name: String,
    val status: String, // active, inactive
)

@Serializable
class BatteryStatus(
    val percentage: Int,
    val isCharging: Boolean,
    val source: String,
)

@Serializable
class DockerSecret(
    val id: String,
    val name: String,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
class DockerNetwork(
    val id: String,
    val name: String,
    val driver: String,
    val scope: String,
    val internal: Boolean,
)

@Serializable
class DockerVolume(
    val name: String,
    val driver: String,
    val mountpoint: String,
    val createdAt: String? = null,
    val size: String? = null,
)

@Serializable
class ContainerDetails(
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
    val ports: List<PortMapping> = emptyList(),
)

@Serializable
class DockerMount(
    val type: String?,
    val source: String?,
    val destination: String?,
    val mode: String?,
    val rw: Boolean?,
)

@Serializable
class VolumeDetails(
    val name: String,
    val driver: String,
    val mountpoint: String,
    val labels: Map<String, String>,
    val scope: String,
    val options: Map<String, String>,
    val createdAt: String?,
)

@Serializable
class BackupResult(
    val success: Boolean,
    val fileName: String?,
    val filePath: String?,
    val message: String,
)

@Serializable
class CreateContainerRequest(
    val name: String,
    val image: String,
    val ports: List<PortMapping> = emptyList(),
    val env: Map<String, String> = emptyMap(),
    val volumes: List<VolumeMapping> = emptyList(),
    val networks: List<String> = emptyList(),
    val restartPolicy: String = "no",
)

@Serializable
class PortMapping(
    val containerPort: Int,
    val hostPort: Int,
    val protocol: String = "tcp",
)

@Serializable
class VolumeMapping(
    val containerPath: String,
    val hostPath: String,
    val mode: String = "rw",
)

@Serializable
class SaveComposeRequest(
    val name: String,
    val content: String,
)

@Serializable
class ComposeResult(
    val success: Boolean,
    val message: String,
)

@Serializable
class SystemLog(
    val name: String,
    val path: String,
    val size: Long,
    val lastModified: Long,
    val isDirectory: Boolean,
)

@Serializable
class FirewallRule(
    val id: String,
    val ip: String,
    val port: String? = null,
    val protocol: String = "ALL",
    val comment: String? = null,
    val createdAt: Long = Clock.System.now().toEpochMilliseconds(),
)

@Serializable
class BlockIPRequest(
    val ip: String,
    val port: String? = null,
    val protocol: String = "ALL",
    val comment: String? = null,
)

@Serializable
class IptablesRule(
    val pkts: String,
    val bytes: String,
    val target: String,
    val prot: String,
    val opt: String,
    val ins: String,
    val out: String,
    val source: String,
    val destination: String,
    val extra: String,
)

@Serializable
data class ProxyHost(
    val id: String,
    val domain: String,
    val target: String,
    val enabled: Boolean = true,
    val ssl: Boolean = false,
    val websocketEnabled: Boolean = false,
    val hstsEnabled: Boolean = false,
    val customSslPath: String? = null,
    val createdAt: Long = Clock.System.now().toEpochMilliseconds(),
)

@Serializable
class SSLCertificate(
    val id: String,
    val domain: String,
    val certPath: String,
    val keyPath: String,
)

@Serializable
class ProxyHit(
    val timestamp: Long,
    val ip: String,
    val method: String,
    val path: String,
    val status: Int,
    val responseTime: Int,
    val userAgent: String,
)

@Serializable
class ProxyStats(
    val totalHits: Long,
    val hitsByStatus: Map<Int, Long>,
    val hitsOverTime: Map<String, Long>, // Key: HH:00
    val topPaths: List<Pair<String, Long>>,
    val recentHits: List<ProxyHit>,
)

@Serializable
class BtmpEntry(
    val user: String,
    val ip: String,
    val session: String = "",
    val timestampString: String = "",
    val timestamp: Long = 0,
    val duration: String = "",
)

@Serializable
class JailedIP(
    val ip: String,
    val reason: String,
    val expiresAt: Long,
    val createdAt: Long = Clock.System.now().toEpochMilliseconds(),
)

@Serializable
class BtmpStats(
    val totalFailedAttempts: Int,
    val topUsers: List<Pair<String, Int>>,
    val topIps: List<Pair<String, Int>>,
    val recentFailures: List<BtmpEntry>,
    val lastUpdated: Long = 0,
    val jailedIps: List<JailedIP> = emptyList(),
    val autoJailEnabled: Boolean = false,
    val jailThreshold: Int = 5,
    val jailDurationMinutes: Int = 30,
    val refreshIntervalMinutes: Int = 5,
    val isMonitoringActive: Boolean = true,
)

@Serializable
data class ProxyContainerStatus(
    val exists: Boolean,
    val running: Boolean,
    val imageExists: Boolean,
    val containerId: String?,
    val status: String,
    val uptime: String?,
)
@Serializable
data class ProxyActionResult(
    val success: Boolean,
    val message: String,
)

@Serializable
class EmailDomain(
    val name: String,
)

@Serializable
class EmailUser(
    val userAddress: String,
)

@Serializable
class CreateEmailUserRequest(
    val userAddress: String,
    val password: String,
)

@Serializable
class UpdateEmailUserPasswordRequest(
    val password: String,
)

@Serializable
class SystemConfig(
    val dockerCommand: String,
    val dockerComposeCommand: String,
    val dataRoot: String,
    val jamesWebAdminUrl: String,
)


