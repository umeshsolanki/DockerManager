package com.umeshsolanki.ucpanel.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.umeshsolanki.ucpanel.AuthRequest
import com.umeshsolanki.ucpanel.SettingsManager
import com.umeshsolanki.ucpanel.api.SystemApiService
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(onLoginSuccess: () -> Unit) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var otpCode by remember { mutableStateOf("") }
    var requires2fa by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        ElevatedCard(
            modifier = Modifier.fillMaxWidth().padding(32.dp).widthIn(max = 400.dp),
            shape = MaterialTheme.shapes.extraLarge
        ) {
            Column(
                modifier = Modifier.padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = "Welcome to UCPanel",
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.primary
                )

                Spacer(modifier = Modifier.height(16.dp))

                OutlinedTextField(
                    value = username,
                    onValueChange = { username = it },
                    label = { Text("Username (or leave blank if default)") },
                    leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.None,
                        autoCorrectEnabled = false,
                        keyboardType = KeyboardType.Unspecified,
                        imeAction = ImeAction.Unspecified,
                        platformImeOptions = null,
                        showKeyboardOnFocus = null,
                        hintLocales = null
                    )
                )

                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                    trailingIcon = {
                        val image =
                            if (passwordVisible) Icons.Default.Visibility else Icons.Default.VisibilityOff
                        IconButton(onClick = { passwordVisible = !passwordVisible }) {
                            Icon(
                                imageVector = image,
                                contentDescription = if (passwordVisible) "Hide password" else "Show password"
                            )
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.None,
                        autoCorrectEnabled = false,
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Unspecified,
                        platformImeOptions = null,
                        showKeyboardOnFocus = null,
                        hintLocales = null
                    )
                )

                if (requires2fa) {
                    OutlinedTextField(
                        value = otpCode,
                        onValueChange = { otpCode = it },
                        label = { Text("2FA Code") },
                        leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        placeholder = { Text("Enter 6-digit code") },
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.NumberPassword
                        )
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                if (errorMessage != null) {
                    Text(
                        text = errorMessage ?: "",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                }

                Button(
                    onClick = {
                        scope.launch {
                            isLoading = true
                            errorMessage = null
                            val authResult = SystemApiService.authenticate(
                                AuthRequest(
                                    username = username.trim().takeIf { it.isNotEmpty() },
                                    password = password.trim(),
                                    otpCode = if (requires2fa) otpCode.trim() else null
                                )
                            )
                            if (authResult.response != null) {
                                val authResponse = authResult.response
                                if (authResponse.requires2FA) {
                                    requires2fa = true
                                    errorMessage = "Please enter 2FA code"
                                } else if (authResponse.token.isNotBlank()) {
                                    SettingsManager.setAuthToken(authResponse.token)
                                    try {
                                        val apiKey = SystemApiService.fetchFcmApiKey()
                                        if (!apiKey.isNullOrBlank()) SettingsManager.setFcmApiKey(apiKey)
                                    } catch (_: Exception) {}
                                    onLoginSuccess()
                                } else {
                                    errorMessage = "Login failed: No token received"
                                }
                            } else {
                                errorMessage =
                                    authResult.error ?: "Invalid credentials or server error"
                            }
                            isLoading = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    enabled = username.isNotBlank() && password.isNotBlank() && !isLoading
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp),
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text("Sign In")
                    }
                }
            }
        }
    }
}
