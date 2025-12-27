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
