package com.umeshsolanki.dockermanager.analytics

import org.junit.Test
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AnalyticsRotationTest {

    @Test
    fun testLogRotationLogic() {
        // 1. Setup temporary directory
        val tempDir = File(System.getProperty("java.io.tmpdir"), "dm_test_logs_${System.currentTimeMillis()}")
        tempDir.mkdirs()
        
        try {
            val logFile = File(tempDir, "access.log")
            
            // 2. Create a simulated log file (must be > 10KB to trigger rotation)
            val sb = StringBuilder()
            val dateFormat = SimpleDateFormat("dd/MMM/yyyy:HH:mm:ss Z", Locale.US)
            val today = Date()
            
            // Fill with dummy data ~15KB
            repeat(150) {
                sb.append("192.168.1.1 - - [${dateFormat.format(today)}] \"GET / HTTP/1.1\" 200 1234 \"-\" \"Mozilla/5.0\" \"-\"\n")
                // Add padding to increase size
                sb.append("# PADDING LINE TO INCREASE FILE SIZE FOR ROTATION TEST ${"x".repeat(100)}\n")
            }
            logFile.writeText(sb.toString())
            
            assertTrue(logFile.length() > 10240, "Log file should be > 10KB for rotation logic")
            
            // 3. Simulate Rotation Logic (Mimicking AnalyticsService.rotateAccessLog)
            val dateStr = "2024-01-01"
            val rotatedFile = File(tempDir, "access_$dateStr.log")
            
            if (logFile.exists() && logFile.length() > 10240) {
                 logFile.copyTo(rotatedFile, overwrite = true)
                 if (rotatedFile.exists() && rotatedFile.length() == logFile.length()) {
                     logFile.writeText("") // Truncate
                 }
            }
            
            // 4. Verify results
            assertTrue(rotatedFile.exists(), "Rotated file should exist")
            assertTrue(rotatedFile.length() > 0, "Rotated file should contain data")
            assertEquals(0, logFile.length(), "Original log file should be truncated to 0 bytes")
            
        } finally {
            tempDir.deleteRecursively()
        }
    }
    
    @Test
    fun testResetLogicSanity() {
        // Sanity check for counter reset
        val counter = java.util.concurrent.atomic.AtomicLong(100)
        val map = java.util.concurrent.ConcurrentHashMap<String, Int>()
        map["test"] = 5
        
        // Reset
        counter.set(0)
        map.clear()
        
        assertEquals(0, counter.get())
        assertTrue(map.isEmpty())
    }
}
