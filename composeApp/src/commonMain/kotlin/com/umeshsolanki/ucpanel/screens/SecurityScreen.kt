package com.umeshsolanki.ucpanel.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.umeshsolanki.ucpanel.*
import com.umeshsolanki.ucpanel.api.SecurityApiService
import kotlinx.coroutines.launch
import io.ktor.util.date.getTimeMillis

@Composable
fun SecurityScreen() {
    var rules by remember { mutableStateOf<List<FirewallRule>>(emptyList()) }
    var cidrRules by remember { mutableStateOf<List<CidrRule>>(emptyList()) }
    var reputations by remember { mutableStateOf<List<IpReputation>>(emptyList()) }
    var mirrors by remember { mutableStateOf<List<ProxyHit>>(emptyList()) }
    var proxyStats by remember { mutableStateOf<ProxyStats?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()
    var selectedTab by remember { mutableStateOf(0) }

    var showAddFirewallDialog by remember { mutableStateOf(false) }
    var showAddCidrDialog by remember { mutableStateOf(false) }
    var selectedRule by remember { mutableStateOf<FirewallRule?>(null) }
    var selectedReputation by remember { mutableStateOf<IpReputation?>(null) }

    fun refresh() {
        scope.launch {
            isLoading = true
            rules = SecurityApiService.listRules()
            cidrRules = SecurityApiService.listCidrRules()
            reputations = SecurityApiService.listIpReputations(50)
                .sortedByDescending { it.blockedTimes }
            mirrors = SecurityApiService.getSecurityMirrors(20)
            proxyStats = SecurityApiService.getProxyStats()
            isLoading = false
        }
    }

    LaunchedEffect(Unit) { refresh() }

    val tabs = listOf("Overview", "Firewall", "CIDR", "Reputation", "Mirrors")

    Column(modifier = Modifier.fillMaxSize()) {
        ScrollableTabRow(
            selectedTabIndex = selectedTab,
            edgePadding = 8.dp,
            divider = {}
        ) {
            tabs.forEachIndexed { index, title ->
                Tab(
                    selected = selectedTab == index,
                    onClick = { selectedTab = index },
                    text = { Text(title, fontSize = 13.sp, fontWeight = if (selectedTab == index) FontWeight.Bold else FontWeight.Normal) }
                )
            }
        }

        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            if (isLoading) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            } else {
                when (selectedTab) {
                    0 -> OverviewTab(
                        rules = rules,
                        reputations = reputations,
                        mirrors = mirrors,
                        proxyStats = proxyStats,
                        onNavigate = { selectedTab = it }
                    )
                    1 -> FirewallList(
                        rules = rules,
                        onDelete = { id -> scope.launch { SecurityApiService.unblockIP(id); refresh() } },
                        onAdd = { showAddFirewallDialog = true },
                        onTap = { selectedRule = it }
                    )
                    2 -> CidrList(
                        cidrRules,
                        onDelete = { id -> scope.launch { SecurityApiService.removeCidrRule(id); refresh() } },
                        onAdd = { showAddCidrDialog = true }
                    )
                    3 -> ReputationList(
                        reputations = reputations,
                        onTap = { selectedReputation = it },
                        onRefresh = { refresh() }
                    )
                    4 -> MirrorsList(mirrors = mirrors, onRefresh = { refresh() })
                }
            }
        }
    }

    if (showAddFirewallDialog) {
        AddFirewallDialog(
            onDismiss = { showAddFirewallDialog = false },
            onConfirm = { ip, comment ->
                scope.launch {
                    SecurityApiService.blockIP(BlockIPRequest(ip = ip, comment = comment))
                    showAddFirewallDialog = false
                    refresh()
                }
            }
        )
    }

    if (showAddCidrDialog) {
        AddCidrDialog(
            onDismiss = { showAddCidrDialog = false },
            onConfirm = { cidr, comment, type ->
                scope.launch {
                    SecurityApiService.addCidrRule(CidrRule(cidr = cidr, type = type, comment = comment))
                    showAddCidrDialog = false
                    refresh()
                }
            }
        )
    }

    selectedRule?.let { rule ->
        RuleDetailDialog(rule = rule, onDismiss = { selectedRule = null })
    }

    selectedReputation?.let { rep ->
        ReputationDetailDialog(reputation = rep, onDismiss = { selectedReputation = null })
    }
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

