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
                val domain = call.parameters["domain"] ?: return@put call.respond(
                    ProxyActionResult(
                        false,
                        "Domain required"
                    )
                )
                val success = DockerService.createEmailDomain(domain)
                call.respond(
                    ProxyActionResult(
                        success,
                        if (success) "Domain created" else "Failed to create domain"
                    )
                )
            }
            delete("/{domain}") {
                val domain = call.parameters["domain"] ?: return@delete call.respond(
                    ProxyActionResult(
                        false,
                        "Domain required"
                    )
                )
                val success = DockerService.deleteEmailDomain(domain)
                call.respond(
                    ProxyActionResult(
                        success,
                        if (success) "Domain deleted" else "Failed to delete domain"
                    )
                )
            }
        }

        route("/users") {
            get {
                call.respond(DockerService.listEmailUsers())
            }
            put("/{userAddress}") {
                val userAddress = call.parameters["userAddress"] ?: return@put call.respond(
                    ProxyActionResult(
                        false,
                        "User address required"
                    )
                )
                val request = call.receive<CreateEmailUserRequest>()
                val success = DockerService.createEmailUser(userAddress, request)
                call.respond(
                    ProxyActionResult(
                        success,
                        if (success) "User created" else "Failed to create user"
                    )
                )
            }
            delete("/{userAddress}") {
                val userAddress = call.parameters["userAddress"] ?: return@delete call.respond(
                    ProxyActionResult(
                        false,
                        "User address required"
                    )
                )
                val success = DockerService.deleteEmailUser(userAddress)
                call.respond(
                    ProxyActionResult(
                        success,
                        if (success) "User deleted" else "Failed to delete user"
                    )
                )
            }
            patch("/{userAddress}/password") {
                val userAddress = call.parameters["userAddress"] ?: return@patch call.respond(
                    ProxyActionResult(
                        false,
                        "User address required"
                    )
                )
                val request = call.receive<UpdateEmailUserPasswordRequest>()
                val success = DockerService.updateEmailUserPassword(userAddress, request)
                call.respond(
                    ProxyActionResult(
                        success,
                        if (success) "Password updated" else "Failed to update password"
                    )
                )
            }

            route("/{userAddress}/mailboxes") {
                get {
                    val userAddress = call.parameters["userAddress"] ?: return@get call.respond(
                        ProxyActionResult(
                            false,
                            "User address required"
                        )
                    )
                    call.respond(DockerService.listEmailMailboxes(userAddress))
                }
                put("/{mailboxName}") {
                    val userAddress = call.parameters["userAddress"] ?: return@put call.respond(
                        ProxyActionResult(
                            false,
                            "User address required"
                        )
                    )
                    val mailboxName = call.parameters["mailboxName"] ?: return@put call.respond(
                        ProxyActionResult(
                            false,
                            "Mailbox name required"
                        )
                    )
                    val success = DockerService.createEmailMailbox(userAddress, mailboxName)
                    call.respond(
                        ProxyActionResult(
                            success,
                            if (success) "Mailbox created" else "Failed to create mailbox"
                        )
                    )
                }
                delete("/{mailboxName}") {
                    val userAddress = call.parameters["userAddress"] ?: return@delete call.respond(
                        ProxyActionResult(false, "User address required")
                    )
                    val mailboxName = call.parameters["mailboxName"] ?: return@delete call.respond(
                        ProxyActionResult(false, "Mailbox name required")
                    )
                    val success = DockerService.deleteEmailMailbox(userAddress, mailboxName)
                    call.respond(
                        ProxyActionResult(
                            success,
                            if (success) "Mailbox deleted" else "Failed to delete mailbox"
                        )
                    )
                }
            }
        }

        route("/groups") {
            get {
                call.respond(DockerService.listEmailGroups())
            }
            get("/{groupAddress}") {
                val groupAddress = call.parameters["groupAddress"] ?: return@get call.respond(emptyList<String>())
                call.respond(DockerService.getEmailGroupMembers(groupAddress))
            }
            put("/{groupAddress}/{memberAddress}") {
                val groupAddress = call.parameters["groupAddress"] ?: return@put
                val memberAddress = call.parameters["memberAddress"] ?: return@put
                val success = DockerService.addEmailGroupMember(groupAddress, memberAddress)
                call.respond(ProxyActionResult(success, if (success) "Added to group" else "Failed to add"))
            }
            delete("/{groupAddress}/{memberAddress}") {
                val groupAddress = call.parameters["groupAddress"] ?: return@delete
                val memberAddress = call.parameters["memberAddress"] ?: return@delete
                val success = DockerService.removeEmailGroupMember(groupAddress, memberAddress)
                call.respond(ProxyActionResult(success, if (success) "Removed from group" else "Failed to remove"))
            }
        }

        route("/quota") {
            get("/{userAddress}") {
                val userAddress = call.parameters["userAddress"] ?: return@get
                call.respond(DockerService.getEmailUserQuota(userAddress) ?: io.ktor.http.HttpStatusCode.NotFound)
            }
            put("/{userAddress}/{type}") { // Type: count or size
                val userAddress = call.parameters["userAddress"] ?: return@put
                val type = call.parameters["type"] ?: return@put // "count" or "size"
                val value = call.receive<String>().toLongOrNull() ?: -1L
                val success = DockerService.setEmailUserQuota(userAddress, type, value)
                call.respond(ProxyActionResult(success, if (success) "Quota set" else "Failed"))
            }
            delete("/{userAddress}") {
                val userAddress = call.parameters["userAddress"] ?: return@delete
                val success = DockerService.deleteEmailUserQuota(userAddress)
                call.respond(ProxyActionResult(success, if (success) "Quota deleted" else "Failed"))
            }
        }

        // James Container Management
        route("/james") {
            get("/status") {
                call.respond(DockerService.getJamesStatus())
            }
            post("/config") {
                DockerService.ensureJamesConfig()
                call.respond(ProxyActionResult(true, "Config ensured"))
            }
            get("/compose") {
                call.respond(mapOf("content" to DockerService.getJamesComposeConfig()))
            }
            post("/compose") {
                val request = call.receive<SaveComposeRequest>()
                val success = DockerService.updateJamesComposeConfig(request.content)
                call.respond(
                    ProxyActionResult(
                        success,
                        if (success) "Compose config updated" else "Failed to update"
                    )
                )
            }
            post("/start") {
                val success = DockerService.startJames()
                call.respond(
                    ProxyActionResult(
                        success,
                        if (success) "James started" else "Failed to start James"
                    )
                )
            }
            post("/stop") {
                val success = DockerService.stopJames()
                call.respond(
                    ProxyActionResult(
                        success,
                        if (success) "James stopped" else "Failed to stop James"
                    )
                )
            }
            post("/restart") {
                val success = DockerService.restartJames()
                call.respond(
                    ProxyActionResult(
                        success,
                        if (success) "James restarted" else "Failed to restart James"
                    )
                )
            }
            post("/test") {
                val request = call.receive<EmailTestRequest>()
                call.respond(DockerService.testEmailConnection(request))
            }
        }
    }
}
