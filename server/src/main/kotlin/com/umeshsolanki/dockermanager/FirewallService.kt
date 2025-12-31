package com.umeshsolanki.dockermanager

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID

interface IFirewallService {
    fun listRules(): List<FirewallRule>
    fun blockIP(request: BlockIPRequest): Boolean
    fun unblockIP(id: String): Boolean
}

class FirewallServiceImpl : IFirewallService {
    private val dataDir = File("/app/data/firewall")
    private val rulesFile = File(dataDir, "rules.json")
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }

    init {
        if (!dataDir.exists()) dataDir.mkdirs()
        if (!rulesFile.exists()) rulesFile.writeText("[]")
        // Initialize ipset if it doesn't exist
        executeCommand("ipset create dm-blocklist hash:ip-port timeout 0 -exist")
        // Apply existing rules to iptables on startup
        syncRules()
    }

    private fun loadRules(): MutableList<FirewallRule> {
        return try {
            json.decodeFromString<List<FirewallRule>>(rulesFile.readText()).toMutableList()
        } catch (e: Exception) {
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
            val success = if (request.port != null) {
                val proto = if (request.protocol == "ALL") "tcp" else request.protocol.lowercase()
                // Use iptables for specific port blocking
                val cmd = "iptables -I DOCKER-USER -s ${request.ip} -p $proto --dport ${request.port} -j DROP -m comment --comment \"dm-rule-$id\""
                executeCommand(cmd).isNotEmpty()
            } else {
                // Use ipset for general IP blocking (more efficient)
                executeCommand("ipset add dm-blocklist ${request.ip} -exist").isNotEmpty()
                // Ensure iptables is tracking the ipset
                executeCommand("iptables -C DOCKER-USER -m set --match-set dm-blocklist src -j DROP -m comment --comment \"dm-managed\"").isEmpty().let { isMissing ->
                    if (isMissing) {
                        executeCommand("iptables -I DOCKER-USER -m set --match-set dm-blocklist src -j DROP -m comment --comment \"dm-managed\"")
                    }
                }
                true
            }

            if (success) {
                rules.add(newRule)
                saveRules(rules)
                true
            } else false
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
                executeCommand("iptables -D DOCKER-USER -s ${rule.ip} -p $proto --dport ${rule.port} -j DROP -m comment --comment \"dm-rule-$id\"")
            } else {
                executeCommand("ipset del dm-blocklist ${rule.ip}")
            }

            rules.remove(rule)
            saveRules(rules)
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    private fun syncRules() {
        // This would re-apply all rules from the JSON to iptables/ipset
        // Useful after a host or container restart
        val rules = loadRules()
        // Ensure the iptables jump to ipset exists
        executeCommand("iptables -I DOCKER-USER -m set --match-set dm-blocklist src -j DROP -m comment --comment \"dm-managed\"")
        
        rules.forEach { rule ->
            if (rule.port != null) {
                val proto = if (rule.protocol == "ALL") "tcp" else rule.protocol.lowercase()
                executeCommand("iptables -I DOCKER-USER -s ${rule.ip} -p $proto --dport ${rule.port} -j DROP -m comment --comment \"dm-rule-${rule.id}\"")
            } else {
                executeCommand("ipset add dm-blocklist ${rule.ip} -exist")
            }
        }
    }

    private fun executeCommand(command: String): String {
        return try {
            val process = ProcessBuilder("sh", "-c", command).start()
            process.waitFor(5, java.util.concurrent.TimeUnit.SECONDS)
            process.inputStream.bufferedReader().readText()
        } catch (e: Exception) {
            ""
        }
    }
}