@Composable
fun OverviewTab(
    rules: List<FirewallRule>,
    reputations: List<IpReputation>,
    mirrors: List<ProxyHit>,
    proxyStats: ProxyStats?,
    onNavigate: (Int) -> Unit
) {
    val now = getTimeMillis()
    val activeJails = rules.filter { it.expiresAt != null && it.expiresAt!! > now }
    val permanentBlocks = rules.filter { it.expiresAt == null }
    val proxyJails = activeJails.filter { it.comment?.lowercase()?.startsWith("proxy") == true }
    val totalBlocked = reputations.sumOf { it.blockedTimes }

    val errorHits = proxyStats?.hitsByStatus
        ?.filter { (status, _) -> status >= 400 }
        ?.values?.sum() ?: 0L

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = PaddingValues(vertical = 16.dp)
    ) {
        // Stat Cards
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                StatChip("Blocks", rules.size.toString(), Color(0xFF6366F1), Modifier.weight(1f)) { onNavigate(1) }
                StatChip("Jails", activeJails.size.toString(), Color(0xFFEF4444), Modifier.weight(1f)) { onNavigate(1) }
                StatChip("Tracked", reputations.size.toString(), Color(0xFF8B5CF6), Modifier.weight(1f)) { onNavigate(3) }
                StatChip("4xx/5xx", errorHits.toString(), Color(0xFFF59E0B), Modifier.weight(1f)) {}
            }
        }

        // Top Blocked IPs
        item {
            SectionHeader("Top Blocked IPs", "View All") { onNavigate(3) }
        }
        if (reputations.isEmpty()) {
            item { EmptyHint("No reputation data yet") }
        } else {
            val topReps = reputations.take(5)
            val maxBlocked = topReps.firstOrNull()?.blockedTimes?.coerceAtLeast(1) ?: 1
            items(topReps) { rep ->
                ReputationBarRow(rep, maxBlocked)
            }
        }

        // Active Jails
        item {
            SectionHeader("Active Jails (${activeJails.size})", "Firewall") { onNavigate(1) }
        }
        if (activeJails.isEmpty()) {
            item { EmptyHint("No active jails") }
        } else {
            items(activeJails.take(5)) { jail ->
                JailRow(jail, now)
            }
        }

        // Recent Security Mirrors
        item {
            SectionHeader("Recent Mirrors (${mirrors.size})", "View All") { onNavigate(4) }
        }
        if (mirrors.isEmpty()) {
            item { EmptyHint("No mirrored traffic") }
        } else {
            items(mirrors.take(5)) { hit ->
                MirrorRow(hit)
            }
        }

        // By Country
        val countryMap = mutableMapOf<String, Int>()
        reputations.forEach { r -> r.country?.let { countryMap[it] = (countryMap[it] ?: 0) + r.blockedTimes } }
        val topCountries = countryMap.entries.sortedByDescending { it.value }.take(6)

        if (topCountries.isNotEmpty()) {
            item { SectionHeader("By Country", null) {} }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    val maxC = topCountries.first().value.coerceAtLeast(1)
                    topCountries.forEach { (country, count) ->
                        CountryBarRow(country, count, maxC)
                    }
                }
            }
        }

        // ASN Breakdown
        val asnFromReps = reputations
            .filter { it.asn != null }
            .groupBy { it.asn!! }
            .mapValues { (_, reps) -> reps.sumOf { it.blockedTimes }.toLong() }
            .entries.sortedByDescending { it.value }
            .take(6)
        val asnFromProxy = proxyStats?.hitsByAsn
            ?.entries?.sortedByDescending { it.value }
            ?.take(6) ?: emptyList()
        val asnEntries = asnFromReps.ifEmpty { asnFromProxy }

        if (asnEntries.isNotEmpty()) {
            item { SectionHeader("Top ASNs", null) {} }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    val maxAsn = asnEntries.first().value.coerceAtLeast(1)
                    asnEntries.forEach { (asn, count) ->
                        AsnBarRow(asn, count, maxAsn)
                    }
                }
            }
        }

        // Top Violation Reasons
        val reasonMap = mutableMapOf<String, Int>()
        reputations.forEach { r -> r.reasons.forEach { reason -> reasonMap[reason] = (reasonMap[reason] ?: 0) + 1 } }
        val topReasons = reasonMap.entries.sortedByDescending { it.value }.take(5)

        if (topReasons.isNotEmpty()) {
            item { SectionHeader("Top Violation Reasons", null) {} }
            items(topReasons) { (reason, count) ->
                ReasonRow(reason, count)
            }
        }

        // Error Status Breakdown
        if (proxyStats != null) {
            val errorStatuses = proxyStats.hitsByStatus
                .filter { (s, _) -> s >= 400 }
                .entries.sortedByDescending { it.value }
                .take(6)
            if (errorStatuses.isNotEmpty()) {
                item { SectionHeader("Error Codes", null) {} }
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        val maxVal = errorStatuses.first().value.coerceAtLeast(1)
                        errorStatuses.forEach { (status, count) ->
                            StatusBarRow(status, count, maxVal)
                        }
                    }
                }
            }
        }

        // Config Status
        item { SectionHeader("Config", null) {} }
        item { ConfigStatusCard(proxyStats, rules, activeJails) }
    }
}

