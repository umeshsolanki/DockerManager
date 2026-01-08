package com.umeshsolanki.dockermanager.email

import kotlinx.serialization.Serializable

// ========== Email Models ==========

@Serializable
data class EmailDomain(
    val domain: String
)

@Serializable
data class EmailUser(
    val address: String,
    val name: String? = null
)

@Serializable
data class CreateEmailUserRequest(
    val password: String,
    val name: String? = null
)

@Serializable
data class UpdateEmailUserPasswordRequest(
    val newPassword: String
)

@Serializable
data class EmailMailbox(
    val name: String
)

@Serializable
data class EmailGroup(
    val address: String,
    val members: List<String> = emptyList()
)

@Serializable
data class EmailQuota(
    val type: String,
    val used: Long,
    val limit: Long?
)

@Serializable
data class EmailUserDetail(
    val userAddress: String,
    val quotaCount: EmailQuota,
    val quotaSize: EmailQuota
)

@Serializable
data class EmailTestRequest(
    val host: String,
    val port: Int,
    val userAddress: String,
    val password: String,
    val useTls: Boolean = false
)

@Serializable
data class EmailTestResult(
    val success: Boolean,
    val message: String,
    val logs: List<String> = emptyList()
)

@Serializable
data class JamesContainerStatus(
    val exists: Boolean,
    val running: Boolean,
    val containerId: String? = null,
    val status: String? = null,
    val uptime: String? = null
)

