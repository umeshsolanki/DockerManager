package com.umeshsolanki.dockermanager.ip

import io.ktor.server.routing.*
import io.ktor.server.response.*
import io.ktor.server.request.*
import io.ktor.server.application.*
import io.ktor.http.HttpStatusCode

fun Route.ipReputationRoutes() {
    route("/ip-reputation") {
        get {
            val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 100
            val offset = call.request.queryParameters["offset"]?.toLongOrNull() ?: 0L
            val search = call.request.queryParameters["search"]
            call.respond(IpReputationService.listIpReputations(limit, offset, search))
        }

        get("/{ip}") {
            val ip = call.parameters["ip"] ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing IP")
            val reputation = IpReputationService.getIpReputation(ip)
            if (reputation != null) {
                call.respond(reputation)
            } else {
                call.respond(HttpStatusCode.NotFound)
            }
        }
        
        delete("/{ip}") {
             val ip = call.parameters["ip"] ?: return@delete call.respond(HttpStatusCode.BadRequest, "Missing IP")
             val deleted = IpReputationService.deleteIpReputation(ip)
             if (deleted) {
                 call.respond(HttpStatusCode.OK)
             } else {
                 call.respond(HttpStatusCode.NotFound)
             }
        }
    }
}
