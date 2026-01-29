package com.umeshsolanki.dockermanager.kafka

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.jail.IJailManagerService
import kotlinx.coroutines.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.apache.kafka.clients.admin.AdminClient
import org.apache.kafka.clients.admin.AdminClientConfig
import org.apache.kafka.clients.admin.NewTopic
import org.apache.kafka.clients.consumer.ConsumerConfig
import org.apache.kafka.clients.consumer.KafkaConsumer
import org.apache.kafka.common.TopicPartition
import org.apache.kafka.common.serialization.StringDeserializer
import org.slf4j.LoggerFactory
import java.time.Duration
import java.util.*
import kotlin.jvm.optionals.getOrNull

@Serializable
data class IpBlockRequest(
    val ip: String,
    val durationMinutes: Int = 30,
    val reason: String = "Blocked via Kafka request from external app"
)

@Serializable
data class KafkaMessage(
    val topic: String,
    val partition: Int,
    val offset: Long,
    val key: String?,
    val value: String,
    val timestamp: Long
)

@Serializable
data class KafkaTopicInfo(
    val name: String,
    val partitions: Int,
    val replicationFactor: Int
)

interface IKafkaService {
    fun start()
    fun stop()
    
    // Topic Management
    fun listTopics(): List<KafkaTopicInfo>
    fun createTopic(name: String, partitions: Int, replicationFactor: Short): Result<Unit>
    fun deleteTopic(name: String): Result<Unit>
    
    // Message Review
    fun getMessages(topic: String, limit: Int): List<KafkaMessage>
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

    private fun getAdminClient(): AdminClient {
        val settings = AppConfig.settings.kafkaSettings
        val props = Properties()
        props[AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG] = settings.adminHost
        props[AdminClientConfig.REQUEST_TIMEOUT_MS_CONFIG] = 5000
        props[AdminClientConfig.DEFAULT_API_TIMEOUT_MS_CONFIG] = 5000
        return AdminClient.create(props)
    }

    override fun listTopics(): List<KafkaTopicInfo> {
        return try {
            getAdminClient().use { admin ->
                val topicNames = admin.listTopics().names().get()
                val descriptions = admin.describeTopics(topicNames).allTopicNames().get()
                
                descriptions.values.map { desc ->
                    KafkaTopicInfo(
                        name = desc.name(),
                        partitions = desc.partitions().size,
                        replicationFactor = desc.partitions().firstOrNull()?.replicas()?.size ?: 0
                    )
                }
            }
        } catch (e: Exception) {
            logger.error("Error listing Kafka topics", e)
            emptyList()
        }
    }

    override fun createTopic(name: String, partitions: Int, replicationFactor: Short): Result<Unit> {
        return try {
            getAdminClient().use { admin ->
                admin.createTopics(listOf(NewTopic(name, partitions, replicationFactor))).all().get()
                Result.success(Unit)
            }
        } catch (e: Exception) {
            val cause = e.cause ?: e
            logger.error("Error creating Kafka topic: $name", cause)
            Result.failure(cause)
        }
    }

    override fun deleteTopic(name: String): Result<Unit> {
        return try {
            getAdminClient().use { admin ->
                admin.deleteTopics(listOf(name)).all().get()
                Result.success(Unit)
            }
        } catch (e: Exception) {
            val cause = e.cause ?: e
            logger.error("Error deleting Kafka topic: $name", cause)
            Result.failure(cause)
        }
    }

    override fun getMessages(topic: String, limit: Int): List<KafkaMessage> {
        val settings = AppConfig.settings.kafkaSettings
        val props = Properties()
        props[ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG] = settings.bootstrapServers
        props[ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG] = StringDeserializer::class.java.name
        props[ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG] = StringDeserializer::class.java.name
        props[ConsumerConfig.AUTO_OFFSET_RESET_CONFIG] = "earliest"
        
        return try {
            KafkaConsumer<String, String>(props).use { consumer ->
                val partitions = consumer.partitionsFor(topic).map { TopicPartition(topic, it.partition()) }
                consumer.assign(partitions)
                
                val endOffsets = consumer.endOffsets(partitions)
                partitions.forEach { tp ->
                    val offset = (endOffsets[tp] ?: 0L) - limit
                    consumer.seek(tp, if (offset < 0) 0 else offset)
                }

                val messages = mutableListOf<KafkaMessage>()
                var count = 0
                val maxWait = System.currentTimeMillis() + 5000 // 5 seconds timeout
                
                while (count < limit * partitions.size && System.currentTimeMillis() < maxWait) {
                    val records = consumer.poll(Duration.ofMillis(500))
                    if (records.isEmpty) break
                    
                    for (record in records) {
                        messages.add(KafkaMessage(
                            topic = record.topic(),
                            partition = record.partition(),
                            offset = record.offset(),
                            key = record.key(),
                            value = record.value(),
                            timestamp = record.timestamp()
                        ))
                        count++
                    }
                }
                messages.sortedByDescending { it.timestamp }.take(limit)
            }
        } catch (e: Exception) {
            logger.error("Error fetching messages from Kafka topic: $topic", e)
            emptyList()
        }
    }
}
