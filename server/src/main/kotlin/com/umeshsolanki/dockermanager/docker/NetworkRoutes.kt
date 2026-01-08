package com.umeshsolanki.dockermanager.docker

import com.umeshsolanki.dockermanager.*
import io.ktor.server.response.respond
import io.ktor.server.routing.*

fun Route.networkRoutes() {
    route("/networks") {
        get {
            call.respond(DockerService.listNetworks())
        }
        
        get("/{id}") {
            val id = call.requireParameter("id") ?: return@get
            val details = DockerService.inspectNetwork(id)
            call.respondNullableResult(details)
        }

        delete("/{id}") {
            val id = call.requireParameter("id") ?: return@delete
            call.respondBooleanResult(
                DockerService.removeNetwork(id),
                "Network removed",
                "Failed to remove network"
            )
        }
    }
}
