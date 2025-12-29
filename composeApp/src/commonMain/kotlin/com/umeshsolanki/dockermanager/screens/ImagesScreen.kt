package com.umeshsolanki.dockermanager.screens

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
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
import com.umeshsolanki.dockermanager.DockerImage
import kotlinx.coroutines.launch
import org.jetbrains.compose.ui.tooling.preview.Preview

@Composable
fun ImagesScreen() {
    var images by remember { mutableStateOf<List<DockerImage>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        isLoading = true
        images = DockerClient.listImages()
        isLoading = false
    }

    fun refresh() {
        scope.launch {
            isLoading = true
            images = DockerClient.listImages()
            isLoading = false
        }
    }

    ImagesContent(
        images = images,
        isLoading = isLoading,
        onRefresh = { refresh() },
        onPull = { name ->
            scope.launch {
                isLoading = true
                DockerClient.pullImage(name)
                refresh()
            }
        },
        onRemove = { id ->
            scope.launch {
                isLoading = true
                DockerClient.removeImage(id)
                refresh()
            }
        }
    )
}

@Composable
fun ImagesContent(
    images: List<DockerImage>,
    isLoading: Boolean,
    onRefresh: () -> Unit,
    onPull: (String) -> Unit,
    onRemove: (String) -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    var pullImageName by remember { mutableStateOf("") }

    val filteredImages = images.filter { image ->
        val tags = image.tags.joinToString(", ")
        tags.contains(searchQuery, ignoreCase = true) || image.id.contains(
            searchQuery,
            ignoreCase = true
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

        // Pull Image Section
        ElevatedCard(
            modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.large
        ) {
            Row(
                modifier = Modifier.padding(16.dp).fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = pullImageName,
                    onValueChange = { pullImageName = it },
                    placeholder = { Text("Pull new image (e.g. nginx:latest)") },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    shape = MaterialTheme.shapes.medium
                )
                Spacer(modifier = Modifier.width(16.dp))
                Button(
                    onClick = {
                        onPull(pullImageName)
                        pullImageName = ""
                    }, shape = MaterialTheme.shapes.medium
                ) {
                    Icon(Icons.Default.CloudDownload, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Pull")
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // Search and Actions
        Row(
            modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = { Text("Search images...") },
                modifier = Modifier.weight(1f),
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                shape = MaterialTheme.shapes.medium
            )

            Spacer(modifier = Modifier.width(16.dp))

            IconButton(onClick = { onRefresh() }) {
                Icon(Icons.Default.Refresh, contentDescription = "Refresh")
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        if (filteredImages.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    "No images found",
                    style = MaterialTheme.typography.bodyLarge,
                    color = Color.Gray
                )
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(bottom = 16.dp)
            ) {
                items(filteredImages) { image ->
                    ImageRow(image, onRefresh, onRemove)
                }
            }
        }
    }
}

@Composable
fun ImageRow(
    image: DockerImage,
    onRefresh: () -> Unit,
    onRemove: (String) -> Unit
) {
    val tags = image.tags.joinToString(", ")

    ElevatedCard(
        modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.large
    ) {
        Row(
            modifier = Modifier.padding(20.dp).fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (tags.isNotEmpty()) tags else "ID: ${image.id.take(12)}",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(modifier = Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.Info,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "Size: ${image.size / 1024 / 1024} MB",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            IconButton(
                onClick = {
                    onRemove(image.id)
                }) {
                Icon(Icons.Default.Delete, contentDescription = "Remove", tint = Color(0xFFF44336))
            }
        }
    }
}

@Preview
@Composable
fun ImagesPreview() {
    MaterialTheme {
        Box(modifier = Modifier.padding(16.dp)) {
            ImagesContent(
                images = listOf(
                    DockerImage(id = "1", tags = listOf("nginx:latest", "nginx:1.21"), size = 150 * 1024 * 1024, created = 0),
                    DockerImage(id = "2", tags = listOf("postgres:14-alpine"), size = 230 * 1024 * 1024, created = 0),
                    DockerImage(id = "3", tags = listOf("ubuntu:22.04"), size = 80 * 1024 * 1024, created = 0)
                ),
                isLoading = false,
                onRefresh = {},
                onPull = {},
                onRemove = {}
            )
        }
    }
}
