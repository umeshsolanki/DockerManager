package com.umeshsolanki.dockermanager.dns

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.docker.DockerService
import com.umeshsolanki.dockermanager.utils.CommandExecutor
import com.umeshsolanki.dockermanager.utils.JsonPersistence
import com.umeshsolanki.dockermanager.utils.ResourceLoader

import org.slf4j.LoggerFactory
import java.io.File
import java.util.UUID
import kotlin.concurrent.withLock

class DnsServiceImpl : IDnsService {

    private val logger = LoggerFactory.getLogger(DnsServiceImpl::class.java)
    private val lock = java.util.concurrent.locks.ReentrantLock()
    private val commandExecutor = CommandExecutor(loggerName = DnsServiceImpl::class.java.name)
    private val longCmdExecutor = CommandExecutor(timeoutSeconds = 300, loggerName = DnsServiceImpl::class.java.name)
    private val isMac = System.getProperty("os.name").lowercase().contains("mac")

    private val dataDir = File(AppConfig.dataRoot, "binddns")
    private val dnsComposeDir = File(AppConfig.composeProjDir, "dnsbind")

    private fun getBindDataPath(): File {
        if (isDockerMode) {
            val envFile = File(dnsComposeDir, ".env")
            if (envFile.exists()) {
                envFile.readLines().forEach { line ->
                    if (line.startsWith("BIND9_DATA_PATH=")) {
                        val path = line.substringAfter("=").trim()
                        return File(if (File(path).isAbsolute) path else File(AppConfig.dataRoot, path).absolutePath)
                    }
                }
            }
            return File(dataDir, "data") // Used to be bind9/data, now just binddns/data
        }
        return dataDir
    }

    private val zonesDir: File get() = if (isDockerMode) getBindDataPath() else File(dataDir, "zones")
    private val keysDir: File get() = if (isDockerMode) File(getBindDataPath(), "keys") else File(dataDir, "keys")
    private val dnsComposeFile get() = File(dnsComposeDir, "docker-compose.yml")

    private val isDockerMode: Boolean
        get() = dnsComposeFile.exists()

    private val containerName: String
        get() {
            val envFile = File(dnsComposeDir, ".env")
            if (envFile.exists()) {
                envFile.readLines().forEach { line ->
                    if (line.startsWith("BIND9_CONTAINER_NAME=")) return line.substringAfter("=").trim()
                }
            }
            return "bind9"
        }

    private fun bindCmd(command: String): String =
        if (isDockerMode) "${AppConfig.dockerCommand} exec $containerName $command" else command

    private fun bindExec(command: String) = commandExecutor.execute(bindCmd(command))

    private fun containerConfigDir(): String = if (isDockerMode) "/etc/bind" else getHostNamedConfDir()
    private fun containerZonesDir(): String = if (isDockerMode) "/var/lib/bind" else zonesDir.absolutePath
    private fun containerKeysDir(): String = if (isDockerMode) "/var/lib/bind/keys" else keysDir.absolutePath

    private val zonesPersistence = JsonPersistence.create<List<DnsZone>>(
        file = File(dataDir, "zones-metadata.json"),
        defaultContent = emptyList(),
        loggerName = DnsServiceImpl::class.java.name
    )
    private val aclsPersistence = JsonPersistence.create<List<DnsAcl>>(
        file = File(dataDir, "acls.json"),
        defaultContent = emptyList(),
        loggerName = DnsServiceImpl::class.java.name
    )
    private val tsigPersistence = JsonPersistence.create<List<TsigKey>>(
        file = File(dataDir, "tsig-keys.json"),
        defaultContent = emptyList(),
        loggerName = DnsServiceImpl::class.java.name
    )
    private val forwarderPersistence = JsonPersistence.create<DnsForwarderConfig>(
        file = File(dataDir, "forwarders.json"),
        defaultContent = DnsForwarderConfig(),
        loggerName = DnsServiceImpl::class.java.name
    )
    private val templatesPersistence = JsonPersistence.create<List<ZoneTemplate>>(
        file = File(dataDir, "templates.json"),
        defaultContent = defaultTemplates(),
        loggerName = DnsServiceImpl::class.java.name
    )
    private val securityPersistence = JsonPersistence.create<GlobalSecurityConfig>(
        file = File(dataDir, "security-config.json"),
        defaultContent = GlobalSecurityConfig(),
        loggerName = DnsServiceImpl::class.java.name
    )

    @Volatile private var cachedZones: MutableList<DnsZone>? = null

    init {
        zonesDir.mkdirs()
        keysDir.mkdirs()
    }

    // ===================================================================
    //  Zone Persistence
    // ===================================================================

    private fun loadZones(): MutableList<DnsZone> {
        cachedZones?.let { return it.toMutableList() }
        return lock.withLock {
            cachedZones?.let { return@withLock it.toMutableList() }
            val loaded = zonesPersistence.load().toMutableList()
            cachedZones = loaded
            loaded.toMutableList()
        }
    }

    private fun saveZones(zones: List<DnsZone>) {
        lock.withLock {
            cachedZones = zones.toMutableList()
            zonesPersistence.save(zones)
        }
    }

    private fun mutateZone(zoneId: String, mutator: (DnsZone) -> DnsZone): Boolean = lock.withLock {
        val zones = loadZones()
        val index = zones.indexOfFirst { it.id == zoneId }
        if (index == -1) return false
        zones[index] = mutator(zones[index])
        saveZones(zones)
        true
    }

    // ===================================================================
    //  Zone Management
    // ===================================================================

    override fun listZones(): List<DnsZone> = loadZones()

    private val bindAclPattern = Regex("""^[a-zA-Z0-9.:/_\-!]+$""")

    private fun sanitizeAclEntries(entries: List<String>): List<String> =
        entries.map { it.trim() }.filter { it.isNotBlank() && bindAclPattern.matches(it) }

    override fun getZone(zoneId: String): DnsZone? = loadZones().find { it.id == zoneId }

    override fun createZone(request: CreateZoneRequest): DnsZone? = lock.withLock {
        val zones = loadZones()
        val name = request.name.trim()
        if (zones.any { it.name == name }) {
            logger.warn("Zone already exists: $name")
            return null
        }

        val id = UUID.randomUUID().toString()
        val zoneFile = File(zonesDir, "db.$name")

        val zone = DnsZone(
            id = id,
            name = name,
            type = request.type,
            role = request.role,
            filePath = zoneFile.absolutePath,
            soa = request.soa,
            masterAddresses = sanitizeAclEntries(request.masterAddresses),
            allowTransfer = sanitizeAclEntries(request.allowTransfer),
            allowUpdate = sanitizeAclEntries(request.allowUpdate),
            allowQuery = sanitizeAclEntries(request.allowQuery),
            alsoNotify = sanitizeAclEntries(request.alsoNotify),
            forwarders = sanitizeAclEntries(request.forwarders)
        )

        if (zone.role == ZoneRole.MASTER) {
            writeZoneFile(zone)
        }
        writeNamedConfEntry(zone)
        zones.add(zone)
        saveZones(zones)
        reloadBind()
        zone
    }

    override fun deleteZone(zoneId: String): Boolean = lock.withLock {
        val zones = loadZones()
        val zone = zones.find { it.id == zoneId } ?: return false

        File(zone.filePath).delete()
        removeNamedConfEntry(zone)
        zones.removeIf { it.id == zoneId }
        saveZones(zones)
        reloadBind()
        true
    }

    override fun toggleZone(zoneId: String): Boolean = lock.withLock {
        val zones = loadZones()
        val index = zones.indexOfFirst { it.id == zoneId }
        if (index == -1) return false

        val zone = zones[index]
        val toggled = zone.copy(enabled = !zone.enabled)
        zones[index] = toggled

        if (toggled.enabled) writeNamedConfEntry(toggled) else removeNamedConfEntry(toggled)
        saveZones(zones)
        reloadBind()
        true
    }

