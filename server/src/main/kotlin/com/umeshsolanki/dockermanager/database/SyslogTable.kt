package com.umeshsolanki.dockermanager.database

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.javatime.datetime

object SyslogTable : Table("syslog_entries") {
    val id = long("id").autoIncrement()
    val timestamp = datetime("timestamp").index()
    val facility = integer("facility").nullable()
    val severity = integer("severity").nullable()
    val host = varchar("host", 255).index().nullable()
    val appName = varchar("app_name", 255).index().nullable()
    val procId = varchar("proc_id", 100).nullable()
    val messageId = varchar("message_id", 100).nullable()
    val message = text("message")

    override val primaryKey = PrimaryKey(id)
}
