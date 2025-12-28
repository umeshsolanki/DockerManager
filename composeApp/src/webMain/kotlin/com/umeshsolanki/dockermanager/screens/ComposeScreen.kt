package com.umeshsolanki.dockermanager.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import com.umeshsolanki.dockermanager.DockerClient
import com.umeshsolanki.dockermanager.ComposeFile

@Composable
fun ComposeScreen() {
    var composeFiles by remember { mutableStateOf<List<ComposeFile>>(emptyList()) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        composeFiles = DockerClient.listComposeFiles()
    }

    fun refresh() {
        scope.launch {
            composeFiles = DockerClient.listComposeFiles()
        }
    }

    Column {
        Button(onClick = { refresh() }) {
            Text("Refresh")
        }

        Spacer(modifier = Modifier.height(8.dp))

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(composeFiles) { file ->
                ComposeRow(file) { refresh() }
            }
        }
    }
}

@Composable
fun ComposeRow(file: ComposeFile, onRefresh: () -> Unit) {
    val scope = rememberCoroutineScope()
    
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp).fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(text = file.name, style = MaterialTheme.typography.titleMedium)
                Text(text = file.path, style = MaterialTheme.typography.bodySmall)
            }
            
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = {
                        scope.launch {
                            DockerClient.composeUp(file.path)
                            onRefresh()
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = androidx.compose.ui.graphics.Color(0xFF4CAF50))
                ) {
                    Text("Up")
                }
                
                Button(
                    onClick = {
                        scope.launch {
                            DockerClient.composeDown(file.path)
                            onRefresh()
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = androidx.compose.ui.graphics.Color(0xFFF44336))
                ) {
                    Text("Down")
                }
            }
        }
    }
}