    override fun updateZoneOptions(zoneId: String, request: UpdateZoneOptionsRequest): Boolean = lock.withLock {
        val zones = loadZones()
        val index = zones.indexOfFirst { it.id == zoneId }
        if (index == -1) return false

        val zone = zones[index]
        val updated = zone.copy(
            allowTransfer = request.allowTransfer?.let { sanitizeAclEntries(it) } ?: zone.allowTransfer,
            allowUpdate = request.allowUpdate?.let { sanitizeAclEntries(it) } ?: zone.allowUpdate,
            allowQuery = request.allowQuery?.let { sanitizeAclEntries(it) } ?: zone.allowQuery,
            alsoNotify = request.alsoNotify?.let { sanitizeAclEntries(it) } ?: zone.alsoNotify,
            forwarders = request.forwarders?.let { sanitizeAclEntries(it) } ?: zone.forwarders,
            masterAddresses = request.masterAddresses?.let { sanitizeAclEntries(it) } ?: zone.masterAddresses
        )
        zones[index] = updated
        writeNamedConfEntry(updated)
        saveZones(zones)
        reloadBind()
        true
    }

    override fun updateZone(zoneId: String, request: UpdateZoneRequest): Boolean = lock.withLock {
        val zones = loadZones()
        val index = zones.indexOfFirst { it.id == zoneId }
        if (index == -1) return false

        val zone = zones[index]
        val updated = zone.copy(
            role = request.role ?: zone.role,
            type = request.type ?: zone.type,
            soa = request.soa ?: zone.soa,
            allowTransfer = request.allowTransfer?.let { sanitizeAclEntries(it) } ?: zone.allowTransfer,
            allowUpdate = request.allowUpdate?.let { sanitizeAclEntries(it) } ?: zone.allowUpdate,
            allowQuery = request.allowQuery?.let { sanitizeAclEntries(it) } ?: zone.allowQuery,
            alsoNotify = request.alsoNotify?.let { sanitizeAclEntries(it) } ?: zone.alsoNotify,
            forwarders = request.forwarders?.let { sanitizeAclEntries(it) } ?: zone.forwarders,
            masterAddresses = request.masterAddresses?.let { sanitizeAclEntries(it) } ?: zone.masterAddresses
        )

        val needsZoneFileWrite = request.soa != null ||
            (request.role != null && request.role != zone.role && updated.role == ZoneRole.MASTER)

        val final = if (request.soa != null) {
            updated.copy(soa = updated.soa.copy(serial = generateNextSerial(updated.soa.serial)))
        } else updated

        zones[index] = final
        if (needsZoneFileWrite) writeZoneFile(final)
        writeNamedConfEntry(final)
        saveZones(zones)
        reloadBind()
        true
    }

    // ===================================================================
    //  Record Management
    // ===================================================================

    override fun getRecords(zoneId: String): List<DnsRecord> =
        getZone(zoneId)?.records ?: emptyList()

    override fun updateRecords(zoneId: String, records: List<DnsRecord>): Boolean = lock.withLock {
        val zones = loadZones()
        val index = zones.indexOfFirst { it.id == zoneId }
        if (index == -1) return false

        val cleaned = records.map {
            it.copy(
                id = if (it.id.isBlank()) UUID.randomUUID().toString() else it.id,
                name = it.name.trim(),
                value = it.value.trim()
            )
        }
        val zone = zones[index]
        val updated = zone.copy(records = cleaned, soa = zone.soa.copy(serial = zone.soa.serial + 1))
        zones[index] = updated
        writeZoneFile(updated)
        saveZones(zones)
        reloadBind()
        true
    }

    override fun addRecord(zoneId: String, record: DnsRecord): Boolean = lock.withLock {
        val zones = loadZones()
        val index = zones.indexOfFirst { it.id == zoneId }
        if (index == -1) return false

        val zone = zones[index]
        val newRec = record.copy(
            id = if (record.id.isBlank()) UUID.randomUUID().toString() else record.id,
            name = record.name.trim(),
            value = record.value.trim()
        )
        val updated = zone.copy(records = zone.records + newRec, soa = zone.soa.copy(serial = zone.soa.serial + 1))
        zones[index] = updated
        writeZoneFile(updated)
        saveZones(zones)
        reloadBind()
        true
    }

    override fun deleteRecord(zoneId: String, recordId: String): Boolean = lock.withLock {
        val zones = loadZones()
        val index = zones.indexOfFirst { it.id == zoneId }
        if (index == -1) return false

        val zone = zones[index]
        val filtered = zone.records.filter { it.id != recordId }
        if (filtered.size == zone.records.size) return false

        val updated = zone.copy(records = filtered, soa = zone.soa.copy(serial = zone.soa.serial + 1))
        zones[index] = updated
        writeZoneFile(updated)
        saveZones(zones)
        reloadBind()
        true
    }

    // ===================================================================
    //  Service Control
    // ===================================================================

    override fun getStatus(): DnsServiceStatus {
        val iStatus = getInstallStatus()
        val rndcStatus = bindExec("rndc status")
        val rndcSuccess = rndcStatus.exitCode == 0

        // If rndc fails, we trust the install detection (Docker/Systemd)
        // This solves the 'Stopped' issue when the service is actually running but rndc is not responding yet
        val running = rndcSuccess || (iStatus.installed && iStatus.running)

        val version = if (rndcSuccess) extractLine(rndcStatus.output, "version:") else iStatus.version
        val uptime = if (rndcSuccess) rndcStatus.output.lines().firstOrNull { it.contains("server is up and running") }?.trim() ?: "" else ""
        val configCheck = bindExec("named-checkconf")

        return DnsServiceStatus(
            running = running,
            version = version,
            configValid = configCheck.exitCode == 0,
            configOutput = if (configCheck.exitCode == 0) "Configuration OK" else configCheck.error.trim(),
            uptime = uptime,
            zoneCount = loadZones().size
        )
    }

    override fun reload(): DnsActionResult {
        val result = bindExec("rndc reload")
        return DnsActionResult(result.exitCode == 0, if (result.exitCode == 0) "BIND9 reloaded" else result.error.ifBlank { result.output })
    }

    override fun restart(): DnsActionResult {
        if (isDockerMode) {
            val result = commandExecutor.execute("${AppConfig.dockerCommand} restart $containerName")
            return DnsActionResult(result.exitCode == 0, if (result.exitCode == 0) "BIND9 container restarted" else result.error.ifBlank { result.output })
        }
        return executeAction("systemctl restart named || systemctl restart bind9", "BIND9 restarted")
    }

    override fun flushCache(): DnsActionResult {
        val result = bindExec("rndc flush")
        return DnsActionResult(result.exitCode == 0, if (result.exitCode == 0) "DNS cache flushed" else result.error.ifBlank { result.output })
    }

    // ===================================================================
    //  Validation
    // ===================================================================

    override fun validateConfig(): ZoneValidationResult {
        val result = bindExec("named-checkconf")
        return ZoneValidationResult(result.exitCode == 0, if (result.exitCode == 0) "Configuration OK" else result.error.trim())
    }

    override fun validateZone(zoneId: String): ZoneValidationResult {
        val zone = getZone(zoneId) ?: return ZoneValidationResult(false, "Zone not found")
        val zonePath = translateToContainerPath(zone.filePath)
        val result = bindExec("named-checkzone ${zone.name} $zonePath")
        return ZoneValidationResult(result.exitCode == 0, result.output.trim().ifBlank { result.error.trim() })
    }

    // ===================================================================
    //  Zone File Content & Import
    // ===================================================================

