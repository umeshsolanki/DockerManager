package com.umeshsolanki.dockermanager

import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.Json

object DockerClient {
    private val client = HttpClient {
        install(ContentNegotiation) {
            json(Json {
                ignoreUnknownKeys = true
                isLenient = true
            })
        }
    }

    private const val BASE_URL = "http://localhost:8080"

    suspend fun listContainers(): List<DockerContainer> {
        return try {
            client.get("$BASE_URL/containers").body()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun startContainer(id: String) {
        try {
            client.post("$BASE_URL/containers/$id/start")
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun stopContainer(id: String) {
        try {
            client.post("$BASE_URL/containers/$id/stop")
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
