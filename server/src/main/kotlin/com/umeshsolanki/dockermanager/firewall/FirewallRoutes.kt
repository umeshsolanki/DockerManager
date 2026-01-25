package com.umeshsolanki.dockermanager.firewall

import com.umeshsolanki.dockermanager.*
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.*

fun Route.firewallRoutes() {
    route("/firewall") {
        get("/rules") {
            call.respond(FirewallService.listRules())
        }

        get("/iptables") {
            call.respond(FirewallService.getIptablesVisualisation())
        }

        get("/iptables/raw") {
            call.respond(FirewallService.getIptablesRaw())
        }

        get("/nftables") {
            call.respond(FirewallService.getNftablesVisualisation())
        }

        get("/nftables/json") {
            val json = FirewallService.getNftablesJson()
            call.respondText(json, io.ktor.http.ContentType.Application.Json)
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