    override fun getZoneFileContent(zoneId: String): String? {
        val zone = getZone(zoneId) ?: return null
        val file = File(zone.filePath)
        return if (file.exists()) file.readText() else null
    }

    override fun exportZoneFile(zoneId: String): String? = getZoneFileContent(zoneId)

    override fun importZoneFile(request: BulkImportRequest): BulkImportResult {
        val zone = getZone(request.zoneId) ?: return BulkImportResult(false, errors = listOf("Zone not found"))

        val parsed = mutableListOf<DnsRecord>()
        val errors = mutableListOf<String>()
        var skipped = 0

        for ((lineNo, line) in request.content.lines().withIndex()) {
            val trimmed = line.trim()
            if (trimmed.isBlank() || trimmed.startsWith(";") || trimmed.startsWith("\$")) {
                skipped++
                continue
            }

            try {
                val record = parseBindRecord(trimmed, lineNo + 1)
                if (record != null) parsed.add(record) else skipped++
            } catch (e: Exception) {
                errors.add("Line ${lineNo + 1}: ${e.message}")
            }
        }

        if (parsed.isEmpty() && errors.isNotEmpty()) {
            return BulkImportResult(false, 0, skipped, errors)
        }

        lock.withLock {
            val zones = loadZones()
            val index = zones.indexOfFirst { it.id == request.zoneId }
            if (index == -1) return BulkImportResult(false, errors = listOf("Zone not found"))

            val z = zones[index]
            val updated = z.copy(
                records = z.records + parsed,
                soa = z.soa.copy(serial = z.soa.serial + 1)
            )
            zones[index] = updated
            writeZoneFile(updated)
            saveZones(zones)
        }
        reloadBind()

        return BulkImportResult(true, parsed.size, skipped, errors)
    }

    private fun parseBindRecord(line: String, lineNo: Int): DnsRecord? {
        val parts = line.split(Regex("\\s+"))
        if (parts.size < 4) return null

        // Handle: name [ttl] [IN] type value
        var idx = 0
        val name = parts[idx++]
        val ttl = parts[idx].toIntOrNull()
        if (ttl != null) idx++
        if (idx < parts.size && parts[idx].equals("IN", ignoreCase = true)) idx++
        if (idx + 1 >= parts.size) return null

        val typeStr = parts[idx++].uppercase()
        val recordType = try { DnsRecordType.valueOf(typeStr) } catch (_: Exception) { return null }
        if (recordType == DnsRecordType.SOA) return null

        val value = parts.drop(idx).joinToString(" ").trim().removeSurrounding("\"")
        val priority = if (recordType == DnsRecordType.MX && parts.size > idx) parts[idx].toIntOrNull() else null

        return DnsRecord(
            id = UUID.randomUUID().toString(),
            name = name.trim(),
            type = recordType,
            value = (if (priority != null && parts.size > idx + 1) parts.drop(idx + 1).joinToString(" ") else value).trim(),
            ttl = ttl ?: 3600,
            priority = priority
        )
    }

    // ===================================================================
    //  ACLs
    // ===================================================================

    override fun listAcls(): List<DnsAcl> = aclsPersistence.load()

    override fun createAcl(acl: DnsAcl): DnsAcl {
        val newAcl = if (acl.id.isBlank()) acl.copy(id = UUID.randomUUID().toString()) else acl
        aclsPersistence.update { it + newAcl }
        writeAclsToConfig()
        reloadBind()
        return newAcl
    }

    override fun updateAcl(acl: DnsAcl): Boolean {
        val updated = aclsPersistence.update { list ->
            list.map { if (it.id == acl.id) acl else it }
        }
        if (updated) { writeAclsToConfig(); reloadBind() }
        return updated
    }

    override fun deleteAcl(aclId: String): Boolean {
        val updated = aclsPersistence.update { it.filter { a -> a.id != aclId } }
        if (updated) { writeAclsToConfig(); reloadBind() }
        return updated
    }

    private fun writeAclsToConfig() {
        val acls = aclsPersistence.load()
        val confFile = File(getNamedConfDir(), "named.conf.acl")

        val content = buildString {
            appendLine("// Generated by DockerManager - DO NOT EDIT MANUALLY")
            for (acl in acls) {
                if (acl.comment.isNotBlank()) appendLine("// ${acl.comment}")
                appendLine("acl \"${acl.name}\" {")
                for (entry in acl.entries) {
                    appendLine("    $entry;")
                }
                appendLine("};")
                appendLine()
            }
        }
        confFile.writeText(content)
        ensureInclude(confFile.absolutePath)
    }

    // ===================================================================
    //  TSIG Keys
    // ===================================================================

    override fun listTsigKeys(): List<TsigKey> =
        tsigPersistence.load().map { it.copy(secret = maskSecret(it.secret)) }

    override fun createTsigKey(key: TsigKey): TsigKey? {
        val secret = if (key.secret.isBlank()) generateTsigSecret(key.algorithm) else key.secret
        if (secret.isBlank()) return null

        val newKey = key.copy(
            id = if (key.id.isBlank()) UUID.randomUUID().toString() else key.id,
            secret = secret
        )
        tsigPersistence.update { it + newKey }
        writeTsigKeysToConfig()
        reloadBind()
        return newKey.copy(secret = maskSecret(secret))
    }

    override fun deleteTsigKey(keyId: String): Boolean {
        val updated = tsigPersistence.update { it.filter { k -> k.id != keyId } }
        if (updated) { writeTsigKeysToConfig(); reloadBind() }
        return updated
    }

    private fun generateTsigSecret(algorithm: TsigAlgorithm): String {
        val result = bindExec("tsig-keygen -a ${algorithm.toBindName()} temp-key")
        if (result.exitCode != 0) {
            val fallback = commandExecutor.execute("openssl rand -base64 32")
            return if (fallback.exitCode == 0) fallback.output.trim() else ""
        }
        return result.output.lines()
            .firstOrNull { it.trim().startsWith("secret") }
            ?.substringAfter("\"")?.substringBefore("\"") ?: ""
    }

    private fun writeTsigKeysToConfig() {
        val keys = tsigPersistence.load()
        val confFile = File(getNamedConfDir(), "named.conf.tsig")

        val content = buildString {
            appendLine("// Generated by DockerManager - DO NOT EDIT MANUALLY")
            for (k in keys) {
                appendLine("key \"${k.name}\" {")
                appendLine("    algorithm ${k.algorithm.toBindName()};")
                appendLine("    secret \"${k.secret}\";")
                appendLine("};")
                appendLine()
            }
        }
        confFile.writeText(content)
        ensureInclude(confFile.absolutePath)
    }

    private fun maskSecret(secret: String): String =
        if (secret.length > 8) "${secret.take(4)}****${secret.takeLast(4)}" else "****"

    // ===================================================================
    //  Global Forwarders
    // ===================================================================

    override fun getForwarderConfig(): DnsForwarderConfig = forwarderPersistence.load()

    override fun updateForwarderConfig(config: DnsForwarderConfig): Boolean {
        forwarderPersistence.save(config)
        writeForwardersToConfig(config)
        reloadBind()
        return true
    }

    private fun writeForwardersToConfig(config: DnsForwarderConfig) {
        val confDir = File(getNamedConfDir())
        val forwardersFile = File(confDir, "named.conf.forwarders")

        if (config.forwarders.isEmpty()) {
            forwardersFile.writeText("// No global forwarders configured\n")
        } else {
            val content = buildString {
                appendLine("// Generated by DockerManager - Global Forwarders")
                appendLine("forwarders {")
                for (f in config.forwarders) appendLine("    $f;")
                appendLine("};")
                if (config.forwardOnly) appendLine("forward only;")
            }
            forwardersFile.writeText(content)
        }

        // Re-write options to keep consistent state
        writeOptionsConfig(confDir, isDockerMode)
    }

