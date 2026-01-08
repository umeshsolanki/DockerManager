package com.umeshsolanki.dockermanager.docker

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
            val result = DockerService.composeUp(file)
            call.respond(result)
        }

        post("/down") {
            val file = call.request.queryParameters["file"] ?: return@post call.respondText("Missing File Path", status = HttpStatusCode.BadRequest)
            val result = DockerService.composeDown(file)
            call.respond(result)
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

        post("/{name}/backup") {
            val name = call.parameters["name"] ?: return@post call.respondText("Missing Name", status = HttpStatusCode.BadRequest)
            val result = DockerService.backupCompose(name)
            call.respond(result)
        }

        post("/backup-all") {
            val result = DockerService.backupAllCompose()
            call.respond(result)
        }
    }
}
