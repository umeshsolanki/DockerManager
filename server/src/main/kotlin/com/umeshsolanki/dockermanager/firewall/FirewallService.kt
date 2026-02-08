package com.umeshsolanki.dockermanager.firewall

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.ServiceContainer
import com.umeshsolanki.dockermanager.constants.FileConstants
import com.umeshsolanki.dockermanager.constants.FirewallConstants
import com.umeshsolanki.dockermanager.utils.CommandExecutor
import com.umeshsolanki.dockermanager.utils.JsonPersistence
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.io.File
import java.util.UUID
import kotlin.concurrent.withLock

class FirewallServiceImpl(
    private val ipReputationService: com.umeshsolanki.dockermanager.ip.IIpReputationService
) : IFirewallService {
    private val logger = org.slf4j.LoggerFactory.getLogger(FirewallServiceImpl::class.java)
    private val dataDir = AppConfig.firewallDataDir
    private val iptablesCmd = AppConfig.iptablesCmd
    private val ipSetCmd = AppConfig.ipsetCmd
    private val nftCmd = AppConfig.nftCmd
    private val rulesFile = File(dataDir, FileConstants.RULES_JSON)
    private val jsonPersistence = JsonPersistence.create<List<FirewallRule>>(
        file = rulesFile,
        defaultContent = emptyList(),
        loggerName = FirewallServiceImpl::class.java.name
    )
    private val commandExecutor = CommandExecutor(loggerName = FirewallServiceImpl::class.java.name)
    private val reputationScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val lock = java.util.concurrent.locks.ReentrantLock()

    // In-memory cache for rules to avoid frequent file reads
    @Volatile
    private var cachedRules: MutableList<FirewallRule>? = null

    init {
        // Initialize ipset
        // We use hash:ip because we only put raw IPs here. Port-specific blocks use direct iptables rules.
        val createSet =
            commandExecutor.execute("$ipSetCmd create ${FirewallConstants.IPSET_NAME} ${FirewallConstants.IPSET_TYPE} ${FirewallConstants.IPSET_TIMEOUT} -exist")
        if (createSet.exitCode != 0) {
            logger.error("Failed to create ipset: ${createSet.error}")
        }

        // Apply existing rules to iptables on startup
        syncRules()
    }


    private fun loadRules(): MutableList<FirewallRule> {
        cachedRules?.let { return it.toMutableList() }

        return lock.withLock {
            cachedRules?.let { return@withLock it.toMutableList() }
            val loaded = jsonPersistence.load().toMutableList()
            cachedRules = loaded
            loaded.toMutableList()
        }
    }

    private fun saveRules(rules: List<FirewallRule>) {
        lock.withLock {
            cachedRules = rules.toMutableList()
            jsonPersistence.save(rules)
        }
    }

    override fun listRules(): List<FirewallRule> = loadRules()

    override fun blockIP(request: BlockIPRequest): Boolean {
        return lock.withLock {
            if (AppConfig.isLocalIP(request.ip)) {
                logger.warn("Ignoring block request for local/private IP: ${request.ip}")
                return@withLock true
            }

            val rules = loadRules()

            if (rules.any { it.ip == request.ip && it.port == request.port && it.protocol == request.protocol }) {
                logger.info("IP ${request.ip} is already blocked with same parameters, skipping.")
                return@withLock true
            }

            val id = UUID.randomUUID().toString()
            val newRule = FirewallRule(
                id = id,
                ip = request.ip,
                port = request.port,
                protocol = request.protocol,
                comment = request.comment,
                expiresAt = request.expiresAt,
                country = request.country,
                city = request.city,
                isp = request.isp,
                lat = request.lat,
                lon = request.lon,
                timezone = request.timezone,
                zip = request.zip,
                region = request.region
            )

            val success = applyRule(newRule, add = true)

            if (success) {
                rules.add(newRule)
                saveRules(rules)

                // Record to Reputation DB asynchronously
                val blockTime = System.currentTimeMillis()
                reputationScope.launch {
                    try {
                        val durationMinutes = if (request.expiresAt != null) {
                            ((request.expiresAt - blockTime) / 60_000L).toInt().coerceAtLeast(0)
                        } else 0

                        ipReputationService.recordBlock(
                            ipAddress = request.ip,
                            reason = request.comment ?: "Manual Block",
                            countryCode = request.country,
                            durationMinutes = durationMinutes
                        )
                    } catch (e: Exception) {
                        logger.error("Failed to record IP reputation for ${request.ip}", e)
                    }
                }

                true
            } else {
                false
            }
        }
    }

    override fun unblockIP(id: String): Boolean {
        return lock.withLock {
            val rules = loadRules()
            val rule = rules.find { it.id == id } ?: return@withLock false

            if (applyRule(rule, add = false)) {
                rules.remove(rule)
                saveRules(rules)
                true
            } else {
                false
            }
        }
    }

    override fun unblockIPByAddress(ip: String): Boolean {
        return lock.withLock {
            val rules = loadRules()
            val ipRules = rules.filter { it.ip == ip && it.port == null }
            if (ipRules.isEmpty()) return@withLock false

            commandExecutor.execute("$ipSetCmd del ${FirewallConstants.IPSET_NAME} $ip")

            rules.removeAll(ipRules)
            saveRules(rules)
            true
        }
    }

    private fun applyRule(rule: FirewallRule, add: Boolean): Boolean {
        return if (rule.port != null) {
            val proto =
                if (rule.protocol == FirewallConstants.PROTOCOL_ALL) FirewallConstants.PROTOCOL_DEFAULT else rule.protocol.lowercase()
            val comment = "${FirewallConstants.COMMENT_PREFIX_RULE}${rule.id}"
            val flag = if (add) FirewallConstants.FLAG_INSERT else FirewallConstants.FLAG_DELETE

            // If adding, we check first to avoid duplicates (unless it's a delete, then we just try)
            if (add) {
                val checkD =
                    commandExecutor.execute("$iptablesCmd ${FirewallConstants.FLAG_WAIT} ${FirewallConstants.FLAG_CHECK} ${FirewallConstants.CHAIN_DOCKER_USER} -s ${rule.ip} -p $proto --dport ${rule.port} -j ${FirewallConstants.TARGET_DROP} -m comment --comment \"$comment\"")
                if (checkD.exitCode == 0) return true // Already exists
            }

            val cmdDocker =
                "$iptablesCmd ${FirewallConstants.FLAG_WAIT} $flag ${FirewallConstants.CHAIN_DOCKER_USER} -s ${rule.ip} -p $proto --dport ${rule.port} -j ${FirewallConstants.TARGET_DROP} -m comment --comment \"$comment\""
            val cmdHost =
                "$iptablesCmd ${FirewallConstants.FLAG_WAIT} $flag ${FirewallConstants.CHAIN_INPUT} -s ${rule.ip} -p $proto --dport ${rule.port} -j ${FirewallConstants.TARGET_DROP} -m comment --comment \"$comment\""

            val resDocker = commandExecutor.execute(cmdDocker)
            val resHost = commandExecutor.execute(cmdHost)

            if (resDocker.exitCode != 0) logger.warn("Failed to ${if (add) "apply" else "remove"} Docker rule: ${resDocker.error}")
            if (resHost.exitCode != 0) logger.warn("Failed to ${if (add) "apply" else "remove"} Host rule: ${resHost.error}")

            resDocker.exitCode == 0 || resHost.exitCode == 0
        } else {
            val cmd =
                if (add) "$ipSetCmd add ${FirewallConstants.IPSET_NAME} ${rule.ip} -exist" else "$ipSetCmd del ${FirewallConstants.IPSET_NAME} ${rule.ip}"
            val res = commandExecutor.execute(cmd)
            if (res.exitCode != 0) {
                logger.error("Failed to ${if (add) "add to" else "remove from"} ipset: ${res.error}")
                false
            } else {
                if (add) ensureBaseRules()
                true
            }
        }
    }


    override fun getIptablesVisualisation(): Map<String, List<IptablesRule>> {
        val res =
            commandExecutor.execute("$iptablesCmd ${FirewallConstants.FLAG_WAIT} ${FirewallConstants.FLAG_LIST} ${FirewallConstants.FLAG_NUMERIC} ${FirewallConstants.FLAG_VERBOSE}")
        if (res.exitCode != 0) return emptyMap()

        val output = res.output
        val chains = mutableMapOf<String, MutableList<IptablesRule>>()
        var currentChain = ""
        val whitespaceRegex = Regex("\\s+")

        output.lines().forEach { line ->
            val trimmed = line.trim()
            if (trimmed.startsWith("Chain")) {
                currentChain = trimmed.split(whitespaceRegex)[1]
                chains[currentChain] = mutableListOf()
            } else if (trimmed.isNotBlank() && !trimmed.startsWith("pkts") && currentChain.isNotBlank()) {
                val parts = trimmed.split(whitespaceRegex)
                if (parts.size >= 9) {
                    try {
                        chains[currentChain]?.add(
                            IptablesRule(
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
                        )
                    } catch (e: Exception) {
                        logger.warn("Failed to parse iptables rule line: $trimmed", e)
                    }
                }
            }
        }
        return chains
    }

    override fun getIptablesRaw(): String {
        val res = commandExecutor.execute("$iptablesCmd-save")
        if (res.exitCode != 0) {
            // Fallback to iptables -S if iptables-save failed or not found
            val resS = commandExecutor.execute("$iptablesCmd -S")
            if (resS.exitCode != 0) {
                logger.warn("Failed to get raw iptables: ${resS.error}")
                return "Error: ${resS.error}"
            }
            return filterIptablesOutput(resS.output)
        }
        return filterIptablesOutput(res.output)
    }

    /**
     * Filters out Docker Swarm specific rules (like ingress and isolation) that can cause
     * port conflicts and issues when restored manually or via persistence mechanisms
     * without an active Swarm state.
     */
    private fun filterIptablesOutput(output: String): String {
        if (output.isBlank()) return output
        return output.lines().filter { line ->
            val trimmed = line.trim()
            // Skip Docker Swarm ingress and isolation rules
            !trimmed.contains(
                "DOCKER-INGRESS",
                ignoreCase = true
            ) && !trimmed.contains("DOCKER-ISOLATION", ignoreCase = true)
        }.joinToString("\n")
    }

    override fun getNftablesVisualisation(): String {
        val res = commandExecutor.execute("$nftCmd list ruleset")
        if (res.exitCode != 0) {
            logger.warn("Failed to list nftables: ${res.error}")
            return "Error: ${res.error}"
        }
        return res.output
    }

    override fun getNftablesJson(): String {
        val res = commandExecutor.execute("$nftCmd -j list ruleset")
        if (res.exitCode != 0) {
            logger.warn("Failed to list nftables json: ${res.error}")
            return "{ \"error\": \"${res.error}\" }"
        }

        // Sanitize output: 
        // 1. Remove any non-JSON prefix (like warnings)
        val output = res.output
        val jsonStart = output.indexOf('{')
        val finalOutput = if (jsonStart > 0) output.substring(jsonStart) else output

        // 2. Remove invalid control characters (0-31) except allowed whitespace (tab, newline, carriage return)
        // These can't appear literally in JSON strings.
        return finalOutput.filter {
            val code = it.code
            code >= 32 || code == 9 || code == 10 || code == 13
        }
    }

    private fun ensureBaseRules() {
        val baseRules = listOf(
            Triple(
                FirewallConstants.CHAIN_DOCKER_USER,
                FirewallConstants.COMMENT_MANAGED,
                FirewallConstants.MATCH_SET_SRC
            ),
            Triple(
                FirewallConstants.CHAIN_INPUT,
                FirewallConstants.COMMENT_MANAGED_HOST,
                FirewallConstants.MATCH_SET_SRC
            )
        )

        baseRules.forEach { (chain, comment, match) ->
            val check =
                commandExecutor.execute("$iptablesCmd ${FirewallConstants.FLAG_WAIT} ${FirewallConstants.FLAG_CHECK} $chain -m set --match-set ${FirewallConstants.IPSET_NAME} $match -j ${FirewallConstants.TARGET_DROP} -m comment --comment \"$comment\"")
            if (check.exitCode != 0) {
                commandExecutor.execute("$iptablesCmd ${FirewallConstants.FLAG_WAIT} ${FirewallConstants.FLAG_INSERT} $chain -m set --match-set ${FirewallConstants.IPSET_NAME} $match -j ${FirewallConstants.TARGET_DROP} -m comment --comment \"$comment\"")
            }
        }
    }

    private fun syncRules() {
        val allRules = loadRules()
        val (localRules, validRules) = allRules.partition { AppConfig.isLocalIP(it.ip) }

        if (localRules.isNotEmpty()) {
            logger.info("Cleaning up ${localRules.size} local IPs from firewall rules")
            localRules.forEach { applyRule(it, add = false) }
            saveRules(validRules)
        }

        ensureBaseRules()
        validRules.forEach { applyRule(it, add = true) }
    }

    override fun updateRule(rule: FirewallRule): Boolean {
        return lock.withLock {
            val rules = loadRules()
            val index = rules.indexOfFirst { it.id == rule.id }
            if (index != -1) {
                rules[index] = rule
                saveRules(rules)
                true
            } else {
                false
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
    fun getIptablesRaw() = service.getIptablesRaw()
    fun getNftablesVisualisation() = service.getNftablesVisualisation()
    fun getNftablesJson() = service.getNftablesJson()
    fun updateRule(rule: FirewallRule) = service.updateRule(rule)
}