    // ===================================================================
    //  Global Security Config
    // ===================================================================

    override fun getGlobalSecurityConfig(): GlobalSecurityConfig = securityPersistence.load()

    override fun updateGlobalSecurityConfig(config: GlobalSecurityConfig): Boolean {
        securityPersistence.save(config)
        writeOptionsConfig()
        reloadBind()
        return true
    }

    private fun writeOptionsConfig(confDir: File = File(getNamedConfDir()), forDocker: Boolean = isDockerMode) {
        val optionsFile = File(confDir, "named.conf.options")
        val forwardersPath = if (forDocker) "/etc/bind/named.conf.forwarders" else File(confDir, "named.conf.forwarders").absolutePath

        val security = securityPersistence.load()

        val content = buildString {
            appendLine("// Generated by DockerManager - Global Options")
            appendLine("options {")
            appendLine("    directory \"/var/lib/bind\";")
            appendLine("    listen-on { any; };")
            appendLine("    listen-on-v6 { any; };")
            appendLine("    allow-query { any; };")
            appendLine("    ")
            appendLine("    // Global Security configuration")
            appendLine("    recursion ${if (security.recursionEnabled) "yes" else "no"};")
            if (security.recursionEnabled && security.allowRecursion.isNotEmpty()) {
                appendLine("    allow-recursion { ${security.allowRecursion.joinToString("; ")}; };")
            } else {
                appendLine("    allow-recursion { none; };")
            }
            appendLine("    allow-transfer { none; };")
            appendLine("    allow-update { none; };")
            appendLine("    version \"none\";")
            appendLine("    ")
            
            if (security.rateLimitEnabled) {
                appendLine("    // Response Rate Limiting (RRL)")
                appendLine("    rate-limit {")
                appendLine("        responses-per-second ${security.rateLimitResponsesPerSecond};")
                appendLine("        window ${security.rateLimitWindow};")
                appendLine("    };")
                appendLine("    ")
            }
            
            appendLine("    dnssec-validation auto;")
            appendLine("    ")
            appendLine("    include \"$forwardersPath\";")
            appendLine("};")
        }
        optionsFile.writeText(content)
    }

    // ===================================================================
    //  DNSSEC
    // ===================================================================

    override fun getDnssecStatus(zoneId: String): DnssecStatus {
        val zone = getZone(zoneId) ?: return DnssecStatus()
        if (!zone.dnssecEnabled) return DnssecStatus()

        val kskFiles = keysDir.listFiles()?.filter { it.name.startsWith("K${zone.name}") && it.name.contains("ksk") } ?: emptyList()
        val zskFiles = keysDir.listFiles()?.filter { it.name.startsWith("K${zone.name}") && it.name.contains("zsk") } ?: emptyList()

        val cKeysDir = containerKeysDir()
        val dsResult = bindExec("dnssec-dsfromkey $cKeysDir/K${zone.name}.*.key 2>/dev/null")
        val dsRecords = if (dsResult.exitCode == 0) dsResult.output.lines().filter { it.isNotBlank() } else emptyList()

        return DnssecStatus(
            enabled = true,
            signed = File(zone.filePath + ".signed").exists(),
            kskKeyTag = kskFiles.firstOrNull()?.name ?: "",
            zskKeyTag = zskFiles.firstOrNull()?.name ?: "",
            dsRecords = dsRecords
        )
    }

    override fun enableDnssec(zoneId: String): DnsActionResult = lock.withLock {
        val zone = getZone(zoneId) ?: return DnsActionResult(false, "Zone not found")
        val cKeysDir = containerKeysDir()
        val cZonePath = if (isDockerMode) "${containerZonesDir()}/${File(zone.filePath).name}" else zone.filePath

        bindExec("mkdir -p $cKeysDir")

        val kskResult = bindExec(
            "dnssec-keygen -K $cKeysDir -a ECDSAP256SHA256 -fKSK ${zone.name}"
        )
        if (kskResult.exitCode != 0) return DnsActionResult(false, "KSK generation failed: ${kskResult.error}")

        val zskResult = bindExec(
            "dnssec-keygen -K $cKeysDir -a ECDSAP256SHA256 ${zone.name}"
        )
        if (zskResult.exitCode != 0) return DnsActionResult(false, "ZSK generation failed: ${zskResult.error}")

        val signResult = bindExec(
            "dnssec-signzone -K $cKeysDir -o ${zone.name} -S $cZonePath"
        )
        if (signResult.exitCode != 0) return DnsActionResult(false, "Zone signing failed: ${signResult.error}")

        mutateZone(zoneId) { it.copy(dnssecEnabled = true) }
        writeNamedConfEntry(getZone(zoneId)!!)
        reloadBind()
        DnsActionResult(true, "DNSSEC enabled for ${zone.name}")
    }

    override fun signZone(zoneId: String): DnsActionResult = lock.withLock {
        val zone = getZone(zoneId) ?: return DnsActionResult(false, "Zone not found")
        if (!zone.dnssecEnabled) return DnsActionResult(false, "DNSSEC is not enabled for this zone")
        
        val cKeysDir = containerKeysDir()
        val cZonePath = if (isDockerMode) "${containerZonesDir()}/${File(zone.filePath).name}" else zone.filePath

        bindExec("mkdir -p $cKeysDir")

        val signResult = bindExec(
            "dnssec-signzone -K $cKeysDir -o ${zone.name} -S $cZonePath"
        )
        if (signResult.exitCode != 0) return DnsActionResult(false, "Zone signing failed: ${signResult.error}")

        reloadBind()
        DnsActionResult(true, "Zone ${zone.name} successfully signed")
    }

    override fun disableDnssec(zoneId: String): DnsActionResult = lock.withLock {
        val zone = getZone(zoneId) ?: return DnsActionResult(false, "Zone not found")

        File(zone.filePath + ".signed").delete()
        keysDir.listFiles()?.filter { it.name.startsWith("K${zone.name}") }?.forEach { it.delete() }

        mutateZone(zoneId) { it.copy(dnssecEnabled = false) }
        writeNamedConfEntry(getZone(zoneId)!!)
        reloadBind()
        DnsActionResult(true, "DNSSEC disabled for ${zone.name}")
    }

    override fun getDsRecords(zoneId: String): List<String> = getDnssecStatus(zoneId).dsRecords

    // ===================================================================
    //  DNS Lookup (dig)
    // ===================================================================

    override fun lookup(request: DnsLookupRequest): DnsLookupResult {
        val serverArg = if (!request.server.isNullOrBlank()) "@${request.server}" else ""
        val cmd = "dig $serverArg ${request.query} ${request.type} +noall +answer +stats +comments"
        val result = bindExec(cmd)

        if (result.exitCode != 0) {
            return DnsLookupResult(false, request.query, request.type, rawOutput = result.error.ifBlank { result.output })
        }

        val answers = mutableListOf<DnsLookupAnswer>()
        var queryTime = ""
        var server = ""
        var status = ""

        for (line in result.output.lines()) {
            val trimmed = line.trim()
            when {
                trimmed.startsWith(";; ->>HEADER<<-") -> {
                    val statusMatch = Regex("status: (\\w+)").find(trimmed)
                    status = statusMatch?.groupValues?.getOrNull(1) ?: ""
                }
                trimmed.startsWith(";;") -> {
                    if (trimmed.contains("Query time:")) queryTime = trimmed.substringAfter("Query time:").trim()
                    if (trimmed.contains("SERVER:")) server = trimmed.substringAfter("SERVER:").trim()
                }
                trimmed.isNotBlank() && !trimmed.startsWith(";") -> {
                    val parts = trimmed.split(Regex("\\s+"), limit = 5)
                    if (parts.size >= 5) {
                        answers.add(DnsLookupAnswer(
                            name = parts[0],
                            ttl = parts[1].toIntOrNull() ?: 0,
                            type = parts[3],
                            value = parts[4]
                        ))
                    }
                }
            }
        }

        return DnsLookupResult(
            success = true,
            query = request.query,
            type = request.type,
            answers = answers,
            rawOutput = result.output,
            queryTime = queryTime,
            server = server,
            status = status
        )
    }

