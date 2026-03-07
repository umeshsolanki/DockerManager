package com.umeshsolanki.ucpanel

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Analytics
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.NetworkCheck
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ViewAgenda
import androidx.compose.material3.*
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.umeshsolanki.ucpanel.screens.ComposeScreen
import com.umeshsolanki.ucpanel.screens.ContainersScreen
import com.umeshsolanki.ucpanel.screens.ProxyScreen
import com.umeshsolanki.ucpanel.screens.SettingsScreen
import com.umeshsolanki.ucpanel.screens.LoginScreen
import com.umeshsolanki.ucpanel.screens.DashboardScreen
import com.umeshsolanki.ucpanel.screens.AnalyticsScreen
import com.umeshsolanki.ucpanel.screens.SecurityScreen
import androidx.compose.material.icons.filled.BatteryChargingFull
import androidx.compose.material.icons.filled.BatteryFull
import androidx.compose.material.icons.filled.BatteryStd
import androidx.compose.runtime.LaunchedEffect
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import com.umeshsolanki.ucpanel.api.SystemApiService
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController

@OptIn(ExperimentalMaterial3Api::class)
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
        val navController = rememberNavController()

        val startDest = if (SettingsManager.getAuthToken().isNotEmpty()) "main" else "login"
        NavHost(navController = navController, startDestination = startDest) {
            composable("login") {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    LoginScreen(onLoginSuccess = {
                        navController.navigate("main") {
                            popUpTo("login") { inclusive = true }
                        }
                    })
                }
            }
            composable("main") {
                MainApp()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainApp() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route ?: "containers"

    var batteryStatus by remember { mutableStateOf<BatteryStatus?>(null) }
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()

    BackHandler(enabled = drawerState.isOpen) {
        scope.launch {
            drawerState.close()
        }
    }

    LaunchedEffect(Unit) {
        while (true) {
            batteryStatus = SystemApiService.getBatteryStatus()
            delay(15*60_000) // Refresh every 60s
        }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                    Text(
                        "DM",
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(bottom = 16.dp)
                    )
                    // Battery Indicator
                    batteryStatus?.let { status ->
                        if (status.percentage >= 0) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                modifier = Modifier.padding(bottom = 16.dp)
                            ) {
                                Icon(
                                    imageVector = when {
                                        status.isCharging -> Icons.Default.BatteryChargingFull
                                        status.percentage > 80 -> Icons.Default.BatteryFull
                                        else -> Icons.Default.BatteryStd
                                    },
                                    contentDescription = "Battery",
                                    tint = if (status.isCharging) Color.Green else MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(20.dp)
                                )
                                Text(
                                    text = "${status.percentage}%",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                    HorizontalDivider(modifier = Modifier.padding(bottom = 16.dp))
                }

                NavigationDrawerItem(
                    label = { Text("Dashboard") },
                    icon = { Icon(Icons.Default.Dashboard, contentDescription = "Dashboard") },
                    selected = currentRoute == "dashboard",
                    onClick = {
                        navController.navigate("dashboard") {
                            launchSingleTop = true
                        }
                        scope.launch { drawerState.close() }
                    },
                    modifier = Modifier.padding(horizontal = 12.dp)
                )

                NavigationDrawerItem(
                    label = { Text("Containers") },
                    icon = { Icon(Icons.Default.ViewAgenda, contentDescription = "Containers") },
                    selected = currentRoute == "containers",
                    onClick = {
                        navController.navigate("containers") {
                            launchSingleTop = true
                        }
                        scope.launch { drawerState.close() }
                    },
                    modifier = Modifier.padding(horizontal = 12.dp)
                )

                NavigationDrawerItem(
                    label = { Text("Compose") },
                    icon = { Icon(Icons.Default.Layers, contentDescription = "Compose") },
                    selected = currentRoute == "compose",
                    onClick = {
                        navController.navigate("compose") {
                            launchSingleTop = true
                        }
                        scope.launch { drawerState.close() }
                    },
                    modifier = Modifier.padding(horizontal = 12.dp)
                )

                NavigationDrawerItem(
                    label = { Text("Proxy") },
                    icon = { Icon(Icons.Default.NetworkCheck, contentDescription = "Proxy") },
                    selected = currentRoute == "proxy",
                    onClick = {
                        navController.navigate("proxy") {
                            launchSingleTop = true
                        }
                        scope.launch { drawerState.close() }
                    },
                    modifier = Modifier.padding(horizontal = 12.dp)
                )

                NavigationDrawerItem(
                    label = { Text("Analytics") },
                    icon = { Icon(Icons.Default.Analytics, contentDescription = "Analytics") },
                    selected = currentRoute == "analytics",
                    onClick = {
                        navController.navigate("analytics") {
                            launchSingleTop = true
                        }
                        scope.launch { drawerState.close() }
                    },
                    modifier = Modifier.padding(horizontal = 12.dp)
                )

                NavigationDrawerItem(
                    label = { Text("Security") },
                    icon = { Icon(Icons.Default.Security, contentDescription = "Security") },
                    selected = currentRoute == "security",
                    onClick = {
                        navController.navigate("security") {
                            launchSingleTop = true
                        }
                        scope.launch { drawerState.close() }
                    },
                    modifier = Modifier.padding(horizontal = 12.dp)
                )

                Spacer(modifier = Modifier.weight(1f))

                NavigationDrawerItem(
                    label = { Text("Settings") },
                    icon = { Icon(Icons.Default.Settings, contentDescription = "Settings") },
                    selected = currentRoute == "settings",
                    onClick = {
                        navController.navigate("settings") {
                            launchSingleTop = true
                        }
                        scope.launch { drawerState.close() }
                    },
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 16.dp)
                )
            }
        }
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Text(
                            when(currentRoute) {
                                "dashboard" -> "Dashboard"
                                "containers" -> "Containers"
                                "compose" -> "Compose"
                                "proxy" -> "Proxy"
                                "analytics" -> "Analytics"
                                "security" -> "Security"
                                "settings" -> "Settings"
                                else -> "Docker Manager"
                            }
                        )
                    },
                    navigationIcon = {
                        IconButton(onClick = { scope.launch { drawerState.open() } }) {
                            Icon(Icons.Default.Menu, contentDescription = "Menu")
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        titleContentColor = MaterialTheme.colorScheme.onSurface
                    )
                )
            }
        ) { innerPadding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
            ) {
                NavHost(navController = navController, startDestination = "dashboard") {
                    composable("dashboard") { DashboardScreen() }
                    composable("containers") { ContainersScreen() }
                    composable("compose") { ComposeScreen() }
                    composable("proxy") { ProxyScreen() }
                    composable("analytics") { AnalyticsScreen() }
                    composable("security") { SecurityScreen() }
                    composable("settings") { SettingsScreen() }
                }
            }
        }
    }
}