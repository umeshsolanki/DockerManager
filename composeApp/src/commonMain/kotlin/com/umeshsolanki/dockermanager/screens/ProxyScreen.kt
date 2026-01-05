package com.umeshsolanki.dockermanager.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.umeshsolanki.dockermanager.ProxyHost
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import com.umeshsolanki.dockermanager.ProxyActionResult
import com.umeshsolanki.dockermanager.ProxyContainerStatus
import androidx.compose.ui.unit.sp
import com.umeshsolanki.dockermanager.DockerClient as DC
import androidx.compose.ui.text.font.FontFamily

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProxyScreen() {
    var containerStatus by remember { mutableStateOf<ProxyContainerStatus?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var successMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    var activeTab by remember { mutableStateOf(0) } // 0: Hosts, 1: Infrastructure
    var hosts by remember { mutableStateOf<List<ProxyHost>>(emptyList()) }
    var isHostDialogOpen by remember { mutableStateOf(false) }
    var editingHost by remember { mutableStateOf<ProxyHost?>(null) }

    // Auto-refresh status
    LaunchedEffect(activeTab) {
        while (true) {
            if (activeTab == 1) {
                containerStatus = DC.getProxyContainerStatus()
            } else {
                hosts = DC.listProxyHosts()
            }
            delay(5000) // Refresh every 5 seconds
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            TabRow(
                selectedTabIndex = activeTab,
                modifier = Modifier.width(300.dp).clip(RoundedCornerShape(8.dp)),
                containerColor = MaterialTheme.colorScheme.surfaceVariant,
                indicator = { Box(Modifier) },
                divider = { Box(Modifier) }
            ) {
                Tab(
                    selected = activeTab == 0,
                    onClick = { activeTab = 0 },
                    text = { Text("Domain Hosts") }
                )
                Tab(
                    selected = activeTab == 1,
                    onClick = { activeTab = 1 },
                    text = { Text("Infrastructure") }
                )
            }

            if (activeTab == 0) {
                Button(
                    onClick = {
                        editingHost = null
                        isHostDialogOpen = true
                    },
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Add Host")
                }
            }
        }
        // Messages
        AnimatedVisibility(
            visible = errorMessage != null,
            enter = expandVertically() + fadeIn(),
            exit = shrinkVertically() + fadeOut()
        ) {
            errorMessage?.let { msg ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer
                    )
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Default.Error,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error
                        )
                        Text(
                            msg,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            modifier = Modifier.weight(1f)
                        )
                        IconButton(onClick = { errorMessage = null }) {
                            Icon(Icons.Default.Close, contentDescription = "Dismiss")
                        }
                    }
                }
            }
        }

        AnimatedVisibility(
            visible = successMessage != null,
            enter = expandVertically() + fadeIn(),
            exit = shrinkVertically() + fadeOut()
        ) {
            successMessage?.let { msg ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = Color(0xFF1B5E20).copy(alpha = 0.2f)
                    )
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = Color(0xFF4CAF50)
                        )
                        Text(
                            msg,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.weight(1f)
                        )
                        IconButton(onClick = { successMessage = null }) {
                            Icon(Icons.Default.Close, contentDescription = "Dismiss")
                        }
                    }
                }
            }
        }

        // Status Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            )
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "Proxy Container Status",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold
                    )
                    
                    containerStatus?.let { status ->
                        StatusBadge(
                            text = if (status.running) "Running" else if (status.exists) "Stopped" else "Not Created",
                            color = if (status.running) Color(0xFF4CAF50) else if (status.exists) Color(0xFFFFA726) else Color(0xFFEF5350)
                        )
                    }
                }

                HorizontalDivider()

                containerStatus?.let { status ->
                    StatusRow("Container Exists", if (status.exists) "Yes" else "No", status.exists)
                    StatusRow("Image Exists", if (status.imageExists) "Yes" else "No", status.imageExists)
                    StatusRow("Running", if (status.running) "Yes" else "No", status.running)
                    
                    status.containerId?.let {
                        StatusRow("Container ID", it.take(12), true)
                    }
                    
                    StatusRow("Status", status.status, status.running)
                    
                    status.uptime?.let {
                        StatusRow("Started At", it, true)
                    }
                } ?: run {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(32.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                }
            }
        }

        // Action Buttons
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            )
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    "Container Management",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(bottom = 8.dp)
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    ActionButton(
                        text = "Build Image",
                        icon = Icons.Default.Build,
                        enabled = !isLoading,
                        modifier = Modifier.weight(1f),
                        onClick = {
                            scope.launch {
                                isLoading = true
                                errorMessage = null
                                successMessage = null
                                val success = DockerClient.buildProxyImage()
                                if (success) {
                                    successMessage = "Image built successfully"
                                    containerStatus = DockerClient.getProxyContainerStatus()
                                } else {
                                    errorMessage = "Failed to build image"
                                }
                                isLoading = false
                            }
                        }
                    )

                    ActionButton(
                        text = "Create Container",
                        icon = Icons.Default.Add,
                        enabled = !isLoading && containerStatus?.imageExists == true,
                        modifier = Modifier.weight(1f),
                        onClick = {
                            scope.launch {
                                isLoading = true
                                errorMessage = null
                                successMessage = null
                                val success = DockerClient.createProxyContainer()
                                if (success) {
                                    successMessage = "Container created successfully"
                                    containerStatus = DockerClient.getProxyContainerStatus()
                                } else {
                                    errorMessage = "Failed to create container"
                                }
                                isLoading = false
                            }
                        }
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    ActionButton(
                        text = "Start",
                        icon = Icons.Default.PlayArrow,
                        enabled = !isLoading && containerStatus?.exists == true && containerStatus?.running == false,
                        modifier = Modifier.weight(1f),
                        color = Color(0xFF4CAF50),
                        onClick = {
                            scope.launch {
                                isLoading = true
                                errorMessage = null
                                successMessage = null
                                val success = DockerClient.startProxyContainer()
                                if (success) {
                                    successMessage = "Container started successfully"
                                    delay(1000)
                                    containerStatus = DockerClient.getProxyContainerStatus()
                                } else {
                                    errorMessage = "Failed to start container"
                                }
                                isLoading = false
                            }
                        }
                    )

                    ActionButton(
                        text = "Stop",
                        icon = Icons.Default.Stop,
                        enabled = !isLoading && containerStatus?.running == true,
                        modifier = Modifier.weight(1f),
                        color = Color(0xFFEF5350),
                        onClick = {
                            scope.launch {
                                isLoading = true
                                errorMessage = null
                                successMessage = null
                                val success = DockerClient.stopProxyContainer()
                                if (success) {
                                    successMessage = "Container stopped successfully"
                                    delay(1000)
                                    containerStatus = DockerClient.getProxyContainerStatus()
                                } else {
                                    errorMessage = "Failed to stop container"
                                }
                                isLoading = false
                            }
                        }
                    )

                    ActionButton(
                        text = "Restart",
                        icon = Icons.Default.Refresh,
                        enabled = !isLoading && containerStatus?.running == true,
                        modifier = Modifier.weight(1f),
                        color = Color(0xFFFFA726),
                        onClick = {
                            scope.launch {
                                isLoading = true
                                errorMessage = null
                                successMessage = null
                                val success = DockerClient.restartProxyContainer()
                                if (success) {
                                    successMessage = "Container restarted successfully"
                                    delay(2000)
                                    containerStatus = DockerClient.getProxyContainerStatus()
                                } else {
                                    errorMessage = "Failed to restart container"
                                }
                                isLoading = false
                            }
                        }
                    )
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

                // One-click setup
                Button(
                    onClick = {
                        scope.launch {
                            isLoading = true
                            errorMessage = null
                            successMessage = null
                            val success = DockerClient.ensureProxyContainer()
                            if (success) {
                                successMessage = "Proxy container is ready! (built, created, and started)"
                                delay(2000)
                                containerStatus = DockerClient.getProxyContainerStatus()
                            } else {
                                errorMessage = "Failed to ensure proxy container"
                            }
                            isLoading = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                    enabled = !isLoading,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary
                    )
                ) {
                    Icon(Icons.Default.AutoAwesome, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        "Ensure Container Ready (One-Click Setup)",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        // Info Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
            )
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Icon(
                    Icons.Default.Info,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary
                )
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        "About Proxy Container",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        "The proxy container runs OpenResty (Nginx) with Certbot for SSL certificate management. " +
                        "Use the 'Ensure Container Ready' button for automatic setup, or manage individual steps manually.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                    )
                }
            }
        }

        if (activeTab == 1) {
            InfrastructureTab(
                containerStatus = containerStatus,
                isLoading = isLoading,
                onStatusChange = { containerStatus = it },
                onLoadingChange = { isLoading = it },
                onShowError = { errorMessage = it },
                onShowSuccess = { successMessage = it }
            )
        } else {
            HostsTab(
                hosts = hosts,
                onEdit = { 
                    editingHost = it
                    isHostDialogOpen = true
                },
                onToggle = { host ->
                    scope.launch {
                        DC.toggleProxyHost(host.id)
                        hosts = DC.listProxyHosts()
                    }
                },
                onDelete = { host ->
                    scope.launch {
                        DC.deleteProxyHost(host.id)
                        hosts = DC.listProxyHosts()
                    }
                }
            )
        }

        if (isLoading) {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }
    }

    if (isHostDialogOpen) {
        ProxyHostDialog(
            host = editingHost,
            onClose = { isHostDialogOpen = false },
            onSave = { 
                scope.launch {
                    val success = if (editingHost != null) DC.updateProxyHost(it) else DC.createProxyHost(it)
                    if (success) {
                        isHostDialogOpen = false
                        hosts = DC.listProxyHosts()
                    }
                }
            }
        )
    }
}

