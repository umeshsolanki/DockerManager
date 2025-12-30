package com.umeshsolanki.dockermanager.routes

import com.umeshsolanki.dockermanager.DockerService
import com.umeshsolanki.dockermanager.SaveComposeRequest
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.*
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

        post("/save") {
            val request = call.receive<SaveComposeRequest>()
            val success = DockerService.saveComposeFile(request.name, request.content)
            if (success) call.respond(HttpStatusCode.OK)
            else call.respond(HttpStatusCode.InternalServerError)
        }

        get("/content") {
            val file = call.request.queryParameters["file"] ?: return@get call.respondText("Missing File Path", status = HttpStatusCode.BadRequest)
            val content = DockerService.getComposeFileContent(file)
            call.respondText(content)
        }
    }
}
