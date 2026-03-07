package com.umeshsolanki.ucpanel.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.roundToInt
import com.umeshsolanki.ucpanel.BatteryStatus
import com.umeshsolanki.ucpanel.DockerContainer
import com.umeshsolanki.ucpanel.DockerImage
import com.umeshsolanki.ucpanel.StorageInfo
import com.umeshsolanki.ucpanel.api.DockerApiService
import com.umeshsolanki.ucpanel.api.SystemApiService

@Composable
fun DashboardScreen() {
    var containers by remember { mutableStateOf<List<DockerContainer>>(emptyList()) }
    var images by remember { mutableStateOf<List<DockerImage>>(emptyList()) }
    var storage by remember { mutableStateOf<StorageInfo?>(null) }
    var battery by remember { mutableStateOf<BatteryStatus?>(null) }
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        isLoading = true
        containers = DockerApiService.listContainers()
        images = DockerApiService.listImages()
        storage = SystemApiService.getStorageInfo()
        battery = SystemApiService.getBatteryStatus()
        isLoading = false
    }

    if (isLoading) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    val runningContainers = containers.count { it.state.contains("running", true) }
    val stoppedContainers = containers.size - runningContainers

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text("Overview", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        }

        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                StatCard(
                    modifier = Modifier.weight(1f),
                    title = "Running",
                    value = runningContainers.toString(),
                    icon = Icons.Default.PlayArrow,
                    color = Color(0xFF4CAF50)
                )
                StatCard(
                    modifier = Modifier.weight(1f),
                    title = "Stopped",
                    value = stoppedContainers.toString(),
                    icon = Icons.Default.Stop,
                    color = Color(0xFFF44336)
                )
            }
        }

        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                StatCard(
                    modifier = Modifier.weight(1f),
                    title = "Total Containers",
                    value = containers.size.toString(),
                    icon = Icons.Default.Layers,
                    color = MaterialTheme.colorScheme.primary
                )
                StatCard(
                    modifier = Modifier.weight(1f),
                    title = "Total Images",
                    value = images.size.toString(),
                    icon = Icons.Default.Image,
                    color = MaterialTheme.colorScheme.secondary
                )
            }
        }

        storage?.let { s ->
            item {
                Text("System Storage", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
            }
            item {
                StorageCard(storage = s)
            }
        }

        battery?.let { b ->
            if (b.percentage >= 0) {
                item {
                    Text("Battery", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
                }
                item {
                    BatteryCard(battery = b)
                }
            }
        }
        
        item {
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
fun StatCard(
    modifier: Modifier = Modifier,
    title: String,
    value: String,
    icon: ImageVector,
    color: Color
) {
    ElevatedCard(modifier = modifier) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(24.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(modifier = Modifier.height(12.dp))
            Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = color)
        }
    }
}

@Composable
fun StorageCard(storage: StorageInfo) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Disk Usage", style = MaterialTheme.typography.titleMedium)
                Text("${formatSize(storage.used)} / ${formatSize(storage.total)}")
            }
            val usageRatio = if (storage.total > 0) (storage.used.toFloat() / storage.total.toFloat()) else 0f
            LinearProgressIndicator(
                progress = { usageRatio },
                modifier = Modifier.fillMaxWidth().height(8.dp),
                color = if (usageRatio > 0.85f) Color.Red else MaterialTheme.colorScheme.primary,
            )
            
            storage.dockerUsage?.let { docker ->
                Spacer(modifier = Modifier.height(8.dp))
                HorizontalDivider()
                Spacer(modifier = Modifier.height(8.dp))
                Text("Docker Usage", style = MaterialTheme.typography.titleSmall)
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Images", style = MaterialTheme.typography.bodyMedium)
                    Text(formatSize(docker.imagesSize), style = MaterialTheme.typography.bodyMedium)
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Containers", style = MaterialTheme.typography.bodyMedium)
                    Text(formatSize(docker.containersSize), style = MaterialTheme.typography.bodyMedium)
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Volumes", style = MaterialTheme.typography.bodyMedium)
                    Text(formatSize(docker.volumesSize), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

@Composable
fun BatteryCard(battery: BatteryStatus) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(16.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val icon = when {
                    battery.isCharging -> Icons.Default.BatteryChargingFull
                    battery.percentage > 80 -> Icons.Default.BatteryFull
                    battery.percentage > 20 -> Icons.Default.BatteryStd
                    else -> Icons.Default.BatteryAlert
                }
                val color = if (battery.isCharging) Color.Green else MaterialTheme.colorScheme.onSurface
                Icon(icon, contentDescription = "Battery", tint = color, modifier = Modifier.size(32.dp))
                Spacer(modifier = Modifier.width(16.dp))
                Column {
                    Text("${battery.percentage}%", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text(battery.source, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Text(
                if (battery.isCharging) "Charging" else "Discharging",
                style = MaterialTheme.typography.labelLarge,
                color = if (battery.isCharging) Color.Green else Color.Gray
            )
        }
    }
}

fun formatSize(bytes: Long): String {
    if (bytes < 1024) return "$bytes B"
    val exp = (ln(bytes.toDouble()) / ln(1024.0)).toInt()
    val pre = "KMGTPE"[exp - 1]
    val value = bytes / 1024.0.pow(exp.toDouble())
    return "${(value * 10.0).roundToInt() / 10.0} ${pre}B"
}
