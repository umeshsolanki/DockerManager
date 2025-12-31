package com.umeshsolanki.dockermanager

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.util.*
import java.text.SimpleDateFormat

interface IProxyService {
    fun listHosts(): List<ProxyHost>
    fun createHost(host: ProxyHost): Boolean
    fun deleteHost(id: String): Boolean
    fun getStats(): ProxyStats
    fun toggleHost(id: String): Boolean
    fun requestSSL(id: String): Boolean
}

class ProxyServiceImpl : IProxyService {
    private val configDir = File("/nginx/conf.d")
    private val logFile = File("/nginx/logs/access.log")
    private val hostsFile = File("/app/data/proxy/hosts.json")
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }

    private var cachedStats: ProxyStats = ProxyStats(0, emptyMap(), emptyMap(), emptyList(), emptyList())
    private val refreshIntervalMs = 10000L // Configurable interval: 10 seconds

    init {
        if (!configDir.exists()) configDir.mkdirs()
        if (!hostsFile.parentFile.exists()) hostsFile.parentFile.mkdirs()
        if (!hostsFile.exists()) hostsFile.writeText("[]")
        
        // Start background worker for stats
        startStatsWorker()
    }

    private fun startStatsWorker() {
        Thread {
            while (true) {
                try {
                    updateStatsNatively()
                } catch (e: Exception) {
                    e.printStackTrace()
                }
                Thread.sleep(refreshIntervalMs)
            }
        }.apply { 
            isDaemon = true 
            start()
        }
    }

    private fun updateStatsNatively() {
        if (!logFile.exists()) return

        val totalHits = executeCommand("wc -l < ${logFile.absolutePath}").trim().toLongOrNull() ?: 0
        
        // Hits by Status
        val statusCounts = executeCommand("awk '{print ${'$'}9}' ${logFile.absolutePath} | sort | uniq -c")
            .lineSequence()
            .filter { it.isNotBlank() }
            .associate { 
                val parts = it.trim().split("\\s+".toRegex())
                parts[1].toInt() to parts[0].toLong()
            }

        // Hits over time (Last 24 hours approximation from last 5000 lines)
        val timeCounts = executeCommand("tail -n 5000 ${logFile.absolutePath} | awk -F'[' '{print ${'$'}2}' | awk -F':' '{print ${'$'}2\":00\"}' | sort | uniq -c")
            .lineSequence()
            .filter { it.isNotBlank() }
            .associate {
                val parts = it.trim().split("\\s+".toRegex())
                parts[1] to parts[0].toLong()
            }

        // Top Paths
        val topPaths = executeCommand("awk '{print ${'$'}7}' ${logFile.absolutePath} | sort | uniq -c | sort -rn | head -n 5")
            .lineSequence()
            .filter { it.isNotBlank() }
            .map {
                val parts = it.trim().split("\\s+".toRegex())
                parts[1] to parts[0].toLong()
            }
            .toList()

        // Recent Hits (Last 20)
        val recentHits = mutableListOf<ProxyHit>()
        val lineRegex = """^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) \S+" (\d+) (\d+) "([^"]*)" "([^"]*)"$""".toRegex()
        val dateFormat = SimpleDateFormat("dd/MMM/yyyy:HH:mm:ss Z", Locale.US)
        
        executeCommand("tail -n 20 ${logFile.absolutePath}")
            .lineSequence()
            .filter { it.isNotBlank() }
            .forEach { line ->
                lineRegex.find(line)?.let { match ->
                    val (ip, dateStr, method, path, status, size, referer, ua) = match.destructured
                    recentHits.add(ProxyHit(
                        timestamp = try { dateFormat.parse(dateStr).time } catch (e: Exception) { System.currentTimeMillis() },
                        ip = ip,
                        method = method,
                        path = path,
                        status = status.toInt(),
                        responseTime = 0,
                        userAgent = ua
                    ))
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

    override fun createHost(host: ProxyHost): Boolean {
        return try {
            val hosts = loadHosts()
            val newHost = if (host.id.isEmpty()) host.copy(id = UUID.randomUUID().toString()) else host
            hosts.add(newHost)
            generateNginxConfig(newHost)
            saveHosts(hosts)
            reloadNginx()
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
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
            val certCmd = "docker exec docker-manager-certbot certbot certonly --webroot -w /certbot/www -d ${host.domain} --non-interactive --agree-tos --email admin@${host.domain} --config-dir /certbot/conf --work-dir /certbot/work --logs-dir /certbot/logs"
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
            e.printStackTrace()
        }
        return false
    }

    private fun executeCommand(command: String): String {
        return try {
            val process = ProcessBuilder("sh", "-c", command).start()
            process.inputStream.bufferedReader().readText()
        } catch (e: Exception) {
            ""
        }
    }

    private fun generateNginxConfig(host: ProxyHost) {
        val config = """
server {
    listen 80;
    server_name ${host.domain};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        ${if (host.ssl) "return 301 https://${'$'}host${'$'}request_uri;" else ""}
        ${if (!host.ssl) """
        proxy_pass ${host.target};
        proxy_set_header Host ${'$'}host;
        proxy_set_header X-Real-IP ${'$'}remote_addr;
        proxy_set_header X-Forwarded-For ${'$'}proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto ${'$'}scheme;
        """.trimIndent() else ""}
    }
}

${if (host.ssl) """
server {
    listen 443 ssl;
    server_name ${host.domain};

    ssl_certificate /etc/letsencrypt/live/${host.domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${host.domain}/privkey.pem;

    location / {
        proxy_pass ${host.target};
        proxy_set_header Host ${'$'}host;
        proxy_set_header X-Real-IP ${'$'}remote_addr;
        proxy_set_header X-Forwarded-For ${'$'}proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto ${'$'}scheme;
    }
}
""".trimIndent() else ""}
        """.trimIndent()
        File(configDir, "${host.domain}.conf").writeText(config)
    }

    private fun reloadNginx() {
        try {
            // Signal OpenResty container to reload
            ProcessBuilder("docker", "exec", "docker-manager-proxy", "openresty", "-s", "reload").start()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
