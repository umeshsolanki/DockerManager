package com.umeshsolanki.dockermanager.proxy

import com.umeshsolanki.dockermanager.*
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route

fun Route.customPageRoutes() {
    route("/proxy/custom-pages") {
        get {
            call.respond(CustomPageService.listCustomPages())
        }

        post {
            val page = try {
                call.receive<CustomPage>()
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, ProxyActionResult(false, "Invalid request body"))
                return@post
            }
            val result = CustomPageService.createCustomPage(page)
            call.respondPairResult(result, HttpStatusCode.Created, HttpStatusCode.BadRequest)
        }

        put("/{id}") {
            val id = call.requireParameter("id") ?: return@put
            val page = try {
                call.receive<CustomPage>()
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, ProxyActionResult(false, "Invalid request body"))
                return@put
            }
            val result = CustomPageService.updateCustomPage(page.copy(id = id))
            call.respondPairResult(result, HttpStatusCode.OK, HttpStatusCode.BadRequest)
        }

        delete("/{id}") {
            val id = call.requireParameter("id") ?: return@delete
            call.respondBooleanResult(CustomPageService.deleteCustomPage(id), "Custom page deleted")
        }
    }
}
