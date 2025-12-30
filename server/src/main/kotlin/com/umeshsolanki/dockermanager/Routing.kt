package com.umeshsolanki.dockermanager

import io.ktor.server.application.Application
import io.ktor.server.response.respondText
import io.ktor.server.routing.*
import com.umeshsolanki.dockermanager.routes.*

fun Application.configureRouting() {
    routing {
        get("/") {
            call.respondText("Docker Manager API is running")
        }
        
        containerRoutes()
        imageRoutes()
        composeRoutes()
        secretRoutes()
        networkRoutes()
        volumeRoutes()
        systemRoutes()
        logRoutes()
        firewallRoutes()
    }
}
