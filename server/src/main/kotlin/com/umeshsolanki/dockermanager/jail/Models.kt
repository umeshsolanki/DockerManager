package com.umeshsolanki.dockermanager.jail

import kotlinx.serialization.Serializable

// ========== Jail Models ==========

@Serializable
data class JailedIP(
    val ip: String,
    val country: String,
    val reason: String,
    val expiresAt: Long,
    val createdAt: Long
)

@Serializable
data class BtmpStats(
    val totalFailedAttempts: Long,
    val topUsers: List<TopUserEntry> = emptyList(),
    val topIps: List<TopIpEntry> = emptyList(),
    val recentFailures: List<BtmpEntry> = emptyList(),
    val lastUpdated: Long,
    val jailedIps: List<JailedIP> = emptyList(),
    val autoJailEnabled: Boolean,
    val jailThreshold: Int,
    val jailDurationMinutes: Int,
    val refreshIntervalMinutes: Int,
    val isMonitoringActive: Boolean
)

@Serializable
data class BtmpEntry(
    val user: String,
    val ip: String,
    val country: String,
    val session: String,
    val timestampString: String,
    val timestamp: Long,
    val duration: String
)

@Serializable
data class TopUserEntry(
    val user: String,
    val count: Long
)

@Serializable
data class TopIpEntry(
    val ip: String,
    val count: Long,
    val country: String
)



