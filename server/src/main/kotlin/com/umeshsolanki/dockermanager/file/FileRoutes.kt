package com.umeshsolanki.dockermanager.file

import com.umeshsolanki.dockermanager.*
import com.umeshsolanki.dockermanager.auth.AuthService
import io.ktor.http.*
import io.ktor.http.content.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.io.File

val PathTokenPlugin = createRouteScopedPlugin(name = "PathTokenPlugin") {
    onCall { call ->
        val token = call.request.header(HttpHeaders.Authorization)?.removePrefix("Bearer ")
            ?: call.request.queryParameters["token"]
        if (token == null || !AuthService.validateToken(token)) {
            call.respond(HttpStatusCode.Unauthorized, "Invalid or missing token")
        }
    }
}

fun Route.fileRoutes() {
    route("/files") {
        install(PathTokenPlugin)

        get("/list") {
            val path = call.request.queryParameters["path"] ?: ""
            call.respond(FileService.listFiles(path))
        }

        get("/download") {
            val path = call.requireQueryParameter("path") ?: return@get
            val file = FileService.getFile(path)
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
                    @Suppress("DEPRECATION")
                    part.streamProvider().use { input ->
                        if (FileService.saveFile(fullPath, input)) {
                            success = true
                        }
                    }
                }
                part.dispose()
            }
            
            call.respondBooleanResult(
                success,
                "File uploaded successfully",
                "Failed to upload file"
            )
        }

        delete("/delete") {
            val path = call.requireQueryParameter("path") ?: return@delete
            call.respondBooleanResult(
                FileService.deleteFile(path),
                "File deleted successfully",
                "Failed to delete file"
            )
        }

        post("/mkdir") {
            val path = call.requireQueryParameter("path") ?: return@post
            call.respondBooleanResult(
                FileService.createDirectory(path),
                "Directory created successfully",
                "Failed to create directory"
            )
        }

        post("/zip") {
            val path = call.requireQueryParameter("path") ?: return@post
            val target = call.request.queryParameters["target"] ?: "archive.zip"
            val zipFile = FileService.zipFile(path, target)
            if (zipFile != null) {
                call.respond(HttpStatusCode.OK, "File zipped successfully: ${zipFile.name}")
            } else {
                call.respond(HttpStatusCode.InternalServerError, "Failed to zip file")
            }
        }

        post("/unzip") {
            val path = call.requireQueryParameter("path") ?: return@post
            val target = call.request.queryParameters["target"] ?: "."
            call.respondBooleanResult(
                FileService.unzipFile(path, target),
                "File unzipped successfully",
                "Failed to unzip file"
            )
        }
    }
}
