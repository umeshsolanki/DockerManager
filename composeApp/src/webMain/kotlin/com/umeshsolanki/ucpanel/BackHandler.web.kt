package com.umeshsolanki.ucpanel

import androidx.compose.runtime.Composable

@Composable
actual fun BackHandler(enabled: Boolean, onBack: () -> Unit) {
    // No-op for web, or could handle browser back if needed
}
