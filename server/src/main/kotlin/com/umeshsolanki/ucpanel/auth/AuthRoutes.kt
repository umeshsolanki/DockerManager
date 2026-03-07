package com.umeshsolanki.ucpanel.auth

import com.umeshsolanki.ucpanel.AppConfig
import com.umeshsolanki.ucpanel.fcm.FcmService
import io.ktor.http.HttpStatusCode
import io.ktor.server.auth.authenticate
import io.ktor.server.plugins.origin
import io.ktor.server.request.header
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route

fun Route.authRoutes() {
    route("/auth") {
        post("/login") {
            val request = call.receive<AuthRequest>()
            val remoteIp = call.request.header("X-Forwarded-For")?.split(",")?.firstOrNull()?.trim()
                ?: call.request.header("X-Real-IP") ?: call.request.origin.remoteHost

            when (val result = AuthService.authenticate(
                request.password, request.username, request.otpCode, remoteIp
            )) {
                is AuthResult.Success -> {
                    call.respond(AuthResponse(result.token))
                }

                is AuthResult.Requires2FA -> {
                    call.respond(HttpStatusCode.OK, AuthResponse("", requires2FA = true))
                }

                is AuthResult.InvalidCredentials -> {
                    call.respond(
                        HttpStatusCode.Unauthorized,
                        mapOf("message" to "Invalid credentials")
                    )
                }

                is AuthResult.Invalid2FA -> {
                    call.respond(
                        HttpStatusCode.Unauthorized,
                        mapOf("message" to "Invalid 2FA code")
                    )
                }
            }
        }

        // Public but protected by API key — apps register push tokens before login
        post("/fcm/register") {
            val apiKey = call.request.header("X-API-Key")
            if (apiKey.isNullOrBlank() || apiKey != AppConfig.settings.fcmApiKey) {
                call.respond(HttpStatusCode.Unauthorized, mapOf("success" to false, "message" to "Invalid API key"))
                return@post
            }
            val request = try {
                call.receive<RegisterFcmTokenRequest>()
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, mapOf("success" to false, "message" to "Invalid request body"))
                return@post
            }
            if (request.token.isBlank() || request.token.length < 32) {
                call.respond(HttpStatusCode.BadRequest, mapOf("success" to false, "message" to "Invalid token"))
                return@post
            }
            FcmService.registerToken(request)
            call.respond(mapOf("success" to true))
        }

        authenticate("auth-bearer") {
            get("/check") {
                call.respond(mapOf("authenticated" to true))
            }

            get("/fcm/api-key") {
                call.respond(mapOf("apiKey" to AppConfig.settings.fcmApiKey))
            }

            post("/password") {
                val request = call.receive<UpdatePasswordRequest>()
                if (AuthService.updatePassword(request.currentPassword, request.newPassword)) {
                    call.respond(mapOf("success" to true))
                } else {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        mapOf("success" to false, "message" to "Invalid current password")
                    )
                }
            }

            post("/username") {
                val request = call.receive<UpdateUsernameRequest>()
                if (AuthService.updateUsername(request.currentPassword, request.newUsername)) {
                    call.respond(mapOf("success" to true))
                } else {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        mapOf("success" to false, "message" to "Invalid current password")
                    )
                }
            }

            route("/2fa") {
                get("/setup") {
                    call.respond(AuthService.generate2FASecret())
                }

                post("/enable") {
                    val request = call.receive<Enable2FARequest>()
                    if (AuthService.enable2FA(request.secret, request.code)) {
                        call.respond(mapOf("success" to true))
                    } else {
                        call.respond(
                            HttpStatusCode.BadRequest,
                            mapOf("success" to false, "message" to "Invalid code")
                        )
                    }
                }

                post("/disable") {
                    val request = call.receive<AuthRequest>() // Reuse AuthRequest for password
                    if (AuthService.disable2FA(request.password)) {
                        call.respond(mapOf("success" to true))
                    } else {
                        call.respond(
                            HttpStatusCode.BadRequest,
                            mapOf("success" to false, "message" to "Invalid password")
                        )
                    }
                }
            }
        }
    }
}
