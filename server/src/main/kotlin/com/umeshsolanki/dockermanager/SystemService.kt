package com.umeshsolanki.dockermanager

import java.util.concurrent.TimeUnit

object SystemService {
    private val osName = System.getProperty("os.name").lowercase()

    fun getBatteryStatus(): BatteryStatus {
        return when {
            osName.contains("mac") -> getMacBattery()
            osName.contains("linux") -> getLinuxBattery()
            osName.contains("win") -> getWindowsBattery()
            else -> BatteryStatus(-1, false, "Unsupported OS ($osName)")
        }
    }

    private fun getMacBattery(): BatteryStatus {
        return try {
            val output = executeCommand("pmset -g batt")
            parseMacBattery(output)
        } catch (e: Exception) {
            BatteryStatus(0, false, "Error (Mac)")
        }
    }

    private fun getLinuxBattery(): BatteryStatus {
        return try {
            // Ubuntu/Debian standard paths
            val capacity = executeCommand("cat /sys/class/power_supply/BAT0/capacity").trim().toIntOrNull() ?: 0
            val status = executeCommand("cat /sys/class/power_supply/BAT0/status").trim().lowercase()
            val isCharging = status == "charging"
            val source = if (status == "discharging") "Battery" else "AC Power"
            
            BatteryStatus(capacity, isCharging, source)
        } catch (e: Exception) {
            BatteryStatus(0, false, "Error (Linux)")
        }
    }

    private fun getWindowsBattery(): BatteryStatus {
        return try {
            val percentageOutput = executeCommand("wmic path Win32_Battery get EstimatedChargeRemaining")
            val percentage = percentageOutput.lines().getOrNull(1)?.trim()?.toIntOrNull() ?: 0
            
            val statusOutput = executeCommand("wmic path Win32_Battery get BatteryStatus")
            val statusCode = statusOutput.lines().getOrNull(1)?.trim()?.toIntOrNull() ?: 0
            // 1 = Discharging, 2 = AC Power, 3 = Fully Charged, 6 = Charging
            val isCharging = statusCode == 6
            val source = if (statusCode == 1) "Battery" else "AC Power"
            
            BatteryStatus(percentage, isCharging, source)
        } catch (e: Exception) {
            BatteryStatus(0, false, "Error (Windows)")
        }
    }

    private fun executeCommand(command: String): String {
        val process = Runtime.getRuntime().exec(command)
        process.waitFor(2, TimeUnit.SECONDS)
        return process.inputStream.bufferedReader().readText()
    }

    private fun parseMacBattery(output: String): BatteryStatus {
        val lines = output.lines()
        val source = if (lines.getOrNull(0)?.contains("Battery Power") == true) "Battery" else "AC Power"
        val batteryLine = lines.find { it.contains("InternalBattery") } ?: return BatteryStatus(0, false, "Not Found")
        
        val percentage = batteryLine.substringAfter("\t")
            .substringBefore("%")
            .trim()
            .toIntOrNull() ?: 0
            
        val isCharging = batteryLine.contains("charging") && !batteryLine.contains("discharging")
        return BatteryStatus(percentage, isCharging, source)
    }
}
