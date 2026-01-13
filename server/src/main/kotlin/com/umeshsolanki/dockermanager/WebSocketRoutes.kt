package com.umeshsolanki.dockermanager

import com.umeshsolanki.dockermanager.auth.AuthService
import com.umeshsolanki.dockermanager.proxy.AnalyticsService
import com.umeshsolanki.dockermanager.shell.ShellService
import io.ktor.server.application.ApplicationCall
import io.ktor.server.plugins.origin
import io.ktor.server.request.header
import io.ktor.server.routing.Routing
import io.ktor.server.routing.route
import io.ktor.server.websocket.WebSocketServerSession
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.CloseReason
import io.ktor.websocket.close
import org.slf4j.LoggerFactory

private val logger = LoggerFactory.getLogger("WebSocketAccess")

/**
 * Extracts authentication token from WebSocket request
 */
private fun extractWebSocketToken(call: ApplicationCall): String? {
    return call.request.queryParameters["token"] ?: call.request.header("Authorization")
        ?.removePrefix("Bearer ") ?: call.request.header("Sec-WebSocket-Protocol")?.split(",")
        ?.firstOrNull()?.trim()
}

/**
 * Validates WebSocket authentication token
 * Returns the token if valid, null otherwise
 */
private fun validateWebSocketToken(token: String?): String? {
    if (token.isNullOrBlank()) return null

    return try {
        if (AuthService.validateToken(token)) token else null
    } catch (e: Exception) {
        logger.error("Error validating WebSocket token", e)
        null
    }
}

/**
 * WebSocket connection context for tracking and logging
 */
private data class WebSocketContext(
    val endpoint: String,
    val clientIp: String,
    val userAgent: String,
    val containerId: String? = null,
)

/**
 * Handles authenticated WebSocket connection with logging and analytics
 */
private suspend fun WebSocketServerSession.handleAuthenticatedWebSocket(
    context: WebSocketContext,
    handler: suspend WebSocketServerSession.() -> Unit,
) {
    val connectionStartTime = System.currentTimeMillis()

    logger.info("WebSocket connection attempt: ${context.endpoint} from IP: ${context.clientIp}, User-Agent: ${context.userAgent}")

    // Extract and validate token
    val token = extractWebSocketToken(call)
    val validToken = validateWebSocketToken(token)

    if (validToken == null) {
        val reason =
            if (token.isNullOrBlank()) "NO TOKEN PROVIDED" else "INVALID TOKEN (${token.take(10)}...)"
        logger.warn("WebSocket REJECTED: ${context.endpoint} from IP: ${context.clientIp} - $reason")
        AnalyticsService.trackWebSocketConnection(
            context.endpoint, context.clientIp, context.userAgent, context.containerId, false
        )
        close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Authentication required"))
        return
    }

    // Authentication passed
    logger.info("WebSocket ACCEPTED: ${context.endpoint} from IP: ${context.clientIp} - Authentication successful")
    AnalyticsService.trackWebSocketConnection(
        context.endpoint, context.clientIp, context.userAgent, context.containerId, true
    )

    try {
        handler()
    } catch (e: Exception) {
        logger.error(
            "WebSocket error during session: ${context.endpoint} from IP: ${context.clientIp}",
            e
        )
        throw e
    } finally {
        logger.info("WebSocket connection closed: ${context.endpoint} from IP: ${context.clientIp}")
        AnalyticsService.updateWebSocketConnectionDuration(
            context.endpoint, context.clientIp, connectionStartTime
        )
    }
}

/**
 * Configures WebSocket routes for shell access
 * Authentication is checked IMMEDIATELY at the start of the webSocket block
 * Note: In Ktor, webSocket blocks execute after upgrade, but we check auth FIRST and close if invalid
 */
fun Routing.webSocketRoutes() {
    route("/shell") {
        webSocket("/server") {
            val context = WebSocketContext(
                endpoint = "/shell/server",
                clientIp = call.request.origin.remoteHost,
                userAgent = call.request.headers["User-Agent"] ?: "Unknown"
            )

            handleAuthenticatedWebSocket(context) {
                ShellService.handleServerShell(this)
            }
        }

        webSocket("/container/{id}") {
            val containerId = call.parameters["id"]

            if (containerId.isNullOrBlank()) {
                val clientIp = call.request.origin.remoteHost
                logger.warn("WebSocket REJECTED: /shell/container/{id} from IP: $clientIp - MISSING CONTAINER ID")
                close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Container ID required"))
                return@webSocket
            }

            val context = WebSocketContext(
                endpoint = "/shell/container/$containerId",
                clientIp = call.request.origin.remoteHost,
                userAgent = call.request.headers["User-Agent"] ?: "Unknown",
                containerId = containerId
            )

            handleAuthenticatedWebSocket(context) {
                ShellService.handleContainerShell(this, containerId)
            }
        }
    }
}

