package com.umeshsolanki.ucpanel.android

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import com.umeshsolanki.ucpanel.App
import com.umeshsolanki.ucpanel.RegisterFcmTokenRequest
import com.umeshsolanki.ucpanel.SettingsManager
import com.umeshsolanki.ucpanel.api.SystemApiService
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* granted or denied — FCM will still deliver data messages */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        createNotificationChannels()
        requestNotificationPermission()

        setContent {
            App()
        }

        registerDevice()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

            val securityChannel = NotificationChannel(
                UcpanelFirebaseMessagingService.CHANNEL_SECURITY,
                "Security Events",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "IP jailing, failed login attempts, and other security alerts"
                enableVibration(true)
                setShowBadge(true)
            }

            val generalChannel = NotificationChannel(
                UcpanelFirebaseMessagingService.CHANNEL_GENERAL,
                "General",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "General server notifications"
            }

            manager.createNotificationChannels(listOf(securityChannel, generalChannel))
        }
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    private fun registerDevice() {
        if (SettingsManager.getFcmApiKey().isBlank()) return

        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                val token = task.result
                val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
                val deviceName = "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL} ($deviceId)"

                lifecycleScope.launch {
                    SystemApiService.registerFcmToken(
                        RegisterFcmTokenRequest(
                            token = token,
                            platform = "android",
                            deviceName = deviceName
                        )
                    )
                }
            }
        }
    }
}
