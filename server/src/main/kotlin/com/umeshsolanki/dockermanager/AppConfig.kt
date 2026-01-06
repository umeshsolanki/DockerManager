package com.umeshsolanki.dockermanager

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory
import java.io.File

fun String?.ifNullOrBlank(value: String): String {
    return if (this.isNullOrBlank()) value else this
}

@Serializable
data class AppSettings(
    val dockerSocket: String = "/var/run/docker.sock",
    val jamesWebAdminUrl: String = "http://localhost:8001",
    // Jail Settings
    val jailEnabled: Boolean = true,
    val jailThreshold: Int = 5,
    val jailDurationMinutes: Int = 30,
    val monitoringActive: Boolean = true,
    val monitoringIntervalMinutes: Int = 5,
    val fcmServiceAccountPath: String = "fcm-service-account.json",
    val proxyStatsActive: Boolean = true,
    val proxyStatsIntervalMs: Long = 10000L,
)

object AppConfig {
    private val logger = LoggerFactory.getLogger(AppConfig::class.java)
    private const val DEFAULT_DATA_DIR = "/opt/docker-manager/data"

    val json = Json {
        prettyPrint = false
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true
    }

    val isDocker: Boolean by lazy {
        val inDocker =
            File("/.dockerenv").exists() || (File("/proc/1/cgroup").exists() && File("/proc/1/cgroup").readText()
                .contains("docker"))
        logger.info("Environment detection: isDocker=$inDocker")
        inDocker
    }

    val dataRoot: File by lazy {
        if (isDocker) {
            File("/app/data")
        } else {
            val env = System.getenv("DATA_DIR").ifNullOrBlank(DEFAULT_DATA_DIR)
            logger.info("Using DATA_DIR: $env")
            File(env)
        }
    }

    private val settingsFile: File by lazy {
        File(dataRoot, "settings.json")
    }

    private var _settings: AppSettings = loadSettings()

    private fun loadSettings(): AppSettings {
        return try {
            logger.info("Loading settings from ${settingsFile.absolutePath}")
            if (settingsFile.exists()) {
                val content = settingsFile.readText()
                logger.debug("Settings content: $content")
                json.decodeFromString<AppSettings>(content)
            } else {
                logger.info("Settings file not found, using defaults")
                AppSettings()
            }
        } catch (e: Exception) {
            logger.error("Failed to load settings (corrupted?), using defaults", e)
            AppSettings()
        }
    }

    fun updateSettings(dockerSocket: String, jamesWebAdminUrl: String) {
        _settings = _settings.copy(
            dockerSocket = dockerSocket, jamesWebAdminUrl = jamesWebAdminUrl
        )
        saveSettings()
    }

    fun updateJailSettings(
        enabled: Boolean,
        threshold: Int,
        durationMinutes: Int,
        monitoringActive: Boolean? = null,
        monitoringIntervalMinutes: Int? = null,
    ) {
        _settings = _settings.copy(
            jailEnabled = enabled,
            jailThreshold = threshold,
            jailDurationMinutes = durationMinutes,
            monitoringActive = monitoringActive ?: _settings.monitoringActive,
            monitoringIntervalMinutes = monitoringIntervalMinutes
                ?: _settings.monitoringIntervalMinutes
        )
        saveSettings()
    }

    fun updateProxyStatsSettings(active: Boolean, intervalMs: Long) {
        _settings = _settings.copy(
            proxyStatsActive = active, proxyStatsIntervalMs = intervalMs
        )
        saveSettings()
    }

    val jailSettings: AppSettings get() = _settings
    val proxyStatsSettings: AppSettings get() = _settings

    private fun saveSettings() {
        try {
            if (!settingsFile.parentFile.exists()) {
                val created = settingsFile.parentFile.mkdirs()
                if (!created) {
                    logger.error("Failed to create directory: ${settingsFile.parentFile.absolutePath}")
                }
            }
            settingsFile.writeText(json.encodeToString(_settings))
            logger.info(
                "Settings saved to ${settingsFile.absolutePath}. Content: ${
                    json.encodeToString(
                        _settings
                    )
                }"
            )
        } catch (e: Exception) {
            logger.error("Failed to save settings to ${settingsFile.absolutePath}", e)
        }
    }


    val dockerCommand: String
        get() = if (isDocker) "/usr/bin/docker" else {
            if (File("/usr/bin/docker").exists()) "/usr/bin/docker" else "docker"
        }

    val dockerComposeCommand: String
        get() = if (isDocker) "/usr/bin/docker compose" else {
            if (File("/opt/homebrew/bin/docker-compose").exists()) {
                "/opt/homebrew/bin/docker-compose"
            } else if (File("/usr/bin/docker").exists()) {
                "/usr/bin/docker compose"
            } else {
                "docker compose"
            }
        }

    val dockerSocket: String
        get() = _settings.dockerSocket


    //backup dirs
    val backupDir: File get() = File(dataRoot, "backups")
    val composeProjDir: File get() = File(dataRoot, "compose-ymls")

    val projectRoot: File by lazy {
        logger.info("Using project root: ${composeProjDir.absolutePath}")
        return@lazy if (composeProjDir.exists()) {
            composeProjDir
        } else {
            composeProjDir.mkdirs()
            composeProjDir
        }
    }

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
    // NOTE: If user runs jar on valid linux, iptables should be in path, but systemd path might be limited.
    val iptablesCmd: String
        get() {
            if (isDocker) return "/main/sbin/iptables"
            if (File("/usr/sbin/iptables").exists()) return "/usr/sbin/iptables"
            if (File("/sbin/iptables").exists()) return "/sbin/iptables"
            return "iptables"
        }

    val ipsetCmd: String
        get() {
            if (isDocker) return "/main/sbin/ipset"
            if (File("/usr/sbin/ipset").exists()) return "/usr/sbin/ipset"
            if (File("/sbin/ipset").exists()) return "/sbin/ipset"
            return "ipset"
        }

    // James
    val jamesDir: File get() = File(dataRoot, "james")
    val jamesConfigDir: File get() = File(jamesDir, "conf")
    val jamesVarDir: File get() = File(jamesDir, "var")

    val jamesWebAdminUrl: String
        get() = _settings.jamesWebAdminUrl

    val appVersion: String by lazy {
        try {
            val props = java.util.Properties()
            props.load(AppConfig::class.java.getResourceAsStream("/version.properties"))
            props.getProperty("version", "Unknown")
        } catch (e: Exception) {
            logger.warn("Failed to load version.properties", e)
            "Unknown"
        }
    }

    val fcmServiceAccountFile: File get() = File(dataRoot, _settings.fcmServiceAccountPath)
    val fcmTokensFile: File get() = File(dataRoot, "fcm-tokens.json")
}