// ─── Reusable UI Components ──────────────────────────────────────────────────

@Composable
fun StatChip(label: String, value: String, color: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Surface(
        modifier = modifier.clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        color = color.copy(alpha = 0.1f),
        border = ButtonDefaults.outlinedButtonBorder.copy(width = 1.dp)
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(value, fontSize = 22.sp, fontWeight = FontWeight.Black, color = color)
            Text(label, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = color.copy(alpha = 0.7f))
        }
    }
}

@Composable
fun SectionHeader(title: String, action: String?, onAction: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        if (action != null) {
            TextButton(onClick = onAction) {
                Text(action, fontSize = 11.sp)
            }
        }
    }
}

@Composable
fun EmptyHint(text: String) {
    Text(
        text,
        modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f),
        textAlign = androidx.compose.ui.text.style.TextAlign.Center
    )
}

@Composable
fun ReputationBarRow(rep: IpReputation, maxBlocked: Int) {
    val pct = (rep.blockedTimes.toFloat() / maxBlocked).coerceIn(0.05f, 1f)
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(rep.ip, fontFamily = FontFamily.Monospace, fontSize = 12.sp, modifier = Modifier.width(120.dp), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Box(modifier = Modifier.weight(1f).height(14.dp).clip(RoundedCornerShape(7.dp)).background(MaterialTheme.colorScheme.surface)) {
                Box(modifier = Modifier.fillMaxHeight().fillMaxWidth(pct).clip(RoundedCornerShape(7.dp)).background(Color(0xFFEF4444).copy(alpha = 0.5f)))
            }
            Text("${rep.blockedTimes}×", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFFEF4444))
            if (rep.country != null) {
                Text(rep.country!!, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
            }
        }
    }
}

@Composable
fun JailRow(jail: FirewallRule, now: Long) {
    val msLeft = (jail.expiresAt ?: 0) - now
    val minsLeft = (msLeft / 60_000).toInt().coerceAtLeast(0)
    val isProxy = jail.comment?.lowercase()?.startsWith("proxy") == true

    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(Icons.Default.Lock, contentDescription = null, tint = Color(0xFFEF4444), modifier = Modifier.size(16.dp))
            Text(jail.ip, fontFamily = FontFamily.Monospace, fontSize = 12.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Surface(
                shape = RoundedCornerShape(6.dp),
                color = if (isProxy) Color(0xFFF59E0B).copy(alpha = 0.15f) else Color(0xFFEAB308).copy(alpha = 0.15f)
            ) {
                Text(
                    if (isProxy) "Proxy" else "Login",
                    fontSize = 9.sp, fontWeight = FontWeight.Bold,
                    color = if (isProxy) Color(0xFFF59E0B) else Color(0xFFEAB308),
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                )
            }
            Text(if (minsLeft > 0) "${minsLeft}m" else "<1m", fontSize = 11.sp, fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
        }
    }
}

