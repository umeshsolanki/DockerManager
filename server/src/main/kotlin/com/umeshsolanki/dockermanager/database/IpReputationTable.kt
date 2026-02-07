package com.umeshsolanki.dockermanager.database

import kotlinx.serialization.Serializable
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.javatime.datetime
import java.time.LocalDateTime

object IpReputationTable : Table("ip_reputation") {
    val ip = varchar("ip", 50)
    val firstObserved = datetime("first_observed").default(LocalDateTime.now())
    val lastActivity = datetime("last_activity").default(LocalDateTime.now())
    val firstBlocked = datetime("first_blocked").nullable()
    val blockedTimes = integer("blocked_times").default(0)
    val lastBlocked = datetime("last_blocked").nullable()
    val reasons = text("reasons").default("[]") // JSON array of unique reasons
    val country = varchar("country", 5).nullable()

    override val primaryKey = PrimaryKey(ip)
}

@Serializable
data class IpReputation(
    val ip: String,
    val firstObserved: String, // ISO formatted string for frontend
    val lastActivity: String,
    val firstBlocked: String? = null,
    val blockedTimes: Int = 0,
    val lastBlocked: String? = null,
    val reasons: List<String> = emptyList(),
    val country: String? = null
)
