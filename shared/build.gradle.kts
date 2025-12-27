import org.jetbrains.kotlin.gradle.ExperimentalWasmDsl

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.kotlinSerialization)
    `maven-publish`
}

kotlin {
    jvm()

    js {
        browser()
    }

    @OptIn(ExperimentalWasmDsl::class)
    wasmJs {
        browser()
    }

    sourceSets {
        commonMain.dependencies {
            implementation(libs.kotlinx.serializationJson)
        }
        commonTest.dependencies {
            implementation(libs.kotlin.test)
        }
    }
}

group = "com.umeshsolanki.dockermanager"
version = "1.0.0"

publishing {
    repositories {
        maven {
            url = uri("https://r1.umeshsolanki.in/repository/maven-releases/")
            credentials {
                username = System.getenv("MAVEN_USERNAME") ?: "public"
                password = System.getenv("MAVEN_PASSWORD")?: "public"
            }
        }
    }
}

