package com.umeshsolanki.dockermanager.proxy

import io.ktor.server.routing.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.http.*
import org.slf4j.LoggerFactory

private val logger = LoggerFactory.getLogger("SecurityRoutes")

fun Route.securityRoutes() {
    route("/security") {
        // Mirror endpoint for Nginx to report bad requests (Danger Logging)
        // This endpoint receives a mirror of the original blocked request
        // Handled asynchronously to block IPs instantly
        post("/mirror/{...}") {
            try {
                // Extract IP from Nginx headers
                val ip = call.request.header("X-Real-IP") 
                    ?: call.request.header("X-Forwarded-For")?.split(",")?.firstOrNull()?.trim()
                    ?: call.request.local.remoteAddress
                
                val userAgent = call.request.header(HttpHeaders.UserAgent) ?: "Unknown"
                val method = call.request.httpMethod.value
                val status = call.request.header("X-Mirror-Status")?.toIntOrNull() ?: 403
                
                // Extract original path from headers (preferred) or tail parameters
                val headerPath = call.request.header("X-Mirror-URI")
                val pathParams = call.parameters.getAll("...") ?: emptyList()
                val fullPath = headerPath ?: (if (pathParams.isEmpty()) "/" else "/" + pathParams.joinToString("/"))
                
                // Extract all headers for analysis if needed
                val headers = call.request.headers.entries().associate { it.key to it.value.joinToString(",") }
                val reason = call.request.header("X-Mirror-Reason") ?: "mirror"

                ProxyService.processMirrorRequest(
                    ip = ip,
                    userAgent = userAgent,
                    method = method,
                    path = fullPath,
                    status = status,
                    headers = headers + ("X-Mirror-Reason" to reason),
                    body = null
                )

                // Mirror requests don't need a specific body, just 200 OK
                call.respond(HttpStatusCode.OK)
            } catch (e: Exception) {
                logger.error("Error handling danger mirror request", e)
                call.respond(HttpStatusCode.InternalServerError)
            }
        }
    }
}
