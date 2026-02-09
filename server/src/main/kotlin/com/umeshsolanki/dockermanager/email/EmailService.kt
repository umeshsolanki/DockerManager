package com.umeshsolanki.dockermanager.email

import com.umeshsolanki.dockermanager.AppConfig
import kotlinx.serialization.Serializable
import org.slf4j.LoggerFactory
import jakarta.mail.*
import jakarta.mail.internet.InternetAddress
import jakarta.mail.internet.MimeMessage
import java.util.Properties

interface IEmailService {
    fun getAlertConfig(): AlertConfig
    fun updateAlertConfig(config: AlertConfig)
    fun getEmailClientConfig(): EmailClientConfig
    fun updateEmailClientConfig(config: EmailClientConfig)
    suspend fun sendTestEmail(config: SmtpConfig, toEmail: String): EmailTestResult
    suspend fun sendAlert(subject: String, message: String): Boolean
    
    // Client Methods
    suspend fun listFolders(config: ImapConfig): List<EmailFolder>
    suspend fun listMessages(config: ImapConfig, folder: String, limit: Int = 50): List<EmailMessage>
    suspend fun getMessage(config: ImapConfig, folderName: String, messageId: String): EmailMessage?
}

class EmailServiceImpl : IEmailService {
    private val logger = LoggerFactory.getLogger(EmailServiceImpl::class.java)

    override fun getAlertConfig(): AlertConfig = AppConfig.alertConfig
    override fun updateAlertConfig(config: AlertConfig) = AppConfig.updateAlertConfig(config)
    
    override fun getEmailClientConfig(): EmailClientConfig = AppConfig.settings.emailClientConfig
    override fun updateEmailClientConfig(config: EmailClientConfig) {
        AppConfig.updateEmailClientConfig(config)
    }

    override suspend fun sendTestEmail(config: SmtpConfig, toEmail: String): EmailTestResult {
        return try {
            sendEmailInternal(config, toEmail, "DockerManager Test Email", "This is a test email from DockerManager to verify SMTP settings.")
            EmailTestResult(true, "Test email sent successfully to $toEmail")
        } catch (e: Exception) {
            logger.error("Failed to send test email", e)
            EmailTestResult(false, "Failed to send test email: ${e.message}")
        }
    }

    override suspend fun sendAlert(subject: String, message: String): Boolean {
        val config = AppConfig.alertConfig
        if (!config.enabled || config.adminEmail.isBlank()) {
            return false
        }
        
        return try {
            sendEmailInternal(config.smtpConfig, config.adminEmail, subject, message)
            true
        } catch (e: Exception) {
            logger.error("Failed to send alert email: $subject", e)
            false
        }
    }

    override suspend fun listFolders(config: ImapConfig): List<EmailFolder> {
        return try {
            val store = connectToImap(config)
            val folders = store.defaultFolder.list("*")
            val result = folders.map { folder ->
                EmailFolder(
                    name = folder.name,
                    fullName = folder.fullName,
                    messageCount = if (folder.type and Folder.HOLDS_MESSAGES != 0) folder.messageCount else 0,
                    unreadCount = if (folder.type and Folder.HOLDS_MESSAGES != 0) folder.unreadMessageCount else 0
                )
            }
            store.close()
            result
        } catch (e: Exception) {
            logger.error("Failed to list IMAP folders", e)
            emptyList()
        }
    }

    override suspend fun listMessages(config: ImapConfig, folderName: String, limit: Int): List<EmailMessage> {
        return try {
            val store = connectToImap(config)
            val folder = store.getFolder(folderName)
            folder.open(Folder.READ_ONLY)
            
            val totalMessages = folder.messageCount
            val start = (totalMessages - limit + 1).coerceAtLeast(1)
            val end = totalMessages
            
            val messages = if (totalMessages > 0) folder.getMessages(start, end) else emptyArray()
            val result = messages.reversedArray().map { msg ->
                EmailMessage(
                    id = (msg as MimeMessage).messageID ?: msg.hashCode().toString(),
                    subject = msg.subject ?: "(No Subject)",
                    from = msg.from?.firstOrNull()?.toString() ?: "Unknown",
                    to = msg.getRecipients(Message.RecipientType.TO)?.firstOrNull()?.toString() ?: "Unknown",
                    date = msg.sentDate?.toString() ?: "Unknown",
                    unread = !msg.isSet(Flags.Flag.SEEN)
                )
            }
            folder.close(false)
            store.close()
            result
        } catch (e: Exception) {
            logger.error("Failed to list IMAP messages in $folderName", e)
            emptyList()
        }
    }

    override suspend fun getMessage(config: ImapConfig, folderName: String, messageId: String): EmailMessage? {
        // Implementation for getting full message content would go here
        return null 
    }

    private fun connectToImap(config: ImapConfig): Store {
        val props = Properties().apply {
            put("mail.store.protocol", "imaps")
            put("mail.imaps.host", config.host)
            put("mail.imaps.port", config.port.toString())
            put("mail.imaps.timeout", "10000")
            put("mail.imaps.connectiontimeout", "10000")
            if (config.useSsl) {
                put("mail.imaps.ssl.enable", "true")
            }
        }
        val session = Session.getInstance(props)
        val store = session.getStore("imaps")
        store.connect(config.host, config.username, config.password)
        return store
    }

    private fun sendEmailInternal(smtpConfig: SmtpConfig, toEmail: String, subject: String, body: String) {
        val props = Properties().apply {
            put("mail.smtp.auth", "true")
            put("mail.smtp.host", smtpConfig.host)
            put("mail.smtp.port", smtpConfig.port.toString())
            put("mail.smtp.timeout", "10000")
            put("mail.smtp.connectiontimeout", "10000")

            if (smtpConfig.useSsl) {
                 put("mail.smtp.ssl.enable", "true")
                 put("mail.smtp.socketFactory.port", smtpConfig.port.toString())
                 put("mail.smtp.socketFactory.class", "javax.net.ssl.SSLSocketFactory")
                 put("mail.smtp.socketFactory.fallback", "false")
            } else if (smtpConfig.useTls) {
                put("mail.smtp.starttls.enable", "true")
            }
        }

        val session = Session.getInstance(props, object : Authenticator() {
            override fun getPasswordAuthentication(): PasswordAuthentication {
                return PasswordAuthentication(smtpConfig.username, smtpConfig.password)
            }
        })

        val message = MimeMessage(session).apply {
            setFrom(InternetAddress(smtpConfig.fromAddress.ifBlank { smtpConfig.username }))
            setRecipients(Message.RecipientType.TO, InternetAddress.parse(toEmail))
            setSubject(subject)
            setText(body, "utf-8")
        }

        Transport.send(message)
    }
}

object EmailService : IEmailService by EmailServiceImpl()
