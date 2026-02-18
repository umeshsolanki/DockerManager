package com.umeshsolanki.dockermanager.database

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SchemaUtils
import org.jetbrains.exposed.sql.transactions.experimental.newSuspendedTransaction
import org.jetbrains.exposed.sql.transactions.transaction
import org.postgresql.util.PSQLException
import org.slf4j.LoggerFactory

object DatabaseFactory {
    private val logger = LoggerFactory.getLogger(DatabaseFactory::class.java)
    private var dataSource: HikariDataSource? = null

    fun init(
        dbHost: String? = null,
        dbPort: String? = null,
        dbDatabaseName: String? = null,
        dbUser: String? = null,
        dbPassword: String? = null
    ) {
        val host = dbHost ?: System.getenv("DB_HOST") ?: "localhost"
        val port = dbPort ?: System.getenv("DB_PORT") ?: "5432"
        val dbName = dbDatabaseName ?: System.getenv("DB_NAME") ?: "dockermanager"
        val user = dbUser ?: System.getenv("DB_USER") ?: "postgres"
        val password = dbPassword ?: System.getenv("DB_PASSWORD") ?: "postgres"

        val jdbcUrl = "jdbc:postgresql://$host:$port/$dbName"
        
        logger.info("Connecting to database at $jdbcUrl")

        val config = HikariConfig().apply {
            this.jdbcUrl = jdbcUrl
            this.username = user
            this.password = password
            driverClassName = "org.postgresql.Driver"
            maximumPoolSize = 10
            isAutoCommit = false
            // Use READ_COMMITTED to avoid "could not serialize access due to concurrent update"
            // when multiple workers update the same ip_reputation row (analytics, mirror, etc.)
            transactionIsolation = "TRANSACTION_READ_COMMITTED"
            validate()
        }

        
        dataSource?.close()
        val newDataSource = HikariDataSource(config)
        dataSource = newDataSource
        Database.connect(newDataSource)

        transaction {
            SchemaUtils.createMissingTablesAndColumns(
                SettingsTable,
                ProxyLogsTable,
                IpRangesTable,
                FcmTokensTable,
                KafkaProcessedEventsTable,
                IpReputationTable,
                SavedQueriesTable
            )
        }
    }

    suspend fun <T> dbQuery(block: suspend () -> T): T =
        newSuspendedTransaction(Dispatchers.IO) { block() }

    /**
     * Runs a DB query with retry on serialization/deadlock failures.
     * Use for high-concurrency ip_reputation updates (analytics, mirror, jail).
     */
    suspend fun <T> dbQueryWithRetry(
        maxRetries: Int = 3,
        baseDelayMs: Long = 50,
        block: suspend () -> T
    ): T {
        var lastException: Exception? = null
        for (attempt in 1..maxRetries) {
            try {
                return dbQuery(block)
            } catch (e: Exception) {
                lastException = e
                val isRetryable = e is PSQLException && (
                    e.message?.contains("could not serialize", ignoreCase = true) == true ||
                    e.message?.contains("deadlock detected", ignoreCase = true) == true
                )
                if (!isRetryable || attempt == maxRetries) throw e
                val delayMs = baseDelayMs * (1L shl (attempt - 1))
                logger.warn("DB serialization/deadlock (attempt $attempt/$maxRetries), retrying in ${delayMs}ms: ${e.message}")
                delay(delayMs)
            }
        }
        throw lastException ?: RuntimeException("Unexpected retry exhaustion")
    }
}