@Composable
fun InfrastructureTab(
    containerStatus: ProxyContainerStatus?,
    isLoading: Boolean,
    onStatusChange: (ProxyContainerStatus?) -> Unit,
    onLoadingChange: (Boolean) -> Unit,
    onShowError: (String?) -> Unit,
    onShowSuccess: (String?) -> Unit
) {
    val scope = rememberCoroutineScope()
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // Status Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            )
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "Proxy Container Status",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold
                    )
                    
                    containerStatus?.let { status ->
                        StatusBadge(
                            text = if (status.running) "Running" else if (status.exists) "Stopped" else "Not Created",
                            color = if (status.running) Color(0xFF4CAF50) else if (status.exists) Color(0xFFFFA726) else Color(0xFFEF5350)
                        )
                    }
                }

                HorizontalDivider()

                containerStatus?.let { status ->
                    StatusRow("Container Exists", if (status.exists) "Yes" else "No", status.exists)
                    StatusRow("Image Exists", if (status.imageExists) "Yes" else "No", status.imageExists)
                    StatusRow("Running", if (status.running) "Yes" else "No", status.running)
                    
                    status.containerId?.let {
                        StatusRow("Container ID", it.take(12), true)
                    }
                    
                    StatusRow("Status", status.status, status.running)
                    
                    status.uptime?.let {
                        StatusRow("Started At", it, true)
                    }
                } ?: run {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(32.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                }
            }
        }

        // Action Buttons
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            )
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    "Container Management",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(bottom = 8.dp)
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    ActionButton(
                        text = "Build Image",
                        icon = Icons.Default.Build,
                        enabled = !isLoading,
                        modifier = Modifier.weight(1f),
                        onClick = {
                            scope.launch {
                                onLoadingChange(true)
                                onShowError(null)
                                onShowSuccess(null)
                                val success = DC.buildProxyImage()
                                if (success) {
                                    onShowSuccess("Image built successfully")
                                    onStatusChange(DC.getProxyContainerStatus())
                                } else {
                                    onShowError("Failed to build image")
                                }
                                onLoadingChange(false)
                            }
                        }
                    )

                    ActionButton(
                        text = "Create Container",
                        icon = Icons.Default.Add,
                        enabled = !isLoading && containerStatus?.imageExists == true,
                        modifier = Modifier.weight(1f),
                        onClick = {
                            scope.launch {
                                onLoadingChange(true)
                                onShowError(null)
                                onShowSuccess(null)
                                val success = DC.createProxyContainer()
                                if (success) {
                                    onShowSuccess("Container created successfully")
                                    onStatusChange(DC.getProxyContainerStatus())
                                } else {
                                    onShowError("Failed to create container")
                                }
                                onLoadingChange(false)
                            }
                        }
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    ActionButton(
                        text = "Start",
                        icon = Icons.Default.PlayArrow,
                        enabled = !isLoading && containerStatus?.exists == true && containerStatus?.running == false,
                        modifier = Modifier.weight(1f),
                        color = Color(0xFF4CAF50),
                        onClick = {
                            scope.launch {
                                onLoadingChange(true)
                                onShowError(null)
                                onShowSuccess(null)
                                val success = DC.startProxyContainer()
                                if (success) {
                                    onShowSuccess("Container started successfully")
                                    delay(1000)
                                    onStatusChange(DC.getProxyContainerStatus())
                                } else {
                                    onShowError("Failed to start container")
                                }
                                onLoadingChange(false)
                            }
                        }
                    )

                    ActionButton(
                        text = "Stop",
                        icon = Icons.Default.Stop,
                        enabled = !isLoading && containerStatus?.running == true,
                        modifier = Modifier.weight(1f),
                        color = Color(0xFFEF5350),
                        onClick = {
                            scope.launch {
                                onLoadingChange(true)
                                onShowError(null)
                                onShowSuccess(null)
                                val success = DC.stopProxyContainer()
                                if (success) {
                                    onShowSuccess("Container stopped successfully")
                                    delay(1000)
                                    onStatusChange(DC.getProxyContainerStatus())
                                } else {
                                    onShowError("Failed to stop container")
                                }
                                onLoadingChange(false)
                            }
                        }
                    )

                    ActionButton(
                        text = "Restart",
                        icon = Icons.Default.Refresh,
                        enabled = !isLoading && containerStatus?.running == true,
                        modifier = Modifier.weight(1f),
                        color = Color(0xFFFFA726),
                        onClick = {
                            scope.launch {
                                onLoadingChange(true)
                                onShowError(null)
                                onShowSuccess(null)
                                val success = DC.restartProxyContainer()
                                if (success) {
                                    onShowSuccess("Container restarted successfully")
                                    delay(2000)
                                    onStatusChange(DC.getProxyContainerStatus())
                                } else {
                                    onShowError("Failed to restart container")
                                }
                                onLoadingChange(false)
                            }
                        }
                    )
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

                // One-click setup
                Button(
                    onClick = {
                        scope.launch {
                            onLoadingChange(true)
                            onShowError(null)
                            onShowSuccess(null)
                            val success = DC.ensureProxyContainer()
                            if (success) {
                                onShowSuccess("Proxy container is ready! (built, created, and started)")
                                delay(2000)
                                onStatusChange(DC.getProxyContainerStatus())
                            } else {
                                onShowError("Failed to ensure proxy container")
                            }
                            onLoadingChange(false)
                        }
                    },
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                    enabled = !isLoading,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary
                    )
                ) {
                    Icon(Icons.Default.AutoAwesome, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        "Ensure Container Ready (One-Click Setup)",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        // Info Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
            )
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Icon(
                    Icons.Default.Info,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary
                )
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        "About Proxy Container",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        "The proxy container runs OpenResty (Nginx) with Certbot for SSL certificate management. " +
                        "Use the 'Ensure Container Ready' button for automatic setup, or manage individual steps manually.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                    )
                }
            }
        }
    }
}

