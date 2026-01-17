package com.umeshsolanki.dockermanager

import com.umeshsolanki.dockermanager.proxy.ProxyJailRule
import com.umeshsolanki.dockermanager.constants.*
import com.umeshsolanki.dockermanager.proxy.IpFilterUtils
import com.umeshsolanki.dockermanager.utils.JsonPersistence
import com.umeshsolanki.dockermanager.cache.RedisConfig
import com.umeshsolanki.dockermanager.cache.CacheService
import com.umeshsolanki.dockermanager.database.DatabaseFactory
import com.umeshsolanki.dockermanager.database.SettingsTable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.intOrNull
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.upsert
import org.jetbrains.exposed.sql.transactions.transaction
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
    val proxyJailThresholdNon200: Int = 20,
    val proxyJailRules: List<ProxyJailRule> = emptyList(),
    
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

    // Keep JsonPersistence for file fallback/legacy reading
    private val jsonPersistence: JsonPersistence<AppSettings> by lazy {
        JsonPersistence.create(
            file = settingsFile,
            defaultContent = AppSettings(),
            loggerName = AppConfig::class.java.name
        )
    }

    // Initialize Settings from DB or File
    private var isDbActive = false
    private var _settings: AppSettings = loadSettings()

    val storageBackend: String get() = if (isDbActive) "database" else "file"

    fun reloadSettings() {
        logger.info("Reloading settings...")
        _settings = loadSettings()
    }

    private fun loadSettings(): AppSettings {
        logger.info("Initializing configuration...")
        isDbActive = false
        
        // 1. Initialize Database
        var shouldTryDb = false
        try {
            val dbConfigFile = File(dataRoot, "db-config.json")
            if (dbConfigFile.exists()) {
                shouldTryDb = true
                try {
                    val content = dbConfigFile.readText()
                    val jsonEl = json.parseToJsonElement(content).jsonObject
                    val host = jsonEl["host"]?.jsonPrimitive?.content
                    val port = jsonEl["port"]?.jsonPrimitive?.content 
                        ?: jsonEl["port"]?.jsonPrimitive?.intOrNull?.toString()
                    val name = jsonEl["name"]?.jsonPrimitive?.content
                    val user = jsonEl["user"]?.jsonPrimitive?.content
                    val password = jsonEl["password"]?.jsonPrimitive?.content
                    
                    DatabaseFactory.init(host, port, name, user, password)
                } catch (e: Exception) {
                    logger.error("Failed to read db-config.json", e)
                    DatabaseFactory.init()
                }
            } else if (!System.getenv("DB_HOST").isNullOrBlank()) {
                shouldTryDb = true
                DatabaseFactory.init()
            }
        } catch (e: Exception) {
            logger.error("Failed to initialize database: ${e.message}. Falling back to file-only mode if possible.", e)
            shouldTryDb = false
        }

        // 2. Try to load from Database (Main Source of Truth)
        if (shouldTryDb) {
            try {
                val dbSettingsJson = transaction {
                    SettingsTable.selectAll().where { SettingsTable.key eq "MAIN_SETTINGS" }
                        .singleOrNull()
                        ?.get(SettingsTable.value)
                }

                if (dbSettingsJson != null) {
                    logger.info("Settings loaded from Database")
                    isDbActive = true
                    val loaded = json.decodeFromString<AppSettings>(dbSettingsJson)
                    // FORCE DISABLE REDIS FOR NOW
                    CacheService.initialize(loaded.redisConfig.copy(enabled = false))
                    return loaded
                }
            } catch (e: Exception) {
                logger.warn("Failed to load settings from DB: ${e.message}")
            }
        }

        // 3. Fallback: Load from File (Legacy/Migration)
        return try {
            logger.info("Loading settings from file (migration/fallback): ${settingsFile.absolutePath}")
            val loadedFromFile = jsonPersistence.load()
            
            // 4. Migrate to DB
            try {
                logger.info("Migrating settings to Database...")
                val content = json.encodeToString(loadedFromFile)
                transaction {
                    SettingsTable.upsert {
                        it[key] = "MAIN_SETTINGS"
                        it[value] = content
                    }
                }
                logger.info("Settings migrated to Database successfully.")
                isDbActive = true
                // Optionally rename file to .bak? 
                // settingsFile.renameTo(File(settingsFile.parent, "${settingsFile.name}.bak"))
            } catch (e: Exception) {
                logger.error("Failed to migrate settings to DB", e)
            }

            logger.debug("Settings loaded successfully from file")
            // FORCE DISABLE REDIS FOR NOW
            CacheService.initialize(loadedFromFile.redisConfig.copy(enabled = false))
            loadedFromFile
        } catch (e: Exception) {
            logger.error("Failed to load settings from file, using defaults", e)
            val defaults = AppSettings()
            CacheService.initialize(defaults.redisConfig.copy(enabled = false))
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
        thresholdNon200: Int,
        rules: List<ProxyJailRule>
    ) {
        _settings = _settings.copy(
            proxyJailEnabled = enabled,
            proxyJailThresholdNon200 = thresholdNon200,
            proxyJailRules = rules
        )
        saveSettings()
    }

    val jailSettings: AppSettings get() = _settings
    val proxyStatsSettings: AppSettings get() = _settings
    val proxySecuritySettings: AppSettings get() = _settings
    
    fun updateRedisConfig(config: RedisConfig) {
        _settings = _settings.copy(redisConfig = config)
        saveSettings()
        // FORCE DISABLE REDIS FOR NOW
        CacheService.updateConfig(config.copy(enabled = false))
    }
    
    val redisConfig: RedisConfig get() = _settings.redisConfig

    private fun saveSettings() {
        // Save to DB
        try {
            val content = json.encodeToString(_settings)
            transaction {
                SettingsTable.upsert {
                    it[key] = "MAIN_SETTINGS"
                    it[value] = content
                    it[updatedAt] = java.time.LocalDateTime.now()
                }
            }
            logger.info("Settings saved to Database")
        } catch (e: Exception) {
            logger.error("Failed to save settings to Database", e)
        }

        // Also save to file as backup for now
        try {
            val saved = jsonPersistence.save(_settings)
            if (saved) {
                logger.debug("Settings synced to file backup at ${settingsFile.absolutePath}")
            }
        } catch (e: Exception) {
            logger.warn("Failed to sync settings to file backup", e)
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