    // ===================================================================
    //  Statistics
    // ===================================================================

    override fun getLogs(tail: Int): String {
        val status = getInstallStatus()
        if (!status.installed || !status.running) return "DNS service is not running."

        return if (status.method == DnsInstallMethod.DOCKER && status.dockerContainerId != null) {
            val cmd = "${AppConfig.dockerCommand} logs --tail $tail ${status.dockerContainerId} 2>&1"
            commandExecutor.execute(cmd).output
        } else if (status.method == DnsInstallMethod.APT && status.osType != "mac") {
            val cmd = "journalctl -u named -u bind9 -n $tail --no-pager"
            commandExecutor.execute(cmd).output
        } else {
            "Log retrieval not supported for this installation type."
        }
    }

    override fun getQueryStats(): DnsQueryStats {
        bindExec("rndc stats")

        val raw = if (isDockerMode) {
            val catResult = bindExec("cat /var/cache/bind/named.stats 2>/dev/null || cat /var/log/named/named.stats 2>/dev/null")
            if (catResult.exitCode != 0 || catResult.output.isBlank()) {
                val rndcStatus = bindExec("rndc status")
                return DnsQueryStats(rawStats = rndcStatus.output)
            }
            catResult.output
        } else {
            val statsFile = File("/var/named/data/named_stats.txt").takeIf { it.exists() }
                ?: File("/var/cache/bind/named.stats").takeIf { it.exists() }
                ?: File("/var/log/named/named.stats").takeIf { it.exists() }
            statsFile?.readText() ?: run {
                val rndcStatus = bindExec("rndc status")
                return DnsQueryStats(rawStats = rndcStatus.output)
            }
        }

        var total = 0L; var success = 0L; var failed = 0L; var recursive = 0L
        val queryTypes = mutableMapOf<String, Long>()

        var inIncoming = false
        for (line in raw.lines()) {
            val trimmed = line.trim()
            when {
                trimmed.contains("++ Incoming Requests ++") -> inIncoming = true
                trimmed.contains("++") && inIncoming -> inIncoming = false
                inIncoming -> {
                    val match = Regex("^(\\d+)\\s+(.+)$").find(trimmed)
                    if (match != null) {
                        val count = match.groupValues[1].toLongOrNull() ?: 0
                        val type = match.groupValues[2].trim()
                        queryTypes[type] = count
                        total += count
                    }
                }
                trimmed.contains("QUERY") && trimmed.first().isDigit() -> {
                    success = Regex("^(\\d+)").find(trimmed)?.groupValues?.get(1)?.toLongOrNull() ?: 0
                }
                trimmed.contains("SERVFAIL") && trimmed.first().isDigit() -> {
                    failed = Regex("^(\\d+)").find(trimmed)?.groupValues?.get(1)?.toLongOrNull() ?: 0
                }
                trimmed.contains("Recursion") && trimmed.first().isDigit() -> {
                    recursive = Regex("^(\\d+)").find(trimmed)?.groupValues?.get(1)?.toLongOrNull() ?: 0
                }
            }
        }

        return DnsQueryStats(total, success, failed, recursive, queryTypes, rawStats = raw.takeLast(4000))
    }

    // ===================================================================
    //  Zone Templates
    // ===================================================================

    override fun listTemplates(): List<ZoneTemplate> = templatesPersistence.load()

    override fun createTemplate(template: ZoneTemplate): ZoneTemplate {
        val newTmpl = template.copy(id = if (template.id.isBlank()) UUID.randomUUID().toString() else template.id)
        templatesPersistence.update { it + newTmpl }
        return newTmpl
    }

    override fun deleteTemplate(templateId: String): Boolean =
        templatesPersistence.update { it.filter { t -> t.id != templateId } }

    override fun applyTemplate(zoneId: String, templateId: String): Boolean {
        val template = templatesPersistence.load().find { it.id == templateId } ?: return false
        return lock.withLock {
            val zones = loadZones()
            val index = zones.indexOfFirst { it.id == zoneId }
            if (index == -1) return false
            val zone = zones[index]

            // Detect the representative domain used in the template records.
            // We look at record names to find the most common apparent zone root
            // (e.g. "example.com." or "example.com"). Fall back to a simple dot-suffix check.
            val templateDomain = detectTemplateDomain(template.records)

            val newRecords = template.records.map { record ->
                val mappedName  = remapDomain(record.name,  templateDomain, zone.name)
                val mappedValue = remapDomain(record.value, templateDomain, zone.name)
                record.copy(id = UUID.randomUUID().toString(), name = mappedName, value = mappedValue)
            }

            val updated = zone.copy(
                records = zone.records + newRecords,
                soa = zone.soa.copy(serial = generateNextSerial(zone.soa.serial))
            )
            zones[index] = updated
            writeZoneFile(updated)
            saveZones(zones)
            reloadBind()
            true
        }
    }

    /**
     * Infers the template's own domain by looking at the record names for the most common
     * root-level non-origin name (longest common suffix). Falls back to "example.com".
     */
    private fun detectTemplateDomain(records: List<DnsRecord>): String {
        val candidates = records
            .map { it.name.trimEnd('.') }
            .filter { it.isNotBlank() && it != "@" && it.contains('.') }
        if (candidates.isEmpty()) return "example.com"

        // Pick the candidate that appears most frequently (the zone root)
        return candidates
            .groupingBy { it }
            .eachCount()
            .maxByOrNull { it.value }
            ?.key ?: "example.com"
    }

    /**
     * Replaces occurrences of [templateDomain] (with or without trailing dot) in [text]
     * with [zoneName], preserving subdomain prefixes.
     *
     * Examples (templateDomain="example.com", zoneName="mysite.io"):
     *   "example.com."   -> "mysite.io."
     *   "example.com"    -> "mysite.io"
     *   "www.example.com." -> "www.mysite.io."
     *   "ns1.example.com"  -> "ns1.mysite.io"
     *   "@"              -> "@"  (unchanged)
     */
    private fun remapDomain(text: String, templateDomain: String, zoneName: String): String {
        if (text.isBlank() || templateDomain.isBlank()) return text
        val td = templateDomain.trimEnd('.')
        val zn = zoneName.trimEnd('.')

        // Exact match with optional trailing dot
        if (text.equals("$td.", ignoreCase = true)) return "$zn."
        if (text.equals(td, ignoreCase = true)) return zn

        // Subdomain — keep the subdomain prefix
        val withDot = "$td."
        if (text.endsWith(withDot, ignoreCase = true)) {
            return text.dropLast(withDot.length) + "$zn."
        }
        if (text.endsWith(td, ignoreCase = true) && text.length > td.length && text[text.length - td.length - 1] == '.') {
            return text.dropLast(td.length) + zn
        }
        return text
    }

    // ===================================================================
    //  Zone File Generation
    // ===================================================================

