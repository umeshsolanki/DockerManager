package com.umeshsolanki.dockermanager.constants

/**
 * Constants related to timeouts and delays.
 */
object TimeoutConstants {
    // Command execution timeout (seconds)
    const val COMMAND_EXECUTION_SECONDS = 5L
    
    // Worker intervals (milliseconds)
    const val UNJAIL_WORKER_INTERVAL_MS = 60_000L // 1 minute
    const val PROXY_STATS_WORKER_FALLBACK_MS = 60_000L // 1 minute fallback
    const val BTMP_WORKER_INTERVAL_MS = 60_000L // 1 minute (calculated from minutes)
}




