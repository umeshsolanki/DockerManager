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
