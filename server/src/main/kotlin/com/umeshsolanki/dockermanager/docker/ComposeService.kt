package com.umeshsolanki.dockermanager.docker
import com.umeshsolanki.dockermanager.*

import java.io.File
import java.util.concurrent.TimeUnit

interface IComposeService {
    fun listComposeFiles(): List<ComposeFile>
    fun composeUp(filePath: String): ComposeResult
    fun composeDown(filePath: String): ComposeResult
    fun composeBuild(filePath: String): ComposeResult
    fun saveComposeFile(name: String, content: String): Boolean
    fun saveProjectFile(projectName: String, fileName: String, content: String): Boolean
    fun getComposeFileContent(filePath: String): String
    fun getProjectFileContent(projectName: String, fileName: String): String
    fun backupCompose(name: String): BackupResult
    fun backupAllCompose(): BackupResult
    
    // Docker Stack operations
    fun listStacks(): List<DockerStack>
    fun deployStack(stackName: String, composeFile: String): ComposeResult
    fun removeStack(stackName: String): ComposeResult
    fun startStack(stackName: String, composeFile: String): ComposeResult
    fun stopStack(stackName: String): ComposeResult
    fun restartStack(stackName: String, composeFile: String): ComposeResult
    fun updateStack(stackName: String, composeFile: String): ComposeResult
    fun listStackServices(stackName: String): List<StackService>
    fun listStackTasks(stackName: String): List<StackTask>
    
    // Status checking
    fun checkComposeFileStatus(filePath: String): String
    fun checkStackStatus(stackName: String): String
    
    // Migration
    fun migrateComposeToStack(composeFilePath: String, stackName: String): ComposeResult
}

class ComposeServiceImpl : IComposeService {
    private val logger = org.slf4j.LoggerFactory.getLogger(ComposeServiceImpl::class.java)
    private val composeDir = AppConfig.composeProjDir
    private val backupDir = File(AppConfig.backupDir, "compose")

    init {
        if (!composeDir.exists()) composeDir.mkdirs()
        if (!backupDir.exists()) backupDir.mkdirs()
    }

    override fun listComposeFiles(): List<ComposeFile> {
        if (!composeDir.exists()) composeDir.mkdirs()

        return composeDir.walk()
            .filter { it.isFile && (it.name == "docker-compose.yml" || it.name == "docker-compose.yaml") }
            .map { file ->
                val projectName = file.parentFile.name
                val status = checkComposeStatus(file.absolutePath, projectName)
                ComposeFile(
                    path = file.absolutePath, name = projectName, status = status
                )
            }.toList()
    }

