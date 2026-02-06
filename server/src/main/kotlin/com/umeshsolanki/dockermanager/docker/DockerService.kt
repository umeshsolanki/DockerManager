package com.umeshsolanki.dockermanager.docker

import com.umeshsolanki.dockermanager.*
import com.umeshsolanki.dockermanager.docker.CreateContainerRequest
import java.io.InputStream

object DockerService {
    private var dockerClient = DockerClientProvider.client
    
    private var containerService: IContainerService = ContainerServiceImpl(dockerClient)
    private var imageService: IImageService = ImageServiceImpl(dockerClient)
    private val composeService: IComposeService = ComposeServiceImpl()
    private var secretService: ISecretService = SecretServiceImpl(dockerClient)
    private var networkService: INetworkService = NetworkServiceImpl(dockerClient)
    private var volumeService: IVolumeService = VolumeServiceImpl(dockerClient)
    private val logService: ILogService = LogServiceImpl()

    fun refreshServices() {
        dockerClient = DockerClientProvider.client
        containerService = ContainerServiceImpl(dockerClient)
        imageService = ImageServiceImpl(dockerClient)
        secretService = SecretServiceImpl(dockerClient)
        networkService = NetworkServiceImpl(dockerClient)
        volumeService = VolumeServiceImpl(dockerClient)
    }

    fun listContainers() = containerService.listContainers()

    fun startContainer(id: String) = containerService.startContainer(id)
    fun stopContainer(id: String) = containerService.stopContainer(id)
    fun removeContainer(id: String, force: Boolean = false) = containerService.removeContainer(id, force)
    fun removeContainers(ids: List<String>, force: Boolean = false) = containerService.removeContainers(ids, force)
    fun pruneContainers() = containerService.pruneContainers()
    fun inspectContainer(id: String) = containerService.inspectContainer(id)
    fun createContainer(request: CreateContainerRequest) = containerService.createContainer(request)
    fun getContainerLogs(id: String, tail: Int = 100) = containerService.getContainerLogs(id, tail)

    fun listImages() = imageService.listImages()
    fun pullImage(name: String) = imageService.pullImage(name)
    fun removeImage(id: String, force: Boolean = false) = imageService.removeImage(id, force)
    fun removeImages(ids: List<String>, force: Boolean = false) = imageService.removeImages(ids, force)
    fun pruneImages() = imageService.pruneImages()

    fun listComposeFiles() = composeService.listComposeFiles()
    fun composeUp(filePath: String) = composeService.composeUp(filePath)
    fun composeDown(filePath: String, removeVolumes: Boolean = false) = composeService.composeDown(filePath, removeVolumes)
    fun composeBuild(filePath: String) = composeService.composeBuild(filePath)
    fun saveComposeFile(name: String, content: String) = composeService.saveComposeFile(name, content)
    fun saveProjectFile(projectName: String, fileName: String, content: String) = composeService.saveProjectFile(projectName, fileName, content)
    fun getComposeFileContent(filePath: String) = composeService.getComposeFileContent(filePath)
    fun getProjectFileContent(projectName: String, fileName: String) = composeService.getProjectFileContent(projectName, fileName)
    fun backupCompose(name: String) = composeService.backupCompose(name)
    fun backupAllCompose() = composeService.backupAllCompose()
    fun deleteComposeProject(projectName: String) = composeService.deleteComposeProject(projectName)
    
    // Docker Stack operations
    fun listStacks() = composeService.listStacks()
    fun deployStack(stackName: String, composeFile: String) = composeService.deployStack(stackName, composeFile)
    fun removeStack(stackName: String) = composeService.removeStack(stackName)
    fun startStack(stackName: String, composeFile: String) = composeService.startStack(stackName, composeFile)
    fun stopStack(stackName: String) = composeService.stopStack(stackName)
    fun restartStack(stackName: String, composeFile: String) = composeService.restartStack(stackName, composeFile)
    fun updateStack(stackName: String, composeFile: String) = composeService.updateStack(stackName, composeFile)
    fun listStackServices(stackName: String) = composeService.listStackServices(stackName)
    fun listStackTasks(stackName: String) = composeService.listStackTasks(stackName)
    fun checkStackStatus(stackName: String) = composeService.checkStackStatus(stackName)
    fun checkComposeFileStatus(filePath: String) = composeService.checkComposeFileStatus(filePath)
    fun migrateComposeToStack(composeFilePath: String, stackName: String) = composeService.migrateComposeToStack(composeFilePath, stackName)

    fun listSecrets() = secretService.listSecrets()
    fun createSecret(name: String, data: String) = secretService.createSecret(name, data)
    fun removeSecret(id: String) = secretService.removeSecret(id)
    fun removeSecrets(ids: List<String>) = secretService.removeSecrets(ids)

    fun listNetworks() = networkService.listNetworks()
    fun removeNetwork(id: String) = networkService.removeNetwork(id)
    fun removeNetworks(ids: List<String>) = networkService.removeNetworks(ids)
    fun inspectNetwork(id: String) = networkService.inspectNetwork(id)
    fun createNetwork(request: CreateNetworkRequest) = networkService.createNetwork(request)

    fun listVolumes() = volumeService.listVolumes()
    fun removeVolume(name: String, force: Boolean = false) = volumeService.removeVolume(name, force)
    fun removeVolumes(names: List<String>, force: Boolean = false) = volumeService.removeVolumes(names, force)
    fun pruneVolumes() = volumeService.pruneVolumes()
    fun inspectVolume(name: String) = volumeService.inspectVolume(name)
    fun backupVolume(name: String) = volumeService.backupVolume(name)
    fun listVolumeFiles(volumeName: String, subPath: String) = volumeService.listFiles(volumeName, subPath)
    fun readVolumeFile(volumeName: String, path: String) = volumeService.readFile(volumeName, path)

    fun listSystemLogs(subPath: String = "") = logService.listSystemLogs(subPath)
    fun getSystemLogContent(path: String, tail: Int = 100, filter: String? = null, since: String? = null, until: String? = null) = 
        logService.getLogContent(path, tail, filter, since, until)

    fun getJournalLogs(tail: Int = 100, unit: String? = null, filter: String? = null, since: String? = null, until: String? = null) =
        logService.getJournalLogs(tail, unit, filter, since, until)

    fun getSystemSyslogLogs(tail: Int = 100, filter: String? = null) =
        logService.getSystemSyslogLogs(tail, filter)
}