@Composable
fun MirrorRow(hit: ProxyHit) {
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFEC4899), modifier = Modifier.size(16.dp))
            Text(
                "${hit.method} ${hit.path}",
                fontFamily = FontFamily.Monospace, fontSize = 11.sp,
                modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis
            )
            Surface(shape = RoundedCornerShape(6.dp), color = Color(0xFFEC4899).copy(alpha = 0.15f)) {
                Text(hit.status.toString(), fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Color(0xFFEC4899), modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
            }
            Text(hit.ip, fontSize = 10.sp, fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f))
        }
    }
}

@Composable
fun CountryBarRow(country: String, count: Int, maxVal: Int) {
    val pct = (count.toFloat() / maxVal).coerceIn(0.02f, 1f)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(country, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(32.dp))
        Box(modifier = Modifier.weight(1f).height(12.dp).clip(RoundedCornerShape(6.dp)).background(MaterialTheme.colorScheme.surface)) {
            Box(modifier = Modifier.fillMaxHeight().fillMaxWidth(pct).clip(RoundedCornerShape(6.dp)).background(Color(0xFF3B82F6).copy(alpha = 0.5f)))
        }
        Text(count.toString(), fontFamily = FontFamily.Monospace, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f), modifier = Modifier.width(48.dp))
    }
}

@Composable
fun ReasonRow(reason: String, count: Int) {
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFF59E0B), modifier = Modifier.size(14.dp))
            Text(reason, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Text("$count", fontFamily = FontFamily.Monospace, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFFF59E0B))
        }
    }
}

@Composable
fun ConfigStatusCard(proxyStats: ProxyStats?, rules: List<FirewallRule>, activeJails: List<FirewallRule>) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                ConfigDot("Total Rules", rules.size.toString(), Color(0xFF6366F1))
                ConfigDot("Active Jails", activeJails.size.toString(), Color(0xFFEF4444))
                ConfigDot("Permanent", (rules.size - activeJails.size).toString(), Color(0xFF8B5CF6))
            }
            if (proxyStats != null) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.1f))
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    ConfigDot("Total Hits", proxyStats.totalHits.toString(), Color(0xFF22C55E))
                    ConfigDot("Security", proxyStats.securityHits.toString(), Color(0xFFEC4899))
                }
            }
        }
    }
}

@Composable
fun ConfigDot(label: String, value: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(color))
        Column {
            Text(value, fontSize = 13.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
            Text(label, fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
        }
    }
}

@Composable
fun AsnBarRow(asn: String, count: Long, maxVal: Long) {
    val pct = (count.toFloat() / maxVal).coerceIn(0.02f, 1f)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(asn, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.width(100.dp))
        Box(modifier = Modifier.weight(1f).height(12.dp).clip(RoundedCornerShape(6.dp)).background(MaterialTheme.colorScheme.surface)) {
            Box(modifier = Modifier.fillMaxHeight().fillMaxWidth(pct).clip(RoundedCornerShape(6.dp)).background(Color(0xFF06B6D4).copy(alpha = 0.5f)))
        }
        Text(count.toString(), fontFamily = FontFamily.Monospace, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f), modifier = Modifier.width(48.dp))
    }
}

@Composable
fun StatusBarRow(status: Int, count: Long, maxVal: Long) {
    val color = when {
        status == 403 -> Color(0xFFEF4444)
        status == 404 -> Color(0xFFF59E0B)
        status == 429 -> Color(0xFFF97316)
        status >= 500 -> Color(0xFFEC4899)
        else -> Color(0xFF6366F1)
    }
    val pct = (count.toFloat() / maxVal).coerceIn(0.02f, 1f)

    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(status.toString(), fontFamily = FontFamily.Monospace, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(32.dp))
        Box(modifier = Modifier.weight(1f).height(12.dp).clip(RoundedCornerShape(6.dp)).background(MaterialTheme.colorScheme.surface)) {
            Box(modifier = Modifier.fillMaxHeight().fillMaxWidth(pct).clip(RoundedCornerShape(6.dp)).background(color.copy(alpha = 0.5f)))
        }
        Text(count.toString(), fontFamily = FontFamily.Monospace, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f), modifier = Modifier.width(48.dp))
    }
}

// ─── Firewall List (enhanced with tap) ───────────────────────────────────────

