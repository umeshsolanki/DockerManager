package com.umeshsolanki.dockermanager.firewall

interface IFirewallService {
    fun listRules(): List<FirewallRule>
    fun blockIP(request: BlockIPRequest): Boolean
    fun unblockIP(id: String): Boolean
    fun unblockIPByAddress(ip: String): Boolean
    fun getIptablesVisualisation(): Map<String, List<IptablesRule>>
    fun getIptablesRaw(): String
    fun getNftablesVisualisation(): String
    fun getNftablesJson(): String
    fun updateRule(rule: FirewallRule): Boolean

    // CIDR range blocking & whitelisting
    fun listCidrRules(): List<CidrRule>
    fun addCidrRule(rule: CidrRule): Boolean
    fun removeCidrRule(id: String): Boolean
    fun isIpWhitelisted(ip: String): Boolean
    fun isIpInBlockedCidr(ip: String): Boolean
}