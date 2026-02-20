package com.umeshsolanki.dockermanager

import com.umeshsolanki.dockermanager.auth.authRoutes
import com.umeshsolanki.dockermanager.cache.cacheRoutes
import com.umeshsolanki.dockermanager.database.databaseRoutes
import com.umeshsolanki.dockermanager.dns.dnsRoutes
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
import com.umeshsolanki.dockermanager.ip.ipReputationRoutes
import com.umeshsolanki.dockermanager.kafka.kafkaRoutes
import com.umeshsolanki.dockermanager.proxy.*
import com.umeshsolanki.dockermanager.system.systemRoutes
import io.ktor.server.application.Application
import io.ktor.server.auth.authenticate
import io.ktor.server.http.content.react
import io.ktor.server.http.content.singlePageApplication
import io.ktor.server.routing.*
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.response.respondRedirect

fun Application.configureRouting() {
    // Cache index.html content
    val indexHtml = Application::class.java.classLoader.getResource("ui/index.html")?.readText()

    routing {
        // Health check (no auth, for load balancers / Docker / k8s)
        get("/health") {
            call.respondText("""{"status":"ok"}""", ContentType.Application.Json)
        }

        // API Routes
        authRoutes()
        securityMirrorRoutes()

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
            customPageRoutes()
            analyticsRoutes()
            emailRoutes()
            cacheRoutes()
            databaseRoutes()
            kafkaRoutes()
            ipReputationRoutes()
            dnsRoutes()
        }

        fileRoutes()

        // WebSocket routes
        webSocketRoutes()

        // Serve UI (React App)
        singlePageApplication {
            useResources = true
            react("ui")
            applicationRoute = "ui"
        }

        // Redirect root / to /ui/
        get("/") {
            call.respondRedirect("/ui/")
        }

        // Serve index.html as text for /index.txt
        get("/index.txt") {
            if (indexHtml != null) {
                call.respondText(indexHtml, ContentType.Text.Plain)
            } else {
                call.respond(HttpStatusCode.NotFound, "UI not found")
            }
        }
    }
}

