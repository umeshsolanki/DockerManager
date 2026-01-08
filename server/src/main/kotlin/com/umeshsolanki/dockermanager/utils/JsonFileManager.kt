package com.umeshsolanki.dockermanager.utils

import com.umeshsolanki.dockermanager.AppConfig
import kotlinx.serialization.KSerializer
import kotlinx.serialization.InternalSerializationApi
import kotlinx.serialization.serializer
import org.slf4j.LoggerFactory
import java.io.File

/**
 * Utility class for managing JSON file operations with common patterns.
 * Handles loading, saving, and initialization of JSON files.
 */
@OptIn(InternalSerializationApi::class)
class JsonFileManager<T : Any>(
    private val file: File,
    private val defaultContent: T,
    private val serializer: KSerializer<T>,
    private val loggerName: String = JsonFileManager::class.java.name
) {
    companion object {
        /**
         * Factory function to create JsonFileManager with proper type inference.
         * This ensures the serializer is correctly inferred even when defaultContent is emptyList().
         */
        inline fun <reified T : Any> create(
            file: File,
            defaultContent: T,
            loggerName: String = JsonFileManager::class.java.name
        ): JsonFileManager<T> {
            return JsonFileManager(
                file = file,
                defaultContent = defaultContent,
                serializer = serializer<T>(),
                loggerName = loggerName
            )
        }
    }
    private val logger = LoggerFactory.getLogger(loggerName)
    private val json = AppConfig.json

    init {
        ensureFileExists()
    }

    /**
     * Ensures the file and its parent directory exist.
     * Creates default content if file doesn't exist.
     */
    private fun ensureFileExists() {
        try {
            if (!file.parentFile.exists()) {
                file.parentFile.mkdirs()
            }
            if (!file.exists()) {
                file.writeText(json.encodeToString(serializer, defaultContent))
                logger.debug("Created default JSON file: ${file.absolutePath}")
            }
        } catch (e: Exception) {
            logger.error("Failed to ensure file exists: ${file.absolutePath}", e)
        }
    }

    /**
     * Loads data from JSON file.
     * Returns default content if file doesn't exist or parsing fails.
     */
    fun load(): T {
        return try {
            if (file.exists()) {
                val content = file.readText()
                json.decodeFromString(serializer, content)
            } else {
                logger.warn("File does not exist, returning default: ${file.absolutePath}")
                defaultContent
            }
        } catch (e: Exception) {
            logger.error("Error loading JSON file: ${file.absolutePath}", e)
            defaultContent
        }
    }

    /**
     * Saves data to JSON file.
     * Returns true on success, false on failure.
     */
    fun save(data: T): Boolean {
        return try {
            ensureFileExists()
            file.writeText(json.encodeToString(serializer, data))
            true
        } catch (e: Exception) {
            logger.error("Error saving JSON file: ${file.absolutePath}", e)
            false
        }
    }

    /**
     * Atomically updates the file by loading, modifying, and saving.
     * The modifier function receives the current data and should return the updated data.
     */
    fun update(modifier: (T) -> T): Boolean {
        return try {
            val current = load()
            val updated = modifier(current)
            save(updated)
        } catch (e: Exception) {
            logger.error("Error updating JSON file: ${file.absolutePath}", e)
            false
        }
    }

    /**
     * Atomically updates the file with a lock.
     * Useful for concurrent access scenarios.
     */
    fun updateWithLock(lock: java.util.concurrent.locks.Lock, modifier: (T) -> T): Boolean {
        lock.lock()
        return try {
            update(modifier)
        } finally {
            lock.unlock()
        }
    }
}

