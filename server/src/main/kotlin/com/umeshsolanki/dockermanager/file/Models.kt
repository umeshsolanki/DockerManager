package com.umeshsolanki.dockermanager.file

import kotlinx.serialization.Serializable

// ========== File Models ==========

@Serializable
data class FileItem(
    val name: String,
    val path: String,
    val size: Long,
    val isDirectory: Boolean,
    val lastModified: Long,
    val extension: String? = null
)


