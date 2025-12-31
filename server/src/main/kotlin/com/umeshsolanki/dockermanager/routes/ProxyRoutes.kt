package com.umeshsolanki.dockermanager.routes

import com.umeshsolanki.dockermanager.DockerService
import com.umeshsolanki.dockermanager.ProxyHost
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*

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
                call.respond(HttpStatusCode.BadRequest, result.second) // Using BadRequest for explicit errors
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
    }
}
