package com.umeshsolanki.dockermanager.routes

import com.umeshsolanki.dockermanager.BlockIPRequest
import com.umeshsolanki.dockermanager.DockerService
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*

fun Route.firewallRoutes() {
    route("/firewall") {
        get("/rules") {
            call.respond(DockerService.listFirewallRules())
        }

        get("/iptables") {
            call.respond(DockerService.getIptablesVisualisation())
        }

        post("/block") {
            val request = call.receive<BlockIPRequest>()
            if (DockerService.blockIP(request)) {
                call.respond(HttpStatusCode.Created, "IP Blocked")
            } else {
                call.respond(HttpStatusCode.InternalServerError, "Failed to block IP")
            }
        }

        delete("/rules/{id}") {
            val id = call.parameters["id"] ?: return@delete call.respond(HttpStatusCode.BadRequest)
            if (DockerService.unblockIP(id)) {
                call.respond(HttpStatusCode.OK, "IP Unblocked")
            } else {
                call.respond(HttpStatusCode.InternalServerError, "Failed to unblock IP")
            }
        }
    }
}
