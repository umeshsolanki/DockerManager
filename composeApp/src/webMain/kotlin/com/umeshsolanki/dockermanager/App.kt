package com.umeshsolanki.dockermanager

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@Composable
fun App() {
    MaterialTheme {
        var containers by remember { mutableStateOf<List<DockerContainer>>(emptyList()) }
        val scope = rememberCoroutineScope()

        LaunchedEffect(Unit) {
            containers = DockerClient.listContainers()
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(16.dp)
        ) {
            Text(
                "Docker Manager",
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            Button(
                onClick = {
                    scope.launch {
                        containers = DockerClient.listContainers()
                    }
                },
                modifier = Modifier.padding(bottom = 16.dp)
            ) {
                Text("Refresh")
            }

            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(containers) { container ->
                    ContainerRow(container) {
                       scope.launch {
                           containers = DockerClient.listContainers() // Refresh after action
                       }
                    }
                }
            }
        }
    }
}

@Composable
fun ContainerRow(container: DockerContainer, onRefresh: () -> Unit) {
    val scope = rememberCoroutineScope()
    
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(text = container.names, style = MaterialTheme.typography.titleMedium)
                Text(text = container.image, style = MaterialTheme.typography.bodySmall)
                Text(
                    text = "${container.status} (${container.state})",
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (container.state.contains("running", ignoreCase = true)) Color.Green else Color.Gray
                )
            }
            
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = {
                        scope.launch {
                            DockerClient.startContainer(container.id)
                            onRefresh()
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4CAF50))
                ) {
                    Text("Start")
                }
                
                Button(
                    onClick = {
                         scope.launch {
                            DockerClient.stopContainer(container.id)
                            onRefresh()
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF44336))
                ) {
                    Text("Stop")
                }
            }
        }
    }
}