package com.umeshsolanki.dockermanager.email

import com.umeshsolanki.dockermanager.*
import com.umeshsolanki.dockermanager.email.*
import com.umeshsolanki.dockermanager.james.JamesSetupService
import com.umeshsolanki.dockermanager.utils.ResourceLoader
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.java.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.*
import org.slf4j.LoggerFactory
import java.io.File
import java.util.concurrent.TimeUnit
import jakarta.mail.*
import jakarta.mail.internet.*
import java.util.Properties
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

interface IEmailService {
    suspend fun listDomains(): List<EmailDomain>
    suspend fun createDomain(domain: String): Boolean
    suspend fun deleteDomain(domain: String): Boolean
    
    suspend fun listUsers(): List<EmailUser>
    suspend fun createUser(userAddress: String, request: CreateEmailUserRequest): Pair<Boolean, String>
    suspend fun deleteUser(userAddress: String): Boolean
    suspend fun updateUserPassword(userAddress: String, request: UpdateEmailUserPasswordRequest): Boolean
    
    suspend fun listMailboxes(userAddress: String): List<EmailMailbox>
    suspend fun createMailbox(userAddress: String, mailboxName: String): Boolean
    suspend fun deleteMailbox(userAddress: String, mailboxName: String): Boolean
    
    // Groups / Aliases
    suspend fun listGroups(): List<EmailGroup>
    suspend fun getGroupMembers(groupAddress: String): List<String>
    suspend fun createGroup(groupAddress: String, memberAddress: String): Boolean // James creates group by adding first member
    suspend fun addToGroup(groupAddress: String, memberAddress: String): Boolean
    suspend fun removeFromGroup(groupAddress: String, memberAddress: String): Boolean
    
    // Quotas
    suspend fun getUserQuota(userAddress: String): EmailUserDetail?
    suspend fun setUserQuota(userAddress: String, type: String, value: Long): Boolean // type: "count" or "size"
    suspend fun deleteUserQuota(userAddress: String): Boolean

    fun refresh()

    // James Container Management
    fun getStatus(): JamesContainerStatus
    fun ensureJamesConfig()
    fun getComposeConfig(): String
    fun updateComposeConfig(content: String): Boolean
    fun startJames(): Boolean
    fun stopJames(): Boolean
    fun restartJames(): Boolean

    suspend fun testEmailConnection(request: EmailTestRequest): EmailTestResult

    // Configuration Files Management
    fun listJamesConfigFiles(): List<String>
    fun getJamesConfigContent(filename: String): String?
    fun updateJamesConfigContent(filename: String, content: String): Boolean
    fun getDefaultJamesConfigContent(filename: String): String?

    // Mailcow Container Management
    fun getMailcowStatus(): MailcowContainerStatus
    fun ensureMailcowConfig()
    fun getMailcowComposeConfig(): String
    fun updateMailcowComposeConfig(content: String): Boolean
    fun startMailcow(): Boolean
    fun stopMailcow(): Boolean
    fun restartMailcow(): Boolean
}

class EmailServiceImpl : IEmailService {
    private val logger = LoggerFactory.getLogger(EmailServiceImpl::class.java)
    private var jamesUrl = AppConfig.jamesWebAdminUrl
    
    private val jamesDir = AppConfig.jamesDir
    private val composeFile = File(jamesDir, "docker-compose.yml")
    
    private val mailcowDir = AppConfig.mailcowDir
    private val mailcowComposeFile = File(mailcowDir, "docker-compose.yml")

    override fun refresh() {
        jamesUrl = AppConfig.jamesWebAdminUrl
        logger.info("Email service refreshed with URL: $jamesUrl")
    }

    private val client = HttpClient(Java) {
        install(ContentNegotiation) {
            json(AppConfig.json)
        }
    }

    /**
     * URL-encodes an email address for use in URL paths.
     * James WebAdmin API may have specific requirements for email address encoding.
     * Some versions expect @ to be encoded as %40, others might expect it unencoded.
     * We'll encode all special characters except @ first, then encode @ separately if needed.
     * However, based on common REST API patterns, we'll encode everything including @.
     */
    private fun encodeEmailAddress(email: String): String {
        // Standard URL encoding - encodes @ as %40
        // This is the most common approach for REST APIs
        return URLEncoder.encode(email, StandardCharsets.UTF_8.toString())
    }
    
    /**
     * Alternative encoding that preserves @ symbol (for APIs that don't accept encoded @)
     * This might be needed if standard encoding doesn't work with James
     */
    private fun encodeEmailAddressPreserveAt(email: String): String {
        // Encode everything except @, then manually encode @ if needed
        val parts = email.split("@")
        if (parts.size == 2) {
            val localPart = URLEncoder.encode(parts[0], StandardCharsets.UTF_8.toString())
            val domain = URLEncoder.encode(parts[1], StandardCharsets.UTF_8.toString())
            return "$localPart@$domain"
        }
        return URLEncoder.encode(email, StandardCharsets.UTF_8.toString())
    }

    private fun executeCommand(command: String): String {
        return try {
            val parts = command.split("\\s+".toRegex())
            val proc = ProcessBuilder(parts)
                .directory(jamesDir)
                .redirectOutput(ProcessBuilder.Redirect.PIPE)
                .redirectError(ProcessBuilder.Redirect.PIPE)
                .start()

            proc.waitFor(60, TimeUnit.SECONDS)
            proc.inputStream.bufferedReader().readText()
        } catch (e: Exception) {
            logger.error("Command failed: $command", e)
            ""
        }
    }

