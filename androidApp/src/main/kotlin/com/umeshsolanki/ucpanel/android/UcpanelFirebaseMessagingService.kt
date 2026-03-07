package com.umeshsolanki.ucpanel.android

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.umeshsolanki.ucpanel.api.SystemApiService
import com.umeshsolanki.ucpanel.RegisterFcmTokenRequest
import com.umeshsolanki.ucpanel.SettingsManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class UcpanelFirebaseMessagingService : FirebaseMessagingService() {

    private val job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.Main + job)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        registerToken(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        ensureChannels()

        val data = message.data
        val type = data["type"] ?: "general"
        val notification = message.notification

        val title = notification?.title ?: buildTitle(data)
        val body = notification?.body ?: buildBody(data)

        when (type) {
            "security" -> showSecurityNotification(title, body, data)
            else -> showGeneralNotification(title, body, data)
        }
    }

    private fun buildTitle(data: Map<String, String>): String {
        val action = data["action"] ?: return "Server Notification"
        return when (action) {
            "jail" -> "IP Jailed"
            "unjail" -> "IP Released"
            "2fa_enable" -> "2FA Enabled"
            "2fa_disable" -> "2FA Disabled"
            else -> "Security Alert"
        }
    }

    private fun buildBody(data: Map<String, String>): String {
        val ip = data["ip"]
        val reason = data["reason"]
        val action = data["action"]

        return when (action) {
            "jail" -> {
                val parts = mutableListOf<String>()
                if (ip != null) parts.add(ip)
                if (reason != null) parts.add(reason)
                if (parts.isEmpty()) "An IP has been jailed" else parts.joinToString(" — ")
            }
            "unjail" -> if (ip != null) "IP $ip has been released" else "An IP has been released"
            "2fa_enable" -> "Two-factor authentication enabled"
            "2fa_disable" -> "Two-factor authentication disabled"
            else -> data["message"] ?: "New event from server"
        }
    }

    private fun showSecurityNotification(title: String, body: String, data: Map<String, String>) {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        val ip = data["ip"]
        val action = data["action"]
        val reason = data["reason"]

        val tapIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("navigate_to", "firewall")
            putExtra("tab", "jails")
        }
        val pendingIntent = PendingIntent.getActivity(
            this, System.currentTimeMillis().toInt(), tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(this, CHANNEL_SECURITY)
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)

        if (reason != null && reason.length > 40) {
            builder.setStyle(
                NotificationCompat.BigTextStyle()
                    .bigText(body)
                    .setSummaryText(if (ip != null) "IP: $ip" else null)
            )
        }

        if (action == "jail" && ip != null) {
            builder.setSubText("Blocked: $ip")
        }

        val notificationId = (ip?.hashCode() ?: System.currentTimeMillis().toInt()) and 0x7FFFFFFF
        manager.notify(notificationId, builder.build())
    }

    private fun showGeneralNotification(title: String, body: String, data: Map<String, String>) {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        val tapIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, System.currentTimeMillis().toInt(), tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_GENERAL)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        manager.notify(System.currentTimeMillis().toInt(), notification)
    }

    private fun ensureChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

            if (manager.getNotificationChannel(CHANNEL_SECURITY) == null) {
                val securityChannel = NotificationChannel(
                    CHANNEL_SECURITY,
                    "Security Events",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "IP jailing, failed login attempts, and other security alerts"
                    enableVibration(true)
                    setShowBadge(true)
                }
                manager.createNotificationChannel(securityChannel)
            }

            if (manager.getNotificationChannel(CHANNEL_GENERAL) == null) {
                val generalChannel = NotificationChannel(
                    CHANNEL_GENERAL,
                    "General",
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply {
                    description = "General server notifications"
                }
                manager.createNotificationChannel(generalChannel)
            }
        }
    }

    private fun registerToken(token: String) {
        if (SettingsManager.getFcmApiKey().isBlank()) return

        val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        val deviceName = "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL} ($deviceId)"

        scope.launch {
            SystemApiService.registerFcmToken(
                RegisterFcmTokenRequest(
                    token = token,
                    platform = "android",
                    deviceName = deviceName
                )
            )
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }

    companion object {
        const val CHANNEL_SECURITY = "security_events"
        const val CHANNEL_GENERAL = "general"
    }
}
