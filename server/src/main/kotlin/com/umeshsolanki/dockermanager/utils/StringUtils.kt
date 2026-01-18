package com.umeshsolanki.dockermanager.utils

import java.security.SecureRandom

object StringUtils {
    /**
     * Generates a secure random password using alphanumeric characters.
     * Use alphanumeric only to avoid shell escaping issues in Docker Compose/Env vars.
     */
    fun generateSecurePassword(length: Int = 32): String {
        val chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
        val random = SecureRandom()
        return (1..length).map { chars[random.nextInt(chars.length)] }.joinToString("")
    }
}
