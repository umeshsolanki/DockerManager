package com.umeshsolanki.dockermanager.docker
import com.umeshsolanki.dockermanager.*

import java.io.File
import java.util.concurrent.TimeUnit
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.Instant

interface IComposeService {
    fun listComposeFiles(): List<ComposeFile>
    fun composeUp(filePath: String): ComposeResult
    fun composeDown(filePath: String, removeVolumes: Boolean = false): ComposeResult
    fun composeRestart(filePath: String): ComposeResult
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
    
    // Project Management
    fun deleteComposeProject(projectName: String): ComposeResult
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
        // List all subdirectories as potential projects
        val projectDirs = composeDir.listFiles { it.isDirectory } ?: emptyArray()

        return projectDirs.map { parentDir ->
            val allFiles = parentDir.walk()
                .filter { it.isFile }
                .toList()
            
            // Prioritize docker-compose.yml/yaml as the primary file
            // Fallback to any file if none of the standards exist
            val primaryFile = allFiles.find { it.name == "docker-compose.yml" || it.name == "docker-compose.yaml" }
                ?: allFiles.firstOrNull()
                ?: File(parentDir, "docker-compose.yml")
            
            val projectName = parentDir.name
            val status = if (primaryFile.exists() && (primaryFile.name.endsWith(".yml") || primaryFile.name.endsWith(".yaml"))) {
                checkComposeStatus(primaryFile.absolutePath, projectName)
            } else {
                "inactive"
            }
            
            val otherFiles = allFiles.filter { 
                it.absolutePath != primaryFile.absolutePath 
            }.map { it.relativeTo(parentDir).path }

            val lastModified = (allFiles + parentDir).map { it.lastModified() }.maxOrNull() ?: 0L

            ComposeFile(
                path = primaryFile.absolutePath, 
                name = projectName, 
                status = status,
                otherFiles = otherFiles,
                lastModified = lastModified
            )
        }.toList()
    }

    private fun checkComposeStatus(filePath: String, projectName: String): String {
        return try {
            // Check if containers from this compose project are running
            val output = runProcess(
                listOf(AppConfig.dockerCommand, "compose", "-f", filePath, "ps", "--format", "{{.State}}"),
                timeoutSeconds = 5
            ).message
            
            if (output.isBlank() || output.contains("error", ignoreCase = true)) {
                // Check if any containers exist (stopped)
                val outputAll = runProcess(
                    listOf(
                        AppConfig.dockerCommand,
                        "ps", "-a",
                        "--filter", "label=com.docker.compose.project=$projectName",
                        "--format", "{{.State}}"
                    ),
                    timeoutSeconds = 5
                ).message
                
                if (outputAll.isNotBlank() && !outputAll.contains("error", ignoreCase = true)) {
                    "stopped"
                } else {
                    "inactive"
                }
            } else {
                val states = output.lines().filter { it.isNotBlank() }.map { it.trim().lowercase() }
                val runningCount = states.count { it == "running" }
                val totalCount = states.size
                
                when {
                    runningCount == 0 -> "stopped"
                    runningCount == totalCount -> "active"
                    else -> "partial"
                }
            }
        } catch (e: Exception) {
            logger.error("Error checking compose status for $projectName", e)
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
            val stack = stacks.find { it.name == stackName } ?: return "not found"
            
            if (stack.services > 0) {
                val services = listStackServices(stackName)
                if (services.isEmpty()) {
                    val tasks = listStackTasks(stackName)
                    val runningTasks = tasks.count { it.currentState.contains("running", ignoreCase = true) }
                    return if (runningTasks > 0) "active" else "stopped"
                }
                
                val hasRunningReplicas = services.any { service ->
                    val replicas = service.replicas.split("/")
                    if (replicas.size == 2) {
                        val running = replicas[0].trim().toIntOrNull() ?: 0
                        val desired = replicas[1].trim().toIntOrNull() ?: 0
                        running > 0 && desired > 0
                    } else false
                }
                
                if (hasRunningReplicas) return "active"

                val tasks = listStackTasks(stackName)
                return if (tasks.any { it.currentState.contains("running", ignoreCase = true) }) "active" else "stopped"
            }
            "stopped"
        } catch (e: Exception) {
            logger.error("Error checking stack status for $stackName", e)
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
        return try {
            val file = File(filePath)
            if (!file.exists()) return ComposeResult(false, "File not found: $filePath")
            runComposeCommand(listOf("-f", filePath, "up", "-d"), file.parentFile, getDockerBuildEnv())
        } catch (e: Exception) {
            logger.error("Error in compose up for $filePath", e)
            ComposeResult(false, "Error: ${e.message}")
        }
    }

    override fun composeBuild(filePath: String): ComposeResult {
        return try {
            val file = File(filePath)
            if (!file.exists()) return ComposeResult(false, "File not found: $filePath")
            val projectDir = file.parentFile
            val projectName = projectDir.name.lowercase()
            val env = getDockerBuildEnv()

            if (File(projectDir, "Dockerfile").exists()) {
                runProcess(
                    listOf(AppConfig.dockerCommand, "buildx", "build", "--load", "-t", "$projectName:latest", "."),
                    projectDir,
                    env,
                    20
                ).let { 
                    it.copy(message = it.message.ifBlank { if (it.success) "Image Built Successfully: $projectName:latest" else "Failed to build image" })
                }
            } else {
                runComposeCommand(listOf("-f", filePath, "build"), projectDir, env, 20)
            }
        } catch (e: Exception) {
            logger.error("Error in compose build for $filePath", e)
            ComposeResult(false, "Error: ${e.message}")
        }
    }

    override fun composeDown(filePath: String, removeVolumes: Boolean): ComposeResult {
        return try {
            val file = File(filePath)
            if (!file.exists()) return ComposeResult(false, "File not found")

            val args = mutableListOf("-f", filePath, "down")
            if (removeVolumes) args.add("-v")

            runComposeCommand(args, file.parentFile)
        } catch (e: Exception) {
            logger.error("Error in compose down for $filePath", e)
            ComposeResult(false, e.message ?: "Unknown error")
        }
    }

    override fun composeRestart(filePath: String): ComposeResult {
        return try {
            val file = File(filePath)
            if (!file.exists()) return ComposeResult(false, "File not found: $filePath")
            runComposeCommand(listOf("-f", filePath, "restart"), file.parentFile)
        } catch (e: Exception) {
            logger.error("Error in compose restart for $filePath", e)
            ComposeResult(false, "Error: ${e.message}")
        }
    }

    override fun saveComposeFile(name: String, content: String): Boolean {
        return saveProjectFile(name, "docker-compose.yml", content)
    }

    override fun saveProjectFile(projectName: String, fileName: String, content: String): Boolean {
        return try {
            if (fileName.contains("..") || fileName.startsWith("/") || fileName.contains("\\")) {
                logger.warn("Attempt to write to invalid path: $fileName in project $projectName")
                return false
            }

            val file = File(File(composeDir, projectName), fileName).absoluteFile
            logger.info("Saving project file: ${file.absolutePath}")
            file.parentFile?.mkdirs()
            file.writeText(content)
            true
        } catch (e: Exception) {
            logger.error("Failed to save project file: $fileName for project: $projectName", e)
            false
        }
    }

    override fun getComposeFileContent(filePath: String): String {
        return try {
            val file = File(filePath)
            if (file.exists()) file.readText() else ""
        } catch (e: Exception) {
            logger.error("Error reading compose file: $filePath", e)
            ""
        }
    }

    override fun getProjectFileContent(projectName: String, fileName: String): String {
        val projectDir = File(composeDir, projectName).absoluteFile
        val file = File(projectDir, fileName).absoluteFile
        return getComposeFileContent(file.absolutePath)
    }

    override fun backupCompose(name: String): BackupResult {
        val projectDir = File(composeDir, name)
        if (!projectDir.exists()) return BackupResult(false, null, null, "Project not found")
        return createCompressedBackup("compose_$name", projectDir.parentFile, name)
    }

    override fun backupAllCompose(): BackupResult {
        if (!composeDir.exists()) return BackupResult(false, null, null, "No compose projects found")
        return createCompressedBackup("compose_all", composeDir.parentFile, composeDir.name)
    }

    override fun listStacks(): List<DockerStack> {
        val stacks = parseDockerOutput(listOf(AppConfig.dockerCommand, "stack", "ls", "--format", "{{.Name}}\t{{.Services}}"), "NAME") { parts ->
            DockerStack(
                name = parts[0],
                services = parts.getOrNull(1)?.toIntOrNull() ?: 0
            )
        }

        if (stacks.isEmpty()) return emptyList()

        // Attempt to get creation times from services to provide a "createdAt" for the stack
        try {
            val serviceOutput = runProcess(listOf(AppConfig.dockerCommand, "service", "ls", "--format", "{{index .Labels \"com.docker.stack.namespace\"}}\t{{.CreatedAt}}")).message
            val stackTimes = mutableMapOf<String, Long>()
            
            serviceOutput.lines().forEach { line ->
                val parts = line.split("\t")
                if (parts.size >= 2) {
                    val stackName = parts[0].trim()
                    val createdAtStr = parts[1].trim()
                    if (stackName.isNotBlank() && createdAtStr.isNotBlank()) {
                        // Docker format is "2024-05-20 10:00:00 +0000 UTC" or ISO
                        try {
                            val time = ZonedDateTime.parse(createdAtStr, 
                                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss Z z")).toInstant().toEpochMilli()
                            stackTimes[stackName] = minOf(stackTimes.getOrDefault(stackName, Long.MAX_VALUE), time)
                        } catch (e: Exception) {
                            // Fallback for different formats
                            try {
                                val time = Instant.parse(createdAtStr.replace(" ", "T")).toEpochMilli()
                                stackTimes[stackName] = minOf(stackTimes.getOrDefault(stackName, Long.MAX_VALUE), time)
                            } catch (e2: Exception) {}
                        }
                    }
                }
            }
            
            return stacks.map { it.copy(createdAt = stackTimes.getOrDefault(it.name, 0L)) }
        } catch (e: Exception) {
            logger.warn("Failed to retrieve service creation times for stacks", e)
            return stacks
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
                        val checkProcess = ProcessBuilder(AppConfig.dockerCommand, "network", "inspect", networkName)
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
            
            val process = ProcessBuilder(AppConfig.dockerCommand, "stack", "deploy", "-c", swarmFile.absolutePath, stackName)
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
            runProcess(listOf(AppConfig.dockerCommand, "stack", "rm", stackName), timeoutMinutes = 2)
        } catch (e: Exception) {
            logger.error("Error removing stack $stackName", e)
            ComposeResult(false, "Error: ${e.message}")
        }
    }

    override fun startStack(stackName: String, composeFile: String): ComposeResult = deployStack(stackName, composeFile)
    override fun stopStack(stackName: String): ComposeResult = removeStack(stackName)

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

    override fun updateStack(stackName: String, composeFile: String): ComposeResult = deployStack(stackName, composeFile)

    override fun listStackServices(stackName: String): List<StackService> {
        val cmd = listOf(AppConfig.dockerCommand, "stack", "services", stackName, "--format", "{{.ID}}\t{{.Name}}\t{{.Image}}\t{{.Mode}}\t{{.Replicas}}\t{{.Ports}}")
        return parseDockerOutput(cmd, "ID") { parts ->
            StackService(
                id = parts[0],
                name = parts.getOrNull(1) ?: "",
                image = parts.getOrNull(2) ?: "",
                mode = parts.getOrNull(3) ?: "",
                replicas = parts.getOrNull(4) ?: "0/0",
                ports = parts.getOrNull(5)?.takeIf { it.isNotBlank() }
            )
        }
    }

    override fun listStackTasks(stackName: String): List<StackTask> {
        val cmd = listOf(AppConfig.dockerCommand, "stack", "ps", stackName, "--format", "{{.ID}}\t{{.Name}}\t{{.Image}}\t{{.Node}}\t{{.DesiredState}}\t{{.CurrentState}}\t{{.Error}}\t{{.Ports}}")
        return parseDockerOutput(cmd, "ID") { parts ->
            StackTask(
                id = parts[0],
                name = parts.getOrNull(1) ?: "",
                image = parts.getOrNull(2) ?: "",
                node = parts.getOrNull(3) ?: "",
                desiredState = parts.getOrNull(4) ?: "",
                currentState = parts.getOrNull(5) ?: "",
                error = parts.getOrNull(6)?.takeIf { it.isNotBlank() },
                ports = parts.getOrNull(7)?.takeIf { it.isNotBlank() }
            )
        }
    }

    override fun deleteComposeProject(projectName: String): ComposeResult {
        return try {
            val projectDir = File(composeDir, projectName)
            if (!projectDir.exists()) return ComposeResult(false, "Project not found")
            
            // Check if any containers are running for this project
            val status = checkComposeFileStatus(File(projectDir, "docker-compose.yml").absolutePath)
            if (status == "active" || status == "partial") {
                return ComposeResult(false, "Cannot delete project while containers are running. Please stop it first.")
            }
            
            if (projectDir.deleteRecursively()) {
                ComposeResult(true, "Project deleted successfully")
            } else {
                logger.error("Failed to delete compose project directory: ${projectDir.absolutePath}")
                ComposeResult(false, "Failed to delete project directory")
            }
        } catch (e: Exception) {
            logger.error("Error deleting compose project $projectName", e)
            ComposeResult(false, "Error: ${e.message}")
        }
    }

    private fun getDockerBuildEnv() = mapOf(
        "DOCKER_BUILDKIT" to if (AppConfig.settings.dockerBuildKit) "1" else "0",
        "COMPOSE_DOCKER_CLI_BUILD" to if (AppConfig.settings.dockerCliBuild) "1" else "0"
    )

    private fun <T> parseDockerOutput(cmd: List<String>, headerToSkip: String, mapper: (List<String>) -> T): List<T> {
        return try {
            val res = runProcess(cmd)
            if (!res.success) return emptyList()
            res.message.lines()
                .filter { it.isNotBlank() && !it.startsWith(headerToSkip) && !it.startsWith("NAME") }
                .map { line -> mapper(line.split("\t").map { it.trim() }) }
        } catch (e: Exception) {
            logger.error("Error parsing docker output for command: ${cmd.joinToString(" ")}", e)
            emptyList()
        }
    }

    private fun createCompressedBackup(prefix: String, baseDir: File, targetName: String): BackupResult {
        return try {
            val fileName = "${prefix}_${System.currentTimeMillis()}.tar.gz"
            val fullPath = File(backupDir, fileName).absolutePath
            val res = runProcess(listOf("tar", "-czf", fullPath, "-C", baseDir.absolutePath, targetName))
            if (res.success) BackupResult(true, fileName, fullPath, "Backup created successfully")
            else BackupResult(false, null, null, "Failed to create backup: ${res.message}")
        } catch (e: Exception) {
            logger.error("Error creating backup for $targetName", e)
            BackupResult(false, null, null, "Error: ${e.message}")
        }
    }

    private fun runComposeCommand(
        args: List<String>, 
        directory: File? = null, 
        env: Map<String, String> = emptyMap(),
        timeoutMinutes: Long = 5
    ): ComposeResult {
        val composeCmd = AppConfig.dockerComposeCommand
        val command = if (composeCmd.contains(" ")) {
            composeCmd.split(" ").filter { it.isNotBlank() }.toMutableList().apply { addAll(args) }
        } else {
            mutableListOf(composeCmd).apply { addAll(args) }
        }
        return runProcess(command, directory, env, timeoutMinutes)
    }

    private fun runProcess(
        command: List<String>,
        directory: File? = null,
        env: Map<String, String> = emptyMap(),
        timeoutMinutes: Long = 5,
        timeoutSeconds: Long? = null
    ): ComposeResult {
        return try {
            val pb = ProcessBuilder(command).apply {
                directory?.let { directory(it) }
                redirectErrorStream(true)
                environment().putAll(env)
                val currentPath = environment()["PATH"] ?: ""
                listOf("/usr/local/bin", "/opt/homebrew/bin").filter { !currentPath.contains(it) }.let { extras ->
                    if (extras.isNotEmpty()) environment()["PATH"] = (extras + currentPath).joinToString(":")
                }
            }
            
            val process = pb.start()
            val output = process.inputStream.bufferedReader().readText()
            val finished = if (timeoutSeconds != null) {
                process.waitFor(timeoutSeconds, TimeUnit.SECONDS)
            } else {
                process.waitFor(timeoutMinutes, TimeUnit.MINUTES)
            }
            
            val success = finished && process.exitValue() == 0
            ComposeResult(success, output.trim())
        } catch (e: Exception) {
            val cmdStr = command.joinToString(" ")
            logger.error("Process execution failed: $cmdStr", e)
            ComposeResult(false, "Execution failed: ${e.message}")
        }
    }
}
