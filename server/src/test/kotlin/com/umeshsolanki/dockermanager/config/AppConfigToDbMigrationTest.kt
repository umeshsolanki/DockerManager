package com.umeshsolanki.dockermanager.config

import com.umeshsolanki.dockermanager.AppSettings
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class AppConfigToDbMigrationTest {

    // Simulates: AppConfig.loadSettings() logic
    // 1. If DB has "MAIN_SETTINGS", return it.
    // 2. If DB is empty, but File has content, return File content AND triggering a save to DB.
    fun migrateAppConfig(
        dbContent: AppSettings?, 
        fileContent: AppSettings?, 
        saveToDbAction: (AppSettings) -> Unit
    ): AppSettings {
        if (dbContent != null) {
            return dbContent // DB is source of truth
        }
        
        if (fileContent != null) {
            // Migration: File -> DB
            saveToDbAction(fileContent)
            return fileContent
        }
        
        return AppSettings() // Default
    }

    @Test
    fun testAppConfigMigration_FileToDb() {
        val fileConfig = AppSettings(
            dockerSocket = "/var/run/migrated.sock",
            jamesWebAdminUrl = "http://migrated:8000"
        )
        val dbConfig: AppSettings? = null
        
        var persistedToDb: AppSettings? = null
        
        val result = migrateAppConfig(dbConfig, fileConfig) {
            persistedToDb = it
        }
        
        // Assertions
        assertEquals("/var/run/migrated.sock", result.dockerSocket)
        assertEquals("http://migrated:8000", result.jamesWebAdminUrl)
        
        assertNotNull(persistedToDb, "Should have triggered a save to DB")
        assertEquals("/var/run/migrated.sock", persistedToDb?.dockerSocket)
    }

    @Test
    fun testAppConfig_DbPrecedence() {
        val fileConfig = AppSettings(dockerSocket = "/var/run/file_old.sock")
        val dbConfig = AppSettings(dockerSocket = "/var/run/db_new.sock")
        
        var persistedToDb: AppSettings? = null
        
        val result = migrateAppConfig(dbConfig, fileConfig) {
            persistedToDb = it
        }
        
        assertEquals("/var/run/db_new.sock", result.dockerSocket)
        assertTrue(persistedToDb == null, "Should NOT overwrite DB with old file config")
    }
}
