package com.umeshsolanki.dockermanager.docker

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.database.DatabaseFactory.dbQuery
import com.umeshsolanki.dockermanager.database.SyslogTable
import kotlinx.coroutines.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.like
import org.slf4j.LoggerFactory
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.atomic.AtomicBoolean

interface ISyslogService {
    fun start()
    fun stop()
    fun isRunning(): Boolean
    suspend fun getLogs(limit: Int = 100, host: String? = null, search: String? = null): List<SyslogLogEntry>
    fun updateSettings(enabled: Boolean, port: Int)
}

class SyslogServiceImpl : ISyslogService {
    private val logger = LoggerFactory.getLogger(SyslogServiceImpl::class.java)
    private val isStarted = AtomicBoolean(false)
    private var serverJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val isoFormatter = DateTimeFormatter.ISO_LOCAL_DATE_TIME

    override fun start() {
        if (!AppConfig.settings.syslogEnabled) {
            logger.info("Syslog ingestion is disabled in settings")
            return
        }
        if (isStarted.compareAndSet(false, true)) {
            val port = AppConfig.settings.syslogPort
            serverJob = scope.launch {
                runServer(port)
            }
            logger.info("Syslog server started on port $port")
        }
    }

    override fun stop() {
        if (isStarted.compareAndSet(true, false)) {
            serverJob?.cancel()
            logger.info("Syslog server stopped")
        }
    }

    override fun isRunning(): Boolean = isStarted.get()

    override suspend fun getLogs(limit: Int, host: String?, search: String?): List<SyslogLogEntry> {
        return dbQuery {
            var query = SyslogTable.selectAll()
            
            if (host != null) {
                query = query.andWhere { SyslogTable.host eq host }
            }
            if (search != null) {
                query = query.andWhere { SyslogTable.message.lowerCase() like "%${search.lowercase()}%" }
            }

            query.orderBy(SyslogTable.timestamp to org.jetbrains.exposed.sql.SortOrder.DESC)
                .limit(limit)
                .map {
                    SyslogLogEntry(
                        id = it[SyslogTable.id],
                        timestamp = it[SyslogTable.timestamp].format(isoFormatter),
                        facility = it[SyslogTable.facility],
                        severity = it[SyslogTable.severity],
                        host = it[SyslogTable.host],
                        appName = it[SyslogTable.appName],
                        procId = it[SyslogTable.procId],
                        messageId = it[SyslogTable.messageId],
                        message = it[SyslogTable.message]
                    )
                }
        }
    }

    override fun updateSettings(enabled: Boolean, port: Int) {
        val wasEnabled = AppConfig.settings.syslogEnabled
        val oldPort = AppConfig.settings.syslogPort
        
        AppConfig.updateSyslogSettings(enabled, port)
        
        if (wasEnabled != enabled || oldPort != port) {
            stop()
            if (enabled) {
                start()
            }
        }
    }

    private suspend fun runServer(port: Int) {
        var socket: DatagramSocket? = null
        try {
            val isLinux = System.getProperty("os.name").lowercase().contains("linux")
            if (!isLinux) {
                logger.info("Syslog server simulation active on non-Linux system")
                while (isStarted.get()) {
                    delay(5000)
                }
                return
            }

            socket = DatagramSocket(port)
            val buffer = ByteArray(65535)
            val packet = DatagramPacket(buffer, buffer.size)

            while (isStarted.get()) {
                yield() // Check for cancellation and allow other coroutines to run
                withContext(Dispatchers.IO) {
                    socket.receive(packet)
                }
                val rawMessage = String(packet.data, 0, packet.length)
                val remoteAddress = packet.address.hostAddress
                
                processSyslogMessage(rawMessage, remoteAddress)
            }
        } catch (e: Exception) {
            if (isStarted.get()) {
                logger.error("Syslog server error on port $port", e)
            }
        } finally {
            socket?.close()
        }
    }

    private fun processSyslogMessage(rawMessage: String, remoteAddress: String) {
        scope.launch {
            try {
                val entry = parseSyslog(rawMessage, remoteAddress)
                saveEntry(entry)
            } catch (e: Exception) {
                logger.error("Failed to process syslog message: $rawMessage", e)
            }
        }
    }

    private suspend fun saveEntry(entry: SyslogLogEntry) {
        if (!AppConfig.settings.dbPersistenceLogsEnabled) return

        dbQuery {
            SyslogTable.insert {
                it[timestamp] = LocalDateTime.parse(entry.timestamp, isoFormatter)
                it[facility] = entry.facility
                it[severity] = entry.severity
                it[host] = entry.host
                it[appName] = entry.appName
                it[procId] = entry.procId
                it[messageId] = entry.messageId
                it[message] = entry.message
            }
        }
    }

    private fun parseSyslog(raw: String, remoteAddress: String): SyslogLogEntry {
        // Basic parser for BSD (3164) and IETF (5424) formats
        // This is a simplified implementation
        
        var priority: Int? = null
        var message = raw
        
        if (raw.startsWith("<")) {
            val endIdx = raw.indexOf(">")
            if (endIdx > 0) {
                priority = raw.substring(1, endIdx).toIntOrNull()
                message = raw.substring(endIdx + 1)
            }
        }

        val facility = priority?.let { it / 8 }
        val severity = priority?.let { it % 8 }

        return SyslogLogEntry(
            timestamp = LocalDateTime.now().format(isoFormatter),
            facility = facility,
            severity = severity,
            host = remoteAddress,
            appName = null,
            procId = null,
            messageId = null,
            message = message.trim()
        )
    }
}
