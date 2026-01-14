package com.umeshsolanki.dockermanager.cache

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.AppSettings
import com.umeshsolanki.dockermanager.FcmTokenDetail
import com.umeshsolanki.dockermanager.constants.FileConstants
import com.umeshsolanki.dockermanager.email.EmailService
import io.lettuce.core.RedisClient
import io.lettuce.core.ClientOptions
import io.lettuce.core.TimeoutOptions
import io.lettuce.core.api.StatefulRedisConnection
import io.lettuce.core.api.sync.RedisCommands
import java.time.Duration
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory
import java.io.File
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

@Serializable
data class RedisConfig(
    val enabled: Boolean = false,
    val host: String = "localhost",
    val port: Int = 6379,
    val password: String? = null,
    val database: Int = 0,
    val ssl: Boolean = false,
    val timeout: Int = 5000,
)

@Serializable
data class RedisStatus(
    val enabled: Boolean,
    val connected: Boolean,
    val host: String,
    val port: Int,
)

@Serializable
data class RedisInstallResult(
    val success: Boolean,
    val message: String,
    val composeFile: String? = null,
    val passwordSet: Boolean = false,
    val usingDockerSecret: Boolean = false,
    val errorOutput: String? = null,
    val errorType: String? = null,
    val stackTrace: String? = null,
)

@Serializable
data class RedisConfigUpdateResult(
    val success: Boolean,
    val message: String,
    val connected: Boolean,
)

@Serializable
data class RedisTestResult(
    val success: Boolean,
    val message: String,
    val connected: Boolean,
)

interface ICacheService {
    fun <T : Any> get(key: String, serializer: kotlinx.serialization.KSerializer<T>): T?
    fun <T : Any> set(
        key: String,
        value: T,
        serializer: kotlinx.serialization.KSerializer<T>,
        ttlSeconds: Long? = null,
    ): Boolean

    fun delete(key: String): Boolean
    fun exists(key: String): Boolean
    fun clear(): Boolean
    fun testConnection(): Boolean
    fun close()
}

