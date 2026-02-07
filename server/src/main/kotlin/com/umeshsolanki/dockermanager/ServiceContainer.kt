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
import com.umeshsolanki.dockermanager.docker.*
import kotlinx.coroutines.*
import org.jetbrains.exposed.sql.insert

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

    val customPageService: ICustomPageService = CustomPageServiceImpl()

    val proxyService: IProxyService = ProxyServiceImpl(jailManagerService, sslService)
    
    val kafkaService: IKafkaService = KafkaServiceImpl().apply {
        registerHandler(object : KafkaMessageHandler {
            override fun canHandle(topic: String): Boolean = true // Handle all topics to check rules
            override fun handle(topic: String, key: String?, value: String) {
                try {
                    val settings = AppConfig.settings
                    val processedEvent = KafkaRuleProcessor.process(topic, value, settings.kafkaRules)
                    
                    // Store in DB if any rule says so (default is true for now)
                    if (processedEvent.appliedRules.isNotEmpty() || topic == settings.kafkaSettings.topic) {
                         // Save to database
                         kotlinx.coroutines.GlobalScope.launch {
                             try {
                                 com.umeshsolanki.dockermanager.database.DatabaseFactory.dbQuery {
                                     com.umeshsolanki.dockermanager.database.KafkaProcessedEventsTable.insert {
                                         it[id] = processedEvent.id
                                         it[originalTopic] = processedEvent.originalTopic
                                         it[timestamp] = java.time.LocalDateTime.now()
                                         it[originalValue] = processedEvent.originalValue
                                         it[processedValue] = processedEvent.processedValue
                                         it[appliedRules] = processedEvent.appliedRules.joinToString(",")
                                     }
                                 }
                             } catch (e: Exception) {
                                 org.slf4j.LoggerFactory.getLogger("KafkaHandler").error("Failed to store processed event", e)
                             }
                         }
                    }

                    // Original IP blocking logic if topic match
                    if (topic == settings.kafkaSettings.topic) {
                        try {
                            val request = AppConfig.json.decodeFromString<IpBlockRequest>(processedEvent.processedValue)
                            jailManagerService.jailIP(
                                ip = request.ip,
                                durationMinutes = request.durationMinutes,
                                reason = request.reason
                            )
                        } catch (e: Exception) {
                            org.slf4j.LoggerFactory.getLogger("KafkaHandler").error("Failed to process block request", e)
                        }
                    }
                } catch (e: Exception) {
                    org.slf4j.LoggerFactory.getLogger("KafkaHandler").error("Failed to process kafka message with rules", e)
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




