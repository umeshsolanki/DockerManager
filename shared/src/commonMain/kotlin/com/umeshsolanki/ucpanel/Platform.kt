package com.umeshsolanki.ucpanel

interface Platform {
    val name: String
}

expect fun getPlatform(): Platform