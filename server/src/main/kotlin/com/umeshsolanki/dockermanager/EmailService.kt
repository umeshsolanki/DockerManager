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

interface IEmailService {
    suspend fun listDomains(): List<EmailDomain>
    suspend fun createDomain(domain: String): Boolean
    suspend fun deleteDomain(domain: String): Boolean
    
    suspend fun listUsers(): List<EmailUser>
    suspend fun createUser(userAddress: String, request: CreateEmailUserRequest): Boolean
    suspend fun deleteUser(userAddress: String): Boolean
    suspend fun updateUserPassword(userAddress: String, request: UpdateEmailUserPasswordRequest): Boolean
    
    fun refresh()
}

class EmailServiceImpl : IEmailService {
    private val logger = LoggerFactory.getLogger(EmailServiceImpl::class.java)
    private var jamesUrl = AppConfig.jamesWebAdminUrl

    override fun refresh() {
        jamesUrl = AppConfig.jamesWebAdminUrl
        logger.info("Email service refreshed with URL: $jamesUrl")
    }

    
    private val client = HttpClient(Java) {
        install(ContentNegotiation) {
            json(AppConfig.json)
        }
    }

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
}
