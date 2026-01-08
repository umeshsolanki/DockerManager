package com.umeshsolanki.dockermanager.docker

import com.umeshsolanki.dockermanager.*
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.*

fun Route.containerRoutes() {
    route("/containers") {
        get {
            call.respond(DockerService.listContainers())
        }

        post {
            val request = call.receive<CreateContainerRequest>()
            val id = DockerService.createContainer(request)
            if (id != null) {
                call.respond(HttpStatusCode.Created, id)
            } else {
                call.respond(HttpStatusCode.InternalServerError, "Failed to create container")
            }
        }

        get("/{id}/inspect") {
            val id = call.requireParameter("id") ?: return@get
            val details = DockerService.inspectContainer(id)
            call.respondNullableResult(details)
        }

        post("/{id}/start") {
            val id = call.requireParameter("id") ?: return@post
            DockerService.startContainer(id)
            call.respondText("Started")
        }

        post("/{id}/stop") {
            val id = call.requireParameter("id") ?: return@post
            DockerService.stopContainer(id)
            call.respondText("Stopped")
        }

        delete("/{id}") {
            val id = call.requireParameter("id") ?: return@delete
            DockerService.removeContainer(id)
            call.respondText("Removed")
        }

        get("/{id}/logs") {
            val id = call.requireParameter("id") ?: return@get
            val tail = call.request.queryParameters["tail"]?.toIntOrNull() ?: 100
            val logs = DockerService.getContainerLogs(id, tail)
            call.respondText(logs)
        }

        post("/prune") {
            DockerService.pruneContainers()
            call.respondText("Pruned")
        }
    }
}
