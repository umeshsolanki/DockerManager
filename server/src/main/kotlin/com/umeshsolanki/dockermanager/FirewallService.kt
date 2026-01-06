package com.umeshsolanki.dockermanager

import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID

interface IFirewallService {
    fun listRules(): List<FirewallRule>
    fun blockIP(request: BlockIPRequest): Boolean
    fun unblockIP(id: String): Boolean
    fun unblockIPByAddress(ip: String): Boolean
    fun getIptablesVisualisation(): Map<String, List<IptablesRule>>
}

class FirewallServiceImpl : IFirewallService {
    private val logger = org.slf4j.LoggerFactory.getLogger(FirewallServiceImpl::class.java)
    private val dataDir = AppConfig.firewallDataDir
    private val iptablesCmd = AppConfig.iptablesCmd
    private val ipSetCmd = AppConfig.ipsetCmd
    private val rulesFile = File(dataDir, "rules.json")
    private val json = AppConfig.json

    init {
        if (!dataDir.exists()) dataDir.mkdirs()
        if (!rulesFile.exists()) rulesFile.writeText("[]")
        
        // Initialize ipset
        // We use hash:ip because we only put raw IPs here. Port-specific blocks use direct iptables rules.
        val createSet = executeCommand("$ipSetCmd create dm-blocklist-ip hash:ip timeout 0 -exist")
        if (createSet.exitCode != 0) {
            logger.error("Failed to create ipset: ${createSet.error}")
        }
        
        // Apply existing rules to iptables on startup
        syncRules()
    }

    private fun loadRules(): MutableList<FirewallRule> {
        return try {
            json.decodeFromString<List<FirewallRule>>(rulesFile.readText()).toMutableList()
        } catch (e: Exception) {
            logger.error("Error loading firewall rules", e)
            mutableListOf()
        }
    }

    private fun saveRules(rules: List<FirewallRule>) {
        rulesFile.writeText(json.encodeToString(rules))
    }

    override fun listRules(): List<FirewallRule> = loadRules()

    override fun blockIP(request: BlockIPRequest): Boolean {
        return try {
            if (AppConfig.isLocalIP(request.ip)) {
                logger.warn("Ignoring block request for local/private IP: ${request.ip}")
                return true // Return true as we've "handled" it by ignoring
            }

            val rules = loadRules()
            val id = UUID.randomUUID().toString()
            val newRule = FirewallRule(
                id = id,
                ip = request.ip,
                port = request.port,
                protocol = request.protocol,
                comment = request.comment
            )

            // Execute system command
            if (request.port != null) {
                val proto = if (request.protocol == "ALL") "tcp" else request.protocol.lowercase()
                // Use iptables for specific port blocking - For both Container and Host
                // Use -w to wait for lock
                val cmdDocker =
                    "$iptablesCmd -w -I DOCKER-USER -s ${request.ip} -p $proto --dport ${request.port} -j DROP -m comment --comment \"dm-rule-$id\""
                val cmdHost =
                    "$iptablesCmd -w -I INPUT -s ${request.ip} -p $proto --dport ${request.port} -j DROP -m comment --comment \"dm-rule-$id\""

                val resDocker = executeCommand(cmdDocker)
                val resHost = executeCommand(cmdHost)
                
                if (resDocker.exitCode != 0) logger.warn("Failed to apply Docker rule: ${resDocker.error}")
                if (resHost.exitCode != 0) logger.warn("Failed to apply Host rule: ${resHost.error}")

                (resDocker.exitCode == 0 || resHost.exitCode == 0)
            } else {
                // Use ipset for general IP blocking (more efficient)
                val resSet = executeCommand("$ipSetCmd add dm-blocklist-ip ${request.ip} -exist")
                if (resSet.exitCode != 0) {
                     logger.error("Failed to add to ipset: ${resSet.error}")
                     return false
                }

                ensureBaseRules()
                true
            }

            rules.add(newRule)
            saveRules(rules)
            true
        } catch (e: Exception) {
            logger.error("Exception in blockIP", e)
            false
        }
    }

    override fun unblockIP(id: String): Boolean {
        return try {
            val rules = loadRules()
            val rule = rules.find { it.id == id } ?: return false

            if (rule.port != null) {
                val proto = if (rule.protocol == "ALL") "tcp" else rule.protocol.lowercase()
                executeCommand("$iptablesCmd -w -D DOCKER-USER -s ${rule.ip} -p $proto --dport ${rule.port} -j DROP -m comment --comment \"dm-rule-$id\"")
                executeCommand("$iptablesCmd -w -D INPUT -s ${rule.ip} -p $proto --dport ${rule.port} -j DROP -m comment --comment \"dm-rule-$id\"")
            } else {
                executeCommand("$ipSetCmd del dm-blocklist-ip ${rule.ip}")
            }

            rules.remove(rule)
            saveRules(rules)
            true
        } catch (e: Exception) {
            logger.error("Exception in unblockIP", e)
            false
        }
    }

    override fun unblockIPByAddress(ip: String): Boolean {
        return try {
            val rules = loadRules()
            val rule = rules.find { it.ip == ip && it.port == null } ?: return false

            executeCommand("$ipSetCmd del dm-blocklist-ip ${rule.ip}")

            rules.remove(rule)
            saveRules(rules)
            true
        } catch (e: Exception) {
            logger.error("Exception in unblockIPByAddress", e)
            false
        }
    }

