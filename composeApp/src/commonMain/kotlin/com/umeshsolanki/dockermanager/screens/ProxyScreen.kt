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
import com.umeshsolanki.dockermanager.DockerClient
import com.umeshsolanki.dockermanager.ProxyContainerStatus
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun ProxyScreen() {
    var containerStatus by remember { mutableStateOf<ProxyContainerStatus?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var successMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    // Auto-refresh status
    LaunchedEffect(Unit) {
        while (true) {
            containerStatus = DockerClient.getProxyContainerStatus()
            delay(5000) // Refresh every 5 seconds
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
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

        if (isLoading) {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
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
