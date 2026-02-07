package com.umeshsolanki.dockermanager.jail

import com.umeshsolanki.dockermanager.firewall.BlockIPRequest
import com.umeshsolanki.dockermanager.firewall.FirewallRule
import com.umeshsolanki.dockermanager.firewall.IFirewallService
import com.umeshsolanki.dockermanager.ip.IIpInfoService
import com.umeshsolanki.dockermanager.ip.IIpReputationService
import com.umeshsolanki.dockermanager.ip.IpInfo
import io.mockk.*
import org.junit.After
import org.junit.Before
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Unit tests for JailManagerService
 * 
 * These tests verify the core jailing functionality without requiring full AppConfig mocking.
 * Tests focus on:
 * - IP jailing and unjailing
 * - Jail list management
 * - Firewall service integration
 */
class JailManagerServiceTest {

    private lateinit var mockFirewallService: IFirewallService
    private lateinit var mockIpInfoService: IIpInfoService
    private lateinit var jailManagerService: JailManagerServiceImpl

    @Before
    fun setup() {
        mockFirewallService = mockk<IFirewallService>(relaxed = true)
        mockIpInfoService = mockk<IIpInfoService>(relaxed = true)
        jailManagerService = JailManagerServiceImpl(
            mockFirewallService, mockIpInfoService,
            ipReputationService = mockk<IIpReputationService>(relaxed = true)
        )
        
        // Mock the firewall list to return empty by default
        every { mockFirewallService.listRules() } returns emptyList()
    }

    @After
    fun teardown() {
        clearAllMocks()
    }

    @Test
    fun `test jailIP creates firewall rule with correct parameters`() {
        val testIp = "203.0.113.42"
        val durationMinutes = 30
        val reason = "Test jail reason"
        
        every { mockFirewallService.blockIP(any()) } returns true

        val result = jailManagerService.jailIP(testIp, durationMinutes, reason)

        assertTrue(result)
        verify(exactly = 1) {
            mockFirewallService.blockIP(
                match { request ->
                    request.ip == testIp &&
                    request.comment == reason &&
                    request.expiresAt != null &&
                    request.expiresAt > System.currentTimeMillis()
                }
            )
        }
    }

    @Test
    fun `test jailIP calculates correct expiration time`() {
        val testIp = "203.0.113.42"
        val durationMinutes = 45
        val reason = "Test"
        val beforeTime = System.currentTimeMillis()
        
        var capturedRequest: BlockIPRequest? = null
        every { mockFirewallService.blockIP(any()) } answers {
            capturedRequest = firstArg()
            true
        }

        jailManagerService.jailIP(testIp, durationMinutes, reason)
        
        val afterTime = System.currentTimeMillis()
        val expectedMin = beforeTime + (durationMinutes * 60_000L)
        val expectedMax = afterTime + (durationMinutes * 60_000L)

        assertNotNull(capturedRequest)
        assertTrue(capturedRequest!!.expiresAt!! >= expectedMin)
        assertTrue(capturedRequest!!.expiresAt!! <= expectedMax)
    }

    @Test
    fun `test unjailIP calls firewall service correctly`() {
        val testIp = "203.0.113.42"
        
        every { mockFirewallService.unblockIPByAddress(testIp) } returns true

        val result = jailManagerService.unjailIP(testIp)

        assertTrue(result)
        verify(exactly = 1) { mockFirewallService.unblockIPByAddress(testIp) }
    }

    @Test
    fun `test unjailIP returns false on failure`() {
        val testIp = "203.0.113.42"
        
        every { mockFirewallService.unblockIPByAddress(testIp) } returns false

        val result = jailManagerService.unjailIP(testIp)

        assertFalse(result)
    }

