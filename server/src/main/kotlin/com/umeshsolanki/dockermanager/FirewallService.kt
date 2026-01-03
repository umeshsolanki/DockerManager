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
        // Initialize ipset if it doesn't exist
        executeCommand("$ipSetCmd create dm-blocklist hash:ip-port timeout 0 -exist")
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
                val cmdDocker =
                    "$iptablesCmd -I DOCKER-USER -s ${request.ip} -p $proto --dport ${request.port} -j DROP -m comment --comment \"dm-rule-$id\""
                val cmdHost =
                    "$iptablesCmd -I INPUT -s ${request.ip} -p $proto --dport ${request.port} -j DROP -m comment --comment \"dm-rule-$id\""

                executeCommand(cmdDocker).isNotEmpty() || executeCommand(cmdHost).isNotEmpty()
                true // Assume success if code reached here
            } else {
                // Use ipset for general IP blocking (more efficient)
                executeCommand("$ipSetCmd add dm-blocklist ${request.ip} -exist")

                // Ensure iptables is tracking the ipset for CONTAINER traffic
                executeCommand("$iptablesCmd -C DOCKER-USER -m set --match-set dm-blocklist src -j DROP -m comment --comment \"dm-managed\"").isEmpty()
                    .let { isMissing ->
                        if (isMissing) {
                            executeCommand("$iptablesCmd -I DOCKER-USER -m set --match-set dm-blocklist src -j DROP -m comment --comment \"dm-managed\"")
                        }
                    }

                // Ensure iptables is tracking the ipset for HOST traffic
                executeCommand("$iptablesCmd -C INPUT -m set --match-set dm-blocklist src -j DROP -m comment --comment \"dm-managed-host\"").isEmpty()
                    .let { isMissing ->
                        if (isMissing) {
                            executeCommand("$iptablesCmd -I INPUT -m set --match-set dm-blocklist src -j DROP -m comment --comment \"dm-managed-host\"")
                        }
                    }
                true
            }

            rules.add(newRule)
            saveRules(rules)
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    override fun unblockIP(id: String): Boolean {
        return try {
            val rules = loadRules()
            val rule = rules.find { it.id == id } ?: return false

            if (rule.port != null) {
                val proto = if (rule.protocol == "ALL") "tcp" else rule.protocol.lowercase()
                executeCommand("$iptablesCmd -D DOCKER-USER -s ${rule.ip} -p $proto --dport ${rule.port} -j DROP -m comment --comment \"dm-rule-$id\"")
                executeCommand("$iptablesCmd -D INPUT -s ${rule.ip} -p $proto --dport ${rule.port} -j DROP -m comment --comment \"dm-rule-$id\"")
            } else {
                executeCommand("$ipSetCmd del dm-blocklist ${rule.ip}")
            }

            rules.remove(rule)
            saveRules(rules)
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    override fun unblockIPByAddress(ip: String): Boolean {
        return try {
            val rules = loadRules()
            val rule = rules.find { it.ip == ip && it.port == null } ?: return false

            executeCommand("$ipSetCmd del dm-blocklist ${rule.ip}")

            rules.remove(rule)
            saveRules(rules)
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    override fun getIptablesVisualisation(): Map<String, List<IptablesRule>> {
        val output = executeCommand("$iptablesCmd -L -n -v")
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

    private fun syncRules() {
        // This would re-apply all rules from the JSON to iptables/ipset
        // Useful after a host or container restart
        val rules = loadRules()
        // Ensure the iptables jump to ipset exists for both chains
        executeCommand("$iptablesCmd -C DOCKER-USER -m set --match-set dm-blocklist src -j DROP -m comment --comment \"dm-managed\"").isEmpty()
            .let { isMissing ->
                if (isMissing) executeCommand("$iptablesCmd -I DOCKER-USER -m set --match-set dm-blocklist src -j DROP -m comment --comment \"dm-managed\"")
            }
        executeCommand("$iptablesCmd -C INPUT -m set --match-set dm-blocklist src -j DROP -m comment --comment \"dm-managed-host\"").isEmpty()
            .let { isMissing ->
                if (isMissing) executeCommand("$iptablesCmd -I INPUT -m set --match-set dm-blocklist src -j DROP -m comment --comment \"dm-managed-host\"")
            }

        rules.forEach { rule ->
            if (rule.port != null) {
                val proto = if (rule.protocol == "ALL") "tcp" else rule.protocol.lowercase()
                executeCommand("$iptablesCmd -I DOCKER-USER -s ${rule.ip} -p $proto --dport ${rule.port} -j DROP -m comment --comment \"dm-rule-${rule.id}\"")
                executeCommand("$iptablesCmd -I INPUT -s ${rule.ip} -p $proto --dport ${rule.port} -j DROP -m comment --comment \"dm-rule-${rule.id}\"")
            } else {
                executeCommand("$ipSetCmd add dm-blocklist ${rule.ip} -exist")
            }
        }
    }

    private fun executeCommand(command: String): String {
        return try {
            val processBuilder = ProcessBuilder("sh", "-c", command)
            processBuilder.environment()["LC_ALL"] = "C"
            val process = processBuilder.start()
            val output = process.inputStream.bufferedReader().readText()
            val error = process.errorStream.bufferedReader().readText()
            
            if (!process.waitFor(5, java.util.concurrent.TimeUnit.SECONDS)) {
                process.destroy()
                logger.error("Command timed out: $command")
                return ""
            }

            if (process.exitValue() != 0) {
                logger.warn("Command failed with exit code ${process.exitValue()}: $command")
                if (error.isNotBlank()) logger.warn("Error output: $error")
            } else {
                logger.debug("Command executed successfully: $command")
            }
            
            output
        } catch (e: Exception) {
            logger.error("Error executing command: $command", e)
            ""
        }
    }
}
