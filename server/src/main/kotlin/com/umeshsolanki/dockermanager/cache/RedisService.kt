package com.umeshsolanki.dockermanager.cache

import io.lettuce.core.RedisClient
import io.lettuce.core.api.StatefulRedisConnection
import io.lettuce.core.api.sync.RedisCommands
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory
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
    val timeout: Int = 5000
)

@Serializable
data class RedisStatus(
    val enabled: Boolean,
    val connected: Boolean,
    val host: String,
    val port: Int
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
    val stackTrace: String? = null
)

@Serializable
data class RedisConfigUpdateResult(
    val success: Boolean,
    val message: String,
    val connected: Boolean
)

@Serializable
data class RedisTestResult(
    val success: Boolean,
    val message: String,
    val connected: Boolean
)

interface ICacheService {
    fun <T : Any> get(key: String, serializer: kotlinx.serialization.KSerializer<T>): T?
    fun <T : Any> set(key: String, value: T, serializer: kotlinx.serialization.KSerializer<T>, ttlSeconds: Long? = null): Boolean
    fun delete(key: String): Boolean
    fun exists(key: String): Boolean
    fun clear(): Boolean
    fun testConnection(): Boolean
    fun close()
}

class RedisServiceImpl(
    private var config: RedisConfig
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
                logger.info("Connecting to Redis: ${config.host}:${config.port}")
                
                redisClient = RedisClient.create(uri)
                connection = redisClient!!.connect()
                commands = connection!!.sync()
                
                // Test connection
                commands!!.ping()
                logger.info("Successfully connected to Redis")
            }
        } catch (e: Exception) {
            logger.error("Failed to connect to Redis", e)
            disconnect()
            throw e
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
    
    override fun <T : Any> set(key: String, value: T, serializer: kotlinx.serialization.KSerializer<T>, ttlSeconds: Long?): Boolean {
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
                if (commands == null) {
                    connect()
                }
                commands!!.ping() == "PONG"
            }
        } catch (e: Exception) {
            logger.error("Redis connection test failed", e)
            false
        }
    }
    
    override fun close() {
        disconnect()
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
    
    override fun <T : Any> set(key: String, value: T, serializer: kotlinx.serialization.KSerializer<T>, ttlSeconds: Long?): Boolean {
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
        return true // Always available
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
    
    fun initialize(config: RedisConfig) {
        currentConfig = config
        if (config.enabled) {
            try {
                redisService = RedisServiceImpl(config)
                logger.info("Redis cache initialized")
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
        currentConfig = config
        redisService?.updateConfig(config) ?: run {
            if (config.enabled) {
                initialize(config)
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
        val service = redisService ?: inMemoryService
        return service.testConnection()
    }
    
    fun close() {
        redisService?.close()
        inMemoryService.close()
    }
}

