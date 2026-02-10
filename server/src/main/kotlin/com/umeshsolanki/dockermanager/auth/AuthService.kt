package com.umeshsolanki.dockermanager.auth

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.TwoFactorSetupResponse
import com.umeshsolanki.dockermanager.fcm.FcmService
import com.umeshsolanki.dockermanager.jail.JailManagerService
import com.umeshsolanki.dockermanager.utils.JsonPersistence
import org.slf4j.LoggerFactory
import java.io.File
import java.net.URLEncoder
import java.nio.ByteBuffer
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

sealed class AuthResult {
    data class Success(val token: String) : AuthResult()
    data object InvalidCredentials : AuthResult()
    data object Requires2FA : AuthResult()
    data object Invalid2FA : AuthResult()
}

object AuthService {
    private val logger = LoggerFactory.getLogger(AuthService::class.java)
    private val accessFile: File get() = File(AppConfig.dataRoot, "accessInfo.json")
    
    private lateinit var jsonPersistence: JsonPersistence<AccessInfo>
    private var currentAccess: AccessInfo = AccessInfo(password = "")

    // Token -> Expiry
    private val activeTokens = ConcurrentHashMap<String, Long>()
    private const val SESSION_DURATION_MS = 24 * 60 * 60 * 1000L // 24 hours

    fun initialize() {
        // Check if file exists before creating JsonFileManager to handle env vars
        if (!accessFile.exists()) {
            val envUsername = System.getenv("MANAGER_USERNAME") ?: "admin"
            val envPassword = System.getenv("MANAGER_PASSWORD") ?: generateRandomString(16)
            
            val initialAccess = AccessInfo(username = envUsername, password = envPassword)
            
            // Create JsonFileManager with initial content
            jsonPersistence = JsonPersistence.create(
                file = accessFile,
                defaultContent = initialAccess,
                loggerName = AuthService::class.java.name
            )
            
            // Save the initial access info
            jsonPersistence.save(initialAccess)
            currentAccess = initialAccess
            
            if (System.getenv("MANAGER_PASSWORD") == null) {
                logger.warn(
                    "\n" + "#".repeat(60) + "\nINITIAL ACCESS GENERATED:\nUSERNAME: $envUsername\nPASSWORD: $envPassword\nLOCATION: ${accessFile.absolutePath}\n" + "#".repeat(
                        60
                    )
                )
            } else {
                logger.info("Access info initialized from environment variables")
            }
        } else {
            // File exists, create JsonFileManager and load
            jsonPersistence = JsonPersistence.create(
                file = accessFile,
                defaultContent = AccessInfo(password = ""),
                loggerName = AuthService::class.java.name
            )
            
            try {
                currentAccess = jsonPersistence.load()
                logger.info("Access info loaded for user: ${currentAccess.username}")
            } catch (e: Exception) {
                logger.error("Failed to load access info, generating new default", e)
                val pwd = generateRandomString(16)
                val defaultAccess = AccessInfo(password = pwd)
                jsonPersistence.save(defaultAccess)
                currentAccess = defaultAccess
            }
        }
    }

    private fun saveAccessInfo(info: AccessInfo) {
        currentAccess = info
        jsonPersistence.save(info)
    }

    fun authenticate(
        password: String,
        username: String? = null,
        code: String? = null,
        remoteHost: String? = null,
    ): AuthResult {
        // Guard against jailed IPs
        remoteHost?.let { ip ->
            if (JailManagerService.isIPJailed(ip)) {
                logger.warn("Blocking login attempt from jailed IP: $ip")
                return AuthResult.InvalidCredentials
            }
        }

        val result = internalAuthenticate(password, username, code, remoteHost)

        // Record failure if not from a local IP
        if (result is AuthResult.InvalidCredentials || result is AuthResult.Invalid2FA) {
            remoteHost?.let { ip ->
                if (!AppConfig.isLocalIP(ip)) {
                    JailManagerService.recordFailedLoginAttempt(ip)
                }
            }
        } else if (result is AuthResult.Success) {
            remoteHost?.let { ip ->
                JailManagerService.clearFailedAttempts(ip)
            }
        }

        return result
    }

    private fun internalAuthenticate(
        password: String,
        username: String? = null,
        code: String? = null,
        remoteHost: String? = null,
    ): AuthResult {
        if (username != null && username != currentAccess.username) return AuthResult.InvalidCredentials
        if (password != currentAccess.password) return AuthResult.InvalidCredentials

        val isLocallyAccessed = remoteHost?.let { AppConfig.isLocalIP(it) } ?: false

        if (currentAccess.twoFactorEnabled && !isLocallyAccessed) {
            if (code.isNullOrBlank()) return AuthResult.Requires2FA
            if (!verifyTotp(currentAccess.twoFactorSecret!!, code)) return AuthResult.Invalid2FA
        }

        val token = generateRandomString(32, true)
        activeTokens[token] = System.currentTimeMillis() + SESSION_DURATION_MS
        return AuthResult.Success(token)
    }

    fun validateToken(token: String): Boolean {
        val expiry = activeTokens[token] ?: return false
        if (System.currentTimeMillis() > expiry) {
            activeTokens.remove(token)
            return false
        }
        return true
    }

    fun updatePassword(current: String, newOne: String): Boolean {
        if (current != currentAccess.password) return false
        saveAccessInfo(currentAccess.copy(password = newOne))
        activeTokens.clear() // Revoke all sessions on password change for security
        return true
    }

