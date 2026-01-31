package com.umeshsolanki.dockermanager.kafka

import kotlinx.serialization.Serializable

@Serializable
data class KafkaSettings(
    val enabled: Boolean = false,
    val bootstrapServers: String = "localhost:9092",
    val adminHost: String = "localhost:9092",
    val topic: String = "ip-blocking-requests",
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
