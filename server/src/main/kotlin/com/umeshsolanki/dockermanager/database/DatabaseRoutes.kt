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
                val isSwarmMode = try {
                    val cmd = "${AppConfig.dockerCommand} info --format '{{.Swarm.LocalNodeState}}'"
                    val result = executeCommand(cmd)
                    val swarmState = result.output.trim()
                    result.exitCode == 0 && swarmState == "active"
                } catch (e: Exception) {
                    false
                }

                val secretName = "postgres_password"
                var passwordStored = false
                var secretError: String? = null

                if (isSwarmMode) {
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
                        passwordStored = false
                        secretError = e.message
                    }
                }

                val postgresDir = File(AppConfig.composeProjDir, "postgres")
                postgresDir.mkdirs()

                // Load compose template
                val composeContent = if (passwordStored) {
                    ResourceLoader.loadResourceOrThrow("templates/postgres/docker-compose-swarm.yml")
                } else {
                    ResourceLoader.loadResourceOrThrow("templates/postgres/docker-compose.yml")
                }
                
                // Load Dockerfile template
                val dockerfileContent = ResourceLoader.loadResourceOrThrow("templates/postgres/Dockerfile")

                // Create .env file if not using Docker secrets
                if (!passwordStored) {
                    val envFile = File(postgresDir, ".env")
                    envFile.writeText("POSTGRES_PASSWORD=$password\nPOSTGRES_USER=admin\nPOSTGRES_DB=mydatabase\nPOSTGRES_PORT=5432\n")
                }

                val composeFile = File(postgresDir, "docker-compose.yml")
                composeFile.writeText(composeContent)
                
                val dockerFile = File(postgresDir, "Dockerfile")
                dockerFile.writeText(dockerfileContent)

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

                call.respond(
                    HttpStatusCode.OK, PostgresInstallResult(
                        success = true,
                        message = "Postgres installed and started successfully.",
                        composeFile = composeFile.absolutePath,
                        passwordSet = true,
                        usingDockerSecret = passwordStored
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
        
        post("/redis/install") {
            // Forward to the existing cache install for now or duplicate the logic
            // To keep it simple, I'll just duplicate the logic here or call the handler
            // Actually, I'll just redirect to the existing endpoint from the frontend for now
            // But let's add it here for consistency if needed.
            call.respond(HttpStatusCode.NotImplemented, "Use /cache/install for now")
        }
    }
}
