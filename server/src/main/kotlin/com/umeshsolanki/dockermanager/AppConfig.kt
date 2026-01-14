package com.umeshsolanki.dockermanager

import com.umeshsolanki.dockermanager.proxy.ProxyJailRule
import com.umeshsolanki.dockermanager.proxy.RuleChain
import com.umeshsolanki.dockermanager.constants.*
import com.umeshsolanki.dockermanager.proxy.IpFilterUtils
import com.umeshsolanki.dockermanager.utils.JsonPersistence
import com.umeshsolanki.dockermanager.cache.RedisConfig
import com.umeshsolanki.dockermanager.cache.CacheService
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory
import java.io.File

fun String?.ifNullOrBlank(value: String): String {
    return if (this.isNullOrBlank()) value else this
}

@Serializable
data class UpdateProxyStatsRequest(
    val active: Boolean,
    val intervalMs: Long,
    val filterLocalIps: Boolean? = null
)

@Serializable
data class AppSettings(
    val dockerSocket: String = SystemConstants.DOCKER_SOCKET_DEFAULT,
    val jamesWebAdminUrl: String = NetworkConstants.JAMES_WEB_ADMIN_DEFAULT,
    // Jail Settings
    val jailEnabled: Boolean = true,
    val jailThreshold: Int = 5,
    val jailDurationMinutes: Int = 30,
    val monitoringActive: Boolean = true,
    val monitoringIntervalMinutes: Int = 5,
    val fcmServiceAccountPath: String = FileConstants.FCM_SERVICE_ACCOUNT_JSON,
    val proxyStatsActive: Boolean = true,
    val proxyStatsIntervalMs: Long = 10000L,
    val filterLocalIps: Boolean = true, // Filter out local/internal IPs from analytics
    
    // Proxy Specific Security
    val proxyJailEnabled: Boolean = true,
    val proxyJailRules: List<ProxyJailRule> = emptyList(),
    val ruleChains: List<RuleChain> = emptyList(), // New rule system with AND/OR logic
    
    // Redis Cache Configuration
    val redisConfig: RedisConfig = RedisConfig()
)

object AppConfig {
    private val logger = LoggerFactory.getLogger(AppConfig::class.java)
    private const val DEFAULT_DATA_DIR = SystemConstants.DEFAULT_DATA_DIR

    val json = Json {
        prettyPrint = false
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true
    }

    val isDocker: Boolean by lazy {
        val inDocker =
            File(SystemConstants.DOCKERENV).exists() || (File(SystemConstants.PROC_CGROUP).exists() && File(SystemConstants.PROC_CGROUP).readText()
                .contains("docker"))
        logger.info("Environment detection: isDocker=$inDocker")
        inDocker
    }

    val dataRoot: File by lazy {
        if (isDocker) {
            File(SystemConstants.APP_DATA)
        } else {
            val env = System.getenv(SystemConstants.ENV_DATA_DIR).ifNullOrBlank(DEFAULT_DATA_DIR)
            logger.info("Using DATA_DIR: $env")
            File(env)
        }
    }

    private val settingsFile: File by lazy {
        File(dataRoot, FileConstants.SETTINGS_JSON)
    }

    private val jsonPersistence: JsonPersistence<AppSettings> by lazy {
        JsonPersistence.create(
            file = settingsFile,
            defaultContent = AppSettings(),
            loggerName = AppConfig::class.java.name
        )
    }

    private var _settings: AppSettings = loadSettings()

