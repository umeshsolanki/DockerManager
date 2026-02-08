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
    val exponentialBlockedTimes = integer("exponential_blocked_times").default(0)
    val lastJailDuration = integer("last_jail_duration").default(0)
    val flaggedTimes = integer("flagged_times").default(0)
    val firstFlagged = datetime("first_flagged").nullable()
    val lastFlagged = datetime("last_flagged").nullable()
    val lastBlocked = datetime("last_blocked").nullable()
    val reasons = text("reasons").default("") // CSV of unique reasons
    val country = varchar("country", 5).nullable()
    val isp = varchar("isp", 255).nullable()
    val tag = text("tag").nullable()
    val dangerTags = text("danger_tags").default("") // CSV of danger tags
    val range = varchar("range", 50).nullable()

    override val primaryKey = PrimaryKey(ip)
}

@Serializable
data class IpReputation(
    val ip: String,
    val firstObserved: String, // ISO formatted string for frontend
    val lastActivity: String,
    val firstBlocked: String? = null,
    val blockedTimes: Int = 0,
    val exponentialBlockedTimes: Int = 0,
    val lastJailDuration: Int = 0,
    val flaggedTimes: Int = 0,
    val firstFlagged: String? = null,
    val lastFlagged: String? = null,
    val lastBlocked: String? = null,
    val reasons: List<String> = emptyList(),
    val country: String? = null,
    val isp: String? = null,
    val tags: List<String> = emptyList(), // Regular tags
    val dangerTags: List<String> = emptyList(), // Tags from danger logs
    val range: String? = null
)
