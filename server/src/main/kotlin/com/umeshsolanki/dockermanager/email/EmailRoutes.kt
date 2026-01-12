package com.umeshsolanki.dockermanager.email

import com.umeshsolanki.dockermanager.*
import com.umeshsolanki.dockermanager.proxy.ProxyActionResult
import com.umeshsolanki.dockermanager.docker.SaveComposeRequest
import com.umeshsolanki.dockermanager.email.UpdateEmailUserPasswordRequest
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route

fun Route.emailRoutes() {
    route("/emails") {
        route("/domains") {
            get {
                call.respond(EmailService.listEmailDomains())
            }
            put("/{domain}") {
                val domain = call.parameters["domain"] ?: return@put call.respond(
                    ProxyActionResult(
                        false, "Domain required"
                    )
                )
                val success = EmailService.createEmailDomain(domain)
                call.respond(
                    ProxyActionResult(
                        success, if (success) "Domain created" else "Failed to create domain"
                    )
                )
            }
            delete("/{domain}") {
                val domain = call.parameters["domain"] ?: return@delete call.respond(
                    ProxyActionResult(
                        false, "Domain required"
                    )
                )
                val success = EmailService.deleteEmailDomain(domain)
                call.respond(
                    ProxyActionResult(
                        success, if (success) "Domain deleted" else "Failed to delete domain"
                    )
                )
            }
        }

        route("/users") {
            get {
                call.respond(EmailService.listEmailUsers())
            }
            put("/{userAddress}") {
                val userAddress = call.parameters["userAddress"] ?: return@put call.respond(
                    ProxyActionResult(
                        false, "User address required"
                    )
                )
                val request = call.receive<CreateEmailUserRequest>()
                val result = EmailService.createEmailUser(userAddress, request)
                call.respond(
                    ProxyActionResult(
                        result.first, result.second
                    )
                )
            }
            delete("/{userAddress}") {
                val userAddress = call.parameters["userAddress"] ?: return@delete call.respond(
                    ProxyActionResult(
                        false, "User address required"
                    )
                )
                val success = EmailService.deleteEmailUser(userAddress)
                call.respond(
                    ProxyActionResult(
                        success, if (success) "User deleted" else "Failed to delete user"
                    )
                )
            }
            patch("/{userAddress}/password") {
                val userAddress = call.parameters["userAddress"] ?: return@patch call.respond(
                    ProxyActionResult(
                        false, "User address required"
                    )
                )
                val request = call.receive<UpdateEmailUserPasswordRequest>()
                val success = EmailService.updateEmailUserPassword(userAddress, request)
                call.respond(
                    ProxyActionResult(
                        success, if (success) "Password updated" else "Failed to update password"
                    )
                )
            }

            route("/{userAddress}/mailboxes") {
                get {
                    val userAddress = call.parameters["userAddress"] ?: return@get call.respond(
                        ProxyActionResult(
                            false, "User address required"
                        )
                    )
                    call.respond(EmailService.listEmailMailboxes(userAddress))
                }
                put("/{mailboxName}") {
                    val userAddress = call.parameters["userAddress"] ?: return@put call.respond(
                        ProxyActionResult(
                            false, "User address required"
                        )
                    )
                    val mailboxName = call.parameters["mailboxName"] ?: return@put call.respond(
                        ProxyActionResult(
                            false, "Mailbox name required"
                        )
                    )
                    val success = EmailService.createEmailMailbox(userAddress, mailboxName)
                    call.respond(
                        ProxyActionResult(
                            success, if (success) "Mailbox created" else "Failed to create mailbox"
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
                    val success = EmailService.deleteEmailMailbox(userAddress, mailboxName)
                    call.respond(
                        ProxyActionResult(
                            success, if (success) "Mailbox deleted" else "Failed to delete mailbox"
                        )
                    )
                }
            }
        }

        route("/groups") {
            get {
                call.respond(EmailService.listEmailGroups())
            }
            get("/{groupAddress}") {
                val groupAddress =
                    call.parameters["groupAddress"] ?: return@get call.respond(emptyList<String>())
                call.respond(EmailService.getEmailGroupMembers(groupAddress))
            }
            put("/{groupAddress}/{memberAddress}") {
                val groupAddress = call.parameters["groupAddress"] ?: return@put
                val memberAddress = call.parameters["memberAddress"] ?: return@put
                val success = EmailService.addEmailGroupMember(groupAddress, memberAddress)
                call.respond(
                    ProxyActionResult(
                        success,
                        if (success) "Added to group" else "Failed to add"
                    )
                )
            }
            delete("/{groupAddress}/{memberAddress}") {
                val groupAddress = call.parameters["groupAddress"] ?: return@delete
                val memberAddress = call.parameters["memberAddress"] ?: return@delete
                val success = EmailService.removeEmailGroupMember(groupAddress, memberAddress)
                call.respond(
                    ProxyActionResult(
                        success,
                        if (success) "Removed from group" else "Failed to remove"
                    )
                )
            }
        }

        route("/quota") {
            get("/{userAddress}") {
                val userAddress = call.parameters["userAddress"] ?: return@get
                call.respond(
                    EmailService.getEmailUserQuota(userAddress)
                        ?: HttpStatusCode.NotFound
                )
            }
            put("/{userAddress}/{type}") { // Type: count or size
                val userAddress = call.parameters["userAddress"] ?: return@put
                val type = call.parameters["type"] ?: return@put // "count" or "size"
                val value = call.receive<String>().toLongOrNull() ?: -1L
                val success = EmailService.setEmailUserQuota(userAddress, type, value)
                call.respond(ProxyActionResult(success, if (success) "Quota set" else "Failed"))
            }
            delete("/{userAddress}") {
                val userAddress = call.parameters["userAddress"] ?: return@delete
                val success = EmailService.deleteEmailUserQuota(userAddress)
                call.respond(ProxyActionResult(success, if (success) "Quota deleted" else "Failed"))
            }
        }

        // James Container Management
        route("/james") {
            get("/status") {
                call.respond(EmailService.getJamesStatus())
            }
            post("/config") {
                EmailService.ensureJamesConfig()
                call.respond(ProxyActionResult(true, "Config ensured"))
            }
            get("/compose") {
                call.respond(mapOf("content" to EmailService.getJamesComposeConfig()))
            }
            post("/compose") {
                val request = call.receive<SaveComposeRequest>()
                val success = EmailService.updateJamesComposeConfig(request.content)
                call.respond(
                    ProxyActionResult(
                        success, if (success) "Compose config updated" else "Failed to update"
                    )
                )
            }
            post("/start") {
                val success = EmailService.startJames()
                call.respond(
                    ProxyActionResult(
                        success, if (success) "James started" else "Failed to start James"
                    )
                )
            }
            post("/stop") {
                val success = EmailService.stopJames()
                call.respond(
                    ProxyActionResult(
                        success, if (success) "James stopped" else "Failed to stop James"
                    )
                )
            }
            post("/restart") {
                val success = EmailService.restartJames()
                call.respond(
                    ProxyActionResult(
                        success, if (success) "James restarted" else "Failed to restart James"
                    )
                )
            }
            post("/test") {
                val request = call.receive<EmailTestRequest>()
                call.respond(EmailService.testEmailConnection(request))
            }

            route("/files") {
                get {
                    call.respond(EmailService.listJamesConfigFiles())
                }
                get("/{filename}") {
                    val filename = call.parameters["filename"] ?: return@get call.respond(
                        HttpStatusCode.BadRequest
                    )
                    val content = EmailService.getJamesConfigContent(filename)
                    if (content != null) {
                        call.respond(mapOf("content" to content))
                    } else {
                        call.respond(HttpStatusCode.NotFound)
                    }
                }
                post("/{filename}") {
                    val filename = call.parameters["filename"] ?: return@post call.respond(
                        HttpStatusCode.BadRequest
                    )
                    val request = call.receive<Map<String, String>>()
                    val content =
                        request["content"] ?: return@post call.respond(HttpStatusCode.BadRequest)
                    val success = EmailService.updateJamesConfigContent(filename, content)
                    call.respond(
                        ProxyActionResult(
                            success,
                            if (success) "File updated" else "Failed to update file"
                        )
                    )
                }
                get("/{filename}/default") {
                    val filename = call.parameters["filename"] ?: return@get call.respond(
                        HttpStatusCode.BadRequest
                    )
                    val content = EmailService.getDefaultJamesConfigContent(filename)
                    if (content != null) {
                        call.respond(mapOf("content" to content))
                    } else {
                        call.respond(HttpStatusCode.NotFound)
                    }
                }
            }
        }

        // Mailcow Container Management
        route("/mailcow") {
            get("/status") {
                call.respond(EmailService.getMailcowStatus())
            }
            post("/config") {
                EmailService.ensureMailcowConfig()
                call.respond(ProxyActionResult(true, "Config ensured"))
            }
            get("/compose") {
                call.respond(mapOf("content" to EmailService.getMailcowComposeConfig()))
            }
            post("/compose") {
                val request = call.receive<SaveComposeRequest>()
                val success = EmailService.updateMailcowComposeConfig(request.content)
                call.respond(
                    ProxyActionResult(
                        success, if (success) "Compose config updated" else "Failed to update"
                    )
                )
            }
            post("/start") {
                val success = EmailService.startMailcow()
                call.respond(
                    ProxyActionResult(
                        success, if (success) "Mailcow started" else "Failed to start Mailcow"
                    )
                )
            }
            post("/stop") {
                val success = EmailService.stopMailcow()
                call.respond(
                    ProxyActionResult(
                        success, if (success) "Mailcow stopped" else "Failed to stop Mailcow"
                    )
                )
            }
            post("/restart") {
                val success = EmailService.restartMailcow()
                call.respond(
                    ProxyActionResult(
                        success, if (success) "Mailcow restarted" else "Failed to restart Mailcow"
                    )
                )
            }
        }
    }
}
