package com.umeshsolanki.dockermanager.docker
import com.umeshsolanki.dockermanager.*

import java.util.concurrent.TimeUnit

interface IImageService {
    fun listImages(): List<DockerImage>
    fun pullImage(name: String): Boolean
    fun removeImage(id: String): Boolean
    fun pruneImages(): Boolean
}

class ImageServiceImpl(private val dockerClient: com.github.dockerjava.api.DockerClient) : IImageService {
    override fun listImages(): List<DockerImage> {
        val images = dockerClient.listImagesCmd().exec()
        return images.map { image ->
            DockerImage(
                id = image.id,
                tags = image.repoTags?.toList() ?: emptyList(),
                size = image.size ?: 0L,
                created = image.created ?: 0L
            )
        }
    }

    override fun pullImage(name: String): Boolean {
        return try {
            dockerClient.pullImageCmd(name).start().awaitCompletion(300, TimeUnit.SECONDS)
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    override fun removeImage(id: String): Boolean {
        return try {
            dockerClient.removeImageCmd(id).exec()
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    override fun pruneImages(): Boolean {
        return try {
            dockerClient.pruneCmd(com.github.dockerjava.api.model.PruneType.IMAGES).withDangling(true).exec()
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
}