    private fun generateSelfSignedCertificates(confDir: File, fullchain: File, privkey: File) {
        try {
            // Generate a self-signed certificate using openssl
            val keyFile = File(confDir, "temp_key.pem")
            val certFile = File(confDir, "temp_cert.pem")
            
            // Generate private key
            val genKeyCmd = listOf(
                "openssl", "genrsa", "-out", keyFile.absolutePath, "2048"
            )
            val genKeyProc = ProcessBuilder(genKeyCmd)
                .redirectOutput(ProcessBuilder.Redirect.PIPE)
                .redirectError(ProcessBuilder.Redirect.PIPE)
                .start()
            
            val keySuccess = genKeyProc.waitFor(30, TimeUnit.SECONDS)
            if (!keySuccess || genKeyProc.exitValue() != 0) {
                val error = genKeyProc.errorStream.bufferedReader().readText()
                logger.warn("Failed to generate private key: $error")
                return
            }
            
            // Generate self-signed certificate
            val genCertCmd = listOf(
                "openssl", "req", "-new", "-x509", "-key", keyFile.absolutePath,
                "-out", certFile.absolutePath, "-days", "365",
                "-subj", "/CN=james.local/O=James/C=US"
            )
            val genCertProc = ProcessBuilder(genCertCmd)
                .redirectOutput(ProcessBuilder.Redirect.PIPE)
                .redirectError(ProcessBuilder.Redirect.PIPE)
                .start()
            
            val certSuccess = genCertProc.waitFor(30, TimeUnit.SECONDS)
            if (!certSuccess || genCertProc.exitValue() != 0) {
                val error = genCertProc.errorStream.bufferedReader().readText()
                logger.warn("Failed to generate certificate: $error")
                keyFile.delete()
                return
            }
            
            // Copy to final locations
            keyFile.copyTo(privkey, overwrite = true)
            certFile.copyTo(fullchain, overwrite = true)
            
            // Clean up temp files
            keyFile.delete()
            certFile.delete()
            
            logger.info("Generated self-signed SSL certificates for James")
        } catch (e: Exception) {
            logger.error("Failed to generate self-signed certificates", e)
            // If openssl fails, create minimal valid PEM files that won't crash James
            // These are empty but valid PEM format
            if (!privkey.exists()) {
                privkey.writeText("-----BEGIN PRIVATE KEY-----\n-----END PRIVATE KEY-----\n")
            }
            if (!fullchain.exists()) {
                fullchain.writeText("-----BEGIN CERTIFICATE-----\n-----END CERTIFICATE-----\n")
            }
        }
    }

    // --- Container Management ---

    override fun ensureJamesConfig() {
        if (!jamesDir.exists()) jamesDir.mkdirs()
        
        // Ensure conf and var directory exists
        val confDir = File(jamesDir, "conf")
        if (!confDir.exists()) confDir.mkdirs()
        File(jamesDir, "var").mkdirs()
        
        // Ensure postgres-data directory exists for Postgres volume
        File(jamesDir, "postgres-data").mkdirs()
        
        // Ensure libs directory exists for JDBC drivers
        val libsDir = File(jamesDir, "libs")
        if (!libsDir.exists()) libsDir.mkdirs()
        
        // Download Postgres JDBC driver if not present
        val postgresDriver = File(libsDir, "postgresql.jar")
        if (!postgresDriver.exists()) {
            try {
                logger.info("Downloading PostgreSQL JDBC driver...")
                val driverUrl = java.net.URL("https://jdbc.postgresql.org/download/postgresql-42.7.1.jar")
                driverUrl.openStream().use { input ->
                    postgresDriver.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }
                logger.info("PostgreSQL JDBC driver downloaded successfully")
            } catch (e: Exception) {
                logger.warn("Failed to download PostgreSQL JDBC driver automatically. Please download it manually to ${libsDir.absolutePath}/postgresql.jar", e)
            }
        }

        // Initialize all default James configuration files (including droplists.xml)
        // Force overwrite to ensure latest templates are used
        JamesSetupService.initialize(forceOverwrite = true)

        // Create default webadmin.properties properly
        val webAdminProp = File(confDir, "webadmin.properties")
        if (!webAdminProp.exists()) {
            webAdminProp.writeText("""
enabled=true
port=8000
host=0.0.0.0
secure=false
url_prefix=
cors.enable=true
cors.origin=*
            """.trimIndent())
        }

        // --- SSL Certificate Discovery ---
        val fullchain = File(confDir, "fullchain.pem")
        val privkey = File(confDir, "privkey.pem")

        // Check if certificates exist and are valid (not dummy files)
        val certsNeedRegeneration = !fullchain.exists() || !privkey.exists() || 
            fullchain.readText().contains("Dummy") || privkey.readText().contains("Dummy") ||
            fullchain.length() < 100 || privkey.length() < 100 // Valid certs are much larger

        if (certsNeedRegeneration) {
            // Try to find a valid certificate from Let's Encrypt
            val leDir = AppConfig.letsEncryptDir
            val bestCertDir = leDir.listFiles()?.filter { it.isDirectory }?.firstOrNull { 
                File(it, "fullchain.pem").exists() && File(it, "privkey.pem").exists()
            }

            if (bestCertDir != null) {
                logger.info("Found Let's Encrypt certificate in ${bestCertDir.absolutePath}. Copying to James conf.")
                try {
                    File(bestCertDir, "fullchain.pem").copyTo(fullchain, overwrite = true)
                    File(bestCertDir, "privkey.pem").copyTo(privkey, overwrite = true)
                } catch (e: Exception) {
                    logger.error("Failed to copy SSL certs to James conf", e)
                    generateSelfSignedCertificates(confDir, fullchain, privkey)
                }
            } else {
                // Generate self-signed certificates if no Let's Encrypt certs found
                logger.info("No Let's Encrypt certificates found. Generating self-signed certificates for James.")
                generateSelfSignedCertificates(confDir, fullchain, privkey)
            }
        }

        if (!composeFile.exists()) {
            logger.info("Creating default James docker-compose.yml in ${jamesDir.absolutePath}")
            composeFile.writeText(getDefaultComposeConfig())
        }
    }

