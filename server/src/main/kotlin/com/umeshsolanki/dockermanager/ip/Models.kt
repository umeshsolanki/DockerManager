package com.umeshsolanki.dockermanager.ip

import kotlinx.serialization.Serializable

@Serializable
data class IpInfo(
    val ip: String,
    val country: String? = null,
    val countryCode: String? = null,
    val city: String? = null,
    val isp: String? = null,
    val lat: Double? = null,
    val lon: Double? = null,
    val timezone: String? = null,
    val zip: String? = null,
    val region: String? = null,
    val regionName: String? = null,
    val org: String? = null,
    val asName: String? = null,
    val lastUpdated: Long = System.currentTimeMillis()
)
