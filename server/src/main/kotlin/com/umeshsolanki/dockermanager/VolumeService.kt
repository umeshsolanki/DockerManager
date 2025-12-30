package com.umeshsolanki.dockermanager

interface IVolumeService {
    fun listVolumes(): List<DockerVolume>
    fun removeVolume(name: String): Boolean
    fun pruneVolumes(): Boolean
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