    override fun getComposeConfig(): String {
        ensureJamesConfig()
        return composeFile.readText()
    }

    override fun updateComposeConfig(content: String): Boolean {
        return try {
            ensureJamesConfig()
            composeFile.writeText(content)
            true
        } catch (e: Exception) {
            logger.error("Failed to update James compose config", e)
            false
        }
    }

    override fun startJames(): Boolean {
        return try {
            ensureJamesConfig()
            // Pull latest images and recreate containers to ensure we're using the updated configuration
            val cmd = "${AppConfig.dockerComposeCommand} -f ${composeFile.absolutePath} up -d --pull always --force-recreate"
            val output = executeCommand(cmd)
            
            if (output.isBlank()) {
                logger.error("Failed to start James container - docker compose command returned no output")
                return false
            }
            
            // Check if container started successfully
            Thread.sleep(3000) // Give container a moment to start
            var containerRunning = false
            
            try {
                val initialState = executeCommand("${AppConfig.dockerCommand} ps --filter name=james --format \"{{.State}}\"")
                containerRunning = initialState.trim() == "running"
                if (!containerRunning) {
                    logger.info("James container may not be running yet. State: ${initialState.trim()}")
                }
            } catch (e: Exception) {
                logger.warn("Failed to check container state: ${e.message}")
            }
            
            // Wait for James to be ready (poll WebAdmin API)
            logger.info("Waiting for James WebAdmin API to be ready...")
            val maxAttempts = 90 // 90 attempts * 2 seconds = 3 minutes max (James can take 40+ seconds)
            var attempts = 0
            var apiReady = false
            
            while (attempts < maxAttempts && !apiReady) {
                try {
                    // Check if container is running
                    try {
                        val stateOutput = executeCommand("${AppConfig.dockerCommand} ps --filter name=james --format \"{{.State}}\"")
                        containerRunning = stateOutput.trim() == "running"
                    } catch (e: Exception) {
                        logger.debug("Container state check failed: ${e.message}")
                    }
                    
                    if (!containerRunning) {
                        logger.debug("Container not running yet, waiting... (attempt ${attempts + 1}/${maxAttempts})")
                        Thread.sleep(2000)
                        attempts++
                        continue
                    }
                    
                    // Check if WebAdmin API is responding
                    try {
                        val url = URL("$jamesUrl/domains")
                        val connection = url.openConnection() as HttpURLConnection
                        connection.requestMethod = "GET"
                        connection.connectTimeout = 3000
                        connection.readTimeout = 3000
                        connection.instanceFollowRedirects = false
                        val responseCode = connection.responseCode
                        if (responseCode in 200..299) {
                            logger.info("James WebAdmin API is ready after ${attempts * 2} seconds")
                            apiReady = true
                            return true
                        } else {
                            logger.debug("WebAdmin API returned status $responseCode, waiting... (attempt ${attempts + 1}/${maxAttempts})")
                        }
                    } catch (e: java.net.ConnectException) {
                        // Connection refused - API not ready yet
                        logger.debug("WebAdmin API not ready yet (connection refused), waiting... (attempt ${attempts + 1}/${maxAttempts})")
                    } catch (e: java.net.SocketTimeoutException) {
                        // Timeout - API not ready yet
                        logger.debug("WebAdmin API timeout, waiting... (attempt ${attempts + 1}/${maxAttempts})")
                    } catch (e: Exception) {
                        // Other error - API not ready yet
                        logger.debug("WebAdmin API check failed: ${e.message}, waiting... (attempt ${attempts + 1}/${maxAttempts})")
                    }
                } catch (e: Exception) {
                    logger.debug("Startup check failed: ${e.message}, waiting... (attempt ${attempts + 1}/${maxAttempts})")
                }
                
                Thread.sleep(2000) // Wait 2 seconds between attempts
                attempts++
            }
            
            // If container is running but API not ready, still return success
            // James might need more time, but container is up
            if (containerRunning) {
                if (apiReady) {
                    logger.info("James started successfully")
                } else {
                    logger.warn("James container is running but WebAdmin API not ready after ${maxAttempts * 2} seconds. James may still be initializing.")
                }
                true // Return true since container is running
            } else {
                logger.error("James container failed to start after ${maxAttempts * 2} seconds")
                false
            }
        } catch (e: Exception) {
            logger.error("Unexpected error starting James", e)
            // Check if container is actually running despite the error
            try {
                val stateOutput = executeCommand("${AppConfig.dockerCommand} ps --filter name=james --format \"{{.State}}\"")
                val isRunning = stateOutput.trim() == "running"
                if (isRunning) {
                    logger.info("James container is running despite startup error")
                    return true
                }
            } catch (ex: Exception) {
                logger.error("Failed to check container state after error", ex)
            }
            false
        }
    }

    override fun stopJames(): Boolean {
        if (!composeFile.exists()) return true
        val cmd = "${AppConfig.dockerComposeCommand} -f ${composeFile.absolutePath} stop" 
        executeCommand(cmd)
        return true
    }

