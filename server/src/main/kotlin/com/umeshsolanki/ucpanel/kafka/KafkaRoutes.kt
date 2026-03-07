package com.umeshsolanki.ucpanel.kafka

import com.umeshsolanki.ucpanel.*
import com.umeshsolanki.ucpanel.proxy.KafkaActionResult
import com.umeshsolanki.ucpanel.ServiceContainer
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*
import org.jetbrains.exposed.sql.selectAll

private val logger = org.slf4j.LoggerFactory.getLogger("KafkaRoutes")

fun Route.kafkaRoutes() {
    val kafkaService = ServiceContainer.kafkaService

    route("/kafka") {
        get("/topics") {
            try {
                call.respond(kafkaService.listTopics(AppConfig.settings.kafkaSettings))
            } catch (e: Exception) {
                logger.error("Error listing topics", e)
                call.respond(HttpStatusCode.InternalServerError, KafkaActionResult(success = false, message = e.message ?: "Unknown error"))
            }
        }

        post("/topics") {
            val request = try {
                call.receive<KafkaTopicInfo>()
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, mapOf("success" to false, "message" to "Invalid request body"))
                return@post
            }
            
            logger.info("Creating Kafka topic: ${request.name}")
            val result = kafkaService.createTopic(
                AppConfig.settings.kafkaSettings,
                request.name,
                request.partitions,
                request.replicationFactor.toShort()
            )
            if (result.isSuccess) {
                logger.info("Topic ${request.name} created successfully")
                call.respond(HttpStatusCode.Created, KafkaActionResult(success = true))
            } else {
                val error = result.exceptionOrNull()
                logger.error("Failed to create topic ${request.name}", error)
                call.respond(HttpStatusCode.BadRequest, KafkaActionResult(
                    success = false, 
                    message = error?.message ?: "Failed to create topic"
                ))
            }
        }

        delete("/topics/{name}") {
            val name = call.parameters["name"] ?: return@delete call.respond(HttpStatusCode.BadRequest)
            val result = kafkaService.deleteTopic(AppConfig.settings.kafkaSettings, name)
            if (result.isSuccess) {
                call.respond(HttpStatusCode.OK, KafkaActionResult(success = true))
            } else {
                call.respond(HttpStatusCode.BadRequest, KafkaActionResult(
                    success = false, 
                    message = result.exceptionOrNull()?.message ?: "Failed to delete topic"
                ))
            }
        }

        get("/topics/{name}/messages") {
            val name = call.parameters["name"] ?: return@get call.respond(HttpStatusCode.BadRequest)
            val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 50
            call.respond(kafkaService.getMessages(AppConfig.settings.kafkaSettings, name, limit))
        }

        get("/rules") {
            call.respond(AppConfig.settings.kafkaRules)
        }

        post("/rules") {
            val rules = try {
                call.receive<List<KafkaRule>>()
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, mapOf("success" to false, "message" to "Invalid rules format"))
                return@post
            }
            AppConfig.updateKafkaRules(rules)
            call.respond(HttpStatusCode.OK, mapOf("success" to true))
        }

        get("/events") {
            val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 100
            val events = com.umeshsolanki.ucpanel.database.DatabaseFactory.dbQuery {
                com.umeshsolanki.ucpanel.database.KafkaProcessedEventsTable
                    .selectAll()
                    .orderBy(com.umeshsolanki.ucpanel.database.KafkaProcessedEventsTable.timestamp, org.jetbrains.exposed.sql.SortOrder.DESC)
                    .limit(limit)
                    .map {
                        KafkaProcessedEvent(
                            id = it[com.umeshsolanki.ucpanel.database.KafkaProcessedEventsTable.id],
                            originalTopic = it[com.umeshsolanki.ucpanel.database.KafkaProcessedEventsTable.originalTopic],
                            timestamp = it[com.umeshsolanki.ucpanel.database.KafkaProcessedEventsTable.timestamp].atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli(),
                            originalValue = it[com.umeshsolanki.ucpanel.database.KafkaProcessedEventsTable.originalValue],
                            processedValue = it[com.umeshsolanki.ucpanel.database.KafkaProcessedEventsTable.processedValue],
                            appliedRules = it[com.umeshsolanki.ucpanel.database.KafkaProcessedEventsTable.appliedRules].split(",").filter { s -> s.isNotBlank() }
                        )
                    }
            }
            call.respond(events)
        }
    }
}
