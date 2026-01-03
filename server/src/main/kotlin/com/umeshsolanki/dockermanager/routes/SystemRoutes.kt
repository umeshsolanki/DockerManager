package com.umeshsolanki.dockermanager.routes

import com.umeshsolanki.dockermanager.DockerService
import com.umeshsolanki.dockermanager.SystemService
import com.umeshsolanki.dockermanager.UpdateSystemConfigRequest
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*

fun Route.systemRoutes() {
    route("/system") {
        get("/battery") {
            call.respond(SystemService.getBatteryStatus())
        }
        get("/config") {
            call.respond(DockerService.getSystemConfig())
        }
        post("/config") {
            val request = call.receive<UpdateSystemConfigRequest>()
            DockerService.updateSystemConfig(request)
            call.respond(mapOf("success" to true))
        }
    }
}


