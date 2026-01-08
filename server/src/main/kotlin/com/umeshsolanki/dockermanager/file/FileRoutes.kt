package com.umeshsolanki.dockermanager.file

import com.umeshsolanki.dockermanager.DockerService
import com.umeshsolanki.dockermanager.auth.AuthService
import io.ktor.http.*
import io.ktor.http.content.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.io.File

fun Route.fileRoutes() {
    route("/files") {
        intercept(ApplicationCallPipeline.Call) {
            val token = call.request.header(HttpHeaders.Authorization)?.removePrefix("Bearer ")
                ?: call.request.queryParameters["token"]
            
            if (token == null || !AuthService.validateToken(token)) {
                call.respond(HttpStatusCode.Unauthorized, "Invalid or missing token")
                finish()
            }
        }

        get("/list") {
            val path = call.request.queryParameters["path"] ?: ""
            call.respond(DockerService.listFiles(path))
        }

        get("/download") {
            val path = call.request.queryParameters["path"] ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing path")
            val file = DockerService.getFile(path)
            if (file != null && file.exists()) {
                call.response.header(
                    HttpHeaders.ContentDisposition,
                    ContentDisposition.Attachment.withParameter(ContentDisposition.Parameters.FileName, file.name).toString()
                )
                call.respondFile(file)
            } else {
                call.respond(HttpStatusCode.NotFound, "File not found")
            }
        }

        post("/upload") {
            val path = call.request.queryParameters["path"] ?: ""
            val multipart = call.receiveMultipart()
            var success = false
            
            multipart.forEachPart { part ->
                if (part is PartData.FileItem) {
                    val fileName = part.originalFileName ?: "uploaded_file"
                    val fullPath = if (path.isEmpty()) fileName else "$path/$fileName"
                    part.streamProvider().use { input ->
                        if (DockerService.saveFile(fullPath, input)) {
                            success = true
                        }
                    }
                }
                part.dispose()
            }
            
            if (success) {
                call.respond(HttpStatusCode.OK, "File uploaded successfully")
            } else {
                call.respond(HttpStatusCode.InternalServerError, "Failed to upload file")
            }
        }

        delete("/delete") {
            val path = call.request.queryParameters["path"] ?: return@delete call.respond(HttpStatusCode.BadRequest, "Missing path")
            if (DockerService.deleteFile(path)) {
                call.respond(HttpStatusCode.OK, "File deleted successfully")
            } else {
                call.respond(HttpStatusCode.InternalServerError, "Failed to delete file")
            }
        }

        post("/mkdir") {
            val path = call.request.queryParameters["path"] ?: return@post call.respond(HttpStatusCode.BadRequest, "Missing path")
            if (DockerService.createDirectory(path)) {
                call.respond(HttpStatusCode.OK, "Directory created successfully")
            } else {
                call.respond(HttpStatusCode.InternalServerError, "Failed to create directory")
            }
        }

        post("/zip") {
            val path = call.request.queryParameters["path"] ?: return@post call.respond(HttpStatusCode.BadRequest, "Missing path")
            val target = call.request.queryParameters["target"] ?: "archive.zip"
            val zipFile = DockerService.zipFile(path, target)
            if (zipFile != null) {
                call.respond(HttpStatusCode.OK, "File zipped successfully: ${zipFile.name}")
            } else {
                call.respond(HttpStatusCode.InternalServerError, "Failed to zip file")
            }
        }

        post("/unzip") {
            val path = call.request.queryParameters["path"] ?: return@post call.respond(HttpStatusCode.BadRequest, "Missing path")
            val target = call.request.queryParameters["target"] ?: "."
            if (DockerService.unzipFile(path, target)) {
                call.respond(HttpStatusCode.OK, "File unzipped successfully")
            } else {
                call.respond(HttpStatusCode.InternalServerError, "Failed to unzip file")
            }
        }
    }
}
