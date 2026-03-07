package com.umeshsolanki.ucpanel.api

import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.request.delete
import io.ktor.client.request.parameter
import io.ktor.http.ContentType
import io.ktor.http.contentType
import com.umeshsolanki.ucpanel.*

object AnalyticsApiService {
    private val client = HttpClientFactory.client

    suspend fun getStats(): ProxyStats? = try {
        client.get("analytics/stats").body()
    } catch (e: Exception) {
        e.printStackTrace()
        null
    }

    suspend fun getRecentMirrorRequests(limit: Int = 100): List<ProxyHit> = try {
        client.get("analytics/security/mirrors") {
            parameter("limit", limit)
        }.body()
    } catch (e: Exception) {
        e.printStackTrace()
        emptyList()
    }
}
