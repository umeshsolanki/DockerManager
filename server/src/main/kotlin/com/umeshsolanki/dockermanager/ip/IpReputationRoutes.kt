package com.umeshsolanki.dockermanager.ip

import io.ktor.server.routing.*
import io.ktor.server.response.*
import io.ktor.server.request.*
import io.ktor.server.application.*
import io.ktor.http.HttpStatusCode


import kotlinx.serialization.Serializable
import com.umeshsolanki.dockermanager.ServiceContainer

@Serializable
data class TagIpRequest(
    val add: List<String> = emptyList(),
    val remove: List<String> = emptyList(),
    val danger: Boolean = false
)

fun Route.ipReputationRoutes() {
    val ipReputationService = ServiceContainer.ipReputationService
    
    route("/ip-reputation") {
        get {
            val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 100
            val offset = call.request.queryParameters["offset"]?.toLongOrNull() ?: 0L
            val search = call.request.queryParameters["search"]
            call.respond(ipReputationService.listIpReputations(limit, offset, search))
        }

        get("/{ip}") {
            val ip = call.parameters["ip"] ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing IP")
            val reputation = ipReputationService.getIpReputation(ip)
            if (reputation != null) {
                call.respond(reputation)
            } else {
                call.respond(HttpStatusCode.NotFound)
            }
        }
        
        delete("/{ip}") {
             val ip = call.parameters["ip"] ?: return@delete call.respond(HttpStatusCode.BadRequest, "Missing IP")
             val deleted = ipReputationService.deleteIpReputation(ip)
             if (deleted) {
                 call.respond(HttpStatusCode.OK)
             } else {
                 call.respond(HttpStatusCode.NotFound)
             }
        }

        patch("/{ip}/tags") {
            val ip = call.parameters["ip"] ?: return@patch call.respond(HttpStatusCode.BadRequest, "Missing IP")
            val request = runCatching { call.receive<TagIpRequest>() }.getOrElse {
                return@patch call.respond(HttpStatusCode.BadRequest, "Invalid body")
            }
            // Check if IP exists first
            val existing = ipReputationService.getIpReputation(ip)
            if (existing == null) {
                return@patch call.respond(HttpStatusCode.NotFound, "IP not found in reputation DB")
            }
            
            ipReputationService.tagIpReputation(ip, request.add, request.remove, request.danger)
            
            // Return updated
            val updated = ipReputationService.getIpReputation(ip)
            if (updated != null) {
                call.respond(HttpStatusCode.OK, updated)
            } else {
                call.respond(HttpStatusCode.InternalServerError)
            }
        }
    }
}