@Composable
fun HostsTab(
    hosts: List<ProxyHost>,
    onEdit: (ProxyHost) -> Unit,
    onToggle: (ProxyHost) -> Unit,
    onDelete: (ProxyHost) -> Unit
) {
    LazyColumn(
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        items(hosts) { host ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                ),
                shape = RoundedCornerShape(16.dp)
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (host.enabled) MaterialTheme.colorScheme.primary.copy(alpha = 0.1f) else MaterialTheme.colorScheme.surface),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            Icons.Default.Language,
                            contentDescription = null,
                            tint = if (host.enabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(host.domain, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            if (!host.enabled) {
                                Badge(containerColor = MaterialTheme.colorScheme.errorContainer) { Text("OFF", size = 8.sp) }
                            }
                            if (host.ssl) {
                                Badge(containerColor = Color(0xFF4CAF50).copy(alpha = 0.2f)) { 
                                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 4.dp)) {
                                        Icon(Icons.Default.Lock, null, modifier = Modifier.size(10.dp), tint = Color(0xFF4CAF50))
                                        Text("SSL", color = Color(0xFF4CAF50), style = MaterialTheme.typography.labelSmall)
                                    }
                                }
                            }
                            if (host.allowedIps.isNotEmpty()) {
                                Badge(containerColor = Color(0xFFFFA726).copy(alpha = 0.2f)) {
                                     Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 4.dp)) {
                                        Icon(Icons.Default.Security, null, modifier = Modifier.size(10.dp), tint = Color(0xFFFFA726))
                                        Text("RESTRICTED", color = Color(0xFFFFA726), style = MaterialTheme.typography.labelSmall)
                                    }
                                }
                            }
                        }
                        Text(host.target, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, fontFamily = FontFamily.Monospace)
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        IconButton(onClick = { onEdit(host) }) {
                            Icon(Icons.Default.Edit, null, modifier = Modifier.size(20.dp), tint = MaterialTheme.colorScheme.primary)
                        }
                        IconButton(onClick = { onToggle(host) }) {
                            Icon(
                                if (host.enabled) Icons.Default.PowerSettingsNew else Icons.Default.Power,
                                null,
                                modifier = Modifier.size(20.dp),
                                tint = if (host.enabled) Color(0xFF4CAF50) else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        IconButton(onClick = { onDelete(host) }) {
                            Icon(Icons.Default.Delete, null, modifier = Modifier.size(20.dp), tint = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ProxyHostDialog(
    host: ProxyHost?,
    onClose: () -> Unit,
    onSave: (ProxyHost) -> Unit
) {
    var domain by remember { mutableStateOf(host?.domain ?: "") }
    var target by remember { mutableStateOf(host?.target ?: "http://") }
    var websocketEnabled by remember { mutableStateOf(host?.websocketEnabled ?: false) }
    var sslEnabled by remember { mutableStateOf(host?.ssl ?: false) }
    var allowedIps by remember { mutableStateOf(host?.allowedIps ?: emptyList()) }
    var newIp by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onClose,
        title = { Text(if (host == null) "Add Proxy Host" else "Edit Proxy Host") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                OutlinedTextField(
                    value = domain,
                    onValueChange = { domain = it },
                    label = { Text("Domain Name") },
                    placeholder = { Text("e.g. app.example.com") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = target,
                    onValueChange = { target = it },
                    label = { Text("Target URL") },
                    placeholder = { Text("e.g. http://localhost:8080") },
                    modifier = Modifier.fillMaxWidth()
                )

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(websocketEnabled, { websocketEnabled = it })
                    Text("Enable WebSocket Support", modifier = Modifier.padding(start = 8.dp))
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(sslEnabled, { sslEnabled = it })
                    Text("Enable SSL (HTTPS)", modifier = Modifier.padding(start = 8.dp))
                }

                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("IP Restrictions", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedTextField(
                            value = newIp,
                            onValueChange = { newIp = it },
                            label = { Text("IP or CIDR") },
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                        IconButton(
                            onClick = {
                                if (newIp.isNotBlank()) {
                                    allowedIps = allowedIps + newIp.trim()
                                    newIp = ""
                                }
                            },
                            colors = IconButtonDefaults.filledIconButtonColors(
                                containerColor = MaterialTheme.colorScheme.primary
                            )
                        ) {
                            Icon(Icons.Default.Add, null)
                        }
                    }

                    FlowRow(
                        modifier = Modifier.fillMaxWidth(),
                        mainAxisSpacing = 8.dp,
                        crossAxisSpacing = 8.dp
                    ) {
                        allowedIps.forEach { ip ->
                           InputChip(
                               selected = true,
                               onClick = { allowedIps = allowedIps - ip },
                               label = { Text(ip, style = MaterialTheme.typography.labelSmall) },
                               trailingIcon = { Icon(Icons.Default.Close, null, modifier = Modifier.size(14.dp)) }
                           )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = {
                onSave(
                    ProxyHost(
                        id = host?.id ?: "",
                        domain = domain,
                        target = target,
                        enabled = host?.enabled ?: true,
                        ssl = sslEnabled,
                        websocketEnabled = websocketEnabled,
                        allowedIps = allowedIps,
                        createdAt = host?.createdAt ?: 0
                    )
                )
            }) {
                Text(if (host == null) "Create" else "Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onClose) {
                Text("Cancel")
            }
        }
    )
}

@Composable
fun FlowRow(
    modifier: Modifier = Modifier,
    mainAxisSpacing: androidx.compose.ui.unit.Dp = 0.dp,
    crossAxisSpacing: androidx.compose.ui.unit.Dp = 0.dp,
    content: @Composable () -> Unit
) {
    androidx.compose.ui.layout.Layout(content, modifier) { measurables, constraints ->
        val placeables = measurables.map { it.measure(constraints) }
        var xPosition = 0
        var yPosition = 0
        var maxHeight = 0
        val positions = mutableListOf<androidx.compose.ui.unit.IntOffset>()

        placeables.forEach { placeable ->
            if (xPosition + placeable.width > constraints.maxWidth) {
                xPosition = 0
                yPosition += maxHeight + crossAxisSpacing.toPx().toInt()
                maxHeight = 0
            }
            positions.add(androidx.compose.ui.unit.IntOffset(xPosition, yPosition))
            xPosition += placeable.width + mainAxisSpacing.toPx().toInt()
            maxHeight = maxOf(maxHeight, placeable.height)
        }

        layout(constraints.maxWidth, yPosition + maxHeight) {
            placeables.forEachIndexed { index, placeable ->
                placeable.placeRelative(positions[index])
            }
        }
    }
}

@Composable
private fun StatusRow(label: String, value: String, isPositive: Boolean) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
        )
        Text(
            value,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            color = if (isPositive) Color(0xFF4CAF50) else MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun StatusBadge(text: String, color: Color) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(16.dp))
            .background(color.copy(alpha = 0.2f))
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        Text(
            text,
            style = MaterialTheme.typography.labelLarge,
            color = color,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun ActionButton(
    text: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    color: Color = MaterialTheme.colorScheme.primary,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        modifier = modifier.height(48.dp),
        enabled = enabled,
        colors = ButtonDefaults.buttonColors(
            containerColor = color,
            disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(20.dp))
        Spacer(modifier = Modifier.width(8.dp))
        Text(text, style = MaterialTheme.typography.labelLarge)
    }
}
