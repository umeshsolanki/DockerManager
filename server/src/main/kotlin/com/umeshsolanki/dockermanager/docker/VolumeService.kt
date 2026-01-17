package com.umeshsolanki.dockermanager.docker
import com.umeshsolanki.dockermanager.*
import com.umeshsolanki.dockermanager.file.FileItem

import java.io.File

interface IVolumeService {
    fun listVolumes(): List<DockerVolume>
    fun removeVolume(name: String): Boolean
    fun pruneVolumes(): Boolean
    fun inspectVolume(name: String): VolumeDetails?
    fun backupVolume(name: String): BackupResult
    fun listFiles(volumeName: String, subPath: String): List<FileItem>
    fun readFile(volumeName: String, path: String): String?
}

class VolumeServiceImpl(private val dockerClient: com.github.dockerjava.api.DockerClient) : IVolumeService {
    override fun listVolumes(): List<DockerVolume> {
        val volumes = dockerClient.listVolumesCmd().exec()
        return volumes.volumes?.map { volume ->
            DockerVolume(
                name = volume.name,
                driver = volume.driver ?: "unknown",
                mountpoint = volume.mountpoint ?: "unknown",
                createdAt = (volume.rawValues["CreatedAt"] as? String)
            )
        } ?: emptyList()
    }

    override fun inspectVolume(name: String): VolumeDetails? {
        return try {
            val vol = dockerClient.inspectVolumeCmd(name).exec()
            VolumeDetails(
                name = vol.name,
                driver = vol.driver,
                mountpoint = vol.mountpoint,
                labels = vol.labels ?: emptyMap(),
                scope = (vol.rawValues["Scope"] as? String) ?: "local",
                options = vol.options ?: emptyMap(),
                createdAt = (vol.rawValues["CreatedAt"] as? String)
            )
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    override fun backupVolume(name: String): BackupResult {
        return try {
            val fileName = "backup_${name}_${System.currentTimeMillis()}.tar"
            val backupDir = File(AppConfig.backupDir,"volumes").absoluteFile
            if (!backupDir.exists()) backupDir.mkdirs()

            val fullPath = File(backupDir, fileName).absolutePath

            // We use a temporary container to create a tarball of the volume
            // Command: docker run --rm -v [volume_name]:/data -v [backup_dir]:/backup alpine tar cvf /backup/[filename] -C /data .
            val processBuilder = ProcessBuilder(
                "docker", "run", "--rm",
                "-v", "$name:/data",
                "-v", "${backupDir.absolutePath}:/backup",
                "alpine", "tar", "cvf", "/backup/$fileName", "-C", "/data", "."
            ).redirectErrorStream(true)

            val process = processBuilder.start()
            val output = process.inputStream.bufferedReader().readText()
            val exitCode = process.waitFor()

            if (exitCode == 0) {
                BackupResult(true, fileName, fullPath, "Backup created successfully at $fullPath")
            } else {
                BackupResult(false, null, null, "Failed to create backup. Exit code: $exitCode. Output: $output")
            }
        } catch (e: Exception) {
            e.printStackTrace()
            BackupResult(false, null, null, "Error during backup: ${e.message}")
        }
    }

    override fun removeVolume(name: String): Boolean {
        return try {
            dockerClient.removeVolumeCmd(name).exec()
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    override fun pruneVolumes(): Boolean {
        return try {
            dockerClient.pruneCmd(com.github.dockerjava.api.model.PruneType.VOLUMES).exec()
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    override fun listFiles(volumeName: String, subPath: String): List<FileItem> {
        return try {
            // Validate subPath to prevent traversal attacks
            if (subPath.contains("..")) return emptyList()
            
            val safePath = subPath.removePrefix("/").let { if(it.isEmpty()) "" else "/$it" }
            val targetPath = "/data$safePath"

            val processBuilder = ProcessBuilder(
                "docker", "run", "--rm",
                "-v", "$volumeName:/data",
                "alpine", "sh", "-c", 
                "for f in \"$targetPath\"/*; do if [ -e \"\$f\" ]; then stat -c '%n|%s|%F|%Y' \"\$f\"; fi; done"
            ).redirectErrorStream(true)

            val process = processBuilder.start()
            val output = process.inputStream.bufferedReader().readText()
            process.waitFor()

            val items = mutableListOf<FileItem>()
            output.lines().forEach { line ->
                val parts = line.split("|")
                if (parts.size >= 4) {
                    val fullPath = parts[0]
                    val size = parts[1].toLongOrNull() ?: 0L
                    val type = parts[2]
                    val timestamp = (parts[3].toLongOrNull() ?: 0L) * 1000

                    val name = File(fullPath).name
                    val cleanSubPath = subPath.removePrefix("/").removeSuffix("/")
                    val relativePath = if (cleanSubPath.isEmpty()) name else "$cleanSubPath/$name"

                    val isDir = type.contains("directory", ignoreCase = true)

                    items.add(FileItem(
                        name = name,
                        path = relativePath,
                        size = size,
                        isDirectory = isDir,
                        lastModified = timestamp,
                        extension = if (isDir) null else File(name).extension
                    ))
                }
            }
            items
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    override fun readFile(volumeName: String, path: String): String? {
        return try {
             if (path.contains("..")) return null
             val safePath = path.removePrefix("/")
             
             val processBuilder = ProcessBuilder(
                "docker", "run", "--rm",
                "-v", "$volumeName:/data",
                "alpine", "cat", "/data/$safePath"
            )
            
            val process = processBuilder.start()
            val content = process.inputStream.bufferedReader().readText()
            val exitCode = process.waitFor()

            if (exitCode == 0) content else null
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }
}
