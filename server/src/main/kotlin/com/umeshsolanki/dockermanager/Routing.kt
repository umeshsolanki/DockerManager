package com.umeshsolanki.dockermanager

import com.umeshsolanki.dockermanager.auth.authRoutes
import com.umeshsolanki.dockermanager.cache.cacheRoutes
import com.umeshsolanki.dockermanager.database.databaseRoutes
import com.umeshsolanki.dockermanager.docker.composeRoutes
import com.umeshsolanki.dockermanager.docker.containerRoutes
import com.umeshsolanki.dockermanager.docker.imageRoutes
import com.umeshsolanki.dockermanager.docker.logRoutes
import com.umeshsolanki.dockermanager.docker.networkRoutes
import com.umeshsolanki.dockermanager.docker.secretRoutes
import com.umeshsolanki.dockermanager.docker.volumeRoutes
import com.umeshsolanki.dockermanager.email.emailRoutes
import com.umeshsolanki.dockermanager.file.fileRoutes
import com.umeshsolanki.dockermanager.firewall.firewallRoutes
import com.umeshsolanki.dockermanager.proxy.analyticsRoutes
import com.umeshsolanki.dockermanager.proxy.proxyRoutes
import com.umeshsolanki.dockermanager.system.systemRoutes
import io.ktor.server.application.Application
import io.ktor.server.auth.authenticate
import io.ktor.server.http.content.react
import io.ktor.server.http.content.singlePageApplication
import io.ktor.server.routing.routing

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
            analyticsRoutes()
            emailRoutes()
            cacheRoutes()
            databaseRoutes()
        }

        fileRoutes()

        // WebSocket routes
        webSocketRoutes()

        // Serve UI (React App)
        singlePageApplication {
            this.react("ui")
            useResources = true
//            filesPath = "ui"
            defaultPage = "index.html"
        }
    }
}

