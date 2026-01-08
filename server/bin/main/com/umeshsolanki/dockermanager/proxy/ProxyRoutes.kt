package com.umeshsolanki.dockermanager.proxy

import com.umeshsolanki.dockermanager.AppSettings
import com.umeshsolanki.dockermanager.UpdateProxyStatsRequest
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route

fun Route.proxyRoutes() {
    route("/proxy") {
        get("/hosts") {
            call.respond(ProxyService.listHosts())
        }

        post("/hosts") {
            val host = call.receive<ProxyHost>()
            val result = ProxyService.createHost(host)
            if (result.first) {
                call.respond(HttpStatusCode.Created, result.second)
            } else {
                call.respond(
                    HttpStatusCode.BadRequest, result.second
                ) // Using BadRequest for explicit errors
            }
        }

        put("/hosts/{id}") {
            val id = call.parameters["id"] ?: return@put call.respond(HttpStatusCode.BadRequest)
            val host = call.receive<ProxyHost>()
            val result = ProxyService.updateHost(host.copy(id = id))
            if (result.first) {
                call.respond(HttpStatusCode.OK, result.second)
            } else {
                call.respond(HttpStatusCode.BadRequest, result.second)
            }
        }

        delete("/hosts/{id}") {
            val id = call.parameters["id"] ?: return@delete call.respond(HttpStatusCode.BadRequest)
            if (ProxyService.deleteHost(id)) {
                call.respond(HttpStatusCode.OK)
            } else {
                call.respond(HttpStatusCode.InternalServerError)
            }
        }

        post("/hosts/{id}/toggle") {
            val id = call.parameters["id"] ?: return@post call.respond(HttpStatusCode.BadRequest)
            if (ProxyService.toggleHost(id)) {
                call.respond(HttpStatusCode.OK)
            } else {
                call.respond(HttpStatusCode.InternalServerError)
            }
        }

        post("/hosts/{id}/request-ssl") {
            val id = call.parameters["id"] ?: return@post call.respond(HttpStatusCode.BadRequest)
            if (ProxyService.requestSSL(id)) {
                call.respond(HttpStatusCode.OK)
            } else {
                call.respond(HttpStatusCode.InternalServerError)
            }
        }

        get("/stats") {
            call.respond(ProxyService.getStats())
        }

        post("/stats/settings") {
            val request = call.receive<UpdateProxyStatsRequest>()
            ProxyService.updateStatsSettings(request.active, request.intervalMs)
            call.respond(HttpStatusCode.OK, ProxyActionResult(true, "Proxy stats settings updated"))
        }

        get("/stats/refresh") {
            call.respond(ProxyService.getStats())
        }

        get("/security/settings") {
            call.respond(ProxyService.getProxySecuritySettings())
        }

        post("/security/settings") {
            val request = call.receive<AppSettings>()
            ProxyService.updateSecuritySettings(
                request.proxyJailEnabled, request.proxyJailThresholdNon200, request.proxyJailRules
            )
            call.respond(
                HttpStatusCode.OK,
                ProxyActionResult(true, "Proxy security settings updated")
            )
        }

        get("/certificates") {
            call.respond(ProxyService.listCertificates())
        }

        // Proxy Container Management
        post("/container/build") {
            val result = ProxyService.buildProxyImage()
            if (result.first) {
                call.respond(HttpStatusCode.OK, ProxyActionResult(true, result.second))
            } else {
                call.respond(
                    HttpStatusCode.InternalServerError, ProxyActionResult(false, result.second)
                )
            }
        }

        post("/container/create") {
            val result = ProxyService.createProxyContainer()
            if (result.first) {
                call.respond(HttpStatusCode.Created, ProxyActionResult(true, result.second))
            } else {
                call.respond(
                    HttpStatusCode.InternalServerError, ProxyActionResult(false, result.second)
                )
            }
        }

        post("/container/start") {
            val result = ProxyService.startProxyContainer()
            if (result.first) {
                call.respond(HttpStatusCode.OK, ProxyActionResult(true, result.second))
            } else {
                call.respond(
                    HttpStatusCode.InternalServerError, ProxyActionResult(false, result.second)
                )
            }
        }

        post("/container/stop") {
            val result = ProxyService.stopProxyContainer()
            if (result.first) {
                call.respond(HttpStatusCode.OK, ProxyActionResult(true, result.second))
            } else {
                call.respond(
                    HttpStatusCode.InternalServerError, ProxyActionResult(false, result.second)
                )
            }
        }

        post("/container/restart") {
            val result = ProxyService.restartProxyContainer()
            if (result.first) {
                call.respond(HttpStatusCode.OK, ProxyActionResult(true, result.second))
            } else {
                call.respond(
                    HttpStatusCode.InternalServerError, ProxyActionResult(false, result.second)
                )
            }
        }

        get("/container/status") {
            call.respond(ProxyService.getProxyContainerStatus())
        }

        post("/container/ensure") {
            val result = ProxyService.ensureProxyContainerExists()
            if (result) {
                call.respond(HttpStatusCode.OK, ProxyActionResult(true, "Proxy container is ready"))
            } else {
                call.respond(
                    HttpStatusCode.InternalServerError,
                    ProxyActionResult(false, "Failed to ensure proxy container")
                )
            }
        }

        get("/container/compose") {
            call.respond(mapOf("content" to ProxyService.getComposeConfig()))
        }

        post("/container/compose") {
            val request = call.receive<Map<String, String>>()
            val content = request["content"] ?: return@post call.respond(HttpStatusCode.BadRequest)
            val result = ProxyService.updateComposeConfig(content)
            if (result.first) {
                call.respond(HttpStatusCode.OK, ProxyActionResult(true, result.second))
            } else {
                call.respond(
                    HttpStatusCode.InternalServerError, ProxyActionResult(false, result.second)
                )
            }
        }
    }
}
