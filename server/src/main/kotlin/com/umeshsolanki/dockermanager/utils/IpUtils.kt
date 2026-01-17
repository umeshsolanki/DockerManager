package com.umeshsolanki.dockermanager.utils

import java.math.BigInteger
import java.net.InetAddress

object IpUtils {
    /**
     * Converts an IP address (v4 or v6) to a BigInteger for range comparison.
     */
    fun ipToBigInteger(ipAddress: String): BigInteger? {
        return try {
            val address = InetAddress.getByName(ipAddress)
            val bytes = address.address
            BigInteger(1, bytes)
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Parse CIDR notation (e.g., "192.168.1.0/24") into a pair of BigInteger (start, end)
     */
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
