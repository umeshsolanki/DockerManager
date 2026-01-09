package com.umeshsolanki.dockermanager.proxy

import java.net.InetAddress

object IpFilterUtils {
    /**
     * Check if an IP address is a local/internal IP address.
     * Includes:
     * - 127.0.0.0/8 (localhost)
     * - 10.0.0.0/8 (private)
     * - 172.16.0.0/12 (private)
     * - 192.168.0.0/16 (private)
     * - 169.254.0.0/16 (link-local)
     * - IPv6 localhost (::1)
     * - IPv6 link-local (fe80::/10)
     */
    fun isLocalIp(ip: String): Boolean {
        if (ip.isEmpty()) return false
        
        return try {
            // IPv6 localhost
            if (ip == "::1" || ip.startsWith("::ffff:")) {
                return true
            }
            
            // IPv6 link-local
            if (ip.startsWith("fe80:")) {
                return true
            }
            
            // Parse IPv4 address
            val address = InetAddress.getByName(ip)
            
            when {
                address.isLoopbackAddress -> true
                address.isLinkLocalAddress -> true
                address.isSiteLocalAddress -> true
                else -> {
                    // Check specific private ranges
                    val parts = ip.split(".").mapNotNull { it.toIntOrNull() }
                    if (parts.size == 4) {
                        when {
                            // 127.0.0.0/8
                            parts[0] == 127 -> true
                            // 10.0.0.0/8
                            parts[0] == 10 -> true
                            // 172.16.0.0/12
                            parts[0] == 172 && parts[1] in 16..31 -> true
                            // 192.168.0.0/16
                            parts[0] == 192 && parts[1] == 168 -> true
                            // 169.254.0.0/16
                            parts[0] == 169 && parts[1] == 254 -> true
                            else -> false
                        }
                    } else {
                        false
                    }
                }
            }
        } catch (e: Exception) {
            // If we can't parse it, don't filter it
            false
        }
    }
}



