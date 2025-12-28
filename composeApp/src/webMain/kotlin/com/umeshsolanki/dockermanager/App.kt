package com.umeshsolanki.dockermanager

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.ViewAgenda
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.umeshsolanki.dockermanager.screens.ComposeScreen
import com.umeshsolanki.dockermanager.screens.ContainersScreen
import com.umeshsolanki.dockermanager.screens.ImagesScreen
import com.umeshsolanki.dockermanager.screens.SettingsScreen

@Composable
fun App() {
    val darkColorScheme = darkColorScheme(
        primary = Color(0xFFD0BCFF),
        secondary = Color(0xFFCCC2DC),
        tertiary = Color(0xFFEFB8C8),
        background = Color(0xFF1C1B1F),
        surface = Color(0xFF1C1B1F),
        onPrimary = Color(0xFF381E72),
        onSecondary = Color(0xFF332D41),
        onTertiary = Color(0xFF492532),
        onBackground = Color(0xFFE6E1E5),
        onSurface = Color(0xFFE6E1E5),
    )

    MaterialTheme(colorScheme = darkColorScheme) {
        var selectedTab by remember { mutableStateOf(0) }
        val titles = listOf("Containers", "Images", "Compose", "Settings")

        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
            Row(modifier = Modifier.fillMaxSize()) {
                NavigationRail(
                    modifier = Modifier.fillMaxHeight(),
                    containerColor = MaterialTheme.colorScheme.surface,
                    contentColor = MaterialTheme.colorScheme.onSurface,
                    header = {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                "DM",
                                style = MaterialTheme.typography.headlineSmall,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(bottom = 16.dp)
                            )
                        }
                    }
                ) {
                    NavigationRailItem(
                        selected = selectedTab == 0,
                        onClick = { selectedTab = 0 },
                        icon = {
                            Icon(
                                Icons.Default.ViewAgenda,
                                contentDescription = "Containers"
                            )
                        },
                        label = { Text("Containers") }
                    )
                    NavigationRailItem(
                        selected = selectedTab == 1,
                        onClick = { selectedTab = 1 },
                        icon = { Icon(Icons.Default.Storage, contentDescription = "Images") },
                        label = { Text("Images") }
                    )
                    NavigationRailItem(
                        selected = selectedTab == 2,
                        onClick = { selectedTab = 2 },
                        icon = { Icon(Icons.Default.Layers, contentDescription = "Compose") },
                        label = { Text("Compose") }
                    )

                    Spacer(modifier = Modifier.weight(1f))

                    NavigationRailItem(
                        selected = selectedTab == 3,
                        onClick = { selectedTab = 3 },
                        icon = { Icon(Icons.Default.Settings, contentDescription = "Settings") },
                        label = { Text("Settings") }
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                }

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 32.dp, vertical = 24.dp)
                ) {
                    Column(modifier = Modifier.fillMaxSize()) {
                        Text(
                            text = titles[selectedTab],
                            style = MaterialTheme.typography.headlineLarge,
                            color = MaterialTheme.colorScheme.onBackground,
                            modifier = Modifier.padding(bottom = 32.dp)
                        )

                        Box(modifier = Modifier.weight(1f)) {
                            when (selectedTab) {
                                0 -> ContainersScreen()
                                1 -> ImagesScreen()
                                2 -> ComposeScreen()
                                3 -> SettingsScreen()
                            }
                        }
                    }
                }
            }
        }
    }
}