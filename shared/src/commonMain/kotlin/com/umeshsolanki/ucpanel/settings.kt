package com.umeshsolanki.ucpanel

import com.russhwolf.settings.Settings

object SettingsName {
    const val SERVER_URL = "SERVER_URL"
    const val SYSLOG_SERVER = "SYSLOG_SERVER"
    const val SYSLOG_PORT = "SYSLOG_PORT"
    const val AUTH_TOKEN = "AUTH_TOKEN"
    const val FCM_API_KEY = "FCM_API_KEY"
}


val appSettings: Settings = Settings()