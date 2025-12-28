package com.umeshsolanki.dockermanager.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.umeshsolanki.dockermanager.DockerClient

@Composable
fun SettingsScreen() {
    var serverUrl by remember { mutableStateOf(DockerClient.getServerUrl()) }
    var message by remember { mutableStateOf("") }
    
    Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
        Text("Settings", style = MaterialTheme.typography.headlineSmall)
        
        Spacer(modifier = Modifier.height(16.dp))
        
        OutlinedTextField(
            value = serverUrl,
            onValueChange = { serverUrl = it },
            label = { Text("Server URL") },
            placeholder = { Text("e.g., http://192.168.1.100:8080") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Text(
            text = "Enter the server URL including protocol and port.",
            style = MaterialTheme.typography.bodySmall,
             color = Color.Gray
        )

        Spacer(modifier = Modifier.height(16.dp))
        
        Button(
            onClick = {
                DockerClient.setServerUrl(serverUrl)
                message = "Settings saved!"
            }
        ) {
            Text("Save")
        }
        
        if (message.isNotEmpty()) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = message, color = Color(0xFF4CAF50))
        }
    }
}
