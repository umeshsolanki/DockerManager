package com.umeshsolanki.ucpanel.previews

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.umeshsolanki.ucpanel.App
import com.umeshsolanki.ucpanel.ComposeFile
import com.umeshsolanki.ucpanel.DockerContainer
import com.umeshsolanki.ucpanel.screens.ComposeContent
import com.umeshsolanki.ucpanel.screens.ContainersContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Preview(showBackground = true)
@Composable
fun MainAppPreview() {
    App()
}

@Preview(showBackground = true)
@Composable
fun ContainersPreview() {
    MaterialTheme {
        Box(modifier = Modifier.padding(16.dp)) {
            ContainersContent(
                containers = listOf(
                    DockerContainer("1", "/nginx-proxy", "nginx:latest", "Up 2 hours", "running"),
                    DockerContainer("2", "/db-main", "postgres:14", "Exited (0) 5 mins ago", "exited"),
                    DockerContainer("3", "/web-app", "node:18", "Up 45 mins", "running")
                ),
                isLoading = false,
                onRefresh = {},
                onStart = {},
                onStop = {},
                onRemove = {},
                onPrune = {}
            )
        }
    }
}

@Preview(showBackground = true)
@Composable
fun ComposePreview() {
    MaterialTheme {
        Box(modifier = Modifier.padding(16.dp)) {
            ComposeContent(
                composeFiles = listOf(
                    ComposeFile("/projects/app1/docker-compose.yml", "Web Application", "inactive"),
                    ComposeFile("/projects/db/docker-compose.yml", "Database Stack", "active")
                ),
                isLoading = false,
                onRefresh = {},
                onUp = {},
                onDown = {}
            )
        }
    }
}