    fun updateUsername(currentPassword: String, newUsername: String): Boolean {
        if (currentPassword != currentAccess.password) {
            logger.warn("Username update failed for ${currentAccess.username}: Invalid current password")
            return false
        }
        val trimmed = newUsername.trim()
        if (trimmed.isEmpty()) {
            logger.warn("Username update failed: New username cannot be empty")
            return false
        }

        logger.info("Username updated from ${currentAccess.username} to $trimmed")
        saveAccessInfo(currentAccess.copy(username = trimmed))
        activeTokens.clear() // Revoke all sessions on username change for security
        return true
    }

    fun is2FAEnabled(): Boolean = currentAccess.twoFactorEnabled
    fun getUsername(): String = currentAccess.username

    // --- 2FA Logic ---

    fun generate2FASecret(): TwoFactorSetupResponse {
        val secret = generateRandomSecret(20) // 160 bits is standard for TOTP
        val base32Secret = Base32.encode(secret)

        val issuer = "UCpanel"
        val account = currentAccess.username

        // Correctly URL encode labels
        val encodedIssuer = URLEncoder.encode(issuer, "UTF-8").replace("+", "%20")
        val encodedAccount = URLEncoder.encode(account, "UTF-8").replace("+", "%20")
        val qrUri =
            "otpauth://totp/$encodedIssuer:$encodedAccount?secret=$base32Secret&issuer=$encodedIssuer"

        return TwoFactorSetupResponse(base32Secret, qrUri)
    }

    fun enable2FA(secret: String, code: String): Boolean {
        if (verifyTotp(secret, code)) {
            saveAccessInfo(
                currentAccess.copy(
                    twoFactorEnabled = true, twoFactorSecret = secret
                )
            )
            FcmService.sendNotification(
                title = "Security Alert: 2FA Enabled",
                body = "Two-factor authentication has been successfully enabled for your account.",
                data = mapOf("type" to "security", "action" to "2fa_enable")
            )
            return true
        }
        return false
    }

    fun disable2FA(currentPassword: String): Boolean {
        if (currentPassword != currentAccess.password) return false
        saveAccessInfo(currentAccess.copy(twoFactorEnabled = false, twoFactorSecret = null))
        FcmService.sendNotification(
            title = "Security Alert: 2FA Disabled",
            body = "Two-factor authentication has been disabled for your account.",
            data = mapOf("type" to "security", "action" to "2fa_disable")
        )
        return true
    }

    private fun verifyTotp(secret: String, code: String): Boolean {
        val decodedSecret = Base32.decode(secret) ?: return false
        val timeWindow = 30L
        val currentInterval = System.currentTimeMillis() / 1000 / timeWindow

        // Check current, previous, and next interval (allow some drift)
        for (i in -1..1) {
            val hash = generateHOTP(decodedSecret, currentInterval + i)
            if (hash == code) return true
        }
        logger.warn("TOTP Verification failed for code: $code")
        return false
    }

    private fun generateHOTP(secret: ByteArray, interval: Long): String {
        val data = ByteBuffer.allocate(8).putLong(interval).array()
        val algo = "HmacSHA1"
        val mac = Mac.getInstance(algo)
        mac.init(SecretKeySpec(secret, algo))
        val hash = mac.doFinal(data)

        val offset = hash[hash.size - 1].toInt() and 0xf
        val binary =
            ((hash[offset].toInt() and 0x7f) shl 24) or ((hash[offset + 1].toInt() and 0xff) shl 16) or ((hash[offset + 2].toInt() and 0xff) shl 8) or (hash[offset + 3].toInt() and 0xff)

        val otp = binary % 1000000
        return "%06d".format(otp)
    }

    private fun generateRandomString(length: Int, alphanumericOnly: Boolean = false): String {
        val chars =
            if (alphanumericOnly) "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
            else "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$"
        val random = SecureRandom()
        return (1..length).map { chars[random.nextInt(chars.length)] }.joinToString("")
    }

    private fun generateRandomSecret(length: Int): ByteArray {
        val bytes = ByteArray(length)
        SecureRandom().nextBytes(bytes)
        return bytes
    }

    // --- Utils ---
    object Base32 {
        private const val ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

        fun encode(data: ByteArray): String {
            val sb = StringBuilder()
            var buffer = 0
            var bitsLeft = 0
            for (byte in data) {
                buffer = (buffer shl 8) or (byte.toInt() and 0xff)
                bitsLeft += 8
                while (bitsLeft >= 5) {
                    sb.append(ALPHABET[(buffer ushr (bitsLeft - 5)) and 0x1f])
                    bitsLeft -= 5
                }
            }
            if (bitsLeft > 0) {
                sb.append(ALPHABET[(buffer shl (5 - bitsLeft)) and 0x1f])
            }
            return sb.toString()
        }

        fun decode(data: String): ByteArray? {
            val clean = data.uppercase().trim().replace(" ", "").replace("-", "")
            // simplified strict decoding
            val result = java.io.ByteArrayOutputStream()
            var buffer = 0
            var bitsLeft = 0
            for (char in clean) {
                val index = ALPHABET.indexOf(char)
                if (index < 0) return null
                buffer = (buffer shl 5) or index
                bitsLeft += 5
                if (bitsLeft >= 8) {
                    result.write((buffer ushr (bitsLeft - 8)) and 0xff)
                    bitsLeft -= 8
                }
            }
            return result.toByteArray()
        }
    }
}
