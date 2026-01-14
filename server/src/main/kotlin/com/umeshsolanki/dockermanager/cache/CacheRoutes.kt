package com.umeshsolanki.dockermanager.cache

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.docker.DockerService
import com.umeshsolanki.dockermanager.proxy.ProxyActionResult
import com.umeshsolanki.dockermanager.utils.ResourceLoader
import com.umeshsolanki.dockermanager.utils.executeCommand
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import kotlinx.coroutines.delay
import java.io.File
import java.security.SecureRandom

private fun generateSecurePassword(length: Int = 32): String {
    val chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*"
    val random = SecureRandom()
    return (1..length).map { chars[random.nextInt(chars.length)] }.joinToString("")
}

fun Route.cacheRoutes() {
    route("/cache") {
        get("/redis/config") {
            call.respond(AppConfig.redisConfig)
        }

        post("/redis/config") {
            val config = call.receive<RedisConfig>()
            AppConfig.updateRedisConfig(config)
            val testResult = try {
                if (!config.enabled) {
                    call.respond(
                        HttpStatusCode.OK, RedisConfigUpdateResult(
                            success = true,
                            message = "Redis configuration updated (disabled)",
                            connected = false
                        )
                    )
                    return@post
                }
                CacheService.testConnection()
            } catch (e: Exception) {
                val errorMessage = when {
                    e.message?.contains("Connection refused", ignoreCase = true) == true -> 
                        "Redis configuration updated but connection test failed: Connection refused to ${config.host}:${config.port}. Ensure Redis is running (e.g., 'sudo systemctl status redis' or 'docker ps' if using Docker)."
                    e.message?.contains("timeout", ignoreCase = true) == true -> 
                        "Redis configuration updated but connection test failed: Connection timeout. Check network connectivity and firewall settings."
                    e.message?.contains("NOAUTH", ignoreCase = true) == true -> 
                        "Redis configuration updated but connection test failed: Authentication required. Please provide a password."
                    e.message?.contains("WRONGPASS", ignoreCase = true) == true -> 
                        "Redis configuration updated but connection test failed: Wrong password. Please verify your Redis password."
                    e.message?.contains("Connection reset", ignoreCase = true) == true -> 
                        "Redis configuration updated but connection test failed: Connection reset. On Ubuntu, Redis might be bound to localhost only. Edit /etc/redis/redis.conf and set 'bind 0.0.0.0' or 'bind 127.0.0.1 ::1' then restart Redis."
                    e.message?.contains("UnknownHostException", ignoreCase = true) == true -> 
                        "Redis configuration updated but connection test failed: Cannot resolve hostname '${config.host}'. Check DNS configuration."
                    else -> 
                        "Redis configuration updated but connection test failed: ${e.message ?: e.javaClass.simpleName}"
                }
                call.respond(
                    HttpStatusCode.OK, RedisConfigUpdateResult(
                        success = true,
                        message = errorMessage,
                        connected = false
                    )
                )
                return@post
            }
            call.respond(
                HttpStatusCode.OK, RedisConfigUpdateResult(
                    success = true,
                    message = if (testResult) "Redis configuration updated and connection verified" else "Redis configuration updated but connection test failed - check Redis configuration and ensure Redis is running",
                    connected = testResult
                )
            )
        }

        post("/redis/test") {
            val config = call.receive<RedisConfig>()
            val testResult = try {
                val tempService = RedisServiceImpl(config)
                val result = tempService.testConnection()
                tempService.close()
                result
            } catch (e: Exception) {
                val errorMessage = when {
                    e.message?.contains("Connection refused", ignoreCase = true) == true -> 
                        "Connection refused. Check if Redis is running and accessible at ${config.host}:${config.port}"
                    e.message?.contains("timeout", ignoreCase = true) == true -> 
                        "Connection timeout. Check network connectivity and firewall settings"
                    e.message?.contains("NOAUTH", ignoreCase = true) == true -> 
                        "Authentication failed. Check if password is correct"
                    e.message?.contains("WRONGPASS", ignoreCase = true) == true -> 
                        "Wrong password. Please verify your Redis password"
                    e.message?.contains("Connection reset", ignoreCase = true) == true -> 
                        "Connection reset. Redis might be bound to localhost only. Check Redis bind configuration"
                    else -> 
                        "Connection failed: ${e.message ?: e.javaClass.simpleName}"
                }
                call.respond(
                    HttpStatusCode.OK, RedisTestResult(
                        success = false,
                        message = errorMessage,
                        connected = false
                    )
                )
                return@post
            }
            call.respond(
                HttpStatusCode.OK, RedisTestResult(
                    success = testResult,
                    message = if (testResult) "Connection successful" else "Connection failed - check Redis configuration and ensure Redis is running",
                    connected = testResult
                )
            )
        }

        get("/redis/status") {
            val connected = CacheService.testConnection()
            call.respond(
                RedisStatus(
                    enabled = AppConfig.redisConfig.enabled,
                    connected = connected,
                    host = AppConfig.redisConfig.host,
                    port = AppConfig.redisConfig.port
                )
            )
        }

        get("/redis/sync") {
            // Sync from default config file locations
            val defaultPaths = listOf(
                File(AppConfig.dataRoot, "redis-config.json"),
            )

            val foundFiles = defaultPaths.mapNotNull { path ->
                if (path.exists() && path.isFile) {
                    mapOf(
                        "path" to path.absolutePath, "exists" to true, "readable" to path.canRead()
                    )
                } else null
            }

            call.respond(
                mapOf(
                    "defaultPaths" to defaultPaths.map { it.absolutePath },
                    "foundFiles" to foundFiles,
                    "currentConfig" to AppConfig.redisConfig
                )
            )
        }

        post("/redis/sync") {
            try {
                val request = call.receive<Map<String, String>>()
                val filePath = request["filePath"] ?: request["path"] ?: request["file"]

                if (filePath.isNullOrBlank()) {
                    call.respond(
                        HttpStatusCode.BadRequest, RedisConfigUpdateResult(
                            success = false,
                            message = "File path is required. Provide 'filePath', 'path', or 'file' parameter.",
                            connected = false
                        )
                    )
                    return@post
                }

                val configFile = File(filePath)

                if (!configFile.exists()) {
                    call.respond(
                        HttpStatusCode.NotFound, RedisConfigUpdateResult(
                            success = false,
                            message = "Config file not found: ${configFile.absolutePath}",
                            connected = false
                        )
                    )
                    return@post
                }

                if (!configFile.isFile) {
                    call.respond(
                        HttpStatusCode.BadRequest, RedisConfigUpdateResult(
                            success = false,
                            message = "Path is not a file: ${configFile.absolutePath}",
                            connected = false
                        )
                    )
                    return@post
                }

                // Read and parse config file
                val configJson = try {
                    configFile.readText()
                } catch (e: Exception) {
                    call.respond(
                        HttpStatusCode.InternalServerError, RedisConfigUpdateResult(
                            success = false,
                            message = "Failed to read config file: ${e.message}",
                            connected = false
                        )
                    )
                    return@post
                }

                val config = try {
                    AppConfig.json.decodeFromString<RedisConfig>(configJson)
                } catch (e: Exception) {
                    call.respond(
                        HttpStatusCode.BadRequest, RedisConfigUpdateResult(
                            success = false,
                            message = "Invalid JSON format in config file: ${e.message}",
                            connected = false
                        )
                    )
                    return@post
                }

                // Update config
                AppConfig.updateRedisConfig(config)
                val testResult = CacheService.testConnection()

                call.respond(
                    HttpStatusCode.OK, RedisConfigUpdateResult(
                        success = true, message = if (testResult) {
                            "Configuration synced successfully from ${configFile.absolutePath} and connection verified"
                        } else {
                            "Configuration synced successfully from ${configFile.absolutePath} but connection test failed. Please check your Redis settings."
                        }, connected = testResult
                    )
                )
            } catch (e: Exception) {
                call.respond(
                    HttpStatusCode.InternalServerError, RedisConfigUpdateResult(
                        success = false,
                        message = "Failed to sync configuration from file: ${e.message}",
                        connected = false
                    )
                )
            }
        }

        post("/clear") {
            val cleared = CacheService.clear()
            call.respond(
                HttpStatusCode.OK,
                ProxyActionResult(
                    cleared,
                    if (cleared) "Cache cleared successfully" else "Failed to clear cache"
                )
            )
        }

        // Redis database browsing endpoints
        get("/redis/databases") {
            if (!AppConfig.redisConfig.enabled || !CacheService.testConnection()) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Redis not connected"))
                return@get
            }
            try {
                val databases = (0..15).map { db ->
                    val service = RedisServiceImpl(AppConfig.redisConfig.copy(database = db))
                    val size = try {
                        service.getDatabaseSize(db)
                    } catch (e: Exception) {
                        0L
                    } finally {
                        service.close()
                    }
                    mapOf("database" to db, "size" to size)
                }
                call.respond(databases)
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, mapOf("error" to e.message))
            }
        }

        get("/redis/database/{db}/keys") {
            if (!AppConfig.redisConfig.enabled || !CacheService.testConnection()) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Redis not connected"))
                return@get
            }
            try {
                val db = call.parameters["db"]?.toIntOrNull() ?: 0
                val pattern = call.request.queryParameters["pattern"] ?: "*"
                val service = RedisServiceImpl(AppConfig.redisConfig.copy(database = db))
                val keys = try {
                    service.getKeys(pattern, db).map { key ->
                        val ttl = service.getTtl(key, db)
                        val type = service.getKeyType(key, db) ?: "unknown"
                        mapOf(
                            "key" to key,
                            "type" to type,
                            "ttl" to ttl
                        )
                    }
                } finally {
                    service.close()
                }
                call.respond(keys)
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, mapOf("error" to e.message))
            }
        }

        get("/redis/database/{db}/key/{key}") {
            if (!AppConfig.redisConfig.enabled || !CacheService.testConnection()) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Redis not connected"))
                return@get
            }
            try {
                val db = call.parameters["db"]?.toIntOrNull() ?: 0
                val key = call.parameters["key"] ?: return@get call.respond(
                    HttpStatusCode.BadRequest, mapOf("error" to "Key parameter required")
                )
                val service = RedisServiceImpl(AppConfig.redisConfig.copy(database = db))
                val result = try {
                    val value = service.getRawValue(key, db)
                    val type = service.getKeyType(key, db) ?: "unknown"
                    val ttl = service.getTtl(key, db)
                    mapOf(
                        "key" to key,
                        "value" to value,
                        "type" to type,
                        "ttl" to ttl
                    )
                } finally {
                    service.close()
                }
                call.respond(result)
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, mapOf("error" to e.message))
            }
        }

        delete("/redis/database/{db}/key/{key}") {
            if (!AppConfig.redisConfig.enabled || !CacheService.testConnection()) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Redis not connected"))
                return@delete
            }
            try {
                val db = call.parameters["db"]?.toIntOrNull() ?: 0
                val key = call.parameters["key"] ?: return@delete call.respond(
                    HttpStatusCode.BadRequest, mapOf("error" to "Key parameter required")
                )
                val service = RedisServiceImpl(AppConfig.redisConfig.copy(database = db))
                val deleted = try {
                    service.delete(key)
                } finally {
                    service.close()
                }
                call.respond(mapOf("success" to deleted, "message" to if (deleted) "Key deleted" else "Key not found"))
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, mapOf("error" to e.message))
            }
        }

        post("/install") {
            try {
                // Generate secure random password
                val password = generateSecurePassword()

                // Check if Docker is in Swarm mode
                val isSwarmMode = try {
                    val cmd = "${AppConfig.dockerCommand} info --format '{{.Swarm.LocalNodeState}}'"
                    val result = executeCommand(cmd)
                    val swarmState = result.output.trim()
                    result.exitCode == 0 && swarmState == "active"
                } catch (e: Exception) {
                    false
                }

                // Always use .env file approach for non-Swarm mode to avoid secret issues
                // Only use Docker secrets if explicitly in Swarm mode

                val secretName = "redis_password"
                var passwordStored = false
                var secretError: String? = null

                if (isSwarmMode) {
                    // Use Docker secrets (Swarm mode)
                    try {
                        val existingSecrets = DockerService.listSecrets()
                        val existingSecret = existingSecrets.find { it.name == secretName }

                        if (existingSecret != null) {
                            DockerService.removeSecret(existingSecret.id)
                        }

                        passwordStored = DockerService.createSecret(secretName, password)
                        if (!passwordStored) {
                            secretError = "Failed to create Docker secret"
                        }
                    } catch (e: Exception) {
                        // Fall back to .env file if secret creation fails
                        passwordStored = false
                        secretError = e.message
                    }
                }

                val redisDir = File(AppConfig.composeProjDir, "redis")
                redisDir.mkdirs()

                // Load compose template based on whether we're using Docker secrets or .env file
                val composeContent = if (passwordStored) {
                    // Use Docker secrets (Swarm mode) - load Swarm template
                    ResourceLoader.loadResourceOrThrow("templates/redis/docker-compose-swarm.yml")
                } else {
                    // Use .env file for regular Docker Compose (non-Swarm) - load regular template
                    ResourceLoader.loadResourceOrThrow("templates/redis/docker-compose.yml")
                }

                // Create .env file if not using Docker secrets
                if (!passwordStored) {
                    val envFile = File(redisDir, ".env")
                    envFile.writeText("REDIS_PASSWORD=$password\n")
                }

                val composeFile = File(redisDir, "docker-compose.yml")
                composeFile.writeText(composeContent)

                // Start Redis container first
                val result = DockerService.composeUp(composeFile.absolutePath)

                if (!result.success) {
                    // Don't update config if container failed to start
                } else {
                    // Wait a bit for Redis container to be ready
                    delay(3000)

                    // Update Redis config with the generated password after container is started
                    val updatedConfig = AppConfig.redisConfig.copy(
                        enabled = true, host = "localhost", port = 6379, password = password
                    )
                    // Try to update config, but don't fail if connection isn't ready yet
                    try {
                        AppConfig.updateRedisConfig(updatedConfig)
                    } catch (e: Exception) {
                        // Connection failed, but save config anyway so it's persisted
                        // Save config with enabled=false first, then retry connection in background
                        val configWithoutEnable = updatedConfig.copy(enabled = false)
                        AppConfig.updateRedisConfig(configWithoutEnable)
                        // Connection will be retried when Redis is accessed or user tests connection
                    }
                }

                if (!result.success) {
                    // Provide detailed error information
                    val errorDetails = buildString {
                        append("Docker Compose failed to start Redis.\n")
                        append("Command output: ${result.message}\n")
                        if (secretError != null && isSwarmMode) {
                            append("Note: Docker secret creation failed: $secretError\n")
                            append("Fell back to .env file method.\n")
                        }
                        append("Compose file location: ${composeFile.absolutePath}\n")
                        if (!passwordStored) {
                            append("Password stored in: ${File(redisDir, ".env").absolutePath}")
                        }
                    }

                    call.respond(
                        HttpStatusCode.InternalServerError, RedisInstallResult(
                            success = false,
                            message = errorDetails,
                            composeFile = composeFile.absolutePath,
                            passwordSet = true,
                            usingDockerSecret = passwordStored,
                            errorOutput = result.message
                        )
                    )
                    return@post
                }

                call.respond(
                    HttpStatusCode.OK, RedisInstallResult(
                        success = true,
                        message = if (passwordStored) {
                            "Redis installed and started successfully. Password stored in Docker secret."
                        } else {
                            "Redis installed and started successfully. Password stored in .env file."
                        },
                        composeFile = composeFile.absolutePath,
                        passwordSet = true,
                        usingDockerSecret = passwordStored
                    )
                )
            } catch (e: Exception) {
                call.respond(
                    HttpStatusCode.InternalServerError, RedisInstallResult(
                        success = false,
                        message = "Failed to install Redis: ${e.message}",
                        errorType = e.javaClass.simpleName,
                        stackTrace = e.stackTraceToString()
                    )
                )
            }
        }
    }
}

