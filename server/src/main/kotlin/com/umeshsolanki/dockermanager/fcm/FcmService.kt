package com.umeshsolanki.dockermanager.fcm
import com.umeshsolanki.dockermanager.*
import com.umeshsolanki.dockermanager.auth.RegisterFcmTokenRequest

import com.google.auth.oauth2.GoogleCredentials
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.Message
import com.google.firebase.messaging.Notification
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory
import java.io.File
import java.io.FileInputStream

object FcmService {
    private val logger = LoggerFactory.getLogger(FcmService::class.java)
    private var isInitialized = false
    private val tokensFile = AppConfig.fcmTokensFile
    private val json = AppConfig.json
    
    private val tokens = mutableListOf<FcmTokenDetail>()

    fun initialize() {
        try {
            val serviceAccountFile = AppConfig.fcmServiceAccountFile
            if (!serviceAccountFile.exists()) {
                logger.warn("FCM Service Account file not found at ${serviceAccountFile.absolutePath}. Notifications will be disabled.")
                return
            }

            val options = FirebaseOptions.builder()
                .setCredentials(GoogleCredentials.fromStream(FileInputStream(serviceAccountFile)))
                .build()

            FirebaseApp.initializeApp(options)
            isInitialized = true
            logger.info("FCM Service initialized successfully.")
            
            loadTokens()
        } catch (e: Exception) {
            logger.error("Failed to initialize FCM Service", e)
        }
    }

    private fun loadTokens() {
        if (tokensFile.exists()) {
            try {
                val loaded = json.decodeFromString<List<FcmTokenDetail>>(tokensFile.readText())
                tokens.clear()
                tokens.addAll(loaded)
                logger.info("Loaded ${tokens.size} FCM tokens.")
            } catch (e: Exception) {
                logger.error("Failed to load FCM tokens", e)
            }
        }
    }

    private fun saveTokens() {
        try {
            tokensFile.writeText(json.encodeToString(tokens))
        } catch (e: Exception) {
            logger.error("Failed to save FCM tokens", e)
        }
    }

    fun registerToken(request: RegisterFcmTokenRequest) {
        val existing = tokens.find { it.token == request.token }
        if (existing != null) {
            tokens.remove(existing)
        }
        
        tokens.add(FcmTokenDetail(
            token = request.token,
            platform = request.platform ?: "unknown",
            deviceName = request.deviceName ?: request.deviceId ?: "Unknown",
            createdAt = System.currentTimeMillis()
        ))
        
        // Keep only last 50 tokens to avoid bloating
        if (tokens.size > 50) {
            tokens.removeAt(0)
        }
        
        saveTokens()
        logger.info("Registered FCM token for device: ${request.deviceName ?: "Unknown"}")
    }

    fun sendNotification(title: String, body: String, data: Map<String, String> = emptyMap()) {
        if (!isInitialized) return
        if (tokens.isEmpty()) return

        logger.info("Sending FCM notification: $title")
        
        val deadTokens = mutableListOf<FcmTokenDetail>()
        
        tokens.forEach { tokenDetail ->
            try {
                val messageBuilder = Message.builder()
                    .setToken(tokenDetail.token)
                    .setNotification(Notification.builder()
                        .setTitle(title)
                        .setBody(body)
                        .build())

                data.forEach { (k, v) -> messageBuilder.putData(k, v) }
                
                FirebaseMessaging.getInstance().send(messageBuilder.build())
            } catch (e: Exception) {
                logger.warn("Failed to send notification to token ${tokenDetail.token.take(10)}...: ${e.message}")
                if (e.message?.contains("Requested entity was not found") == true || 
                    e.message?.contains("invalid-registration-token") == true) {
                    deadTokens.add(tokenDetail)
                }
            }
        }
        
        if (deadTokens.isNotEmpty()) {
            tokens.removeAll(deadTokens)
            saveTokens()
            logger.info("Removed ${deadTokens.size} invalid FCM tokens.")
        }
    }
}
