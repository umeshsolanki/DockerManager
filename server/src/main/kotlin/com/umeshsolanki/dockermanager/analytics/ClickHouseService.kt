package com.umeshsolanki.dockermanager.analytics

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.proxy.ProxyHit
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import org.slf4j.LoggerFactory
import java.sql.Connection
import java.sql.DriverManager
import java.util.concurrent.atomic.AtomicBoolean

object ClickHouseService {
    private val logger = LoggerFactory.getLogger(ClickHouseService::class.java)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob() + CoroutineName("ClickHouseIngestor"))
    private val logChannel = Channel<ProxyHit>(20000)
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
        }
    }

    private fun getConnection(): Connection? {
        val settings = AppConfig.settings.clickhouseSettings
        // Use JDBC URL for ClickHouse
        val url = "jdbc:clickhouse://${settings.host}:${settings.port}/${settings.database}"
        return try {
             DriverManager.getConnection(url, settings.user, settings.password)
        } catch (e: Exception) {
            logger.error("Failed to connect to ClickHouse at $url: ${e.message}")
            null
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

    private fun flushBatch(batch: List<ProxyHit>) {
        if (batch.isEmpty()) return
        
        try {
            getConnection()?.use { conn ->
                val sql = "INSERT INTO proxy_logs (timestamp, domain, ip, method, path, status, response_time, user_agent, referer, country_code, provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                conn.prepareStatement(sql).use { pstmt ->
                    for (hit in batch) {
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
                        pstmt.addBatch()
                    }
                    pstmt.executeBatch()
                }
                logger.debug("Successfully flushed ${batch.size} logs to ClickHouse")
            }
        } catch (e: Exception) {
            logger.error("Failed to flush batch to ClickHouse", e)
        }
    }

    fun stop() {
        isRunning.set(false)
        scope.cancel()
    }

    fun <T> query(sql: String, mapper: (java.sql.ResultSet) -> T): List<T> {
        val results = mutableListOf<T>()
        try {
            getConnection()?.use { conn ->
                conn.createStatement().executeQuery(sql).use { rs ->
                    while (rs.next()) {
                        results.add(mapper(rs))
                    }
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
            getConnection()?.use { conn ->
                conn.createStatement().executeQuery(sql).use { rs ->
                    while (rs.next()) {
                        results[rs.getString(1)] = rs.getLong(2)
                    }
                }
            }
        } catch (e: Exception) {
            logger.error("Failed to execute ClickHouse queryMap: $sql", e)
        }
        return results
    }
}