    override fun restartJames(): Boolean {
        ensureJamesConfig()
        // Pull latest images and recreate containers to ensure we're using the updated configuration
        val pullCmd = "${AppConfig.dockerComposeCommand} -f ${composeFile.absolutePath} pull"
        executeCommand(pullCmd)
        val cmd = "${AppConfig.dockerComposeCommand} -f ${composeFile.absolutePath} up -d --force-recreate"
        val output = executeCommand(cmd)
        
        if (output.isBlank()) {
            logger.error("Failed to restart James container")
            return false
        }
        
        // Wait for James to be ready (poll WebAdmin API)
        logger.info("Waiting for James to be ready after restart...")
        val maxAttempts = 60 // 60 attempts * 2 seconds = 2 minutes max
        var attempts = 0
        
        while (attempts < maxAttempts) {
            try {
                // Check if container is running
                val psOutput = executeCommand("${AppConfig.dockerCommand} ps --filter name=james --format \"{{.State}}\"")
                if (psOutput.trim() != "running") {
                    Thread.sleep(2000)
                    attempts++
                    continue
                }
                
                // Check if WebAdmin API is responding
                try {
                    val url = URL("$jamesUrl/domains")
                    val connection = url.openConnection() as HttpURLConnection
                    connection.requestMethod = "GET"
                    connection.connectTimeout = 2000
                    connection.readTimeout = 2000
                    val responseCode = connection.responseCode
                    if (responseCode in 200..299) {
                        logger.info("James is ready after restart (${attempts * 2} seconds)")
                        return true
                    }
                } catch (e: Exception) {
                    // API not ready yet, continue waiting
                }
            } catch (e: Exception) {
                // Container check failed, continue waiting
            }
            
            Thread.sleep(2000) // Wait 2 seconds between attempts
            attempts++
        }
        
        logger.warn("James container restarted but WebAdmin API not ready after ${maxAttempts * 2} seconds")
        // Return true anyway since container is running, it might just need more time
        return true
    }

    override fun getStatus(): JamesContainerStatus {
        if (!composeFile.exists()) {
            return JamesContainerStatus(exists = false, running = false, containerId = null, status = "Not Configured", uptime = null)
        }

        // Check if container running
        val psOutput = executeCommand("${AppConfig.dockerCommand} ps --filter name=james --format \"{{.ID}}|{{.Status}}|{{.State}}\"")
        if (psOutput.isBlank()) {
             // Check if it exists but stopped
             val psAll = executeCommand("${AppConfig.dockerCommand} ps -a --filter name=james --format \"{{.ID}}|{{.Status}}|{{.State}}\"")
             if (psAll.isNotBlank()) {
                 val parts = psAll.trim().split("|")
                 return JamesContainerStatus(exists = true, running = false, containerId = parts[0], status = parts[1], uptime = null)
             }
             return JamesContainerStatus(exists = true, running = false, containerId = null, status = "Stopped", uptime = null)
        }
        
        val parts = psOutput.trim().split("|")
        return JamesContainerStatus(
            exists = true,
            running = true,
            containerId = parts.getOrNull(0),
            status = parts.getOrNull(1) ?: "Running",
            uptime = parts.getOrNull(1) 
        )
    }

    private fun getDefaultComposeConfig(): String {
        val jamesPath = jamesDir.absolutePath
        val template = ResourceLoader.loadResourceOrThrow("templates/james/docker-compose.yml")
        return ResourceLoader.replacePlaceholders(template, mapOf(
            "jamesPath" to jamesPath
        ))
    }

    // --- API Methods ---

    override suspend fun listDomains(): List<EmailDomain> {
        return try {
            val domains: List<String> = client.get("$jamesUrl/domains").body()
            domains.map { EmailDomain(name = it) }
        } catch (e: Exception) {
            logger.error("Failed to list domains", e)
            emptyList()
        }
    }

    override suspend fun createDomain(domain: String): Boolean {
        return try {
            val response = client.put("$jamesUrl/domains/$domain")
            response.status.value in 200..299
        } catch (e: Exception) {
            logger.error("Failed to create domain: $domain", e)
            false
        }
    }

    override suspend fun deleteDomain(domain: String): Boolean {
        return try {
            val response = client.delete("$jamesUrl/domains/$domain")
            response.status.value in 200..299
        } catch (e: Exception) {
            logger.error("Failed to delete domain: $domain", e)
            false
        }
    }

    override suspend fun listUsers(): List<EmailUser> {
        return try {
            val users: List<JsonElement> = client.get("$jamesUrl/users").body()
            users.map { 
                // James API returns "username" field, not "user"
                val userAddress = it.jsonObject["username"]?.jsonPrimitive?.content 
                    ?: it.jsonObject["user"]?.jsonPrimitive?.content 
                    ?: ""
                EmailUser(userAddress = userAddress)
            }
        } catch (e: Exception) {
            logger.error("Failed to list users", e)
            emptyList()
        }
    }