class RedisServiceImpl(
    private var config: RedisConfig,
) : ICacheService {
    private val logger = LoggerFactory.getLogger(RedisServiceImpl::class.java)
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private var redisClient: RedisClient? = null
    private var connection: StatefulRedisConnection<String, String>? = null
    private var commands: RedisCommands<String, String>? = null
    private val lock = ReentrantLock()

    init {
        if (config.enabled) {
            connect()
        }
    }

    fun updateConfig(newConfig: RedisConfig) {
        lock.withLock {
            val wasEnabled = config.enabled
            config = newConfig

            if (wasEnabled && !newConfig.enabled) {
                // Disable Redis
                disconnect()
            } else if (!wasEnabled && newConfig.enabled) {
                // Enable Redis
                connect()
            } else if (wasEnabled && newConfig.enabled) {
                // Reconnect with new config
                reconnect()
            }
        }
    }

    private fun connect() {
        try {
            lock.withLock {
                if (connection != null && connection!!.isOpen) {
                    return
                }

                val uri = buildRedisUri()
                logger.info("Connecting to Redis: ${config.host}:${config.port} (timeout: ${config.timeout}ms)")

                redisClient = RedisClient.create(uri)
                
                // Configure client options with timeout
                val timeoutMs = config.timeout.toLong()
                val clientOptions = ClientOptions.builder()
                    .timeoutOptions(
                        TimeoutOptions.builder()
                            .fixedTimeout(Duration.ofMillis(timeoutMs))
                            .build()
                    )
                    .build()
                redisClient!!.setOptions(clientOptions)
                
                connection = redisClient!!.connect()
                commands = connection!!.sync()

                // Test connection with timeout
                try {
                    commands!!.ping()
                    logger.info("Successfully connected to Redis")
                } catch (pingException: Exception) {
                    logger.error("Redis PING failed", pingException)
                    disconnect()
                    throw pingException
                }
            }
        } catch (e: Exception) {
            val errorDetails = when {
                e.message?.contains("Connection refused", ignoreCase = true) == true -> 
                    "Connection refused to ${config.host}:${config.port}. Ensure Redis is running and accessible."
                e.message?.contains("timeout", ignoreCase = true) == true -> 
                    "Connection timeout after ${config.timeout}ms. Check network connectivity and firewall."
                e.message?.contains("NOAUTH", ignoreCase = true) == true -> 
                    "Authentication required but no password provided."
                e.message?.contains("WRONGPASS", ignoreCase = true) == true -> 
                    "Authentication failed: wrong password."
                e.message?.contains("Connection reset", ignoreCase = true) == true -> 
                    "Connection reset. Redis might be bound to localhost only. Check Redis bind configuration (bind 0.0.0.0 or bind 127.0.0.1)."
                e.message?.contains("UnknownHostException", ignoreCase = true) == true -> 
                    "Cannot resolve hostname: ${config.host}. Check DNS configuration."
                else -> 
                    "Connection failed: ${e.message ?: e.javaClass.simpleName}"
            }
            logger.error("Failed to connect to Redis: $errorDetails", e)
            disconnect()
            throw RuntimeException(errorDetails, e)
        }
    }

    private fun reconnect() {
        disconnect()
        connect()
    }

    private fun disconnect() {
        lock.withLock {
            try {
                connection?.close()
                redisClient?.shutdown()
            } catch (e: Exception) {
                logger.error("Error disconnecting from Redis", e)
            } finally {
                connection = null
                redisClient = null
                commands = null
            }
        }
    }

    private fun buildRedisUri(): String {
        val protocol = if (config.ssl) "rediss" else "redis"
        val auth = if (config.password != null) {
            val encodedPassword = URLEncoder.encode(config.password, StandardCharsets.UTF_8)
            ":$encodedPassword@"
        } else {
            ""
        }
        return "$protocol://$auth${config.host}:${config.port}/${config.database}"
    }

    override fun <T : Any> get(key: String, serializer: kotlinx.serialization.KSerializer<T>): T? {
        if (!config.enabled || commands == null) return null

        return try {
            lock.withLock {
                val value = commands!!.get(key) ?: return null
                json.decodeFromString(serializer, value)
            }
        } catch (e: Exception) {
            logger.error("Error getting value from Redis for key: $key", e)
            null
        }
    }

    override fun <T : Any> set(
        key: String,
        value: T,
        serializer: kotlinx.serialization.KSerializer<T>,
        ttlSeconds: Long?,
    ): Boolean {
        if (!config.enabled || commands == null) return false

        return try {
            lock.withLock {
                val jsonValue = json.encodeToString(serializer, value)
                if (ttlSeconds != null && ttlSeconds > 0) {
                    commands!!.setex(key, ttlSeconds, jsonValue)
                } else {
                    commands!!.set(key, jsonValue)
                }
                true
            }
        } catch (e: Exception) {
            logger.error("Error setting value in Redis for key: $key", e)
            false
        }
    }

    override fun delete(key: String): Boolean {
        if (!config.enabled || commands == null) return false

        return try {
            lock.withLock {
                commands!!.del(key) > 0
            }
        } catch (e: Exception) {
            logger.error("Error deleting key from Redis: $key", e)
            false
        }
    }

    override fun exists(key: String): Boolean {
        if (!config.enabled || commands == null) return false

        return try {
            lock.withLock {
                commands!!.exists(key) > 0
            }
        } catch (e: Exception) {
            logger.error("Error checking existence in Redis for key: $key", e)
            false
        }
    }

    override fun clear(): Boolean {
        if (!config.enabled || commands == null) return false

        return try {
            lock.withLock {
                commands!!.flushdb()
                true
            }
        } catch (e: Exception) {
            logger.error("Error clearing Redis database", e)
            false
        }
    }

    override fun testConnection(): Boolean {
        if (!config.enabled) return false

        return try {
            lock.withLock {
                if (commands == null || !connection!!.isOpen) {
                    connect()
                }
                val pingResult = commands!!.ping()
                pingResult == "PONG"
            }
        } catch (e: Exception) {
            logger.error("Redis connection test failed", e)
            // Re-throw with better context for API error messages
            throw e
        }
    }

    override fun close() {
        disconnect()
    }

    /**
     * Get a connection to a specific database
     */
    fun getConnectionForDatabase(db: Int): RedisCommands<String, String>? {
        if (!config.enabled) return null
        return try {
            lock.withLock {
                if (connection == null || !connection!!.isOpen) {
                    connect()
                }
                // Switch to the requested database
                commands!!.select(db)
                commands
            }
        } catch (e: Exception) {
            logger.error("Error connecting to database $db", e)
            null
        }
    }

    /**
     * Get all keys matching a pattern (default: *)
     */
    fun getKeys(pattern: String = "*", db: Int = config.database): List<String> {
        if (!config.enabled) return emptyList()
        return try {
            lock.withLock {
                val cmd = getConnectionForDatabase(db) ?: return emptyList()
                cmd.keys(pattern).toList()
            }
        } catch (e: Exception) {
            logger.error("Error getting keys with pattern $pattern from database $db", e)
            emptyList()
        }
    }

    /**
     * Get raw string value of a key
     */
    fun getRawValue(key: String, db: Int = config.database): String? {
        if (!config.enabled) return null
        return try {
            lock.withLock {
                val cmd = getConnectionForDatabase(db) ?: return null
                cmd.get(key)
            }
        } catch (e: Exception) {
            logger.error("Error getting raw value for key $key from database $db", e)
            null
        }
    }

    /**
     * Get TTL of a key in seconds (-1 if no expiry, -2 if key doesn't exist)
     */
    fun getTtl(key: String, db: Int = config.database): Long {
        if (!config.enabled) return -2
        return try {
            lock.withLock {
                val cmd = getConnectionForDatabase(db) ?: return -2
                cmd.ttl(key)
            }
        } catch (e: Exception) {
            logger.error("Error getting TTL for key $key from database $db", e)
            -2
        }
    }

    /**
     * Get type of a key
     */
    fun getKeyType(key: String, db: Int = config.database): String? {
        if (!config.enabled) return null
        return try {
            lock.withLock {
                val cmd = getConnectionForDatabase(db) ?: return null
                cmd.type(key)
            }
        } catch (e: Exception) {
            logger.error("Error getting type for key $key from database $db", e)
            null
        }
    }

    /**
     * Get database size (number of keys)
     */
    fun getDatabaseSize(db: Int = config.database): Long {
        if (!config.enabled) return 0
        return try {
            lock.withLock {
                val cmd = getConnectionForDatabase(db) ?: return 0
                cmd.dbsize()
            }
        } catch (e: Exception) {
            logger.error("Error getting database size for database $db", e)
            0
        }
    }
}

