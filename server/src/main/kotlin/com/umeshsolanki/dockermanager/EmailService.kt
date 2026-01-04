package com.umeshsolanki.dockermanager

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

interface IEmailService {
    suspend fun listDomains(): List<EmailDomain>
    suspend fun createDomain(domain: String): Boolean
    suspend fun deleteDomain(domain: String): Boolean
    
    suspend fun listUsers(): List<EmailUser>
    suspend fun createUser(userAddress: String, request: CreateEmailUserRequest): Boolean
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
}

class EmailServiceImpl : IEmailService {
    private val logger = LoggerFactory.getLogger(EmailServiceImpl::class.java)
    private var jamesUrl = AppConfig.jamesWebAdminUrl
    
    private val jamesDir = AppConfig.jamesDir
    private val composeFile = File(jamesDir, "docker-compose.yml")

    override fun refresh() {
        jamesUrl = AppConfig.jamesWebAdminUrl
        logger.info("Email service refreshed with URL: $jamesUrl")
    }

    private val client = HttpClient(Java) {
        install(ContentNegotiation) {
            json(AppConfig.json)
        }
    }

    private fun executeCommand(command: String, workingDir: File? = null): String {
        return try {
            val parts = command.split("\\s+".toRegex())
            val proc = ProcessBuilder(parts)
                .directory(workingDir ?: AppConfig.projectRoot)
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

    // --- Container Management ---

    override fun ensureJamesConfig() {
        if (!jamesDir.exists()) jamesDir.mkdirs()
        
        // Ensure conf and var directory exists
        val confDir = File(jamesDir, "conf")
        if (!confDir.exists()) confDir.mkdirs()
        File(jamesDir, "var").mkdirs()

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
        ensureJamesConfig()
        val cmd = "${AppConfig.dockerComposeCommand} -f ${composeFile.absolutePath} up -d"
        val output = executeCommand(cmd, jamesDir)
        return output.isNotBlank() 
    }

    override fun stopJames(): Boolean {
        if (!composeFile.exists()) return true
        val cmd = "${AppConfig.dockerComposeCommand} -f ${composeFile.absolutePath} stop" 
        executeCommand(cmd, jamesDir)
        return true
    }

    override fun restartJames(): Boolean {
        ensureJamesConfig()
        val cmd = "${AppConfig.dockerComposeCommand} -f ${composeFile.absolutePath} restart"
        executeCommand(cmd, jamesDir)
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
        return """
services:
  james:
    image: apache/james:jpa-latest
    container_name: james
    hostname: james.local
    restart: unless-stopped
    ports:
      - "25:25"
      - "143:143"
      - "993:993"
      - "465:465"
      - "587:587"
      - "8000:8000"
    volumes:
      - ./var:/root/var
      - ./conf/webadmin.properties:/root/conf/webadmin.properties
    command: --generate-keystore
    networks:
      - dockermanager_network

networks:
  dockermanager_network:
    external: true
        """.trimIndent()
    }

    // --- API Methods ---

    override suspend fun listDomains(): List<EmailDomain> {
        return try {
            val domains: List<String> = client.get("$jamesUrl/domains").body()
            domains.map { EmailDomain(it) }
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
                val userAddress = it.jsonObject["user"]?.jsonPrimitive?.content ?: ""
                EmailUser(userAddress)
            }
        } catch (e: Exception) {
            logger.error("Failed to list users", e)
            emptyList()
        }
    }

    override suspend fun createUser(userAddress: String, request: CreateEmailUserRequest): Boolean {
        return try {
            val response = client.put("$jamesUrl/users/$userAddress") {
                contentType(io.ktor.http.ContentType.Application.Json)
                setBody(mapOf("password" to request.password))
            }
            response.status.value in 200..299
        } catch (e: Exception) {
            logger.error("Failed to create user: $userAddress", e)
            false
        }
    }

    override suspend fun deleteUser(userAddress: String): Boolean {
        return try {
            val response = client.delete("$jamesUrl/users/$userAddress")
            response.status.value in 200..299
        } catch (e: Exception) {
            logger.error("Failed to delete user: $userAddress", e)
            false
        }
    }

    override suspend fun updateUserPassword(userAddress: String, request: UpdateEmailUserPasswordRequest): Boolean {
        return try {
            val response = client.put("$jamesUrl/users/$userAddress") {
                contentType(io.ktor.http.ContentType.Application.Json)
                setBody(mapOf("password" to request.password))
            }
            response.status.value in 200..299
        } catch (e: Exception) {
            logger.error("Failed to update password for user: $userAddress", e)
            false
        }
    }

    override suspend fun listMailboxes(userAddress: String): List<EmailMailbox> {
        return try {
            val mailboxes: List<JsonElement> = client.get("$jamesUrl/users/$userAddress/mailboxes").body()
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
            val response = client.put("$jamesUrl/users/$userAddress/mailboxes/$mailboxName")
            response.status.value in 200..299
        } catch (e: Exception) {
            logger.error("Failed to create mailbox: $mailboxName for user: $userAddress", e)
            false
        }
    }

    override suspend fun deleteMailbox(userAddress: String, mailboxName: String): Boolean {
        return try {
            val response = client.delete("$jamesUrl/users/$userAddress/mailboxes/$mailboxName")
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
                val members: List<JsonElement> = client.get("$jamesUrl/groups/$addr").body()
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
             val members: List<JsonElement> = client.get("$jamesUrl/groups/$groupAddress").body()
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
            val response = client.put("$jamesUrl/groups/$groupAddress/$memberAddress")
            response.status.value in 200..299
        } catch (e: Exception) {
            logger.error("Failed to add $memberAddress to $groupAddress", e)
            false
        }
    }

    override suspend fun removeFromGroup(groupAddress: String, memberAddress: String): Boolean {
        return try {
            val response = client.delete("$jamesUrl/groups/$groupAddress/$memberAddress")
            response.status.value in 200..299
        } catch (e: Exception) {
            logger.error("Failed to remove $memberAddress from $groupAddress", e)
            false
        }
    }

    // --- Quotas ---

    override suspend fun getUserQuota(userAddress: String): EmailUserDetail? {
        return try {
            // 1. Get Usage
            val usageJson: JsonObject = client.get("$jamesUrl/quota/users/$userAddress/usage").body()
            // 2. Get Limits (Definition)
            val limitsJson: JsonObject = client.get("$jamesUrl/quota/users/$userAddress").body()

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
            val endpoint = if (type == "count") "count" else "size"
            val response = client.put("$jamesUrl/quota/users/$userAddress/$endpoint") {
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
            val res1 = client.delete("$jamesUrl/quota/users/$userAddress/count")
            val res2 = client.delete("$jamesUrl/quota/users/$userAddress/size")
            res1.status.value in 200..299 && res2.status.value in 200..299
        } catch (e: Exception) {
            logger.error("Failed to delete quota for $userAddress", e)
            false
        }
    }
}
