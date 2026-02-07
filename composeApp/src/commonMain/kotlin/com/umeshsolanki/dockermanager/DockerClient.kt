package com.umeshsolanki.dockermanager

import com.russhwolf.settings.set
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import com.umeshsolanki.dockermanager.ProxyHost

object DockerClient {
    private val client = HttpClient {
        install(ContentNegotiation) {
            json(Json {
                ignoreUnknownKeys = true
                isLenient = true
            })
        }
    }


    fun getServerUrl(): String {
        return appSettings.getString(SettingsName.SERVER_URL, "http://192.168.1.3:85")
    }

    fun setServerUrl(url: String) {
        appSettings[SettingsName.SERVER_URL] = url
    }

    fun getSyslogServer(): String {
        return appSettings.getString(SettingsName.SYSLOG_SERVER, "127.0.0.1")
    }

    fun setSyslogServer(server: String) {
        appSettings[SettingsName.SYSLOG_SERVER] = server
    }

    fun getSyslogPort(): Int {
        return appSettings.getInt(SettingsName.SYSLOG_PORT, 514)
    }

    fun setSyslogPort(port: Int) {
        appSettings[SettingsName.SYSLOG_PORT] = port
    }

    private val BASE_URL: String
        get() = getServerUrl()

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

    suspend fun removeContainer(id: String) {
        try {
            client.delete("$BASE_URL/containers/$id")
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun pruneContainers() {
        try {
            client.post("$BASE_URL/containers/prune")
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun listImages(): List<DockerImage> {
        return try {
            client.get("$BASE_URL/images").body()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun pullImage(name: String) {
        try {
            client.post("$BASE_URL/images/pull") {
                parameter("image", name)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun removeImage(id: String) {
        try {
            client.delete("$BASE_URL/images/$id")
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun listComposeFiles(): List<ComposeFile> {
        return try {
            client.get("$BASE_URL/compose").body()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun composeUp(path: String) {
        try {
            client.post("$BASE_URL/compose/up") {
                parameter("file", path)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun composeDown(path: String) {
        try {
            client.post("$BASE_URL/compose/down") {
                parameter("file", path)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun getBatteryStatus(): BatteryStatus? {
        return try {
            client.get("$BASE_URL/system/battery").body()
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun listNetworks(): List<DockerNetwork> {
        return try {
            client.get("$BASE_URL/networks").body()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun removeNetwork(id: String) {
        try {
            client.delete("$BASE_URL/networks/$id")
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun inspectContainer(id: String): ContainerDetails? {
        return try {
            client.get("$BASE_URL/containers/$id/inspect").body()
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun listVolumes(): List<DockerVolume> {
        return try {
            client.get("$BASE_URL/volumes").body()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun removeVolume(name: String) {
        try {
            client.delete("$BASE_URL/volumes/$name")
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun pruneVolumes() {
        try {
            client.post("$BASE_URL/volumes/prune")
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun inspectVolume(name: String): VolumeDetails? {
        return try {
            client.get("$BASE_URL/volumes/$name/inspect").body()
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun backupVolume(name: String): BackupResult? {
        return try {
            client.post("$BASE_URL/volumes/$name/backup").body()
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    // Proxy Container Management
    suspend fun getProxyContainerStatus(): ProxyContainerStatus? {
        return try {
            client.get("$BASE_URL/proxy/container/status").body()
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun buildProxyImage(): Boolean {
        return try {
            client.post("$BASE_URL/proxy/container/build")
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun createProxyContainer(): Boolean {
        return try {
            client.post("$BASE_URL/proxy/container/create")
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun startProxyContainer(): Boolean {
        return try {
            client.post("$BASE_URL/proxy/container/start")
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun stopProxyContainer(): Boolean {
        return try {
            client.post("$BASE_URL/proxy/container/stop")
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun restartProxyContainer(): Boolean {
        return try {
            client.post("$BASE_URL/proxy/container/restart")
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun ensureProxyContainer(): Boolean {
        return try {
            client.post("$BASE_URL/proxy/container/ensure")
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    // Proxy Host Management
    suspend fun listProxyHosts(): List<ProxyHost> {
        return try {
            client.get("$BASE_URL/proxy/hosts").body()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun createProxyHost(host: ProxyHost): Boolean {
        return try {
            client.post("$BASE_URL/proxy/hosts") {
                setBody(host)
            }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun updateProxyHost(host: ProxyHost): Boolean {
        return try {
            client.put("$BASE_URL/proxy/hosts/${host.id}") {
                setBody(host)
            }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun deleteProxyHost(id: String): Boolean {
        return try {
            client.delete("$BASE_URL/proxy/hosts/$id")
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun toggleProxyHost(id: String): Boolean {
        return try {
            client.post("$BASE_URL/proxy/hosts/$id/toggle")
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    // Email Management
    suspend fun testEmail(request: EmailTestRequest): EmailTestResult {
        return try {
            val response = client.post("$BASE_URL/emails/james/test") {
                setBody(request)
            }
            response.body()
        } catch (e: Exception) {
            e.printStackTrace()
            EmailTestResult(false, "Network error: ${e.message}")
        }
    }
}
