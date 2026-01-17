package com.umeshsolanki.dockermanager.database

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import kotlinx.coroutines.Dispatchers
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SchemaUtils
import org.jetbrains.exposed.sql.transactions.experimental.newSuspendedTransaction
import org.jetbrains.exposed.sql.transactions.transaction
import org.slf4j.LoggerFactory

object DatabaseFactory {
    private val logger = LoggerFactory.getLogger(DatabaseFactory::class.java)

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
            transactionIsolation = "TRANSACTION_REPEATABLE_READ"
            validate()
        }

        val dataSource = HikariDataSource(config)
        Database.connect(dataSource)

        transaction {
            SchemaUtils.create(SettingsTable)
            SchemaUtils.create(ProxyLogsTable)
            SchemaUtils.create(IpRangesTable)
        }
    }

    suspend fun <T> dbQuery(block: suspend () -> T): T =
        newSuspendedTransaction(Dispatchers.IO) { block() }
}
