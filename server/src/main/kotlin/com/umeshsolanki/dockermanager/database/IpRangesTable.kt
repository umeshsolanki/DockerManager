package com.umeshsolanki.dockermanager.database

import org.jetbrains.exposed.sql.Table

object IpRangesTable : Table("ip_ranges") {
    val id = integer("id").autoIncrement()
    val startIp = decimal("start_ip", 39, 0).index() // Supports IPv6 numeric representation
    val endIp = decimal("end_ip", 39, 0).index()
    val countryCode = varchar("country_code", 2).nullable()
    val countryName = varchar("country_name", 100).nullable()
    val provider = varchar("provider", 255).nullable()
    val type = varchar("type", 50).nullable() // e.g., hosting, residential, dynamic
    val cidr = varchar("cidr", 50).nullable()
    val asn = varchar("asn", 50).nullable()

    override val primaryKey = PrimaryKey(id)
}
