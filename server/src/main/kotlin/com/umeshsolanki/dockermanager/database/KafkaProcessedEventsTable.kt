package com.umeshsolanki.dockermanager.database

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.javatime.datetime
import java.time.LocalDateTime

object KafkaProcessedEventsTable : Table("kafka_processed_events") {
    val id = varchar("id", 50)
    val originalTopic = varchar("original_topic", 255)
    val timestamp = datetime("timestamp").default(LocalDateTime.now())
    val originalValue = text("original_value")
    val processedValue = text("processed_value")
    val appliedRules = text("applied_rules") // Store as comma-separated IDs or JSON

    override val primaryKey = PrimaryKey(id)
}
