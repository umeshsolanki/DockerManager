package com.umeshsolanki.dockermanager.database

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.transactions.transaction
import org.slf4j.LoggerFactory
import java.sql.ResultSet
import java.util.concurrent.ConcurrentHashMap

@kotlinx.serialization.Serializable
data class ExternalDbConfig(
    val id: String,
    val name: String,
    val type: String,
    val host: String,
    val port: Int,
    val database: String,
    val user: String,
    val password: String,
    val ssl: Boolean = false,
    val version: Long = 0 // Used to detect configuration changes
)

object SqlService {
    private val logger = LoggerFactory.getLogger(SqlService::class.java)
    private val dataSources = ConcurrentHashMap<String, Pair<ExternalDbConfig, HikariDataSource>>()

    fun getDataSource(config: ExternalDbConfig): HikariDataSource {
        val existing = dataSources[config.id]
        
        // If config changed (simplified by checking version or just hash/properties)
        // For simplicity here, we'll check if the host/port/db changed
        if (existing != null && isConfigChanged(existing.first, config)) {
            logger.info("Config changed for ${config.name}, recreating connection pool")
            existing.second.close()
            dataSources.remove(config.id)
        }

        return dataSources.getOrPut(config.id) {
            logger.info("Initializing new connection pool for ${config.name} (${config.type})")
            val hConfig = HikariConfig().apply {
                jdbcUrl = buildJdbcUrl(config)
                username = config.user
                password = config.password
                driverClassName = getDriverClass(config.type)
                
                // Production level pool settings
                maximumPoolSize = 10
                minimumIdle = 2
                idleTimeout = 300000 // 5 minutes
                maxLifetime = 1800000 // 30 minutes
                connectionTimeout = 15000 // 15 seconds
                leakDetectionThreshold = 5000 // 5 seconds leak detection
                isAutoCommit = true
                poolName = "HikariPool-${config.name.replace(" ", "-")}"
                
                // Connection testing
                connectionTestQuery = if (config.type.lowercase().contains("sqlite")) "SELECT 1" else null
            }
            Pair(config, HikariDataSource(hConfig))
        }.second
    }

    private fun isConfigChanged(old: ExternalDbConfig, new: ExternalDbConfig): Boolean {
        return old.host != new.host || old.port != new.port || old.database != new.database || 
               old.user != new.user || old.password != new.password || old.type != new.type || old.ssl != new.ssl
    }

    private fun buildJdbcUrl(config: ExternalDbConfig): String {
        return when (val type = config.type.lowercase()) {
            "postgres", "postgresql" -> {
                "jdbc:postgresql://${config.host}:${config.port}/${config.database}${if (config.ssl) "?sslmode=require" else ""}"
            }
            "mysql" -> {
                "jdbc:mysql://${config.host}:${config.port}/${config.database}?useSSL=${config.ssl}&allowPublicKeyRetrieval=true&serverTimezone=UTC"
            }
            "mariadb" -> {
                "jdbc:mariadb://${config.host}:${config.port}/${config.database}?useSSL=${config.ssl}"
            }
            "sqlite" -> "jdbc:sqlite:${config.host}"
            else -> throw IllegalArgumentException("Unsupported database type: $type")
        }
    }

    private fun getDriverClass(type: String): String {
        return when (type.lowercase()) {
            "postgres", "postgresql" -> "org.postgresql.Driver"
            "mysql" -> "com.mysql.cj.jdbc.Driver"
            "mariadb" -> "org.mariadb.jdbc.Driver"
            "sqlite" -> "org.sqlite.JDBC"
            else -> "org.postgresql.Driver"
        }
    }

    fun testConnection(config: ExternalDbConfig): Pair<Boolean, String> {
        var ds: HikariDataSource? = null
        return try {
            val hConfig = HikariConfig().apply {
                jdbcUrl = buildJdbcUrl(config)
                username = config.user
                password = config.password
                driverClassName = getDriverClass(config.type)
                connectionTimeout = 5000
                maximumPoolSize = 1
                isAutoCommit = true
                poolName = "TestPool-${System.currentTimeMillis()}"
            }
            ds = HikariDataSource(hConfig)
            ds.connection.use { conn ->
                if (conn.isValid(3)) Pair(true, "Connected successfully")
                else Pair(false, "Connection validation failed")
            }
        } catch (e: Exception) {
            logger.error("Connection test failed for ${config.name}", e)
            Pair(false, e.message ?: "Unknown error")
        } finally {
            ds?.close()
        }
    }

    fun executeQuery(sql: String, config: ExternalDbConfig? = null): List<Map<String, String?>> {
        if (config == null) {
            return transaction {
                val results = mutableListOf<Map<String, String?>>()
                exec(sql) { rs ->
                    results.addAll(rs.toListOfMaps())
                }
                results
            }
        }

        return try {
            val ds = getDataSource(config)
            ds.connection.use { conn ->
                conn.createStatement().use { stmt ->
                    if (stmt.execute(sql)) {
                        stmt.resultSet.use { rs ->
                            rs.toListOfMaps()
                        }
                    } else {
                        listOf(mapOf("status" to "Success", "rowsAffected" to stmt.updateCount.toString()))
                    }
                }
            }
        } catch (e: Exception) {
            logger.error("External query failed on ${config.name}: $sql", e)
            listOf(mapOf("error" to (e.message ?: "Unknown SQL error")))
        }
    }

    private fun ResultSet.toListOfMaps(): List<Map<String, String?>> {
        val list = mutableListOf<Map<String, String?>>()
        val meta = this.metaData
        val colCount = meta.columnCount
        while (this.next()) {
            val row = LinkedHashMap<String, String?>(colCount)
            for (i in 1..colCount) {
                val label = meta.getColumnLabel(i)
                row[label] = this.getObject(i)?.toString()
            }
            list.add(row)
        }
        return list
    }

    fun removeDataSource(id: String) {
        dataSources.remove(id)?.second?.close()
    }

    fun closeAll() {
        dataSources.forEach { 
            try { it.value.second.close() } catch (e: Exception) { /* ignore */ }
        }
        dataSources.clear()
    }
}
