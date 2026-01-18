package com.umeshsolanki.dockermanager.database

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.javatime.datetime

object ProxyLogsTable : Table("proxy_logs") {
    val id = long("id").autoIncrement()
    val timestamp = datetime("timestamp").index()
    val remoteIp = varchar("remote_ip", 45).index()
    val method = varchar("method", 20)
    val path = text("path")
    val status = integer("status").index()
    val responseTime = long("response_time").default(0)
    val userAgent = text("user_agent").nullable()
    val referer = text("referer").nullable()
    val domain = varchar("domain", 255).index().nullable()
    val countryCode = varchar("country_code", 2).nullable()
    val provider = varchar("provider", 255).nullable()

    override val primaryKey = PrimaryKey(id)
}