    private fun writeZoneFile(zone: DnsZone) {
        val soa = zone.soa
        val content = buildString {
            appendLine("; Zone file for ${zone.name}")
            appendLine("; Generated by DockerManager DNS Service")
            appendLine("; Serial: ${soa.serial}")
            appendLine()
            appendLine("\$TTL ${soa.minimumTtl}")
            appendLine("@  IN  SOA  ${soa.primaryNs} ${soa.adminEmail} (")
            appendLine("             ${soa.serial}     ; Serial")
            appendLine("             ${soa.refresh}        ; Refresh")
            appendLine("             ${soa.retry}         ; Retry")
            appendLine("             ${soa.expire}     ; Expire")
            appendLine("             ${soa.minimumTtl}      ; Minimum TTL")
            appendLine(")")
            appendLine()
            for (record in zone.records) {
                val line = formatRecord(record)
                if (line.isNotBlank()) appendLine(line)
            }
        }

        File(zone.filePath).apply {
            parentFile.mkdirs()
            writeText(content)
        }
        logger.info("Wrote zone file: ${zone.filePath}")
    }

    private fun formatRecord(record: DnsRecord): String {
        val name = record.name.padEnd(24)
        val ttl = record.ttl.toString()
        return when (record.type) {
            DnsRecordType.MX -> "$name $ttl  IN  MX  ${record.priority ?: 10} ${record.value}"
            DnsRecordType.SRV -> "$name $ttl  IN  SRV ${record.priority ?: 0} ${record.weight ?: 0} ${record.port ?: 0} ${record.value}"
            DnsRecordType.TXT -> "$name $ttl  IN  TXT \"${record.value}\""
            DnsRecordType.CAA -> "$name $ttl  IN  CAA ${record.value}"
            DnsRecordType.SOA -> ""
            else -> "$name $ttl  IN  ${record.type.name}  ${record.value}"
        }
    }

    // ===================================================================
    //  named.conf Management
    // ===================================================================

    private fun getHostNamedConfDir(): String {
        val candidates = listOf("/etc/bind", "/etc/named")
        return candidates.firstOrNull { File(it).isDirectory } ?: "/etc/bind"
    }

    private fun getNamedConfDir(): String {
        if (isDockerMode) {
            val envFile = File(dnsComposeDir, ".env")
            if (envFile.exists()) {
                envFile.readLines().forEach { line ->
                    if (line.startsWith("BIND9_CONFIG_PATH=")) {
                        val path = line.substringAfter("=").trim()
                        return resolveDataPath(path)
                    }
                }
            }
            return File(dnsComposeDir, "config").absolutePath
        }
        return getHostNamedConfDir()
    }

    private fun getNamedConfLocalPath(): String {
        val confDir = getNamedConfDir()
        val localFile = File(confDir, "named.conf.local")
        if (localFile.exists()) return localFile.absolutePath

        if (!isDockerMode) {
            val candidates = listOf("/etc/bind/named.conf.local", "/etc/named.conf.local", "/etc/named/named.conf.local")
            candidates.firstOrNull { File(it).exists() }?.let { return it }
        }

        return localFile.absolutePath
    }

    private val managedBlockStart = "# --- DockerManager DNS Start: %s ---"
    private val managedBlockEnd = "# --- DockerManager DNS End: %s ---"

    private fun writeNamedConfEntry(zone: DnsZone) {
        val confFile = File(getNamedConfLocalPath())
        if (!confFile.exists()) { confFile.parentFile?.mkdirs(); confFile.createNewFile() }
        removeNamedConfEntry(zone)

        val zoneFilePath = if (zone.dnssecEnabled && File(zone.filePath + ".signed").exists())
            zone.filePath + ".signed" else zone.filePath

        val entry = buildString {
            appendLine(managedBlockStart.format(zone.name))
            appendLine("zone \"${zone.name}\" {")

            when (zone.role) {
                ZoneRole.MASTER -> {
                    appendLine("    type master;")
                    appendLine("    file \"${translateToContainerPath(zoneFilePath)}\";")
                }
                ZoneRole.SLAVE -> {
                    appendLine("    type slave;")
                    appendLine("    file \"${translateToContainerPath(zone.filePath)}\";")
                    if (zone.masterAddresses.isNotEmpty()) {
                        appendLine("    masters { ${zone.masterAddresses.joinToString("; ")}; };")
                    }
                }
                ZoneRole.STUB -> {
                    appendLine("    type stub;")
                    appendLine("    file \"${translateToContainerPath(zone.filePath)}\";")
                    if (zone.masterAddresses.isNotEmpty()) {
                        appendLine("    masters { ${zone.masterAddresses.joinToString("; ")}; };")
                    }
                }
                ZoneRole.FORWARD_ONLY -> {
                    appendLine("    type forward;")
                    appendLine("    forward only;")
                    if (zone.forwarders.isNotEmpty()) {
                        appendLine("    forwarders { ${zone.forwarders.joinToString("; ")}; };")
                    }
                }
            }

            if (zone.allowTransfer.isNotEmpty()) {
                appendLine("    allow-transfer { ${zone.allowTransfer.joinToString("; ")}; };")
            } else if (zone.role == ZoneRole.MASTER) {
                appendLine("    allow-transfer { none; };")
            }

            if (zone.allowUpdate.isNotEmpty()) {
                appendLine("    allow-update { ${zone.allowUpdate.joinToString("; ")}; };")
            } else if (zone.role == ZoneRole.MASTER) {
                appendLine("    allow-update { none; };")
            }

            if (zone.allowQuery.isNotEmpty()) {
                appendLine("    allow-query { ${zone.allowQuery.joinToString("; ")}; };")
            }

            if (zone.alsoNotify.isNotEmpty()) {
                appendLine("    also-notify { ${zone.alsoNotify.joinToString("; ")}; };")
            }

            if (zone.dnssecEnabled && zone.role == ZoneRole.MASTER) {
                appendLine("    auto-dnssec maintain;")
                appendLine("    inline-signing yes;")
                appendLine("    key-directory \"${translateToContainerPath(keysDir.absolutePath)}\";")
            }

            appendLine("};")
            appendLine(managedBlockEnd.format(zone.name))
        }

        confFile.appendText("\n$entry")
        logger.info("Added zone entry to named.conf.local: ${zone.name}")
    }

    private fun removeNamedConfEntry(zone: DnsZone) {
        val confFile = File(getNamedConfLocalPath())
        if (!confFile.exists()) return

        val startMarker = managedBlockStart.format(zone.name)
        val endMarker = managedBlockEnd.format(zone.name)
        val lines = confFile.readLines()
        val filtered = mutableListOf<String>()
        var skipping = false

        for (line in lines) {
            when {
                line.trim() == startMarker -> skipping = true
                line.trim() == endMarker -> { skipping = false; continue }
                !skipping -> filtered.add(line)
            }
        }
        confFile.writeText(filtered.joinToString("\n").trimEnd() + "\n")
    }

    private fun ensureInclude(filePath: String) {
        val mainConf = File(getNamedConfLocalPath())
        if (!mainConf.exists()) return
        val includeDirective = "include \"$filePath\";"
        val content = mainConf.readText()
        if (!content.contains(includeDirective)) {
            mainConf.appendText("\n$includeDirective\n")
        }
    }

    // ===================================================================
    //  Helpers
    // ===================================================================

    private fun reloadBind() {
        val result = bindExec("rndc reload")
        if (result.exitCode != 0) logger.warn("rndc reload failed: ${result.error}")
    }

    // ==================== Installation ====================

