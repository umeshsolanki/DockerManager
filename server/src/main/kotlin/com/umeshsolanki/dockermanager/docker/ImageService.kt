package com.umeshsolanki.dockermanager.docker

import com.umeshsolanki.dockermanager.*
import kotlinx.serialization.Serializable
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import com.github.dockerjava.api.model.PullResponseItem
import com.github.dockerjava.api.async.ResultCallback
import java.io.Closeable
import java.util.concurrent.TimeUnit

@Serializable
data class PullProgress(
    val status: String? = null,
    val progress: String? = null,
    val current: Long? = null,
    val total: Long? = null,
    val id: String? = null,
    val error: String? = null
)

interface IImageService {
    fun listImages(): List<DockerImage>
    fun pullImage(name: String): Boolean
    fun pullImageFlow(name: String): Flow<PullProgress>
    fun removeImage(id: String, force: Boolean = false): Boolean
    fun removeImages(ids: List<String>, force: Boolean = false): Map<String, Boolean>
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
        Thread {
            try {
                dockerClient.pullImageCmd(name).start().awaitCompletion(300, TimeUnit.SECONDS)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }.start()
        return true
    }

    override fun pullImageFlow(name: String): Flow<PullProgress> = callbackFlow {
        val callback = object : ResultCallback.Adapter<PullResponseItem>() {
            override fun onNext(item: PullResponseItem) {
                trySend(
                    PullProgress(
                        status = item.status,
                        progress = item.progress,
                        current = item.progressDetail?.current,
                        total = item.progressDetail?.total,
                        id = item.id,
                        error = item.error
                    )
                )
            }

            override fun onError(throwable: Throwable) {
                trySend(PullProgress(error = throwable.message ?: "Unknown error"))
                close(throwable)
            }

            override fun onComplete() {
                close()
            }
        }

        val pullCmd = dockerClient.pullImageCmd(name).exec(callback)
        
        awaitClose {
            try {
                pullCmd.close()
            } catch (e: Exception) {
                // Ignore
            }
        }
    }

    override fun removeImage(id: String, force: Boolean): Boolean {
        return try {
            dockerClient.removeImageCmd(id).withForce(force).exec()
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    override fun removeImages(ids: List<String>, force: Boolean): Map<String, Boolean> {
        val results = mutableMapOf<String, Boolean>()
        ids.forEach { id ->
            results[id] = removeImage(id, force)
        }
        return results
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
