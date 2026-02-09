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
import com.umeshsolanki.dockermanager.analytics.ClickHouseService
import kotlinx.coroutines.*
import org.jetbrains.exposed.sql.insert

/**
 * Service container for dependency injection.
 * All services are initialized here and can be injected externally.
 */
object ServiceContainer {
    // Core services
    // Core services
    val ipReputationService: com.umeshsolanki.dockermanager.ip.IIpReputationService = com.umeshsolanki.dockermanager.ip.IpReputationServiceImpl()
    
    val firewallService: IFirewallService = FirewallServiceImpl(ipReputationService)
    
    val ipInfoService: com.umeshsolanki.dockermanager.ip.IIpInfoService = com.umeshsolanki.dockermanager.ip.IpInfoServiceImpl()
    
    val kafkaService: IKafkaService = KafkaServiceImpl()

    // Dependent services
    val jailManagerService: IJailManagerService = JailManagerServiceImpl(firewallService, ipInfoService, ipReputationService, kafkaService)

    // Workers
    val ipEnrichmentWorker = com.umeshsolanki.dockermanager.jail.IpEnrichmentWorker(firewallService, ipInfoService)

    val sslService: ISSLService = SSLServiceImpl { command ->
         val executor = CommandExecutor(loggerName = "SSLServiceImpl")
         executor.execute(command).output
    }

    val customPageService: ICustomPageService = CustomPageServiceImpl()

    val proxyService: IProxyService = ProxyServiceImpl(jailManagerService, sslService)
    
    init {
        kafkaService.registerHandler(object : KafkaMessageHandler {
            override fun canHandle(topic: String): Boolean = true // Handle all topics to check rules
            override fun handle(topic: String, key: String?, value: String) {
                val logger = org.slf4j.LoggerFactory.getLogger("KafkaHandler")
                try {
                    val settings = AppConfig.settings
                    
                    // Original IP blocking logic if topic match
                    if (topic == settings.kafkaSettings.topic) {
                        logger.info("Received blocking request on topic $topic. Value: $value")
                        try {
                            // First try to parse as generic JSON to validate it's not garbage
                            val request = try {
                                AppConfig.json.decodeFromString<IpBlockRequest>(value)
                            } catch (e: Exception) {
                                logger.error("Failed to decode IpBlockRequest: ${e.message}. Value: $value", e)
                                return
                            }
                            
                            logger.info("Decoded request: $request. Executing jailIP...")
                            
                            // Use service scope or runBlocking if appropriate, but here we launch async
                            // Better to use a defined scope for the container if possible, but for now using GlobalScope with explicit error handling
                            kotlinx.coroutines.GlobalScope.launch {
                                try {
                                    val success = jailManagerService.performJailExecution(
                                        ip = request.ip,
                                        durationMinutes = request.durationMinutes,
                                        reason = request.reason
                                    )
                                    if (success) {
                                        logger.info("Successfully jailed IP ${request.ip} from Kafka request")
                                    } else {
                                        logger.warn("Failed to jail IP ${request.ip} (jailIP returned false)")
                                    }
                                } catch (e: Exception) {
                                    logger.error("Error executing jailIP for ${request.ip}", e)
                                }
                            }
                        } catch (e: Exception) {
                            logger.error("Unexpected error processing blocking request", e)
                        }
                    }

                    // Process rules for other topics (or same topic if needed)
                    // Note: This logic was previously wrapping specifically the blocking logic, but it should be independent or sequential
                    val processedEvent = KafkaRuleProcessor.process(topic, value, settings.kafkaRules)
                    
                    // Store in DB if any rule says so (default is true for now)
                    if (processedEvent.appliedRules.isNotEmpty()) {
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
                                 logger.error("Failed to store processed event", e)
                             }
                         }
                    }

                } catch (e: Exception) {
                    logger.error("Failed to process kafka message with rules", e)
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
        ClickHouseService.start()
    }
}