    override suspend fun createUser(userAddress: String, request: CreateEmailUserRequest): Pair<Boolean, String> {
        return try {
            // Validate email address format
            if (userAddress.isBlank()) {
                return Pair(false, "Email address cannot be empty")
            }
            
            // Extract domain from email address
            val domain = if (userAddress.contains("@")) {
                val parts = userAddress.split("@")
                if (parts.size != 2) {
                    return Pair(false, "Invalid email address format. Expected: user@domain.com")
                }
                val localPart = parts[0]
                val domainPart = parts[1]
                
                // Validate local part (username)
                if (localPart.isBlank()) {
                    return Pair(false, "Email address username (local part) cannot be empty")
                }
                
                // Validate domain part
                if (domainPart.isBlank() || !domainPart.contains(".")) {
                    return Pair(false, "Invalid domain format. Domain must contain at least one dot (e.g., example.com)")
                }
                
                domainPart
            } else {
                null
            }
            
            // If domain is specified, verify it exists
            if (domain != null) {
                val domains = try {
                    client.get("$jamesUrl/domains").body<List<String>>()
                } catch (e: Exception) {
                    logger.warn("Failed to check domains: ${e.message}")
                    emptyList()
                }
                
                if (!domains.contains(domain)) {
                    val errorMsg = "Domain '$domain' does not exist. Please create the domain first."
                    logger.error(errorMsg)
                    return Pair(false, errorMsg)
                }
            }
            
            // James API might expect the email address URL-encoded in the path
            // Try with standard URL encoding first (encodes @ as %40)
            var encodedUserAddress = encodeEmailAddress(userAddress)
            var response = client.put("$jamesUrl/users/$encodedUserAddress") {
                contentType(io.ktor.http.ContentType.Application.Json)
                setBody(mapOf("password" to request.password))
            }
            
            // If that fails, check for virtual hosting error first
            if (response.status.value !in 200..299) {
                // Read response body once and extract both message and details
                val errorJson = try {
                    response.body<JsonObject>()
                } catch (e: Exception) {
                    null
                }
                
                val errorBody = if (errorJson != null) {
                    errorJson["message"]?.jsonPrimitive?.content ?: errorJson.toString()
                } else {
                    try {
                        response.body<String>()
                    } catch (e2: Exception) {
                        "Unknown error (Status: ${response.status.value})"
                    }
                }
                
                // Check if error is about virtual hosting being disabled
                val errorDetails = errorJson?.get("details")?.jsonPrimitive?.content ?: ""
                val errorMessage = errorJson?.get("message")?.jsonPrimitive?.content ?: ""
                
                // Check both details and message fields for virtual hosting error
                val isVirtualHostingError = (errorDetails.contains("virtualhosting", ignoreCase = true) || 
                                             errorMessage.contains("virtualhosting", ignoreCase = true) ||
                                             errorBody.contains("virtualhosting", ignoreCase = true)) && 
                                            userAddress.contains("@")
                
                if (isVirtualHostingError) {
                    // Virtual hosting appears to be disabled despite configuration
                    // Fall back to creating user with just the local part (username)
                    val localPart = userAddress.split("@")[0]
                    logger.warn("Virtual hosting appears disabled. Creating user with local part only: $localPart")
                    
                    val fallbackResponse = client.put("$jamesUrl/users/$localPart") {
                        contentType(io.ktor.http.ContentType.Application.Json)
                        setBody(mapOf("password" to request.password))
                    }
                    
                    if (fallbackResponse.status.value in 200..299) {
                        logger.info("Successfully created user with local part: $localPart (full address: $userAddress)")
                        return Pair(true, "User created successfully. Note: Virtual hosting is disabled, user created as '$localPart' instead of '$userAddress'. Emails to '$userAddress' may not work correctly.")
                    } else {
                        val fallbackErrorJson = try {
                            fallbackResponse.body<JsonObject>()
                        } catch (e: Exception) {
                            null
                        }
                        val fallbackError = fallbackErrorJson?.get("message")?.jsonPrimitive?.content ?: "Unknown error"
                        val errorMsg = "Failed to create user: Virtual hosting is disabled and fallback creation also failed: $fallbackError"
                        logger.error("Failed to create user: $userAddress. Virtual hosting disabled and fallback failed.")
                        return Pair(false, errorMsg)
                    }
                }
                
                // Not a virtual hosting error, try alternative encoding approaches
                logger.info("First attempt failed with encoding. Error: $errorBody. Trying alternative encoding for $userAddress")
                
                // Try preserving @ symbol (encode local part and domain separately)
                if (userAddress.contains("@")) {
                    encodedUserAddress = encodeEmailAddressPreserveAt(userAddress)
                    response = client.put("$jamesUrl/users/$encodedUserAddress") {
                        contentType(io.ktor.http.ContentType.Application.Json)
                        setBody(mapOf("password" to request.password))
                    }
                    
                    // If that still fails, try without any encoding (some APIs handle @ in paths)
                    if (response.status.value !in 200..299) {
                        logger.info("Alternative encoding failed. Trying without encoding for $userAddress")
                        response = client.put("$jamesUrl/users/$userAddress") {
                            contentType(io.ktor.http.ContentType.Application.Json)
                            setBody(mapOf("password" to request.password))
                        }
                    }
                }
                
                if (response.status.value !in 200..299) {
                    val finalErrorJson = try {
                        response.body<JsonObject>()
                    } catch (e: Exception) {
                        null
                    }
                    
                    val finalErrorBody = if (finalErrorJson != null) {
                        finalErrorJson["message"]?.jsonPrimitive?.content ?: finalErrorJson.toString()
                    } else {
                        try {
                            response.body<String>()
                        } catch (e2: Exception) {
                            "Unknown error (Status: ${response.status.value})"
                        }
                    }
                    
                    val errorMsg = "Failed to create user: $finalErrorBody"
                    logger.error("Failed to create user: $userAddress after trying all encoding methods. Status: ${response.status.value}, Response: $finalErrorBody")
                    return Pair(false, errorMsg)
                }
            }
            
            Pair(true, "User created successfully")
        } catch (e: Exception) {
            val errorMsg = "Failed to create user: ${e.message ?: "Unknown error"}"
            logger.error("Failed to create user: $userAddress", e)
            Pair(false, errorMsg)
        }
    }

    override suspend fun deleteUser(userAddress: String): Boolean {
        return try {
            val encodedUserAddress = encodeEmailAddress(userAddress)
            val response = client.delete("$jamesUrl/users/$encodedUserAddress")
            response.status.value in 200..299
        } catch (e: Exception) {
            logger.error("Failed to delete user: $userAddress", e)
            false
        }
    }

    override suspend fun updateUserPassword(userAddress: String, request: UpdateEmailUserPasswordRequest): Boolean {
        return try {
            val encodedUserAddress = encodeEmailAddress(userAddress)
            val response = client.put("$jamesUrl/users/$encodedUserAddress") {
                contentType(io.ktor.http.ContentType.Application.Json)
                setBody(mapOf("password" to request.newPassword))
            }
            response.status.value in 200..299
        } catch (e: Exception) {
            logger.error("Failed to update password for user: $userAddress", e)
            false
        }
    }

    override suspend fun listMailboxes(userAddress: String): List<EmailMailbox> {
        return try {
            val encodedUserAddress = encodeEmailAddress(userAddress)
            val mailboxes: List<JsonElement> = client.get("$jamesUrl/users/$encodedUserAddress/mailboxes").body()
            mailboxes.map { 
                val name = it.jsonObject["mailboxName"]?.jsonPrimitive?.content ?: ""
                EmailMailbox(name)
            }
        } catch (e: Exception) {
            logger.error("Failed to list mailboxes for user: $userAddress", e)
            emptyList()
        }
    }

