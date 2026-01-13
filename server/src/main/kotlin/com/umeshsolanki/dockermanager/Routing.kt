package com.umeshsolanki.dockermanager

import com.umeshsolanki.dockermanager.auth.authRoutes
import com.umeshsolanki.dockermanager.docker.*
import com.umeshsolanki.dockermanager.email.emailRoutes
import com.umeshsolanki.dockermanager.file.fileRoutes
import com.umeshsolanki.dockermanager.firewall.firewallRoutes
import com.umeshsolanki.dockermanager.proxy.proxyRoutes
import com.umeshsolanki.dockermanager.proxy.analyticsRoutes
import com.umeshsolanki.dockermanager.proxy.AnalyticsService
import com.umeshsolanki.dockermanager.shell.ShellService
import com.umeshsolanki.dockermanager.system.systemRoutes
import com.umeshsolanki.dockermanager.cache.cacheRoutes
import com.umeshsolanki.dockermanager.auth.AuthService
import io.ktor.server.application.Application
import io.ktor.server.response.respondText
import io.ktor.server.routing.*
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.CloseReason
import io.ktor.websocket.close
import io.ktor.server.auth.authenticate
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.request.header
import org.slf4j.LoggerFactory

import io.ktor.server.http.content.*
import io.ktor.server.plugins.origin

fun Application.configureRouting() {
    val logger = LoggerFactory.getLogger("WebSocketAccess")
    
    routing {
        // API Routes
        authRoutes()

        authenticate("auth-bearer") {
            containerRoutes()
            imageRoutes()
            composeRoutes()
            secretRoutes()
            networkRoutes()
            volumeRoutes()
            systemRoutes()
            logRoutes()
            firewallRoutes()
            proxyRoutes()
            analyticsRoutes()
            emailRoutes()
            cacheRoutes()
        }

        fileRoutes()

        // WebSocket routes - authentication is checked IMMEDIATELY at the start of the webSocket block
        // Note: In Ktor, webSocket blocks execute after upgrade, but we check auth FIRST and close if invalid
        route("/shell") {
            webSocket("/server") {
                val clientIp = call.request.origin.remoteHost
                val userAgent = call.request.headers["User-Agent"] ?: "Unknown"
                
                logger.info("WebSocket connection attempt: /shell/server from IP: $clientIp, User-Agent: $userAgent")
                
                // CRITICAL: Extract and validate token IMMEDIATELY - before any processing
                val token = call.request.queryParameters["token"] 
                    ?: call.request.header("Authorization")?.removePrefix("Bearer ")
                    ?: call.request.header("Sec-WebSocket-Protocol")?.split(",")?.firstOrNull()?.trim()
                
                // If no token, reject immediately
                if (token.isNullOrBlank()) {
                    logger.warn("WebSocket REJECTED: /shell/server from IP: $clientIp - NO TOKEN PROVIDED")
                    AnalyticsService.trackWebSocketConnection("/shell/server", clientIp, userAgent, null, false)
                    close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Authentication required"))
                    return@webSocket
                }
                
                // Validate token - if invalid, reject immediately
                val isValid = try {
                    AuthService.validateToken(token)
                } catch (e: Exception) {
                    logger.error("Error validating token", e)
                    false
                }
                
                if (!isValid) {
                    logger.warn("WebSocket REJECTED: /shell/server from IP: $clientIp - INVALID TOKEN (${token.take(10)}...)")
                    AnalyticsService.trackWebSocketConnection("/shell/server", clientIp, userAgent, null, false)
                    close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Invalid authentication token"))
                    return@webSocket
                }
                
                // Authentication passed - proceed with shell
                logger.info("WebSocket ACCEPTED: /shell/server from IP: $clientIp - Authentication successful")
                
                // Track WebSocket connection
                val connectionStartTime = System.currentTimeMillis()
                AnalyticsService.trackWebSocketConnection("/shell/server", clientIp, userAgent, null, true)
                
                try {
                    ShellService.handleServerShell(this)
                } catch (e: Exception) {
                    logger.error("WebSocket error during shell session: /shell/server from IP: $clientIp", e)
                    throw e
                } finally {
                    logger.info("WebSocket connection closed: /shell/server from IP: $clientIp")
                    AnalyticsService.updateWebSocketConnectionDuration("/shell/server", clientIp, connectionStartTime)
                }
            }
            
            webSocket("/container/{id}") {
                val clientIp = call.request.origin.remoteHost
                val userAgent = call.request.headers["User-Agent"] ?: "Unknown"
                val containerId = call.parameters["id"]
                
                logger.info("WebSocket connection attempt: /shell/container/$containerId from IP: $clientIp, User-Agent: $userAgent")
                
                // CRITICAL: Extract and validate token IMMEDIATELY - before any processing
                val token = call.request.queryParameters["token"] 
                    ?: call.request.header("Authorization")?.removePrefix("Bearer ")
                    ?: call.request.header("Sec-WebSocket-Protocol")?.split(",")?.firstOrNull()?.trim()
                
                // If no token, reject immediately
                if (token.isNullOrBlank()) {
                    logger.warn("WebSocket REJECTED: /shell/container/$containerId from IP: $clientIp - NO TOKEN PROVIDED")
                    val endpoint = "/shell/container/$containerId"
                    AnalyticsService.trackWebSocketConnection(endpoint, clientIp, userAgent, containerId, false)
                    close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Authentication required"))
                    return@webSocket
                }
                
                // Validate token - if invalid, reject immediately
                val isValid = try {
                    AuthService.validateToken(token)
                } catch (e: Exception) {
                    logger.error("Error validating token", e)
                    false
                }
                
                if (!isValid) {
                    logger.warn("WebSocket REJECTED: /shell/container/$containerId from IP: $clientIp - INVALID TOKEN (${token.take(10)}...)")
                    val endpoint = "/shell/container/$containerId"
                    AnalyticsService.trackWebSocketConnection(endpoint, clientIp, userAgent, containerId, false)
                    close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Invalid authentication token"))
                    return@webSocket
                }
                
                // Check container ID
                if (containerId.isNullOrBlank()) {
                    logger.warn("WebSocket REJECTED: /shell/container/{id} from IP: $clientIp - MISSING CONTAINER ID")
                    close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Container ID required"))
                    return@webSocket
                }
                
                // Authentication passed - proceed with container shell
                logger.info("WebSocket ACCEPTED: /shell/container/$containerId from IP: $clientIp - Authentication successful")
                
                // Track WebSocket connection
                val connectionStartTime = System.currentTimeMillis()
                val endpoint = "/shell/container/$containerId"
                AnalyticsService.trackWebSocketConnection(endpoint, clientIp, userAgent, containerId, true)
                
                try {
                    ShellService.handleContainerShell(this, containerId)
                } catch (e: Exception) {
                    logger.error("WebSocket error during shell session: /shell/container/$containerId from IP: $clientIp", e)
                    throw e
                } finally {
                    logger.info("WebSocket connection closed: /shell/container/$containerId from IP: $clientIp")
                    AnalyticsService.updateWebSocketConnectionDuration(endpoint, clientIp, connectionStartTime)
                }
            }
        }

        // Serve UI (React App)
        singlePageApplication {
            this.react("ui")
            useResources = true
//            filesPath = "ui"
            defaultPage = "index.html"
        }
    }
}

