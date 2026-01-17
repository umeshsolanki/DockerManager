package com.umeshsolanki.dockermanager.email

import com.umeshsolanki.dockermanager.proxy.ProxyActionResult
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route

fun Route.emailRoutes() {
    route("/emails") {
        
        // Alert/SMTP Configuration
        get("/config") {
            call.respond(EmailService.getAlertConfig())
        }
        
        post("/config") {
            val config = call.receive<AlertConfig>()
            EmailService.updateAlertConfig(config)
            call.respond(ProxyActionResult(true, "Email configuration updated"))
        }

        // Test SMTP Connection
        post("/test") {
            val request = call.receive<EmailTestRequest>()
            // Map request to SmtpConfig for testing
            val config = SmtpConfig(
                host = request.host,
                port = request.port,
                username = request.userAddress, // reusing userAddress as username
                password = request.password,
                useTls = request.useTls,
                useSsl = request.port == 465 // naive assumption based on port for simple test
            )
            // Send to userAddress (self)
            call.respond(EmailService.sendTestEmail(config, request.userAddress))
        }
    }
}
