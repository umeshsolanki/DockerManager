package com.umeshsolanki.dockermanager.system

import com.umeshsolanki.dockermanager.*
import com.umeshsolanki.dockermanager.system.SystemService
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*

fun Route.systemRoutes() {
    route("/system") {
        get("/battery") {
            call.respond(SystemService.getBatteryStatus())
        }
        get("/config") {
            call.respond(SystemService.getSystemConfig())
        }
        post("/config") {
            val request = call.receive<UpdateSystemConfigRequest>()
            try {
                SystemService.updateSystemConfig(request)
                call.respond(mapOf("success" to true))
            } catch (e: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, mapOf("success" to false, "error" to e.message))
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, mapOf("success" to false, "error" to "Internal server error"))
            }
        }
        get("/storage") {
            call.respond(SystemService.getStorageInfo())
        }

        post("/storage/refresh") {
            SystemService.refreshStorageInfo()
            call.respond(mapOf("status" to "success", "message" to "Storage sync triggered in background"))
        }
        
        get("/proxy/recommended-rules") {
            call.respond(AppConfig.settings.recommendedProxyJailRules)
        }
        
        ipRangeRoutes()
    }
}


