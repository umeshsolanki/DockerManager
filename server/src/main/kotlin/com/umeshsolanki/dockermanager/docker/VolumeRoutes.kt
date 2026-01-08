package com.umeshsolanki.dockermanager.docker

import com.umeshsolanki.dockermanager.*
import io.ktor.server.response.respond
import io.ktor.server.routing.*

fun Route.volumeRoutes() {
    route("/volumes") {
        get {
            call.respond(DockerService.listVolumes())
        }

        get("/{name}/inspect") {
            val name = call.requireParameter("name") ?: return@get
            val details = DockerService.inspectVolume(name)
            call.respondNullableResult(details)
        }

        post("/{name}/backup") {
            val name = call.requireParameter("name") ?: return@post
            call.respond(DockerService.backupVolume(name))
        }
        
        post("/prune") {
            call.respondBooleanResult(
                DockerService.pruneVolumes(),
                "Volumes pruned",
                "Failed to prune volumes"
            )
        }
        
        delete("/{name}") {
            val name = call.requireParameter("name") ?: return@delete
            call.respondBooleanResult(
                DockerService.removeVolume(name),
                "Volume removed",
                "Failed to remove volume"
            )
        }
    }
}
