package com.umeshsolanki.dockermanager

import org.slf4j.LoggerFactory
import java.io.File

object AppConfig {
    private val logger = LoggerFactory.getLogger(AppConfig::class.java)

    val isDocker: Boolean by lazy {
        val inDocker = File("/.dockerenv").exists() || 
        (File("/proc/1/cgroup").exists() && File("/proc/1/cgroup").readText().contains("docker"))
        logger.info("Environment detection: isDocker=$inDocker")
        inDocker
    }

    val dockerCommand: String get() = if (isDocker) "/usr/bin/docker" else {
        if (File("/usr/bin/docker").exists()) "/usr/bin/docker" else "docker"
    }

    val dataRoot: File by lazy {
        if (isDocker) {
            File("/app/data")
        } else {
            val env = System.getenv("DATA_DIR")
            if (!env.isNullOrBlank()) {
                logger.info("Using custom DATA_DIR from env: $env")
                File(env)
            } else {
                val home = System.getProperty("user.home")
                logger.info("Using default data directory in user home: $home/.docker-manager/data")
                File(home, ".docker-manager/data")
            }
        }
    }
    
    //backup dirs
    val backupDir: File get() = File(dataRoot, "backups")
    val composeProjDir: File get() = File(dataRoot, "compose-ymls")

    // Proxy Service Configs
    val proxyDir: File get() = File(dataRoot, "nginx")
    val proxyConfigDir: File get() = File(proxyDir, "conf.d")
    val proxyLogFile: File get() = File(proxyDir, "logs/access.log")
    val proxyHostsFile: File get() = File(dataRoot, "proxy/hosts.json")
    
    // Log Service Configs
    val systemLogDir: File get() = if (isDocker) File("/host/var/log") else File("/var/log")
    
    // Btmp Service Configs
    val btmpLogFile: File get() = if (isDocker) File("/host/var/log/btmp") else File("/var/log/btmp")

    // Certs
    val certbotDir: File get() = File(dataRoot, "certbot")
    val letsEncryptDir: File get() = File(certbotDir, "conf/live")
    val customCertDir: File get() = File(dataRoot, "certs")
    
    // Firewall Configs
    val firewallDataDir: File get() = File(dataRoot, "firewall")
    // When running in docker, we mount these binaries. When running locally, assume they are in PATH or sbin.
    // NOTE: If user runs jar on valid linux, iptables should be in path.
    val iptablesCmd: String get() = if (isDocker) "/main/sbin/iptables" else "iptables"
    val ipsetCmd: String get() = if (isDocker) "/main/sbin/ipset" else "ipset"
}
