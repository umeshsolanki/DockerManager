plugins {
    alias(libs.plugins.kotlinJvm)
    alias(libs.plugins.kotlinSerialization)
}

group = "com.umeshsolanki.dockermanager"
version = "1.0.0"

dependencies {
    implementation(projects.shared)
    implementation(libs.kafka.clients)
    implementation(libs.kotlinx.serializationJson)
    implementation(libs.kotlinx.coroutines.core)
    implementation("org.slf4j:slf4j-api:2.0.9")
}
