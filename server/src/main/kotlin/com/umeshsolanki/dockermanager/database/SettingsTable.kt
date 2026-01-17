package com.umeshsolanki.dockermanager.database

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.javatime.datetime
import java.time.LocalDateTime

object SettingsTable : Table("app_settings") {
    val key = varchar("setting_key", 50).uniqueIndex()
    val value = text("setting_value")
    val updatedAt = datetime("updated_at").clientDefault { LocalDateTime.now() }

    override val primaryKey = PrimaryKey(key)
}
