package com.umeshsolanki.dockermanager

import com.github.dockerjava.api.model.SecretSpec
import java.util.Base64

interface ISecretService {
    fun listSecrets(): List<DockerSecret>
    fun createSecret(name: String, data: String): Boolean
    fun removeSecret(id: String): Boolean
}

class SecretServiceImpl(private val dockerClient: com.github.dockerjava.api.DockerClient) : ISecretService {
    override fun listSecrets(): List<DockerSecret> {
        return try {
            dockerClient.listSecretsCmd().exec().map { secret ->
                DockerSecret(
                    id = secret.id ?: "",
                    name = secret.spec?.name ?: "",
                    createdAt = secret.createdAt?.toString() ?: "",
                    updatedAt = secret.updatedAt?.toString() ?: ""
                )
            }
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    override fun createSecret(name: String, data: String): Boolean {
        return try {
            val secretSpec = SecretSpec()
                .withName(name)
                .withData(Base64.getEncoder().encodeToString(data.toByteArray()))
            dockerClient.createSecretCmd(secretSpec).exec()
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    override fun removeSecret(id: String): Boolean {
        return try {
            dockerClient.removeSecretCmd(id).exec()
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
}
