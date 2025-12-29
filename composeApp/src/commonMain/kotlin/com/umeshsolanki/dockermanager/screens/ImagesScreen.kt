package com.umeshsolanki.dockermanager.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
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

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val isWide = maxWidth > 800.dp

        Column(modifier = Modifier.fillMaxSize()) {
            if (isLoading) {
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth().height(2.dp),
                    color = MaterialTheme.colorScheme.primary,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant
                )
                Spacer(modifier = Modifier.height(12.dp))
            }

            if (isWide) {
                ElevatedCard(
                    modifier = Modifier.fillMaxWidth(),
                    shape = MaterialTheme.shapes.large
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp).fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        SearchControls(
                            value = searchQuery,
                            onValueChange = { searchQuery = it },
                            onRefresh = onRefresh,
                            modifier = Modifier.weight(1f)
                        )

                        PullImageControls(
                            value = pullImageName,
                            onValueChange = { pullImageName = it },
                            onPull = {
                                onPull(it)
                                pullImageName = ""
                            },
                            modifier = Modifier.weight(1f)
                        )
                        
                        Spacer(modifier = Modifier.width(24.dp))
                    }
                }
            } else {
                ElevatedCard(
                    modifier = Modifier.fillMaxWidth(),
                    shape = MaterialTheme.shapes.large
                ) {
                    PullImageControls(
                        value = pullImageName,
                        onValueChange = { pullImageName = it },
                        onPull = {
                            onPull(it)
                            pullImageName = ""
                        },
                        modifier = Modifier.padding(16.dp).fillMaxWidth()
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))

                SearchControls(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    onRefresh = onRefresh,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            if (filteredImages.isEmpty()) {
                Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text(
                        "No images found",
                        style = MaterialTheme.typography.bodyLarge,
                        color = Color.Gray
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.weight(1f),
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
}

@Composable
fun PullImageControls(
    value: String,
    onValueChange: (String) -> Unit,
    onPull: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = { Text("Image (e.g. nginx)") },
            modifier = Modifier.weight(1f),
            singleLine = true,
            shape = MaterialTheme.shapes.medium,
            leadingIcon = { Icon(Icons.Default.CloudDownload, contentDescription = null) }
        )
        
        Spacer(modifier = Modifier.width(12.dp))
        
        Button(
            onClick = { onPull(value) },
            shape = MaterialTheme.shapes.medium
        ) {
            Text("Pull")
        }
    }
}

@Composable
fun SearchControls(
    value: String,
    onValueChange: (String) -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = { Text("Search images...") },
            modifier = Modifier.weight(1f),
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            shape = MaterialTheme.shapes.medium,
            singleLine = true
        )

        Spacer(modifier = Modifier.width(12.dp))

        IconButton(onClick = onRefresh) {
            Icon(Icons.Default.Refresh, contentDescription = "Refresh")
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
