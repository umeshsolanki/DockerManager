package com.umeshsolanki.dockermanager.utils

import org.slf4j.LoggerFactory
import java.io.InputStream

/**
 * Utility class for loading resource files from the classpath.
 */
object ResourceLoader {
    private val logger = LoggerFactory.getLogger(ResourceLoader::class.java)

    /**
     * Loads a resource file as a string from the classpath.
     * 
     * @param resourcePath Path to the resource file (e.g., "templates/proxy/nginx.conf")
     * @return The content of the resource file, or null if not found
     */
    fun loadResource(resourcePath: String): String? {
        return try {
            val inputStream: InputStream? = ResourceLoader::class.java.classLoader
                .getResourceAsStream(resourcePath)
            
            if (inputStream == null) {
                logger.warn("Resource not found: $resourcePath")
                return null
            }
            
            inputStream.bufferedReader().use { it.readText() }
        } catch (e: Exception) {
            logger.error("Error loading resource: $resourcePath", e)
            null
        }
    }

    /**
     * Loads a resource file as a string, throwing an exception if not found.
     * 
     * @param resourcePath Path to the resource file
     * @return The content of the resource file
     * @throws IllegalStateException if the resource is not found
     */
    fun loadResourceOrThrow(resourcePath: String): String {
        return loadResource(resourcePath) 
            ?: throw IllegalStateException("Required resource not found: $resourcePath")
    }

    /**
     * Replaces placeholders in a template string with actual values.
     * 
     * @param template The template string with placeholders like ${placeholder}
     * @param replacements Map of placeholder names to replacement values
     * @return The template with placeholders replaced
     */
    fun replacePlaceholders(template: String, replacements: Map<String, String>): String {
        var result = template
        replacements.forEach { (key, value) ->
            result = result.replace("\${$key}", value)
        }
        return result
    }
}





