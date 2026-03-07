package com.umeshsolanki.ucpanel.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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

    var selectedHost by remember { mutableStateOf<String?>(null) }
    
    if (selectedHost != null) {
        val hostStats = s.hostwiseStats[selectedHost]
        if (hostStats != null) {
            HostDetailedStatsView(hostName = selectedHost!!, stats = hostStats, onBack = { selectedHost = null })
            return
        } else {
            selectedHost = null
        }
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

        if (s.hitsOverTime.isNotEmpty()) {
            item {
                Text("Traffic Trend", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            }
            item {
                HitsTrendChart(s.hitsOverTime)
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

        if (s.hitsByDomain.isNotEmpty()) {
            item {
                Text("Traffic By Domain", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            }
            val sortedDomains = s.hitsByDomain.entries.sortedByDescending { it.value }.take(10)
            items(sortedDomains) { entry ->
                HitRow(
                    label = entry.key, 
                    count = entry.value, 
                    onClick = if (s.hostwiseStats.containsKey(entry.key)) { { selectedHost = entry.key } } else null
                )
            }
        }

        if (s.topIps.isNotEmpty()) {
            item {
                Text("Top IPs By Traffic", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            }
            items(s.topIps.take(5)) {
                HitRow(label = it.label, count = it.count)
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

        if (s.hitsByCountry.isNotEmpty()) {
            item {
                Text("Traffic By Country", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            }
            val sortedCountries = s.hitsByCountry.entries.sortedByDescending { it.value }.take(5)
            items(sortedCountries) { entry ->
                HitRow(label = entry.key, count = entry.value)
            }
        }

        if (s.hitsByAsn.isNotEmpty()) {
            item {
                Text("Traffic By ASN", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            }
            val sortedAsns = s.hitsByAsn.entries.sortedByDescending { it.value }.take(5)
            items(sortedAsns) { entry ->
                HitRow(label = entry.key, count = entry.value)
            }
        }

        if (s.hitsByProvider.isNotEmpty()) {
            item {
                Text("Traffic By Provider", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            }
            val sortedProviders = s.hitsByProvider.entries.sortedByDescending { it.value }.take(5)
            items(sortedProviders) { entry ->
                HitRow(label = entry.key, count = entry.value)
            }
        }

        if (s.topUserAgents.isNotEmpty()) {
            item {
                Text("Top User Agents", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            }
            items(s.topUserAgents.take(5)) {
                HitRow(label = it.label, count = it.count)
            }
        }

        if (s.topReferers.isNotEmpty()) {
            item {
                Text("Top Referers", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            }
            items(s.topReferers.take(5)) {
                HitRow(label = it.label, count = it.count)
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
fun HitRow(label: String, count: Long, color: Color = MaterialTheme.colorScheme.onSurface, onClick: (() -> Unit)? = null) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth().let {
            if (onClick != null) it.clickable(onClick = onClick) else it
        }
    ) {
        Row(
            modifier = Modifier.padding(12.dp).fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(label, color = color, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
            Text(count.toString(), fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun HitsTrendChart(hitsOverTime: Map<String, Long>) {
    val barColor = MaterialTheme.colorScheme.primary
    val axisColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
    val maxHits = hitsOverTime.values.maxOrNull()?.coerceAtLeast(1) ?: 1
    val sortedEntries = hitsOverTime.entries.sortedBy { it.key }

    ElevatedCard(modifier = Modifier.fillMaxWidth().height(200.dp)) {
        Box(modifier = Modifier.fillMaxSize().padding(16.dp)) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val width = size.width
                val height = size.height
                
                drawLine(
                    color = axisColor,
                    start = Offset(0f, height),
                    end = Offset(width, height),
                    strokeWidth = 2f
                )
                
                val barCount = sortedEntries.size
                if (barCount > 0) {
                    val barWidth = (width / barCount) * 0.6f
                    val spacing = (width / barCount) * 0.4f
                    
                    sortedEntries.forEachIndexed { index, entry ->
                        val valueRatio = entry.value.toFloat() / maxHits.toFloat()
                        val barHeight = height * valueRatio
                        val x = index * (barWidth + spacing) + spacing / 2
                        val y = height - barHeight
                        
                        drawRect(
                            color = barColor,
                            topLeft = Offset(x, y),
                            size = Size(barWidth, barHeight)
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun HostDetailedStatsView(hostName: String, stats: com.umeshsolanki.ucpanel.DetailedHostStats, onBack: () -> Unit) {
    var searchQuery by remember { mutableStateOf("") }
    
    Column(modifier = Modifier.fillMaxSize()) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(Icons.Default.ArrowBack, contentDescription = "Back")
            }
            Spacer(modifier = Modifier.width(8.dp))
            Text(hostName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
        }
        
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            placeholder = { Text("Search paths or IPs...") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            trailingIcon = {
                if (searchQuery.isNotEmpty()) {
                    IconButton(onClick = { searchQuery = "" }) {
                        Icon(Icons.Default.Close, contentDescription = null)
                    }
                }
            },
            singleLine = true,
            shape = RoundedCornerShape(12.dp)
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        val filteredPaths = stats.topPaths.filter { it.path.contains(searchQuery, ignoreCase = true) }
        val filteredIps = stats.topIps.filter { it.label.contains(searchQuery, ignoreCase = true) }

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
            contentPadding = PaddingValues(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    AnalyticsCard(
                        title = "Total Hits",
                        value = stats.totalHits.toString(),
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            if (stats.hitsByStatus.isNotEmpty()) {
                item {
                    Text("Response Distribution", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
                }
                item {
                    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            // Stacked Bar
                            Row(modifier = Modifier.fillMaxWidth().height(24.dp).clip(RoundedCornerShape(12.dp))) {
                                val total = stats.totalHits.toFloat().coerceAtLeast(1f)
                                stats.hitsByStatus.entries.sortedBy { it.key }.forEach { entry ->
                                    val statusColor = when (entry.key) {
                                        in 200..299 -> Color.Green
                                        in 300..399 -> Color(0xFF03A9F4)
                                        in 400..499 -> Color(0xFFFF9800)
                                        in 500..599 -> Color.Red
                                        else -> MaterialTheme.colorScheme.onSurface
                                    }
                                    val weight = (entry.value / total).coerceAtLeast(0.01f)
                                    Box(modifier = Modifier.weight(weight).fillMaxHeight().background(statusColor.copy(alpha = 0.8f)))
                                }
                            }
                            
                            val maxVal = stats.hitsByStatus.values.maxOrNull()?.coerceAtLeast(1) ?: 1
                            stats.hitsByStatus.entries.sortedByDescending { it.value }.forEach { entry ->
                                val statusColor = when (entry.key) {
                                    in 200..299 -> Color.Green
                                    in 300..399 -> Color(0xFF03A9F4)
                                    in 400..499 -> Color(0xFFFF9800)
                                    in 500..599 -> Color.Red
                                    else -> MaterialTheme.colorScheme.onSurface
                                }
                                
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text(entry.key.toString(), color = statusColor, fontWeight = FontWeight.Black, fontFamily = FontFamily.Monospace)
                                        Text(entry.value.toString(), fontWeight = FontWeight.Bold)
                                    }
                                    val ratio = entry.value.toFloat() / maxVal.toFloat()
                                    Box(modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(MaterialTheme.colorScheme.surface)) {
                                        Box(modifier = Modifier.fillMaxHeight().fillMaxWidth(ratio).clip(RoundedCornerShape(3.dp)).background(statusColor.copy(alpha = 0.6f)))
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            if (filteredPaths.isNotEmpty()) {
                item { Text("Top Paths", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp)) }
                items(filteredPaths.take(50)) { pathHit ->
                    HitRow(label = pathHit.path, count = pathHit.hits)
                }
            }
            
            if (filteredIps.isNotEmpty()) {
                item { Text("Top Origin IPs", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp)) }
                items(filteredIps.take(50)) { hit ->
                    HitRow(label = hit.label, count = hit.count)
                }
            }
            
            if (stats.topMethods.isNotEmpty() && searchQuery.isEmpty()) {
                item { Text("Top Methods", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp)) }
                items(stats.topMethods.take(10)) { hit ->
                    HitRow(label = hit.label, count = hit.count)
                }
            }
        }
    }
}
