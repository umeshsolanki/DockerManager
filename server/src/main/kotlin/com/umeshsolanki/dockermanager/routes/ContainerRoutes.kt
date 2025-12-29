package com.umeshsolanki.dockermanager.routes

import com.umeshsolanki.dockermanager.DockerService
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.*

fun Route.containerRoutes() {
    route("/containers") {
        get {
            call.respond(DockerService.listContainers())
        }

        post("/{id}/start") {
            val id = call.parameters["id"] ?: return@post call.respondText("Missing ID", status = HttpStatusCode.BadRequest)
            DockerService.startContainer(id)
            call.respondText("Started")
        }

        post("/{id}/stop") {
            val id = call.parameters["id"] ?: return@post call.respondText("Missing ID", status = HttpStatusCode.BadRequest)
            DockerService.stopContainer(id)
            call.respondText("Stopped")
        }

        delete("/{id}") {
            val id = call.parameters["id"] ?: return@delete call.respondText("Missing ID", status = HttpStatusCode.BadRequest)
            DockerService.removeContainer(id)
            call.respondText("Removed")
        }

        post("/prune") {
            DockerService.pruneContainers()
            call.respondText("Pruned")
        }
    }
}
