package com.umeshsolanki.dockermanager

import com.russhwolf.settings.Settings

object SettingsName {
    const val SERVER_URL = "SERVER_URL"
    const val SYSLOG_SERVER = "SYSLOG_SERVER"
    const val SYSLOG_PORT = "SYSLOG_PORT"
}


val appSettings: Settings = Settings()