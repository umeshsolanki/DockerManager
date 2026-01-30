package com.umeshsolanki.dockermanager.docker

import com.umeshsolanki.dockermanager.*
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*

fun Route.networkRoutes() {
    route("/networks") {
        get {
            call.respond(DockerService.listNetworks())
        }

        post {
            val request = call.receive<CreateNetworkRequest>()
            val networkId = DockerService.createNetwork(request)
            if (networkId != null) {
                call.respond(mapOf("success" to true, "id" to networkId))
            } else {
                call.respond(mapOf("success" to false, "message" to "Failed to create network"))
            }
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
