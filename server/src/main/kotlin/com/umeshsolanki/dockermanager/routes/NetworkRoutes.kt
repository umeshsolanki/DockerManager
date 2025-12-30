package com.umeshsolanki.dockermanager.routes

import com.umeshsolanki.dockermanager.DockerService
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.networkRoutes() {
    route("/networks") {
        get {
            call.respond(DockerService.listNetworks())
        }
        
        delete("/{id}") {
            val id = call.parameters["id"] ?: return@delete call.respond(HttpStatusCode.BadRequest)
            if (DockerService.removeNetwork(id)) {
                call.respond(HttpStatusCode.OK)
            } else {
                call.respond(HttpStatusCode.InternalServerError)
            }
        }
    }
}