@Composable
fun FirewallList(rules: List<FirewallRule>, onDelete: (String) -> Unit, onAdd: () -> Unit, onTap: (FirewallRule) -> Unit) {
    val now = getTimeMillis()

    Box(modifier = Modifier.fillMaxSize()) {
        LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(rules) { rule ->
                val isJail = rule.expiresAt != null && rule.expiresAt!! > now
                ElevatedCard(
                    modifier = Modifier.fillMaxWidth().clickable { onTap(rule) }
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp).fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(rule.ip, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.titleMedium)
                                if (isJail) {
                                    val minsLeft = ((rule.expiresAt!! - now) / 60_000).toInt()
                                    Surface(shape = RoundedCornerShape(6.dp), color = Color(0xFFEF4444).copy(alpha = 0.15f)) {
                                        Text("${minsLeft}m", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Color(0xFFEF4444), modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                                    }
                                }
                                if (rule.country != null) {
                                    Text(rule.country!!, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                                }
                            }
                            if (rule.comment != null) {
                                Text(rule.comment!!, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                        IconButton(onClick = { onDelete(rule.id) }) {
                            Icon(Icons.Default.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }
        FloatingActionButton(onClick = onAdd, modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp)) {
            Icon(Icons.Default.Add, contentDescription = "Add IP")
        }
    }
}

// ─── Reputation List ─────────────────────────────────────────────────────────

@Composable
fun CidrList(rules: List<CidrRule>, onDelete: (String) -> Unit, onAdd: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize()) {
        LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(rules) { rule ->
                ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.padding(16.dp).fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(rule.cidr, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = if (rule.type == CidrRuleType.ALLOW) Color.Green.copy(alpha = 0.15f) else Color.Red.copy(alpha = 0.15f)
                                ) {
                                    Text(
                                        rule.type.name,
                                        fontSize = 9.sp, fontWeight = FontWeight.Bold,
                                        color = if (rule.type == CidrRuleType.ALLOW) Color.Green else Color.Red,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                    )
                                }
                            }
                            if (rule.comment != null) {
                                Text(rule.comment!!, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        IconButton(onClick = { onDelete(rule.id) }) {
                            Icon(Icons.Default.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }
        FloatingActionButton(onClick = onAdd, modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp)) {
            Icon(Icons.Default.Add, contentDescription = "Add CIDR")
        }
    }
}

@Composable
fun ReputationList(reputations: List<IpReputation>, onTap: (IpReputation) -> Unit, onRefresh: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize()) {
        LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(reputations) { rep ->
                ElevatedCard(modifier = Modifier.fillMaxWidth().clickable { onTap(rep) }) {
                    Row(
                        modifier = Modifier.padding(16.dp).fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(rep.ip, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                                if (rep.country != null) {
                                    Text(rep.country!!, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                                }
                            }
                            if (rep.isp != null) {
                                Text(rep.isp!!, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text("${rep.blockedTimes}×", fontWeight = FontWeight.Bold, color = Color(0xFFEF4444))
                            if (rep.exponentialBlockedTimes > 0) {
                                Text("x${1 shl rep.exponentialBlockedTimes}", fontSize = 10.sp, color = Color(0xFFF59E0B))
                            }
                        }
                    }
                }
            }
        }
        FloatingActionButton(onClick = onRefresh, modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp)) {
            Icon(Icons.Default.Refresh, contentDescription = "Refresh")
        }
    }
}

// ─── Mirrors List ────────────────────────────────────────────────────────────

@Composable
fun MirrorsList(mirrors: List<ProxyHit>, onRefresh: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize()) {
        LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(mirrors) { hit ->
                ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Surface(shape = RoundedCornerShape(6.dp), color = Color(0xFFEC4899).copy(alpha = 0.15f)) {
                                Text(hit.status.toString(), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFFEC4899), modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                            }
                            Text("${hit.method} ${hit.path}", fontFamily = FontFamily.Monospace, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                            Text("IP: ${hit.ip}", fontSize = 11.sp, fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                            if (hit.userAgent != null) {
                                Text(hit.userAgent!!, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.3f), modifier = Modifier.weight(1f))
                            }
                        }
                    }
                }
            }
        }
        FloatingActionButton(onClick = onRefresh, modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp)) {
            Icon(Icons.Default.Refresh, contentDescription = "Refresh")
        }
    }
}

// ─── Drill-Down Dialogs ──────────────────────────────────────────────────────

