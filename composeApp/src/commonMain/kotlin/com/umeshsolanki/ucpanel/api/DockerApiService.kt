package com.umeshsolanki.ucpanel.api

import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.delete
import io.ktor.client.request.parameter
import com.umeshsolanki.ucpanel.*

object DockerApiService {
    private val client = HttpClientFactory.client

    suspend fun listContainers(): List<DockerContainer> = try {
        client.get("containers").body()
    } catch (e: Exception) {
        e.printStackTrace()
        emptyList()
    }

    suspend fun startContainer(id: String) = try {
        client.post("containers/$id/start")
    } catch (e: Exception) {
        e.printStackTrace()
    }

    suspend fun stopContainer(id: String) = try {
        client.post("containers/$id/stop")
    } catch (e: Exception) {
        e.printStackTrace()
    }

    suspend fun removeContainer(id: String) = try {
        client.delete("containers/$id")
    } catch (e: Exception) {
        e.printStackTrace()
    }

    suspend fun pruneContainers() = try {
        client.post("containers/prune")
    } catch (e: Exception) {
        e.printStackTrace()
    }

    suspend fun listImages(): List<DockerImage> = try {
        client.get("images").body()
    } catch (e: Exception) {
        e.printStackTrace()
        emptyList()
    }

    suspend fun pullImage(name: String) = try {
        client.post("images/pull") { parameter("image", name) }
    } catch (e: Exception) {
        e.printStackTrace()
    }

    suspend fun removeImage(id: String) = try {
        client.delete("images/$id")
    } catch (e: Exception) {
        e.printStackTrace()
    }

    suspend fun inspectContainer(id: String): ContainerDetails? = try {
        client.get("containers/$id/inspect").body()
    } catch (e: Exception) {
        e.printStackTrace()
        null
    }
}
