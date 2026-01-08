package com.umeshsolanki.dockermanager.constants

/**
 * Constants related to error messages.
 */
object ErrorConstants {
    const val MISSING_REQUIRED_PARAMETER = "Missing required parameter: %s"
    const val MISSING_REQUIRED_QUERY_PARAMETER = "Missing required query parameter: %s"
    const val OPERATION_FAILED = "Operation failed"
    const val RESOURCE_NOT_FOUND = "Resource not found"
    const val OPERATION_COMPLETED = "Operation completed successfully"
    
    fun format(template: String, vararg args: Any): String {
        return template.replace("%s", args.firstOrNull()?.toString() ?: "")
    }
}


