package com.umeshsolanki.dockermanager.database

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.javatime.datetime
import java.time.LocalDateTime

object FcmTokensTable : Table("fcm_tokens") {
    val token = varchar("token", 512)
    val platform = varchar("platform", 50)
    val deviceName = varchar("device_name", 255)
    val createdAt = datetime("created_at").clientDefault { LocalDateTime.now() }
    val lastUsedAt = datetime("last_used_at").clientDefault { LocalDateTime.now() }

    override val primaryKey = PrimaryKey(token)
}
