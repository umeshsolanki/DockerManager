package com.umeshsolanki.dockermanager.analytics

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.proxy.ProxyHit
import com.umeshsolanki.dockermanager.kafka.IpReputationEvent
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import org.slf4j.LoggerFactory
import java.sql.Connection
import java.sql.DriverManager
import java.sql.PreparedStatement
import java.sql.SQLException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.ConcurrentLinkedQueue

object ClickHouseService {
    private val logger = LoggerFactory.getLogger(ClickHouseService::class.java)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob() + CoroutineName("ClickHouseIngestor"))
    private val logChannel = Channel<ProxyHit>(20000)
    private val reputationChannel = Channel<IpReputationEvent>(10000)
    private val isRunning = AtomicBoolean(false)

    fun start() {
        val settings = AppConfig.settings.clickhouseSettings
        if (!settings.enabled) return

        if (isRunning.compareAndSet(false, true)) {
            logger.info("Initializing ClickHouse service...")
            
            scope.launch {
                try {
                    initializeSchema()
                    
                    val batch = mutableListOf<ProxyHit>()
                    var lastFlushTime = System.currentTimeMillis()
                    
                    while (isActive) {
                        val hit = withTimeoutOrNull(settings.flushIntervalMs) {
                            logChannel.receive()
                        }
                        
                        if (hit != null) {
                            batch.add(hit)
                        }
                        
                        val currentTime = System.currentTimeMillis()
                        if (batch.size >= settings.batchSize || (batch.isNotEmpty() && currentTime - lastFlushTime >= settings.flushIntervalMs)) {
                            flushBatch(batch)
                            batch.clear()
                            lastFlushTime = currentTime
                        }
                    }
                } catch (e: Exception) {
                    if (e !is CancellationException) {
                        logger.error("Error in ClickHouse ingestor loop", e)
                    }
                } finally {
                    isRunning.set(false)
                }
            }
            
            // Reputation Event Ingestor
            scope.launch {
                try {
                    val batch = mutableListOf<IpReputationEvent>()
                    var lastFlushTime = System.currentTimeMillis()
                    val settings = AppConfig.settings.clickhouseSettings
                    
                    while (isActive) {
                        val event = withTimeoutOrNull(settings.flushIntervalMs) {
                            reputationChannel.receive()
                        }
                        
                        if (event != null) {
                            batch.add(event)
                        }
                        
                        val currentTime = System.currentTimeMillis()
                        if (batch.size >= settings.batchSize || (batch.isNotEmpty() && currentTime - lastFlushTime >= settings.flushIntervalMs)) {
                            flushReputationBatch(batch)
                            batch.clear()
                            lastFlushTime = currentTime
                        }
                    }
                } catch (e: Exception) {
                    if (e !is CancellationException) {
                        logger.error("Error in ClickHouse reputation ingestor loop", e)
                    }
                }
            }
        }
    }

    // Simple connection holder - in a real high-load scenario, use HikariCP
    private var activeConnection: Connection? = null
    private val connectionLock = Any()

    private fun getConnection(): Connection? {
        synchronized(connectionLock) {
            try {
                if (activeConnection != null && !activeConnection!!.isClosed && !activeConnection!!.isValid(2)) {
                   try { activeConnection!!.close() } catch (e: Exception) {}
                   activeConnection = null
                }
                
                if (activeConnection == null || activeConnection!!.isClosed) {
                    val settings = AppConfig.settings.clickhouseSettings
                    val url = "jdbc:clickhouse://${settings.host}:${settings.port}/${settings.database}"
                    activeConnection = DriverManager.getConnection(url, settings.user, settings.password)
                }
                return activeConnection
            } catch (e: Exception) {
                logger.error("Failed to connect to ClickHouse: ${e.message}")
                return null
            }
        }
    }

    private fun initializeSchema() {
        getConnection()?.use { conn ->
            val sql = """
                CREATE TABLE IF NOT EXISTS proxy_logs (
                    timestamp DateTime64(3),
                    domain String,
                    ip String,
                    method String,
                    path String,
                    status UInt16,
                    response_time UInt32,
                    user_agent String,
                    referer String,
                    country_code LowCardinality(String),
                    provider LowCardinality(String)
                ) ENGINE = MergeTree()
                PARTITION BY toYYYYMM(timestamp)
                ORDER BY (domain, timestamp, status);
            """.trimIndent()
            conn.createStatement().execute(sql)

            val sqlReputation = """
                CREATE TABLE IF NOT EXISTS ip_reputation_events (
                    timestamp DateTime64(3),
                    type String,
                    ip String,
                    country_code LowCardinality(String),
                    isp String,
                    reason String,
                    score Int32,
                    blocked_times Int32,
                    exponential_blocked_times Int32,
                    flagged_times Int32,
                    last_jail_duration Int32,
                    first_flagged DateTime64(3),
                    last_flagged DateTime64(3),
                    tags Array(String),
                    danger_tags Array(String)
                ) ENGINE = MergeTree()
                PARTITION BY toYYYYMM(timestamp)
                ORDER BY (timestamp, ip);
            """.trimIndent()
            conn.createStatement().execute(sqlReputation)
            
            logger.info("ClickHouse schema verified/initialized.")
        }
    }

    fun log(hit: ProxyHit) {
        if (!AppConfig.settings.clickhouseSettings.enabled) return
        val sent = logChannel.trySend(hit)
        if (!sent.isSuccess) {
            logger.warn("ClickHouse log channel full, dropping log entry")
        }
    }

    fun logReputationEvent(event: IpReputationEvent) {
        if (!AppConfig.settings.clickhouseSettings.enabled) return
        val sent = reputationChannel.trySend(event)
        if (!sent.isSuccess) {
            logger.warn("ClickHouse reputation channel full, dropping event")
        }
    }

    private fun <T> flushGenericBatch(
        batch: List<T>, 
        sql: String, 
        batchName: String, 
        parameterSetter: (PreparedStatement, T) -> Unit
    ) {
        if (batch.isEmpty()) return
        
        try {
            // Get connection but don't close it - we want to reuse it
            // However, we need to handle if it's null
            val conn = getConnection() ?: return
            
            // We use a try-with-resources for the statement only
            try {
                conn.prepareStatement(sql).use { pstmt ->
                    for (item in batch) {
                        parameterSetter(pstmt, item)
                        pstmt.addBatch()
                    }
                    pstmt.executeBatch()
                }
                logger.debug("Successfully flushed ${batch.size} $batchName to ClickHouse")
            } catch (e: SQLException) {
                // If SQL exception occurs, invalidating connection might be safe
                logger.error("SQL Error flushing $batchName batch", e)
                synchronized(connectionLock) {
                    try { activeConnection?.close() } catch (ignored: Exception) {}
                    activeConnection = null
                }
            }
        } catch (e: Exception) {
            logger.error("Failed to flush $batchName batch to ClickHouse", e)
        }
    }

    private fun flushBatch(batch: List<ProxyHit>) {
        val sql = "INSERT INTO proxy_logs (timestamp, domain, ip, method, path, status, response_time, user_agent, referer, country_code, provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        flushGenericBatch(batch, sql, "logs") { pstmt, hit ->
            pstmt.setTimestamp(1, java.sql.Timestamp(hit.timestamp))
            pstmt.setString(2, hit.domain ?: "-")
            pstmt.setString(3, hit.ip)
            pstmt.setString(4, hit.method)
            pstmt.setString(5, hit.path)
            pstmt.setInt(6, hit.status)
            pstmt.setLong(7, hit.responseTime)
            pstmt.setString(8, hit.userAgent)
            pstmt.setString(9, hit.referer)
            pstmt.setString(10, hit.countryCode ?: "Unknown")
            pstmt.setString(11, hit.provider ?: "Unknown")
        }
    }

    private fun flushReputationBatch(batch: List<IpReputationEvent>) {
        val sql = "INSERT INTO ip_reputation_events (timestamp, type, ip, country_code, isp, reason, score, blocked_times, exponential_blocked_times, flagged_times, last_jail_duration, first_flagged, last_flagged, tags, danger_tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        flushGenericBatch(batch, sql, "reputation events") { pstmt, event ->
            val conn = pstmt.connection // Need connection for createArrayOf
            
            pstmt.setTimestamp(1, java.sql.Timestamp(event.timestamp))
            pstmt.setString(2, event.type)
            pstmt.setString(3, event.ip)
            pstmt.setString(4, event.country ?: "Unknown")
            pstmt.setString(5, event.isp ?: "Unknown")
            pstmt.setString(6, event.reason ?: "")
            pstmt.setInt(7, event.score ?: 0)
            pstmt.setInt(8, event.blockedTimes ?: 0)
            pstmt.setInt(9, event.exponentialBlockedTimes ?: 0)
            pstmt.setInt(10, event.flaggedTimes ?: 0)
            pstmt.setInt(11, event.lastJailDuration ?: 0)
            
            val firstFlagged = event.firstFlagged
            if (firstFlagged != null) {
                pstmt.setTimestamp(12, java.sql.Timestamp(firstFlagged))
            } else {
                pstmt.setTimestamp(12, java.sql.Timestamp(0))
            }
            
            val lastFlagged = event.lastFlagged
            if (lastFlagged != null) {
                pstmt.setTimestamp(13, java.sql.Timestamp(lastFlagged))
            } else {
                pstmt.setTimestamp(13, java.sql.Timestamp(0))
            }
            
            pstmt.setArray(14, conn.createArrayOf("String", event.tags.toTypedArray()))
            pstmt.setArray(15, conn.createArrayOf("String", event.dangerTags.toTypedArray()))
        }
    }

    fun stop() {
        isRunning.set(false)
        scope.cancel()
    }

    fun <T> query(sql: String, mapper: (java.sql.ResultSet) -> T): List<T> {
        val results = mutableListOf<T>()
        try {
            // Use the shared connection without closing it
            val conn = getConnection() ?: return emptyList()
            conn.createStatement().executeQuery(sql).use { rs ->
                while (rs.next()) {
                    results.add(mapper(rs))
                }
            }
        } catch (e: Exception) {
            logger.error("Failed to execute ClickHouse query: $sql", e)
        }
        return results
    }

    fun queryMap(sql: String): Map<String, Long> {
        val results = mutableMapOf<String, Long>()
        try {
            // Use the shared connection without closing it
            val conn = getConnection() ?: return emptyMap()
            conn.createStatement().executeQuery(sql).use { rs ->
                while (rs.next()) {
                    results[rs.getString(1)] = rs.getLong(2)
                }
            }
        } catch (e: Exception) {
            logger.error("Failed to execute ClickHouse queryMap: $sql", e)
        }
        return results
    }
}
