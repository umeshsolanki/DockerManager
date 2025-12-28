package com.umeshsolanki.dockermanager.screens

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
import com.umeshsolanki.dockermanager.DockerClient
import com.umeshsolanki.dockermanager.DockerImage

@Composable
fun ImagesScreen() {
    var images by remember { mutableStateOf<List<DockerImage>>(emptyList()) }
    var imageName by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        images = DockerClient.listImages()
    }
    
    fun refresh() {
        scope.launch {
            images = DockerClient.listImages()
        }
    }

    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = imageName,
                onValueChange = { imageName = it },
                label = { Text("Image Name") },
                modifier = Modifier.weight(1f)
            )
            Button(onClick = {
                scope.launch {
                    DockerClient.pullImage(imageName)
                    imageName = ""
                    refresh()
                }
            }) {
                Text("Pull")
            }
             Button(onClick = { refresh() }) {
                Text("Refresh")
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(images) { image ->
                ImageRow(image) { refresh() }
            }
        }
    }
}

@Composable
fun ImageRow(image: DockerImage, onRefresh: () -> Unit) {
    val scope = rememberCoroutineScope()
    val tags = image.tags.joinToString(", ")
    
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
                Text(text = if (tags.isNotEmpty()) tags else image.id.take(12), style = MaterialTheme.typography.titleMedium)
                Text(text = "Size: ${image.size / 1024 / 1024} MB", style = MaterialTheme.typography.bodySmall)
            }
            
            Button(
                onClick = {
                    scope.launch {
                         DockerClient.removeImage(image.id)
                         onRefresh()
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF44336))
            ) {
                Text("Remove")
            }
        }
    }
}
