package com.umeshsolanki.dockermanager

import com.umeshsolanki.dockermanager.firewall.FirewallServiceImpl
import com.umeshsolanki.dockermanager.firewall.IFirewallService
import com.umeshsolanki.dockermanager.jail.IJailManagerService
import com.umeshsolanki.dockermanager.jail.JailManagerServiceImpl
import com.umeshsolanki.dockermanager.proxy.*
import com.umeshsolanki.dockermanager.utils.CommandExecutor
import com.umeshsolanki.dockermanager.proxy.ProxyServiceImpl
import com.umeshsolanki.dockermanager.proxy.SSLServiceImpl
import com.umeshsolanki.dockermanager.kafka.*
import kotlinx.serialization.json.Json

/**
 * Service container for dependency injection.
 * All services are initialized here and can be injected externally.
 */
object ServiceContainer {
    // Core services
    val firewallService: IFirewallService = FirewallServiceImpl()
    
    val ipInfoService: com.umeshsolanki.dockermanager.ip.IIpInfoService = com.umeshsolanki.dockermanager.ip.IpInfoServiceImpl()
    
    // Dependent services
    val jailManagerService: IJailManagerService = JailManagerServiceImpl(firewallService, ipInfoService)

    // Workers
    val ipEnrichmentWorker = com.umeshsolanki.dockermanager.jail.IpEnrichmentWorker(firewallService, ipInfoService)

    val sslService: ISSLService = SSLServiceImpl { command ->
         val executor = CommandExecutor(loggerName = "SSLServiceImpl")
         executor.execute(command).output
    }

    val proxyService: IProxyService = ProxyServiceImpl(jailManagerService, sslService)
    
    val kafkaService: IKafkaService = KafkaServiceImpl().apply {
        registerHandler(object : KafkaMessageHandler {
            override fun canHandle(topic: String): Boolean = topic == AppConfig.settings.kafkaSettings.topic
            override fun handle(topic: String, key: String?, value: String) {
                try {
                    val request = AppConfig.json.decodeFromString<IpBlockRequest>(value)
                    jailManagerService.jailIP(
                        ip = request.ip,
                        durationMinutes = request.durationMinutes,
                        reason = request.reason
                    )
                } catch (e: Exception) {
                    org.slf4j.LoggerFactory.getLogger("KafkaHandler").error("Failed to process block request", e)
                }
            }
        })
    }
    
    /**
     * Initialize all services.
     * This can be called during application startup to ensure services are ready.
     */
    fun initialize() {
        // Services are initialized lazily when accessed
        // This method can be used for any initialization logic if needed
        kafkaService.start(AppConfig.settings.kafkaSettings)
        ipEnrichmentWorker.start()
    }
}