    private fun loadSettings(): AppSettings {
        return try {
            logger.info("Loading settings from ${settingsFile.absolutePath}")
            val loaded = jsonPersistence.load()
            logger.debug("Settings loaded successfully")
            // Initialize cache service with loaded Redis config
            CacheService.initialize(loaded.redisConfig)
            loaded
        } catch (e: Exception) {
            logger.error("Failed to load settings (corrupted?), using defaults", e)
            val defaults = AppSettings()
            CacheService.initialize(defaults.redisConfig)
            defaults
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

    fun updateProxyStatsSettings(active: Boolean, intervalMs: Long, filterLocalIps: Boolean? = null) {
        _settings = _settings.copy(
            proxyStatsActive = active,
            proxyStatsIntervalMs = intervalMs,
            filterLocalIps = filterLocalIps ?: _settings.filterLocalIps
        )
        saveSettings()
    }

    fun updateProxySecuritySettings(
        enabled: Boolean,
        rules: List<ProxyJailRule>
    ) {
        _settings = _settings.copy(
            proxyJailEnabled = enabled,
            proxyJailRules = rules
        )
        saveSettings()
    }
    
    fun updateRuleChains(chains: List<RuleChain>) {
        _settings = _settings.copy(ruleChains = chains)
        saveSettings()
    }
    
    fun addRuleChain(chain: RuleChain) {
        _settings = _settings.copy(ruleChains = _settings.ruleChains + chain)
        saveSettings()
    }
    
    fun updateRuleChain(chainId: String, chain: RuleChain) {
        _settings = _settings.copy(
            ruleChains = _settings.ruleChains.map { if (it.id == chainId) chain else it }
        )
        saveSettings()
    }
    
    fun deleteRuleChain(chainId: String) {
        _settings = _settings.copy(
            ruleChains = _settings.ruleChains.filter { it.id != chainId }
        )
        saveSettings()
    }

    val jailSettings: AppSettings get() = _settings
    val proxyStatsSettings: AppSettings get() = _settings
    val proxySecuritySettings: AppSettings get() = _settings
    
    fun updateRedisConfig(config: RedisConfig) {
        _settings = _settings.copy(redisConfig = config)
        saveSettings()
        CacheService.updateConfig(config)
    }
    
    val redisConfig: RedisConfig get() = _settings.redisConfig

    private fun saveSettings() {
        try {
            val saved = jsonPersistence.save(_settings)
            if (saved) {
                logger.info("Settings saved to ${settingsFile.absolutePath}")
            } else {
                logger.error("Failed to save settings to ${settingsFile.absolutePath}")
            }
        } catch (e: Exception) {
            logger.error("Failed to save settings to ${settingsFile.absolutePath}", e)
        }
    }


    val dockerCommand: String
        get() = if (isDocker) SystemConstants.DOCKER_BIN_DOCKER else {
            if (File(SystemConstants.DOCKER_BIN_DOCKER).exists()) SystemConstants.DOCKER_BIN_DOCKER else SystemConstants.DOCKER_COMMAND
        }

    val dockerComposeCommand: String
        get() = if (isDocker) SystemConstants.DOCKER_COMPOSE_BIN_USR else {
            if (File(SystemConstants.DOCKER_COMPOSE_BIN_HOMEBREW).exists()) {
                SystemConstants.DOCKER_COMPOSE_BIN_HOMEBREW
            } else if (File(SystemConstants.DOCKER_BIN_DOCKER).exists()) {
                SystemConstants.DOCKER_COMPOSE_BIN_USR
            } else {
                SystemConstants.DOCKER_COMPOSE_COMMAND
            }
        }

    val dockerSocket: String
        get() = _settings.dockerSocket


    //backup dirs
    val backupDir: File get() = File(dataRoot, FileConstants.BACKUPS)
    val composeProjDir: File get() = File(dataRoot, FileConstants.COMPOSE_YMLS)

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
    val proxyDir: File get() = File(dataRoot, FileConstants.NGINX)
    val proxyConfigDir: File get() = File(proxyDir, FileConstants.CONFIG_D)
    val proxyLogFile: File get() = File(proxyDir, "${FileConstants.LOGS}/${FileConstants.ACCESS_LOG}")
    val proxyHostsFile: File get() = File(dataRoot, "${FileConstants.PROXY}/${FileConstants.HOSTS_JSON}")

    // Log Service Configs
    val systemLogDir: File get() = if (isDocker) File(SystemConstants.HOST_VAR_LOG) else File(SystemConstants.VAR_LOG)

    // Btmp Service Configs
    val btmpLogFile: File get() = if (isDocker) File(SystemConstants.HOST_BTMP_LOG) else File(SystemConstants.BTMP_LOG)

    // Certs
    val certbotDir: File get() = File(dataRoot, FileConstants.CERTBOT)
    val letsEncryptDir: File get() = File(certbotDir, "${FileConstants.CONF}/${FileConstants.LIVE}")
    val customCertDir: File get() = File(dataRoot, FileConstants.CERTS)

    // Firewall Configs
    val firewallDataDir: File get() = File(dataRoot, FileConstants.FIREWALL)

    // File Manager
    val fileManagerDir: File get() = File.listRoots().first() ?: File("/")

    // When running in docker, we mount these binaries. When running locally, assume they are in PATH or sbin.
    // NOTE: If user runs jar on valid linux, iptables should be in path, but systemd path might be limited.
    val iptablesCmd: String
        get() {
            if (isDocker) return SystemConstants.IPTABLES_BIN_DOCKER
            if (File(SystemConstants.IPTABLES_BIN_USR_SBIN).exists()) return SystemConstants.IPTABLES_BIN_USR_SBIN
            if (File(SystemConstants.IPTABLES_BIN_SBIN).exists()) return SystemConstants.IPTABLES_BIN_SBIN
            return SystemConstants.IPTABLES_COMMAND
        }

    val ipsetCmd: String
        get() {
            if (isDocker) return SystemConstants.IPSET_BIN_DOCKER
            if (File(SystemConstants.IPSET_BIN_USR_SBIN).exists()) return SystemConstants.IPSET_BIN_USR_SBIN
            if (File(SystemConstants.IPSET_BIN_SBIN).exists()) return SystemConstants.IPSET_BIN_SBIN
            return SystemConstants.IPSET_COMMAND
        }

    // James
    val jamesDir: File get() = File(dataRoot, FileConstants.JAMES)
    val jamesConfigDir: File get() = File(jamesDir, FileConstants.CONF)
    val jamesVarDir: File get() = File(jamesDir, FileConstants.VAR)
    
    // Mailcow
    val mailcowDir: File get() = File(dataRoot, FileConstants.MAILCOW)
    val mailcowConfigDir: File get() = File(mailcowDir, FileConstants.CONF)
    val mailcowDataDir: File get() = File(mailcowDir, "data")

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

    fun isLocalIP(ip: String): Boolean {
        return IpFilterUtils.isLocalIp(ip)
    }
}

