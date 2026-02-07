@file:OptIn(ExperimentalSerializationApi::class)

package com.umeshsolanki.dockermanager.proxy

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.ServiceContainer
import com.umeshsolanki.dockermanager.cache.CacheService
import com.umeshsolanki.dockermanager.jail.IJailManagerService
import com.umeshsolanki.dockermanager.utils.CommandExecutor
import com.umeshsolanki.dockermanager.utils.JsonPersistence
import com.umeshsolanki.dockermanager.utils.ResourceLoader
import com.umeshsolanki.dockermanager.utils.ExecuteResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.*
import com.umeshsolanki.dockermanager.database.SettingsTable
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

// Service object for easy access
object ProxyService {
    private val service: IProxyService by lazy {
        ServiceContainer.proxyService
    }

    fun listHosts() = service.listHosts()
    fun createHost(host: ProxyHost) = service.createHost(host)
    fun deleteHost(id: String) = service.deleteHost(id)
    fun getStats() = service.getStats()
    fun toggleHost(id: String) = service.toggleHost(id)
    fun updateHost(host: ProxyHost) = service.updateHost(host)
    fun requestSSL(id: String) = service.requestSSL(id)
    fun listCertificates() = service.listCertificates()

    // DNS Config Management
    fun listDnsConfigs() = service.listDnsConfigs()
    fun getDnsConfig(id: String) = service.getDnsConfig(id)
    fun createDnsConfig(config: DnsConfig) = service.createDnsConfig(config)
    fun updateDnsConfig(config: DnsConfig) = service.updateDnsConfig(config)
    fun deleteDnsConfig(id: String) = service.deleteDnsConfig(id)

    fun buildProxyImage() = service.buildProxyImage()
    fun createProxyContainer() = service.createProxyContainer()
    fun startProxyContainer() = service.startProxyContainer()
    fun stopProxyContainer() = service.stopProxyContainer()
    fun restartProxyContainer() = service.restartProxyContainer()
    fun getProxyContainerStatus() = service.getProxyContainerStatus()
    fun ensureProxyContainerExists() = service.ensureProxyContainerExists()
    fun getComposeConfig() = service.getComposeConfig()
    fun updateComposeConfig(content: String) = service.updateComposeConfig(content)
    fun resetComposeConfig() = service.resetComposeConfig()
    fun updateStatsSettings(active: Boolean, intervalMs: Long, filterLocalIps: Boolean? = null) =
        service.updateStatsSettings(active, intervalMs, filterLocalIps)

    fun updateSecuritySettings(enabled: Boolean, thresholdNon200: Int, rules: List<ProxyJailRule>) =
        service.updateSecuritySettings(enabled, thresholdNon200, rules)

    fun updateDefaultBehavior(return404: Boolean) = service.updateDefaultBehavior(return404)

    fun updateRsyslogSettings(enabled: Boolean) = service.updateRsyslogSettings(enabled)

    fun getProxySecuritySettings() = AppConfig.settings

    // Analytics History
    fun getHistoricalStats(date: String) = service.getHistoricalStats(date)
    fun listAvailableDates() = service.listAvailableDates()
    fun getStatsForDateRange(startDate: String, endDate: String) =
        service.getStatsForDateRange(startDate, endDate)

    fun forceReprocessLogs(date: String) = service.forceReprocessLogs(date)
    fun updateStatsForAllDaysInCurrentLog() = service.updateStatsForAllDaysInCurrentLog()
}

interface IProxyService {
    fun listHosts(): List<ProxyHost>
    fun createHost(host: ProxyHost): Pair<Boolean, String>
    fun deleteHost(id: String): Boolean
    fun getStats(): ProxyStats
    fun toggleHost(id: String): Boolean
    fun updateHost(host: ProxyHost): Pair<Boolean, String>
    fun requestSSL(id: String): Boolean
    fun listCertificates(): List<SSLCertificate>

    // DNS Config Management
    fun listDnsConfigs(): List<DnsConfig>
    fun getDnsConfig(id: String): DnsConfig?
    fun createDnsConfig(config: DnsConfig): Pair<Boolean, String>
    fun updateDnsConfig(config: DnsConfig): Pair<Boolean, String>
    fun deleteDnsConfig(id: String): Pair<Boolean, String>

    // Proxy Container Management
    fun buildProxyImage(): Pair<Boolean, String>
    fun createProxyContainer(): Pair<Boolean, String>
    fun startProxyContainer(): Pair<Boolean, String>
    fun stopProxyContainer(): Pair<Boolean, String>
    fun restartProxyContainer(): Pair<Boolean, String>
    fun getProxyContainerStatus(): ProxyContainerStatus
    fun ensureProxyContainerExists(): Boolean
    fun getComposeConfig(): String
    fun updateComposeConfig(content: String): Pair<Boolean, String>
    fun resetComposeConfig(): Pair<Boolean, String>
    fun updateStatsSettings(active: Boolean, intervalMs: Long, filterLocalIps: Boolean? = null)
    fun updateSecuritySettings(enabled: Boolean, thresholdNon200: Int, rules: List<ProxyJailRule>)
    fun updateDefaultBehavior(return404: Boolean): Pair<Boolean, String>
    fun updateRsyslogSettings(enabled: Boolean): Pair<Boolean, String>

    // Analytics History
    fun getHistoricalStats(date: String): DailyProxyStats?
    fun listAvailableDates(): List<String>
    fun getStatsForDateRange(startDate: String, endDate: String): List<DailyProxyStats>
    fun forceReprocessLogs(date: String): DailyProxyStats?
    fun updateStatsForAllDaysInCurrentLog(): Map<String, Boolean>
    
}

