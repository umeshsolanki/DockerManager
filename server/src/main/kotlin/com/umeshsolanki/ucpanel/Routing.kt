package com.umeshsolanki.ucpanel

import com.umeshsolanki.ucpanel.auth.authRoutes
import com.umeshsolanki.ucpanel.cache.cacheRoutes
import com.umeshsolanki.ucpanel.database.databaseRoutes
import com.umeshsolanki.ucpanel.dns.*
import com.umeshsolanki.ucpanel.docker.composeRoutes
import com.umeshsolanki.ucpanel.docker.containerRoutes
import com.umeshsolanki.ucpanel.docker.imageRoutes
import com.umeshsolanki.ucpanel.docker.logRoutes
import com.umeshsolanki.ucpanel.docker.networkRoutes
import com.umeshsolanki.ucpanel.docker.secretRoutes
import com.umeshsolanki.ucpanel.docker.volumeRoutes
import com.umeshsolanki.ucpanel.email.emailRoutes
import com.umeshsolanki.ucpanel.file.fileRoutes
import com.umeshsolanki.ucpanel.firewall.firewallRoutes
import com.umeshsolanki.ucpanel.ip.ipReputationRoutes
import com.umeshsolanki.ucpanel.kafka.kafkaRoutes
import com.umeshsolanki.ucpanel.proxy.*
import com.umeshsolanki.ucpanel.system.systemRoutes
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

        dnsApiKeyRoutes()

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

