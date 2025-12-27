plugins {
    alias(libs.plugins.kotlinJvm)
    alias(libs.plugins.ktor)
    alias(libs.plugins.shadowJar)
    application
    `maven-publish`
}

group = "com.umeshsolanki.dockermanager"
version = "1.0.0"

application {
    mainClass.set("com.umeshsolanki.dockermanager.ApplicationKt")
    
    val isDevelopment: Boolean = project.ext.has("development")
    applicationDefaultJvmArgs = listOf("-Dio.ktor.development=$isDevelopment")
}

dependencies {
    implementation(projects.shared)
    implementation(libs.logback)
    implementation(libs.ktor.serverCore)
    implementation(libs.ktor.serverNetty)
    implementation(libs.ktor.serverContentNegotiation)
    implementation(libs.ktor.serializationKotlinxJson)
    implementation(libs.docker.java)
    implementation(libs.docker.java.transport)
    testImplementation(libs.ktor.serverTestHost)
    testImplementation(libs.kotlin.testJunit)
}

publishing {
    publications {
        create<MavenPublication>("fatJar") {
            artifact(tasks["shadowJar"])
        }
    }
    repositories {
        maven {
            url = uri("https://r1.umeshsolanki.in/repository/maven-releases/")
            credentials {
                username = System.getenv("MAVEN_USERNAME")
                password = System.getenv("MAVEN_PASSWORD")
            }
        }
    }
}
