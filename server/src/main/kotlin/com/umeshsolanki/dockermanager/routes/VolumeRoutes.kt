package com.umeshsolanki.dockermanager.routes

import com.umeshsolanki.dockermanager.DockerService
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.volumeRoutes() {
    route("/volumes") {
        get {
            call.respond(DockerService.listVolumes())
        }

        get("/{name}/inspect") {
            val name = call.parameters["name"] ?: return@get call.respond(HttpStatusCode.BadRequest)
            val details = DockerService.inspectVolume(name)
            if (details != null) {
                call.respond(details)
            } else {
                call.respond(HttpStatusCode.NotFound)
            }
        }

        post("/{name}/backup") {
            val name = call.parameters["name"] ?: return@post call.respond(HttpStatusCode.BadRequest)
            call.respond(DockerService.backupVolume(name))
        }
        
        post("/prune") {
            if (DockerService.pruneVolumes()) {
                call.respond(HttpStatusCode.OK)
            } else {
                call.respond(HttpStatusCode.InternalServerError)
            }
        }
        
        delete("/{name}") {
            val name = call.parameters["name"] ?: return@delete call.respond(HttpStatusCode.BadRequest)
            if (DockerService.removeVolume(name)) {
                call.respond(HttpStatusCode.OK)
            } else {
                call.respond(HttpStatusCode.InternalServerError)
            }
        }
    }
}
