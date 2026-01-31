package com.umeshsolanki.dockermanager.firewall

import kotlinx.serialization.Serializable

// ========== Firewall Models ==========

@Serializable
data class FirewallRule(
    val id: String,
    val ip: String,
    val port: Int? = null,
    val protocol: String = "ALL",
    val comment: String? = null,
    val expiresAt: Long? = null,
    val country: String? = null,
    val city: String? = null,
    val isp: String? = null,
    val lat: Double? = null,
    val lon: Double? = null,
    val timezone: String? = null,
    val zip: String? = null,
    val region: String? = null,
    val createdAt: Long = System.currentTimeMillis()
)

@Serializable
data class BlockIPRequest(
    val ip: String,
    val port: Int? = null,
    val protocol: String = "ALL",
    val comment: String? = null,
    val expiresAt: Long? = null,
    val country: String? = null,
    val city: String? = null,
    val isp: String? = null,
    val lat: Double? = null,
    val lon: Double? = null,
    val timezone: String? = null,
    val zip: String? = null,
    val region: String? = null
)

@Serializable
data class IptablesRule(
    val pkts: String,
    val bytes: String,
    val target: String,
    val prot: String,
    val opt: String,
    val ins: String,
    val out: String,
    val source: String,
    val destination: String,
    val extra: String = ""
)

