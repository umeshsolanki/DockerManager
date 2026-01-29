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
    val kafkaSettings: KafkaSettings
)

@Serializable
data class UpdateSystemConfigRequest(
    val dockerSocket: String? = null,
    val jamesWebAdminUrl: String? = null,
    val dockerBuildKit: Boolean? = null,
    val dockerCliBuild: Boolean? = null,
    val kafkaSettings: KafkaSettings? = null
)

@Serializable
data class BatteryStatus(
    val percentage: Int,
    val isCharging: Boolean,
    val source: String
)@Serializable
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

