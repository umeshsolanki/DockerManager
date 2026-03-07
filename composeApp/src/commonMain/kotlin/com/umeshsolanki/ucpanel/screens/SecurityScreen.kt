package com.umeshsolanki.ucpanel.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.umeshsolanki.ucpanel.BlockIPRequest
import com.umeshsolanki.ucpanel.CidrRule
import com.umeshsolanki.ucpanel.CidrRuleType
import com.umeshsolanki.ucpanel.FirewallRule
import com.umeshsolanki.ucpanel.api.SecurityApiService
import kotlinx.coroutines.launch

@Composable
fun SecurityScreen() {
    var rules by remember { mutableStateOf<List<FirewallRule>>(emptyList()) }
    var cidrRules by remember { mutableStateOf<List<CidrRule>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()
    var selectedTab by remember { mutableStateOf(0) }

    var showAddFirewallDialog by remember { mutableStateOf(false) }
    var showAddCidrDialog by remember { mutableStateOf(false) }

    fun refresh() {
        scope.launch {
            isLoading = true
            rules = SecurityApiService.listRules()
            cidrRules = SecurityApiService.listCidrRules()
            isLoading = false
        }
    }

    LaunchedEffect(Unit) {
        refresh()
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TabRow(selectedTabIndex = selectedTab) {
            Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }, text = { Text("Firewall IPs") })
            Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }, text = { Text("CIDR Rules") })
        }

        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            if (isLoading) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            } else {
                when (selectedTab) {
                    0 -> FirewallList(rules, onDelete = { id -> 
                        scope.launch { SecurityApiService.unblockIP(id); refresh() } 
                    }, onAdd = { showAddFirewallDialog = true })
                    1 -> CidrList(cidrRules, onDelete = { id -> 
                        scope.launch { SecurityApiService.removeCidrRule(id); refresh() } 
                    }, onAdd = { showAddCidrDialog = true })
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
}

@Composable
fun FirewallList(rules: List<FirewallRule>, onDelete: (String) -> Unit, onAdd: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize()) {
        LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(rules) { rule ->
                ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.padding(16.dp).fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(rule.ip, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
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
        FloatingActionButton(
            onClick = onAdd,
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp)
        ) {
            Icon(Icons.Default.Add, contentDescription = "Add IP")
        }
    }
}

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
                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(rule.cidr, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                                Spacer(modifier = Modifier.width(8.dp))
                                Badge(containerColor = if(rule.type == CidrRuleType.ALLOW) Color(0xFF4CAF50) else Color(0xFFF44336)) {
                                    Text(rule.type.name, modifier = Modifier.padding(4.dp))
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
        FloatingActionButton(
            onClick = onAdd,
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp)
        ) {
            Icon(Icons.Default.Add, contentDescription = "Add CIDR")
        }
    }
}

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
        confirmButton = {
            Button(onClick = { onConfirm(ip, comment) }) { Text("Block") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
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
        confirmButton = {
            Button(onClick = { onConfirm(cidr, comment, type) }) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
