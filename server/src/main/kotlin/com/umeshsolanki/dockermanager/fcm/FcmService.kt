package com.umeshsolanki.dockermanager.fcm
import com.umeshsolanki.dockermanager.*
import com.umeshsolanki.dockermanager.auth.RegisterFcmTokenRequest
import com.umeshsolanki.dockermanager.database.FcmTokensTable

import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.transactions.transaction

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
            
            // Migrate from file if needed
            migrateFromFileToDb()
        } catch (e: Exception) {
            logger.error("Failed to initialize FCM Service", e)
        }
    }
    
    private fun migrateFromFileToDb() {
         val tokensFile = AppConfig.fcmTokensFile
         if (tokensFile.exists()) {
             try {
                 val json = AppConfig.json
                 val fileTokens = json.decodeFromString<List<FcmTokenDetail>>(tokensFile.readText())
                 
                 if (fileTokens.isNotEmpty()) {
                     logger.info("Migrating ${fileTokens.size} FCM tokens from file to Database...")
                     transaction {
                         fileTokens.forEach { tokenDetail ->
                             val existing = FcmTokensTable.selectAll().where { FcmTokensTable.token eq tokenDetail.token }.singleOrNull()
                             if (existing != null) {
                                 FcmTokensTable.update({ FcmTokensTable.token eq tokenDetail.token }) { stmt ->
                                     stmt[FcmTokensTable.platform] = tokenDetail.platform ?: "unknown"
                                     stmt[FcmTokensTable.deviceName] = tokenDetail.deviceName ?: "unknown"
                                     // Don't update timestamps if migrating, or maybe just lastUsed
                                     stmt[FcmTokensTable.lastUsedAt] = java.time.LocalDateTime.now()
                                 }
                             } else {
                                 FcmTokensTable.insert { stmt ->
                                     stmt[FcmTokensTable.token] = tokenDetail.token
                                     stmt[FcmTokensTable.platform] = tokenDetail.platform ?: "unknown"
                                     stmt[FcmTokensTable.deviceName] = tokenDetail.deviceName ?: "unknown"
                                     stmt[FcmTokensTable.createdAt] = java.time.LocalDateTime.now()
                                     stmt[FcmTokensTable.lastUsedAt] = java.time.LocalDateTime.now()
                                 }
                             }
                         }
                     }
                     // Rename file to indicate migration done
                     tokensFile.renameTo(File(tokensFile.parent, "${tokensFile.name}.migrated"))
                     logger.info("FCM tokens migrated successfully.")
                 }
             } catch (e: Exception) {
                 logger.error("Failed to migrate FCM tokens from file", e)
             }
         }
    }

    fun registerToken(request: RegisterFcmTokenRequest) {
        val platformVal = request.platform ?: "unknown"
        val deviceNameVal = request.deviceName ?: request.deviceId ?: "Unknown"

        transaction {
            val existing = FcmTokensTable.selectAll().where { FcmTokensTable.token eq request.token }.singleOrNull()
            
            if (existing != null) {
                FcmTokensTable.update({ FcmTokensTable.token eq request.token }) { stmt ->
                    stmt[FcmTokensTable.platform] = platformVal
                    stmt[FcmTokensTable.deviceName] = deviceNameVal
                    stmt[FcmTokensTable.lastUsedAt] = java.time.LocalDateTime.now()
                }
            } else {
                FcmTokensTable.insert { stmt ->
                    stmt[FcmTokensTable.token] = request.token
                    stmt[FcmTokensTable.platform] = platformVal
                    stmt[FcmTokensTable.deviceName] = deviceNameVal
                    stmt[FcmTokensTable.createdAt] = java.time.LocalDateTime.now()
                    stmt[FcmTokensTable.lastUsedAt] = java.time.LocalDateTime.now()
                }
            }
            
            // Clean up old tokens (keep last 50 by last_used_at)
            val count = FcmTokensTable.selectAll().count()
            if (count > 50) {
                 val allTokens = FcmTokensTable.selectAll()
                    .orderBy(FcmTokensTable.lastUsedAt to org.jetbrains.exposed.sql.SortOrder.DESC)
                    .map { it[FcmTokensTable.token] }
                 
                 if (allTokens.size > 50) {
                     val tokensToRemove = allTokens.drop(50)
                     FcmTokensTable.deleteWhere { token inList tokensToRemove }
                 }
            }
        }
        logger.info("Registered FCM token for device: $deviceNameVal")
    }

    fun sendNotification(title: String, body: String, data: Map<String, String> = emptyMap()) {
        if (!isInitialized) return
        
        val tokens = transaction {
             FcmTokensTable.selectAll().map { 
                 FcmTokenDetail(
                     token = it[FcmTokensTable.token],
                     platform = it[FcmTokensTable.platform],
                     deviceName = it[FcmTokensTable.deviceName],
                     createdAt = 0L // Not really needed for sending
                 )
             }
        }
        
        if (tokens.isEmpty()) return

        logger.info("Sending FCM notification: $title to ${tokens.size} devices")
        
        val deadTokens = mutableListOf<String>()
        
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
                
                // Update last used
                transaction {
                    FcmTokensTable.update({ FcmTokensTable.token eq tokenDetail.token }) { stmt ->
                        stmt[FcmTokensTable.lastUsedAt] = java.time.LocalDateTime.now()
                    }
                }
            } catch (e: Exception) {
                logger.warn("Failed to send notification to token ${tokenDetail.token.take(10)}...: ${e.message}")
                if (e.message?.contains("Requested entity was not found") == true || 
                    e.message?.contains("invalid-registration-token") == true ||
                    e.message?.contains("UNREGISTERED") == true) {
                    deadTokens.add(tokenDetail.token)
                }
            }
        }
        
        if (deadTokens.isNotEmpty()) {
            transaction {
                FcmTokensTable.deleteWhere { token inList deadTokens }
            }
            logger.info("Removed ${deadTokens.size} invalid FCM tokens.")
        }
    }
}
