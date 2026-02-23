package com.umeshsolanki.dockermanager.utils

import java.math.BigInteger
import java.net.InetAddress
import java.util.concurrent.ConcurrentHashMap

object IpUtils {
    private const val IP_CACHE_MAX_SIZE = 4096
    private val ipCache = ConcurrentHashMap<String, BigInteger>(256)

    /**
     * Converts an IP address (v4 or v6) to a BigInteger for range comparison.
     * Results are cached to avoid repeated InetAddress.getByName() calls on hot paths.
     */
    fun ipToBigInteger(ipAddress: String): BigInteger? {
        ipCache[ipAddress]?.let { return it }
        return try {
            val address = InetAddress.getByName(ipAddress)
            val result = BigInteger(1, address.address)
            if (ipCache.size < IP_CACHE_MAX_SIZE) {
                ipCache[ipAddress] = result
            }
            result
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Returns true if [ip] falls within [cidr] (e.g. "10.0.0.0/8").
     */
    fun isIpInCidr(ip: String, cidr: String): Boolean {
        val ipVal = ipToBigInteger(ip) ?: return false
        val range = cidrToRange(cidr) ?: return false
        return ipVal in range.first..range.second
    }

    /**
     * Returns true if [ip] falls within any of the given [cidrs].
     */
    fun isIpInAnyCidr(ip: String, cidrs: List<String>): Boolean {
        if (cidrs.isEmpty()) return false
        val ipVal = ipToBigInteger(ip) ?: return false
        return cidrs.any { cidr ->
            val range = cidrToRange(cidr) ?: return@any false
            ipVal in range.first..range.second
        }
    }

    fun cidrToRange(cidr: String): Pair<BigInteger, BigInteger>? {
        return try {
            val parts = cidr.split("/")
            val ipStr = parts[0]
            val prefix = parts[1].toInt()
            
            val address = InetAddress.getByName(ipStr)
            val bytes = address.address
            val bitCount = bytes.size * 8
            
            val startIp = BigInteger(1, bytes)
            
            // Mask for the number of bits in the host portion
            val hostBits = bitCount - prefix
            val mask = BigInteger.ONE.shiftLeft(hostBits).subtract(BigInteger.ONE)
            
            // End IP is Start IP with all host bits set to 1
            // We need to be careful with the network bits. 
            // Better way: NetMask = (All 1s) << hostBits
            val allOnes = BigInteger.ONE.shiftLeft(bitCount).subtract(BigInteger.ONE)
            val netMask = allOnes.shiftLeft(hostBits).and(allOnes).not().and(allOnes) // This logic is tricky
            
            // Simplified:
            val start = startIp.shiftRight(hostBits).shiftLeft(hostBits)
            val end = start.or(mask)
            
            start to end
        } catch (e: Exception) {
            null
        }
    }
}
