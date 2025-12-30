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
            if (DockerService.createProxyHost(host)) {
                call.respond(HttpStatusCode.Created)
            } else {
                call.respond(HttpStatusCode.InternalServerError)
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
    }
}
