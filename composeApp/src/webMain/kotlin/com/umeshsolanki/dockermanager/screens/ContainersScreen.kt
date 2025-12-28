package com.umeshsolanki.dockermanager.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.umeshsolanki.dockermanager.DockerClient
import com.umeshsolanki.dockermanager.DockerContainer
import kotlinx.coroutines.launch

@Composable
fun ContainersScreen() {
    var containers by remember { mutableStateOf<List<DockerContainer>>(emptyList()) }
    var searchQuery by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        containers = DockerClient.listContainers()
    }

    fun refresh() {
        scope.launch {
            containers = DockerClient.listContainers()
        }
    }

    val filteredContainers = containers.filter {
        it.names.contains(searchQuery, ignoreCase = true) || it.image.contains(
            searchQuery,
            ignoreCase = true
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = { Text("Search containers...") },
                modifier = Modifier.weight(1f),
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                shape = MaterialTheme.shapes.medium
            )

            Spacer(modifier = Modifier.width(16.dp))

            IconButton(onClick = { refresh() }) {
                Icon(Icons.Default.Refresh, contentDescription = "Refresh")
            }

            IconButton(
                onClick = {
                    scope.launch {
                        DockerClient.pruneContainers()
                        refresh()
                    }
                }) {
                Icon(Icons.Default.DeleteSweep, contentDescription = "Prune", tint = Color.Red)
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        if (filteredContainers.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    "No containers found",
                    style = MaterialTheme.typography.bodyLarge,
                    color = Color.Gray
                )
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(bottom = 16.dp)
            ) {
                items(filteredContainers) { container ->
                    ContainerRow(container) { refresh() }
                }
            }
        }
    }
}

@Composable
fun ContainerRow(container: DockerContainer, onRefresh: () -> Unit) {
    val scope = rememberCoroutineScope()
    val isRunning = container.state.contains("running", ignoreCase = true)

    ElevatedCard(
        modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.large
    ) {
        Row(
            modifier = Modifier.padding(20.dp).fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                Box(
                    modifier = Modifier.size(10.dp).background(
                            color = if (isRunning) Color(0xFF4CAF50) else Color(0xFF757575),
                            shape = CircleShape
                        )
                )

                Spacer(modifier = Modifier.width(16.dp))

                Column {
                    Text(
                        text = container.names,
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = container.image,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = container.status,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (isRunning) Color(0xFF4CAF50).copy(alpha = 0.8f) else Color.Gray
                    )
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (!isRunning) {
                    IconButton(
                        onClick = {
                            scope.launch {
                                DockerClient.startContainer(container.id)
                                onRefresh()
                            }
                        }) {
                        Icon(
                            Icons.Default.PlayArrow,
                            contentDescription = "Start",
                            tint = Color(0xFF4CAF50)
                        )
                    }
                } else {
                    IconButton(
                        onClick = {
                            scope.launch {
                                DockerClient.stopContainer(container.id)
                                onRefresh()
                            }
                        }) {
                        Icon(
                            Icons.Default.Stop,
                            contentDescription = "Stop",
                            tint = Color(0xFFF44336)
                        )
                    }
                }

                IconButton(
                    onClick = {
                        scope.launch {
                            DockerClient.removeContainer(container.id)
                            onRefresh()
                        }
                    }, enabled = !isRunning
                ) {
                    Icon(
                        Icons.Default.Delete,
                        contentDescription = "Remove",
                        tint = if (isRunning) Color.Gray else Color(0xFFF44336)
                    )
                }
            }
        }
    }
}
