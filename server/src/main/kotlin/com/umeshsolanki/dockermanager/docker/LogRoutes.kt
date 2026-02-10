package com.umeshsolanki.dockermanager.docker

import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import com.umeshsolanki.dockermanager.ServiceContainer
import com.umeshsolanki.dockermanager.AppConfig

fun Route.logRoutes() {
    route("/logs") {
        get("/system") {
            val path = call.request.queryParameters["path"] ?: ""
            call.respond(DockerService.listSystemLogs(path))
        }

        get("/system/content") {
            val path = call.request.queryParameters["path"] ?: return@get call.respond(
                HttpStatusCode.BadRequest,
                "Missing path"
            )
            val tail = call.request.queryParameters["tail"]?.toIntOrNull() ?: 100
            val filter = call.request.queryParameters["filter"]
            val since = call.request.queryParameters["since"]
            val until = call.request.queryParameters["until"]
            val content = DockerService.getSystemLogContent(path, tail, filter, since, until)
            call.respondText(content)
        }

        get("/system/journal") {
            val tail = call.request.queryParameters["tail"]?.toIntOrNull() ?: 100
            val unit = call.request.queryParameters["unit"]
            val filter = call.request.queryParameters["filter"]
            val since = call.request.queryParameters["since"]
            val until = call.request.queryParameters["until"]
            val content = DockerService.getJournalLogs(tail, unit, filter, since, until)
            call.respondText(content)
        }

        get("/system/syslog") {
            val tail = call.request.queryParameters["tail"]?.toIntOrNull() ?: 100
            val filter = call.request.queryParameters["filter"]
            val content = DockerService.getSystemSyslogLogs(tail, filter)
            call.respondText(content)
        }
    }
}
