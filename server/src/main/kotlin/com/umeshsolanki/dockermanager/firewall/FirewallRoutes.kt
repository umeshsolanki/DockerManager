package com.umeshsolanki.dockermanager.firewall

import com.umeshsolanki.dockermanager.*
import io.ktor.http.HttpStatusCode
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
            call.respondBooleanResult(
                FirewallService.blockIP(request),
                "IP Blocked",
                "Failed to block IP",
                HttpStatusCode.Created
            )
        }

        delete("/rules/{id}") {
            val id = call.requireParameter("id") ?: return@delete
            call.respondBooleanResult(
                FirewallService.unblockIP(id),
                "IP Unblocked",
                "Failed to unblock IP"
            )
        }
    }
}