    private fun checkComposeStatus(filePath: String, projectName: String): String {
        return try {
            // Check if containers from this compose project are running
            // Docker Compose sets labels like com.docker.compose.project=projectName
            val process = ProcessBuilder(
                AppConfig.dockerCommand,
                "ps",
                "--filter", "label=com.docker.compose.project=$projectName",
                "--format", "{{.State}}"
            )
                .redirectErrorStream(true)
                .start()
            
            val output = process.inputStream.bufferedReader().readText()
            val success = process.waitFor(5, TimeUnit.SECONDS) && process.exitValue() == 0
            
            if (!success || output.isBlank()) {
                // Check if any containers exist (stopped)
                val processAll = ProcessBuilder(
                    AppConfig.dockerCommand,
                    "ps", "-a",
                    "--filter", "label=com.docker.compose.project=$projectName",
                    "--format", "{{.State}}"
                )
                    .redirectErrorStream(true)
                    .start()
                
                val outputAll = processAll.inputStream.bufferedReader().readText()
                val successAll = processAll.waitFor(5, TimeUnit.SECONDS) && processAll.exitValue() == 0
                
                if (successAll && outputAll.isNotBlank()) {
                    "stopped"
                } else {
                    "inactive"
                }
            } else {
                val states = output.lines().filter { it.isNotBlank() }.map { it.trim().lowercase() }
                val runningCount = states.count { it == "running" }
                val totalCount = states.size
                
                if (runningCount == 0) {
                    "stopped"
                } else if (runningCount == totalCount) {
                    "active"
                } else {
                    "partial"
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
            "unknown"
        }
    }

    override fun checkComposeFileStatus(filePath: String): String {
        val file = File(filePath)
        if (!file.exists()) return "not found"
        val projectName = file.parentFile.name
        return checkComposeStatus(filePath, projectName)
    }

    override fun checkStackStatus(stackName: String): String {
        return try {
            val stacks = listStacks()
            val stack = stacks.find { it.name == stackName }
            if (stack == null) {
                "not found"
            } else if (stack.services > 0) {
                // Check services first - more reliable indicator
                val services = listStackServices(stackName)
                if (services.isEmpty()) {
                    // Fallback to tasks if services list is empty
                    val tasks = listStackTasks(stackName)
                    val runningTasks = tasks.count { 
                        it.currentState.equals("Running", ignoreCase = true) || 
                        it.currentState.equals("running", ignoreCase = true)
                    }
                    return if (runningTasks > 0) "active" else "stopped"
                }
                
                // Check if any service has running replicas
                val hasRunningReplicas = services.any { service ->
                    val replicas = service.replicas.split("/")
                    if (replicas.size == 2) {
                        val running = replicas[0].trim().toIntOrNull() ?: 0
                        val desired = replicas[1].trim().toIntOrNull() ?: 0
                        running > 0 && desired > 0
                    } else {
                        false
                    }
                }
                
                if (hasRunningReplicas) {
                    "active"
                } else {
                    // Double-check with tasks as fallback
                    val tasks = listStackTasks(stackName)
                    val runningTasks = tasks.count { 
                        val state = it.currentState.lowercase()
                        state == "running" || state.contains("running")
                    }
                    if (runningTasks > 0) {
                        "active"
                    } else {
                        "stopped"
                    }
                }
            } else {
                "stopped"
            }
        } catch (e: Exception) {
            logger.error("Error checking stack status for $stackName", e)
            e.printStackTrace()
            "unknown"
        }
    }

    override fun migrateComposeToStack(composeFilePath: String, stackName: String): ComposeResult {
        val file = File(composeFilePath)
        if (!file.exists()) return ComposeResult(false, "Compose file not found: $composeFilePath")

        return try {
            logger.info("Migrating compose project from ${file.parentFile.name} to stack '$stackName'")
            
            // Step 1: Stop the compose project if it's running
            val downResult = composeDown(composeFilePath)
            if (!downResult.success && !downResult.message.contains("not found") && !downResult.message.contains("No such")) {
                // Log warning but continue - compose might not be running
                logger.warn("Compose down had issues but continuing migration: ${downResult.message}")
            } else if (downResult.success) {
                logger.info("Compose project stopped successfully")
            }

            // Step 2: Deploy as stack
            logger.info("Deploying compose file as stack '$stackName'")
            val deployResult = deployStack(stackName, composeFilePath)
            
            if (deployResult.success) {
                logger.info("Successfully migrated compose project to stack '$stackName'")
                ComposeResult(true, "Successfully migrated compose project to stack '$stackName'")
            } else {
                logger.error("Failed to deploy as stack: ${deployResult.message}")
                ComposeResult(false, "Failed to deploy as stack: ${deployResult.message}")
            }
        } catch (e: Exception) {
            logger.error("Error during migration", e)
            ComposeResult(false, "Error during migration: ${e.message ?: "Unknown error"}")
        }
    }

    override fun composeUp(filePath: String): ComposeResult {
        val file = File(filePath)
        if (!file.exists()) return ComposeResult(false, "File not found: $filePath")

        return try {
            // Use AppConfig.dockerComposeCommand which handles different compose command formats
            val composeCmd = AppConfig.dockerComposeCommand
            val process = if (composeCmd.contains("docker compose") || composeCmd == "docker compose") {
                // New docker compose plugin format
                ProcessBuilder("docker", "compose", "-f", filePath, "up", "-d")
            } else {
                // Legacy docker-compose format
                ProcessBuilder(composeCmd, "-f", filePath, "up", "-d")
            }
                .directory(file.parentFile)
                .redirectErrorStream(true)
                .start()
            
            val output = process.inputStream.bufferedReader().readText()
            val success = process.waitFor(5, TimeUnit.MINUTES) && process.exitValue() == 0

            ComposeResult(success, output.ifBlank { if (success) "Up" else "Failed to start" })
        } catch (e: Exception) {
            e.printStackTrace()
            ComposeResult(false, "Error: ${e.message ?: "Unknown error"}. Command: ${AppConfig.dockerComposeCommand}")
        }
    }

    override fun composeBuild(filePath: String): ComposeResult {
        val file = File(filePath)
        if (!file.exists()) return ComposeResult(false, "File not found: $filePath")
        val projectDir = file.parentFile
        val projectName = projectDir.name.lowercase()

        return try {
            val dockerfile = File(projectDir, "Dockerfile")
            if (dockerfile.exists()) {
                 // Build using Dockerfile with buildx
                val process = ProcessBuilder("docker", "buildx", "build", "--load", "-t", "$projectName:latest", ".")
                    .directory(projectDir)
                    .redirectErrorStream(true)
                    .start()
                
                val output = process.inputStream.bufferedReader().readText()
                val success = process.waitFor(20, TimeUnit.MINUTES) && process.exitValue() == 0

                ComposeResult(success, output.ifBlank { if (success) "Image Built Successfully: $projectName:latest" else "Failed to build image" })
            } else {
                // Build using docker-compose
                val composeCmd = AppConfig.dockerComposeCommand
                val process = if (composeCmd.contains("docker compose") || composeCmd == "docker compose") {
                    ProcessBuilder("docker", "compose", "-f", filePath, "build")
                } else {
                    ProcessBuilder(composeCmd, "-f", filePath, "build")
                }
                    .directory(projectDir)
                    .redirectErrorStream(true)
                    .start()
                
                val output = process.inputStream.bufferedReader().readText()
                val success = process.waitFor(20, TimeUnit.MINUTES) && process.exitValue() == 0

                ComposeResult(success, output.ifBlank { if (success) "Build Successful" else "Failed to build" })
            }
        } catch (e: Exception) {
            e.printStackTrace()
            ComposeResult(false, "Error: ${e.message ?: "Unknown error"}")
        }
    }

    override fun composeDown(filePath: String): ComposeResult {
        val file = File(filePath)
        if (!file.exists()) return ComposeResult(false, "File not found")

        return try {
            val process = ProcessBuilder("docker", "compose", "-f", filePath, "down", "-v")
                .directory(file.parentFile)
                .redirectErrorStream(true)
                .start()
            
            val output = process.inputStream.bufferedReader().readText()
            val success = process.waitFor(2, TimeUnit.MINUTES) && process.exitValue() == 0

            ComposeResult(success, output.ifBlank { if (success) "Down" else "Failed to stop" })
        } catch (e: Exception) {
            e.printStackTrace()
            ComposeResult(false, e.message ?: "Unknown error")
        }
    }

    override fun saveComposeFile(name: String, content: String): Boolean {
        return try {
            if (!composeDir.exists()) composeDir.mkdirs()
            val projectDir = File(composeDir, name)
            if (!projectDir.exists()) projectDir.mkdirs()

            val file = File(projectDir, "docker-compose.yml")
            file.writeText(content)
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    override fun saveProjectFile(projectName: String, fileName: String, content: String): Boolean {
        return try {
            if (!composeDir.exists()) composeDir.mkdirs()
            val projectDir = File(composeDir, projectName)
            if (!projectDir.exists()) projectDir.mkdirs()

            // Block directory traversal and sensitive files
            if (fileName.contains("..") || fileName.startsWith("/") || fileName.contains("\\")) {
                logger.warn("Attempt to write to invalid path: $fileName")
                return false
            }

            val file = File(projectDir, fileName)
            file.writeText(content)
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    override fun getComposeFileContent(filePath: String): String {
        return try {
            val file = File(filePath)
            if (file.exists()) {
                file.readText()
            } else {
                ""
            }
        } catch (e: Exception) {
            e.printStackTrace()
            ""
        }
    }

    override fun getProjectFileContent(projectName: String, fileName: String): String {
        return try {
            val projectDir = File(composeDir, projectName)
            // Block directory traversal and sensitive files
            if (fileName.contains("..") || fileName.startsWith("/") || fileName.contains("\\")) {
                logger.warn("Attempt to read from invalid path: $fileName")
                return ""
            }
            
            val file = File(projectDir, fileName)
            if (file.exists()) {
                file.readText()
            } else {
                ""
            }
        } catch (e: Exception) {
            e.printStackTrace()
            ""
        }
    }

    override fun backupCompose(name: String): BackupResult {
        return try {
            val projectDir = File(composeDir, name)
            if (!projectDir.exists()) return BackupResult(false, null, null, "Project not found")

            val fileName = "compose_${name}_${System.currentTimeMillis()}.tar.gz"
            val fullPath = File(backupDir, fileName).absolutePath

            val process =
                ProcessBuilder("tar", "-czf", fullPath, "-C", projectDir.parent, name).start()
            val exitCode = process.waitFor()

            if (exitCode == 0) {
                BackupResult(true, fileName, fullPath, "Backup created successfully")
            } else {
                BackupResult(false, null, null, "Failed to create backup")
            }
        } catch (e: Exception) {
            e.printStackTrace()
            BackupResult(false, null, null, "Error: ${e.message}")
        }
    }

    override fun backupAllCompose(): BackupResult {
        return try {
            if (!composeDir.exists()) return BackupResult(
                false,
                null,
                null,
                "No compose projects found"
            )

            val fileName = "compose_all_${System.currentTimeMillis()}.tar.gz"
            val fullPath = File(backupDir, fileName).absolutePath

            val process = ProcessBuilder(
                "tar",
                "-czf",
                fullPath,
                "-C",
                composeDir.parent,
                composeDir.name
            ).start()
            val exitCode = process.waitFor()

            if (exitCode == 0) {
                BackupResult(true, fileName, fullPath, "Full backup created successfully")
            } else {
                BackupResult(false, null, null, "Failed to create full backup")
            }
        } catch (e: Exception) {
            e.printStackTrace()
            BackupResult(false, null, null, "Error: ${e.message}")
        }
    }

    override fun listStacks(): List<DockerStack> {
        return try {
            val process = ProcessBuilder("docker", "stack", "ls", "--format", "{{.Name}}\t{{.Services}}")
                .redirectErrorStream(true)
                .start()
            
            val output = process.inputStream.bufferedReader().readText()
            val success = process.waitFor(30, TimeUnit.SECONDS) && process.exitValue() == 0
            
            if (!success) return emptyList()
            
            output.lines()
                .filter { it.isNotBlank() && !it.startsWith("NAME") }
                .map { line ->
                    val parts = line.split("\t")
                    if (parts.size >= 2) {
                        DockerStack(
                            name = parts[0].trim(),
                            services = parts[1].trim().toIntOrNull() ?: 0
                        )
                    } else {
                        DockerStack(name = parts[0].trim())
                    }
                }
                .toList()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    /**
     * Converts a Docker Compose file to Swarm-compatible format by:
     * 1. Removing unsupported `restart` options and converting to `deploy.restart_policy`
     * 2. Removing `container_name` (not supported in Swarm)
     * 3. Handling existing networks by marking them as external
     */
    private fun convertComposeToSwarm(composeFile: File, stackName: String): File {
        val content = composeFile.readText()
        val lines = content.lines().toMutableList()
        val convertedLines = mutableListOf<String>()
        var inService = false
        var currentServiceIndent = 0
        var hasDeploySection = false
        var serviceIndentLevel = 0
        
        var i = 0
        while (i < lines.size) {
            val line = lines[i]
            val trimmed = line.trim()
            val indent = line.length - line.trimStart().length
            
            // Detect service start
            if (trimmed.isNotEmpty() && !trimmed.startsWith("#") && 
                !trimmed.contains(":") && !trimmed.startsWith("-") && 
                !trimmed.startsWith("version") && !trimmed.startsWith("services") &&
                !trimmed.startsWith("networks") && !trimmed.startsWith("volumes") &&
                !trimmed.startsWith("configs") && !trimmed.startsWith("secrets")) {
                // This might be a service name
                if (indent == 0 && i > 0 && lines[i-1].trim() == "services:") {
                    inService = true
                    serviceIndentLevel = 0
                    hasDeploySection = false
                    convertedLines.add(line)
                    i++
                    continue
                }
            }
            
            // Check if we're entering a new top-level section
            if (indent == 0 && trimmed.endsWith(":")) {
                inService = false
                hasDeploySection = false
            }
            
            // Handle restart option - convert to deploy.restart_policy
            if (inService && trimmed.startsWith("restart:")) {
                val restartValue = trimmed.substringAfter(":").trim().removeSurrounding("\"", "'")
                val restartPolicy = when (restartValue.lowercase()) {
                    "always", "unless-stopped" -> "any"
                    "on-failure" -> "on-failure"
                    "no" -> "none"
                    else -> "any"
                }
                
                // Check if deploy section exists
                if (!hasDeploySection) {
                    // Add deploy section before restart
                    convertedLines.add("${" ".repeat(indent)}deploy:")
                    convertedLines.add("${" ".repeat(indent + 2)}restart_policy:")
                    convertedLines.add("${" ".repeat(indent + 4)}condition: $restartPolicy")
                    hasDeploySection = true
                } else {
                    // Find deploy section and add restart_policy
                    var j = convertedLines.size - 1
                    var foundDeploy = false
                    while (j >= 0) {
                        if (convertedLines[j].trim().startsWith("deploy:")) {
                            foundDeploy = true
                            // Insert restart_policy after deploy
                            val deployIndent = convertedLines[j].length - convertedLines[j].trimStart().length
                            convertedLines.add(j + 1, "${" ".repeat(deployIndent + 2)}restart_policy:")
                            convertedLines.add(j + 2, "${" ".repeat(deployIndent + 4)}condition: $restartPolicy")
                            break
                        }
                        j--
                    }
                    if (!foundDeploy) {
                        convertedLines.add("${" ".repeat(indent)}deploy:")
                        convertedLines.add("${" ".repeat(indent + 2)}restart_policy:")
                        convertedLines.add("${" ".repeat(indent + 4)}condition: $restartPolicy")
                        hasDeploySection = true
                    }
                }
                // Skip the original restart line
                i++
                continue
            }
            
            // Remove container_name (not supported in Swarm)
            if (inService && trimmed.startsWith("container_name:")) {
                i++
                continue
            }
            
            // Track deploy section
            if (inService && trimmed.startsWith("deploy:")) {
                hasDeploySection = true
            }
            
            convertedLines.add(line)
            i++
        }
        
        // Handle networks - mark existing networks as external
        val finalContent = convertedLines.joinToString("\n")
        val networkRegex = Regex("""networks:\s*\n((?:\s+[^\s:]+:?\s*\n?)+)""", RegexOption.MULTILINE)
        val processedContent = networkRegex.replace(finalContent) { matchResult ->
            val networksSection = matchResult.groupValues[1]
            // Check if network already exists
            val networkLines = networksSection.lines().filter { it.trim().isNotEmpty() }
            val updatedNetworks = networkLines.joinToString("\n") { line ->
                val networkName = line.trim().removeSuffix(":").trim()
                if (networkName.isNotEmpty() && !networkName.startsWith("#")) {
                    // Check if network exists
                    try {
                        val checkProcess = ProcessBuilder("docker", "network", "inspect", networkName)
                            .redirectErrorStream(true)
                            .start()
                        val exists = checkProcess.waitFor(2, TimeUnit.SECONDS) && checkProcess.exitValue() == 0
                        if (exists) {
                            "$line\n      external: true"
                        } else {
                            line
                        }
                    } catch (e: Exception) {
                        line
                    }
                } else {
                    line
                }
            }
            "networks:\n$updatedNetworks"
        }
        
        // Write converted file
        val tempFile = File(composeFile.parentFile, "${composeFile.nameWithoutExtension}.swarm.${composeFile.extension}")
        tempFile.writeText(processedContent)
        logger.info("Converted compose file to Swarm format: ${tempFile.absolutePath}")
        return tempFile
    }

    override fun deployStack(stackName: String, composeFile: String): ComposeResult {
        val file = File(composeFile)
        if (!file.exists()) return ComposeResult(false, "Compose file not found: $composeFile")

        return try {
            // Convert compose file to Swarm-compatible format
            val swarmFile = try {
                convertComposeToSwarm(file, stackName)
            } catch (e: Exception) {
                logger.warn("Failed to convert compose file to Swarm format, using original: ${e.message}")
                file
            }
            
            val process = ProcessBuilder("docker", "stack", "deploy", "-c", swarmFile.absolutePath, stackName)
                .directory(file.parentFile)
                .redirectErrorStream(true)
                .start()
            
            val output = process.inputStream.bufferedReader().readText()
            val success = process.waitFor(5, TimeUnit.MINUTES) && process.exitValue() == 0

            // Clean up temporary file if it was created
            if (swarmFile != file && swarmFile.exists()) {
                try {
                    swarmFile.delete()
                } catch (e: Exception) {
                    logger.debug("Failed to delete temporary swarm file: ${e.message}")
                }
            }

            if (!success) {
                // Include conversion warnings in error message
                val warnings = mutableListOf<String>()
                if (output.contains("Ignoring unsupported options: restart")) {
                    warnings.add("The 'restart' option was converted to 'deploy.restart_policy'")
                }
                if (output.contains("Ignoring deprecated options: container_name")) {
                    warnings.add("The 'container_name' option was removed (not supported in Swarm)")
                }
                if (output.contains("already exists")) {
                    warnings.add("Network already exists - consider marking it as external in your compose file")
                }
                
                val errorMsg = if (warnings.isNotEmpty()) {
                    "${output}\n\nNote: ${warnings.joinToString("; ")}"
                } else {
                    output
                }
                return ComposeResult(false, errorMsg)
            }

            ComposeResult(success, output.ifBlank { if (success) "Stack deployed successfully" else "Failed to deploy stack" })
        } catch (e: Exception) {
            e.printStackTrace()
            ComposeResult(false, "Error: ${e.message ?: "Unknown error"}")
        }
    }

    override fun removeStack(stackName: String): ComposeResult {
        return try {
            val process = ProcessBuilder("docker", "stack", "rm", stackName)
                .redirectErrorStream(true)
                .start()
            
            val output = process.inputStream.bufferedReader().readText()
            val success = process.waitFor(2, TimeUnit.MINUTES) && process.exitValue() == 0

            ComposeResult(success, output.ifBlank { if (success) "Stack removed successfully" else "Failed to remove stack" })
        } catch (e: Exception) {
            e.printStackTrace()
            ComposeResult(false, "Error: ${e.message ?: "Unknown error"}")
        }
    }

    override fun startStack(stackName: String, composeFile: String): ComposeResult {
        // Start is the same as deploy - it creates or updates the stack
        return deployStack(stackName, composeFile)
    }

    override fun stopStack(stackName: String): ComposeResult {
        // Stop is the same as remove - it stops and removes the stack
        return removeStack(stackName)
    }

    override fun restartStack(stackName: String, composeFile: String): ComposeResult {
        return try {
            logger.info("Restarting stack: $stackName")
            
            // Step 1: Stop the stack
            val stopResult = stopStack(stackName)
            if (!stopResult.success && !stopResult.message.contains("not found") && !stopResult.message.contains("No such")) {
                logger.warn("Stack stop had issues but continuing restart: ${stopResult.message}")
            } else if (stopResult.success) {
                logger.info("Stack stopped successfully")
            }
            
            // Wait a bit for stack to fully stop
            Thread.sleep(2000)
            
            // Step 2: Start the stack
            logger.info("Starting stack: $stackName")
            val startResult = startStack(stackName, composeFile)
            
            if (startResult.success) {
                logger.info("Stack restarted successfully")
                ComposeResult(true, "Stack restarted successfully")
            } else {
                logger.error("Failed to start stack after stop: ${startResult.message}")
                ComposeResult(false, "Failed to restart stack: ${startResult.message}")
            }
        } catch (e: Exception) {
            logger.error("Error during stack restart", e)
            ComposeResult(false, "Error during restart: ${e.message ?: "Unknown error"}")
        }
    }

    override fun updateStack(stackName: String, composeFile: String): ComposeResult {
        // Update is the same as deploy - docker stack deploy updates existing stacks
        return deployStack(stackName, composeFile)
    }

    override fun listStackServices(stackName: String): List<StackService> {
        return try {
            val process = ProcessBuilder("docker", "stack", "services", stackName, "--format", "{{.ID}}\t{{.Name}}\t{{.Image}}\t{{.Mode}}\t{{.Replicas}}\t{{.Ports}}")
                .redirectErrorStream(true)
                .start()
            
            val output = process.inputStream.bufferedReader().readText()
            val success = process.waitFor(30, TimeUnit.SECONDS) && process.exitValue() == 0
            
            if (!success) return emptyList()
            
            output.lines()
                .filter { it.isNotBlank() && !it.startsWith("ID") && !it.startsWith("NAME") }
                .map { line ->
                    val parts = line.split("\t")
                    StackService(
                        id = parts.getOrNull(0)?.trim() ?: "",
                        name = parts.getOrNull(1)?.trim() ?: "",
                        image = parts.getOrNull(2)?.trim() ?: "",
                        mode = parts.getOrNull(3)?.trim() ?: "",
                        replicas = parts.getOrNull(4)?.trim() ?: "0/0",
                        ports = parts.getOrNull(5)?.trim()?.takeIf { it.isNotBlank() }
                    )
                }
                .toList()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    override fun listStackTasks(stackName: String): List<StackTask> {
        return try {
            val process = ProcessBuilder("docker", "stack", "ps", stackName, "--format", "{{.ID}}\t{{.Name}}\t{{.Image}}\t{{.Node}}\t{{.DesiredState}}\t{{.CurrentState}}\t{{.Error}}\t{{.Ports}}")
                .redirectErrorStream(true)
                .start()
            
            val output = process.inputStream.bufferedReader().readText()
            val success = process.waitFor(30, TimeUnit.SECONDS) && process.exitValue() == 0
            
            if (!success) return emptyList()
            
            output.lines()
                .filter { it.isNotBlank() && !it.startsWith("ID") }
                .map { line ->
                    val parts = line.split("\t")
                    StackTask(
                        id = parts.getOrNull(0)?.trim() ?: "",
                        name = parts.getOrNull(1)?.trim() ?: "",
                        image = parts.getOrNull(2)?.trim() ?: "",
                        node = parts.getOrNull(3)?.trim() ?: "",
                        desiredState = parts.getOrNull(4)?.trim() ?: "",
                        currentState = parts.getOrNull(5)?.trim() ?: "",
                        error = parts.getOrNull(6)?.trim()?.takeIf { it.isNotBlank() && it != "<none>" },
                        ports = parts.getOrNull(7)?.trim()?.takeIf { it.isNotBlank() && it != "<none>" }
                    )
                }
                .toList()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }
}
