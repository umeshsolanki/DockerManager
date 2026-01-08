package com.umeshsolanki.dockermanager.proxy

import com.umeshsolanki.dockermanager.*
import com.umeshsolanki.dockermanager.ServiceContainer
import com.umeshsolanki.dockermanager.firewall.IFirewallService
import com.umeshsolanki.dockermanager.jail.IJailManagerService
import com.umeshsolanki.dockermanager.utils.JsonPersistence
import com.umeshsolanki.dockermanager.utils.ResourceLoader
import com.umeshsolanki.dockermanager.utils.CommandExecutor
import com.umeshsolanki.dockermanager.proxy.IpFilterUtils
import kotlinx.coroutines.*
import java.io.File
import java.util.*
import java.text.SimpleDateFormat
import kotlinx.coroutines.isActive
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

interface IProxyService {
    fun listHosts(): List<ProxyHost>
    fun createHost(host: ProxyHost): Pair<Boolean, String>
    fun deleteHost(id: String): Boolean
    fun getStats(): ProxyStats
    fun toggleHost(id: String): Boolean
    fun updateHost(host: ProxyHost): Pair<Boolean, String>
    fun requestSSL(id: String): Boolean
    fun listCertificates(): List<SSLCertificate>
    
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
    fun updateStatsSettings(active: Boolean, intervalMs: Long, filterLocalIps: Boolean? = null)
    fun updateSecuritySettings(enabled: Boolean, thresholdNon200: Int, rules: List<ProxyJailRule>)
    
    // Analytics History
    fun getHistoricalStats(date: String): DailyProxyStats?
    fun listAvailableDates(): List<String>
    fun getStatsForDateRange(startDate: String, endDate: String): List<DailyProxyStats>
}

