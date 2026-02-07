package com.umeshsolanki.dockermanager.database

import org.jetbrains.exposed.dao.id.IntIdTable
import org.jetbrains.exposed.sql.javatime.datetime
import java.time.LocalDateTime

object SavedQueriesTable : IntIdTable("saved_queries") {
    val name = varchar("name", 255)
    val sql = text("sql")
    val createdAt = datetime("created_at").default(LocalDateTime.now())
}
