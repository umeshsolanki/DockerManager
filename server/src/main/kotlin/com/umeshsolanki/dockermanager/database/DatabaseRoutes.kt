package com.umeshsolanki.dockermanager.database

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.docker.DockerService
import com.umeshsolanki.dockermanager.utils.ResourceLoader
import com.umeshsolanki.dockermanager.utils.StringUtils
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
data class SwitchStorageResponse(
    val success: Boolean,
    val message: String
)

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
                val password = StringUtils.generateSecurePassword()
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
                    "port" to "5432",
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
                val password = StringUtils.generateSecurePassword()
                val postgresDir = File(AppConfig.composeProjDir, "postgres")
                postgresDir.mkdirs()

                // Load compose template
                val composeContent = ResourceLoader.loadResourceOrThrow("templates/postgres/docker-compose.yml")
                
                // Load Dockerfile template
                val dockerfileContent = ResourceLoader.loadResourceOrThrow("templates/postgres/Dockerfile")

                // Stop existing container if it exists, to ensure we can wipe volumes/reset properly
                val composeFile = File(postgresDir, "docker-compose.yml")
                if (composeFile.exists()) {
                     DockerService.composeDown(composeFile.absolutePath, removeVolumes = true)
                }

                // Create .env file
                val envFile = File(postgresDir, ".env")
                envFile.writeText("POSTGRES_PASSWORD=$password\nPOSTGRES_USER=admin\nPOSTGRES_DB=mydatabase\nPOSTGRES_PORT=5432\n")

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
                    call.respond(HttpStatusCode.OK, SwitchStorageResponse(success = true, message = "Switched to file storage. Application settings reloaded."))
                } else {
                    call.respond(HttpStatusCode.BadRequest, SwitchStorageResponse(success = false, message = "Database configuration not found."))
                }
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, SwitchStorageResponse(success = false, message = "Failed to switch: ${e.message}"))
            }
        }

        post("/postgres/switch-to-db") {
            try {
                val dbConfigFile = File(AppConfig.dataRoot, "db-config.json")
                val bakFile = File(AppConfig.dataRoot, "db-config.json.bak")
                
                if (bakFile.exists()) {
                    if (dbConfigFile.exists()) {
                         if (!dbConfigFile.delete()) {
                             throw IllegalStateException("Failed to delete existing db-config.json")
                         }
                    }
                    if (!bakFile.renameTo(dbConfigFile)) {
                        throw IllegalStateException("Failed to rename db-config.json.bak to db-config.json")
                    }
                    
                    AppConfig.reloadSettings()
                    
                    if (AppConfig.storageBackend == "database") {
                         call.respond(HttpStatusCode.OK, SwitchStorageResponse(success = true, message = "Switched to database storage. Application settings reloaded."))
                    } else {
                         call.respond(HttpStatusCode.InternalServerError, SwitchStorageResponse(success = false, message = "Restored config but failed to connect/load from DB. Still using file storage. Check logs for connection errors."))
                    }
                } else if (dbConfigFile.exists()) {
                    // Config file exists, just not active (or we are already on DB, but reloading doesn't hurt)
                    AppConfig.reloadSettings()
                    
                    if (AppConfig.storageBackend == "database") {
                         call.respond(HttpStatusCode.OK, SwitchStorageResponse(success = true, message = "Switched to database storage (config already existed)."))
                    } else {
                         call.respond(HttpStatusCode.InternalServerError, SwitchStorageResponse(success = false, message = "Database configuration file exists but failed to connect/load. Check logs for connection errors."))
                    }
                } else {
                    call.respond(HttpStatusCode.BadRequest, SwitchStorageResponse(success = false, message = "Database configuration not found (neither active nor backup). Please re-install or point to a DB."))
                }
            } catch (e: Throwable) {
                e.printStackTrace()
                call.respond(HttpStatusCode.InternalServerError, SwitchStorageResponse(success = false, message = "Failed to switch: ${e.message}\n${e.stackTraceToString()}"))
            }
        }
        
        get("/postgres/logs") {
            try {
                // Find container if running
                val tail = call.request.queryParameters["tail"]?.toIntOrNull() ?: 100
                val logs = DockerService.getContainerLogs("postgres-db", tail)
                call.respond(mapOf("logs" to logs))
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, mapOf("error" to (e.message ?: "Unknown error")))
            }
        }
        
        get("/postgres/tables") {
            try {
                val tables = mutableListOf<String>()
                org.jetbrains.exposed.sql.transactions.transaction {
                    exec("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'") { rs ->
                        while (rs.next()) {
                            tables.add(rs.getString("tablename"))
                        }
                    }
                }
                call.respond(mapOf("tables" to tables))
            } catch (e: Exception) {
                 call.respond(HttpStatusCode.InternalServerError, mapOf("error" to (e.message ?: "Failed to list tables")))
            }
        }

        get("/postgres/query") {
             val table = call.request.queryParameters["table"]
             if (table == null) {
                 call.respond(HttpStatusCode.BadRequest, "Missing table parameter")
                 return@get
             }
             // Simple SQL injection protection for table name
             if (!table.matches(Regex("^[a-zA-Z0-9_]+$"))) {
                 call.respond(HttpStatusCode.BadRequest, "Invalid table name")
                 return@get
             }
             
             try {
                 val rows = mutableListOf<Map<String, Any?>>()
                 org.jetbrains.exposed.sql.transactions.transaction {
                     // Limit 100
                     exec("SELECT * FROM $table LIMIT 100") { rs ->
                         val meta = rs.metaData
                         val colCount = meta.columnCount
                         while (rs.next()) {
                             val row = mutableMapOf<String, Any?>()
                             for (i in 1..colCount) {
                                 row[meta.getColumnName(i)] = rs.getObject(i)?.toString()
                             }
                             rows.add(row)
                         }
                     }
                 }
                 call.respond(mapOf("rows" to rows))
             } catch (e: Exception) {
                 call.respond(HttpStatusCode.InternalServerError, mapOf("error" to (e.message ?: "Failed to query table")))
             }
        }
    }
}
