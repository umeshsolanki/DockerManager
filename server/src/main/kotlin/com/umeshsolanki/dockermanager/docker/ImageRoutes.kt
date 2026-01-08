package com.umeshsolanki.dockermanager.docker

import com.umeshsolanki.dockermanager.*
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.*

fun Route.imageRoutes() {
    route("/images") {
        get {
            call.respond(DockerService.listImages())
        }

        post("/pull") {
            val name = call.request.queryParameters["image"] ?: return@post call.respondText("Missing Image Name", status = HttpStatusCode.BadRequest)
            if (DockerService.pullImage(name)) {
                call.respondText("Pulled")
            } else {
                call.respondText("Failed to pull", status = HttpStatusCode.InternalServerError)
            }
        }

        delete("/{id}") {
            val id = call.parameters["id"] ?: return@delete call.respondText("Missing ID", status = HttpStatusCode.BadRequest)
            DockerService.removeImage(id)
            call.respondText("Removed")
        }
    }
}