// Fallback in-memory cache when Redis is disabled
class InMemoryCacheService : ICacheService {
    private val cache = java.util.concurrent.ConcurrentHashMap<String, String>()
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    override fun <T : Any> get(key: String, serializer: kotlinx.serialization.KSerializer<T>): T? {
        return try {
            val value = cache[key] ?: return null
            json.decodeFromString(serializer, value)
        } catch (e: Exception) {
            null
        }
    }

    override fun <T : Any> set(
        key: String,
        value: T,
        serializer: kotlinx.serialization.KSerializer<T>,
        ttlSeconds: Long?,
    ): Boolean {
        return try {
            val jsonValue = json.encodeToString(serializer, value)
            cache[key] = jsonValue
            true
        } catch (e: Exception) {
            false
        }
    }

    override fun delete(key: String): Boolean {
        return cache.remove(key) != null
    }

    override fun exists(key: String): Boolean {
        return cache.containsKey(key)
    }

    override fun clear(): Boolean {
        cache.clear()
        return true
    }

    override fun testConnection(): Boolean {
        return false // In-memory cache is not Redis, so return false
    }

    override fun close() {
        cache.clear()
    }
}

// Service object for easy access
object CacheService {
    var redisService: RedisServiceImpl? = null
        private set
    var inMemoryService: InMemoryCacheService = InMemoryCacheService()
        private set
    var currentConfig: RedisConfig = RedisConfig(enabled = false)
        private set
    private val logger = LoggerFactory.getLogger(CacheService::class.java)

