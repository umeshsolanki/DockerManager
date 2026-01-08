package com.umeshsolanki.dockermanager.firewall

import com.umeshsolanki.dockermanager.*
import com.umeshsolanki.dockermanager.ServiceContainer
import com.umeshsolanki.dockermanager.utils.CommandExecutor
import com.umeshsolanki.dockermanager.utils.JsonPersistence
import com.umeshsolanki.dockermanager.constants.FirewallConstants
import com.umeshsolanki.dockermanager.constants.FileConstants
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
    private val rulesFile = File(dataDir, FileConstants.RULES_JSON)
    private val jsonPersistence = JsonPersistence.create<List<FirewallRule>>(
        file = rulesFile,
        defaultContent = emptyList(),
        loggerName = FirewallServiceImpl::class.java.name
    )
    private val commandExecutor = CommandExecutor(loggerName = FirewallServiceImpl::class.java.name)
    private val lock = java.util.concurrent.locks.ReentrantLock()


    init {
        // Initialize ipset
        // We use hash:ip because we only put raw IPs here. Port-specific blocks use direct iptables rules.
        val createSet = commandExecutor.execute("$ipSetCmd create ${FirewallConstants.IPSET_NAME} ${FirewallConstants.IPSET_TYPE} ${FirewallConstants.IPSET_TIMEOUT} -exist")
        if (createSet.exitCode != 0) {
            logger.error("Failed to create ipset: ${createSet.error}")
        }
        
        // Apply existing rules to iptables on startup
        syncRules()
    }


    private fun loadRules(): MutableList<FirewallRule> {
        return jsonPersistence.load().toMutableList()
    }

    private fun saveRules(rules: List<FirewallRule>) {
        jsonPersistence.save(rules)
    }

    override fun listRules(): List<FirewallRule> = loadRules()

    override fun blockIP(request: BlockIPRequest): Boolean {
        lock.lock()
        return try {
            if (AppConfig.isLocalIP(request.ip)) {
                logger.warn("Ignoring block request for local/private IP: ${request.ip}")
                return true
            }

            val rules = loadRules()
            
            // Check for duplicate (same IP, port, protocol)
            if (rules.any { it.ip == request.ip && it.port == request.port && it.protocol == request.protocol }) {
                logger.info("IP ${request.ip} is already blocked with same parameters, skipping.")
                return true
            }

            val id = UUID.randomUUID().toString()
            val newRule = FirewallRule(
                id = id,
                ip = request.ip,
                port = request.port,
                protocol = request.protocol,
                comment = request.comment,
                expiresAt = request.expiresAt,
                country = request.country
            )

            // Execute system command
            val success = if (request.port != null) {
                val proto = if (request.protocol == FirewallConstants.PROTOCOL_ALL) FirewallConstants.PROTOCOL_DEFAULT else request.protocol.lowercase()
                val comment = "${FirewallConstants.COMMENT_PREFIX_RULE}$id"
                val cmdDocker =
                    "$iptablesCmd ${FirewallConstants.FLAG_WAIT} ${FirewallConstants.FLAG_INSERT} ${FirewallConstants.CHAIN_DOCKER_USER} -s ${request.ip} -p $proto --dport ${request.port} -j ${FirewallConstants.TARGET_DROP} -m comment --comment \"$comment\""
                val cmdHost =
                    "$iptablesCmd ${FirewallConstants.FLAG_WAIT} ${FirewallConstants.FLAG_INSERT} ${FirewallConstants.CHAIN_INPUT} -s ${request.ip} -p $proto --dport ${request.port} -j ${FirewallConstants.TARGET_DROP} -m comment --comment \"$comment\""

                val resDocker = commandExecutor.execute(cmdDocker)
                val resHost = commandExecutor.execute(cmdHost)
                
                if (resDocker.exitCode != 0) logger.warn("Failed to apply Docker rule: ${resDocker.error}")
                if (resHost.exitCode != 0) logger.warn("Failed to apply Host rule: ${resHost.error}")
                
                resDocker.exitCode == 0 || resHost.exitCode == 0
            } else {
                val resSet = commandExecutor.execute("$ipSetCmd add ${FirewallConstants.IPSET_NAME} ${request.ip} -exist")
                if (resSet.exitCode != 0) {
                     logger.error("Failed to add to ipset: ${resSet.error}")
                     false
                } else {
                    ensureBaseRules()
                    true
                }
            }

            if (success) {
                rules.add(newRule)
                saveRules(rules)
                true
            } else {
                false
            }
        } catch (e: Exception) {
            logger.error("Exception in blockIP", e)
            false
        } finally {
            lock.unlock()
        }
    }

    override fun unblockIP(id: String): Boolean {
        lock.lock()
        return try {
            val rules = loadRules()
            val rule = rules.find { it.id == id } ?: return false

            if (rule.port != null) {
                val proto = if (rule.protocol == FirewallConstants.PROTOCOL_ALL) FirewallConstants.PROTOCOL_DEFAULT else rule.protocol.lowercase()
                val comment = "${FirewallConstants.COMMENT_PREFIX_RULE}$id"
                commandExecutor.execute("$iptablesCmd ${FirewallConstants.FLAG_WAIT} ${FirewallConstants.FLAG_DELETE} ${FirewallConstants.CHAIN_DOCKER_USER} -s ${rule.ip} -p $proto --dport ${rule.port} -j ${FirewallConstants.TARGET_DROP} -m comment --comment \"$comment\"")
                commandExecutor.execute("$iptablesCmd ${FirewallConstants.FLAG_WAIT} ${FirewallConstants.FLAG_DELETE} ${FirewallConstants.CHAIN_INPUT} -s ${rule.ip} -p $proto --dport ${rule.port} -j ${FirewallConstants.TARGET_DROP} -m comment --comment \"$comment\"")
            } else {
                commandExecutor.execute("$ipSetCmd del ${FirewallConstants.IPSET_NAME} ${rule.ip}")
            }

            rules.remove(rule)
            saveRules(rules)
            true
        } catch (e: Exception) {
            logger.error("Exception in unblockIP", e)
            false
        } finally {
            lock.unlock()
        }
    }

    override fun unblockIPByAddress(ip: String): Boolean {
        lock.lock()
        return try {
            val rules = loadRules()
            // Find all rules for this IP that are full IP blocks (no port)
            val ipRules = rules.filter { it.ip == ip && it.port == null }
            if (ipRules.isEmpty()) return false

            commandExecutor.execute("$ipSetCmd del ${FirewallConstants.IPSET_NAME} $ip")

            rules.removeAll(ipRules)
            saveRules(rules)
            true
        } catch (e: Exception) {
            logger.error("Exception in unblockIPByAddress", e)
            false
        } finally {
            lock.unlock()
        }
    }



    override fun getIptablesVisualisation(): Map<String, List<IptablesRule>> {
        val res = commandExecutor.execute("$iptablesCmd ${FirewallConstants.FLAG_WAIT} ${FirewallConstants.FLAG_LIST} ${FirewallConstants.FLAG_NUMERIC} ${FirewallConstants.FLAG_VERBOSE}")
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
        val checkDocker = commandExecutor.execute("$iptablesCmd ${FirewallConstants.FLAG_WAIT} ${FirewallConstants.FLAG_CHECK} ${FirewallConstants.CHAIN_DOCKER_USER} -m set --match-set ${FirewallConstants.IPSET_NAME} ${FirewallConstants.MATCH_SET_SRC} -j ${FirewallConstants.TARGET_DROP} -m comment --comment \"${FirewallConstants.COMMENT_MANAGED}\"")
        if (checkDocker.exitCode != 0) {
             commandExecutor.execute("$iptablesCmd ${FirewallConstants.FLAG_WAIT} ${FirewallConstants.FLAG_INSERT} ${FirewallConstants.CHAIN_DOCKER_USER} -m set --match-set ${FirewallConstants.IPSET_NAME} ${FirewallConstants.MATCH_SET_SRC} -j ${FirewallConstants.TARGET_DROP} -m comment --comment \"${FirewallConstants.COMMENT_MANAGED}\"")
        }

        // Ensure iptables is tracking the ipset for HOST traffic
        val checkHost = commandExecutor.execute("$iptablesCmd ${FirewallConstants.FLAG_WAIT} ${FirewallConstants.FLAG_CHECK} ${FirewallConstants.CHAIN_INPUT} -m set --match-set ${FirewallConstants.IPSET_NAME} ${FirewallConstants.MATCH_SET_SRC} -j ${FirewallConstants.TARGET_DROP} -m comment --comment \"${FirewallConstants.COMMENT_MANAGED_HOST}\"")
        if (checkHost.exitCode != 0) {
             commandExecutor.execute("$iptablesCmd ${FirewallConstants.FLAG_WAIT} ${FirewallConstants.FLAG_INSERT} ${FirewallConstants.CHAIN_INPUT} -m set --match-set ${FirewallConstants.IPSET_NAME} ${FirewallConstants.MATCH_SET_SRC} -j ${FirewallConstants.TARGET_DROP} -m comment --comment \"${FirewallConstants.COMMENT_MANAGED_HOST}\"")
        }
    }

    private fun syncRules() {
        val allRules = loadRules()
        val (localRules, validRules) = allRules.partition { AppConfig.isLocalIP(it.ip) }
        
        if (localRules.isNotEmpty()) {
            logger.info("Cleaning up ${localRules.size} local IPs from firewall rules")
            localRules.forEach { rule ->
                if (rule.port != null) {
                    val proto = if (rule.protocol == FirewallConstants.PROTOCOL_ALL) FirewallConstants.PROTOCOL_DEFAULT else rule.protocol.lowercase()
                    val comment = "${FirewallConstants.COMMENT_PREFIX_RULE}${rule.id}"
                    commandExecutor.execute("$iptablesCmd ${FirewallConstants.FLAG_WAIT} ${FirewallConstants.FLAG_DELETE} ${FirewallConstants.CHAIN_DOCKER_USER} -s ${rule.ip} -p $proto --dport ${rule.port} -j ${FirewallConstants.TARGET_DROP} -m comment --comment \"$comment\"")
                    commandExecutor.execute("$iptablesCmd ${FirewallConstants.FLAG_WAIT} ${FirewallConstants.FLAG_DELETE} ${FirewallConstants.CHAIN_INPUT} -s ${rule.ip} -p $proto --dport ${rule.port} -j ${FirewallConstants.TARGET_DROP} -m comment --comment \"$comment\"")
                } else {
                    commandExecutor.execute("$ipSetCmd del ${FirewallConstants.IPSET_NAME} ${rule.ip}")
                }
            }
            saveRules(validRules)
        }

        ensureBaseRules()

        validRules.forEach { rule ->
            if (rule.port != null) {
                val proto = if (rule.protocol == FirewallConstants.PROTOCOL_ALL) FirewallConstants.PROTOCOL_DEFAULT else rule.protocol.lowercase()
                // Just try to insert. If checks are hard, we might duplicate, but -C is better.
                // Simple approach: Delete then Insert (to avoid dupes) or just Insert (might dupe).
                // Let's check first.
                val comment = "${FirewallConstants.COMMENT_PREFIX_RULE}${rule.id}"
                
                val checkD = commandExecutor.execute("$iptablesCmd ${FirewallConstants.FLAG_WAIT} ${FirewallConstants.FLAG_CHECK} ${FirewallConstants.CHAIN_DOCKER_USER} -s ${rule.ip} -p $proto --dport ${rule.port} -j ${FirewallConstants.TARGET_DROP} -m comment --comment \"$comment\"")
                if (checkD.exitCode != 0) {
                    commandExecutor.execute("$iptablesCmd ${FirewallConstants.FLAG_WAIT} ${FirewallConstants.FLAG_INSERT} ${FirewallConstants.CHAIN_DOCKER_USER} -s ${rule.ip} -p $proto --dport ${rule.port} -j ${FirewallConstants.TARGET_DROP} -m comment --comment \"$comment\"")
                }

                val checkH = commandExecutor.execute("$iptablesCmd ${FirewallConstants.FLAG_WAIT} ${FirewallConstants.FLAG_CHECK} ${FirewallConstants.CHAIN_INPUT} -s ${rule.ip} -p $proto --dport ${rule.port} -j ${FirewallConstants.TARGET_DROP} -m comment --comment \"$comment\"")
                if (checkH.exitCode != 0) {
                    commandExecutor.execute("$iptablesCmd ${FirewallConstants.FLAG_WAIT} ${FirewallConstants.FLAG_INSERT} ${FirewallConstants.CHAIN_INPUT} -s ${rule.ip} -p $proto --dport ${rule.port} -j ${FirewallConstants.TARGET_DROP} -m comment --comment \"$comment\"")
                }
            } else {
                commandExecutor.execute("$ipSetCmd add ${FirewallConstants.IPSET_NAME} ${rule.ip} -exist")
            }
        }
    }

}

// Service object for easy access
object FirewallService {
    private val service: IFirewallService get() = ServiceContainer.firewallService
    
    fun listRules() = service.listRules()
    fun blockIP(request: BlockIPRequest) = service.blockIP(request)
    fun unblockIP(id: String) = service.unblockIP(id)
    fun unblockIPByAddress(ip: String) = service.unblockIPByAddress(ip)
    fun getIptablesVisualisation() = service.getIptablesVisualisation()
}



