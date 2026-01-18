package com.umeshsolanki.dockermanager

import com.umeshsolanki.dockermanager.constants.ErrorConstants
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import com.umeshsolanki.dockermanager.proxy.ProxyActionResult

/**
 * Extension function to safely get a required route parameter.
 * Returns null if parameter is missing, allowing caller to handle the error.
 */
suspend fun ApplicationCall.requireParameter(name: String): String? {
    return parameters[name] ?: run {
        respond(HttpStatusCode.BadRequest, ErrorConstants.format(ErrorConstants.MISSING_REQUIRED_PARAMETER, name))
        null
    }
}

/**
 * Extension function to safely get a required query parameter.
 * Returns null if parameter is missing, allowing caller to handle the error.
 */
suspend fun ApplicationCall.requireQueryParameter(name: String): String? {
    return request.queryParameters[name] ?: run {
        respond(HttpStatusCode.BadRequest, ErrorConstants.format(ErrorConstants.MISSING_REQUIRED_QUERY_PARAMETER, name))
        null
    }
}

/**
 * Extension function to handle boolean service results.
 * Responds with OK/Created on success, InternalServerError on failure.
 */
suspend fun ApplicationCall.respondBooleanResult(
    success: Boolean,
    successMessage: String = ErrorConstants.OPERATION_COMPLETED,
    errorMessage: String = ErrorConstants.OPERATION_FAILED,
    successStatus: HttpStatusCode = HttpStatusCode.OK
) {
    if (success) {
        respond(successStatus, successMessage)
    } else {
        respond(HttpStatusCode.InternalServerError, errorMessage)
    }
}

/**
 * Extension function to handle nullable service results.
 * Responds with the result on success, NotFound on null.
 */
suspend fun <T> ApplicationCall.respondNullableResult(
    result: T?,
    notFoundMessage: String = ErrorConstants.RESOURCE_NOT_FOUND
) {
    if (result != null) {
        respond(result)
    } else {
        respond(HttpStatusCode.NotFound, notFoundMessage)
    }
}

/**
 * Extension function to handle Pair<Boolean, String> service results.
 * Common pattern for operations that return success status and a message.
 */
suspend fun ApplicationCall.respondPairResult(
    result: Pair<Boolean, String>,
    successStatus: HttpStatusCode = HttpStatusCode.OK,
    errorStatus: HttpStatusCode = HttpStatusCode.BadRequest
) {
    if (result.first) {
        respond(successStatus, ProxyActionResult(true, result.second))
    } else {
        respond(errorStatus, ProxyActionResult(false, result.second))
    }
}

/**
 * Extension function for simple text responses with status.
 */
suspend fun ApplicationCall.respondTextResult(
    success: Boolean,
    successMessage: String,
    errorMessage: String = "Operation failed",
    successStatus: HttpStatusCode = HttpStatusCode.OK
) {
    if (success) {
        respondText(successMessage, status = successStatus)
    } else {
        respondText(errorMessage, status = HttpStatusCode.InternalServerError)
    }
}