    /**
     * Sync application data (hosts, users, tokens, domains) into Redis when Redis is enabled.
     * This imports data from file-based storage into Redis cache.
     */
    suspend fun syncApplicationDataToRedis() {
        if (!currentConfig.enabled || redisService == null) {
            logger.debug("Redis not enabled, skipping data sync")
            return
        }

        try {
            logger.info("Starting Redis data sync: importing hosts, users, tokens, domains, and settings...")
            var syncedCount = 0

            // 1. Sync Proxy Hosts (from hosts.json)
            try {
                val hosts = com.umeshsolanki.dockermanager.proxy.ProxyService.listHosts()
                if (hosts.isNotEmpty()) {
                    redisService?.set(
                        "proxy:hosts",
                        hosts,
                        kotlinx.serialization.serializer(),
                        null
                    )
                    syncedCount += hosts.size
                    logger.info("Synced ${hosts.size} proxy hosts to Redis")
                }
            } catch (e: Exception) {
                logger.warn("Failed to sync proxy hosts to Redis: ${e.message}", e)
            }

            // 2. Sync Email Domains
            try {
                val domains = EmailService.listEmailDomains()
                if (domains.isNotEmpty()) {
                    redisService?.set(
                        "email:domains",
                        domains,
                        kotlinx.serialization.serializer(),
                        null
                    )
                    syncedCount += domains.size
                    logger.info("Synced ${domains.size} email domains to Redis")
                }
            } catch (e: Exception) {
                logger.warn("Failed to sync email domains to Redis: ${e.message}", e)
            }

            // 3. Sync Email Users
            try {
                val users = EmailService.listEmailUsers()
                if (users.isNotEmpty()) {
                    redisService?.set(
                        "email:users",
                        users,
                        kotlinx.serialization.serializer(),
                        null
                    )
                    syncedCount += users.size
                    logger.info("Synced ${users.size} email users to Redis")
                }
            } catch (e: Exception) {
                logger.warn("Failed to sync email users to Redis: ${e.message}", e)
            }

            // 4. Sync FCM Tokens (from fcm-tokens.json file)
            try {
                val tokensFile = AppConfig.fcmTokensFile
                if (tokensFile.exists() && tokensFile.canRead()) {
                    val tokensJson = tokensFile.readText()
                    val tokens = AppConfig.json.decodeFromString<List<FcmTokenDetail>>(tokensJson)
                    if (tokens.isNotEmpty()) {
                        redisService?.set(
                            "fcm:tokens",
                            tokens,
                            kotlinx.serialization.serializer(),
                            null
                        )
                        syncedCount += tokens.size
                        logger.info("Synced ${tokens.size} FCM tokens to Redis")
                    }
                }
            } catch (e: Exception) {
                logger.warn("Failed to sync FCM tokens to Redis: ${e.message}", e)
            }

            // 5. Sync App Settings
            try {
                // Load AppSettings from settings.json file
                val settingsFile = File(AppConfig.dataRoot, FileConstants.SETTINGS_JSON)
                if (settingsFile.exists() && settingsFile.canRead()) {
                    val settingsJson = settingsFile.readText()
                    val settings = AppConfig.json.decodeFromString<AppSettings>(settingsJson)
                    redisService?.set(
                        "app:settings",
                        settings,
                        kotlinx.serialization.serializer(),
                        null
                    )
                    syncedCount += 1
                    logger.info("Synced AppSettings to Redis")
                }
            } catch (e: Exception) {
                logger.warn("Failed to sync AppSettings to Redis: ${e.message}", e)
            }

            logger.info("Redis data sync completed. Total items synced: $syncedCount")
        } catch (e: Exception) {
            logger.error("Error during Redis data sync: ${e.message}", e)
        }
    }

    fun initialize(config: RedisConfig) {
        currentConfig = config
        if (config.enabled) {
            try {
                redisService = RedisServiceImpl(config)
                logger.info("Redis cache initialized")
                // Sync application data to Redis in background
                CoroutineScope(Dispatchers.IO).launch {
                    syncApplicationDataToRedis()
                }
            } catch (e: Exception) {
                logger.error("Failed to initialize Redis, falling back to in-memory cache", e)
                redisService = null
            }
        } else {
            redisService = null
            logger.info("Using in-memory cache (Redis disabled)")
        }
    }

    fun updateConfig(config: RedisConfig) {
        val wasEnabled = currentConfig.enabled
        currentConfig = config
        redisService?.updateConfig(config) ?: run {
            if (config.enabled) {
                initialize(config)
            }
        }

        // If Redis is being enabled for the first time, sync application data
        if (config.enabled && !wasEnabled) {
            CoroutineScope(Dispatchers.IO).launch {
                syncApplicationDataToRedis()
            }
        }
    }

    fun getConfig(): RedisConfig {
        return currentConfig
    }

    inline fun <reified T : Any> get(key: String): T? {
        val service = redisService ?: inMemoryService
        return service.get(key, kotlinx.serialization.serializer())
    }

    inline fun <reified T : Any> set(key: String, value: T, ttlSeconds: Long? = null): Boolean {
        val service = redisService ?: inMemoryService
        return service.set(key, value, kotlinx.serialization.serializer(), ttlSeconds)
    }

    fun delete(key: String): Boolean {
        val service = redisService ?: inMemoryService
        return service.delete(key)
    }

    fun exists(key: String): Boolean {
        val service = redisService ?: inMemoryService
        return service.exists(key)
    }

    fun clear(): Boolean {
        val service = redisService ?: inMemoryService
        return service.clear()
    }

    fun testConnection(): Boolean {
        // Only test Redis connection if Redis is enabled
        if (!currentConfig.enabled) {
            return false
        }
        val service = redisService ?: throw RuntimeException("Redis service not initialized. Please check Redis configuration.")
        return service.testConnection()
    }

    fun close() {
        redisService?.close()
        inMemoryService.close()
    }
}

