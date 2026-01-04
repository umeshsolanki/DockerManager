package com.umeshsolanki.dockermanager

import io.ktor.server.application.Application
import io.ktor.server.response.respondText
import io.ktor.server.routing.*
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.CloseReason
import io.ktor.websocket.close
import com.umeshsolanki.dockermanager.routes.*
import io.ktor.server.auth.authenticate

fun Application.configureRouting() {
    routing {
        get("/") {
            call.respondText("UCpanel API is running")
        }
        
        
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

        webSocket("/shell/server") {
            ShellService.handleServerShell(this)
        }
        
        webSocket("/shell/container/{id}") {
            val id = call.parameters["id"] ?: return@webSocket close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Container ID required"))
            ShellService.handleContainerShell(this, id)
        }
    }
}