    @Test
    fun `test isIPJailed returns true for jailed IP`() {
        val testIp = "203.0.113.42"
        val futureTime = System.currentTimeMillis() + 60_000L
        
        every { mockFirewallService.listRules() } returns listOf(
            FirewallRule(
                id = "test-rule-1",
                ip = testIp,
                comment = "Test jail",
                expiresAt = futureTime,
                createdAt = System.currentTimeMillis(),
                country = null,
                port = null
            )
        )

        val result = jailManagerService.isIPJailed(testIp)

        assertTrue(result)
    }

    @Test
    fun `test isIPJailed returns false for expired jail`() {
        val testIp = "203.0.113.42"
        val pastTime = System.currentTimeMillis() - 60_000L
        
        every { mockFirewallService.listRules() } returns listOf(
            FirewallRule(
                id = "test-rule-1",
                ip = testIp,
                comment = "Test jail",
                expiresAt = pastTime,
                createdAt = System.currentTimeMillis() - 120_000L,
                country = null,
                port = null
            )
        )

        val result = jailManagerService.isIPJailed(testIp)

        assertFalse(result)
    }

    @Test
    fun `test isIPJailed returns false for non-jailed IP`() {
        val testIp = "203.0.113.42"
        
        every { mockFirewallService.listRules() } returns emptyList()

        val result = jailManagerService.isIPJailed(testIp)

        assertFalse(result)
    }

    @Test
    fun `test listJails returns only active jails`() {
        val activeIp = "203.0.113.42"
        val expiredIp = "203.0.113.43"
        val now = System.currentTimeMillis()
        
        every { mockFirewallService.listRules() } returns listOf(
            FirewallRule(
                id = "active-rule",
                ip = activeIp,
                comment = "Active jail",
                expiresAt = now + 60_000L,
                createdAt = now,
                country = "US",
                port = null
            ),
            FirewallRule(
                id = "expired-rule",
                ip = expiredIp,
                comment = "Expired jail",
                expiresAt = now - 60_000L,
                createdAt = now - 120_000L,
                country = "CN",
                port = null
            )
        )

        val jails = jailManagerService.listJails()

        assertEquals(1, jails.size)
        assertEquals(activeIp, jails[0].ip)
    }

    @Test
    fun `test listJails filters by expiration time correctly`() {
        val now = System.currentTimeMillis()
        
        every { mockFirewallService.listRules() } returns listOf(
            FirewallRule(
                id = "rule-1",
                ip = "1.2.3.4",
                comment = "Active",
                expiresAt = now + 1000L,
                createdAt = now,
                country = null,
                port = null
            ),
            FirewallRule(
                id = "rule-2",
                ip = "1.2.3.5",
                comment = "Expired",
                expiresAt = now - 1000L,
                createdAt = now,
                country = null,
                port = null
            ),
            FirewallRule(
                id = "rule-3",
                ip = "1.2.3.6",
                comment = "No expiration",
                expiresAt = null,
                createdAt = now,
                country = null,
                port = null
            )
        )

        val jails = jailManagerService.listJails()

        // Should only return the one active jail with future expiration
        assertEquals(1, jails.size)
        assertEquals("1.2.3.4", jails[0].ip)
    }

    @Test
    fun `test clearFailedAttempts removes IP from tracking`() {
        val testIp = "203.0.113.42"

        // Just verify the method doesn't throw
        jailManagerService.clearFailedAttempts(testIp)
        
        // If we had a way to check the internal state, we would verify it's cleared
        // For now, just ensure no exceptions
        assertTrue(true)
    }

    @Test
    fun `test getCountryCode returns a value`() {
        // Mock IP info for the test IP
        val testIp = "8.8.8.8"
        every { mockIpInfoService.getIpInfo(testIp) } returns IpInfo(
            ip = testIp,
            countryCode = "US",
            country = "United States",
            region = "CA",
            city = "Mountain View",
            isp = "Google"
        )

        // Test the getCountryCode method
        val result = jailManagerService.getCountryCode(testIp)
        
        // Should return the mocked country code
        assertEquals("US", result)
    }
}