    override fun getInstallStatus(): DnsInstallStatus {
        val osType = if (isMac) "mac" else "linux"

        // Check Docker Compose-based BIND9
        if (dnsComposeFile.exists()) {
            val cName = containerName
            val docker = AppConfig.dockerCommand
            val dockerCheck = commandExecutor.execute("$docker ps -a --filter name=$cName --format '{{.ID}}|{{.Image}}|{{.Status}}'")
            if (dockerCheck.exitCode == 0 && dockerCheck.output.isNotBlank()) {
                val parts = dockerCheck.output.trim().split("|")
                if (parts.size >= 3) {
                    val running = parts[2].lowercase().startsWith("up")
                    val version = commandExecutor.execute("$docker exec $cName named -v 2>/dev/null").output.trim()
                    return DnsInstallStatus(
                        installed = true, method = DnsInstallMethod.DOCKER, running = running,
                        version = version, dockerContainerId = parts[0], dockerImage = parts[1],
                        composeFile = dnsComposeFile.absolutePath, osType = osType
                    )
                }
            }
            return DnsInstallStatus(installed = true, method = DnsInstallMethod.DOCKER, running = false, composeFile = dnsComposeFile.absolutePath, osType = osType)
        }

        // Check apt-based BIND9 (Linux only)
        if (!isMac) {
            val aptCheck = commandExecutor.execute("dpkg -s bind9 2>/dev/null")
            if (aptCheck.exitCode == 0 && aptCheck.output.contains("Status: install ok installed")) {
                val version = commandExecutor.execute("named -v 2>/dev/null").output.trim()
                val running = commandExecutor.execute("systemctl is-active named 2>/dev/null || systemctl is-active bind9 2>/dev/null").output.trim() == "active"
                return DnsInstallStatus(installed = true, method = DnsInstallMethod.APT, running = running, version = version, osType = osType)
            }
        }

        return DnsInstallStatus(installed = false, osType = osType)
    }

    override fun install(request: DnsInstallRequest): DnsActionResult = lock.withLock {
        try {
            when (request.method) {
                DnsInstallMethod.DOCKER -> installDocker(request)
                DnsInstallMethod.APT -> installApt()
            }
        } catch (e: Exception) {
            logger.error("DNS install failed", e)
            DnsActionResult(false, "Install failed: ${e.message}")
        }
    }

    private fun resolveDataPath(path: String): String {
        val file = File(path)
        return if (file.isAbsolute) path else File(AppConfig.dataRoot, path).absolutePath
    }

    private fun generateNextSerial(currentSerial: Long): Long {
        val now = java.time.LocalDateTime.now()
        val today = now.format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd"))
        val datePart = today.toLong() * 100
        
        return when {
            currentSerial / 100 < today.toLong() -> datePart + 1
            currentSerial / 100 == today.toLong() -> currentSerial + 1
            else -> currentSerial + 1 // Handled manual future serials by just incrementing
        }
    }

    private fun installDocker(req: DnsInstallRequest): DnsActionResult {
        val docker = AppConfig.dockerCommand

        val daemonCheck = commandExecutor.execute("$docker info")
        if (daemonCheck.exitCode != 0) {
            return DnsActionResult(false, "Docker is not running. Please start Docker Desktop and try again.")
        }

        val configPath = resolveDataPath(req.configPath)
        val dataPath = resolveDataPath(req.dataPath)

        dnsComposeDir.mkdirs()
        File(dataPath).mkdirs()
        File(configPath).mkdirs()

        seedDefaultConfig(File(configPath), forDocker = true)

        logger.info("Pulling BIND9 image: ${req.dockerImage}")
        val pullResult = longCmdExecutor.execute("$docker pull ${req.dockerImage}")
        if (pullResult.exitCode != 0) {
            val err = (pullResult.error + " " + pullResult.output).trim().take(500)
            return DnsActionResult(false, "Failed to pull image '${req.dockerImage}': $err")
        }

        val envFile = File(dnsComposeDir, ".env")
        envFile.writeText(buildString {
            appendLine("BIND9_IMAGE=${req.dockerImage}")
            appendLine("BIND9_CONTAINER_NAME=${req.containerName}")
            appendLine("BIND9_HOST_PORT=${req.hostPort}")
            appendLine("BIND9_CONFIG_PATH=$configPath")
            appendLine("BIND9_DATA_PATH=$dataPath")
        })

        val template = ResourceLoader.loadResourceOrThrow("templates/dns/docker-compose.yml")
        val composeContent = ResourceLoader.replacePlaceholders(template, mapOf(
            "BIND9_IMAGE" to req.dockerImage,
            "BIND9_CONTAINER_NAME" to req.containerName,
            "BIND9_HOST_PORT" to req.hostPort.toString(),
            "BIND9_CONFIG_PATH" to configPath,
            "BIND9_DATA_PATH" to dataPath
        ))
        dnsComposeFile.writeText(composeContent)

        val result = DockerService.composeUp(dnsComposeFile.absolutePath)
        return if (result.success) {
            DnsActionResult(true, "BIND9 started via Docker Compose")
        } else {
            val msg = result.message
            if (msg.contains("address already in use", ignoreCase = true) || msg.contains("port is already allocated", ignoreCase = true)) {
                DnsActionResult(false, "Port ${req.hostPort} is already in use. On macOS, port 53 is used by mDNSResponder — try a different port (e.g., 5353).")
            } else {
                DnsActionResult(false, "Compose up failed: $msg")
            }
        }
    }

    private fun seedDefaultConfig(configDir: File, forDocker: Boolean = isDockerMode) {
        val namedConf = File(configDir, "named.conf")
        if (namedConf.exists()) return

        logger.info("Seeding default BIND9 config in ${configDir.absolutePath} (forDocker=$forDocker)")

        // Container-internal paths if Docker, host-absolute paths otherwise
        val optionsPath = if (forDocker) "/etc/bind/named.conf.options" else File(configDir, "named.conf.options").absolutePath
        val localPath   = if (forDocker) "/etc/bind/named.conf.local"   else File(configDir, "named.conf.local").absolutePath
        val loggingPath = if (forDocker) "/etc/bind/named.conf.logging" else File(configDir, "named.conf.logging").absolutePath

        // 1. Root named.conf — must use container paths so BIND9 can find them inside the container
        namedConf.writeText("""
include "$optionsPath";
include "$loggingPath";
include "$localPath";
""".trimIndent() + "\n")

        // 2. named.conf.options
        writeOptionsConfig(configDir, forDocker)

        // 3. named.conf.logging
        val loggingConf = File(configDir, "named.conf.logging")
        loggingConf.writeText("""
logging {
    channel default_log {
        stderr;
        severity info;
        print-time yes;
        print-severity yes;
        print-category yes;
    };
    category default { default_log; };
    category queries { default_log; };
    category security { default_log; };
    category xfer-out { default_log; };
    category notify { default_log; };
};
""".trimIndent() + "\n")

        // 4. named.conf.local
        val localConf = File(configDir, "named.conf.local")
        if (!localConf.exists()) {
            localConf.writeText("// Zone definitions go here\n")
        }

        // 5. named.conf.forwarders (empty placeholder)
        val forwardersFile = File(configDir, "named.conf.forwarders")
        if (!forwardersFile.exists()) {
            forwardersFile.writeText("// Global forwarders go here\n")
        }
    }

    private fun installApt(): DnsActionResult {
        val install = commandExecutor.execute("apt-get update && apt-get install -y bind9 bind9utils bind9-doc dnsutils")
        if (install.exitCode != 0) return DnsActionResult(false, "apt install failed: ${install.error.take(500)}")

        val start = commandExecutor.execute("systemctl enable --now named 2>/dev/null || systemctl enable --now bind9 2>/dev/null")
        return if (start.exitCode == 0) {
            DnsActionResult(true, "BIND9 installed and started via apt")
        } else {
            DnsActionResult(true, "BIND9 installed. Service start returned: ${start.output.take(200)}")
        }
    }

