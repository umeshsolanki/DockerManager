package com.umeshsolanki.ucpanel.api

import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.delete
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import com.umeshsolanki.ucpanel.*

object ProxyApiService {
    private val client = HttpClientFactory.client

    suspend fun getProxyContainerStatus(): ProxyContainerStatus? = try {
        client.get("proxy/container/status").body()
    } catch (e: Exception) {
        e.printStackTrace()
        null
    }

    suspend fun buildProxyImage(): Boolean = try {
        client.post("proxy/container/build")
        true
    } catch (e: Exception) {
        e.printStackTrace()
        false
    }

    suspend fun createProxyContainer(): Boolean = try {
        client.post("proxy/container/create")
        true
    } catch (e: Exception) {
        e.printStackTrace()
        false
    }

    suspend fun startProxyContainer(): Boolean = try {
        client.post("proxy/container/start")
        true
    } catch (e: Exception) {
        e.printStackTrace()
        false
    }

    suspend fun stopProxyContainer(): Boolean = try {
        client.post("proxy/container/stop")
        true
    } catch (e: Exception) {
        e.printStackTrace()
        false
    }

    suspend fun restartProxyContainer(): Boolean = try {
        client.post("proxy/container/restart")
        true
    } catch (e: Exception) {
        e.printStackTrace()
        false
    }

    suspend fun ensureProxyContainer(): Boolean = try {
        client.post("proxy/container/ensure")
        true
    } catch (e: Exception) {
        e.printStackTrace()
        false
    }

    suspend fun listProxyHosts(): List<ProxyHost> = try {
        client.get("proxy/hosts").body()
    } catch (e: Exception) {
        e.printStackTrace()
        emptyList()
    }

    suspend fun createProxyHost(host: ProxyHost): Boolean = try {
        client.post("proxy/hosts") {
            contentType(ContentType.Application.Json)
            setBody(host)
        }
        true
    } catch (e: Exception) {
        e.printStackTrace()
        false
    }

    suspend fun updateProxyHost(host: ProxyHost): Boolean = try {
        client.put("proxy/hosts/${host.id}") {
            contentType(ContentType.Application.Json)
            setBody(host)
        }
        true
    } catch (e: Exception) {
        e.printStackTrace()
        false
    }

    suspend fun deleteProxyHost(id: String): Boolean = try {
        client.delete("proxy/hosts/$id")
        true
    } catch (e: Exception) {
        e.printStackTrace()
        false
    }

    suspend fun toggleProxyHost(id: String): Boolean = try {
        client.post("proxy/hosts/$id/toggle")
        true
    } catch (e: Exception) {
        e.printStackTrace()
        false
    }
}
