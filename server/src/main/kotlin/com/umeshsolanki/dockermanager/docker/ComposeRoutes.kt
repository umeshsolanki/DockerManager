package com.umeshsolanki.dockermanager.docker

import com.umeshsolanki.dockermanager.*
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

        // Docker Stack operations
        route("/stack") {
            get {
                call.respond(DockerService.listStacks())
            }

            post("/deploy") {
                val request = call.receive<DeployStackRequest>()
                val result = DockerService.deployStack(request.stackName, request.composeFile)
                call.respond(result)
            }

            post("/start") {
                val request = call.receive<DeployStackRequest>()
                val result = DockerService.startStack(request.stackName, request.composeFile)
                call.respond(result)
            }

            post("/stop") {
                val stackName = call.request.queryParameters["stackName"] 
                    ?: try { call.receive<StopStackRequest>().stackName } catch (e: Exception) { null }
                    ?: return@post call.respondText("Missing Stack Name", status = HttpStatusCode.BadRequest)
                val result = DockerService.stopStack(stackName)
                call.respond(result)
            }

            post("/restart") {
                val request = call.receive<DeployStackRequest>()
                val result = DockerService.restartStack(request.stackName, request.composeFile)
                call.respond(result)
            }

            post("/update") {
                val request = call.receive<DeployStackRequest>()
                val result = DockerService.updateStack(request.stackName, request.composeFile)
                call.respond(result)
            }

            delete("/{stackName}") {
                val stackName = call.parameters["stackName"] ?: return@delete call.respondText("Missing Stack Name", status = HttpStatusCode.BadRequest)
                val result = DockerService.removeStack(stackName)
                call.respond(result)
            }

            get("/{stackName}/services") {
                val stackName = call.parameters["stackName"] ?: return@get call.respondText("Missing Stack Name", status = HttpStatusCode.BadRequest)
                val services = DockerService.listStackServices(stackName)
                call.respond(services)
            }

            get("/{stackName}/tasks") {
                val stackName = call.parameters["stackName"] ?: return@get call.respondText("Missing Stack Name", status = HttpStatusCode.BadRequest)
                val tasks = DockerService.listStackTasks(stackName)
                call.respond(tasks)
            }

            get("/{stackName}/status") {
                val stackName = call.parameters["stackName"] ?: return@get call.respondText("Missing Stack Name", status = HttpStatusCode.BadRequest)
                val status = DockerService.checkStackStatus(stackName)
                call.respond(mapOf("status" to status))
            }
        }

        // Compose status endpoint
        get("/status") {
            val file = call.request.queryParameters["file"] ?: return@get call.respondText("Missing File Path", status = HttpStatusCode.BadRequest)
            val status = DockerService.checkComposeFileStatus(file)
            call.respond(mapOf("status" to status))
        }

        // Migrate compose to stack
        post("/migrate-to-stack") {
            val request = call.receive<MigrateComposeToStackRequest>()
            val result = DockerService.migrateComposeToStack(request.composeFile, request.stackName)
            call.respond(result)
        }
    }
}
