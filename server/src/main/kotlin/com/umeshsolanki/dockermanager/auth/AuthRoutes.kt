package com.umeshsolanki.dockermanager.auth

import com.umeshsolanki.dockermanager.fcm.FcmService
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
                    call.respond(HttpStatusCode.Unauthorized, AuthResponse("", requires2FA = true))
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

        authenticate("auth-bearer") {
            get("/check") {
                call.respond(mapOf("authenticated" to true))
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

            post("/fcm/register") {
                val request = call.receive<RegisterFcmTokenRequest>()
                FcmService.registerToken(request)
                call.respond(mapOf("success" to true))
            }
        }
    }
}
