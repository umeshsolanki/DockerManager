package com.umeshsolanki.dockermanager.config

import com.umeshsolanki.dockermanager.AppSettings
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class SettingsMigrationTest {

    // A mockable helper to simulate the logic without DB
    // This function mimics the core migration logic:
    // If DB is empty and File exists -> Save File content to DB
    fun migrateSettings(
        dbSettings: AppSettings?, 
        fileSettings: AppSettings?, 
        saveToDb: (AppSettings) -> Unit
    ): AppSettings {
        if (dbSettings != null) {
            return dbSettings // Source of truth is DB
        }
        
        if (fileSettings != null) {
            // Migration happening
            saveToDb(fileSettings)
            return fileSettings
        }
        
        return AppSettings() // Defaults
    }

    @Test
    fun testMigration_FileToDb() {
        // Setup scenarios
        val fileSettings = AppSettings(dockerSocket = "/var/run/custom.sock")
        val dbSettings: AppSettings? = null
        
        var savedApi: AppSettings? = null
        
        // Execute logic
        val result = migrateSettings(dbSettings, fileSettings) { toSave ->
            savedApi = toSave
        }
        
        // Verify
        assertEquals("/var/run/custom.sock", result.dockerSocket)
        assertNotNull(savedApi) 
        assertEquals("/var/run/custom.sock", savedApi?.dockerSocket)
    }

    @Test
    fun testNoMigration_IfDbExists() {
        val fileSettings = AppSettings(dockerSocket = "/var/run/file.sock")
        val dbSettings = AppSettings(dockerSocket = "/var/run/db.sock")
        
        var savedApi: AppSettings? = null
        
        val result = migrateSettings(dbSettings, fileSettings) {
            savedApi = it
        }
        
        // verify DB takes precedence and no save happens
        assertEquals("/var/run/db.sock", result.dockerSocket)
        assertTrue(savedApi == null)
    }
}
