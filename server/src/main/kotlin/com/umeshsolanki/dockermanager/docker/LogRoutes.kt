package com.umeshsolanki.dockermanager.docker

import com.umeshsolanki.dockermanager.DockerService
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.*

fun Route.logRoutes() {
    route("/logs") {
        get("/system") {
            val path = call.request.queryParameters["path"] ?: ""
            call.respond(DockerService.listSystemLogs(path))
        }

        get("/system/content") {
            val path = call.request.queryParameters["path"] ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing path")
            val tail = call.request.queryParameters["tail"]?.toIntOrNull() ?: 100
            val filter = call.request.queryParameters["filter"]
            val since = call.request.queryParameters["since"]
            val until = call.request.queryParameters["until"]
            val content = DockerService.getSystemLogContent(path, tail, filter, since, until)
            call.respondText(content)
        }
        get("/system/btmp-stats") {
            call.respond(DockerService.getBtmpStats())
        }
        post("/system/btmp-stats/refresh") {
            call.respond(DockerService.refreshBtmpStats())
        }
        post("/system/btmp-stats/auto-jail") {
            val enabled = call.request.queryParameters["enabled"]?.toBoolean() ?: false
            val threshold = call.request.queryParameters["threshold"]?.toInt() ?: 5
            val duration = call.request.queryParameters["duration"]?.toInt() ?: 30
            DockerService.updateAutoJailSettings(enabled, threshold, duration)
            call.respond(HttpStatusCode.OK)
        }
        post("/system/btmp-stats/monitoring") {
            val active = call.request.queryParameters["active"]?.toBoolean() ?: true
            val interval = call.request.queryParameters["interval"]?.toInt() ?: 5
            DockerService.updateBtmpMonitoring(active, interval)
            call.respond(HttpStatusCode.OK)
        }
    }
}
