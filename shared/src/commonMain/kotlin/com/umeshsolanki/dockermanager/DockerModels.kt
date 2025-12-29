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
