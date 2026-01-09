package com.umeshsolanki.dockermanager.constants

/**
 * Constants related to firewall and iptables operations.
 */
object FirewallConstants {
    // IPSet configuration
    const val IPSET_NAME = "dm-blocklist-ip"
    const val IPSET_TYPE = "hash:ip"
    const val IPSET_TIMEOUT = "timeout 0"
    
    // Iptables chains
    const val CHAIN_DOCKER_USER = "DOCKER-USER"
    const val CHAIN_INPUT = "INPUT"
    
    // Iptables target
    const val TARGET_DROP = "DROP"
    
    // Iptables comment prefixes
    const val COMMENT_PREFIX_RULE = "dm-rule-"
    const val COMMENT_MANAGED = "dm-managed"
    const val COMMENT_MANAGED_HOST = "dm-managed-host"
    
    // Iptables flags
    const val FLAG_WAIT = "-w"
    const val FLAG_CHECK = "-C"
    const val FLAG_INSERT = "-I"
    const val FLAG_DELETE = "-D"
    const val FLAG_LIST = "-L"
    const val FLAG_NUMERIC = "-n"
    const val FLAG_VERBOSE = "-v"
    
    // Protocol defaults
    const val PROTOCOL_DEFAULT = "tcp"
    const val PROTOCOL_ALL = "ALL"
    
    // Match set options
    const val MATCH_SET_SRC = "src"
}






