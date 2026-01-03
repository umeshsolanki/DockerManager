package com.umeshsolanki.dockermanager.routes

import com.umeshsolanki.dockermanager.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.emailRoutes() {
    route("/emails") {
        route("/domains") {
            get {
                call.respond(DockerService.listEmailDomains())
            }
            put("/{domain}") {
                val domain = call.parameters["domain"] ?: return@put call.respond(ProxyActionResult(false, "Domain required"))
                val success = DockerService.createEmailDomain(domain)
                call.respond(ProxyActionResult(success, if (success) "Domain created" else "Failed to create domain"))
            }
            delete("/{domain}") {
                val domain = call.parameters["domain"] ?: return@delete call.respond(ProxyActionResult(false, "Domain required"))
                val success = DockerService.deleteEmailDomain(domain)
                call.respond(ProxyActionResult(success, if (success) "Domain deleted" else "Failed to delete domain"))
            }
        }

        route("/users") {
            get {
                call.respond(DockerService.listEmailUsers())
            }
            put("/{userAddress}") {
                val userAddress = call.parameters["userAddress"] ?: return@put call.respond(ProxyActionResult(false, "User address required"))
                val request = call.receive<CreateEmailUserRequest>()
                val success = DockerService.createEmailUser(userAddress, request)
                call.respond(ProxyActionResult(success, if (success) "User created" else "Failed to create user"))
            }
            delete("/{userAddress}") {
                val userAddress = call.parameters["userAddress"] ?: return@delete call.respond(ProxyActionResult(false, "User address required"))
                val success = DockerService.deleteEmailUser(userAddress)
                call.respond(ProxyActionResult(success, if (success) "User deleted" else "Failed to delete user"))
            }
            patch("/{userAddress}/password") {
                val userAddress = call.parameters["userAddress"] ?: return@patch call.respond(ProxyActionResult(false, "User address required"))
                val request = call.receive<UpdateEmailUserPasswordRequest>()
                val success = DockerService.updateEmailUserPassword(userAddress, request)
                call.respond(ProxyActionResult(success, if (success) "Password updated" else "Failed to update password"))
            }
        }
    }
}
