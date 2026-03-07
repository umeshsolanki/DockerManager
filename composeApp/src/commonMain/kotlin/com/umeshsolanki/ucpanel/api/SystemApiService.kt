package com.umeshsolanki.ucpanel.api

import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import com.umeshsolanki.ucpanel.*
import io.ktor.http.contentType
import io.ktor.http.HttpStatusCode
import io.ktor.client.statement.*

object SystemApiService {
    private val client = HttpClientFactory.client

    suspend fun authenticate(request: AuthRequest): AuthResultWrapper = try {
        val response = client.post("auth/login") {
            contentType(ContentType.Application.Json)
            setBody(request)
        }
        if (response.status == HttpStatusCode.OK) {
            AuthResultWrapper(response = response.body<AuthResponse>())
        } else {
            val errorMsg = try {
                val map = response.body<Map<String, String>>()
                map["message"] ?: "Authentication failed: ${response.status}"
            } catch (e: Exception) {
                "Authentication failed: ${response.status}"
            }
            AuthResultWrapper(error = errorMsg)
        }
    } catch (e: Exception) {
        e.printStackTrace()
        AuthResultWrapper(error = "Network error: ${e.message}")
    }

    data class AuthResultWrapper(
        val response: AuthResponse? = null,
        val error: String? = null
    )

    suspend fun getBatteryStatus(): BatteryStatus? = try {
        client.get("system/battery").body()
    } catch (e: Exception) {
        e.printStackTrace()
        null
    }

    suspend fun getStorageInfo(): StorageInfo? = try {
        client.get("system/storage").body()
    } catch (e: Exception) {
        e.printStackTrace()
        null
    }

    suspend fun fetchFcmApiKey(): String? = try {
        val response = client.get("auth/fcm/api-key")
        if (response.status == HttpStatusCode.OK) {
            val body = response.body<Map<String, String>>()
            body["apiKey"]
        } else null
    } catch (e: Exception) {
        e.printStackTrace()
        null
    }

    suspend fun registerFcmToken(request: RegisterFcmTokenRequest) = try {
        val apiKey = SettingsManager.getFcmApiKey()
        client.post("auth/fcm/register") {
            contentType(ContentType.Application.Json)
            if (apiKey.isNotBlank()) header("X-API-Key", apiKey)
            setBody(request)
        }
    } catch (e: Exception) {
        e.printStackTrace()
    }

    suspend fun testEmail(request: EmailTestRequest): EmailTestResult = try {
        client.post("emails/test") {
            contentType(ContentType.Application.Json)
            setBody(request)
        }.body()
    } catch (e: Exception) {
        e.printStackTrace()
        EmailTestResult(false, "Network error: ${e.message}")
    }
}
