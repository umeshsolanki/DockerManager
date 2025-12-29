package com.umeshsolanki.dockermanager.routes

import com.umeshsolanki.dockermanager.DockerService
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.*

fun Route.composeRoutes() {
    route("/compose") {
        get {
            call.respond(DockerService.listComposeFiles())
        }

        post("/up") {
            val file = call.request.queryParameters["file"] ?: return@post call.respondText("Missing File Path", status = HttpStatusCode.BadRequest)
            DockerService.composeUp(file)
            call.respondText("Up")
        }

        post("/down") {
            val file = call.request.queryParameters["file"] ?: return@post call.respondText("Missing File Path", status = HttpStatusCode.BadRequest)
            DockerService.composeDown(file)
            call.respondText("Down")
        }
    }
}
