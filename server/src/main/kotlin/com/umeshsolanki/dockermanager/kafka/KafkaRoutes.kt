package com.umeshsolanki.dockermanager.kafka

import com.umeshsolanki.dockermanager.*
import com.umeshsolanki.dockermanager.proxy.KafkaActionResult
import com.umeshsolanki.dockermanager.ServiceContainer
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*

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
    }
}
