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
        var selectedTab by remember { mutableStateOf(0) }
        val titles = listOf("Containers", "Images", "Compose", "Settings")

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

            TabRow(selectedTabIndex = selectedTab) {
                titles.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = { Text(title) }
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(16.dp))

            when (selectedTab) {
                0 -> ContainersScreen()
                1 -> ImagesScreen()
                2 -> ComposeScreen()
                3 -> SettingsScreen()
            }
        }
    }
}

@Composable
fun ContainersScreen() {
    var containers by remember { mutableStateOf<List<DockerContainer>>(emptyList()) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        containers = DockerClient.listContainers()
    }
    
    fun refresh() {
        scope.launch {
            containers = DockerClient.listContainers()
        }
    }

    Column {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
             Button(onClick = { refresh() }) {
                Text("Refresh")
            }
            Button(
                onClick = {
                    scope.launch {
                        DockerClient.pruneContainers()
                        refresh()
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = Color.Red)
            ) {
                Text("Prune Stopped")
            }
        }
       
        Spacer(modifier = Modifier.height(8.dp))

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(containers) { container ->
                ContainerRow(container) { refresh() }
            }
        }
    }
}

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
            text = "Leave empty to use default dynamic host detection.",
            style = MaterialTheme.typography.bodySmall,
             color = Color.Gray
        )

        Spacer(modifier = Modifier.height(16.dp))
        
        Button(
            onClick = {
                DockerClient.setServerUrl(serverUrl)
                message = "Settings saved! Refresh or restart may be needed."
            }
        ) {
            Text("Save")
        }
        
        if (message.isNotEmpty()) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = message, color = Color.Green)
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
            modifier = Modifier.padding(16.dp).fillMaxWidth(),
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
                
                 if (!container.state.contains("running", ignoreCase = true)) {
                    Button(
                        onClick = {
                            scope.launch {
                                DockerClient.removeContainer(container.id)
                                onRefresh()
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color.Gray)
                    ) {
                        Text("Remove")
                    }
                }
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
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4CAF50))
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
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF44336))
                ) {
                    Text("Down")
                }
            }
        }
    }
}