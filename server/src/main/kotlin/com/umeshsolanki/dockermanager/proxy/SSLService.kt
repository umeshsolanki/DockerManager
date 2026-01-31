package com.umeshsolanki.dockermanager.proxy

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.utils.ResourceLoader
import org.slf4j.LoggerFactory
import java.io.File
import java.nio.file.Files
import java.nio.file.attribute.PosixFilePermissions

interface ISSLService {
    fun requestSSL(host: ProxyHost, reloadCallback: (ProxyHost) -> Boolean): Boolean
    fun listCertificates(): List<SSLCertificate>
    fun resolveSslCertPaths(host: ProxyHost): Pair<String, String>
}

class SSLServiceImpl(
    private val executeCommand: (String) -> String,
) : ISSLService {
    private val logger = LoggerFactory.getLogger(SSLServiceImpl::class.java)

    override fun listCertificates(): List<SSLCertificate> {
        val certs = mutableListOf<SSLCertificate>()

        // Scan LetsEncrypt
        val leDir = AppConfig.letsEncryptDir
        if (leDir.exists()) {
            leDir.listFiles()?.filter { it.isDirectory }?.forEach { dir ->
                val fullchain = File(dir, "fullchain.pem")
                val privkey = File(dir, "privkey.pem")
                if (fullchain.exists() && privkey.exists()) {
                    // Try to get expiry and issuer
                    var expiry: Long? = null
                    var issuer: String? = null
                    try {
                        val output =
                            executeCommand("openssl x509 -enddate -issuer -noout -in ${fullchain.absolutePath}")
                        output.lineSequence().forEach { line ->
                            if (line.startsWith("notAfter=")) {
                                val dateStr = line.substringAfter("=").trim()
                                val sdf = java.text.SimpleDateFormat(
                                    "MMM dd HH:mm:ss yyyy z", java.util.Locale.US
                                )
                                expiry = sdf.parse(dateStr)?.time
                            } else if (line.startsWith("issuer=")) {
                                issuer = line.substringAfter("CN =").substringBefore(",").trim()
                                if (issuer == line) issuer = line.substringAfter("issuer=").trim()
                            }
                        }
                    } catch (e: Exception) {
                        logger.warn("Failed to get expiry for ${dir.name}: ${e.message}")
                    }

                    certs.add(
                        SSLCertificate(
                            id = dir.name,
                            domain = dir.name,
                            certPath = fullchain.absolutePath,
                            keyPath = privkey.absolutePath,
                            expiresAt = expiry,
                            issuer = issuer,
                            isWildcard = dir.name.startsWith("*")
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
                                keyPath = keyFile.absolutePath,
                                type = "custom"
                            )
                        )
                    }
                }
        }

        return certs
    }

    override fun requestSSL(host: ProxyHost, reloadCallback: (ProxyHost) -> Boolean): Boolean {
        try {
            // Check if wildcard certificate is requested
            if (host.isWildcard && host.sslChallengeType != "dns") {
                logger.error("Wildcard certificates require DNS-01 challenge. Aborting for ${host.domain}")
                return false
            }

            // Build domain arguments: for wildcard, include both base and wildcard domains
            val domainsArg = if (host.isWildcard) {
                "-d \"${host.domain}\" -d \"*.${host.domain}\""
            } else {
                "-d \"${host.domain}\""
            }

            // Email uses the domain directly
            val emailDomain = host.domain

            // Resolve DNS config from dnsConfigId if set, otherwise use inline fields
            val dnsConfig = host.dnsConfigId?.let { ProxyService.getDnsConfig(it) }
            val effectiveProvider = dnsConfig?.provider ?: host.dnsProvider
            val effectiveApiToken = dnsConfig?.apiToken ?: host.dnsApiToken
            val effectiveDnsHost = dnsConfig?.dnsHost ?: host.dnsHost
            val effectiveAuthUrl = dnsConfig?.authUrl ?: host.dnsAuthUrl
            val effectiveCleanupUrl = dnsConfig?.cleanupUrl ?: host.dnsCleanupUrl
            val effectiveAuthScript = dnsConfig?.authScript ?: host.dnsAuthScript
            val effectiveCleanupScript = dnsConfig?.cleanupScript ?: host.dnsCleanupScript

            // Updated to run in proxy container with standard paths
            val certCmd = if (host.sslChallengeType == "dns") {
                val dnsPlugin = when (effectiveProvider) {
                    "cloudflare" -> "dns-cloudflare"
                    "digitalocean" -> "dns-digitalocean"
                    else -> "manual"
                }

                if (dnsPlugin == "manual") {
                    val hasScripts = !effectiveAuthScript.isNullOrBlank()
                    val hasUrls = !effectiveAuthUrl.isNullOrBlank()
                    val hasHost = !effectiveDnsHost.isNullOrBlank()

                    if (hasScripts || hasUrls || hasHost) {
                        val confDir = File(AppConfig.certbotDir, "conf")
                        if (!confDir.exists()) confDir.mkdirs()

                        // Create auth script
                        val authScript = File(confDir, "dns-auth.sh")
                        val authContent = if (hasScripts) {
                            effectiveAuthScript
                        } else if (hasHost && effectiveAuthUrl == null) {
                            // Default GET template for auth (add)
                            val template =
                                ResourceLoader.loadResourceOrThrow("templates/proxy/dns-default-get.sh")
                            ResourceLoader.replacePlaceholders(
                                template, mapOf(
                                    "host" to effectiveDnsHost,
                                    "token" to (effectiveApiToken ?: ""),
                                    "domain" to host.domain,
                                    "action" to "add"
                                )
                            )
                        } else {
                            val hookTemplate =
                                ResourceLoader.loadResourceOrThrow("templates/proxy/dns-hook.sh")
                            ResourceLoader.replacePlaceholders(
                                hookTemplate, mapOf(
                                    "url" to (effectiveAuthUrl ?: ""),
                                    "token" to (effectiveApiToken ?: "")
                                )
                            )
                        }
                        authScript.writeText(authContent)

                        // Create cleanup script
                        var cleanupArg = ""
                        val hasCleanupScript = !effectiveCleanupScript.isNullOrBlank()
                        val hasCleanupUrl = !effectiveCleanupUrl.isNullOrBlank()

                        if (hasCleanupScript || hasCleanupUrl || hasHost) {
                            val cleanupScript = File(confDir, "dns-cleanup.sh")
                            val cleanupContent = if (hasCleanupScript) {
                                effectiveCleanupScript
                            } else if (hasHost && effectiveCleanupUrl == null) {
                                // Default GET template for cleanup (delete)
                                val template =
                                    ResourceLoader.loadResourceOrThrow("templates/proxy/dns-default-get.sh")
                                ResourceLoader.replacePlaceholders(
                                    template, mapOf(
                                        "host" to effectiveDnsHost,
                                        "token" to (effectiveApiToken ?: ""),
                                        "domain" to host.domain,
                                        "action" to "delete"
                                    )
                                )
                            } else {
                                val hookTemplate =
                                    ResourceLoader.loadResourceOrThrow("templates/proxy/dns-hook.sh")
                                ResourceLoader.replacePlaceholders(
                                    hookTemplate, mapOf(
                                        "url" to (effectiveCleanupUrl ?: ""),
                                        "token" to (effectiveApiToken ?: "")
                                    )
                                )
                            }
                            cleanupScript.writeText(cleanupContent)
                            executeCommand("${AppConfig.dockerCommand} exec docker-manager-proxy chmod +x /etc/letsencrypt/dns-cleanup.sh")
                            cleanupArg = "--manual-cleanup-hook /etc/letsencrypt/dns-cleanup.sh"
                        }

                        executeCommand("${AppConfig.dockerCommand} exec docker-manager-proxy chmod +x /etc/letsencrypt/dns-auth.sh")

                        "${AppConfig.dockerCommand} exec docker-manager-proxy certbot certonly --manual --preferred-challenges dns " + "--manual-auth-hook /etc/letsencrypt/dns-auth.sh $cleanupArg " + "$domainsArg --non-interactive --agree-tos --email admin@$emailDomain"
                    } else {
                        "${AppConfig.dockerCommand} exec docker-manager-proxy certbot certonly --manual --preferred-challenges dns $domainsArg --non-interactive --agree-tos --email admin@$emailDomain"
                    }
                } else {
                    // Create credentials file in certbot/conf dir
                    val confDir = File(AppConfig.certbotDir, "conf")
                    if (!confDir.exists()) confDir.mkdirs()

                    val credsFile = File(confDir, "dns-${effectiveProvider}.ini")
                    val credsContent = when (effectiveProvider) {
                        "cloudflare" -> "dns_cloudflare_api_token = ${effectiveApiToken}"
                        "digitalocean" -> "dns_digitalocean_token = ${effectiveApiToken}"
                        else -> ""
                    }
                    credsFile.writeText(credsContent)

                    // Set permissions for the file
                    try {
                        Files.setPosixFilePermissions(
                            credsFile.toPath(), PosixFilePermissions.fromString("rw-------")
                        )
                    } catch (e: Exception) {
                        logger.warn("Failed to set credentials file permissions on host, trying via container")
                        executeCommand("${AppConfig.dockerCommand} exec docker-manager-proxy chmod 600 /etc/letsencrypt/dns-${effectiveProvider}.ini")
                    }

                    val containerCredsPath = "/etc/letsencrypt/dns-${effectiveProvider}.ini"
                    "${AppConfig.dockerCommand} exec docker-manager-proxy certbot certonly --${dnsPlugin} --${dnsPlugin}-credentials ${containerCredsPath} $domainsArg --non-interactive --agree-tos --email admin@$emailDomain"
                }
            } else {
                "${AppConfig.dockerCommand} exec docker-manager-proxy certbot certonly --webroot -w /var/www/certbot $domainsArg --non-interactive --agree-tos --email admin@$emailDomain"
            }

            val result = executeCommand(certCmd)

            if (result.contains("Successfully received certificate") || result.contains("Certificate not yet due for renewal")) {
                // Fix permissions
                executeCommand("${AppConfig.dockerCommand} exec docker-manager-proxy chmod -R 755 /etc/letsencrypt")

                val updated = host.copy(ssl = true)
                return reloadCallback(updated)
            }
        } catch (e: Exception) {
            logger.error("SSL request failed for ${host.domain}", e)
        }
        return false
    }

    override fun resolveSslCertPaths(host: ProxyHost): Pair<String, String> {
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
        return File(folder, "fullchain.pem").absolutePath to File(
            folder, "privkey.pem"
        ).absolutePath
    }

    private fun findDomainFolder(liveDir: File, domain: String): File {
        if (!liveDir.exists()) return File(liveDir, domain)

        // Exact match
        val exact = File(liveDir, domain)
        if (exact.exists()) return exact

        // Wildcard or partial match
        val cleanDomain = domain.removePrefix("*.")
        val matches = liveDir.listFiles()?.filter {
            it.isDirectory && (it.name == cleanDomain || it.name.startsWith("$cleanDomain-"))
        }?.sortedByDescending { it.name }

        return matches?.firstOrNull() ?: exact
    }
}
