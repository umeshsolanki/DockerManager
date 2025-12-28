package com.umeshsolanki.dockermanager

import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
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
        }
    }
}