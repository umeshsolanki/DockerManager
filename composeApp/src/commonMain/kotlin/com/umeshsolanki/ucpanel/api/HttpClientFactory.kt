package com.umeshsolanki.ucpanel.api

import com.umeshsolanki.ucpanel.SettingsManager
import io.ktor.client.HttpClient
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.accept
import io.ktor.client.request.header
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

object HttpClientFactory {
    val client = HttpClient {
        install(ContentNegotiation) {
            json(Json {
                ignoreUnknownKeys = true
                isLenient = true
                encodeDefaults = true
            })
        }
        defaultRequest {
            val baseUrl = SettingsManager.getServerUrl()
            url(if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/")
            contentType(ContentType.Application.Json)
            accept(ContentType.Application.Json)

            val token = SettingsManager.getAuthToken()
            if (token.isNotBlank()) {
                header("Authorization", "Bearer $token")
            }
        }
    }

}
