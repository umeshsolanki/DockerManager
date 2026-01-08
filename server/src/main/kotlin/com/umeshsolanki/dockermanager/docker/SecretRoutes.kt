package com.umeshsolanki.dockermanager.docker

import com.umeshsolanki.dockermanager.DockerService
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.*

fun Route.secretRoutes() {
    route("/secrets") {
        get {
            call.respond(DockerService.listSecrets())
        }

        post {
            val name = call.request.queryParameters["name"] ?: return@post call.respondText("Missing Name", status = HttpStatusCode.BadRequest)
            val data = call.request.queryParameters["data"] ?: return@post call.respondText("Missing Data", status = HttpStatusCode.BadRequest)
            if (DockerService.createSecret(name, data)) {
                call.respondText("Created")
            } else {
                call.respondText("Failed to create", status = HttpStatusCode.InternalServerError)
            }
        }

        delete("/{id}") {
            val id = call.parameters["id"] ?: return@delete call.respondText("Missing ID", status = HttpStatusCode.BadRequest)
            if (DockerService.removeSecret(id)) {
                call.respondText("Removed")
            } else {
                call.respondText("Failed to remove", status = HttpStatusCode.InternalServerError)
            }
        }
    }
}
