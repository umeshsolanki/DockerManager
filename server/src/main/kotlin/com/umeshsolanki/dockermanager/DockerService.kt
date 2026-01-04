package com.umeshsolanki.dockermanager

object DockerService {
    private var dockerClient = DockerClientProvider.client
    
    private var containerService: IContainerService = ContainerServiceImpl(dockerClient)
    private var imageService: IImageService = ImageServiceImpl(dockerClient)
    private val composeService: IComposeService = ComposeServiceImpl()
    private var secretService: ISecretService = SecretServiceImpl(dockerClient)
    private var networkService: INetworkService = NetworkServiceImpl(dockerClient)
    private var volumeService: IVolumeService = VolumeServiceImpl(dockerClient)
    private val logService: ILogService = LogServiceImpl()
    private val firewallService: IFirewallService = FirewallServiceImpl()
    private val proxyService: IProxyService = ProxyServiceImpl()
    private val btmpService: IBtmpService = BtmpServiceImpl(firewallService)
    private val emailService: IEmailService = EmailServiceImpl()

    fun refreshServices() {
        dockerClient = DockerClientProvider.client
        containerService = ContainerServiceImpl(dockerClient)
        imageService = ImageServiceImpl(dockerClient)
        secretService = SecretServiceImpl(dockerClient)
        networkService = NetworkServiceImpl(dockerClient)
        volumeService = VolumeServiceImpl(dockerClient)
        emailService.refresh()
    }

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
    fun inspectNetwork(id: String) = networkService.inspectNetwork(id)

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
    fun recordFailedLoginAttempt(user: String, ip: String) = btmpService.recordFailedAttempt(user, ip)
    fun clearFailedLoginAttempts(ip: String) = btmpService.clearFailedAttempts(ip)
    fun isIPJailed(ip: String) = btmpService.isIPJailed(ip)

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
    fun getProxyComposeConfig() = proxyService.getComposeConfig()
    fun updateProxyComposeConfig(content: String) = proxyService.updateComposeConfig(content)

    // Email Management
    suspend fun listEmailDomains() = emailService.listDomains()
    suspend fun createEmailDomain(domain: String) = emailService.createDomain(domain)
    suspend fun deleteEmailDomain(domain: String) = emailService.deleteDomain(domain)
    
    suspend fun listEmailUsers() = emailService.listUsers()
    suspend fun createEmailUser(userAddress: String, request: CreateEmailUserRequest) = emailService.createUser(userAddress, request)
    suspend fun deleteEmailUser(userAddress: String) = emailService.deleteUser(userAddress)
    suspend fun updateEmailUserPassword(userAddress: String, request: UpdateEmailUserPasswordRequest) = emailService.updateUserPassword(userAddress, request)

    suspend fun listEmailMailboxes(userAddress: String) = emailService.listMailboxes(userAddress)
    suspend fun createEmailMailbox(userAddress: String, mailboxName: String) = emailService.createMailbox(userAddress, mailboxName)
    suspend fun deleteEmailMailbox(userAddress: String, mailboxName: String) = emailService.deleteMailbox(userAddress, mailboxName)

    // Groups
    suspend fun listEmailGroups() = emailService.listGroups()
    suspend fun getEmailGroupMembers(groupAddress: String) = emailService.getGroupMembers(groupAddress)
    suspend fun createEmailGroup(groupAddress: String, memberAddress: String) = emailService.createGroup(groupAddress, memberAddress)
    suspend fun addEmailGroupMember(groupAddress: String, memberAddress: String) = emailService.addToGroup(groupAddress, memberAddress)
    suspend fun removeEmailGroupMember(groupAddress: String, memberAddress: String) = emailService.removeFromGroup(groupAddress, memberAddress)

    // Quotas
    suspend fun getEmailUserQuota(userAddress: String) = emailService.getUserQuota(userAddress)
    suspend fun setEmailUserQuota(userAddress: String, type: String, value: Long) = emailService.setUserQuota(userAddress, type, value)
    suspend fun deleteEmailUserQuota(userAddress: String) = emailService.deleteUserQuota(userAddress)

    // James Container Management
    fun getJamesStatus() = emailService.getStatus()
    fun ensureJamesConfig() = emailService.ensureJamesConfig()
    fun getJamesComposeConfig() = emailService.getComposeConfig()
    fun updateJamesComposeConfig(content: String) = emailService.updateComposeConfig(content)
    fun startJames() = emailService.startJames()
    fun stopJames() = emailService.stopJames()
    fun restartJames() = emailService.restartJames()

    fun getSystemConfig() = SystemConfig(
        dockerCommand = AppConfig.dockerCommand,
        dockerComposeCommand = AppConfig.dockerComposeCommand,
        dockerSocket = AppConfig.dockerSocket,
        dataRoot = AppConfig.dataRoot.absolutePath,
        jamesWebAdminUrl = AppConfig.jamesWebAdminUrl,
        appVersion = AppConfig.appVersion,
        twoFactorEnabled = AuthService.is2FAEnabled(),
        username = AuthService.getUsername()
    )

    fun updateSystemConfig(request: UpdateSystemConfigRequest) {
        AppConfig.updateSettings(
            dockerSocket = request.dockerSocket,
            jamesWebAdminUrl = request.jamesWebAdminUrl
        )
        // Refresh services to use new settings
        DockerClientProvider.refreshClient()
        refreshServices()
    }
}