    override suspend fun createMailbox(userAddress: String, mailboxName: String): Boolean {
        return try {
            val encodedUserAddress = encodeEmailAddress(userAddress)
            val encodedMailboxName = URLEncoder.encode(mailboxName, StandardCharsets.UTF_8.toString())
            val response = client.put("$jamesUrl/users/$encodedUserAddress/mailboxes/$encodedMailboxName")
            response.status.value in 200..299
        } catch (e: Exception) {
            logger.error("Failed to create mailbox: $mailboxName for user: $userAddress", e)
            false
        }
    }

    override suspend fun deleteMailbox(userAddress: String, mailboxName: String): Boolean {
        return try {
            val encodedUserAddress = encodeEmailAddress(userAddress)
            val encodedMailboxName = URLEncoder.encode(mailboxName, StandardCharsets.UTF_8.toString())
            val response = client.delete("$jamesUrl/users/$encodedUserAddress/mailboxes/$encodedMailboxName")
            response.status.value in 200..299
        } catch (e: Exception) {
            logger.error("Failed to delete mailbox: $mailboxName for user: $userAddress", e)
            false
        }
    }

    // --- Groups / Aliases ---

    override suspend fun listGroups(): List<EmailGroup> {
        return try {
            // 1. Get all group addresses
            val groupAddresses: List<String> = client.get("$jamesUrl/groups").body()
            
            // 2. Fetch members for each (parallel map would be better but simple map for now)
            groupAddresses.map { addr ->
                val encodedAddr = encodeEmailAddress(addr)
                val members: List<JsonElement> = client.get("$jamesUrl/groups/$encodedAddr").body()
                val memberStrings = members.map { it.jsonObject["member"]?.jsonPrimitive?.content ?: "" }
                EmailGroup(addr, memberStrings)
            }
        } catch (e: Exception) {
            logger.error("Failed to list groups", e)
            emptyList()
        }
    }

    override suspend fun getGroupMembers(groupAddress: String): List<String> {
        return try {
            val encodedGroupAddress = encodeEmailAddress(groupAddress)
            val members: List<JsonElement> = client.get("$jamesUrl/groups/$encodedGroupAddress").body()
            members.map { it.jsonObject["member"]?.jsonPrimitive?.content ?: "" }
        } catch (e: Exception) {
            logger.error("Failed to get members for group: $groupAddress", e)
            emptyList()
        }
    }

    override suspend fun createGroup(groupAddress: String, memberAddress: String): Boolean {
        return addToGroup(groupAddress, memberAddress)
    }

    override suspend fun addToGroup(groupAddress: String, memberAddress: String): Boolean {
        return try {
            val encodedGroupAddress = encodeEmailAddress(groupAddress)
            val encodedMemberAddress = encodeEmailAddress(memberAddress)
            val response = client.put("$jamesUrl/groups/$encodedGroupAddress/$encodedMemberAddress")
            response.status.value in 200..299
        } catch (e: Exception) {
            logger.error("Failed to add $memberAddress to $groupAddress", e)
            false
        }
    }

    override suspend fun removeFromGroup(groupAddress: String, memberAddress: String): Boolean {
        return try {
            val encodedGroupAddress = encodeEmailAddress(groupAddress)
            val encodedMemberAddress = encodeEmailAddress(memberAddress)
            val response = client.delete("$jamesUrl/groups/$encodedGroupAddress/$encodedMemberAddress")
            response.status.value in 200..299
        } catch (e: Exception) {
            logger.error("Failed to remove $memberAddress from $groupAddress", e)
            false
        }
    }

    // --- Quotas ---

    override suspend fun getUserQuota(userAddress: String): EmailUserDetail? {
        return try {
            val encodedUserAddress = encodeEmailAddress(userAddress)
            // 1. Get Usage
            val usageJson: JsonObject = client.get("$jamesUrl/quota/users/$encodedUserAddress/usage").body()
            // 2. Get Limits (Definition)
            val limitsJson: JsonObject = client.get("$jamesUrl/quota/users/$encodedUserAddress").body()

            val usedCount = usageJson["count"]?.jsonPrimitive?.longOrNull ?: 0L
            val usedSize = usageJson["size"]?.jsonPrimitive?.longOrNull ?: 0L

            // computed or user or global
            val computed = limitsJson["computed"]?.jsonObject
            val limitCount = computed?.get("count")?.jsonPrimitive?.longOrNull
            val limitSize = computed?.get("size")?.jsonPrimitive?.longOrNull

            EmailUserDetail(
                userAddress = userAddress,
                quotaCount = EmailQuota("count", usedCount, limitCount),
                quotaSize = EmailQuota("size", usedSize, limitSize)
            )
        } catch (e: Exception) {
            logger.error("Failed to get quota for $userAddress", e)
            null
        }
    }

    override suspend fun setUserQuota(userAddress: String, type: String, value: Long): Boolean {
        return try {
            val encodedUserAddress = encodeEmailAddress(userAddress)
            val endpoint = if (type == "count") "count" else "size"
            val response = client.put("$jamesUrl/quota/users/$encodedUserAddress/$endpoint") {
                 setBody(value.toString()) // Body is just the number
            }
            response.status.value in 200..299
        } catch (e: Exception) {
            logger.error("Failed to set $type quota for $userAddress", e)
            false
        }
    }

