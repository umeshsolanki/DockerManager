package com.umeshsolanki.dockermanager

import java.util.concurrent.TimeUnit

interface IImageService {
    fun listImages(): List<DockerImage>
    fun pullImage(name: String): Boolean
    fun removeImage(id: String): Boolean
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
}
