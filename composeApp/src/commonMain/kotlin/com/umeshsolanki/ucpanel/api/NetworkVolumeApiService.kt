package com.umeshsolanki.ucpanel.api

import io.ktor.client.call.body
import io.ktor.client.request.*
import com.umeshsolanki.ucpanel.*

object NetworkApiService {
    private val client = HttpClientFactory.client

    suspend fun listNetworks(): List<DockerNetwork> = try {
        client.get("networks").body()
    } catch (e: Exception) {
        e.printStackTrace()
        emptyList()
    }

    suspend fun removeNetwork(id: String) = try {
        client.delete("networks/$id")
    } catch (e: Exception) {
        e.printStackTrace()
    }
}

object VolumeApiService {
    private val client = HttpClientFactory.client

    suspend fun listVolumes(): List<DockerVolume> = try {
        client.get("volumes").body()
    } catch (e: Exception) {
        e.printStackTrace()
        emptyList()
    }

    suspend fun removeVolume(name: String) = try {
        client.delete("volumes/$name")
    } catch (e: Exception) {
        e.printStackTrace()
    }

    suspend fun pruneVolumes() = try {
        client.post("volumes/prune")
    } catch (e: Exception) {
        e.printStackTrace()
    }

    suspend fun inspectVolume(name: String): VolumeDetails? = try {
        client.get("volumes/$name/inspect").body()
    } catch (e: Exception) {
        e.printStackTrace()
        null
    }

    suspend fun backupVolume(name: String): BackupResult? = try {
        client.post("volumes/$name/backup").body()
    } catch (e: Exception) {
        e.printStackTrace()
        null
    }
}