    override suspend fun deleteUserQuota(userAddress: String): Boolean {
        return try {
            val encodedUserAddress = encodeEmailAddress(userAddress)
            val res1 = client.delete("$jamesUrl/quota/users/$encodedUserAddress/count")
            val res2 = client.delete("$jamesUrl/quota/users/$encodedUserAddress/size")
            res1.status.value in 200..299 && res2.status.value in 200..299
        } catch (e: Exception) {
            logger.error("Failed to delete quota for $userAddress", e)
            false
        }
    }
    override suspend fun testEmailConnection(request: EmailTestRequest): EmailTestResult {
        val logs = mutableListOf<String>()
        return try {
            // Determine if using SSL/TLS (port 465) or STARTTLS (port 587)
            val isSslPort = request.port == 465
            val useSsl = request.useTls || isSslPort
            
            val props = Properties().apply {
                put("mail.smtp.auth", "true")
                put("mail.smtp.host", request.host)
                put("mail.smtp.port", request.port.toString())
                put("mail.smtp.timeout", "10000")
                put("mail.smtp.connectiontimeout", "10000")
                
                if (useSsl) {
                    if (isSslPort) {
                        // Port 465 uses SSL/TLS directly
                        put("mail.smtp.ssl.enable", "true")
                        put("mail.smtp.socketFactory.port", request.port.toString())
                        put("mail.smtp.socketFactory.class", "javax.net.ssl.SSLSocketFactory")
                        put("mail.smtp.socketFactory.fallback", "false")
                    } else {
                        // Port 587 uses STARTTLS
                        put("mail.smtp.starttls.enable", "true")
                        put("mail.smtp.starttls.required", "true")
                    }
                    // Trust the host for SSL
                    put("mail.smtp.ssl.trust", request.host)
                } else {
                    put("mail.smtp.starttls.enable", "false")
                }
            }

            val session = Session.getInstance(props, object : Authenticator() {
                override fun getPasswordAuthentication(): PasswordAuthentication {
                    return PasswordAuthentication(request.userAddress, request.password)
                }
            })

            val protocol = if (isSslPort) "smtps" else "smtp"
            logs.add("Checking SMTP connection to ${request.host}:${request.port} (${if (useSsl) if (isSslPort) "SSL/TLS" else "STARTTLS" else "plain"}) for ${request.userAddress}...")
            
            val transport = session.getTransport(protocol)
            transport.connect(request.host, request.port, request.userAddress, request.password)
            
            logs.add("Successfully connected and authenticated via SMTP.")

            // Create and send a self-test email
            val message = MimeMessage(session).apply {
                setFrom(InternetAddress(request.userAddress))
                setRecipients(Message.RecipientType.TO, InternetAddress.parse(request.userAddress))
                setSubject("UCpanel Email Test")
                setText("This is a test email sent from UCpanel to verify your email server configuration.")
            }

            logs.add("Sending test email to ${request.userAddress}...")
            transport.sendMessage(message, message.allRecipients)
            transport.close()
            
            logs.add("Test email sent successfully.")
            EmailTestResult(true, "Email test passed successfully.", logs)
        } catch (e: Exception) {
            logger.error("Email test failed", e)
            logs.add("Error: ${e.message}")
            logs.add("Exception type: ${e.javaClass.simpleName}")
            if (e.cause != null) {
                logs.add("Caused by: ${e.cause?.message}")
            }
            EmailTestResult(false, "Email test failed: ${e.message}", logs)
        }
    }

    override fun listJamesConfigFiles(): List<String> {
        val configDir = AppConfig.jamesConfigDir
        return configDir.listFiles()?.filter { it.isFile }?.map { it.name } ?: emptyList()
    }

    override fun getJamesConfigContent(filename: String): String? {
        val file = File(AppConfig.jamesConfigDir, filename)
        return if (file.exists()) file.readText() else null
    }

    override fun updateJamesConfigContent(filename: String, content: String): Boolean {
        return try {
            val file = File(AppConfig.jamesConfigDir, filename)
            file.writeText(content)
            true
        } catch (e: Exception) {
            logger.error("Failed to update James config file: $filename", e)
            false
        }
    }

    override fun getDefaultJamesConfigContent(filename: String): String? {
        return JamesSetupService.getDefaultContent(filename)
    }

    // --- Mailcow Container Management ---

    override fun ensureMailcowConfig() {
        if (!mailcowDir.exists()) mailcowDir.mkdirs()
        
        // Ensure directories exist
        AppConfig.mailcowConfigDir.mkdirs()
        AppConfig.mailcowDataDir.mkdirs()
        File(mailcowDir, "postgres-data").mkdirs()
        File(mailcowDir, "redis-data").mkdirs()
        File(mailcowDir, "mail-data").mkdirs()
        File(mailcowDir, "mail-state").mkdirs()
        File(mailcowDir, "webmail").mkdirs()
        File(mailcowDir, "webmail-config").mkdirs()
        
        // Create docker-compose.yml if it doesn't exist
        if (!mailcowComposeFile.exists()) {
            mailcowComposeFile.writeText(getDefaultMailcowComposeConfig())
        }
    }

    override fun getMailcowComposeConfig(): String {
        ensureMailcowConfig()
        return mailcowComposeFile.readText()
    }

    override fun updateMailcowComposeConfig(content: String): Boolean {
        return try {
            ensureMailcowConfig()
            mailcowComposeFile.writeText(content)
            true
        } catch (e: Exception) {
            logger.error("Failed to update Mailcow compose config", e)
            false
        }
    }

    override fun startMailcow(): Boolean {
        return try {
            ensureMailcowConfig()
            val cmd = "${AppConfig.dockerComposeCommand} -f ${mailcowComposeFile.absolutePath} up -d --pull always --force-recreate"
            val output = executeCommand(cmd)
            
            if (output.isBlank()) {
                logger.error("Failed to start Mailcow container - docker compose command returned no output")
                return false
            }
            
            Thread.sleep(5000) // Give containers a moment to start
            true
        } catch (e: Exception) {
            logger.error("Failed to start Mailcow", e)
            false
        }
    }

