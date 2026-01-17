package com.umeshsolanki.dockermanager.utils

import org.junit.Test
import java.math.BigInteger
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class IpUtilsTest {

    @Test
    fun testIpToBigInteger() {
        val ip = "192.168.1.1"
        val bigInt = IpUtils.ipToBigInteger(ip)
        assertNotNull(bigInt)
        // 192.168.1.1 = 192*2^24 + 168*2^16 + 1*2^8 + 1
        // = 3221225472 + 11010048 + 256 + 1 = 3232235777
        assertEquals(BigInteger("3232235777"), bigInt)
    }

    @Test
    fun testCidrToRange_IPv4_24() {
        // 192.168.1.0/24 -> 192.168.1.0 to 192.168.1.255
        val cidr = "192.168.1.0/24"
        val range = IpUtils.cidrToRange(cidr)
        assertNotNull(range)
        
        val start = range.first
        val end = range.second
        
        assertEquals(BigInteger("3232235776"), start) // 192.168.1.0
        assertEquals(BigInteger("3232236031"), end)   // 192.168.1.255
        
        // Check difference
        assertEquals(BigInteger("255"), end.subtract(start))
    }
    
    @Test
    fun testCidrToRange_IPv4_32() {
        // Single IP
        val cidr = "10.0.0.1/32"
        val range = IpUtils.cidrToRange(cidr)
        assertNotNull(range)
        assertEquals(range.first, range.second)
    }
    
    @Test
    fun testCidrToRange_IPv6() {
        // 2001:db8::/32
        // Just verify it doesn't crash and returns non-null
        val cidr = "2001:db8::/32"
        val range = IpUtils.cidrToRange(cidr)
        assertNotNull(range)
        assertTrue(range.second > range.first)
    }
}
