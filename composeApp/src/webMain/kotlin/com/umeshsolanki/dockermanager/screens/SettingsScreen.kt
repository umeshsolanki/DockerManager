package com.umeshsolanki.dockermanager.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.umeshsolanki.dockermanager.DockerClient

@Composable
fun SettingsScreen() {
    var serverUrl by remember { mutableStateOf(DockerClient.getServerUrl()) }
    var message by remember { mutableStateOf("") }

    Column(modifier = Modifier.fillMaxSize()) {
        ElevatedCard(
            modifier = Modifier.fillMaxWidth(0.6f), // Keep it centered/compact
            shape = MaterialTheme.shapes.extraLarge
        ) {
            Column(modifier = Modifier.padding(32.dp)) {
                Text(
                    "Server Configuration",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.primary
                )

                Spacer(modifier = Modifier.height(24.dp))

                OutlinedTextField(
                    value = serverUrl,
                    onValueChange = { serverUrl = it },
                    label = { Text("Server URL") },
                    placeholder = { Text("e.g., http://192.168.1.100:8080") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    leadingIcon = { Icon(Icons.Default.Link, contentDescription = null) },
                    shape = MaterialTheme.shapes.medium
                )

                Spacer(modifier = Modifier.height(12.dp))

                Text(
                    text = "Specify the Docker Manager server address. If left blank, the app will try to auto-detect the host.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(modifier = Modifier.height(32.dp))

                Button(
                    onClick = {
                        DockerClient.setServerUrl(serverUrl)
                        message = "Settings saved successfully!"
                    },
                    modifier = Modifier.align(Alignment.End),
                    shape = MaterialTheme.shapes.medium,
                    contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp)
                ) {
                    Icon(
                        Icons.Default.Save,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Save Changes")
                }

                if (message.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = message,
                        color = Color(0xFF4CAF50),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        }
    }
}
