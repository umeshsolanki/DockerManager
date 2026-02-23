package com.umeshsolanki.dockermanager.dns

interface IDnsService {

    // -- Zone management --
    fun listZones(): List<DnsZone>
    fun getZone(zoneId: String): DnsZone?
    fun createZone(request: CreateZoneRequest): DnsZone?
    fun deleteZone(zoneId: String): Boolean
    fun toggleZone(zoneId: String): Boolean
    fun updateZoneOptions(zoneId: String, request: UpdateZoneOptionsRequest): Boolean
    fun updateZone(zoneId: String, request: UpdateZoneRequest): Boolean

    // -- Record management --
    fun getRecords(zoneId: String): List<DnsRecord>
    fun updateRecords(zoneId: String, records: List<DnsRecord>): Boolean
    fun addRecord(zoneId: String, record: DnsRecord): Boolean
    fun deleteRecord(zoneId: String, recordId: String): Boolean

    // -- BIND9 service control --
    fun getStatus(): DnsServiceStatus
    fun reload(): DnsActionResult
    fun restart(): DnsActionResult
    fun flushCache(): DnsActionResult

    // -- Validation --
    fun validateConfig(): ZoneValidationResult
    fun validateZone(zoneId: String): ZoneValidationResult

    // -- Zone file content --
    fun getZoneFileContent(zoneId: String): String?
    fun exportZoneFile(zoneId: String): String?
    fun importZoneFile(request: BulkImportRequest): BulkImportResult

    // -- ACLs --
    fun listAcls(): List<DnsAcl>
    fun createAcl(acl: DnsAcl): DnsAcl
    fun updateAcl(acl: DnsAcl): Boolean
    fun deleteAcl(aclId: String): Boolean

    // -- TSIG Keys --
    fun listTsigKeys(): List<TsigKey>
    fun createTsigKey(key: TsigKey): TsigKey?
    fun deleteTsigKey(keyId: String): Boolean

    // -- Forwarders (global) --
    fun getForwarderConfig(): DnsForwarderConfig
    fun updateForwarderConfig(config: DnsForwarderConfig): Boolean

    // -- Global Security Config --
    fun getGlobalSecurityConfig(): GlobalSecurityConfig
    fun updateGlobalSecurityConfig(config: GlobalSecurityConfig): Boolean


    // -- DNSSEC --
    fun getDnssecStatus(zoneId: String): DnssecStatus
    fun enableDnssec(zoneId: String): DnsActionResult
    fun disableDnssec(zoneId: String): DnsActionResult
    fun signZone(zoneId: String): DnsActionResult
    fun getDsRecords(zoneId: String): List<String>

    // -- DNS Lookup (dig) --
    fun lookup(request: DnsLookupRequest): DnsLookupResult

    // -- Statistics and Logs --
    fun getQueryStats(): DnsQueryStats
    fun getLogs(tail: Int = 100): String

    // -- Zone Templates --
    fun listTemplates(): List<ZoneTemplate>
    fun createTemplate(template: ZoneTemplate): ZoneTemplate
    fun deleteTemplate(templateId: String): Boolean
    fun applyTemplate(zoneId: String, templateId: String): Boolean

    // -- Installation --
    fun getInstallStatus(): DnsInstallStatus
    fun install(request: DnsInstallRequest): DnsActionResult
    fun uninstall(): DnsActionResult

    // -- Professional Hosting Features --
    fun generateDkimKey(request: DkimKeyGenRequest): DkimKey
    fun buildSpfRecord(config: SpfConfig): String
    fun buildDmarcRecord(config: DmarcConfig): String
    fun suggestReverseZone(ip: String): IpPtrSuggestion
    fun generateReverseZones(zoneId: String): DnsActionResult
    fun checkPropagation(zoneId: String, recordName: String, recordType: DnsRecordType): PropagationCheckResult
    fun createDefaultZones(): List<DnsZone>
    fun regenerateZoneFiles(): DnsActionResult

    // Phase 2 Improvements
    fun buildSrvRecord(config: SrvConfig): String
    fun getEmailHealth(zoneId: String): EmailHealthStatus
    fun getReverseDnsDashboard(): ReverseDnsDashboard
}
