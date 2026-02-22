package com.umeshsolanki.dockermanager.dns

import com.umeshsolanki.dockermanager.requireParameter
import com.umeshsolanki.dockermanager.respondBooleanResult
import com.umeshsolanki.dockermanager.respondNullableResult
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.*

fun Route.dnsRoutes() {
    route("/dns") {

        // ==================== Service Control ====================

        get("/status") { call.respond(DnsService.getStatus()) }
        post("/reload") { call.respond(DnsService.reload()) }
        post("/restart") { call.respond(DnsService.restart()) }
        post("/flush-cache") { call.respond(DnsService.flushCache()) }
        get("/validate") { call.respond(DnsService.validateConfig()) }
        get("/stats") { call.respond(DnsService.getQueryStats()) }
        get("/logs") {
            val tail = call.request.queryParameters["tail"]?.toIntOrNull() ?: 100
            call.respondText(DnsService.getLogs(tail), ContentType.Text.Plain)
        }


        // ==================== Zones ====================

        route("/zones") {
            get { call.respond(DnsService.listZones()) }

            post {
                val request = call.receive<CreateZoneRequest>()
                val zone = DnsService.createZone(request)
                if (zone != null) call.respond(HttpStatusCode.Created, zone)
                else call.respond(HttpStatusCode.Conflict, DnsActionResult(false, "Zone already exists"))
            }

            post("/create-defaults") {
                call.respond(DnsService.createDefaultZones())
            }

            post("/regenerate") {
                call.respond(DnsService.regenerateZoneFiles())
            }

            route("/{id}") {
                get {
                    val id = call.requireParameter("id") ?: return@get
                    call.respondNullableResult(DnsService.getZone(id), "Zone not found")
                }

                put {
                    val id = call.requireParameter("id") ?: return@put
                    val request = call.receive<UpdateZoneRequest>()
                    call.respondBooleanResult(DnsService.updateZone(id, request), "Zone updated", "Failed to update zone")
                }

                delete {
                    val id = call.requireParameter("id") ?: return@delete
                    call.respondBooleanResult(DnsService.deleteZone(id), "Zone deleted", "Failed to delete zone")
                }

                post("/toggle") {
                    val id = call.requireParameter("id") ?: return@post
                    call.respondBooleanResult(DnsService.toggleZone(id), "Zone toggled", "Failed to toggle zone")
                }

                put("/options") {
                    val id = call.requireParameter("id") ?: return@put
                    val request = call.receive<UpdateZoneOptionsRequest>()
                    call.respondBooleanResult(DnsService.updateZoneOptions(id, request), "Zone options updated", "Failed to update zone options")
                }

                get("/validate") {
                    val id = call.requireParameter("id") ?: return@get
                    call.respond(DnsService.validateZone(id))
                }

                get("/file") {
                    val id = call.requireParameter("id") ?: return@get
                    val content = DnsService.getZoneFileContent(id)
                    if (content != null) call.respondText(content, ContentType.Text.Plain)
                    else call.respond(HttpStatusCode.NotFound, "Zone file not found")
                }

                get("/export") {
                    val id = call.requireParameter("id") ?: return@get
                    val content = DnsService.exportZoneFile(id)
                    if (content != null) call.respondText(content, ContentType.Text.Plain)
                    else call.respond(HttpStatusCode.NotFound, "Zone file not found")
                }

                // -- Records --

                route("/records") {
                    get {
                        val id = call.requireParameter("id") ?: return@get
                        call.respond(DnsService.getRecords(id))
                    }

                    put {
                        val id = call.requireParameter("id") ?: return@put
                        val request = call.receive<UpdateRecordRequest>()
                        call.respondBooleanResult(DnsService.updateRecords(id, request.records), "Records updated", "Failed to update records")
                    }

                    post {
                        val id = call.requireParameter("id") ?: return@post
                        val record = call.receive<DnsRecord>()
                        call.respondBooleanResult(DnsService.addRecord(id, record), "Record added", "Failed to add record", HttpStatusCode.Created)
                    }

                    delete("/{recordId}") {
                        val zoneId = call.requireParameter("id") ?: return@delete
                        val recordId = call.requireParameter("recordId") ?: return@delete
                        call.respondBooleanResult(DnsService.deleteRecord(zoneId, recordId), "Record deleted", "Failed to delete record")
                    }
                }

                // -- DNSSEC --

                get("/dnssec") {
                    val id = call.requireParameter("id") ?: return@get
                    call.respond(DnsService.getDnssecStatus(id))
                }

                post("/dnssec/enable") {
                    val id = call.requireParameter("id") ?: return@post
                    call.respond(DnsService.enableDnssec(id))
                }

                post("/dnssec/disable") {
                    val id = call.requireParameter("id") ?: return@post
                    call.respond(DnsService.disableDnssec(id))
                }

                post("/dnssec/sign") {
                    val id = call.requireParameter("id") ?: return@post
                    call.respond(DnsService.signZone(id))
                }

                get("/dnssec/ds") {
                    val id = call.requireParameter("id") ?: return@get
                    call.respond(DnsService.getDsRecords(id))
                }

                // -- Templates --

                post("/apply-template/{templateId}") {
                    val zoneId = call.requireParameter("id") ?: return@post
                    val templateId = call.requireParameter("templateId") ?: return@post
                    call.respondBooleanResult(DnsService.applyTemplate(zoneId, templateId), "Template applied", "Failed to apply template")
                }
            }
        }

        // ==================== Import ====================

        post("/import") {
            val request = call.receive<BulkImportRequest>()
            call.respond(DnsService.importZoneFile(request))
        }

        // ==================== Lookup (dig) ====================

        post("/lookup") {
            val request = call.receive<DnsLookupRequest>()
            call.respond(DnsService.lookup(request))
        }

        // ==================== ACLs ====================

        route("/acls") {
            get { call.respond(DnsService.listAcls()) }

            post {
                val acl = call.receive<DnsAcl>()
                call.respond(HttpStatusCode.Created, DnsService.createAcl(acl))
            }

            put {
                val acl = call.receive<DnsAcl>()
                call.respondBooleanResult(DnsService.updateAcl(acl), "ACL updated", "Failed to update ACL")
            }

            delete("/{id}") {
                val id = call.requireParameter("id") ?: return@delete
                call.respondBooleanResult(DnsService.deleteAcl(id), "ACL deleted", "Failed to delete ACL")
            }
        }

        // ==================== TSIG Keys ====================

        route("/tsig") {
            get { call.respond(DnsService.listTsigKeys()) }

            post {
                val key = call.receive<TsigKey>()
                val created = DnsService.createTsigKey(key)
                if (created != null) call.respond(HttpStatusCode.Created, created)
                else call.respond(HttpStatusCode.InternalServerError, DnsActionResult(false, "Key generation failed"))
            }

            delete("/{id}") {
                val id = call.requireParameter("id") ?: return@delete
                call.respondBooleanResult(DnsService.deleteTsigKey(id), "TSIG key deleted", "Failed to delete key")
            }
        }

        // ==================== Global Forwarders ====================

        route("/forwarders") {
            get { call.respond(DnsService.getForwarderConfig()) }

            post {
                val config = call.receive<DnsForwarderConfig>()
                call.respondBooleanResult(DnsService.updateForwarderConfig(config), "Forwarders updated", "Failed to update forwarders")
            }
        }

        // ==================== Global Security ====================

        route("/security") {
            get { call.respond(DnsService.getGlobalSecurityConfig()) }

            post {
                val config = call.receive<GlobalSecurityConfig>()
                call.respondBooleanResult(DnsService.updateGlobalSecurityConfig(config), "Security config updated", "Failed to update security config")
            }
        }

        // ==================== Installation ====================

        get("/install/status") { call.respond(DnsService.getInstallStatus()) }

        post("/install") {
            val request = call.receive<DnsInstallRequest>()
            call.respond(DnsService.install(request))
        }

        post("/uninstall") { call.respond(DnsService.uninstall()) }

        // ==================== Templates ====================

        route("/templates") {
            get { call.respond(DnsService.listTemplates()) }

            post {
                val template = call.receive<ZoneTemplate>()
                call.respond(HttpStatusCode.Created, DnsService.createTemplate(template))
            }

            delete("/{id}") {
                val id = call.requireParameter("id") ?: return@delete
                call.respondBooleanResult(DnsService.deleteTemplate(id), "Template deleted", "Failed to delete template")
            }
        }

        // ==================== Professional Hosting ====================

        route("/hosting") {
            post("/dkim/generate") {
                val request = call.receive<DkimKeyGenRequest>()
                call.respond(DnsService.generateDkimKey(request))
            }

            post("/spf/build") {
                val config = call.receive<SpfConfig>()
                call.respondText(DnsService.buildSpfRecord(config), ContentType.Text.Plain)
            }

            post("/dmarc/build") {
                val config = call.receive<DmarcConfig>()
                call.respondText(DnsService.buildDmarcRecord(config), ContentType.Text.Plain)
            }

            get("/reverse/suggest") {
                val ip = call.request.queryParameters["ip"] ?: return@get call.respond(HttpStatusCode.BadRequest, "IP missing")
                call.respond(DnsService.suggestReverseZone(ip))
            }

            get("/propagation/{id}") {
                val zoneId = call.requireParameter("id") ?: return@get
                val name = call.request.queryParameters["name"] ?: "@"
                val typeStr = call.request.queryParameters["type"] ?: "A"
                val type = try { DnsRecordType.valueOf(typeStr) } catch(e: Exception) { DnsRecordType.A }
                call.respond(DnsService.checkPropagation(zoneId, name, type))
            }

            post("/srv/build") {
                val config = call.receive<SrvConfig>()
                call.respond(mapOf("record" to DnsService.buildSrvRecord(config)))
            }

            get("/health/{id}") {
                val id = call.requireParameter("id") ?: return@get
                call.respond(DnsService.getEmailHealth(id))
            }

            get("/reverse-dashboard") {
                call.respond(DnsService.getReverseDnsDashboard())
            }
        }
    }
}
