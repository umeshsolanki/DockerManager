package com.umeshsolanki.dockermanager.proxy

import com.umeshsolanki.dockermanager.*
import com.umeshsolanki.dockermanager.proxy.*
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route

fun Route.proxyRoutes() {
    route("/proxy") {
        get("/hosts") {
            call.respond(ProxyService.listHosts())
        }

        post("/hosts") {
            val host = call.receive<ProxyHost>()
            val result = ProxyService.createHost(host)
            call.respondPairResult(result, HttpStatusCode.Created, HttpStatusCode.BadRequest)
        }

        put("/hosts/{id}") {
            val id = call.requireParameter("id") ?: return@put
            val host = call.receive<ProxyHost>()
            val result = ProxyService.updateHost(host.copy(id = id))
            call.respondPairResult(result, HttpStatusCode.OK, HttpStatusCode.BadRequest)
        }

        delete("/hosts/{id}") {
            val id = call.requireParameter("id") ?: return@delete
            call.respondBooleanResult(
                ProxyService.deleteHost(id),
                "Host deleted"
            )
        }

        post("/hosts/{id}/toggle") {
            val id = call.requireParameter("id") ?: return@post
            call.respondBooleanResult(ProxyService.toggleHost(id))
        }

        post("/hosts/{id}/request-ssl") {
            val id = call.requireParameter("id") ?: return@post
            call.respondBooleanResult(ProxyService.requestSSL(id))
        }

        // Path-based routing management
        get("/hosts/{id}/paths") {
            val id = call.requireParameter("id") ?: return@get
            val host = ProxyService.listHosts().find { it.id == id }
            if (host != null) {
                call.respond(host.paths)
            } else {
                call.respond(HttpStatusCode.NotFound, ProxyActionResult(false, "Host not found"))
            }
        }

        post("/hosts/{id}/paths") {
            val id = call.requireParameter("id") ?: return@post
            val pathRoute = call.receive<PathRoute>()
            val hosts = ProxyService.listHosts().toMutableList()
            val hostIndex = hosts.indexOfFirst { it.id == id }
            if (hostIndex == -1) {
                call.respond(HttpStatusCode.NotFound, ProxyActionResult(false, "Host not found"))
                return@post
            }
            val host = hosts[hostIndex]
            // Ensure path route has an ID
            val newPathRoute = if (pathRoute.id.isEmpty()) {
                pathRoute.copy(id = java.util.UUID.randomUUID().toString())
            } else {
                // Check if path ID already exists
                if (host.paths.any { it.id == pathRoute.id }) {
                    call.respond(HttpStatusCode.BadRequest, ProxyActionResult(false, "Path route with this ID already exists"))
                    return@post
                }
                pathRoute
            }
            val updatedPaths = host.paths.toMutableList()
            updatedPaths.add(newPathRoute)
            val updatedHost = host.copy(paths = updatedPaths)
            val result = ProxyService.updateHost(updatedHost)
            call.respondPairResult(result, HttpStatusCode.Created, HttpStatusCode.BadRequest)
        }

        put("/hosts/{id}/paths/{pathId}") {
            val id = call.requireParameter("id") ?: return@put
            val pathId = call.requireParameter("pathId") ?: return@put
            val pathRoute = call.receive<PathRoute>()
            val hosts = ProxyService.listHosts().toMutableList()
            val hostIndex = hosts.indexOfFirst { it.id == id }
            if (hostIndex == -1) {
                call.respond(HttpStatusCode.NotFound, ProxyActionResult(false, "Host not found"))
                return@put
            }
            val host = hosts[hostIndex]
            val updatedPaths = host.paths.toMutableList()
            val pathIndex = updatedPaths.indexOfFirst { it.id == pathId }
            if (pathIndex == -1) {
                call.respond(HttpStatusCode.NotFound, ProxyActionResult(false, "Path route not found"))
                return@put
            }
            updatedPaths[pathIndex] = pathRoute.copy(id = pathId)
            val updatedHost = host.copy(paths = updatedPaths)
            val result = ProxyService.updateHost(updatedHost)
            call.respondPairResult(result, HttpStatusCode.OK, HttpStatusCode.BadRequest)
        }

        delete("/hosts/{id}/paths/{pathId}") {
            val id = call.requireParameter("id") ?: return@delete
            val pathId = call.requireParameter("pathId") ?: return@delete
            val hosts = ProxyService.listHosts().toMutableList()
            val hostIndex = hosts.indexOfFirst { it.id == id }
            if (hostIndex == -1) {
                call.respond(HttpStatusCode.NotFound, ProxyActionResult(false, "Host not found"))
                return@delete
            }
            val host = hosts[hostIndex]
            val updatedPaths = host.paths.filter { it.id != pathId }
            val updatedHost = host.copy(paths = updatedPaths)
            val result = ProxyService.updateHost(updatedHost)
            call.respondPairResult(result, HttpStatusCode.OK, HttpStatusCode.BadRequest)
        }

        post("/hosts/{id}/paths/{pathId}/toggle") {
            val id = call.requireParameter("id") ?: return@post
            val pathId = call.requireParameter("pathId") ?: return@post
            val hosts = ProxyService.listHosts().toMutableList()
            val hostIndex = hosts.indexOfFirst { it.id == id }
            if (hostIndex == -1) {
                call.respond(HttpStatusCode.NotFound, ProxyActionResult(false, "Host not found"))
                return@post
            }
            val host = hosts[hostIndex]
            val pathIndex = host.paths.indexOfFirst { it.id == pathId }
            if (pathIndex == -1) {
                call.respond(HttpStatusCode.NotFound, ProxyActionResult(false, "Path route not found"))
                return@post
            }
            val pathRoute = host.paths[pathIndex]
            val updatedPaths = host.paths.toMutableList()
            updatedPaths[pathIndex] = pathRoute.copy(enabled = !pathRoute.enabled)
            val updatedHost = host.copy(paths = updatedPaths)
            val result = ProxyService.updateHost(updatedHost)
            call.respondPairResult(result, HttpStatusCode.OK, HttpStatusCode.BadRequest)
        }

        get("/stats") {
            call.respond(ProxyService.getStats())
        }

        post("/stats/settings") {
            val request = call.receive<UpdateProxyStatsRequest>()
            ProxyService.updateStatsSettings(request.active, request.intervalMs, request.filterLocalIps)
            call.respond(HttpStatusCode.OK, ProxyActionResult(true, "Proxy stats settings updated"))
        }

        get("/stats/refresh") {
            call.respond(ProxyService.getStats())
        }

        // Historical Analytics
        get("/stats/history/dates") {
            call.respond(ProxyService.listAvailableDates())
        }

        get("/stats/history/{date}") {
            val date = call.requireParameter("date") ?: return@get
            val stats = ProxyService.getHistoricalStats(date)
            if (stats != null) {
                call.respond(stats)
            } else {
                call.respond(HttpStatusCode.NotFound, ProxyActionResult(false, "No stats found for date: $date"))
            }
        }

        get("/stats/history/range") {
            val startDate = call.request.queryParameters["start"] ?: return@get call.respond(
                HttpStatusCode.BadRequest,
                ProxyActionResult(false, "Missing 'start' parameter")
            )
            val endDate = call.request.queryParameters["end"] ?: return@get call.respond(
                HttpStatusCode.BadRequest,
                ProxyActionResult(false, "Missing 'end' parameter")
            )
            call.respond(ProxyService.getStatsForDateRange(startDate, endDate))
        }

        post("/stats/history/{date}/reprocess") {
            val date = call.requireParameter("date") ?: return@post
            val stats = ProxyService.forceReprocessLogs(date)
            if (stats != null) {
                call.respond(HttpStatusCode.OK, ProxyActionResult(true, "Successfully reprocessed logs for date: $date"))
            } else {
                call.respond(HttpStatusCode.NotFound, ProxyActionResult(false, "Failed to reprocess logs for date: $date"))
            }
        }

        post("/stats/history/update-all-days") {
            val results = ProxyService.updateStatsForAllDaysInCurrentLog()
            val successCount = results.values.count { it }
            val failureCount = results.size - successCount
            val message = "Processed ${results.size} dates. Success: $successCount, Failed: $failureCount"
            call.respond(HttpStatusCode.OK, mapOf(
                "success" to true,
                "message" to message,
                "results" to results
            ))
        }

        get("/security/settings") {
            call.respond(ProxyService.getProxySecuritySettings())
        }

        post("/security/settings") {
            val request = call.receive<AppSettings>()
            ProxyService.updateSecuritySettings(
                request.proxyJailEnabled, request.proxyJailThresholdNon200, request.proxyJailRules
            )
            call.respond(
                HttpStatusCode.OK,
                ProxyActionResult(true, "Proxy security settings updated")
            )
        }

        get("/certificates") {
            call.respond(ProxyService.listCertificates())
        }

        // Proxy Container Management
        post("/container/build") {
            val result = ProxyService.buildProxyImage()
            call.respond(
                if (result.first) HttpStatusCode.OK else HttpStatusCode.InternalServerError,
                ProxyActionResult(result.first, result.second)
            )
        }

        post("/container/create") {
            val result = ProxyService.createProxyContainer()
            call.respond(
                if (result.first) HttpStatusCode.Created else HttpStatusCode.InternalServerError,
                ProxyActionResult(result.first, result.second)
            )
        }

        post("/container/start") {
            val result = ProxyService.startProxyContainer()
            call.respond(
                if (result.first) HttpStatusCode.OK else HttpStatusCode.InternalServerError,
                ProxyActionResult(result.first, result.second)
            )
        }

        post("/container/stop") {
            val result = ProxyService.stopProxyContainer()
            call.respond(
                if (result.first) HttpStatusCode.OK else HttpStatusCode.InternalServerError,
                ProxyActionResult(result.first, result.second)
            )
        }

        post("/container/restart") {
            val result = ProxyService.restartProxyContainer()
            call.respond(
                if (result.first) HttpStatusCode.OK else HttpStatusCode.InternalServerError,
                ProxyActionResult(result.first, result.second)
            )
        }

        get("/container/status") {
            call.respond(ProxyService.getProxyContainerStatus())
        }

        post("/container/ensure") {
            val result = ProxyService.ensureProxyContainerExists()
            call.respond(
                if (result) HttpStatusCode.OK else HttpStatusCode.InternalServerError,
                ProxyActionResult(result, if (result) "Proxy container is ready" else "Failed to ensure proxy container")
            )
        }

        get("/container/compose") {
            call.respond(mapOf("content" to ProxyService.getComposeConfig()))
        }

        post("/container/compose") {
            val request = call.receive<Map<String, String>>()
            val content = request["content"] ?: return@post call.respond(HttpStatusCode.BadRequest)
            val result = ProxyService.updateComposeConfig(content)
            call.respond(
                if (result.first) HttpStatusCode.OK else HttpStatusCode.InternalServerError,
                ProxyActionResult(result.first, result.second)
            )
        }
    }
}