    override fun getIptablesVisualisation(): Map<String, List<IptablesRule>> {
        val res = executeCommand("$iptablesCmd -w -L -n -v")
        if (res.exitCode != 0) {
            logger.warn("Failed to list iptables: ${res.error}")
            return emptyMap()
        }
        val output = res.output
        val chains = mutableMapOf<String, MutableList<IptablesRule>>()
        var currentChain = ""

        output.lines().forEach { line ->
            val trimmed = line.trim()
            if (trimmed.startsWith("Chain")) {
                currentChain = trimmed.split(Regex("\\s+"))[1]
                chains[currentChain] = mutableListOf()
            } else if (trimmed.isNotBlank() && !trimmed.startsWith("pkts") && currentChain.isNotBlank()) {
                val parts = trimmed.split(Regex("\\s+"))
                if (parts.size >= 9) {
                    try {
                        val rule = IptablesRule(
                            pkts = parts[0],
                            bytes = parts[1],
                            target = parts[2],
                            prot = parts[3],
                            opt = parts[4],
                            ins = parts[5],
                            out = parts[6],
                            source = parts[7],
                            destination = parts[8],
                            extra = if (parts.size > 9) parts.drop(9).joinToString(" ") else ""
                        )
                        chains[currentChain]?.add(rule)
                    } catch (e: Exception) {
                        logger.warn("Failed to parse iptables rule line: $trimmed", e)
                    }
                }
            }
        }
        return chains
    }

    private fun ensureBaseRules() {
        // Ensure iptables is tracking the ipset for CONTAINER traffic
        // Check exit code of -C. 0 = exists, 1 = missing.
        val checkDocker = executeCommand("$iptablesCmd -w -C DOCKER-USER -m set --match-set dm-blocklist-ip src -j DROP -m comment --comment \"dm-managed\"")
        if (checkDocker.exitCode != 0) {
             executeCommand("$iptablesCmd -w -I DOCKER-USER -m set --match-set dm-blocklist-ip src -j DROP -m comment --comment \"dm-managed\"")
        }

        // Ensure iptables is tracking the ipset for HOST traffic
        val checkHost = executeCommand("$iptablesCmd -w -C INPUT -m set --match-set dm-blocklist-ip src -j DROP -m comment --comment \"dm-managed-host\"")
        if (checkHost.exitCode != 0) {
             executeCommand("$iptablesCmd -w -I INPUT -m set --match-set dm-blocklist-ip src -j DROP -m comment --comment \"dm-managed-host\"")
        }
    }

    private fun syncRules() {
        val allRules = loadRules()
        val (localRules, validRules) = allRules.partition { AppConfig.isLocalIP(it.ip) }
        
        if (localRules.isNotEmpty()) {
            logger.info("Cleaning up ${localRules.size} local IPs from firewall rules")
            localRules.forEach { rule ->
                if (rule.port != null) {
                    val proto = if (rule.protocol == "ALL") "tcp" else rule.protocol.lowercase()
                    executeCommand("$iptablesCmd -w -D DOCKER-USER -s ${rule.ip} -p $proto --dport ${rule.port} -j DROP -m comment --comment \"dm-rule-${rule.id}\"")
                    executeCommand("$iptablesCmd -w -D INPUT -s ${rule.ip} -p $proto --dport ${rule.port} -j DROP -m comment --comment \"dm-rule-${rule.id}\"")
                } else {
                    executeCommand("$ipSetCmd del dm-blocklist-ip ${rule.ip}")
                }
            }
            saveRules(validRules)
        }

        ensureBaseRules()

        validRules.forEach { rule ->
            if (rule.port != null) {
                val proto = if (rule.protocol == "ALL") "tcp" else rule.protocol.lowercase()
                // Just try to insert. If checks are hard, we might duplicate, but -C is better.
                // Simple approach: Delete then Insert (to avoid dupes) or just Insert (might dupe).
                // Let's check first.
                val comment = "dm-rule-${rule.id}"
                
                val checkD = executeCommand("$iptablesCmd -w -C DOCKER-USER -s ${rule.ip} -p $proto --dport ${rule.port} -j DROP -m comment --comment \"$comment\"")
                if (checkD.exitCode != 0) {
                    executeCommand("$iptablesCmd -w -I DOCKER-USER -s ${rule.ip} -p $proto --dport ${rule.port} -j DROP -m comment --comment \"$comment\"")
                }

                val checkH = executeCommand("$iptablesCmd -w -C INPUT -s ${rule.ip} -p $proto --dport ${rule.port} -j DROP -m comment --comment \"$comment\"")
                if (checkH.exitCode != 0) {
                    executeCommand("$iptablesCmd -w -I INPUT -s ${rule.ip} -p $proto --dport ${rule.port} -j DROP -m comment --comment \"$comment\"")
                }
            } else {
                executeCommand("$ipSetCmd add dm-blocklist-ip ${rule.ip} -exist")
            }
        }
    }

    data class ExecuteResult(val output: String, val error: String, val exitCode: Int)

    private fun executeCommand(command: String): ExecuteResult {
        return try {
            val processBuilder = ProcessBuilder("sh", "-c", command)
            processBuilder.environment()["LC_ALL"] = "C"
            val process = processBuilder.start()
            val output = process.inputStream.bufferedReader().readText()
            val error = process.errorStream.bufferedReader().readText()
            
            if (!process.waitFor(5, java.util.concurrent.TimeUnit.SECONDS)) {
                process.destroy()
                logger.error("Command timed out: $command")
                return ExecuteResult("", "Timed out", -1)
            }

            if (process.exitValue() != 0) {
                // Log only if it's not a Check command (checking usually fails which is fine)
                if (!command.contains(" -C ")) {
                    logger.warn("Command failed [${process.exitValue()}]: $command\nError: $error")
                }
            } else {
                logger.debug("Command success: $command")
            }
            
            ExecuteResult(output, error, process.exitValue())
        } catch (e: Exception) {
            logger.error("Error executing command: $command", e)
            ExecuteResult("", e.message ?: "Unknown error", -1)
        }
    }
}
