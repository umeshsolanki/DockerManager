package com.umeshsolanki.ucpanel.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.umeshsolanki.ucpanel.ProxyStats
import com.umeshsolanki.ucpanel.api.AnalyticsApiService
import kotlinx.coroutines.launch

@Composable
fun AnalyticsScreen() {
    var stats by remember { mutableStateOf<ProxyStats?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()
    
    LaunchedEffect(Unit) {
        isLoading = true
        stats = AnalyticsApiService.getStats()
        isLoading = false
    }

    if (isLoading) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    val s = stats
    if (s == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("No analytics data available", style = MaterialTheme.typography.bodyLarge)
        }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text("Overall Traffic", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        }

        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                AnalyticsCard(
                    title = "Total Hits",
                    value = s.totalHits.toString(),
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.weight(1f)
                )
                AnalyticsCard(
                    title = "Security Hits",
                    value = s.securityHits.toString(),
                    color = Color.Red,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                AnalyticsCard(
                    title = "WebSockets",
                    value = s.websocketConnections.toString(),
                    color = MaterialTheme.colorScheme.tertiary,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        if (s.topPaths.isNotEmpty()) {
            item {
                Text("Top Paths", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            }
            items(s.topPaths.take(5)) { pathHit ->
                HitRow(label = pathHit.path, count = pathHit.hits)
            }
        }

        if (s.topIpsWithErrors.isNotEmpty()) {
            item {
                Text("Top IPs By Errors", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.error)
            }
            items(s.topIpsWithErrors.take(5)) {
                HitRow(label = it.label, count = it.count, color = MaterialTheme.colorScheme.error)
            }
        }

        if (s.recentHits.isNotEmpty()) {
            item {
                Text("Recent Requests", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            }
            items(s.recentHits.take(10)) { hit ->
                ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(hit.method + " " + hit.path, fontWeight = FontWeight.SemiBold)
                            Text(hit.status.toString(), color = if (hit.status >= 400) Color.Red else Color.Green, fontWeight = FontWeight.Bold)
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(hit.ip, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
fun AnalyticsCard(title: String, value: String, color: Color, modifier: Modifier = Modifier) {
    ElevatedCard(modifier = modifier) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(modifier = Modifier.height(12.dp))
            Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = color)
        }
    }
}

@Composable
fun HitRow(label: String, count: Long, color: Color = MaterialTheme.colorScheme.onSurface) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(12.dp).fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(label, color = color, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
            Text(count.toString(), fontWeight = FontWeight.Bold)
        }
    }
}
