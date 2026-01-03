package com.umeshsolanki.dockermanager

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import org.slf4j.LoggerFactory
import java.io.File

fun String?.ifNullOrBlank(value: String): String {
    return if (this.isNullOrBlank()) value else this
}

@Serializable
data class AppSettings(
    val dockerSocket: String = "/var/run/docker.sock",
    val jamesWebAdminUrl: String = "http://localhost:8001"
)

object AppConfig {
    private val logger = LoggerFactory.getLogger(AppConfig::class.java)
    const val PROJECT_DIR = "/opt/docker-manager"
    
    val json = Json { 
        prettyPrint = false
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true
    }

    private val settingsFile: File by lazy {
        File(dataRoot, "settings.json")
    }

    private var _settings: AppSettings = loadSettings()

    private fun loadSettings(): AppSettings {
        return try {
            if (settingsFile.exists()) {
                json.decodeFromString<AppSettings>(settingsFile.readText())
            } else {
                AppSettings()
            }
        } catch (e: Exception) {
            logger.error("Failed to load settings, using defaults", e)
            AppSettings()
        }
    }

    fun updateSettings(dockerSocket: String, jamesWebAdminUrl: String) {
        _settings = _settings.copy(
            dockerSocket = dockerSocket,
            jamesWebAdminUrl = jamesWebAdminUrl
        )
        saveSettings()
    }

    private fun saveSettings() {
        try {
            settingsFile.parentFile.mkdirs()
            settingsFile.writeText(json.encodeToString(_settings))
            logger.info("Settings saved to ${settingsFile.absolutePath}")
        } catch (e: Exception) {
            logger.error("Failed to save settings", e)
        }
    }

    val isDocker: Boolean by lazy {
        val inDocker =
            File("/.dockerenv").exists() || (File("/proc/1/cgroup").exists() && File("/proc/1/cgroup").readText()
                .contains("docker"))
        logger.info("Environment detection: isDocker=$inDocker")
        inDocker
    }

    val dockerCommand: String
        get() = if (isDocker) "/usr/bin/docker" else {
            if (File("/usr/bin/docker").exists()) "/usr/bin/docker" else "docker"
        }

    val dockerComposeCommand: String
        get() = if (isDocker) "/usr/bin/docker compose" else {
            if (File("/usr/bin/docker").exists()) "/usr/bin/docker compose" else "docker compose"
        }

    val dockerSocket: String
        get() = _settings.dockerSocket

    val dataRoot: File by lazy {
        if (isDocker) {
            File("/app/data")
        } else {
            val env = System.getenv("DATA_DIR").ifNullOrBlank(PROJECT_DIR.plus("/data"))
            logger.info("Using custom DATA_DIR from env: $env")
            File(env)
        }
    }


    val projectRoot: File by lazy {
        if (isDocker) {
            File("/app")
        } else {
            val env = System.getenv("PROJECT_ROOT").ifNullOrBlank(PROJECT_DIR)
            logger.info("Using custom PROJECT_ROOT from env: $env")
            File(env)
        }
    }

    //backup dirs
    val backupDir: File get() = File(dataRoot, "backups")
    val composeProjDir: File get() = File(dataRoot, "compose-ymls")

    // Proxy Service Configs
    val proxyDir: File get() = File(dataRoot, "nginx")
    val proxyConfigDir: File get() = File(proxyDir, "conf.d")
    val proxyLogFile: File get() = File(proxyDir, "logs/access.log")
    val proxyHostsFile: File get() = File(dataRoot, "proxy/hosts.json")

    // Log Service Configs
    val systemLogDir: File get() = if (isDocker) File("/host/var/log") else File("/var/log")

    // Btmp Service Configs
    val btmpLogFile: File get() = if (isDocker) File("/host/var/log/btmp") else File("/var/log/btmp")

    // Certs
    val certbotDir: File get() = File(dataRoot, "certbot")
    val letsEncryptDir: File get() = File(certbotDir, "conf/live")
    val customCertDir: File get() = File(dataRoot, "certs")

    // Firewall Configs
    val firewallDataDir: File get() = File(dataRoot, "firewall")

    // When running in docker, we mount these binaries. When running locally, assume they are in PATH or sbin.
    // NOTE: If user runs jar on valid linux, iptables should be in path.
    val iptablesCmd: String get() = if (isDocker) "/main/sbin/iptables" else "iptables"
    val ipsetCmd: String get() = if (isDocker) "/main/sbin/ipset" else "ipset"

    // James
    val jamesWebAdminUrl: String
        get() = _settings.jamesWebAdminUrl
}

