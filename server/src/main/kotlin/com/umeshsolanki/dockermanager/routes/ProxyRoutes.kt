package com.umeshsolanki.dockermanager.routes

import com.umeshsolanki.dockermanager.DockerService
import com.umeshsolanki.dockermanager.ProxyActionResult
import com.umeshsolanki.dockermanager.ProxyHost
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
            call.respond(DockerService.listProxyHosts())
        }

        post("/hosts") {
            val host = call.receive<ProxyHost>()
            val result = DockerService.createProxyHost(host)
            if (result.first) {
                call.respond(HttpStatusCode.Created, result.second)
            } else {
                call.respond(
                    HttpStatusCode.BadRequest,
                    result.second
                ) // Using BadRequest for explicit errors
            }
        }

        put("/hosts/{id}") {
            val id = call.parameters["id"] ?: return@put call.respond(HttpStatusCode.BadRequest)
            val host = call.receive<ProxyHost>()
            val result = DockerService.updateProxyHost(host.copy(id = id))
            if (result.first) {
                call.respond(HttpStatusCode.OK, result.second)
            } else {
                call.respond(HttpStatusCode.BadRequest, result.second)
            }
        }

        delete("/hosts/{id}") {
            val id = call.parameters["id"] ?: return@delete call.respond(HttpStatusCode.BadRequest)
            if (DockerService.deleteProxyHost(id)) {
                call.respond(HttpStatusCode.OK)
            } else {
                call.respond(HttpStatusCode.InternalServerError)
            }
        }

        post("/hosts/{id}/toggle") {
            val id = call.parameters["id"] ?: return@post call.respond(HttpStatusCode.BadRequest)
            if (DockerService.toggleProxyHost(id)) {
                call.respond(HttpStatusCode.OK)
            } else {
                call.respond(HttpStatusCode.InternalServerError)
            }
        }

        post("/hosts/{id}/request-ssl") {
            val id = call.parameters["id"] ?: return@post call.respond(HttpStatusCode.BadRequest)
            if (DockerService.requestProxySSL(id)) {
                call.respond(HttpStatusCode.OK)
            } else {
                call.respond(HttpStatusCode.InternalServerError)
            }
        }

        get("/stats") {
            call.respond(DockerService.getProxyStats())
        }

        get("/certificates") {
            call.respond(DockerService.listProxyCertificates())
        }

        // Proxy Container Management
        post("/container/build") {
            val result = DockerService.buildProxyImage()
            if (result.first) {
                call.respond(HttpStatusCode.OK, ProxyActionResult(true, result.second))
            } else {
                call.respond(
                    HttpStatusCode.InternalServerError,
                    ProxyActionResult(false, result.second)
                )
            }
        }

        post("/container/create") {
            val result = DockerService.createProxyContainer()
            if (result.first) {
                call.respond(HttpStatusCode.Created, ProxyActionResult(true, result.second))
            } else {
                call.respond(
                    HttpStatusCode.InternalServerError,
                    ProxyActionResult(false, result.second)
                )
            }
        }

        post("/container/start") {
            val result = DockerService.startProxyContainer()
            if (result.first) {
                call.respond(HttpStatusCode.OK, ProxyActionResult(true, result.second))
            } else {
                call.respond(
                    HttpStatusCode.InternalServerError,
                    ProxyActionResult(false, result.second)
                )
            }
        }

        post("/container/stop") {
            val result = DockerService.stopProxyContainer()
            if (result.first) {
                call.respond(HttpStatusCode.OK, ProxyActionResult(true, result.second))
            } else {
                call.respond(
                    HttpStatusCode.InternalServerError,
                    ProxyActionResult(false, result.second)
                )
            }
        }

        post("/container/restart") {
            val result = DockerService.restartProxyContainer()
            if (result.first) {
                call.respond(HttpStatusCode.OK, ProxyActionResult(true, result.second))
            } else {
                call.respond(
                    HttpStatusCode.InternalServerError,
                    ProxyActionResult(false, result.second)
                )
            }
        }

        get("/container/status") {
            call.respond(DockerService.getProxyContainerStatus())
        }

        post("/container/ensure") {
            val result = DockerService.ensureProxyContainerExists()
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
            call.respond(mapOf("content" to DockerService.getProxyComposeConfig()))
        }

        post("/container/compose") {
            val request = call.receive<Map<String, String>>()
            val content = request["content"] ?: return@post call.respond(HttpStatusCode.BadRequest)
            val result = DockerService.updateProxyComposeConfig(content)
            if (result.first) {
                call.respond(HttpStatusCode.OK, ProxyActionResult(true, result.second))
            } else {
                call.respond(
                    HttpStatusCode.InternalServerError,
                    ProxyActionResult(false, result.second)
                )
            }
        }
    }
}
