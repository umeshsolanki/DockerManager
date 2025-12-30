package com.umeshsolanki.dockermanager

interface IVolumeService {
    fun listVolumes(): List<DockerVolume>
    fun removeVolume(name: String): Boolean
    fun pruneVolumes(): Boolean
    fun inspectVolume(name: String): VolumeDetails?
    fun backupVolume(name: String): BackupResult
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
            val backupDir = System.getProperty("user.home") + "/docker_backups"
            val javaFile = java.io.File(backupDir)
            if (!javaFile.exists()) javaFile.mkdirs()
            
            val fullPath = "$backupDir/$fileName"
            
            // We use a temporary container to create a tarball of the volume
            // Command: docker run --rm -v [volume_name]:/data -v [backup_dir]:/backup alpine tar cvf /backup/[filename] -C /data .
            val processBuilder = ProcessBuilder(
                "docker", "run", "--rm",
                "-v", "$name:/data",
                "-v", "$backupDir:/backup",
                "alpine", "tar", "cvf", "/backup/$fileName", "-C", "/data", "."
            )
            
            val process = processBuilder.start()
            val exitCode = process.waitFor()
            
            if (exitCode == 0) {
                BackupResult(true, fileName, fullPath, "Backup created successfully at $fullPath")
            } else {
                BackupResult(false, null, null, "Failed to create backup. Exit code: $exitCode")
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
}