    override fun uninstall(): DnsActionResult = lock.withLock {
        val status = getInstallStatus()
        if (!status.installed) return DnsActionResult(false, "BIND9 is not installed")

        return when (status.method) {
            DnsInstallMethod.DOCKER -> {
                val result = DockerService.composeDown(dnsComposeFile.absolutePath, removeVolumes = true)
                if (result.success) {
                    dnsComposeFile.delete()
                    File(dnsComposeDir, ".env").delete()
                    DnsActionResult(true, "BIND9 compose stack removed")
                } else {
                    DnsActionResult(false, "Compose down failed: ${result.message}")
                }
            }
            DnsInstallMethod.APT -> {
                val r = commandExecutor.execute("systemctl stop named 2>/dev/null; systemctl stop bind9 2>/dev/null; apt-get remove -y bind9 bind9utils")
                DnsActionResult(r.exitCode == 0, if (r.exitCode == 0) "BIND9 removed" else r.error.take(300))
            }
            else -> DnsActionResult(false, "Unknown install method")
        }
    }

    private fun executeAction(command: String, successMsg: String): DnsActionResult {
        val result = commandExecutor.execute(command)
        return DnsActionResult(result.exitCode == 0, if (result.exitCode == 0) successMsg else result.error.ifBlank { result.output })
    }

    private fun extractLine(output: String, prefix: String): String =
        output.lines().firstOrNull { it.startsWith(prefix) }?.substringAfter(prefix)?.trim() ?: ""

    private fun translateToContainerPath(hostPath: String): String {
        if (!isDockerMode) return hostPath
        val file = File(hostPath)
        // If the path contains "/keys/", it's likely a DNSSEC key
        return if (hostPath.contains("/keys/")) {
            "/var/lib/bind/keys/${file.name}"
        } else {
            // Otherwise, we assume it's a zone file directly in the BIND data root
            "/var/lib/bind/${file.name}"
        }
    }

    companion object {
        fun defaultTemplates(): List<ZoneTemplate> = listOf(
            ZoneTemplate(
                id = "tpl-web-basic",
                name = "Basic Website",
                description = "NS, A, www CNAME, and mail records for a typical website",
                records = listOf(
                    DnsRecord(id = "t1", name = "@", type = DnsRecordType.NS, value = "ns1.example.com.", ttl = 86400),
                    DnsRecord(id = "t2", name = "@", type = DnsRecordType.NS, value = "ns2.example.com.", ttl = 86400),
                    DnsRecord(id = "t3", name = "@", type = DnsRecordType.A, value = "1.2.3.4", ttl = 3600),
                    DnsRecord(id = "t4", name = "www", type = DnsRecordType.CNAME, value = "@", ttl = 3600),
                    DnsRecord(id = "t5", name = "@", type = DnsRecordType.MX, value = "mail.example.com.", ttl = 3600, priority = 10),
                )
            ),
            ZoneTemplate(
                id = "tpl-email",
                name = "Email Setup",
                description = "MX, SPF, DKIM placeholder, and DMARC records",
                records = listOf(
                    DnsRecord(id = "t6", name = "@", type = DnsRecordType.MX, value = "mail.example.com.", ttl = 3600, priority = 10),
                    DnsRecord(id = "t7", name = "@", type = DnsRecordType.TXT, value = "v=spf1 mx a ~all", ttl = 3600),
                    DnsRecord(id = "t8", name = "_dmarc", type = DnsRecordType.TXT, value = "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com", ttl = 3600),
                )
            ),
            ZoneTemplate(
                id = "tpl-google-workspace",
                name = "Google Workspace",
                description = "MX records and verification TXT for Google Workspace",
                records = listOf(
                    DnsRecord(id = "t9", name = "@", type = DnsRecordType.MX, value = "aspmx.l.google.com.", ttl = 3600, priority = 1),
                    DnsRecord(id = "t10", name = "@", type = DnsRecordType.MX, value = "alt1.aspmx.l.google.com.", ttl = 3600, priority = 5),
                    DnsRecord(id = "t11", name = "@", type = DnsRecordType.MX, value = "alt2.aspmx.l.google.com.", ttl = 3600, priority = 5),
                    DnsRecord(id = "t12", name = "@", type = DnsRecordType.TXT, value = "v=spf1 include:_spf.google.com ~all", ttl = 3600),
                )
            )
        )
    }
}

// ===================================================================
//  Facade object
// ===================================================================

object DnsService {
    private val service: IDnsService by lazy { DnsServiceImpl() }

    // Zone management
    fun listZones() = service.listZones()
    fun getZone(id: String) = service.getZone(id)
    fun createZone(req: CreateZoneRequest) = service.createZone(req)
    fun deleteZone(id: String) = service.deleteZone(id)
    fun toggleZone(id: String) = service.toggleZone(id)
    fun updateZoneOptions(id: String, req: UpdateZoneOptionsRequest) = service.updateZoneOptions(id, req)
    fun updateZone(id: String, req: UpdateZoneRequest) = service.updateZone(id, req)

    // Records
    fun getRecords(zoneId: String) = service.getRecords(zoneId)
    fun updateRecords(zoneId: String, records: List<DnsRecord>) = service.updateRecords(zoneId, records)
    fun addRecord(zoneId: String, record: DnsRecord) = service.addRecord(zoneId, record)
    fun deleteRecord(zoneId: String, recordId: String) = service.deleteRecord(zoneId, recordId)

    // Service control
    fun getStatus() = service.getStatus()
    fun reload() = service.reload()
    fun restart() = service.restart()
    fun flushCache() = service.flushCache()

    // Validation
    fun validateConfig() = service.validateConfig()
    fun validateZone(id: String) = service.validateZone(id)

    // Zone file
    fun getZoneFileContent(id: String) = service.getZoneFileContent(id)
    fun exportZoneFile(id: String) = service.exportZoneFile(id)
    fun importZoneFile(req: BulkImportRequest) = service.importZoneFile(req)

    // ACLs
    fun listAcls() = service.listAcls()
    fun createAcl(acl: DnsAcl) = service.createAcl(acl)
    fun updateAcl(acl: DnsAcl) = service.updateAcl(acl)
    fun deleteAcl(id: String) = service.deleteAcl(id)

    // TSIG
    fun listTsigKeys() = service.listTsigKeys()
    fun createTsigKey(key: TsigKey) = service.createTsigKey(key)
    fun deleteTsigKey(id: String) = service.deleteTsigKey(id)

    // Forwarders
    fun getForwarderConfig() = service.getForwarderConfig()
    fun updateForwarderConfig(config: DnsForwarderConfig) = service.updateForwarderConfig(config)

    // DNSSEC
    fun getDnssecStatus(zoneId: String) = service.getDnssecStatus(zoneId)
    fun enableDnssec(zoneId: String) = service.enableDnssec(zoneId)
    fun disableDnssec(zoneId: String) = service.disableDnssec(zoneId)
    fun signZone(zoneId: String) = service.signZone(zoneId)
    fun getDsRecords(zoneId: String) = service.getDsRecords(zoneId)

    // Security Options
    fun getGlobalSecurityConfig() = service.getGlobalSecurityConfig()
    fun updateGlobalSecurityConfig(config: GlobalSecurityConfig) = service.updateGlobalSecurityConfig(config)

    // Lookup
    fun lookup(req: DnsLookupRequest) = service.lookup(req)

    // Stats
    fun getQueryStats() = service.getQueryStats()
    fun getLogs(tail: Int = 100) = service.getLogs(tail)

    // Templates
    fun listTemplates() = service.listTemplates()
    fun createTemplate(t: ZoneTemplate) = service.createTemplate(t)
    fun deleteTemplate(id: String) = service.deleteTemplate(id)
    fun applyTemplate(zoneId: String, templateId: String) = service.applyTemplate(zoneId, templateId)

    // Installation
    fun getInstallStatus() = service.getInstallStatus()
    fun install(req: DnsInstallRequest) = service.install(req)
    fun uninstall() = service.uninstall()
}
