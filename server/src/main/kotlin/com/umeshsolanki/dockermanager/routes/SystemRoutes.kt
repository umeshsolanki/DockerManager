package com.umeshsolanki.dockermanager.routes

import com.umeshsolanki.dockermanager.SystemService
import io.ktor.server.response.respond
import io.ktor.server.routing.*

fun Route.systemRoutes() {
    route("/system") {
        get("/battery") {
            call.respond(SystemService.getBatteryStatus())
        }
    }
}
