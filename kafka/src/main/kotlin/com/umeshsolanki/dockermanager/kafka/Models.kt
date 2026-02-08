package com.umeshsolanki.dockermanager.kafka

import kotlinx.serialization.Serializable

@Serializable
data class KafkaSettings(
    val enabled: Boolean = false,
    val bootstrapServers: String = "localhost:9092",
    val adminHost: String = "localhost:9092",
    val topic: String = "ip-blocking-requests",
    val reputationTopic: String = "ip-reputation-events",
    val groupId: String = "docker-manager-jailer"
)

@Serializable
data class IpBlockRequest(
    val ip: String,
    val durationMinutes: Int = 30,
    val reason: String = "Blocked via Kafka request from external app"
)

@Serializable
data class KafkaMessage(
    val topic: String,
    val partition: Int,
    val offset: Long,
    val key: String?,
    val value: String,
    val timestamp: Long
)

@Serializable
data class KafkaTopicInfo(
    val name: String,
    val partitions: Int,
    val replicationFactor: Int
)

@Serializable
data class SqlAuditLog(
    val timestamp: Long,
    val sql: String,
    val externalDbId: String?,
    val externalDbName: String?,
    val user: String? = "admin",
    val status: String,
    val error: String? = null
)
@Serializable
data class KafkaRule(
    val id: String = java.util.UUID.randomUUID().toString(),
    val name: String,
    val topic: String,
    val condition: String, // e.g. "ip == '1.2.3.4'"
    val transformations: Map<String, String> = emptyMap(), // e.g. "durationMinutes" -> "500"
    val storeInDb: Boolean = true,
    val enabled: Boolean = true
)

@Serializable
data class KafkaProcessedEvent(
    val id: String = java.util.UUID.randomUUID().toString(),
    val originalTopic: String,
    val timestamp: Long = System.currentTimeMillis(),
    val originalValue: String,
    val processedValue: String,
    val appliedRules: List<String> = emptyList()
)

@Serializable
data class IpReputationEvent(
    val type: String, // "BLOCK", "ACTIVITY", "OBSERVED", "DELETE"
    val ip: String,
    val timestamp: Long = System.currentTimeMillis(),
    val country: String? = null,
    val isp: String? = null,
    val reason: String? = null,
    val score: Int? = null,
    val blockedTimes: Int? = null,
    val tags: List<String> = emptyList(),
    val dangerTags: List<String> = emptyList()
)
