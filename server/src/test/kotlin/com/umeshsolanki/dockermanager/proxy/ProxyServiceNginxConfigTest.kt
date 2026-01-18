package com.umeshsolanki.dockermanager.proxy

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.jail.JailManagerService
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkObject
import io.mockk.unmockkObject
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.nio.file.Path
import kotlin.reflect.full.declaredMemberFunctions
import kotlin.reflect.jvm.isAccessible

class ProxyServiceNginxConfigTest {

    @TempDir
    lateinit var tempDir: Path

    @BeforeEach
    fun setup() {
        mockkObject(AppConfig)
        every { AppConfig.proxyDir } returns tempDir.toFile()
    }

    @AfterEach
    fun tearDown() {
        unmockkObject(AppConfig)
    }

    @Test
    fun `ensureNginxMainConfig updates config when variables are missing`() {
        // 1. Create a dummy "old" nginx.conf missing the variables
        val nginxConf = tempDir.resolve("nginx.conf").toFile()
        nginxConf.writeText("worker_processes 1;\nevents {}\nhttp { include mime.types; }")
        
        // 2. Create the service (dependencies mocked)
        val jailManager = mockk<com.umeshsolanki.dockermanager.jail.IJailManagerService>(relaxed = true)
        val proxyService = ProxyServiceImpl(jailManager)

        // 3. Access private method via reflection
        val ensureMethod = ProxyServiceImpl::class.declaredMemberFunctions
            .find { it.name == "ensureNginxMainConfig" }
        ensureMethod?.isAccessible = true
        
        // 4. Run the method
        ensureMethod?.call(proxyService)

        // 5. Verify the file was updated (should contain the new variables)
        val content = nginxConf.readText()
        assertTrue(content.contains("\$is_allowed"), "Config should contain \$is_allowed")
        assertTrue(content.contains("\$connection_upgrade"), "Config should contain \$connection_upgrade")
    }

    @Test
    fun `ensureNginxMainConfig does not update config when variables are present`() {
        // 1. Create a "good" nginx.conf
        val nginxConf = tempDir.resolve("nginx.conf").toFile()
        val customContent = "http { map \$request_method \$is_allowed {} map \$http_upgrade \$connection_upgrade {} # Custom }"
        nginxConf.writeText(customContent)
        
        // 2. Create the service
        val jailManager = mockk<com.umeshsolanki.dockermanager.jail.IJailManagerService>(relaxed = true)
        val proxyService = ProxyServiceImpl(jailManager)

        // 3. Access private method
        val ensureMethod = ProxyServiceImpl::class.declaredMemberFunctions
            .find { it.name == "ensureNginxMainConfig" }
        ensureMethod?.isAccessible = true
        
        // 4. Run the method
        ensureMethod?.call(proxyService)

        // 5. Verify the file was NOT updated (should still have custom comment)
        val content = nginxConf.readText()
        assertTrue(content.contains("# Custom"), "Config should preserve custom content if variables are present")
    }
}
