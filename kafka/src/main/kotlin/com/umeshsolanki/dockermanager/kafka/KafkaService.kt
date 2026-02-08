package com.umeshsolanki.dockermanager.kafka

import kotlinx.coroutines.*
import kotlinx.serialization.json.Json
import org.apache.kafka.clients.admin.AdminClient
import org.apache.kafka.clients.admin.AdminClientConfig
import org.apache.kafka.clients.admin.NewTopic
import org.apache.kafka.clients.consumer.ConsumerConfig
import org.apache.kafka.clients.consumer.KafkaConsumer
import org.apache.kafka.clients.producer.KafkaProducer
import org.apache.kafka.clients.producer.ProducerConfig
import org.apache.kafka.clients.producer.ProducerRecord
import org.apache.kafka.common.TopicPartition
import org.apache.kafka.common.serialization.StringDeserializer
import org.apache.kafka.common.serialization.StringSerializer
import org.slf4j.LoggerFactory
import java.time.Duration
import java.util.*

interface KafkaMessageHandler {
    fun canHandle(topic: String): Boolean
    fun handle(topic: String, key: String?, value: String)
}

interface IKafkaService {
    fun start(settings: KafkaSettings)
    fun stop()
    
    // Topic Management
    fun listTopics(settings: KafkaSettings): List<KafkaTopicInfo>
    fun createTopic(settings: KafkaSettings, name: String, partitions: Int, replicationFactor: Short): Result<Unit>
    fun deleteTopic(settings: KafkaSettings, name: String): Result<Unit>
    
    // Message Review
    fun getMessages(settings: KafkaSettings, topic: String, limit: Int): List<KafkaMessage>
    
    // Producers
    fun publishMessage(settings: KafkaSettings, topic: String, key: String?, value: String)
    fun publishSqlAudit(settings: KafkaSettings, audit: SqlAuditLog)
    
    // Reputation
    fun publishReputationEvent(settings: KafkaSettings, event: IpReputationEvent)
    
    // Handlers
    fun registerHandler(handler: KafkaMessageHandler)
}

class KafkaServiceImpl : IKafkaService {
    private val logger = LoggerFactory.getLogger(KafkaServiceImpl::class.java)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var job: Job? = null
    private var consumer: KafkaConsumer<String, String>? = null
    private var producer: KafkaProducer<String, String>? = null
    private val handlers = mutableListOf<KafkaMessageHandler>()

    override fun registerHandler(handler: KafkaMessageHandler) {
        handlers.add(handler)
    }

    private fun getProducer(settings: KafkaSettings): KafkaProducer<String, String>? {
        if (!settings.enabled) return null
        
        if (producer == null) {
            val props = Properties()
            props[ProducerConfig.BOOTSTRAP_SERVERS_CONFIG] = settings.bootstrapServers
            props[ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG] = StringSerializer::class.java.name
            props[ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG] = StringSerializer::class.java.name
            props[ProducerConfig.ACKS_CONFIG] = "1"
            props[ProducerConfig.RETRIES_CONFIG] = 3
            
            try {
                producer = KafkaProducer(props)
            } catch (e: Exception) {
                logger.error("Failed to create Kafka producer", e)
            }
        }
        return producer
    }

    override fun start(settings: KafkaSettings) {
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
                            val topic = record.topic()
                            val key = record.key()
                            val value = record.value()
                            
                            handlers.filter { it.canHandle(topic) }.forEach { 
                                try {
                                    it.handle(topic, key, value)
                                } catch (e: Exception) {
                                    logger.error("Error in Kafka handler for topic $topic", e)
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
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
        producer?.close()
        logger.info("Kafka services stopped")
    }

    private fun getAdminClient(settings: KafkaSettings): AdminClient {
        val props = Properties()
        props[AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG] = settings.adminHost
        props[AdminClientConfig.REQUEST_TIMEOUT_MS_CONFIG] = 5000
        props[AdminClientConfig.DEFAULT_API_TIMEOUT_MS_CONFIG] = 5000
        return AdminClient.create(props)
    }

    override fun listTopics(settings: KafkaSettings): List<KafkaTopicInfo> {
        return try {
            getAdminClient(settings).use { admin ->
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

    override fun createTopic(settings: KafkaSettings, name: String, partitions: Int, replicationFactor: Short): Result<Unit> {
        return try {
            getAdminClient(settings).use { admin ->
                admin.createTopics(listOf(NewTopic(name, partitions, replicationFactor))).all().get()
                Result.success(Unit)
            }
        } catch (e: Exception) {
            val cause = e.cause ?: e
            logger.error("Error creating Kafka topic: $name", cause)
            Result.failure(cause)
        }
    }

    override fun deleteTopic(settings: KafkaSettings, name: String): Result<Unit> {
        return try {
            getAdminClient(settings).use { admin ->
                admin.deleteTopics(listOf(name)).all().get()
                Result.success(Unit)
            }
        } catch (e: Exception) {
            val cause = e.cause ?: e
            logger.error("Error deleting Kafka topic: $name", cause)
            Result.failure(cause)
        }
    }

    override fun getMessages(settings: KafkaSettings, topic: String, limit: Int): List<KafkaMessage> {
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
                val maxWait = System.currentTimeMillis() + 5000 
                
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

    override fun publishMessage(settings: KafkaSettings, topic: String, key: String?, value: String) {
        val prod = getProducer(settings) ?: return
        scope.launch {
            try {
                prod.send(ProducerRecord(topic, key, value)).get()
            } catch (e: Exception) {
                logger.error("Failed to publish message to topic $topic", e)
            }
        }
    }

    override fun publishSqlAudit(settings: KafkaSettings, audit: SqlAuditLog) {
        val json = kotlinx.serialization.json.Json.encodeToString(SqlAuditLog.serializer(), audit)
        publishMessage(settings, "sql-audit-log", audit.externalDbId ?: "primary", json)
    }
    
    override fun publishReputationEvent(settings: KafkaSettings, event: IpReputationEvent) {
        if (!settings.enabled) return
        val json = kotlinx.serialization.json.Json.encodeToString(IpReputationEvent.serializer(), event)
        publishMessage(settings, settings.reputationTopic, event.ip, json)
    }
}