@Composable
fun RuleDetailDialog(rule: FirewallRule, onDismiss: () -> Unit) {
    val now = getTimeMillis()
    val isJail = rule.expiresAt != null && rule.expiresAt!! > now

    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(if (isJail) Icons.Default.Lock else Icons.Default.Info, contentDescription = null) },
        title = { Text(rule.ip, fontFamily = FontFamily.Monospace) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                DetailRow("Protocol", rule.protocol)
                if (rule.comment != null) DetailRow("Reason", rule.comment!!)
                if (rule.country != null) DetailRow("Country", rule.country!!)
                if (rule.city != null) DetailRow("City", rule.city!!)
                if (rule.isp != null) DetailRow("ISP", rule.isp!!)
                if (rule.asn != null) DetailRow("ASN", rule.asn!!)
                if (isJail) {
                    val minsLeft = ((rule.expiresAt!! - now) / 60_000).toInt()
                    DetailRow("Remaining", "${minsLeft}m")
                }
                DetailRow("Type", if (isJail) "Timed Jail" else "Permanent Block")
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } }
    )
}

@Composable
fun ReputationDetailDialog(reputation: IpReputation, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Default.Warning, contentDescription = null) },
        title = { Text(reputation.ip, fontFamily = FontFamily.Monospace) },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item { DetailRow("Blocked", "${reputation.blockedTimes}×") }
                item { DetailRow("Escalation", if (reputation.exponentialBlockedTimes > 0) "x${1 shl reputation.exponentialBlockedTimes}" else "None") }
                item { DetailRow("Last Jail", if (reputation.lastJailDuration > 0) "${reputation.lastJailDuration}m" else "—") }
                item { DetailRow("Flagged", "${reputation.flaggedTimes}×") }
                if (reputation.country != null) item { DetailRow("Country", reputation.country!!) }
                if (reputation.isp != null) item { DetailRow("ISP", reputation.isp!!) }
                if (reputation.asn != null) item { DetailRow("ASN", reputation.asn!!) }
                if (reputation.range != null) item { DetailRow("Range", reputation.range!!) }
                if (reputation.lastBlocked != null) item { DetailRow("Last Blocked", reputation.lastBlocked!!) }
                if (reputation.lastActivity != null) item { DetailRow("Last Activity", reputation.lastActivity!!) }
                if (reputation.reasons.isNotEmpty()) {
                    item {
                        Column {
                            Text("Reasons", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                            reputation.reasons.forEach { reason ->
                                Text("• $reason", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f))
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } }
    )
}

@Composable
fun DetailRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        Text(value, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
    }
}

// ─── Existing Dialogs (unchanged) ───────────────────────────────────────────

@Composable
fun AddFirewallDialog(onDismiss: () -> Unit, onConfirm: (String, String) -> Unit) {
    var ip by remember { mutableStateOf("") }
    var comment by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Block IP") },
        text = {
            Column {
                OutlinedTextField(value = ip, onValueChange = { ip = it }, label = { Text("IP Address") })
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = comment, onValueChange = { comment = it }, label = { Text("Comment") })
            }
        },
        confirmButton = { Button(onClick = { onConfirm(ip, comment) }) { Text("Block") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
fun AddCidrDialog(onDismiss: () -> Unit, onConfirm: (String, String, CidrRuleType) -> Unit) {
    var cidr by remember { mutableStateOf("") }
    var comment by remember { mutableStateOf("") }
    var type by remember { mutableStateOf(CidrRuleType.BLOCK) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add CIDR Rule") },
        text = {
            Column {
                OutlinedTextField(value = cidr, onValueChange = { cidr = it }, label = { Text("CIDR (e.g. 192.168.1.0/24)") })
                Spacer(modifier = Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selected = type == CidrRuleType.BLOCK, onClick = { type = CidrRuleType.BLOCK })
                    Text("Block")
                    Spacer(modifier = Modifier.width(16.dp))
                    RadioButton(selected = type == CidrRuleType.ALLOW, onClick = { type = CidrRuleType.ALLOW })
                    Text("Allow")
                }
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = comment, onValueChange = { comment = it }, label = { Text("Comment") })
            }
        },
        confirmButton = { Button(onClick = { onConfirm(cidr, comment, type) }) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
