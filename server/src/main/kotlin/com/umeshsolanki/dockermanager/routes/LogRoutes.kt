package com.umeshsolanki.dockermanager.routes

import com.umeshsolanki.dockermanager.DockerService
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.*

fun Route.logRoutes() {
    route("/logs") {
        get("/system") {
            call.respond(DockerService.listSystemLogs())
        }

        get("/system/content") {
            val path = call.request.queryParameters["path"] ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing path")
            val tail = call.request.queryParameters["tail"]?.toIntOrNull() ?: 100
            val filter = call.request.queryParameters["filter"]
            val content = DockerService.getSystemLogContent(path, tail, filter)
            call.respondText(content)
        }
        get("/system/btmp-stats") {
            call.respond(DockerService.getBtmpStats())
        }
    }
}
