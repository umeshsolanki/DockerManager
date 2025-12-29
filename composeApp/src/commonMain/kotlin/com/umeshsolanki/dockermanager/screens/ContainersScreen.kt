package com.umeshsolanki.dockermanager.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
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
    var isLoading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        isLoading = true
        containers = DockerClient.listContainers()
        isLoading = false
    }

    fun refresh() {
        scope.launch {
            isLoading = true
            containers = DockerClient.listContainers()
            isLoading = false
        }
    }

    ContainersContent(
        containers = containers,
        isLoading = isLoading,
        onRefresh = { refresh() },
        onStart = { id ->
            scope.launch {
                isLoading = true
                DockerClient.startContainer(id)
                refresh()
            }
        },
        onStop = { id ->
            scope.launch {
                isLoading = true
                DockerClient.stopContainer(id)
                refresh()
            }
        },
        onRemove = { id ->
            scope.launch {
                isLoading = true
                DockerClient.removeContainer(id)
                refresh()
            }
        },
        onPrune = {
            scope.launch {
                isLoading = true
                DockerClient.pruneContainers()
                refresh()
            }
        })
}

@Composable
fun ContainersContent(
    containers: List<DockerContainer>,
    isLoading: Boolean,
    onRefresh: () -> Unit,
    onStart: (String) -> Unit,
    onStop: (String) -> Unit,
    onRemove: (String) -> Unit,
    onPrune: () -> Unit,
) {
    var searchQuery by remember { mutableStateOf("") }

    val filteredContainers = containers.filter {
        it.names.contains(searchQuery, ignoreCase = true) || it.image.contains(
            searchQuery, ignoreCase = true
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        if (isLoading) {
            LinearProgressIndicator(
                modifier = Modifier.fillMaxWidth().height(2.dp),
                color = MaterialTheme.colorScheme.primary,
                trackColor = MaterialTheme.colorScheme.surfaceVariant
            )
            Spacer(modifier = Modifier.height(12.dp))
        }

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

            IconButton(onClick = onRefresh) {
                Icon(Icons.Default.Refresh, contentDescription = "Refresh")
            }

            IconButton(onClick = onPrune) {
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
                    ContainerRow(container, onRefresh, onStart, onStop, onRemove)
                }
            }
        }
    }
}

@Composable
fun ContainerRow(
    container: DockerContainer,
    onRefresh: () -> Unit,
    onStart: (String) -> Unit,
    onStop: (String) -> Unit,
    onRemove: (String) -> Unit,
) {
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
                    IconButton(onClick = { onStart(container.id) }) {
                        Icon(
                            Icons.Default.PlayArrow,
                            contentDescription = "Start",
                            tint = Color(0xFF4CAF50)
                        )
                    }
                } else {
                    IconButton(onClick = { onStop(container.id) }) {
                        Icon(
                            Icons.Default.Stop,
                            contentDescription = "Stop",
                            tint = Color(0xFFF44336)
                        )
                    }
                }

                IconButton(
                    onClick = { onRemove(container.id) }, enabled = !isRunning
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
