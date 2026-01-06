package com.umeshsolanki.dockermanager

import kotlinx.coroutines.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
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
    fun updateStatsSettings(active: Boolean, intervalMs: Long)
}

class ProxyServiceImpl : IProxyService {
    private val logger = org.slf4j.LoggerFactory.getLogger(ProxyServiceImpl::class.java)
    private val configDir = AppConfig.proxyConfigDir
    private val logFile = AppConfig.proxyLogFile
    private val hostsFile = AppConfig.proxyHostsFile
    private val json = AppConfig.json

    private var cachedStats: ProxyStats = ProxyStats(
            totalHits = 0,
            hitsByStatus = emptyMap(),
            hitsOverTime = emptyMap(),
            topPaths = emptyList(),
            recentHits = emptyList()
        )
    private val refreshIntervalMs = 10000L // Configurable interval: 10 seconds
    private val scope =
        CoroutineScope(Dispatchers.IO + SupervisorJob())

    init {
        if (!configDir.exists()) configDir.mkdirs()
        if (!hostsFile.parentFile.exists()) hostsFile.parentFile.mkdirs()
        if (!hostsFile.exists()) hostsFile.writeText("[]")
        
        // Ensure log directory exists for Nginx
        AppConfig.proxyLogFile.parentFile?.mkdirs()

        // Start background worker for stats
        startStatsWorker()
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
                    delay(10000) // Fallback delay on error
                }
            }
        }
    }

    private fun updateStatsNatively() {
        if (!logFile.exists()) return

        val totalHits = executeCommand("wc -l < ${logFile.absolutePath}").trim().toLongOrNull() ?: 0

        // Hits by Status
        val statusCounts =
            executeCommand("awk '{print \$9}' ${logFile.absolutePath} | sort | uniq -c").lineSequence()
                .filter { it.isNotBlank() }
                .mapNotNull {
                    val parts = it.trim().split("\\s+".toRegex())
                    if (parts.size >= 2) {
                        val count = parts[0].toLongOrNull() ?: 0L
                        val status = parts[1].toIntOrNull()
                        if (status != null) status to count else null
                    } else null
                }.toMap()

        // Hits by Domain
        val domainCounts =
            executeCommand("awk -F'\"' '{print \$(NF-1)}' ${logFile.absolutePath} | sort | uniq -c").lineSequence()
                .filter { it.isNotBlank() }
                .mapNotNull {
                    val parts = it.trim().split("\\s+".toRegex())
                    if (parts.size >= 2) {
                        val count = parts[0].toLongOrNull() ?: 0L
                        val domain = parts[1]
                        domain to count
                    } else null
                }.toMap()

        // Hits over time (Last 24 hours approximation from last 5000 lines)
        val timeCounts =
            executeCommand("tail -n 5000 ${logFile.absolutePath} | awk -F'[' '{print \$2}' | awk -F':' '{print \$2\":00\"}' | sort | uniq -c").lineSequence()
                .filter { it.isNotBlank() }
                .mapNotNull {
                    val parts = it.trim().split("\\s+".toRegex())
                    if (parts.size >= 2) {
                        val time = parts[1]
                        val count = parts[0].toLongOrNull() ?: 0L
                        time to count
                    } else null
                }.toMap()

        // Top Paths (Top 15)
        val topPaths =
            executeCommand("awk '{print \$7}' ${logFile.absolutePath} | sort | uniq -c | sort -rn | head -n 15").lineSequence()
                .filter { it.isNotBlank() }
                .mapNotNull {
                    val parts = it.trim().split("\\s+".toRegex())
                    if (parts.size >= 2) {
                        val count = parts[0].toLongOrNull() ?: 0L
                        val path = parts[1]
                        PathHit(path, count)
                    } else null
                }.toList()

        // Recent Hits (Last 40)
        val recentHits = mutableListOf<ProxyHit>()
        // More flexible regex to catch malformed requests (often 404s/400s)
        val lineRegex =
            """^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d+) (\d+) "([^"]*)" "([^"]*)" "([^"]*)" "([^"]*)"$""".toRegex()
        val dateFormat = SimpleDateFormat("dd/MMM/yyyy:HH:mm:ss Z", Locale.US)

        executeCommand("tail -n 40 ${logFile.absolutePath}").lineSequence()
            .filter { it.isNotBlank() }.forEach { line ->
                lineRegex.find(line.trim())?.let { match ->
                    val (ip, dateStr, fullRequest, status, _, _, ua, _, domain) = match.destructured
                    
                    // Parse method and path from fullRequest (e.g., "GET /api HTTP/1.1")
                    val reqParts = fullRequest.split(" ")
                    val method = reqParts.getOrNull(0) ?: "-"
                    val path = reqParts.getOrNull(1) ?: fullRequest

                    recentHits.add(
                        ProxyHit(
                            timestamp = try {
                                dateFormat.parse(dateStr).time
                            } catch (e: Exception) {
                                System.currentTimeMillis()
                            },
                            ip = ip,
                            method = method,
                            path = path,
                            status = status.toInt(),
                            responseTime = 0,
                            userAgent = ua,
                            domain = domain
                        )
                    )
                }
            }

        cachedStats = ProxyStats(
            totalHits = totalHits,
            hitsByStatus = statusCounts,
            hitsByDomain = domainCounts,
            hitsOverTime = timeCounts.toSortedMap(),
            topPaths = topPaths,
            recentHits = recentHits
        )
    }

    override fun getStats(): ProxyStats = cachedStats

    private fun loadHosts(): MutableList<ProxyHost> {
        return try {
            json.decodeFromString<List<ProxyHost>>(hostsFile.readText()).toMutableList()
        } catch (e: Exception) {
            mutableListOf()
        }
    }

    private fun saveHosts(hosts: List<ProxyHost>) {
        hostsFile.writeText(json.encodeToString(hosts))
    }

    override fun listHosts(): List<ProxyHost> = loadHosts()

    override fun createHost(host: ProxyHost): Pair<Boolean, String> {
        return try {
            val hosts = loadHosts()
            val newHost =
                if (host.id.isEmpty()) host.copy(id = UUID.randomUUID().toString()) else host
            hosts.add(newHost)

            val configResult = generateNginxConfig(newHost)
            saveHosts(hosts)

            if (!configResult.first) {
                return false to configResult.second
            }

            reloadNginx()

            // Check if we fell back to HTTP due to missing certs
            if (configResult.second.startsWith("SSL Certificate missing")) {
                // Auto-request SSL in background
                scope.launch {
                    requestSSL(newHost.id)
                }
                return true to "Host created. Requesting SSL certificate in background..."
            }

            true to "Host created successfully"
        } catch (e: Exception) {
            e.printStackTrace()
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
                val configResult = generateNginxConfig(host)
                if (!configResult.first) {
                    saveHosts(hosts)
                    return false to configResult.second
                }

                // Check if we fell back to HTTP due to missing certs
                if (configResult.second.startsWith("SSL Certificate missing")) {
                    saveHosts(hosts)
                    reloadNginx()

                    // Auto-request SSL in background
                    scope.launch {
                        requestSSL(host.id)
                    }
                    return true to "Host updated. Requesting SSL certificate in background..."
                }
            }

            saveHosts(hosts)
            reloadNginx()
            true to "Host updated successfully"
        } catch (e: Exception) {
            e.printStackTrace()
            false to (e.message ?: "Unknown error")
        }
    }

    override fun toggleHost(id: String): Boolean {
        val hosts = loadHosts()
        val index = hosts.indexOfFirst { it.id == id }
        if (index == -1) return false

        val updated = hosts[index].copy(enabled = !hosts[index].enabled)
        hosts[index] = updated

        if (updated.enabled) {
            generateNginxConfig(updated)
        } else {
            File(configDir, "${updated.domain}.conf").delete()
        }

        saveHosts(hosts)
        reloadNginx()
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
        return try {
            val process = ProcessBuilder("sh", "-c", command)
                .redirectErrorStream(true)
                .start()
            val output = process.inputStream.bufferedReader().readText()
            val exitCode = process.waitFor()
            if (exitCode != 0 && output.isNotBlank()) {
                logger.warn("Command '$command' exited with code $exitCode. Output: $output")
            }
            output
        } catch (e: Exception) {
            logger.error("executeCommand failed: $command", e)
            ""
        }
    }

    private fun generateNginxConfig(host: ProxyHost): Pair<Boolean, String> {
        val wsConfig = if (host.websocketEnabled) """
            proxy_http_version 1.1;
            proxy_set_header Upgrade ${'$'}http_upgrade;
            proxy_set_header Connection "upgrade";
        """.trimIndent() else ""

        val ipConfig = if (host.allowedIps.isNotEmpty()) {
            host.allowedIps.joinToString("\n        ") { "allow $it;" } + "\n        deny all;"
        } else ""

        val sslConfig = if (host.ssl) {
            val certsDir = AppConfig.letsEncryptDir
            
            val (hostCert, hostKey) = if (!host.customSslPath.isNullOrBlank() && host.customSslPath?.contains("|") == true) {
                val parts = host.customSslPath!!.split("|")
                if (parts.size >= 2) parts[0] to parts[1] else {
                    val folder = findDomainFolder(certsDir, host.domain)
                    File(folder, "fullchain.pem").absolutePath to File(folder, "privkey.pem").absolutePath
                }
            } else {
                val folder = findDomainFolder(certsDir, host.domain)
                File(folder, "fullchain.pem").absolutePath to File(folder, "privkey.pem").absolutePath
            }

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

            val hstsHeader =
                if (host.hstsEnabled) "add_header Strict-Transport-Security \"max-age=31536000; includeSubDomains\" always;" else ""

            """
server {
    listen 443 ssl;
    server_name ${host.domain};

    ssl_certificate $containerCert;
    ssl_certificate_key $containerKey;
    
    $hstsHeader

    location / {
        proxy_pass ${host.target};
        proxy_set_header Host ${'$'}host;
        proxy_set_header X-Real-IP ${'$'}remote_addr;
        proxy_set_header X-Forwarded-For ${'$'}proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto ${'$'}scheme;
        
        $wsConfig
        $ipConfig
    }
}
            """.trimIndent()
        } else ""

        val config = """
server {
    listen 80;
    server_name ${host.domain};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        ${if (host.ssl) "return 301 https://${'$'}host${'$'}request_uri;" else ""}
        ${
            if (!host.ssl) """
        proxy_pass ${host.target};
        proxy_set_header Host ${'$'}host;
        proxy_set_header X-Real-IP ${'$'}remote_addr;
        proxy_set_header X-Forwarded-For ${'$'}proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto ${'$'}scheme;
        
        $wsConfig
        $ipConfig
        """.trimIndent() else ""
        }
    }
}

$sslConfig
        """.trimIndent()

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
            val projectRoot = AppConfig.projectRoot
            val composeFile = ensureComposeFile()
            
            val buildCmd = "${AppConfig.dockerComposeCommand} -f ${composeFile.absolutePath} build proxy"
            logger.info("Build command: $buildCmd")
            
            val process = ProcessBuilder("sh", "-c", buildCmd)
                .directory(projectRoot)
                .redirectErrorStream(true)
                .start()
            
            val outputFull = process.inputStream.bufferedReader().readText()
            val exitCode = process.waitFor()
            
            val output = if (outputFull.length > 10000) {
                " (Truncated...)\n" + outputFull.takeLast(10000)
            } else {
                outputFull
            }
            
            if (exitCode == 0) {
                logger.info("Proxy image built successfully")
                true to "Proxy image built successfully\n$output"
            } else {
                logger.error("Failed to build proxy image. Exit code: $exitCode")
                false to "Failed to build proxy image. Exit code: $exitCode\n$output"
            }
        } catch (e: Exception) {
            logger.error("Error building proxy image", e)
            false to "Error building proxy image: ${e.message}"
        }
    }

    override fun createProxyContainer(): Pair<Boolean, String> {
        return try {
            logger.info("Creating proxy container using compose...")
            val projectRoot = AppConfig.projectRoot
            ensureComposeFile()
            
            // Ensure host directories exist (as defined in docker-compose.yml bind mounts)
            val nginxDir = AppConfig.proxyDir
            val certbotDir = AppConfig.certbotDir
            
            nginxDir.mkdirs()
            File(nginxDir, "conf.d").mkdirs()
            
            val logsDir = File(nginxDir, "logs")
            logsDir.mkdirs()
            logsDir.setWritable(true, false)
            logsDir.setReadable(true, false)
            logsDir.setExecutable(true, false)
            
            val accessLog = File(logsDir, "access.log")
            if (!accessLog.exists()) {
                accessLog.createNewFile()
            }
            accessLog.setWritable(true, false)
            accessLog.setReadable(true, false)
            
            val errorLog = File(logsDir, "error.log")
            if (!errorLog.exists()) {
                errorLog.createNewFile()
            }
            errorLog.setWritable(true, false)
            errorLog.setReadable(true, false)

            certbotDir.mkdirs()
            File(certbotDir, "conf").mkdirs()
            File(certbotDir, "www").mkdirs()
            
            ensureNginxMainConfig()
            
            val createCmd = "${AppConfig.dockerComposeCommand} up --no-start proxy"
            logger.info("Create command: $createCmd")
            
            val process = ProcessBuilder("sh", "-c", createCmd)
                .directory(projectRoot)
                .redirectErrorStream(true)
                .start()
            
            val output = process.inputStream.bufferedReader().readText()
            val exitCode = process.waitFor()
            
            if (exitCode == 0) {
                logger.info("Proxy container created successfully")
                true to "Proxy container created successfully\n$output"
            } else {
                logger.error("Failed to create proxy container. Exit code: $exitCode")
                false to "Failed to create proxy container. Exit code: $exitCode\n$output"
            }
        } catch (e: Exception) {
            logger.error("Error creating proxy container", e)
            false to "Error creating proxy container: ${e.message}"
        }
    }

    override fun startProxyContainer(): Pair<Boolean, String> {
        return try {
            logger.info("Starting proxy container using compose...")
            val projectRoot = AppConfig.projectRoot
            ensureComposeFile()
            
            val startCmd = "${AppConfig.dockerComposeCommand} start proxy"
            val process = ProcessBuilder("sh", "-c", startCmd)
                .directory(projectRoot)
                .redirectErrorStream(true)
                .start()
            
            val output = process.inputStream.bufferedReader().readText()
            val exitCode = process.waitFor()
            
            if (exitCode == 0) {
                logger.info("Proxy container started successfully")
                true to "Proxy container started successfully"
            } else {
                logger.error("Failed to start proxy container. Exit code: $exitCode")
                false to "Failed to start proxy container. Exit code: $exitCode\n$output"
            }
        } catch (e: Exception) {
            logger.error("Error starting proxy container", e)
            false to "Error starting proxy container: ${e.message}"
        }
    }

    override fun stopProxyContainer(): Pair<Boolean, String> {
        return try {
            logger.info("Stopping proxy container using compose...")
            val projectRoot = AppConfig.projectRoot
            
            val stopCmd = "${AppConfig.dockerComposeCommand} stop proxy"
            val process = ProcessBuilder("sh", "-c", stopCmd)
                .directory(projectRoot)
                .redirectErrorStream(true)
                .start()
            
            val output = process.inputStream.bufferedReader().readText()
            val exitCode = process.waitFor()
            
            if (exitCode == 0) {
                logger.info("Proxy container stopped successfully")
                true to "Proxy container stopped successfully"
            } else {
                logger.error("Failed to stop proxy container. Exit code: $exitCode")
                false to "Failed to stop proxy container. Exit code: $exitCode\n$output"
            }
        } catch (e: Exception) {
            logger.error("Error stopping proxy container", e)
            false to "Error stopping proxy container: ${e.message}"
        }
    }

    override fun restartProxyContainer(): Pair<Boolean, String> {
        return try {
            logger.info("Restarting proxy container using compose...")
            val projectRoot = AppConfig.projectRoot
            
            val restartCmd = "${AppConfig.dockerComposeCommand} restart proxy"
            val process = ProcessBuilder("sh", "-c", restartCmd)
                .directory(projectRoot)
                .redirectErrorStream(true)
                .start()
            
            val output = process.inputStream.bufferedReader().readText()
            val exitCode = process.waitFor()
            
            if (exitCode == 0) {
                logger.info("Proxy container restarted successfully")
                true to "Proxy container restarted successfully"
            } else {
                logger.error("Failed to restart proxy container. Exit code: $exitCode")
                false to "Failed to restart proxy container. Exit code: $exitCode\n$output"
            }
        } catch (e: Exception) {
            logger.error("Error restarting proxy container", e)
            false to "Error restarting proxy container: ${e.message}"
        }
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
            val projectRoot = AppConfig.projectRoot
            ensureComposeFile()
            
            // Ensure host directories exist
            val nginxDir = AppConfig.proxyDir
            val certbotDir = AppConfig.certbotDir
            nginxDir.mkdirs()
            File(nginxDir, "conf.d").mkdirs()
            
            val logsDir = File(nginxDir, "logs")
            logsDir.mkdirs()
            logsDir.setWritable(true, false)
            logsDir.setReadable(true, false)
            logsDir.setExecutable(true, false)
            
            val accessLog = File(logsDir, "access.log")
            if (!accessLog.exists()) {
                accessLog.createNewFile()
            }
            accessLog.setWritable(true, false)
            accessLog.setReadable(true, false)
            
            val errorLog = File(logsDir, "error.log")
            if (!errorLog.exists()) {
                errorLog.createNewFile()
            }
            errorLog.setWritable(true, false)
            errorLog.setReadable(true, false)
            
            certbotDir.mkdirs()
            File(certbotDir, "conf").mkdirs()
            File(certbotDir, "www").mkdirs()
            
            ensureNginxMainConfig()

            // Run compose up -d proxy
            val upCmd = "${AppConfig.dockerComposeCommand} up -d proxy"
            logger.info("Up command: $upCmd")
            
            val process = ProcessBuilder("sh", "-c", upCmd)
                .directory(projectRoot)
                .redirectErrorStream(true)
                .start()
            
            val output = process.inputStream.bufferedReader().readText()
            val exitCode = process.waitFor()
            
            if (exitCode == 0) {
                logger.info("Proxy container is ready via compose")
                true
            } else {
                logger.error("Failed to ensure proxy container. Exit code: $exitCode\n$output")
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
        return """
            services:
              proxy:
                build:
                  context: .
                  dockerfile: Dockerfile.proxy
                image: docker-manager-proxy:latest
                container_name: docker-manager-proxy
                network_mode: host
                restart: unless-stopped
                environment:
                  - TZ=Asia/Kolkata
                volumes:
                  - ./data/nginx/nginx.conf:/usr/local/openresty/nginx/conf/nginx.conf:ro
                  - ./data/nginx/conf.d:/etc/nginx/conf.d:ro
                  - ./data/nginx/logs:/usr/local/openresty/nginx/logs
                  - ./data/certbot/conf:/etc/letsencrypt
                  - ./data/certbot/www:/var/www/certbot
                  - ./data/certs:/etc/nginx/custom_certs:ro
                command: /usr/local/openresty/bin/openresty -g 'daemon off;'
        """.trimIndent()
    }

    private fun getDefaultDockerfileConfig(): String {
        return """
            FROM openresty/openresty:alpine
            
            # Install Certbot, OpenSSL, and utilities
            RUN apk add --no-cache \
                certbot \
                openssl \
                bash \
                curl \
                ca-certificates \
                tzdata
            
            # Create standard directories
            RUN mkdir -p /var/www/certbot /etc/letsencrypt /usr/local/openresty/nginx/logs
            
            # Set proper permissions
            RUN chmod 755 /var/www/certbot
            
            HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
                CMD curl -f http://localhost/ || exit 1
                
            CMD ["/usr/local/openresty/bin/openresty", "-g", "daemon off;"]
        """.trimIndent()
    }

    private fun ensureComposeFile(): File {
        val projectRoot = AppConfig.projectRoot
        val composeFile = File(projectRoot, "docker-compose.yml")
        if (!composeFile.exists()) {
            logger.info("Creating default docker-compose.yml in ${projectRoot.absolutePath}")
            composeFile.writeText(getDefaultComposeConfig())
        }
        ensureDockerfile()
        return composeFile
    }

    private fun ensureDockerfile(): File {
        val projectRoot = AppConfig.projectRoot
        val dockerfile = File(projectRoot, "Dockerfile.proxy")
        if (!dockerfile.exists()) {
            logger.info("Creating default Dockerfile.proxy in ${projectRoot.absolutePath}")
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
        return """
            worker_processes  1;
            events {
                worker_connections  1024;
            }
            http {
                include       mime.types;
                default_type  application/octet-stream;
                sendfile        on;
                keepalive_timeout  65;

                log_format  main  '${'$'}remote_addr - ${'$'}remote_user [${'$'}time_local] "${'$'}request" '
                                  '${'$'}status ${'$'}body_bytes_sent "${'$'}http_referer" '
                                  '"${'$'}http_user_agent" "${'$'}http_x_forwarded_for" "${'$'}host"';

                access_log  /usr/local/openresty/nginx/logs/access.log  main;
                error_log   /usr/local/openresty/nginx/logs/error.log;

                include /etc/nginx/conf.d/*.conf;
            }
        """.trimIndent()
    }

    override fun updateComposeConfig(content: String): Pair<Boolean, String> {
        return try {
            val composeFile = File(AppConfig.projectRoot, "docker-compose.yml")
            composeFile.writeText(content)
            true to "Compose configuration updated"
        } catch (e: Exception) {
            false to "Failed to update compose configuration: ${e.message}"
        }
    }

    override fun updateStatsSettings(active: Boolean, intervalMs: Long) {
        AppConfig.updateProxyStatsSettings(active, intervalMs)
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
