package com.umeshsolanki.ucpanel.api

import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.parameter
import com.umeshsolanki.ucpanel.*

object ComposeApiService {
    private val client = HttpClientFactory.client

    suspend fun listComposeFiles(): List<ComposeFile> = try {
        client.get("compose").body()
    } catch (e: Exception) {
        e.printStackTrace()
        emptyList()
    }

    suspend fun composeUp(path: String) = try {
        client.post("compose/up") { parameter("file", path) }
    } catch (e: Exception) {
        e.printStackTrace()
    }

    suspend fun composeDown(path: String) = try {
        client.post("compose/down") { parameter("file", path) }
    } catch (e: Exception) {
        e.printStackTrace()
    }
}
