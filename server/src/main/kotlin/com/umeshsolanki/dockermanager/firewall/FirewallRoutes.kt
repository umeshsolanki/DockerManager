package com.umeshsolanki.dockermanager.firewall

import com.umeshsolanki.dockermanager.*
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*

fun Route.firewallRoutes() {
    route("/firewall") {
        get("/rules") {
            call.respond(FirewallService.listRules())
        }

        get("/iptables") {
            call.respond(FirewallService.getIptablesVisualisation())
        }

        post("/block") {
            val request = call.receive<BlockIPRequest>()
            if (FirewallService.blockIP(request)) {
                call.respond(HttpStatusCode.Created, "IP Blocked")
            } else {
                call.respond(HttpStatusCode.InternalServerError, "Failed to block IP")
            }
        }

        delete("/rules/{id}") {
            val id = call.parameters["id"] ?: return@delete call.respond(HttpStatusCode.BadRequest)
            if (FirewallService.unblockIP(id)) {
                call.respond(HttpStatusCode.OK, "IP Unblocked")
            } else {
                call.respond(HttpStatusCode.InternalServerError, "Failed to unblock IP")
            }
        }
    }
}