class ProxyServiceImpl(
    private val jailManagerService: IJailManagerService
) : IProxyService {
    private val logger = org.slf4j.LoggerFactory.getLogger(ProxyServiceImpl::class.java)
    private val configDir = AppConfig.proxyConfigDir
    private val logFile = AppConfig.proxyLogFile
    private val hostsFile = AppConfig.proxyHostsFile
    private val jsonPersistence = JsonPersistence.create<List<ProxyHost>>(
        file = hostsFile,
        defaultContent = emptyList(),
        loggerName = ProxyServiceImpl::class.java.name
    )

    val proxyDockerComposeDir: File
        get() {
            return File(AppConfig.projectRoot,"proxy").let {
                if (!it.exists()) {
                    it.mkdirs()
                }
                it
            }
        }

    private val nginxPath = AppConfig.proxyDir.absolutePath
    private val certbotPath = AppConfig.certbotDir.absolutePath
    private val customCertsPath = AppConfig.customCertDir.absolutePath

    private var cachedStats: ProxyStats = ProxyStats(
        totalHits = 0,
        hitsByStatus = emptyMap(),
        hitsOverTime = emptyMap(),
        topPaths = emptyList(),
        recentHits = emptyList()
    )

    // Incremental state
    private var lastProcessedOffset = 0L
    private val totalHitsCounter = java.util.concurrent.atomic.AtomicLong(0)
    private val hitsByStatusMap = java.util.concurrent.ConcurrentHashMap<Int, Long>()
    private val hitsByDomainMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val hitsByPathMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val hitsByIpMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val hitsByIpErrorMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val hitsByMethodMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val hitsByRefererMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val hitsByUserAgentMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val hitsByTimeMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val recentHitsList = java.util.concurrent.ConcurrentLinkedDeque<ProxyHit>()
    private val MAX_RECENT_HITS = 100

    private val refreshIntervalMs = 60000L // Configurable interval: 10 seconds
    private val scope =
        CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val commandExecutor = CommandExecutor(loggerName = ProxyServiceImpl::class.java.name)
    private val analyticsPersistence = AnalyticsPersistenceService()
    private var lastResetDate: String? = null

    override fun updateSecuritySettings(enabled: Boolean, thresholdNon200: Int, rules: List<ProxyJailRule>) {
        AppConfig.updateProxySecuritySettings(enabled, thresholdNon200, rules)
    }

    init {
        if (!configDir.exists()) configDir.mkdirs()
        
        // Ensure log directory exists for Nginx
        AppConfig.proxyLogFile.parentFile?.mkdirs()

        // Start background worker for stats
        startStatsWorker()
        
        // Start daily reset worker
        startDailyResetWorker()
    }

    private fun startStatsWorker() {
        scope.launch {
            while (isActive) {
                try {
                    val settings = AppConfig.proxyStatsSettings
                    if (settings.proxyStatsActive) {
                        updateStatsNatively()
                    }
                    delay(settings.proxyStatsIntervalMs)
                } catch (e: Exception) {
                    logger.error("Error updating stats", e)
                    delay(60000) // Fallback delay on error
                }
            }
        }
    }

    private fun startDailyResetWorker() {
        scope.launch {
            while (isActive) {
                try {
                    val today = java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"))
                    
                    // Check if we need to reset (new day)
                    if (lastResetDate != null && lastResetDate != today) {
                        // Save yesterday's stats before resetting
                        val yesterdayStats = cachedStats
                        analyticsPersistence.saveDailyStats(yesterdayStats, lastResetDate)
                        logger.info("Saved daily stats for $lastResetDate")
                        
                        // Reset counters
                        resetDailyStats()
                        logger.info("Reset daily stats for $today")
                    }
                    
                    // Initialize lastResetDate if not set
                    if (lastResetDate == null) {
                        lastResetDate = today
                    }
                    
                    // Check every hour
                    delay(3600000) // 1 hour
                } catch (e: Exception) {
                    logger.error("Error in daily reset worker", e)
                    delay(3600000) // Fallback delay
                }
            }
        }
    }

    private fun resetDailyStats() {
        totalHitsCounter.set(0)
        hitsByStatusMap.clear()
        hitsByDomainMap.clear()
        hitsByPathMap.clear()
        hitsByIpMap.clear()
        hitsByIpErrorMap.clear()
        hitsByMethodMap.clear()
        hitsByRefererMap.clear()
        hitsByUserAgentMap.clear()
        hitsByTimeMap.clear()
        recentHitsList.clear()
        lastProcessedOffset = 0L
        
        cachedStats = ProxyStats(
            totalHits = 0,
            hitsByStatus = emptyMap(),
            hitsOverTime = emptyMap(),
            topPaths = emptyList(),
            recentHits = emptyList(),
            hitsByDomain = emptyMap(),
            topIps = emptyList(),
            topIpsWithErrors = emptyList(),
            topUserAgents = emptyList(),
            topReferers = emptyList(),
            topMethods = emptyList()
        )
    }

    private fun updateStatsNatively() {
        if (!logFile.exists()) return

        val currentLength = logFile.length()
        
        // Handle log rotation or truncated file
        if (currentLength < lastProcessedOffset) {
            logger.info("Log file rotated or truncated, resetting offset")
            lastProcessedOffset = 0
            // Optionally clear stats here if you want fresh analytics on rotation
            // For now we keep cumulative stats
        }

        if (currentLength == lastProcessedOffset) return

        val lineRegex = """^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d+) (\d+) "([^"]*)" "([^"]*)" "([^"]*)".*$""".toRegex()
        val dateFormat = SimpleDateFormat("dd/MMM/yyyy:HH:mm:ss Z", Locale.US)
        
        // Get settings once per update cycle
        val settings = AppConfig.proxyStatsSettings
        val shouldFilterLocalIps = settings.filterLocalIps

        try {
            java.io.RandomAccessFile(logFile, "r").use { raf ->
                raf.seek(lastProcessedOffset)
                var line: String? = raf.readLine()
                while (line != null) {
                    val trimmedLine = line.trim()
                    if (trimmedLine.isNotEmpty()) {
                        lineRegex.find(trimmedLine)?.let { match ->
                            val (ip, dateStr, fullRequest, statusStr, _, referer, ua, _) = match.destructured
                            val status = statusStr.toIntOrNull() ?: 0
                            
                            // Filter local IPs if enabled
                            if (shouldFilterLocalIps && IpFilterUtils.isLocalIp(ip)) {
                                // Skip this entry - it's a local IP
                                return@let
                            }
                            
                            val reqParts = fullRequest.split(" ")
                            val method = reqParts.getOrNull(0) ?: "-"
                            val path = reqParts.getOrNull(1) ?: fullRequest
                            val domain = if (referer != "-") try { java.net.URI(referer).host } catch(e: Exception) { null } else null

                            // Update stats
                            totalHitsCounter.incrementAndGet()
                            hitsByStatusMap.merge(status, 1L, Long::plus)
                            hitsByIpMap.merge(ip, 1L, Long::plus)
                            hitsByMethodMap.merge(method, 1L, Long::plus)
                            hitsByPathMap.merge(path, 1L, Long::plus)
                            if (ua != "-") hitsByUserAgentMap.merge(ua, 1L, Long::plus)
                            if (referer != "-") hitsByRefererMap.merge(referer, 1L, Long::plus)
                            if (domain != null) hitsByDomainMap.merge(domain, 1L, Long::plus)

                            if (status >= 400 || status == 0) {
                                hitsByIpErrorMap.merge(ip, 1L, Long::plus)
                            }

                            // Security Jailing check (delegated to JailManagerService)
                            val errCount = hitsByIpErrorMap[ip] ?: 0L
                            jailManagerService.checkProxySecurityViolation(
                                ip = ip,
                                userAgent = ua,
                                method = method,
                                path = path,
                                status = status,
                                errorCount = errCount
                            )

                            // Time-based aggregation (HH:00)
                            try {
                                val timestamp = dateFormat.parse(dateStr)
                                val hourKey = SimpleDateFormat("HH:00", Locale.US).format(timestamp)
                                hitsByTimeMap.merge(hourKey, 1L, Long::plus)

                                // Update recent hits
                                val hit = ProxyHit(
                                    timestamp = timestamp.time,
                                    ip = ip,
                                    method = method,
                                    path = path,
                                    status = status,
                                    responseTime = 0,
                                    userAgent = ua,
                                    referer = if (referer == "-") null else referer,
                                    domain = domain
                                )
                                recentHitsList.addFirst(hit)
                                while (recentHitsList.size > MAX_RECENT_HITS) {
                                    recentHitsList.removeLast()
                                }
                            } catch (e: Exception) {
                                // Ignore date parse errors
                            }
                        }
                    }
                    line = raf.readLine()
                }
                lastProcessedOffset = raf.filePointer
            }
        } catch (e: Exception) {
            logger.error("Error processing log file incrementally", e)
        }

        // Update cached stats for UI
        cachedStats = ProxyStats(
            totalHits = totalHitsCounter.get(),
            hitsByStatus = hitsByStatusMap.toMap(),
            hitsOverTime = hitsByTimeMap.toSortedMap(),
            topPaths = hitsByPathMap.entries.sortedByDescending { it.value }.map { PathHit(it.key, it.value) },
            recentHits = recentHitsList.toList(),
            hitsByDomain = hitsByDomainMap.toMap(),
            topIps = hitsByIpMap.entries.sortedByDescending { it.value }.map { GenericHitEntry(it.key, it.value) },
            topIpsWithErrors = hitsByIpErrorMap.entries.sortedByDescending { it.value }.map { GenericHitEntry(it.key, it.value) },
            topUserAgents = hitsByUserAgentMap.entries.sortedByDescending { it.value }.map { GenericHitEntry(it.key, it.value) },
            topReferers = hitsByRefererMap.entries.sortedByDescending { it.value }.map { GenericHitEntry(it.key, it.value) },
            topMethods = hitsByMethodMap.entries.sortedByDescending { it.value }.map { GenericHitEntry(it.key, it.value) }
        )
    }

    override fun getStats(): ProxyStats = cachedStats

    private fun loadHosts(): MutableList<ProxyHost> {
        return jsonPersistence.load().toMutableList()
    }

    private fun saveHosts(hosts: List<ProxyHost>) {
        jsonPersistence.save(hosts)
    }

    override fun listHosts(): List<ProxyHost> = loadHosts()

    override fun createHost(host: ProxyHost): Pair<Boolean, String> {
        return try {
            val hosts = loadHosts()
            val newHost = if (host.id.isEmpty()) host.copy(id = UUID.randomUUID().toString()) else host
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
            saveHosts(hosts)
            reloadNginx()
            true
        } catch (e: Exception) {
            false
        }
    }

    override fun updateHost(host: ProxyHost): Pair<Boolean, String> {
        return try {
            val hosts = loadHosts()
            val index = hosts.indexOfFirst { it.id == host.id }
            if (index == -1) return false to "Host not found"

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
                saveHosts(hosts)
                reloadNginx()
            }
            
            true to "Host updated successfully"
        } catch (e: Exception) {
            logger.error("Error updating host", e)
            false to (e.message ?: "Unknown error")
        }
    }
    
    private fun generateConfigAndReload(host: ProxyHost, hosts: MutableList<ProxyHost>): Pair<Boolean, String> {
        val configResult = generateNginxConfig(host)
        saveHosts(hosts)
        if (!configResult.first) return configResult
        reloadNginx()
        return configResult
    }

    override fun toggleHost(id: String): Boolean {
        val hosts = loadHosts()
        val index = hosts.indexOfFirst { it.id == id }
        if (index == -1) return false

        val updated = hosts[index].copy(enabled = !hosts[index].enabled)
        hosts[index] = updated

        if (updated.enabled) {
            generateConfigAndReload(updated, hosts)
        } else {
            File(configDir, "${updated.domain}.conf").delete()
            saveHosts(hosts)
            reloadNginx()
        }
        return true
    }

    override fun requestSSL(id: String): Boolean {
        val hosts = loadHosts()
        val index = hosts.indexOfFirst { it.id == id }
        if (index == -1) return false

        val host = hosts[index]

        // Ensure we have a basic HTTP config for ACME challenge
        generateNginxConfig(host.copy(ssl = false))
        reloadNginx()

        try {
            // Run certbot via docker using absolute paths map to the certbot volume
            // Updated to run in proxy container with standard paths
            val certCmd =
                "${AppConfig.dockerCommand} exec docker-manager-proxy certbot certonly --webroot -w /var/www/certbot -d ${host.domain} --non-interactive --agree-tos --email admin@${host.domain}"
            val result = executeCommand(certCmd)

            if (result.contains("Successfully received certificate") || result.contains("Certificate not yet due for renewal")) {
                // Fix permissions so host process can see them (recursive 755 for live/archive)
                executeCommand("${AppConfig.dockerCommand} exec docker-manager-proxy chmod -R 755 /etc/letsencrypt")
                
                val updated = host.copy(ssl = true)
                hosts[index] = updated
                saveHosts(hosts)
                generateNginxConfig(updated)
                reloadNginx()
                return true
            }
        } catch (e: Exception) {
            logger.error("SSL request failed for ${host.domain}", e)
        }
        return false
    }

    override fun listCertificates(): List<SSLCertificate> {
        val certs = mutableListOf<SSLCertificate>()

        // Scan LetsEncrypt
        val leDir = AppConfig.letsEncryptDir
        if (leDir.exists()) {
            leDir.listFiles()?.filter { it.isDirectory }?.forEach { dir ->
                val fullchain = File(dir, "fullchain.pem")
                val privkey = File(dir, "privkey.pem")
                if (fullchain.exists() && privkey.exists()) {
                    certs.add(
                        SSLCertificate(
                            id = dir.name,
                            domain = dir.name,
                            certPath = fullchain.absolutePath,
                            keyPath = privkey.absolutePath
                        )
                    )
                }
            }
        }

        // Scan custom certs dir
        val custDir = AppConfig.customCertDir
        if (custDir.exists()) {
            custDir.listFiles()?.filter { it.extension == "crt" || it.extension == "pem" }
                ?.forEach { cert ->
                    val keyName = cert.nameWithoutExtension + ".key"
                    val keyFile = File(cert.parentFile, keyName)
                    if (keyFile.exists()) {
                        certs.add(
                            SSLCertificate(
                                id = cert.nameWithoutExtension,
                                domain = cert.nameWithoutExtension,
                                certPath = cert.absolutePath,
                                keyPath = keyFile.absolutePath
                            )
                        )
                    }
                }
        }

        return certs
    }

    private fun executeCommand(command: String): String {
        return commandExecutor.execute(command).output
    }

    private fun generateNginxConfig(host: ProxyHost): Pair<Boolean, String> {
        // Load websocket config if enabled
        val wsConfigRaw = if (host.websocketEnabled) {
            ResourceLoader.loadResourceOrThrow("templates/proxy/websocket-config.conf")
        } else ""
        
        // Indent websocket config for use in location blocks (8 spaces)
        val wsConfig = if (wsConfigRaw.isNotEmpty()) {
            wsConfigRaw.lines().joinToString("\n        ") { it.trim() }
        } else ""

        // Generate IP restrictions
        val ipConfig = if (host.allowedIps.isNotEmpty()) {
            host.allowedIps.joinToString("\n        ") { "allow $it;" } + "\n        deny all;"
        } else ""

        // Generate HTTPS server block if SSL is enabled
        val sslConfig = if (host.ssl) {
            val (hostCert, hostKey) = resolveSslCertPaths(host)

            val hostCertFile = File(hostCert)
            val hostKeyFile = File(hostKey)

            logger.info("Checking SSL files for ${host.domain} at:\nCert: ${hostCertFile.absolutePath}\nKey: ${hostKeyFile.absolutePath}")

            if (!hostCertFile.exists() || !hostKeyFile.exists()) {
                logger.warn("SSL fallback for ${host.domain}: Host files missing or inaccessible.")
                return generateNginxConfig(host.copy(ssl = false)).copy(second = "SSL Certificate missing on disk (checked ${hostCertFile.parent})")
            }

            val containerCert = translateToContainerPath(hostCert)
            val containerKey = translateToContainerPath(hostKey)
            
            logger.info("Using SSL config for ${host.domain}: $containerCert")

            val hstsHeader = if (host.hstsEnabled) {
                "add_header Strict-Transport-Security \"max-age=31536000; includeSubDomains\" always;"
            } else ""

            val httpsTemplate = ResourceLoader.loadResourceOrThrow("templates/proxy/server-https.conf")
            ResourceLoader.replacePlaceholders(httpsTemplate, mapOf(
                "domain" to host.domain,
                "sslCert" to containerCert,
                "sslKey" to containerKey,
                "hstsHeader" to hstsHeader,
                "target" to host.target,
                "websocketConfig" to wsConfig,
                "ipRestrictions" to ipConfig
            ))
        } else ""

        // Generate HTTP server block
        val httpRedirect = if (host.ssl) {
            "        return 301 https://\$host\$request_uri;\n"
        } else ""

        val httpProxyConfig = if (!host.ssl) {
            val proxyTemplate = ResourceLoader.loadResourceOrThrow("templates/proxy/http-proxy-config.conf")
            val proxyContent = ResourceLoader.replacePlaceholders(proxyTemplate, mapOf(
                "target" to host.target,
                "websocketConfig" to wsConfig,
                "ipRestrictions" to ipConfig
            ))
            // Indent each line (8 spaces for location block)
            proxyContent.lines().joinToString("\n") { if (it.isBlank()) it else "        $it" }
        } else ""

        val httpTemplate = ResourceLoader.loadResourceOrThrow("templates/proxy/server-http.conf")
        val httpConfig = ResourceLoader.replacePlaceholders(httpTemplate, mapOf(
            "domain" to host.domain,
            "httpRedirect" to httpRedirect,
            "httpProxyConfig" to httpProxyConfig
        ))

        val config = "$httpConfig\n\n$sslConfig".trim()

        try {
            File(configDir, "${host.domain}.conf").writeText(config)
            return true to "Config generated"
        } catch (e: Exception) {
            logger.error("Failed to generate nginx config for ${host.domain}", e)
            return false to "Failed to write config: ${e.message}"
        }
    }

    private fun reloadNginx() {
        // Use executeCommand to capture output and potential errors
        logger.info("Reloading Nginx...")
        val result =
            executeCommand("${AppConfig.dockerCommand} exec docker-manager-proxy openresty -s reload")
        if (result.isNotBlank()) {
            logger.info("Nginx Reload Output: $result")
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
            val composeFile = ensureComposeFile()
            val buildCmd = "${AppConfig.dockerComposeCommand} -f ${composeFile.absolutePath} build proxy"
            
            val result = executeComposeCommand(buildCmd, truncateOutput = true)
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
            
            val result = executeComposeCommand("${AppConfig.dockerComposeCommand} up --no-start proxy")
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
    
    private fun executeContainerCommand(action: String, actionPresent: String, actionPast: String): Pair<Boolean, String> {
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
    
    private fun executeComposeCommand(command: String, truncateOutput: Boolean = false): com.umeshsolanki.dockermanager.utils.ExecuteResult {
        val processBuilder = ProcessBuilder("sh", "-c", command)
            .directory(proxyDockerComposeDir)
            .redirectErrorStream(true)
        
        val process = processBuilder.start()
        val outputFull = process.inputStream.bufferedReader().readText()
        val exitCode = process.waitFor()
        
        val output = if (truncateOutput && outputFull.length > 10000) {
            " (Truncated...)\n" + outputFull.takeLast(10000)
        } else {
            outputFull
        }
        
        return com.umeshsolanki.dockermanager.utils.ExecuteResult(output, "", exitCode)
    }
    
    private fun ensureProxyDirectories() {
        val nginxDir = AppConfig.proxyDir
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
        
        ensureNginxMainConfig()
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
            val existsCmd = "${AppConfig.dockerCommand} ps -a --filter name=$PROXY_CONTAINER_NAME --format '{{.Names}}'"
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
            val inspectCmd = "${AppConfig.dockerCommand} inspect $PROXY_CONTAINER_NAME --format '{{.Id}}|{{.State.Running}}|{{.State.Status}}|{{.State.StartedAt}}'"
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

    private fun getDefaultComposeConfig(): String {
        val template = ResourceLoader.loadResourceOrThrow("templates/proxy/docker-compose.yml")
        return ResourceLoader.replacePlaceholders(template, mapOf(
            "nginxPath" to nginxPath,
            "certbotPath" to certbotPath,
            "customCertsPath" to customCertsPath
        ))
    }

    private fun getDefaultDockerfileConfig(): String {
        return ResourceLoader.loadResourceOrThrow("templates/proxy/Dockerfile.proxy")
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
        val certsDir = AppConfig.letsEncryptDir
        
        return if (!host.customSslPath.isNullOrBlank() && host.customSslPath.contains("|")) {
            val parts = host.customSslPath.split("|")
            if (parts.size >= 2) {
                parts[0] to parts[1]
            } else {
                getDefaultCertPaths(certsDir, host.domain)
            }
        } else {
            getDefaultCertPaths(certsDir, host.domain)
        }
    }
    
    private fun getDefaultCertPaths(certsDir: File, domain: String): Pair<String, String> {
        val folder = findDomainFolder(certsDir, domain)
        return File(folder, "fullchain.pem").absolutePath to File(folder, "privkey.pem").absolutePath
    }
    
    private fun findDomainFolder(liveDir: File, domain: String): File {
        if (!liveDir.exists()) return File(liveDir, domain)
        
        // Exact match
        val exact = File(liveDir, domain)
        if (exact.exists()) return exact
        
        // Partial match (handles domain-0001 etc)
        val matches = liveDir.listFiles()?.filter { it.isDirectory && it.name.startsWith(domain) }
        return matches?.firstOrNull() ?: exact
    }

    private fun ensureNginxMainConfig() {
        val nginxConf = File(AppConfig.proxyDir, "nginx.conf")
        if (!nginxConf.exists()) {
            logger.info("Creating default nginx.conf in ${nginxConf.absolutePath}")
            nginxConf.writeText(getDefaultNginxConfig())
        }
    }

    private fun getDefaultNginxConfig(): String {
        return ResourceLoader.loadResourceOrThrow("templates/proxy/nginx.conf")
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
        AppConfig.updateProxyStatsSettings(active, intervalMs, filterLocalIps)
    }

    override fun getHistoricalStats(date: String): DailyProxyStats? {
        // First try to load existing stats
        val existingStats = analyticsPersistence.loadDailyStats(date)
        if (existingStats != null) {
            return existingStats
        }
        
        // If not found, process logs for that date and create stats
        logger.info("Historical stats not found for $date, processing logs...")
        val processedStats = processLogsForDate(date)
        if (processedStats != null) {
            // Save the processed stats for future use
            analyticsPersistence.saveDailyStats(
                ProxyStats(
                    totalHits = processedStats.totalHits,
                    hitsByStatus = processedStats.hitsByStatus,
                    hitsOverTime = processedStats.hitsOverTime,
                    topPaths = processedStats.topPaths,
                    recentHits = emptyList(),
                    hitsByDomain = processedStats.hitsByDomain,
                    topIps = processedStats.topIps,
                    topIpsWithErrors = processedStats.topIpsWithErrors,
                    topUserAgents = processedStats.topUserAgents,
                    topReferers = processedStats.topReferers,
                    topMethods = processedStats.topMethods
                ),
                date
            )
            logger.info("Created historical stats for $date from logs")
        }
        
        return processedStats
    }
    
    /**
     * Process log file for a specific date and generate stats
     */
    private fun processLogsForDate(targetDate: String): DailyProxyStats? {
        if (!logFile.exists()) {
            logger.warn("Log file does not exist, cannot process historical stats for $targetDate")
            return null
        }
        
        val lineRegex = """^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d+) (\d+) "([^"]*)" "([^"]*)" "([^"]*)".*$""".toRegex()
        val dateFormat = SimpleDateFormat("dd/MMM/yyyy:HH:mm:ss Z", Locale.US)
        val targetLocalDate = try {
            java.time.LocalDate.parse(targetDate, java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"))
        } catch (e: Exception) {
            logger.error("Invalid date format: $targetDate", e)
            return null
        }
        
        // Get settings
        val settings = AppConfig.proxyStatsSettings
        val shouldFilterLocalIps = settings.filterLocalIps
        
        // Temporary maps for this date's stats
        val tempTotalHits = java.util.concurrent.atomic.AtomicLong(0)
        val tempHitsByStatusMap = java.util.concurrent.ConcurrentHashMap<Int, Long>()
        val tempHitsByDomainMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
        val tempHitsByPathMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
        val tempHitsByIpMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
        val tempHitsByIpErrorMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
        val tempHitsByMethodMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
        val tempHitsByRefererMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
        val tempHitsByUserAgentMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
        val tempHitsByTimeMap = java.util.concurrent.ConcurrentHashMap<String, Long>()
        
        return try {
            // Read entire log file (or check rotated logs)
            java.io.RandomAccessFile(logFile, "r").use { raf ->
                raf.seek(0) // Start from beginning
                var line: String? = raf.readLine()
                var processedCount = 0L
                var skippedCount = 0L
                
                while (line != null) {
                    val trimmedLine = line.trim()
                    if (trimmedLine.isNotEmpty()) {
                        lineRegex.find(trimmedLine)?.let { match ->
                            val (ip, dateStr, fullRequest, statusStr, _, referer, ua, _) = match.destructured
                            val status = statusStr.toIntOrNull() ?: 0
                            
                            // Parse date from log entry
                            try {
                                val timestamp = dateFormat.parse(dateStr)
                                val logDate = java.time.LocalDate.ofInstant(
                                    timestamp.toInstant(),
                                    java.time.ZoneId.systemDefault()
                                )
                                
                                // Only process entries for the target date
                                // Compare dates directly (ignoring time)
                                if (!logDate.isEqual(targetLocalDate)) {
                                    skippedCount++
                                    return@let
                                }
                                
                                logger.debug("Processing log entry for date $targetDate: $dateStr -> $logDate")
                                
                                // Filter local IPs if enabled
                                if (shouldFilterLocalIps && IpFilterUtils.isLocalIp(ip)) {
                                    return@let
                                }
                                
                                val reqParts = fullRequest.split(" ")
                                val method = reqParts.getOrNull(0) ?: "-"
                                val path = reqParts.getOrNull(1) ?: fullRequest
                                val domain = if (referer != "-") try { java.net.URI(referer).host } catch(e: Exception) { null } else null
                                
                                // Update stats
                                tempTotalHits.incrementAndGet()
                                tempHitsByStatusMap.merge(status, 1L, Long::plus)
                                tempHitsByIpMap.merge(ip, 1L, Long::plus)
                                tempHitsByMethodMap.merge(method, 1L, Long::plus)
                                tempHitsByPathMap.merge(path, 1L, Long::plus)
                                if (ua != "-") tempHitsByUserAgentMap.merge(ua, 1L, Long::plus)
                                if (referer != "-") tempHitsByRefererMap.merge(referer, 1L, Long::plus)
                                if (domain != null) tempHitsByDomainMap.merge(domain, 1L, Long::plus)
                                
                                if (status >= 400 || status == 0) {
                                    tempHitsByIpErrorMap.merge(ip, 1L, Long::plus)
                                }
                                
                                // Time-based aggregation (HH:00)
                                val hourKey = SimpleDateFormat("HH:00", Locale.US).format(timestamp)
                                tempHitsByTimeMap.merge(hourKey, 1L, Long::plus)
                                
                                processedCount++
                            } catch (e: Exception) {
                                // Ignore date parse errors
                            }
                        }
                    }
                    line = raf.readLine()
                }
                
                logger.info("Processed $processedCount log entries for date $targetDate (skipped $skippedCount entries from other dates)")
            }
            
            // Convert to DailyProxyStats
            DailyProxyStats(
                date = targetDate,
                totalHits = tempTotalHits.get(),
                hitsByStatus = tempHitsByStatusMap.toMap(),
                hitsOverTime = tempHitsByTimeMap.toSortedMap(),
                topPaths = tempHitsByPathMap.entries.sortedByDescending { it.value }.map { PathHit(it.key, it.value) },
                hitsByDomain = tempHitsByDomainMap.toMap(),
                topIps = tempHitsByIpMap.entries.sortedByDescending { it.value }.map { GenericHitEntry(it.key, it.value) },
                topIpsWithErrors = tempHitsByIpErrorMap.entries.sortedByDescending { it.value }.map { GenericHitEntry(it.key, it.value) },
                topUserAgents = tempHitsByUserAgentMap.entries.sortedByDescending { it.value }.map { GenericHitEntry(it.key, it.value) },
                topReferers = tempHitsByRefererMap.entries.sortedByDescending { it.value }.map { GenericHitEntry(it.key, it.value) },
                topMethods = tempHitsByMethodMap.entries.sortedByDescending { it.value }.map { GenericHitEntry(it.key, it.value) }
            )
        } catch (e: Exception) {
            logger.error("Error processing logs for date $targetDate", e)
            null
        }
    }

    override fun listAvailableDates(): List<String> {
        val savedDates = analyticsPersistence.listAvailableDates().toMutableSet()
        
        // Also scan log file for dates that can be processed
        val datesFromLogs = extractDatesFromLogs()
        savedDates.addAll(datesFromLogs)
        
        // Include today's date if stats are active
        val today = java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"))
        savedDates.add(today)
        
        return savedDates.sorted().reversed() // Most recent first
    }
    
    /**
     * Extract all unique dates from the log file
     */
    private fun extractDatesFromLogs(): Set<String> {
        if (!logFile.exists()) return emptySet()
        
        val dateFormat = SimpleDateFormat("dd/MMM/yyyy:HH:mm:ss Z", Locale.US)
        val dateFormatter = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd")
        val dates = mutableSetOf<String>()
        
        return try {
            java.io.RandomAccessFile(logFile, "r").use { raf ->
                raf.seek(0)
                var line: String? = raf.readLine()
                var lineCount = 0
                val maxLinesToScan = 100000 // Limit scanning to avoid performance issues
                
                while (line != null && lineCount < maxLinesToScan) {
                    val trimmedLine = line.trim()
                    if (trimmedLine.isNotEmpty()) {
                        // Try to extract date from log line
                        val dateMatch = """\[([^\]]+)\]""".toRegex().find(trimmedLine)
                        dateMatch?.let { match ->
                            val dateStr = match.groupValues[1]
                            try {
                                val timestamp = dateFormat.parse(dateStr)
                                val logDate = java.time.LocalDate.ofInstant(
                                    timestamp.toInstant(),
                                    java.time.ZoneId.systemDefault()
                                )
                                dates.add(logDate.format(dateFormatter))
                            } catch (e: Exception) {
                                // Ignore parse errors
                            }
                        }
                    }
                    line = raf.readLine()
                    lineCount++
                }
            }
            dates
        } catch (e: Exception) {
            logger.error("Error extracting dates from logs", e)
            emptySet()
        }
    }

    override fun getStatsForDateRange(startDate: String, endDate: String): List<DailyProxyStats> {
        val start = try {
            java.time.LocalDate.parse(startDate, java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"))
        } catch (e: Exception) {
            logger.error("Invalid start date format: $startDate", e)
            return emptyList()
        }
        
        val end = try {
            java.time.LocalDate.parse(endDate, java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"))
        } catch (e: Exception) {
            logger.error("Invalid end date format: $endDate", e)
            return emptyList()
        }
        
        val dates = generateSequence(start) { it.plusDays(1) }
            .takeWhile { !it.isAfter(end) }
            .map { it.format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd")) }
            .toList()
        
        // Process each date, creating stats if they don't exist
        return dates.mapNotNull { date ->
            getHistoricalStats(date)
        }
    }

    private fun checkImageExists(): Boolean {
        return try {
            val cmd = "${AppConfig.dockerCommand} images -q ${'$'}PROXY_IMAGE_NAME:${'$'}PROXY_IMAGE_TAG"
            val output = executeCommand(cmd).trim()
            output.isNotBlank()
        } catch (e: Exception) {
            logger.error("Error checking if image exists", e)
            false
        }
    }
}

// Service object for easy access
object ProxyService {
    private val service: IProxyService by lazy {
        ProxyServiceImpl(ServiceContainer.jailManagerService)
    }
    
    fun listHosts() = service.listHosts()
    fun createHost(host: ProxyHost) = service.createHost(host)
    fun deleteHost(id: String) = service.deleteHost(id)
    fun getStats() = service.getStats()
    fun toggleHost(id: String) = service.toggleHost(id)
    fun updateHost(host: ProxyHost) = service.updateHost(host)
    fun requestSSL(id: String) = service.requestSSL(id)
    fun listCertificates() = service.listCertificates()
    fun buildProxyImage() = service.buildProxyImage()
    fun createProxyContainer() = service.createProxyContainer()
    fun startProxyContainer() = service.startProxyContainer()
    fun stopProxyContainer() = service.stopProxyContainer()
    fun restartProxyContainer() = service.restartProxyContainer()
    fun getProxyContainerStatus() = service.getProxyContainerStatus()
    fun ensureProxyContainerExists() = service.ensureProxyContainerExists()
    fun getComposeConfig() = service.getComposeConfig()
    fun updateComposeConfig(content: String) = service.updateComposeConfig(content)
    fun updateStatsSettings(active: Boolean, intervalMs: Long, filterLocalIps: Boolean? = null) = service.updateStatsSettings(active, intervalMs, filterLocalIps)
    fun updateSecuritySettings(enabled: Boolean, thresholdNon200: Int, rules: List<ProxyJailRule>) = service.updateSecuritySettings(enabled, thresholdNon200, rules)
    fun getProxySecuritySettings() = AppConfig.proxySecuritySettings
    
    // Analytics History
    fun getHistoricalStats(date: String) = service.getHistoricalStats(date)
    fun listAvailableDates() = service.listAvailableDates()
    fun getStatsForDateRange(startDate: String, endDate: String) = service.getStatsForDateRange(startDate, endDate)
}

