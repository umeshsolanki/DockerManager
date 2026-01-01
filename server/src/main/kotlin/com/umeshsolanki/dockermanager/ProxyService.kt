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
            val certCmd =
                "${AppConfig.dockerCommand} exec docker-manager-certbot certbot certonly --webroot -w /certbot/www -d ${host.domain} --non-interactive --agree-tos --email admin@${host.domain} --config-dir /certbot/conf --work-dir /certbot/work --logs-dir /certbot/logs"
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
            val process = ProcessBuilder("sh", "-c", command).start()
            process.inputStream.bufferedReader().readText()
        } catch (e: Exception) {
            logger.error("executeCommand", e)
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
}
