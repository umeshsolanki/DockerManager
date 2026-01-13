package com.umeshsolanki.dockermanager.proxy

import com.umeshsolanki.dockermanager.*
import com.umeshsolanki.dockermanager.proxy.*
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route

fun Route.analyticsRoutes() {
    route("/analytics") {
        // Current Stats
        get("/stats") {
            call.respond(AnalyticsService.getStats())
        }

        post("/stats/settings") {
            val request = call.receive<UpdateProxyStatsRequest>()
            AnalyticsService.updateStatsSettings(request.active, request.intervalMs, request.filterLocalIps)
            call.respond(HttpStatusCode.OK, ProxyActionResult(true, "Proxy stats settings updated"))
        }

        get("/stats/refresh") {
            call.respond(AnalyticsService.getStats())
        }

        // Historical Analytics
        get("/stats/history/dates") {
            call.respond(AnalyticsService.listAvailableDates())
        }

        get("/stats/history/{date}") {
            val date = call.requireParameter("date") ?: return@get
            val stats = AnalyticsService.getHistoricalStats(date)
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
            call.respond(AnalyticsService.getStatsForDateRange(startDate, endDate))
        }

        post("/stats/history/{date}/reprocess") {
            val date = call.requireParameter("date") ?: return@post
            val stats = AnalyticsService.forceReprocessLogs(date)
            if (stats != null) {
                call.respond(HttpStatusCode.OK, ProxyActionResult(true, "Successfully reprocessed logs for date: $date"))
            } else {
                call.respond(HttpStatusCode.NotFound, ProxyActionResult(false, "Failed to reprocess logs for date: $date"))
            }
        }

        post("/stats/history/update-all-days") {
            val results = AnalyticsService.updateStatsForAllDaysInCurrentLog()
            val successCount = results.values.count { it }
            val failureCount = results.size - successCount
            val message = "Processed ${results.size} dates. Success: $successCount, Failed: $failureCount"
            call.respond(HttpStatusCode.OK, mapOf(
                "success" to true,
                "message" to message,
                "results" to results
            ))
        }
    }
}

