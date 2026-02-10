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
import io.ktor.server.response.respondText
import io.ktor.server.request.uri
import org.slf4j.LoggerFactory
import kotlinx.coroutines.*

fun Route.proxyRoutes() {
    route("/proxy") {
        get("/hosts") {
            call.respond(ProxyService.listHosts())
        }

        post("/hosts") {
            val host = try {
                call.receive<ProxyHost>()
            } catch (e: Exception) {
                call.respond(
                    HttpStatusCode.BadRequest,
                    ProxyActionResult(false, "Invalid request body: ${e.message ?: "Failed to parse ProxyHost"}")
                )
                return@post
            }
            val result = ProxyService.createHost(host)
            call.respondPairResult(result, HttpStatusCode.Created, HttpStatusCode.BadRequest)
        }

        put("/hosts/{id}") {
            val id = call.requireParameter("id") ?: return@put
            val host = try {
                call.receive<ProxyHost>()
            } catch (e: Exception) {
                call.respond(
                    HttpStatusCode.BadRequest,
                    ProxyActionResult(false, "Invalid request body: ${e.message ?: "Failed to parse ProxyHost"}")
                )
                return@put
            }
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

        get("/hosts/{id}/logs") {
            val id = call.requireParameter("id") ?: return@get
            val type = call.request.queryParameters["type"] ?: "access"
            val lines = call.request.queryParameters["lines"]?.toIntOrNull() ?: 100
            val content = ProxyService.getProxyLogs(id, type, lines)
            call.respondText(content)
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

        // DNS Config Management
        get("/dns-configs") {
            call.respond(ProxyService.listDnsConfigs())
        }

        post("/dns-configs") {
            val config = try {
                call.receive<DnsConfig>()
            } catch (e: Exception) {
                call.respond(
                    HttpStatusCode.BadRequest,
                    ProxyActionResult(false, "Invalid request body: ${e.message ?: "Failed to parse DnsConfig"}")
                )
                return@post
            }
            val result = ProxyService.createDnsConfig(config)
            call.respondPairResult(result, HttpStatusCode.Created, HttpStatusCode.BadRequest)
        }

        put("/dns-configs/{id}") {
            val id = call.requireParameter("id") ?: return@put
            val config = try {
                call.receive<DnsConfig>()
            } catch (e: Exception) {
                call.respond(
                    HttpStatusCode.BadRequest,
                    ProxyActionResult(false, "Invalid request body: ${e.message ?: "Failed to parse DnsConfig"}")
                )
                return@put
            }
            val result = ProxyService.updateDnsConfig(config.copy(id = id))
            call.respondPairResult(result, HttpStatusCode.OK, HttpStatusCode.BadRequest)
        }

        delete("/dns-configs/{id}") {
            val id = call.requireParameter("id") ?: return@delete
            val result = ProxyService.deleteDnsConfig(id)
            call.respondPairResult(result, HttpStatusCode.OK, HttpStatusCode.BadRequest)
        }

        get("/security/settings") {
            call.respond(ProxyService.getProxySecuritySettings())
        }

        post("/security/settings") {
            val request = call.receive<UpdateProxySecurityRequest>()
            val result = ProxyService.updateSecuritySettings(
                enabled = request.proxyJailEnabled ?: AppConfig.settings.proxyJailEnabled,
                thresholdNon200 = request.proxyJailThresholdNon200 ?: AppConfig.settings.proxyJailThresholdNon200,
                rules = request.proxyJailRules ?: AppConfig.settings.proxyJailRules,
                windowMinutes = request.proxyJailWindowMinutes ?: AppConfig.settings.proxyJailWindowMinutes,
                thresholdDanger = request.proxyJailThresholdDanger ?: AppConfig.settings.proxyJailThresholdDanger,
                thresholdBurst = request.proxyJailThresholdBurst ?: AppConfig.settings.proxyJailThresholdBurst,
                thresholdCidr = request.proxyJailThresholdCidr ?: AppConfig.settings.proxyJailThresholdCidr,
                dangerProxyEnabled = request.dangerProxyEnabled ?: AppConfig.settings.dangerProxyEnabled,
                dangerProxyHost = request.dangerProxyHost ?: AppConfig.settings.dangerProxyHost,
                recommendedRules = request.recommendedProxyJailRules ?: AppConfig.settings.recommendedProxyJailRules
            )
            
            if (result.first) {
                call.respond(HttpStatusCode.OK, ProxyActionResult(true, result.second))
            } else {
                call.respond(HttpStatusCode.BadRequest, ProxyActionResult(false, result.second))
            }
        }

        post("/settings/danger-proxy") {
            val request = call.receive<Map<String, String>>()
            val enabled = request["enabled"]?.toBoolean() ?: false
            val host = request["host"]
            val result = ProxyService.updateDangerProxySettings(enabled, host)
            call.respondPairResult(result, HttpStatusCode.OK, HttpStatusCode.InternalServerError)
        }

        post("/settings/default-behavior") {
            val request = call.receive<Map<String, Boolean>>()
            val return404 = request["return404"] ?: false
            val result = ProxyService.updateDefaultBehavior(return404)
            call.respondPairResult(result, HttpStatusCode.OK, HttpStatusCode.InternalServerError)
        }

        post("/settings/rsyslog") {
            val request = call.receive<Map<String, Boolean>>()
            val enabled = request["enabled"] ?: false
            val dualLogging = request["dualLogging"] ?: false
            val result = ProxyService.updateRsyslogSettings(enabled, dualLogging)
            call.respondPairResult(result, HttpStatusCode.OK, HttpStatusCode.InternalServerError)
        }

        post("/settings/logging") {
            val request = call.receive<Map<String, String>>()
            val dbPersistence = request["dbPersistenceLogsEnabled"]?.toBoolean()
            val nginxLogDir = request["nginxLogDir"]
            val jsonLogging = request["jsonLoggingEnabled"]?.toBoolean()
            val bufferingEnabled = request["logBufferingEnabled"]?.toBoolean()
            val bufferSizeKb = request["logBufferSizeKb"]?.toIntOrNull()
            val flushIntervalSeconds = request["logFlushIntervalSeconds"]?.toIntOrNull()

            val result = ProxyService.updateLoggingSettings(
                dbPersistence,
                nginxLogDir,
                jsonLogging,
                bufferingEnabled,
                bufferSizeKb,
                flushIntervalSeconds
            )
            call.respondPairResult(result, HttpStatusCode.OK, HttpStatusCode.InternalServerError)
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

        post("/container/compose/reset") {
            val result = ProxyService.resetComposeConfig()
            call.respond(
                 if (result.first) HttpStatusCode.OK else HttpStatusCode.InternalServerError,
                 ProxyActionResult(result.first, result.second)
            )
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

// Public Security Mirror Collector (Terminates mirrored requests from Nginx)
// Reachable via /security/mirror/...
fun Route.securityMirrorRoutes() {
    route("/security/mirror") {
        val logger = LoggerFactory.getLogger("SecurityMirror")
        
        get("{...}") {
            // We just log that we received a mirror hit. 
            // In production, this could be sent to Kafka/Clickhouse
            val uri = call.request.uri
            val ip = call.request.headers["X-Real-IP"] ?: call.request.local.remoteHost
            val reason = call.request.headers["X-Mirror-Reason"] ?: "unknown"
            val status = call.request.headers["X-Mirror-Status"] ?: "0"
            
            logger.debug("Security Mirror Hit: IP=$ip, Reason=$reason, Status=$status, URI=$uri")
            call.respondText("ok")
        }
        
        post("{...}") {
            call.respondText("ok")
        }
    }
}
