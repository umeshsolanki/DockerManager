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
}

class ProxyServiceImpl : IProxyService {
    private val logger = org.slf4j.LoggerFactory.getLogger(ProxyServiceImpl::class.java)
    private val configDir = AppConfig.proxyConfigDir
    private val logFile = AppConfig.proxyLogFile
    private val hostsFile = AppConfig.proxyHostsFile
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }

    private var cachedStats: ProxyStats =
        ProxyStats(0, emptyMap(), emptyMap(), emptyList(), emptyList())
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
                    updateStatsNatively()
                } catch (e: Exception) {
                    logger.error("Error updating stats", e)
                }
                delay(refreshIntervalMs)
            }
        }
    }

    private fun updateStatsNatively() {
        if (!logFile.exists()) return

        val totalHits = executeCommand("wc -l < ${logFile.absolutePath}").trim().toLongOrNull() ?: 0

        // Hits by Status
        val statusCounts =
            executeCommand("awk '{print \$9}' ${logFile.absolutePath} | sort | uniq -c").lineSequence()
                .filter { it.isNotBlank() }.associate {
                    val parts = it.trim().split("\\s+".toRegex())
                    parts[1].toInt() to parts[0].toLong()
                }

        // Hits over time (Last 24 hours approximation from last 5000 lines)
        val timeCounts =
            executeCommand("tail -n 5000 ${logFile.absolutePath} | awk -F'[' '{print \$2}' | awk -F':' '{print \$2\":00\"}' | sort | uniq -c").lineSequence()
                .filter { it.isNotBlank() }.associate {
                    val parts = it.trim().split("\\s+".toRegex())
                    parts[1] to parts[0].toLong()
                }

        // Top Paths
        val topPaths =
            executeCommand("awk '{print \$7}' ${logFile.absolutePath} | sort | uniq -c | sort -rn | head -n 5").lineSequence()
                .filter { it.isNotBlank() }.map {
                    val parts = it.trim().split("\\s+".toRegex())
                    parts[1] to parts[0].toLong()
                }.toList()

        // Recent Hits (Last 20)
        val recentHits = mutableListOf<ProxyHit>()
        val lineRegex =
            """^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) \S+" (\d+) (\d+) "([^"]*)" "([^"]*)"$""".toRegex()
        val dateFormat = SimpleDateFormat("dd/MMM/yyyy:HH:mm:ss Z", Locale.US)

        executeCommand("tail -n 20 ${logFile.absolutePath}").lineSequence()
            .filter { it.isNotBlank() }.forEach { line ->
                lineRegex.find(line)?.let { match ->
                    val (ip, dateStr, method, path, status, _, _, ua) = match.destructured
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
                            userAgent = ua
                        )
                    )
                }
            }

        cachedStats = ProxyStats(
            totalHits = totalHits,
            hitsByStatus = statusCounts,
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

        val sslConfig = if (host.ssl) {
            val (cert, key) = if (!host.customSslPath.isNullOrBlank() && host.customSslPath?.contains(
                    "|"
                ) == true
            ) {
                val parts = host.customSslPath!!.split("|")
                if (parts.size >= 2) parts[0] to parts[1] else "/etc/letsencrypt/live/${host.domain}/fullchain.pem" to "/etc/letsencrypt/live/${host.domain}/privkey.pem"
            } else {
                "/etc/letsencrypt/live/${host.domain}/fullchain.pem" to "/etc/letsencrypt/live/${host.domain}/privkey.pem"
            }

            // check if files exist
            if (!File(cert).exists() || !File(key).exists()) {
                logger.warn("Cert files missing for ${host.domain}")
                // Fallback to HTTP config
                return generateNginxConfig(host.copy(ssl = false)).copy(second = "SSL Certificate missing, fallback to HTTP")
            }

            val hstsHeader =
                if (host.hstsEnabled) "add_header Strict-Transport-Security \"max-age=31536000; includeSubDomains\" always;" else ""

            """
server {
    listen 443 ssl;
    server_name ${host.domain};

    ssl_certificate $cert;
    ssl_certificate_key $key;
    
    $hstsHeader

    location / {
        proxy_pass ${host.target};
        proxy_set_header Host ${'$'}host;
        proxy_set_header X-Real-IP ${'$'}remote_addr;
        proxy_set_header X-Forwarded-For ${'$'}proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto ${'$'}scheme;
        
        $wsConfig
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
            val composeFile = File(projectRoot, "docker-compose.yml")
            
            if (!composeFile.exists()) {
                return false to "docker-compose.yml not found in ${projectRoot.absolutePath}"
            }
            
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
            
            // Ensure host directories exist (as defined in docker-compose.yml bind mounts)
            val nginxDir = File(projectRoot, "data/nginx")
            val certbotDir = File(projectRoot, "data/certbot")
            
            nginxDir.mkdirs()
            File(nginxDir, "conf.d").mkdirs()
            File(nginxDir, "logs").mkdirs()
            certbotDir.mkdirs()
            File(certbotDir, "conf").mkdirs()
            File(certbotDir, "www").mkdirs()
            
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
            
            // Ensure host directories exist
            val nginxDir = File(projectRoot, "data/nginx")
            val certbotDir = File(projectRoot, "data/certbot")
            nginxDir.mkdirs()
            File(nginxDir, "conf.d").mkdirs()
            File(nginxDir, "logs").mkdirs()
            certbotDir.mkdirs()
            File(certbotDir, "conf").mkdirs()
            File(certbotDir, "www").mkdirs()

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

    private fun checkImageExists(): Boolean {
        return try {
            val cmd = "${AppConfig.dockerCommand} images -q $PROXY_IMAGE_NAME:$PROXY_IMAGE_TAG"
            val output = executeCommand(cmd).trim()
            output.isNotBlank()
        } catch (e: Exception) {
            logger.error("Error checking if image exists", e)
            false
        }
    }
}
