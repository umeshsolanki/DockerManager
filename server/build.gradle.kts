plugins {
    alias(libs.plugins.kotlinJvm)
    alias(libs.plugins.ktor)
    alias(libs.plugins.shadowJar)
    application
    `maven-publish`
    alias(libs.plugins.kotlinSerialization)
}

group = "com.umeshsolanki.dockermanager"
version = "2.3.2"

application {
    mainClass.set("com.umeshsolanki.dockermanager.ApplicationKt")
    
    val isDevelopment: Boolean = project.ext.has("development")
    applicationDefaultJvmArgs = listOf("-Dio.ktor.development=$isDevelopment")
}

// Generate version.properties
val generateVersionProperties by tasks.registering {
    val propertiesFile = layout.buildDirectory.file("generated/resources/version.properties").get().asFile
    outputs.file(propertiesFile)
    val appVersion = project.version.toString()
    doLast {
        propertiesFile.parentFile.mkdirs()
        propertiesFile.writeText("version=$appVersion")
    }
}

sourceSets {
    main {
        resources {
            srcDir(layout.buildDirectory.dir("generated/resources"))
        }
    }
}

tasks.named("processResources") {
    dependsOn(generateVersionProperties)
}

dependencies {
    implementation(projects.shared)
    implementation(libs.logback)
    implementation(libs.ktor.serverCore)
    implementation(libs.ktor.serverNetty)
    implementation(libs.ktor.serverContentNegotiation)
    implementation(libs.ktor.serverCors)
    implementation(libs.ktor.serverWebsockets)
    implementation(libs.ktor.serverAuth)
    implementation(libs.ktor.serverSessions)
//    implementation(libs.ktor.serverStaticContent)
    implementation(libs.ktor.serializationKotlinxJson)
    implementation(libs.pty4j)
    implementation(libs.ktor.clientCore)
    implementation(libs.ktor.clientJava)
    implementation(libs.ktor.clientContentNegotiation)
    implementation(libs.kotlinx.coroutines.core)

    implementation(libs.docker.java)
    implementation(libs.docker.java.transport)
    implementation(libs.firebase.admin)
    implementation(libs.jakarta.mail)
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
