package com.umeshsolanki.dockermanager

import io.ktor.server.application.Application
import io.ktor.server.response.respondText
import io.ktor.server.routing.*
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.CloseReason
import io.ktor.websocket.close
import com.umeshsolanki.dockermanager.routes.*
import io.ktor.server.auth.authenticate

import io.ktor.server.http.content.*

fun Application.configureRouting() {
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
            emailRoutes()
        }

        fileRoutes()

        webSocket("/shell/server") {
            ShellService.handleServerShell(this)
        }
        
        webSocket("/shell/container/{id}") {
            val id = call.parameters["id"] ?: return@webSocket close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Container ID required"))
            ShellService.handleContainerShell(this, id)
        }

        // Serve UI (React App)
        singlePageApplication {
            useResources = true
            filesPath = "ui"
            defaultPage = "index.html"
        }
    }
}

