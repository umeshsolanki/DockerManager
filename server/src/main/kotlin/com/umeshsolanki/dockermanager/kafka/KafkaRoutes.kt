package com.umeshsolanki.dockermanager.kafka

import com.umeshsolanki.dockermanager.*
import com.umeshsolanki.dockermanager.ServiceContainer
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*

fun Route.kafkaRoutes() {
    val kafkaService = ServiceContainer.kafkaService

    route("/kafka") {
        get("/topics") {
            call.respond(kafkaService.listTopics())
        }

        post("/topics") {
            val request = call.receive<KafkaTopicInfo>()
            val success = kafkaService.createTopic(
                request.name,
                request.partitions,
                request.replicationFactor.toShort()
            )
            if (success) {
                call.respond(HttpStatusCode.Created, mapOf("success" to true))
            } else {
                call.respond(HttpStatusCode.BadRequest, mapOf("success" to false, "message" to "Failed to create topic"))
            }
        }

        delete("/topics/{name}") {
            val name = call.parameters["name"] ?: return@delete call.respond(HttpStatusCode.BadRequest)
            val success = kafkaService.deleteTopic(name)
            if (success) {
                call.respond(HttpStatusCode.OK, mapOf("success" to true))
            } else {
                call.respond(HttpStatusCode.BadRequest, mapOf("success" to false, "message" to "Failed to delete topic"))
            }
        }

        get("/topics/{name}/messages") {
            val name = call.parameters["name"] ?: return@get call.respond(HttpStatusCode.BadRequest)
            val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 50
            call.respond(kafkaService.getMessages(name, limit))
        }
    }
}
