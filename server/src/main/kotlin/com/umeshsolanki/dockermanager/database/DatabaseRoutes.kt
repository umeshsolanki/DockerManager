package com.umeshsolanki.dockermanager.database

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.docker.DockerService
import com.umeshsolanki.dockermanager.utils.ResourceLoader
import com.umeshsolanki.dockermanager.utils.executeCommand
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import kotlinx.coroutines.delay
import kotlinx.serialization.Serializable
import java.io.File
import java.security.SecureRandom

@Serializable
data class PostgresInstallResult(
    val success: Boolean,
    val message: String,
    val composeFile: String? = null,
    val passwordSet: Boolean = false,
    val usingDockerSecret: Boolean = false,
    val errorType: String? = null,
    val stackTrace: String? = null,
    val errorOutput: String? = null
)

@Serializable
data class DatabaseStatus(
    val type: String,
    val status: String,
    val host: String? = null,
    val port: Int? = null,
    val isInstalled: Boolean = false
)

private fun generateSecurePassword(length: Int = 32): String {
    val chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*"
    val random = SecureRandom()
    return (1..length).map { chars[random.nextInt(chars.length)] }.joinToString("")
}

fun Route.databaseRoutes() {
    route("/database") {
        get("/status") {
            val redisDir = File(AppConfig.composeProjDir, "redis")
            val postgresDir = File(AppConfig.composeProjDir, "postgres")
            
            val redisStatus = if (File(redisDir, "docker-compose.yml").exists()) {
                DockerService.checkComposeFileStatus(File(redisDir, "docker-compose.yml").absolutePath)
            } else "not installed"
            
            val postgresStatus = if (File(postgresDir, "docker-compose.yml").exists()) {
                DockerService.checkComposeFileStatus(File(postgresDir, "docker-compose.yml").absolutePath)
            } else "not installed"
            
            call.respond(listOf(
                DatabaseStatus("redis", redisStatus, "localhost", 6379, redisStatus != "not installed"),
                DatabaseStatus("postgres", postgresStatus, "localhost", 5432, postgresStatus != "not installed")
            ))
        }

        post("/postgres/install") {
            try {
                val password = generateSecurePassword()
                val postgresDir = File(AppConfig.composeProjDir, "postgres")
                postgresDir.mkdirs()

                // Load compose template (Always use standard for initial Compose setup)
                val composeContent = ResourceLoader.loadResourceOrThrow("templates/postgres/docker-compose.yml")
                
                // Load Dockerfile template
                val dockerfileContent = ResourceLoader.loadResourceOrThrow("templates/postgres/Dockerfile")

                // Create .env file
                val envFile = File(postgresDir, ".env")
                envFile.writeText("POSTGRES_PASSWORD=$password\nPOSTGRES_USER=admin\nPOSTGRES_DB=mydatabase\nPOSTGRES_PORT=5432\n")

                // Save credentials for the application
                val dbConfig = mapOf(
                    "host" to "localhost",
                    "port" to 5432,
                    "name" to "mydatabase",
                    "user" to "admin",
                    "password" to password
                )
                val dbConfigFile = File(AppConfig.dataRoot, "db-config.json")
                dbConfigFile.writeText(AppConfig.json.encodeToString(dbConfig))

                val composeFile = File(postgresDir, "docker-compose.yml")
                composeFile.writeText(composeContent)
                
                val dockerFile = File(postgresDir, "Dockerfile")
                dockerFile.writeText(dockerfileContent)

                // Build Postgres Image explicitly (to ensure local image is available and avoid pull errors)
                val buildResult = DockerService.composeBuild(composeFile.absolutePath)
                if (!buildResult.success) {
                     call.respond(
                        HttpStatusCode.InternalServerError, PostgresInstallResult(
                            success = false,
                            message = "Failed to build Postgres image: ${buildResult.message}",
                            composeFile = composeFile.absolutePath,
                            errorOutput = buildResult.message
                        )
                    )
                    return@post
                }

                // Start Postgres
                val result = DockerService.composeUp(composeFile.absolutePath)

                if (!result.success) {
                    call.respond(
                        HttpStatusCode.InternalServerError, PostgresInstallResult(
                            success = false,
                            message = "Failed to start Postgres: ${result.message}",
                            composeFile = composeFile.absolutePath,
                            errorOutput = result.message
                        )
                    )
                    return@post
                }
                
                try {
                    // Wait for DB to be ready
                    delay(5000)
                    AppConfig.reloadSettings()
                } catch (e: Exception) {
                    println("Failed to reload settings after DB install: ${e.message}")
                }

                call.respond(
                    HttpStatusCode.OK, PostgresInstallResult(
                        success = true,
                        message = "Postgres installed and started successfully.",
                        composeFile = composeFile.absolutePath,
                        passwordSet = true,
                        usingDockerSecret = false
                    )
                )
            } catch (e: Exception) {
                call.respond(
                    HttpStatusCode.InternalServerError, PostgresInstallResult(
                        success = false,
                        message = "Failed to install Postgres: ${e.message}",
                        errorType = e.javaClass.simpleName,
                        stackTrace = e.stackTraceToString()
                    )
                )
            }
        }
        
        post("/postgres/reset") {
             // Reset is effectively a re-install
             try {
                val password = generateSecurePassword()
                val postgresDir = File(AppConfig.composeProjDir, "postgres")
                postgresDir.mkdirs()

                // Load compose template
                val composeContent = ResourceLoader.loadResourceOrThrow("templates/postgres/docker-compose.yml")
                
                // Load Dockerfile template
                val dockerfileContent = ResourceLoader.loadResourceOrThrow("templates/postgres/Dockerfile")

                // Create .env file
                val envFile = File(postgresDir, ".env")
                envFile.writeText("POSTGRES_PASSWORD=$password\nPOSTGRES_USER=admin\nPOSTGRES_DB=mydatabase\nPOSTGRES_PORT=5432\n")

                val composeFile = File(postgresDir, "docker-compose.yml")
                composeFile.writeText(composeContent)
                
                val dockerFile = File(postgresDir, "Dockerfile")
                dockerFile.writeText(dockerfileContent)

                call.respond(
                    HttpStatusCode.OK, PostgresInstallResult(
                        success = true,
                        message = "Postgres configuration reset to defaults. You may need to restart the container.",
                        composeFile = composeFile.absolutePath,
                        passwordSet = true,
                        usingDockerSecret = false
                    )
                )
             } catch (e: Exception) {
                 call.respond(
                    HttpStatusCode.InternalServerError, PostgresInstallResult(
                        success = false,
                        message = "Failed to reset Postgres: ${e.message}",
                        errorType = e.javaClass.simpleName,
                        stackTrace = e.stackTraceToString()
                    )
                )
             }
        }

        post("/postgres/switch-to-file") {
            try {
                val dbConfigFile = File(AppConfig.dataRoot, "db-config.json")
                if (dbConfigFile.exists()) {
                    val bakFile = File(AppConfig.dataRoot, "db-config.json.bak")
                    if (bakFile.exists()) bakFile.delete()
                    dbConfigFile.renameTo(bakFile)
                    AppConfig.reloadSettings()
                    call.respond(HttpStatusCode.OK, mapOf("success" to true, "message" to "Switched to file storage. Application settings reloaded."))
                } else {
                    call.respond(HttpStatusCode.BadRequest, mapOf("success" to false, "message" to "Database configuration not found."))
                }
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, mapOf("success" to false, "message" to "Failed to switch: ${e.message}"))
            }
        }

        post("/postgres/switch-to-db") {
            try {
                val dbConfigFile = File(AppConfig.dataRoot, "db-config.json")
                val bakFile = File(AppConfig.dataRoot, "db-config.json.bak")
                
                if (bakFile.exists()) {
                    if (dbConfigFile.exists()) dbConfigFile.delete()
                    bakFile.renameTo(dbConfigFile)
                    AppConfig.reloadSettings()
                    call.respond(HttpStatusCode.OK, mapOf("success" to true, "message" to "Switched to database storage. Application settings reloaded."))
                } else {
                    call.respond(HttpStatusCode.BadRequest, mapOf("success" to false, "message" to "Database configuration backup not found. Please re-install or point to a DB."))
                }
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, mapOf("success" to false, "message" to "Failed to switch: ${e.message}"))
            }
        }
    }
}