class ProxyServiceImpl(
    private val jailManagerService: IJailManagerService,
    private val sslService: ISSLService
) : IProxyService {
    private val logger = org.slf4j.LoggerFactory.getLogger(ProxyServiceImpl::class.java)
    private val configDir = AppConfig.nginxConfigDir
    private val hostsFile = AppConfig.nginxHostsFile
    private val jsonPersistence = JsonPersistence.create<List<ProxyHost>>(
        file = hostsFile,
        defaultContent = emptyList(),
        loggerName = ProxyServiceImpl::class.java.name
    )
    

    val proxyDockerComposeDir: File
        get() {
            return File(AppConfig.projectRoot, "proxy").let {
                if (!it.exists()) {
                    it.mkdirs()
                }
                it
            }
        }

    private val nginxPath = AppConfig.nginxDir.absolutePath
    private val certbotPath = AppConfig.certbotDir.absolutePath
    private val customCertsPath = AppConfig.customCertDir.absolutePath

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val commandExecutor = CommandExecutor(loggerName = ProxyServiceImpl::class.java.name)
    
    // Template cache to avoid redundant resource loads
    private val templateCache = ConcurrentHashMap<String, String>()
    
    // In-memory cache for proxy hosts
    @Volatile
    private var cachedHosts: MutableList<ProxyHost>? = null
    private val hostsLock = java.util.concurrent.locks.ReentrantReadWriteLock()

    private fun getCachedTemplate(path: String): String {
        return templateCache.getOrPut(path) {
            ResourceLoader.loadResourceOrThrow(path)
        }
    }

    override fun updateSecuritySettings(
        enabled: Boolean,
        thresholdNon200: Int,
        rules: List<ProxyJailRule>,
    ) {
        AppConfig.updateProxySecuritySettings(enabled, thresholdNon200, rules)
    }

    override fun updateDefaultBehavior(return404: Boolean): Pair<Boolean, String> {
        return try {
            AppConfig.updateProxyDefaultBehavior(return404)
            ensureDefaultServer() // Regenerates config
            
            // Reload nginx
            val reloadResult = reloadNginx()
            if (!reloadResult.first) {
                if (reloadResult.second.contains("Proxy container is not running", ignoreCase = true)) {
                    return true to "Settings saved (Proxy not running)"
                }
                return false to "Settings saved but failed to reload Nginx: ${reloadResult.second}"
            }
            
            true to "Default behavior updated successfully"
        } catch (e: Exception) {
            logger.error("Failed to update default behavior", e)
            false to "Failed to update: ${e.message}"
        }
    }

    override fun updateRsyslogSettings(enabled: Boolean): Pair<Boolean, String> {
        return try {
            AppConfig.updateProxyRsyslogSettings(enabled)
            ensureNginxMainConfig(forceOverwrite = true)
            
            val reloadResult = reloadNginx()
            if (!reloadResult.first) {
                if (reloadResult.second.contains("Proxy container is not running", ignoreCase = true)) {
                    return true to "Rsyslog settings saved (Proxy not running)"
                }
                return false to "Settings saved but failed to reload Nginx: ${reloadResult.second}"
            }
            true to "Rsyslog settings updated successfully"
        } catch (e: Exception) {
            logger.error("Failed to update Rsyslog settings", e)
            false to "Failed to update: ${e.message}"
        }
    }

    init {
        if (!configDir.exists()) configDir.mkdirs()
    }

    override fun getStats(): ProxyStats = AnalyticsService.getStats()

    private fun loadHosts(): MutableList<ProxyHost> {
        hostsLock.readLock().lock()
        try {
            cachedHosts?.let {
                return it.toMutableList()
            }
        } finally {
            hostsLock.readLock().unlock()
        }

        hostsLock.writeLock().lock()
        try {
            // Check again after acquiring write lock
            cachedHosts?.let {
                return it.toMutableList()
            }

            // 1. Try to load from Database first if active
            var hosts: MutableList<ProxyHost>? = null
            if (AppConfig.storageBackend == "database") {
                try {
                    val dbHostsJson = transaction {
                        SettingsTable.selectAll().where { SettingsTable.key eq "PROXY_HOSTS" }
                            .singleOrNull()
                            ?.get(SettingsTable.value)
                    }

                    if (dbHostsJson != null) {
                        logger.debug("Proxy hosts loaded from Database")
                        hosts = AppConfig.json.decodeFromString<List<ProxyHost>>(dbHostsJson).toMutableList()
                    }
                } catch (e: Exception) {
                    logger.warn("Failed to load proxy hosts from DB: ${e.message}")
                }
            }

            // 2. Fallback to file load (legacy/migration source)
            if (hosts == null) {
                hosts = try {
                    if (hostsFile.exists()) {
                        val content = hostsFile.readText()
                        if (content.isBlank()) {
                            mutableListOf()
                        } else {
                            try {
                                AppConfig.json.decodeFromString<List<ProxyHost>>(content).toMutableList()
                            } catch (e: Exception) {
                                if (e.message?.contains("upstream") == true) {
                                    logger.warn("Detected old proxy host format missing 'upstream' field, attempting migration...")
                                    migrateOldHostsFormat(content)
                                } else {
                                    logger.error("Error loading proxy hosts: ${e.message}", e)
                                    mutableListOf()
                                }
                            }
                        }
                    } else {
                        jsonPersistence.load().toMutableList()
                    }
                } catch (e: Exception) {
                    logger.error("Error loading proxy hosts", e)
                    jsonPersistence.load().toMutableList()
                }
            }

            // 3. Migrate to DB if active and hosts were loaded from file
            if (AppConfig.storageBackend == "database" && hosts != null && hosts.isNotEmpty()) {
                scope.launch {
                    try {
                        val content = AppConfig.json.encodeToString(hosts)
                        transaction {
                            val existing = SettingsTable.selectAll().where { SettingsTable.key eq "PROXY_HOSTS" }.singleOrNull()
                            if (existing != null) {
                                SettingsTable.update({ SettingsTable.key eq "PROXY_HOSTS" }) { stmt -> stmt[SettingsTable.value] = content }
                            } else {
                                SettingsTable.insert { stmt ->
                                    stmt[SettingsTable.key] = "PROXY_HOSTS"
                                    stmt[SettingsTable.value] = content
                                }
                            }
                        }
                        logger.info("Proxy hosts migrated to Database successfully.")
                    } catch (e: Exception) {
                        logger.error("Failed to migrate proxy hosts to DB", e)
                    }
                }
            }

            val finalHosts = hosts ?: mutableListOf() // Ensure hosts is not null
            syncToRedis(finalHosts)
            cachedHosts = finalHosts.toMutableList()
            logger.debug("Loaded ${finalHosts.size} proxy hosts and cached in memory")
            return finalHosts
        } finally {
            hostsLock.writeLock().unlock()
        }
    }

    private fun syncToRedis(hosts: List<ProxyHost>) {
        // If Redis is enabled, sync data to Redis
        if (CacheService.currentConfig.enabled && hosts.isNotEmpty()) {
            try {
                val cachedHosts = CacheService.get<List<ProxyHost>>("proxy:hosts")
                if (cachedHosts == null || cachedHosts.isEmpty() || cachedHosts.size != hosts.size) {
                    CacheService.set("proxy:hosts", hosts, null)
                    logger.debug("Synced ${hosts.size} proxy hosts to Redis")
                }
            } catch (e: Exception) {
                logger.warn("Failed to sync proxy hosts to Redis: ${e.message}", e)
            }
        }
    }

    /**
     * Migrates old proxy host format that may be missing the 'upstream' field.
     * Old entries had 'target' but not 'upstream', so we use 'target' as 'upstream'.
     */
    private fun migrateOldHostsFormat(content: String): MutableList<ProxyHost> {
        return try {
            if (content.isBlank()) {
                logger.debug("Hosts file content is empty, returning empty list")
                return emptyList<ProxyHost>().toMutableList()
            }

            // Parse as JSON array manually to migrate old entries
            val jsonArray = AppConfig.json.parseToJsonElement(content).jsonArray
            val migratedHosts = mutableListOf<ProxyHost>()

            for (jsonElement in jsonArray) {
                val jsonObject = jsonElement.jsonObject

                // Extract fields, handling missing 'upstream'
                val id = jsonObject["id"]?.jsonPrimitive?.content ?: ""
                val domain = jsonObject["domain"]?.jsonPrimitive?.content ?: ""
                val target = jsonObject["target"]?.jsonPrimitive?.content ?: ""
                val upstream = jsonObject["upstream"]?.jsonPrimitive?.content
                    ?: target // Use target as upstream if missing
                val ssl = jsonObject["ssl"]?.jsonPrimitive?.booleanOrNull ?: false
                val enabled = jsonObject["enabled"]?.jsonPrimitive?.booleanOrNull ?: true
                val customConfig = jsonObject["customConfig"]?.jsonPrimitive?.contentOrNull
                val websocketEnabled =
                    jsonObject["websocketEnabled"]?.jsonPrimitive?.booleanOrNull ?: false
                val allowedIps =
                    jsonObject["allowedIps"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }
                        ?: emptyList()
                val customSslPath = jsonObject["customSslPath"]?.jsonPrimitive?.contentOrNull
                val hstsEnabled = jsonObject["hstsEnabled"]?.jsonPrimitive?.booleanOrNull ?: false

                // Migrate paths if present
                val paths = jsonObject["paths"]?.jsonArray?.mapNotNull { pathElement ->
                    val pathObj = pathElement.jsonObject
                    PathRoute(
                        id = pathObj["id"]?.jsonPrimitive?.content
                        ?: UUID.randomUUID().toString(),
                        path = pathObj["path"]?.jsonPrimitive?.content ?: "",
                        target = pathObj["target"]?.jsonPrimitive?.content ?: "",
                        websocketEnabled = pathObj["websocketEnabled"]?.jsonPrimitive?.booleanOrNull
                            ?: false,
                        allowedIps = pathObj["allowedIps"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }
                            ?: emptyList(),
                        stripPrefix = pathObj["stripPrefix"]?.jsonPrimitive?.booleanOrNull ?: false,
                        customConfig = pathObj["customConfig"]?.jsonPrimitive?.contentOrNull,
                        enabled = pathObj["enabled"]?.jsonPrimitive?.booleanOrNull ?: true,
                        name = pathObj["name"]?.jsonPrimitive?.contentOrNull,
                        order = pathObj["order"]?.jsonPrimitive?.intOrNull ?: 0)
                } ?: emptyList()

                // Create migrated host - set upstream to null if it equals target (to avoid redundancy)
                val migratedHost = ProxyHost(
                    id = id,
                    domain = domain,
                    upstream = if (upstream == target) null else upstream,
                    target = target.ifEmpty { upstream }, // Use upstream if target is empty
                    ssl = ssl,
                    enabled = enabled,
                    customConfig = customConfig,
                    websocketEnabled = websocketEnabled,
                    allowedIps = allowedIps,
                    customSslPath = customSslPath,
                    hstsEnabled = hstsEnabled,
                    paths = paths
                )

                migratedHosts.add(migratedHost)
            }

            // Save migrated hosts back to file
            if (migratedHosts.isNotEmpty()) {
                saveHosts(migratedHosts)
                logger.info("Successfully migrated ${migratedHosts.size} proxy hosts to new format")
            }

            migratedHosts
        } catch (e: Exception) {
            logger.error("Failed to migrate old proxy hosts format, returning empty list", e)
            // Backup the corrupted file
            try {
                val backupFile = File(
                    hostsFile.parentFile,
                    "${hostsFile.nameWithoutExtension}.backup.${System.currentTimeMillis()}.json"
                )
                hostsFile.copyTo(backupFile, overwrite = true)
                logger.info("Created backup of corrupted hosts file: ${backupFile.name}")
            } catch (backupError: Exception) {
                logger.error("Failed to create backup of corrupted hosts file", backupError)
            }
            emptyList<ProxyHost>().toMutableList()
        }
    }

    private fun saveHosts(hosts: List<ProxyHost>) {
        hostsLock.writeLock().lock()
        try {
            // Ensure parent directory exists
            hostsFile.parentFile?.mkdirs()

            // 1. Save to Database first if active
            if (AppConfig.storageBackend == "database") {
                try {
                    val content = AppConfig.json.encodeToString(hosts)
                    transaction {
                        val existing = SettingsTable.selectAll().where { SettingsTable.key eq "PROXY_HOSTS" }.singleOrNull()
                        if (existing != null) {
                            SettingsTable.update({ SettingsTable.key eq "PROXY_HOSTS" }) { stmt ->
                                stmt[SettingsTable.value] = content
                                stmt[SettingsTable.updatedAt] = java.time.LocalDateTime.now()
                            }
                        } else {
                            SettingsTable.insert { stmt ->
                                stmt[SettingsTable.key] = "PROXY_HOSTS"
                                stmt[SettingsTable.value] = content
                                stmt[SettingsTable.updatedAt] = java.time.LocalDateTime.now()
                            }
                        }
                    }
                    logger.info("Proxy hosts saved to Database")
                } catch (e: Exception) {
                    logger.error("Failed to save proxy hosts to Database", e)
                }
            }

            // 2. Save to file as backup/legacy storage
            val saved = jsonPersistence.save(hosts)
            if (!saved) {
                val errorMsg = "Failed to save proxy hosts to ${hostsFile.absolutePath}"
                logger.error(errorMsg)
                if (AppConfig.storageBackend != "database") {
                    throw IllegalStateException(errorMsg)
                }
            }
            logger.debug("Synced ${hosts.size} proxy hosts to file backup at ${hostsFile.absolutePath}")

            // 3. If Redis is enabled, also sync to Redis
            if (CacheService.currentConfig.enabled) {
                try {
                    CacheService.set("proxy:hosts", hosts, null)
                    logger.debug("Synced ${hosts.size} proxy hosts to Redis")
                } catch (e: Exception) {
                    logger.warn("Failed to sync proxy hosts to Redis: ${e.message}", e)
                }
            }

            // 4. Update in-memory cache
            cachedHosts = hosts.toMutableList()
            logger.debug("Updated proxy hosts in memory cache and storage")

            // 5. Generate zones config for rate limiting
            generateZonesConfig(hosts)
        } finally {
            hostsLock.writeLock().unlock()
        }
    }

    private fun generateZonesConfig(hosts: List<ProxyHost>) {
        val zonesFile = File(AppConfig.nginxDir, "zones.conf")
        val sb = StringBuilder()
        sb.append("# Auto-generated zones configuration for rate limiting\n")

        for (host in hosts) {
            if (!host.enabled) continue
            
            host.rateLimit?.let { rl ->
                if (rl.enabled) {
                    val zoneName = "limit_${host.id.replace("-", "")}"
                    sb.append("limit_req_zone \$binary_remote_addr zone=$zoneName:10m rate=${rl.rate}r/${rl.period};\n")
                }
            }
            for (path in host.paths) {
                if (!path.enabled) continue
                path.rateLimit?.let { rl ->
                    if (rl.enabled) {
                        val zoneName = "limit_${path.id.replace("-", "")}"
                        sb.append("limit_req_zone \$binary_remote_addr zone=$zoneName:10m rate=${rl.rate}r/${rl.period};\n")
                    }
                }
            }
        }

        try {
            zonesFile.writeText(sb.toString())
            logger.debug("Generated zones.conf with rate limiting zones")
        } catch (e: Exception) {
            logger.error("Failed to write zones.conf", e)
        }
    }

    override fun listHosts(): List<ProxyHost> = loadHosts()

    private fun String.sanitizeNginx(): String {
        return this.replace(";", "").replace("{", "").replace("}", "").replace("\n", "").replace("\r", "").replace("#", "")
    }

    private fun validatePathRoute(pathRoute: PathRoute): Pair<Boolean, String> {
        if (pathRoute.path.isBlank()) {
            return false to "Path cannot be empty"
        }
        if (pathRoute.target.isBlank()) {
            return false to "Target cannot be empty"
        }

        // Prevent path traversal and risky characters in the path itself
        if (pathRoute.path.contains("..") || pathRoute.path.contains(";") || pathRoute.path.contains("{")) {
            return false to "Invalid characters in path"
        }

        if (pathRoute.isStatic) {
            // Validate as local path
            if (pathRoute.target.contains(";") || pathRoute.target.contains("{") || pathRoute.target.contains("\n")) {
                return false to "Invalid characters in static path"
            }
            // Basic path traversal check for static paths
            if (pathRoute.target.contains("..")) {
                return false to "Path traversal not allowed in static path"
            }
        } else {
            // Validate target URL format only for PROXY routes
            try {
                val uri = java.net.URI(pathRoute.target)
                if (uri.scheme == null || uri.host == null) {
                    return false to "Target URL must include scheme and host (e.g., http://backend:8080)"
                }
                if (pathRoute.target.contains("\n") || pathRoute.target.contains("\r")) {
                    return false to "Newlines not allowed in target URL"
                }
            } catch (e: Exception) {
                return false to "Invalid target URL format: ${e.message}"
            }
            
            // Validate custom Nginx config if present
            if (!pathRoute.customConfig.isNullOrBlank()) {
                 if (pathRoute.customConfig.contains("include ") || pathRoute.customConfig.contains("lua_file")) {
                     return false to "Include/Lua not allowed in custom config"
                 }
            }
        }
        return true to ""
    }

    private fun validateHostPaths(paths: List<PathRoute>): Pair<Boolean, String> {
        for (path in paths) {
            val validation = validatePathRoute(path)
            if (!validation.first) {
                return false to "Invalid path route '${path.name ?: path.path}': ${validation.second}"
            }
        }
        return true to ""
    }

    override fun createHost(host: ProxyHost): Pair<Boolean, String> {
        return try {
            // Validate required fields
            if (host.domain.isBlank()) {
                return false to "Domain is required"
            }
            if (host.target.isBlank()) {
                return false to "Target is required"
            }

            // Validate domain format (basic check)
            if (!host.domain.matches(Regex("^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$"))) {
                return false to "Invalid domain format"
            }
            if (host.domain.any { it.isISOControl() }) {
                return false to "Domain contains invalid characters"
            }

            // Validate target
            if (host.isStatic) {
                if (host.target.contains(";") || host.target.contains("{") || host.target.contains("\n")) {
                    return false to "Invalid characters in static path"
                }
                if (host.target.contains("..")) {
                    return false to "Path traversal not allowed in static path"
                }
            } else {
                // Validate upstream/target URL format (upstream defaults to target if not provided)
                val effectiveUpstream = host.effectiveUpstream
                if (effectiveUpstream.any { it.isISOControl() || it == '\n' || it == '\r' }) {
                    return false to "Upstream URL contains invalid characters"
                }
                try {
                    val upstreamUri = java.net.URI(effectiveUpstream)
                    if (upstreamUri.scheme == null || upstreamUri.host == null) {
                        return false to "Upstream must include scheme and host (e.g., http://backend:8080)"
                    }
                } catch (e: Exception) {
                    return false to "Invalid upstream URL format: ${e.message}"
                }

                if (host.target.any { it.isISOControl() || it == '\n' || it == '\r' }) {
                    return false to "Target URL contains invalid characters"
                }
                try {
                    val targetUri = java.net.URI(host.target)
                    if (targetUri.scheme == null || targetUri.host == null) {
                        return false to "Target must include scheme and host (e.g., http://backend:8080)"
                    }
                } catch (e: Exception) {
                    return false to "Invalid target URL format: ${e.message}"
                }
            }

            // Validate paths
            val pathValidation = validateHostPaths(host.paths)
            if (!pathValidation.first) {
                return pathValidation
            }

            val hosts = loadHosts()
            
            // Check for duplicate domain
            if (hosts.any { it.domain == host.domain && it.id != host.id }) {
                return false to "A proxy host with domain '${host.domain}' already exists"
            }

            val newHost =
                if (host.id.isEmpty()) host.copy(id = UUID.randomUUID().toString()) else host
            hosts.add(newHost)

            val result = generateConfigAndReload(newHost, hosts)
            if (!result.first) return result

            // Check if we fell back to HTTP due to missing certs
            if (result.second.startsWith("SSL Certificate missing")) {
                scope.launch { requestSSL(newHost.id) }
                return true to "Host created. Requesting SSL certificate in background..."
            }

            true to "Host created successfully"
        } catch (e: Exception) {
            logger.error("Error creating host", e)
            false to (e.message ?: "Unknown error")
        }
    }

    override fun deleteHost(id: String): Boolean {
        return try {
            val hosts = loadHosts()
            val host = hosts.find { it.id == id } ?: return false
            File(configDir, "${host.domain}.conf").delete()
            hosts.remove(host)
            try {
                saveHosts(hosts)
            } catch (e: Exception) {
                logger.error("Failed to save hosts when deleting", e)
                return false
            }
            val reloadResult = reloadNginx()
            if (!reloadResult.first) {
                if (reloadResult.second.contains("Proxy container is not running", ignoreCase = true)) {
                    logger.warn("Host deleted but proxy was not running (Nginx reload skipped)")
                    return true
                }
                logger.error("Failed to reload nginx when deleting host: ${reloadResult.second}")
                return false
            }
            true
        } catch (e: Exception) {
            logger.error("Error deleting host $id", e)
            false
        }
    }

    override fun updateHost(host: ProxyHost): Pair<Boolean, String> {
        return try {
            // Validate required fields
            if (host.domain.isBlank()) {
                return false to "Domain is required"
            }
            if (host.target.isBlank()) {
                return false to "Target is required"
            }

            // Validate domain format (Strict check including avoiding control chars)
            if (!host.domain.matches(Regex("^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$"))) {
                return false to "Invalid domain format"
            }
            if (host.domain.any { it.isISOControl() }) {
                return false to "Domain contains invalid characters"
            }

            // Validate target
            if (host.isStatic) {
                if (host.target.contains(";") || host.target.contains("{") || host.target.contains("\n")) {
                    return false to "Invalid characters in static path"
                }
                if (host.target.contains("..")) {
                    return false to "Path traversal not allowed in static path"
                }
            } else {
                // Validate upstream/target URL format (Prevent CRLF Injection)
                val effectiveUpstream = host.effectiveUpstream
                if (effectiveUpstream.any { it.isISOControl() || it == '\n' || it == '\r' }) {
                    return false to "Upstream URL contains invalid characters"
                }
                try {
                    val upstreamUri = java.net.URI(effectiveUpstream)
                    if (upstreamUri.scheme == null || upstreamUri.host == null) {
                        return false to "Upstream must include scheme and host (e.g., http://backend:8080)"
                    }
                } catch (e: Exception) {
                    return false to "Invalid upstream URL format: ${e.message}"
                }

                if (host.target.any { it.isISOControl() || it == '\n' || it == '\r' }) {
                    return false to "Target URL contains invalid characters"
                }
                try {
                    val targetUri = java.net.URI(host.target)
                    if (targetUri.scheme == null || targetUri.host == null) {
                        return false to "Target must include scheme and host (e.g., http://backend:8080)"
                    }
                } catch (e: Exception) {
                    return false to "Invalid target URL format: ${e.message}"
                }
            }

            // Validate paths
            val pathValidation = validateHostPaths(host.paths)
            if (!pathValidation.first) {
                return pathValidation
            }

            val hosts = loadHosts()
            val index = hosts.indexOfFirst { it.id == host.id }
            if (index == -1) return false to "Host not found"

            // Check for duplicate domain (excluding current host)
            if (hosts.any { it.domain == host.domain && it.id != host.id }) {
                return false to "A proxy host with domain '${host.domain}' already exists"
            }

            val oldHost = hosts[index]
            // If domain changed or disabled, remove old config
            if (oldHost.domain != host.domain || !host.enabled) {
                File(configDir, "${oldHost.domain}.conf").delete()
            }

            hosts[index] = host

            if (host.enabled) {
                val result = generateConfigAndReload(host, hosts)
                if (!result.first) return result

                // Check if we fell back to HTTP due to missing certs
                if (result.second.startsWith("SSL Certificate missing")) {
                    scope.launch { requestSSL(host.id) }
                    return true to "Host updated. Requesting SSL certificate in background..."
                }
            } else {
                try {
                    saveHosts(hosts)
                } catch (e: Exception) {
                    logger.error("Failed to save hosts when updating", e)
                    return false to "Failed to save proxy hosts: ${e.message}"
                }
                val reloadResult = reloadNginx()
                if (!reloadResult.first) {
                    logger.error("Failed to reload nginx when updating host: ${reloadResult.second}")
                    return false to "Config saved, but failed to reload nginx: ${reloadResult.second}"
                }
            }

            true to "Host updated successfully"
        } catch (e: Exception) {
            logger.error("Error updating host", e)
            false to (e.message ?: "Unknown error")
        }
    }

    private fun generateConfigAndReload(
        host: ProxyHost,
        hosts: MutableList<ProxyHost>,
    ): Pair<Boolean, String> {
        val configResult = generateNginxConfig(host)
        if (!configResult.first) return configResult
        
        // Save hosts first
        try {
            saveHosts(hosts)
        } catch (e: Exception) {
            logger.error("Failed to save proxy hosts", e)
            return false to "Failed to save proxy hosts: ${e.message}"
        }
        
        // Ensure proxy container exists before reloading
        if (!ensureProxyContainerExists()) {
            logger.warn("Proxy container does not exist, but config was generated and saved")
            return true to "Config generated and saved, but proxy container is not running. Please start the proxy container."
        }
        
        // Reload nginx
        val reloadResult = reloadNginx()
        if (!reloadResult.first) {
            logger.error("Failed to reload nginx: ${reloadResult.second}")
            return false to "Config generated and saved, but failed to reload nginx: ${reloadResult.second}"
        }
        
        return configResult
    }

    override fun toggleHost(id: String): Boolean {
        return try {
            val hosts = loadHosts()
            val index = hosts.indexOfFirst { it.id == id }
            if (index == -1) return false

            val updated = hosts[index].copy(enabled = !hosts[index].enabled)
            hosts[index] = updated

            if (updated.enabled) {
                val result = generateConfigAndReload(updated, hosts)
                if (!result.first) {
                    logger.error("Failed to toggle host $id: ${result.second}")
                    return false
                }
            } else {
                File(configDir, "${updated.domain}.conf").delete()
                try {
                    saveHosts(hosts)
                } catch (e: Exception) {
                    logger.error("Failed to save hosts when toggling", e)
                    return false
                }
                val reloadResult = reloadNginx()
                if (!reloadResult.first) {
                    if (reloadResult.second.contains("Proxy container is not running", ignoreCase = true)) {
                        logger.warn("Host disabled but proxy was not running (Nginx reload skipped)")
                        return true
                    }
                    logger.error("Failed to reload nginx when toggling host: ${reloadResult.second}")
                    return false
                }
            }
            true
        } catch (e: Exception) {
            logger.error("Error toggling host $id", e)
            false
        }
    }

    override fun requestSSL(id: String): Boolean {
        val hosts = loadHosts()
        val index = hosts.indexOfFirst { it.id == id }
        if (index == -1) return false
        val host = hosts[index]

        return sslService.requestSSL(host) { updated ->
            hosts[index] = updated
            saveHosts(hosts)
            generateNginxConfig(updated).first && reloadNginx().first
        }
    }

    override fun listCertificates(): List<SSLCertificate> {
        return sslService.listCertificates()
    }

    private fun executeCommand(command: String): String {
        return commandExecutor.execute(command).output
    }

    private fun getLoggingReplacements(tag: String): Map<String, String> {
        val settings = AppConfig.settings
        val rsyslogEnabled = settings.proxyRsyslogEnabled
        val syslogServer = "${settings.syslogServer}:${settings.syslogPort}"

        val standardLoggingConfig = run {
            val template = getCachedTemplate("templates/proxy/standard-logging.conf")
            val snippet = ResourceLoader.replacePlaceholders(template, mapOf("tag" to tag))
            snippet.lines().joinToString("\n    ") { it }
        }

        val syslogConfig = if (rsyslogEnabled) {
            val template = getCachedTemplate("templates/proxy/rsyslog-config.conf")
            val snippet = ResourceLoader.replacePlaceholders(template, mapOf(
                "syslogServer" to syslogServer,
                "tag" to tag
            ))
            snippet.lines().joinToString("\n    ") { it }
        } else ""

        val dangerHitsConfig = run {
            val template = getCachedTemplate("templates/proxy/danger-logging.conf")
            val snippet = ResourceLoader.replacePlaceholders(template, mapOf(
                "syslogServer" to syslogServer,
                "tag" to tag
            ))
            snippet.lines().joinToString("\n    ") { it }
        }

        val burstLoggingConfig = run {
            val template = getCachedTemplate("templates/proxy/burst-logging.conf")
            val snippet = ResourceLoader.replacePlaceholders(template, mapOf(
                "syslogServer" to syslogServer,
                "tag" to tag
            ))
            snippet.lines().joinToString("\n    ") { it }
        }

        return mapOf(
            "standardLoggingConfig" to standardLoggingConfig,
            "rsyslogConfig" to syslogConfig,
            "dangerHitsConfig" to dangerHitsConfig,
            "burstLoggingConfig" to burstLoggingConfig
        )
    }

    private fun generateNginxConfig(host: ProxyHost): Pair<Boolean, String> {
        // Load websocket config if enabled
        val wsConfigRaw = if (host.websocketEnabled) {
            getCachedTemplate("templates/proxy/websocket-config.conf")
        } else ""

        // Indent websocket config for use in location blocks (8 spaces)
        val wsConfig = if (wsConfigRaw.isNotEmpty()) {
            wsConfigRaw.lines().joinToString("\n        ") { it.trim() }
        } else ""

        // Generate IP restrictions
        val ipConfig = if (host.allowedIps.isNotEmpty()) {
            host.allowedIps.joinToString("\n        ") { "allow $it;" } + "\n        deny all;"
        } else ""

        // Generate Rate Limiting config (server level - 4 spaces)
        val serverRateLimit = host.rateLimit?.let { rl ->
            if (rl.enabled) {
                val zoneName = "limit_${host.id.replace("-", "")}"
                "    limit_req zone=$zoneName burst=${rl.burst}${if (rl.nodelay) " nodelay" else ""};"
            } else ""
        } ?: ""

        // Generate path-based location blocks
        val pathLocations = generatePathLocations(host.paths, wsConfig)

        // Generate Main Location Config (for /)
        fun generateMainLocationConfig(isHttps: Boolean, redirect: String = ""): String {
            if (host.underConstruction) {
                val pageId = host.underConstructionPageId ?: ""
                return """
                    |        ${redirect}root /var/www/html;
                    |        index pages/${pageId}.html;
                    |        try_files /pages/${pageId}.html =404;
                    |        ${ipConfig}
                """.trimMargin().trim()
            }

            val safeTarget = host.target.sanitizeNginx()
            if (host.isStatic) {
                return """
                    |        ${redirect}root ${safeTarget.trimEnd('/')};
                    |        index index.html index.htm;
                    |        try_files ${'$'}uri ${'$'}uri/ =404;
                    |        ${ipConfig}
                """.trimMargin().trim()
            } else {
                if (isHttps) {
                    return """
                        |        proxy_pass ${safeTarget};
                        |        
                        |        # Upstream Keepalive & Websocket Support
                        |        proxy_http_version 1.1;
                        |        proxy_set_header Upgrade ${'$'}http_upgrade;
                        |        proxy_set_header Connection ${'$'}connection_upgrade;
                        |        
                        |        # Proxy Headers
                        |        proxy_set_header Host ${'$'}host;
                        |        proxy_set_header X-Real-IP ${'$'}remote_addr;
                        |        proxy_set_header X-Forwarded-For ${'$'}proxy_add_x_forwarded_for;
                        |        proxy_set_header X-Forwarded-Proto ${'$'}scheme;
                        |
                        |        # Performance Tuning
                        |        proxy_buffers 8 16k;
                        |        proxy_buffer_size 32k;
                        |
                        |        ${wsConfig}
                        |        ${ipConfig}
                    """.trimMargin().trim()
                } else {
                    val proxyTemplate = getCachedTemplate("templates/proxy/http-proxy-config.conf")
                    val proxyContent = ResourceLoader.replacePlaceholders(
                        proxyTemplate, mapOf(
                            "target" to safeTarget,
                            "websocketConfig" to wsConfig,
                            "ipRestrictions" to ipConfig,
                            "rateLimitConfig" to ""
                        )
                    )
                    val indentedProxy = proxyContent.lines()
                        .joinToString("\n") { if (it.isBlank()) it else "        $it" }.trim()
                    return if (redirect.isNotEmpty()) "${redirect}${indentedProxy}" else indentedProxy
                }
            }
        }

        val silentDropConfig = if (host.silentDrop) {
            val template = getCachedTemplate("templates/proxy/silent-drop.conf")
            template.lines().joinToString("\n    ") { it }
        } else ""

        // Generate Logging Config Replacements
        val loggingReplacements = getLoggingReplacements(host.domain)

        // Generate HTTPS server block if SSL is enabled
        val sslConfig = if (host.ssl) {
            val (hostCert, hostKey) = resolveSslCertPaths(host)
            val hostCertFile = File(hostCert)
            val hostKeyFile = File(hostKey)

            if (!hostCertFile.exists() || !hostKeyFile.exists()) {
                logger.warn("SSL fallback for ${host.domain}: Host files missing or inaccessible.")
                // Recursive call with SSL disabled
                return generateNginxConfig(host.copy(ssl = false)).copy(second = "SSL Certificate missing on disk (checked ${hostCertFile.parent})")
            }

            val containerCert = translateToContainerPath(hostCert)
            val containerKey = translateToContainerPath(hostKey)
            val hstsHeader = if (host.hstsEnabled) "add_header Strict-Transport-Security \"max-age=31536000; includeSubDomains\" always;" else ""

            val httpsTemplate = getCachedTemplate("templates/proxy/server-https.conf")
            val replacements = loggingReplacements.toMutableMap().apply {
                put("domain", host.domain)
                put("sslCert", containerCert)
                put("sslKey", containerKey)
                put("hstsHeader", hstsHeader)
                put("target", host.target)
                put("websocketConfig", wsConfig)
                put("ipRestrictions", ipConfig)
                put("pathLocations", pathLocations)
                put("rateLimitConfig", if (host.paths.isEmpty()) serverRateLimit else "")
                put("mainLocationConfig", generateMainLocationConfig(true))
                put("silentDropConfig", silentDropConfig)
            }
            ResourceLoader.replacePlaceholders(httpsTemplate, replacements)
        } else ""

        // Generate HTTP server block
        val httpRedirect = if (host.ssl) "        return 301 https://\$host\$request_uri;\n" else ""
        val httpTemplate = getCachedTemplate("templates/proxy/server-http.conf")
        val httpReplacements = loggingReplacements.toMutableMap().apply {
            put("domain", host.domain)
            put("pathLocations", pathLocations)
            put("rateLimitConfig", if (host.ssl || host.paths.isNotEmpty()) "" else serverRateLimit)
            put("mainLocationConfig", generateMainLocationConfig(false, httpRedirect))
            put("silentDropConfig", silentDropConfig)
        }
        val httpConfig = ResourceLoader.replacePlaceholders(httpTemplate, httpReplacements)

        val finalConfig = "$httpConfig\n\n$sslConfig".trim()

        return try {
            File(configDir, "${host.domain}.conf").writeText(finalConfig)
            true to "Config generated"
        } catch (e: Exception) {
            logger.error("Failed to generate nginx config for ${host.domain}", e)
            false to "Failed to write config: ${e.message}"
        }
    }

    private fun generatePathLocations(paths: List<PathRoute>, defaultWsConfig: String): String {
        // Filter out disabled paths
        val enabledPaths = paths.filter { it.enabled }
        if (enabledPaths.isEmpty()) return ""

        // Ensure all paths start with /
        val normalizedPaths = enabledPaths.map { route ->
            val normalizedPath = if (route.path.startsWith("/")) route.path else "/${route.path}"
            route.copy(path = normalizedPath)
        }

        // Sort paths by order (higher first), then by specificity (longer/more specific paths first)
        // This ensures paths with explicit ordering are matched first, then by specificity
        val sortedPaths =
            normalizedPaths.sortedWith(compareByDescending<PathRoute> { it.order }.thenByDescending { it.path.length })

        return sortedPaths.joinToString("\n\n") { pathRoute ->
            val safePath = pathRoute.path.sanitizeNginx()
            val safeTarget = pathRoute.target.sanitizeNginx()

            val ipConfig = if (pathRoute.allowedIps.isNotEmpty()) {
                pathRoute.allowedIps.joinToString("\n        ") { "allow ${it.sanitizeNginx()};" } + "\n        deny all;"
            } else ""

            // Generate Rate Limiting config for this path (indented 8 spaces)
            val rateLimitConfig = pathRoute.rateLimit?.let { rl ->
                if (rl.enabled) {
                    val zoneName = "limit_${pathRoute.id.replace("-", "")}"
                    "        limit_req zone=$zoneName burst=${rl.burst}${if (rl.nodelay) " nodelay" else ""};"
                } else ""
            } ?: ""

            // Custom config for this path
            val customConfig = pathRoute.customConfig?.let { config ->
                config.lines().joinToString("\n        ") { it.trim() }
            } ?: ""

            if (pathRoute.isStatic) {
                val staticTemplate = getCachedTemplate("templates/proxy/static-location-block.conf")
                ResourceLoader.replacePlaceholders(
                    staticTemplate, mapOf(
                        "path" to safePath,
                        "staticPath" to safeTarget.trimEnd('/'),
                        "ipRestrictions" to ipConfig,
                        "customConfig" to customConfig,
                        "rateLimitConfig" to rateLimitConfig
                    )
                )
            } else {
                // Load websocket config if enabled for this path
                val wsConfigRaw = if (pathRoute.websocketEnabled) {
                    getCachedTemplate("templates/proxy/websocket-config.conf")
                } else ""

                val wsConfig = if (wsConfigRaw.isNotEmpty()) {
                    wsConfigRaw.lines().joinToString("\n        ") { it.trim() }
                } else ""

                // Determine proxy_pass directive
                val proxyPass = if (pathRoute.stripPrefix) {
                    // Remove the path prefix before forwarding
                    val targetUrl = safeTarget.trimEnd('/')
                    "proxy_pass $targetUrl/;"
                } else {
                    // Keep the path prefix
                    val targetUrl = safeTarget.trimEnd('/')
                    "proxy_pass $targetUrl\$request_uri;"
                }

                val locationTemplate = getCachedTemplate("templates/proxy/location-block.conf")
                ResourceLoader.replacePlaceholders(
                    locationTemplate, mapOf(
                        "path" to safePath,
                        "proxyPass" to proxyPass,
                        "websocketConfig" to wsConfig,
                        "ipRestrictions" to ipConfig,
                        "customConfig" to customConfig,
                        "rateLimitConfig" to rateLimitConfig
                    )
                )
            }
        }
    }

    private fun reloadNginx(): Pair<Boolean, String> {
        return try {
            logger.info("Reloading Nginx...")
            
            // Check if container is running first
            val checkCmd = "${AppConfig.dockerCommand} ps --filter name=$PROXY_CONTAINER_NAME --filter status=running --format '{{.Names}}'"
            val runningCheck = executeCommand(checkCmd).trim()
            if (runningCheck != PROXY_CONTAINER_NAME) {
                return false to "Proxy container is not running"
            }
            
            val reloadCmd = "${AppConfig.dockerCommand} exec $PROXY_CONTAINER_NAME openresty -s reload"
            val result = executeCommand(reloadCmd)
            
            // Check if reload was successful (nginx reload returns empty string on success)
            // Also check for common error patterns
            if (result.contains("error", ignoreCase = true) || 
                result.contains("failed", ignoreCase = true) ||
                result.contains("invalid", ignoreCase = true)) {
                logger.error("Nginx reload failed: $result")
                return false to result.ifBlank { "Nginx reload failed" }
            }
            
            if (result.isNotBlank()) {
                logger.info("Nginx Reload Output: $result")
            } else {
                logger.info("Nginx reloaded successfully")
            }
            
            true to "Nginx reloaded successfully"
        } catch (e: Exception) {
            logger.error("Error reloading nginx", e)
            false to "Error reloading nginx: ${e.message}"
        }
    }

    // ========== Proxy Container Management ==========

    companion object {
        const val PROXY_CONTAINER_NAME = "docker-manager-proxy"
        const val PROXY_IMAGE_NAME = "docker-manager-proxy"
        const val PROXY_IMAGE_TAG = "latest"
    }

    override fun buildProxyImage(): Pair<Boolean, String> {
        return try {
            logger.info("Building proxy Docker image using compose...")
            // Ensure we have the latest nginx.conf before building, as it's mounted
            ensureNginxMainConfig(forceOverwrite = true)
            
            // Re-generate config files for all enabled hosts
            logger.info("Regenerating config files for all enabled hosts...")
            val hosts = loadHosts()
            for (host in hosts) {
                if (host.enabled) {
                    val configResult = generateNginxConfig(host)
                    if (!configResult.first) {
                        logger.warn("Failed to generate config for ${host.domain} during build: ${configResult.second}")
                    } else {
                        logger.debug("Regenerated config for ${host.domain}")
                    }
                }
            }
            
            val composeFile = ensureComposeFile()
            val buildCmd =
                "${AppConfig.dockerComposeCommand} -f ${composeFile.absolutePath} build proxy"

            val env = mutableMapOf<String, String>()
            env["DOCKER_BUILDKIT"] = if (AppConfig.settings.dockerBuildKit) "1" else "0"
            env["COMPOSE_DOCKER_CLI_BUILD"] = if (AppConfig.settings.dockerCliBuild) "1" else "0"

            val result = executeComposeCommand(buildCmd, truncateOutput = true, env = env)
            if (result.exitCode == 0) {
                logger.info("Proxy image built successfully")
                true to "Proxy image built successfully\n${result.output}"
            } else {
                logger.error("Failed to build proxy image. Exit code: ${result.exitCode}")
                false to "Failed to build proxy image. Exit code: ${result.exitCode}\n${result.output}"
            }
        } catch (e: Exception) {
            logger.error("Error building proxy image", e)
            false to "Error building proxy image: ${e.message}"
        }
    }

    override fun createProxyContainer(): Pair<Boolean, String> {
        return try {
            logger.info("Creating proxy container using compose...")
            ensureComposeFile()
            ensureProxyDirectories()

            val result =
                executeComposeCommand("${AppConfig.dockerComposeCommand} up --no-start proxy")
            if (result.exitCode == 0) {
                logger.info("Proxy container created successfully")
                true to "Proxy container created successfully\n${result.output}"
            } else {
                logger.error("Failed to create proxy container. Exit code: ${result.exitCode}")
                false to "Failed to create proxy container. Exit code: ${result.exitCode}\n${result.output}"
            }
        } catch (e: Exception) {
            logger.error("Error creating proxy container", e)
            false to "Error creating proxy container: ${e.message}"
        }
    }

    override fun startProxyContainer(): Pair<Boolean, String> {
        return executeContainerCommand("start", "Starting", "started")
    }

    override fun stopProxyContainer(): Pair<Boolean, String> {
        return executeContainerCommand("stop", "Stopping", "stopped")
    }

    override fun restartProxyContainer(): Pair<Boolean, String> {
        return executeContainerCommand("restart", "Restarting", "restarted")
    }

    private fun executeContainerCommand(
        action: String,
        actionPresent: String,
        actionPast: String,
    ): Pair<Boolean, String> {
        return try {
            logger.info("$actionPresent proxy container using compose...")
            ensureComposeFile()

            val result = executeComposeCommand("${AppConfig.dockerComposeCommand} $action proxy")
            if (result.exitCode == 0) {
                logger.info("Proxy container $actionPast successfully")
                true to "Proxy container $actionPast successfully"
            } else {
                logger.error("Failed to $action proxy container. Exit code: ${result.exitCode}")
                false to "Failed to $action proxy container. Exit code: ${result.exitCode}\n${result.output}"
            }
        } catch (e: Exception) {
            logger.error("Error ${action}ing proxy container", e)
            false to "Error ${action}ing proxy container: ${e.message}"
        }
    }

    private fun executeComposeCommand(
        command: String,
        truncateOutput: Boolean = false,
        env: Map<String, String> = emptyMap()
    ): ExecuteResult {
        val processBuilder = ProcessBuilder("sh", "-c", command).directory(proxyDockerComposeDir)
            .redirectErrorStream(true)

        // Add extra environment variables
        if (env.isNotEmpty()) {
            processBuilder.environment().putAll(env)
        }

        val process = processBuilder.start()
        val outputFull = process.inputStream.bufferedReader().readText()
        val exitCode = process.waitFor()

        val output = if (truncateOutput && outputFull.length > 10000) {
            " (Truncated...)\n" + outputFull.takeLast(10000)
        } else {
            outputFull
        }

        return ExecuteResult(output, "", exitCode)
    }

    private fun ensureProxyDirectories() {
        val nginxDir = AppConfig.nginxDir
        val certbotDir = AppConfig.certbotDir

        nginxDir.mkdirs()
        File(nginxDir, "conf.d").mkdirs()

        val logsDir = File(nginxDir, "logs")
        logsDir.mkdirs()
        logsDir.setWritable(true, false)
        logsDir.setReadable(true, false)
        logsDir.setExecutable(true, false)

        ensureLogFile(File(logsDir, "access.log"))
        ensureLogFile(File(logsDir, "error.log"))

        certbotDir.mkdirs()
        File(certbotDir, "conf").mkdirs()
        File(certbotDir, "www").mkdirs()

        // Create www/html directory for default page
        val wwwHtmlDir = File(nginxDir, "www/html")
        wwwHtmlDir.mkdirs()

        ensureNginxMainConfig()
        ensureDefaultServer()
        generateZonesConfig(loadHosts()) // Ensure zones.conf exists before proxy starts
        ensureDefaultPage(wwwHtmlDir)
    }

    private fun ensureLogFile(logFile: File) {
        if (!logFile.exists()) {
            logFile.createNewFile()
        }
        logFile.setWritable(true, false)
        logFile.setReadable(true, false)
    }

    override fun getProxyContainerStatus(): ProxyContainerStatus {
        return try {
            // Check if container exists
            val existsCmd =
                "${AppConfig.dockerCommand} ps -a --filter name=$PROXY_CONTAINER_NAME --format '{{.Names}}'"
            val exists = executeCommand(existsCmd).trim() == PROXY_CONTAINER_NAME

            if (!exists) {
                return ProxyContainerStatus(
                    exists = false,
                    running = false,
                    imageExists = checkImageExists(),
                    containerId = null,
                    status = "not created",
                    uptime = null
                )
            }

            // Get container details
            val inspectCmd =
                "${AppConfig.dockerCommand} inspect $PROXY_CONTAINER_NAME --format '{{.Id}}|{{.State.Running}}|{{.State.Status}}|{{.State.StartedAt}}'"
            val inspectOutput = executeCommand(inspectCmd).trim()

            if (inspectOutput.isBlank()) {
                return ProxyContainerStatus(
                    exists = exists,
                    running = false,
                    imageExists = checkImageExists(),
                    containerId = null,
                    status = "unknown",
                    uptime = null
                )
            }

            val parts = inspectOutput.split("|")
            val containerId = parts.getOrNull(0)
            val running = parts.getOrNull(1)?.toBoolean() ?: false
            val status = parts.getOrNull(2) ?: "unknown"
            val startedAt = parts.getOrNull(3)

            ProxyContainerStatus(
                exists = true,
                running = running,
                imageExists = checkImageExists(),
                containerId = containerId,
                status = status,
                uptime = startedAt
            )
        } catch (e: Exception) {
            logger.error("Error getting proxy container status", e)
            ProxyContainerStatus(
                exists = false,
                running = false,
                imageExists = false,
                containerId = null,
                status = "error: ${e.message}",
                uptime = null
            )
        }
    }

    override fun ensureProxyContainerExists(): Boolean {
        return try {
            logger.info("Ensuring proxy container is ready (using compose up -d)...")
            ensureComposeFile()
            ensureProxyDirectories()

            val result = executeComposeCommand("${AppConfig.dockerComposeCommand} up -d proxy")
            if (result.exitCode == 0) {
                logger.info("Proxy container is ready via compose")
                true
            } else {
                logger.error("Failed to ensure proxy container. Exit code: ${result.exitCode}\n${result.output}")
                false
            }
        } catch (e: Exception) {
            logger.error("Error ensuring proxy container exists", e)
            false
        }
    }

    override fun getComposeConfig(): String {
        return ensureComposeFile().readText()
    }



    override fun resetComposeConfig(): Pair<Boolean, String> {
        return try {
            val composeFile = File(proxyDockerComposeDir, "docker-compose.yml")
            val dockerfile = File(proxyDockerComposeDir, "Dockerfile.proxy")
            
            logger.info("Resetting proxy compose configuration...")
            composeFile.writeText(getDefaultComposeConfig())
            dockerfile.writeText(getDefaultDockerfileConfig())
            
            true to "Reset compose configuration to defaults"
        } catch (e: Exception) {
            logger.error("Error resetting compose config", e)
            false to (e.message ?: "Unknown error")
        }
    }

    private fun getDefaultComposeConfig(): String {
        val template = getCachedTemplate("templates/proxy/docker-compose.yml")
        return ResourceLoader.replacePlaceholders(
            template, mapOf(
                "nginxPath" to nginxPath,
                "certbotPath" to certbotPath,
                "customCertsPath" to customCertsPath
            )
        )
    }

    private fun getDefaultDockerfileConfig(): String {
        return getCachedTemplate("templates/proxy/Dockerfile.proxy")
    }

    private fun ensureComposeFile(): File {

        val composeFile = File(proxyDockerComposeDir, "docker-compose.yml")
        if (!composeFile.exists()) {
            logger.info("Creating default docker-compose.yml in ${proxyDockerComposeDir.absolutePath}")
            composeFile.writeText(getDefaultComposeConfig())
        }
        ensureDockerfile()
        return composeFile
    }

    private fun ensureDockerfile(): File {

        val dockerfile = File(proxyDockerComposeDir, "Dockerfile.proxy")
        if (!dockerfile.exists()) {
            logger.info("Creating default Dockerfile.proxy in ${proxyDockerComposeDir.absolutePath}")
            dockerfile.writeText(getDefaultDockerfileConfig())
        }
        return dockerfile
    }

    private fun translateToContainerPath(hostPath: String): String {
        val path = File(hostPath).absolutePath

        // Map dataRoot/certbot/conf -> /etc/letsencrypt
        val certbotConfHost = File(AppConfig.certbotDir, "conf").absolutePath
        if (path.startsWith(certbotConfHost)) {
            return path.replace(certbotConfHost, "/etc/letsencrypt")
        }

        // Map dataRoot/certs -> /etc/nginx/custom_certs
        val customCertHost = AppConfig.customCertDir.absolutePath
        if (path.startsWith(customCertHost)) {
            return path.replace(customCertHost, "/etc/nginx/custom_certs")
        }

        // If already a container path mentioned in custom path
        if (path.startsWith("/etc/letsencrypt") || path.startsWith("/etc/nginx/custom_certs")) {
            return path
        }

        return hostPath
    }

    private fun resolveSslCertPaths(host: ProxyHost): Pair<String, String> {
        return sslService.resolveSslCertPaths(host)
    }

    private fun ensureNginxMainConfig(forceOverwrite: Boolean = false) {
        val nginxConf = File(AppConfig.nginxDir, "nginx.conf")
        var shouldUpdate = forceOverwrite || !nginxConf.exists()

        if (!shouldUpdate) {
            val content = nginxConf.readText()
            // Check for critical new definitions that might be missing in old configs
            if (!content.contains("\$is_allowed") || !content.contains("\$connection_upgrade") || !content.contains("syslog:server")) {
                logger.info("Critical variables or syslog missing in nginx.conf (migration needed)")
                shouldUpdate = true
            }
        }

        if (shouldUpdate) {
            logger.info("Creating/Updating default nginx.conf in ${nginxConf.absolutePath}")
            nginxConf.writeText(getDefaultNginxConfig())
        }

        // Always ensure zones.conf exists, even if empty
        val zonesFile = File(AppConfig.nginxDir, "zones.conf")
        if (!zonesFile.exists()) {
            generateZonesConfig(loadHosts())
        }
    }

    private fun getDefaultNginxConfig(): String {
        val template = getCachedTemplate("templates/proxy/nginx.conf")
        val settings = AppConfig.settings
        val rsyslogEnabled = settings.proxyRsyslogEnabled
        
        val loggingConfig = StringBuilder()
        
        val standardLoggingTemplate = getCachedTemplate("templates/proxy/standard-logging.conf")
        val standardLoggingSnippet = ResourceLoader.replacePlaceholders(standardLoggingTemplate, mapOf(
            "tag" to "nginx_main"
        ))
        loggingConfig.append("    ")
        loggingConfig.append(standardLoggingSnippet.lines().joinToString("\n    ") { it })
        
        if (rsyslogEnabled) {
            val syslogServer = "${settings.syslogServer}:${settings.syslogPort}"
            
            val syslogTemplate = getCachedTemplate("templates/proxy/rsyslog-config.conf")
            val syslogSnippet = ResourceLoader.replacePlaceholders(syslogTemplate, mapOf(
                "syslogServer" to syslogServer,
                "tag" to "nginx_main"
            ))
            
            loggingConfig.append("\n\n    ")
            loggingConfig.append(syslogSnippet.lines().joinToString("\n    ") { it })
        }
        
        return ResourceLoader.replacePlaceholders(template, mapOf(
            "loggingConfig" to loggingConfig.toString()
        ))
    }

    /**
     * Ensures the default server block is created for unmatched requests.
     * This provides a friendly landing page when no proxy host matches.
     * File is named with 'zz-' prefix to ensure it loads last (nginx loads configs alphabetically).
     */
    private fun ensureDefaultServer() {
        val defaultServerFile = File(configDir, "zz-default-server.conf")
        try {
            val settings = AppConfig.settings
            val templateName = if (settings.proxyDefaultReturn404) {
                "templates/proxy/default-server-404.conf"
            } else {
                "templates/proxy/default-server.conf"
            }
            
            val defaultServerTemplate = getCachedTemplate(templateName)
            val loggingReplacements = getLoggingReplacements("default_server")

            val finalContent = ResourceLoader.replacePlaceholders(
                defaultServerTemplate, loggingReplacements
            )

            // Allow overwriting if content changed (simple check: always write)
            defaultServerFile.writeText(finalContent)
            logger.info("Updated default nginx server block: ${defaultServerFile.absolutePath} (Return 404: ${settings.proxyDefaultReturn404})")
        } catch (e: Exception) {
            logger.error("Failed to create/update default server block", e)
        }
    }

    /**
     * Ensures the default HTML page exists for the default server.
     */
    private fun ensureDefaultPage(wwwHtmlDir: File) {
        val indexFile = File(wwwHtmlDir, "index.html")
        if (!indexFile.exists()) {
            try {
                val defaultPageTemplate =
                    getCachedTemplate("templates/proxy/default-index.html")
                indexFile.writeText(defaultPageTemplate)
                logger.info("Created default HTML page: ${indexFile.absolutePath}")
            } catch (e: Exception) {
                logger.error("Failed to create default HTML page", e)
            }
        }
    }

    override fun updateComposeConfig(content: String): Pair<Boolean, String> {
        return try {
            val composeFile = File(proxyDockerComposeDir, "docker-compose.yml")
            composeFile.writeText(content)
            true to "Compose configuration updated"
        } catch (e: Exception) {
            false to "Failed to update compose configuration: ${e.message}"
        }
    }

    override fun updateStatsSettings(active: Boolean, intervalMs: Long, filterLocalIps: Boolean?) {
        AnalyticsService.updateStatsSettings(active, intervalMs, filterLocalIps)
    }

    override fun getHistoricalStats(date: String): DailyProxyStats? {
        return AnalyticsService.getHistoricalStats(date)
    }

    override fun forceReprocessLogs(date: String): DailyProxyStats? {
        return AnalyticsService.forceReprocessLogs(date)
    }

    override fun updateStatsForAllDaysInCurrentLog(): Map<String, Boolean> {
        return AnalyticsService.updateStatsForAllDaysInCurrentLog()
    }

    override fun listAvailableDates(): List<String> {
        return AnalyticsService.listAvailableDates()
    }

    override fun getStatsForDateRange(startDate: String, endDate: String): List<DailyProxyStats> {
        return AnalyticsService.getStatsForDateRange(startDate, endDate)
    }

    private fun checkImageExists(): Boolean {
        return try {
            // First check if container exists - if it does, the image must exist
            val containerExistsCmd = "${AppConfig.dockerCommand} ps -a --filter name=$PROXY_CONTAINER_NAME --format '{{.Names}}'"
            val containerExists = executeCommand(containerExistsCmd).trim() == PROXY_CONTAINER_NAME
            
            if (containerExists) {
                // Container exists, so image must exist
                return true
            }
            
            // Check for the image using the actual image name (use Kotlin string interpolation, not shell variables)
            val imageName = "$PROXY_IMAGE_NAME:$PROXY_IMAGE_TAG"
            val cmd = "${AppConfig.dockerCommand} images -q $imageName"
            val output = executeCommand(cmd).trim()
            output.isNotBlank()
        } catch (e: Exception) {
            logger.error("Error checking if image exists", e)
            false
        }
    }

    // ========== DNS Config Management ==========

    private val dnsConfigsFile = File(configDir, "dns-configs.json")
    private val dnsConfigPersistence = JsonPersistence.create<List<DnsConfig>>(
        file = dnsConfigsFile,
        defaultContent = emptyList(),
        loggerName = ProxyServiceImpl::class.java.name
    )

    override fun listDnsConfigs(): List<DnsConfig> {
        return dnsConfigPersistence.load()
    }

    override fun getDnsConfig(id: String): DnsConfig? {
        return listDnsConfigs().find { it.id == id }
    }

    override fun createDnsConfig(config: DnsConfig): Pair<Boolean, String> {
        return try {
            if (config.name.isBlank()) {
                return false to "Name is required"
            }
            if (config.provider.isBlank()) {
                return false to "Provider is required"
            }

            val configs = listDnsConfigs().toMutableList()
            val newConfig = config.copy(
                id = UUID.randomUUID().toString(),
                createdAt = System.currentTimeMillis()
            )
            configs.add(newConfig)
            dnsConfigPersistence.save(configs)
            true to "DNS config created"
        } catch (e: Exception) {
            logger.error("Error creating DNS config", e)
            false to "Error creating DNS config: ${e.message}"
        }
    }

    override fun updateDnsConfig(config: DnsConfig): Pair<Boolean, String> {
        return try {
            if (config.id.isBlank()) {
                return false to "Config ID is required"
            }
            if (config.name.isBlank()) {
                return false to "Name is required"
            }

            val configs = listDnsConfigs().toMutableList()
            val index = configs.indexOfFirst { it.id == config.id }
            if (index == -1) {
                return false to "DNS config not found"
            }
            configs[index] = config
            dnsConfigPersistence.save(configs)
            true to "DNS config updated"
        } catch (e: Exception) {
            logger.error("Error updating DNS config", e)
            false to "Error updating DNS config: ${e.message}"
        }
    }

    override fun deleteDnsConfig(id: String): Pair<Boolean, String> {
        return try {
            // Check if any host is using this config
            val hostsUsingConfig = listHosts().filter { it.dnsConfigId == id }
            if (hostsUsingConfig.isNotEmpty()) {
                val domains = hostsUsingConfig.joinToString(", ") { it.domain }
                return false to "Cannot delete: config is in use by $domains"
            }

            val configs = listDnsConfigs().toMutableList()
            val removed = configs.removeIf { it.id == id }
            if (!removed) {
                return false to "DNS config not found"
            }
            dnsConfigPersistence.save(configs)
            true to "DNS config deleted"
        } catch (e: Exception) {
            logger.error("Error deleting DNS config", e)
            false to "Error deleting DNS config: ${e.message}"
        }
    }
}

