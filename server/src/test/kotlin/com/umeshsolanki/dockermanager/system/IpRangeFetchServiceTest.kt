package com.umeshsolanki.dockermanager.system

import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class IpRangeFetchServiceTest {
    
    // Test parsing logic without mocking HTTP (decoupled)

    @Test
    fun testParseAwsJson() = kotlinx.coroutines.runBlocking {
        val json = """
            {
              "syncToken": "123",
              "createDate": "2024-01-01-00-00-00",
              "prefixes": [
                {
                  "ip_prefix": "3.5.140.0/22",
                  "region": "ap-northeast-2",
                  "service": "AMAZON",
                  "network_border_group": "ap-northeast-2"
                }
              ],
              "ipv6_prefixes": [
                {
                  "ipv6_prefix": "2600:1f18:472e:8e00::/56",
                  "region": "us-west-2",
                  "service": "AMAZON",
                  "network_border_group": "us-west-2"
                }
              ]
            }
        """.trimIndent()
        
        val result = IpRangeFetchService.parseAwsJson(json)
        
        assertEquals(2, result.size)
        assertTrue(result.contains("3.5.140.0/22"))
        assertTrue(result.contains("2600:1f18:472e:8e00::/56"))
    }
    
    @Test
    fun testParseGoogleJson() = kotlinx.coroutines.runBlocking {
        val json = """
            {
              "syncToken": "123",
              "creationTime": "2024-01-01T00:00:00",
              "prefixes": [
                {
                  "ipv4Prefix": "34.64.0.0/20",
                  "service": "Google Cloud",
                  "scope": "asia-northeast3"
                },
                {
                  "ipv6Prefix": "2600:1900::/28"
                }
              ]
            }
        """.trimIndent()
        
        val result = IpRangeFetchService.parseGoogleJson(json)
        
        assertEquals(2, result.size)
        assertTrue(result.contains("34.64.0.0/20"))
        assertTrue(result.contains("2600:1900::/28"))
    }
}
