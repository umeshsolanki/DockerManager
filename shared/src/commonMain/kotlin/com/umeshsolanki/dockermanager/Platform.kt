package com.umeshsolanki.dockermanager

interface Platform {
    val name: String
}

expect fun getPlatform(): Platform