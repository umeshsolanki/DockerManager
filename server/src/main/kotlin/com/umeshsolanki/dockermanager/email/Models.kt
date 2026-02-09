package com.umeshsolanki.dockermanager.email

import kotlinx.serialization.Serializable

// ========== Email Models ==========

@Serializable
data class EmailDomain(
    val name: String
)

@Serializable
data class EmailUser(
    val userAddress: String,
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
data class ImapConfig(
    val host: String = "",
    val port: Int = 993,
    val username: String = "",
    val password: String = "",
    val useSsl: Boolean = true,
    val useTls: Boolean = false
)

@Serializable
data class EmailMessage(
    val id: String,
    val subject: String,
    val from: String,
    val to: String,
    val date: String,
    val body: String? = null,
    val hasAttachments: Boolean = false,
    val unread: Boolean = false
)

@Serializable
data class EmailFolder(
    val name: String,
    val fullName: String,
    val messageCount: Int = 0,
    val unreadCount: Int = 0
)

@Serializable
data class EmailClientConfig(
    val smtpConfig: SmtpConfig = SmtpConfig(),
    val imapConfig: ImapConfig = ImapConfig()
)

@Serializable
data class SmtpConfig(
    val host: String = "",
    val port: Int = 587,
    val username: String = "",
    val password: String = "",
    val fromAddress: String = "",
    val useTls: Boolean = true,
    val useSsl: Boolean = false
)

@Serializable
data class AlertConfig(
    val enabled: Boolean = false,
    val adminEmail: String = "",
    val smtpConfig: SmtpConfig = SmtpConfig(),
    val alertOnSystemStartup: Boolean = true,
    val alertOnContainerFailure: Boolean = true
)
