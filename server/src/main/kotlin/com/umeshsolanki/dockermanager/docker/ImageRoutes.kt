package com.umeshsolanki.dockermanager.docker

import com.umeshsolanki.dockermanager.*
import io.ktor.server.request.*
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.*

fun Route.imageRoutes() {
    route("/images") {
        get {
            call.respond(DockerService.listImages())
        }

        post("/pull") {
            val name = call.requireQueryParameter("image") ?: return@post
            call.respondTextResult(
                DockerService.pullImage(name),
                "Pulled",
                "Failed to pull"
            )
        }

        post("/prune") {
            call.respondTextResult(
                DockerService.pruneImages(),
                "Images pruned",
                "Failed to prune images"
            )
        }

        post("/batch-delete") {
            val request = call.receive<BatchDeleteRequest>()
            val results = DockerService.removeImages(request.ids, request.force)
            call.respond(results)
        }

        delete("/{id}") {
            val id = call.requireParameter("id") ?: return@delete
            val force = call.request.queryParameters["force"]?.toBoolean() ?: false
            val success = DockerService.removeImage(id, force)
            if (success) call.respondText("Removed") else call.respondText("Failed", status = io.ktor.http.HttpStatusCode.InternalServerError)
        }
    }
}
