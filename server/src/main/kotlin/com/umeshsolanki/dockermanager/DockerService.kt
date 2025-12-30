package com.umeshsolanki.dockermanager


object DockerService {
    private val dockerClient = DockerClientProvider.client
    
    private val containerService: IContainerService = ContainerServiceImpl(dockerClient)
    private val imageService: IImageService = ImageServiceImpl(dockerClient)
    private val composeService: IComposeService = ComposeServiceImpl()
    private val secretService: ISecretService = SecretServiceImpl(dockerClient)
    private val networkService: INetworkService = NetworkServiceImpl(dockerClient)
    private val volumeService: IVolumeService = VolumeServiceImpl(dockerClient)
    private val logService: ILogService = LogServiceImpl()

    fun listContainers() = containerService.listContainers()
    fun startContainer(id: String) = containerService.startContainer(id)
    fun stopContainer(id: String) = containerService.stopContainer(id)
    fun removeContainer(id: String) = containerService.removeContainer(id)
    fun pruneContainers() = containerService.pruneContainers()
    fun inspectContainer(id: String) = containerService.inspectContainer(id)
    fun createContainer(request: CreateContainerRequest) = containerService.createContainer(request)
    fun getContainerLogs(id: String, tail: Int = 100) = containerService.getContainerLogs(id, tail)

    fun listImages() = imageService.listImages()
    fun pullImage(name: String) = imageService.pullImage(name)
    fun removeImage(id: String) = imageService.removeImage(id)

    fun listComposeFiles() = composeService.listComposeFiles()
    fun composeUp(filePath: String) = composeService.composeUp(filePath)
    fun composeDown(filePath: String) = composeService.composeDown(filePath)
    fun saveComposeFile(name: String, content: String) = composeService.saveComposeFile(name, content)
    fun getComposeFileContent(filePath: String) = composeService.getComposeFileContent(filePath)
    fun backupCompose(name: String) = composeService.backupCompose(name)
    fun backupAllCompose() = composeService.backupAllCompose()

    fun listSecrets() = secretService.listSecrets()
    fun createSecret(name: String, data: String) = secretService.createSecret(name, data)
    fun removeSecret(id: String) = secretService.removeSecret(id)

    fun listNetworks() = networkService.listNetworks()
    fun removeNetwork(id: String) = networkService.removeNetwork(id)

    fun listVolumes() = volumeService.listVolumes()
    fun removeVolume(name: String) = volumeService.removeVolume(name)
    fun pruneVolumes() = volumeService.pruneVolumes()
    fun inspectVolume(name: String) = volumeService.inspectVolume(name)
    fun backupVolume(name: String) = volumeService.backupVolume(name)

    fun listSystemLogs() = logService.listSystemLogs()
    fun getSystemLogContent(path: String, tail: Int = 100) = logService.getLogContent(path, tail)
}

