package com.umeshsolanki.dockermanager

import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.cors.routing.CORS
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import kotlinx.serialization.json.Json

fun main() {
    embeddedServer(Netty, port = SERVER_PORT, host = "0.0.0.0", module = Application::module)
        .start(wait = true)
}

fun Application.module() {
    install(CORS) {
        allowMethod(HttpMethod.Options)
        allowMethod(HttpMethod.Put)
        allowMethod(HttpMethod.Delete)
        allowMethod(HttpMethod.Patch)
        allowHeader(HttpHeaders.Authorization)
        allowHeader(HttpHeaders.ContentType)
        allowHeader(HttpHeaders.AccessControlAllowOrigin)
        anyHost()
    }

    install(ContentNegotiation) {
        json(Json {
            prettyPrint = true
            isLenient = true
            ignoreUnknownKeys = true
        })
    }

    routing {
        get("/") {
            call.respondText("Docker Manager API is running")
        }
        
        route("/containers") {
            get {
                call.respond(DockerService.listContainers())
            }
            
            post("/{id}/start") {
                val id = call.parameters["id"] ?: return@post call.respondText("Missing ID", status = io.ktor.http.HttpStatusCode.BadRequest)
                DockerService.startContainer(id)
                call.respondText("Started")
            }
            
            post("/{id}/stop") {
                val id = call.parameters["id"] ?: return@post call.respondText("Missing ID", status = io.ktor.http.HttpStatusCode.BadRequest)
                DockerService.stopContainer(id)
                call.respondText("Stopped")
            }
            
            delete("/{id}") {
                val id = call.parameters["id"] ?: return@delete call.respondText("Missing ID", status = HttpStatusCode.BadRequest)
                DockerService.removeContainer(id)
                call.respondText("Removed")
            }

            post("/prune") {
                DockerService.pruneContainers()
                call.respondText("Pruned")
            }
        }
        
        route("/images") {
            get {
                call.respond(DockerService.listImages())
            }
            
            post("/pull") {
                val name = call.request.queryParameters["image"] ?: return@post call.respondText("Missing Image Name", status = HttpStatusCode.BadRequest)
                val success = DockerService.pullImage(name)
                 if (success) {
                    call.respondText("Pulled")
                } else {
                    call.respondText("Failed to pull", status = HttpStatusCode.InternalServerError)
                }
            }
            
            delete("/{id}") {
                 val id = call.parameters["id"] ?: return@delete call.respondText("Missing ID", status = HttpStatusCode.BadRequest)
                 DockerService.removeImage(id)
                 call.respondText("Removed")
            }
        }
        
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

        route("/system") {
            get("/battery") {
                call.respond(SystemService.getBatteryStatus())
            }
        }
    }
}