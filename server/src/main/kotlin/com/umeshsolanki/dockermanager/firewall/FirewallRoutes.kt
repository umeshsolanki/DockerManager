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
            try {
                val result = FirewallService.getNftablesVisualisation()
                call.respondText(result, io.ktor.http.ContentType.Text.Plain)
            } catch (e: Exception) {
                call.respondText("Error: nftables unavailable - ${e.message ?: "nft command not found or failed"}", io.ktor.http.ContentType.Text.Plain)
            }
        }

        get("/nftables/json") {
            try {
                val json = FirewallService.getNftablesJson()
                call.respondText(json, io.ktor.http.ContentType.Application.Json)
            } catch (e: Exception) {
                val msg = (e.message ?: "nft command not found or failed").replace("\\", "\\\\").replace("\"", "\\\"")
                call.respondText("""{"error":"nftables unavailable - $msg"}""", io.ktor.http.ContentType.Application.Json)
            }
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

        // CIDR range blocking & whitelisting
        get("/cidr") {
            call.respond(FirewallService.listCidrRules())
        }

        post("/cidr") {
            val rule = call.receive<CidrRule>()
            call.respondBooleanResult(
                FirewallService.addCidrRule(rule),
                "CIDR rule added",
                "Failed to add CIDR rule",
                HttpStatusCode.Created
            )
        }

        delete("/cidr/{id}") {
            val id = call.requireParameter("id") ?: return@delete
            call.respondBooleanResult(
                FirewallService.removeCidrRule(id),
                "CIDR rule removed",
                "Failed to remove CIDR rule"
            )
        }
    }
}
