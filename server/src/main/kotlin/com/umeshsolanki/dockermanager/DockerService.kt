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
    private val firewallService: IFirewallService = FirewallServiceImpl()
    private val proxyService: IProxyService = ProxyServiceImpl()
    private val btmpService: IBtmpService = BtmpServiceImpl(firewallService)

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

    fun listSystemLogs(subPath: String = "") = logService.listSystemLogs(subPath)
    fun getSystemLogContent(path: String, tail: Int = 100, filter: String? = null, since: String? = null, until: String? = null) = 
        logService.getLogContent(path, tail, filter, since, until)
    
    fun getBtmpStats() = btmpService.getStats()
    suspend fun refreshBtmpStats() = btmpService.refreshStats()
    fun updateAutoJailSettings(enabled: Boolean, threshold: Int, durationMinutes: Int) = btmpService.updateAutoJailSettings(enabled, threshold, durationMinutes)
    fun updateBtmpMonitoring(active: Boolean, intervalMinutes: Int) = btmpService.updateMonitoringSettings(active, intervalMinutes)

    fun listFirewallRules() = firewallService.listRules()
    fun blockIP(request: BlockIPRequest) = firewallService.blockIP(request)
    fun unblockIP(id: String) = firewallService.unblockIP(id)
    fun unblockIPByAddress(ip: String) = firewallService.unblockIPByAddress(ip)
    fun getIptablesVisualisation() = firewallService.getIptablesVisualisation()

    fun listProxyHosts() = proxyService.listHosts()
    fun createProxyHost(host: ProxyHost) = proxyService.createHost(host)
    fun updateProxyHost(host: ProxyHost) = proxyService.updateHost(host)
    fun deleteProxyHost(id: String) = proxyService.deleteHost(id)
    fun toggleProxyHost(id: String) = proxyService.toggleHost(id)
    fun requestProxySSL(id: String) = proxyService.requestSSL(id)
    fun getProxyStats() = proxyService.getStats()
    fun listProxyCertificates() = proxyService.listCertificates()
    
    // Proxy Container Management
    fun buildProxyImage() = proxyService.buildProxyImage()
    fun createProxyContainer() = proxyService.createProxyContainer()
    fun startProxyContainer() = proxyService.startProxyContainer()
    fun stopProxyContainer() = proxyService.stopProxyContainer()
    fun restartProxyContainer() = proxyService.restartProxyContainer()
    fun getProxyContainerStatus() = proxyService.getProxyContainerStatus()
    fun ensureProxyContainerExists() = proxyService.ensureProxyContainerExists()
}
