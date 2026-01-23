package com.umeshsolanki.dockermanager.docker

import com.umeshsolanki.dockermanager.*
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

        delete("/{id}") {
            val id = call.requireParameter("id") ?: return@delete
            DockerService.removeImage(id)
            call.respondText("Removed")
        }
    }
}
