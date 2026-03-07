package com.umeshsolanki.ucpanel

import com.umeshsolanki.ucpanel.auth.AuthService
import com.umeshsolanki.ucpanel.fcm.FcmService
import io.ktor.server.application.Application
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty

fun main() {
    embeddedServer(Netty, port = SERVER_PORT, host = "0.0.0.0", module = Application::module)
        .start(wait = true)
}

fun Application.module() {
    // Initialize service container (dependency injection)
    ServiceContainer.initialize()
    
    AuthService.initialize()
    FcmService.initialize()
    configurePlugins()
    configureRouting()
}