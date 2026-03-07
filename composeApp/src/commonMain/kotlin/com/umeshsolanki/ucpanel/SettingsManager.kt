package com.umeshsolanki.ucpanel

import com.russhwolf.settings.set

object SettingsManager {
    fun getServerUrl(): String {
        return appSettings.getString(SettingsName.SERVER_URL, "http://192.168.1.3:9091")
    }

    fun setServerUrl(url: String) {
        appSettings[SettingsName.SERVER_URL] = url
    }

    fun getSyslogServer(): String {
        return appSettings.getString(SettingsName.SYSLOG_SERVER, "127.0.0.1")
    }

    fun setSyslogServer(server: String) {
        appSettings[SettingsName.SYSLOG_SERVER] = server
    }

    fun getSyslogPort(): Int {
        return appSettings.getInt(SettingsName.SYSLOG_PORT, 514)
    }

    fun setSyslogPort(port: Int) {
        appSettings[SettingsName.SYSLOG_PORT] = port
    }

    fun getAuthToken(): String {
        return appSettings.getString(SettingsName.AUTH_TOKEN, "")
    }

    fun setAuthToken(token: String) {
        appSettings[SettingsName.AUTH_TOKEN] = token
    }

    fun getFcmApiKey(): String {
        return appSettings.getString(SettingsName.FCM_API_KEY, "")
    }

    fun setFcmApiKey(key: String) {
        appSettings[SettingsName.FCM_API_KEY] = key
    }
}