    override fun stopMailcow(): Boolean {
        if (!mailcowComposeFile.exists()) return true
        val cmd = "${AppConfig.dockerComposeCommand} -f ${mailcowComposeFile.absolutePath} stop"
        executeCommand(cmd)
        return true
    }

    override fun restartMailcow(): Boolean {
        ensureMailcowConfig()
        val pullCmd = "${AppConfig.dockerComposeCommand} -f ${mailcowComposeFile.absolutePath} pull"
        executeCommand(pullCmd)
        val cmd = "${AppConfig.dockerComposeCommand} -f ${mailcowComposeFile.absolutePath} up -d --force-recreate"
        val output = executeCommand(cmd)
        return output.isNotBlank()
    }

    override fun getMailcowStatus(): MailcowContainerStatus {
        if (!mailcowComposeFile.exists()) {
            return MailcowContainerStatus(exists = false, running = false, containerId = null, status = "Not Configured", uptime = null, webmailUrl = null)
        }

        // Check if main mailserver container is running
        val psOutput = executeCommand("${AppConfig.dockerCommand} ps --filter name=mailcow-mailserver --format \"{{.ID}}|{{.Status}}|{{.State}}\"")
        if (psOutput.isBlank()) {
            val psAll = executeCommand("${AppConfig.dockerCommand} ps -a --filter name=mailcow-mailserver --format \"{{.ID}}|{{.Status}}|{{.State}}\"")
            if (psAll.isNotBlank()) {
                val parts = psAll.trim().split("|")
                return MailcowContainerStatus(exists = true, running = false, containerId = parts[0], status = parts[1], uptime = null, webmailUrl = "http://localhost:8080")
            }
            return MailcowContainerStatus(exists = true, running = false, containerId = null, status = "Stopped", uptime = null, webmailUrl = "http://localhost:8080")
        }
        
        val parts = psOutput.trim().split("|")
        return MailcowContainerStatus(
            exists = true,
            running = true,
            containerId = parts.getOrNull(0),
            status = parts.getOrNull(1) ?: "Running",
            uptime = parts.getOrNull(1),
            webmailUrl = "http://localhost:8080"
        )
    }

    private fun getDefaultMailcowComposeConfig(): String {
        val mailcowPath = mailcowDir.absolutePath
        val template = ResourceLoader.loadResourceOrThrow("templates/mailcow/docker-compose.yml")
        return ResourceLoader.replacePlaceholders(template, mapOf(
            "mailcowPath" to mailcowPath
        ))
    }
}

// Service object for easy access
object EmailService {
    private val service: IEmailService = EmailServiceImpl()
    
    suspend fun listEmailDomains() = service.listDomains()
    suspend fun createEmailDomain(domain: String) = service.createDomain(domain)
    suspend fun deleteEmailDomain(domain: String) = service.deleteDomain(domain)
    suspend fun listEmailUsers() = service.listUsers()
    suspend fun createEmailUser(userAddress: String, request: CreateEmailUserRequest): Pair<Boolean, String> = service.createUser(userAddress, request)
    suspend fun deleteEmailUser(userAddress: String) = service.deleteUser(userAddress)
    suspend fun updateEmailUserPassword(userAddress: String, request: UpdateEmailUserPasswordRequest) = service.updateUserPassword(userAddress, request)
    suspend fun listEmailMailboxes(userAddress: String) = service.listMailboxes(userAddress)
    suspend fun createEmailMailbox(userAddress: String, mailboxName: String) = service.createMailbox(userAddress, mailboxName)
    suspend fun deleteEmailMailbox(userAddress: String, mailboxName: String) = service.deleteMailbox(userAddress, mailboxName)
    suspend fun listEmailGroups() = service.listGroups()
    suspend fun getEmailGroupMembers(groupAddress: String) = service.getGroupMembers(groupAddress)
    suspend fun addEmailGroupMember(groupAddress: String, memberAddress: String) = service.addToGroup(groupAddress, memberAddress)
    suspend fun removeEmailGroupMember(groupAddress: String, memberAddress: String) = service.removeFromGroup(groupAddress, memberAddress)
    suspend fun getEmailUserQuota(userAddress: String) = service.getUserQuota(userAddress)
    suspend fun setEmailUserQuota(userAddress: String, type: String, value: Long) = service.setUserQuota(userAddress, type, value)
    suspend fun deleteEmailUserQuota(userAddress: String) = service.deleteUserQuota(userAddress)
    fun getJamesStatus() = service.getStatus()
    fun ensureJamesConfig() = service.ensureJamesConfig()
    fun getJamesComposeConfig() = service.getComposeConfig()
    fun updateJamesComposeConfig(content: String) = service.updateComposeConfig(content)
    fun startJames() = service.startJames()
    fun stopJames() = service.stopJames()
    fun restartJames() = service.restartJames()
    suspend fun testEmailConnection(request: EmailTestRequest) = service.testEmailConnection(request)
    fun listJamesConfigFiles() = service.listJamesConfigFiles()
    fun getJamesConfigContent(filename: String) = service.getJamesConfigContent(filename)
    fun updateJamesConfigContent(filename: String, content: String) = service.updateJamesConfigContent(filename, content)
    fun getDefaultJamesConfigContent(filename: String) = service.getDefaultJamesConfigContent(filename)
    fun refresh() = service.refresh()
    
    // Mailcow management
    fun getMailcowStatus() = service.getMailcowStatus()
    fun ensureMailcowConfig() = service.ensureMailcowConfig()
    fun getMailcowComposeConfig() = service.getMailcowComposeConfig()
    fun updateMailcowComposeConfig(content: String) = service.updateMailcowComposeConfig(content)
    fun startMailcow() = service.startMailcow()
    fun stopMailcow() = service.stopMailcow()
    fun restartMailcow() = service.restartMailcow()
}
