rootProject.name = "DockerManager"
enableFeaturePreview("TYPESAFE_PROJECT_ACCESSORS")

pluginManagement {
    repositories {
        google {
            mavenContent {
                includeGroupAndSubgroups("androidx")
                includeGroupAndSubgroups("com.android")
                includeGroupAndSubgroups("com.google")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google {
            mavenContent {
                includeGroupAndSubgroups("androidx")
                includeGroupAndSubgroups("com.android")
                includeGroupAndSubgroups("com.google")
            }
        }
        mavenCentral()
        maven { url = uri("https://packages.jetbrains.team/maven/p/pty4j/maven") }
        maven { url = uri("https://maven.pkg.jetbrains.space/public/p/exposed/exposed") }
    }
}

include(":composeApp")
include(":server")
include(":shared")
include(":kafka")
include(":androidApp")
