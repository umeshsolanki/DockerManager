package com.umeshsolanki.dockermanager.kafka

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.jail.IJailManagerService
import kotlinx.coroutines.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.apache.kafka.clients.consumer.ConsumerConfig
import org.apache.kafka.clients.consumer.KafkaConsumer
import org.apache.kafka.common.serialization.StringDeserializer
import org.slf4j.LoggerFactory
import java.time.Duration
import java.util.*

@Serializable
data class IpBlockRequest(
    val ip: String,
    val durationMinutes: Int = 30,
    val reason: String = "Blocked via Kafka request from external app"
)

interface IKafkaService {
    fun start()
    fun stop()
}

class KafkaServiceImpl(
    private val jailManagerService: IJailManagerService
) : IKafkaService {
    private val logger = LoggerFactory.getLogger(KafkaServiceImpl::class.java)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var job: Job? = null
    private var consumer: KafkaConsumer<String, String>? = null

    override fun start() {
        val settings = AppConfig.settings.kafkaSettings
        if (!settings.enabled) {
            logger.info("Kafka consumer is disabled")
            return
        }

        job?.cancel()
        job = scope.launch {
            while (isActive) {
                try {
                    logger.info("Initializing Kafka consumer for topic: ${settings.topic}")
                    val props = Properties()
                    props[ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG] = settings.bootstrapServers
                    props[ConsumerConfig.GROUP_ID_CONFIG] = settings.groupId
                    props[ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG] = StringDeserializer::class.java.name
                    props[ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG] = StringDeserializer::class.java.name
                    props[ConsumerConfig.AUTO_OFFSET_RESET_CONFIG] = "latest"
                    props[ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG] = "true"

                    consumer = KafkaConsumer<String, String>(props).apply {
                        subscribe(listOf(settings.topic))
                    }

                    while (isActive) {
                        val records = consumer?.poll(Duration.ofMillis(1000)) ?: break
                        for (record in records) {
                            try {
                                val request = Json.decodeFromString<IpBlockRequest>(record.value())
                                logger.info("Received IP block request via Kafka: $request")
                                
                                val success = jailManagerService.jailIP(
                                    ip = request.ip,
                                    durationMinutes = request.durationMinutes,
                                    reason = request.reason
                                )
                                
                                if (success) {
                                    logger.info("Successfully blocked IP ${request.ip} via Kafka")
                                } else {
                                    logger.warn("Failed to block IP ${request.ip} via Kafka")
                                }
                            } catch (e: Exception) {
                                logger.error("Error processing Kafka message: ${record.value()}", e)
                            }
                        }
                    }
                } catch (e: Exception) {
                    logger.error("Error in Kafka consumer loop, restarting in 30 seconds", e)
                    consumer?.close()
                    delay(30000)
                } finally {
                    consumer?.close()
                }
            }
        }
    }

    override fun stop() {
        job?.cancel()
        consumer?.close()
        logger.info("Kafka consumer stopped")
    }
}
