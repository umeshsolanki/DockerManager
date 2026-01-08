package com.umeshsolanki.dockermanager.auth

import kotlinx.serialization.Serializable

// ========== Auth Models ==========

@Serializable
data class AuthRequest(
    val username: String? = null,
    val password: String,
    val otpCode: String? = null
)

@Serializable
data class AuthResponse(
    val token: String,
    val requires2FA: Boolean = false
)

@Serializable
data class UpdatePasswordRequest(
    val currentPassword: String,
    val newPassword: String
)

@Serializable
data class UpdateUsernameRequest(
    val currentPassword: String,
    val newUsername: String
)

@Serializable
data class Enable2FARequest(
    val secret: String,
    val code: String
)

@Serializable
data class RegisterFcmTokenRequest(
    val token: String,
    val deviceId: String? = null,
    val platform: String? = null,
    val deviceName: String? = null
)

@Serializable
data class AccessInfo(
    val username: String = "admin",
    val password: String,
    val twoFactorEnabled: Boolean = false,
    val twoFactorSecret: String? = null
)

