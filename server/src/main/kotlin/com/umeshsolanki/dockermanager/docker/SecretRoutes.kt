package com.umeshsolanki.dockermanager.docker

import com.umeshsolanki.dockermanager.*
import io.ktor.server.request.*
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.*

fun Route.secretRoutes() {
    route("/secrets") {
        get {
            call.respond(DockerService.listSecrets())
        }

        post {
            val name = call.requireQueryParameter("name") ?: return@post
            val data = call.requireQueryParameter("data") ?: return@post
            call.respondTextResult(
                DockerService.createSecret(name, data),
                "Created",
                "Failed to create"
            )
        }

        post("/batch-delete") {
            val request = call.receive<BatchDeleteRequest>()
            val results = DockerService.removeSecrets(request.ids)
            call.respond(results)
        }

        delete("/{id}") {
            val id = call.requireParameter("id") ?: return@delete
            call.respondTextResult(
                DockerService.removeSecret(id),
                "Removed",
                "Failed to remove"
            )
        }
    }
}
