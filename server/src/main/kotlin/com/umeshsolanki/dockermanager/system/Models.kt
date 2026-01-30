package com.umeshsolanki.dockermanager.system

import com.umeshsolanki.dockermanager.KafkaSettings
import kotlinx.serialization.Serializable

// ========== System Models ==========

@Serializable
data class SystemConfig(
    val dockerCommand: String,
    val dockerComposeCommand: String,
    val dockerSocket: String,
    val dataRoot: String,
    val jamesWebAdminUrl: String,
    val appVersion: String,
    val twoFactorEnabled: Boolean,
    val username: String,
    val proxyStatsActive: Boolean,
    val proxyStatsIntervalMs: Long,
    val storageBackend: String,
    val dockerBuildKit: Boolean,
    val dockerCliBuild: Boolean,
    val autoStorageRefresh: Boolean,
    val autoStorageRefreshIntervalMinutes: Int,
    val kafkaSettings: KafkaSettings
)

@Serializable
data class UpdateSystemConfigRequest(
    val dockerSocket: String? = null,
    val jamesWebAdminUrl: String? = null,
    val dockerBuildKit: Boolean? = null,
    val dockerCliBuild: Boolean? = null,
    val autoStorageRefresh: Boolean? = null,
    val autoStorageRefreshIntervalMinutes: Int? = null,
    val kafkaSettings: KafkaSettings? = null
)

@Serializable
data class BatteryStatus(
    val percentage: Int,
    val isCharging: Boolean,
    val source: String
)

@Serializable
data class DiskPartition(
    val path: String,
    val total: Long,
    val free: Long,
    val used: Long,
    val usagePercentage: Double
)

@Serializable
data class DockerStorageUsage(
    val imagesSize: Long,
    val containersSize: Long,
    val volumesSize: Long,
    val buildCacheSize: Long
)

@Serializable
data class StorageInfo(
    val total: Long,
    val free: Long,
    val used: Long,
    val dataRootSize: Long,
    val dataRootPath: String,
    val partitions: List<DiskPartition> = emptyList(),
    val dockerUsage: DockerStorageUsage? = null
)

@Serializable
data class IpFetchRequest(
    val provider: String,
    val url: String? = null,
    val customProvider: String? = null
)

@Serializable
data class IpFetchResponse(
    val status: String,
    val imported: Int,
    val error: String? = null
)

