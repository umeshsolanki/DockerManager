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
    suspend fun sendTestEmail(config: SmtpConfig, toEmail: String): EmailTestResult
    suspend fun sendAlert(subject: String, message: String): Boolean
}

class EmailServiceImpl : IEmailService {
    private val logger = LoggerFactory.getLogger(EmailServiceImpl::class.java)

    override fun getAlertConfig(): AlertConfig {
        return AppConfig.alertConfig
    }

    override fun updateAlertConfig(config: AlertConfig) {
        AppConfig.updateAlertConfig(config)
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
                 // Add this if you want to trust all hosts (dev only really)
                 // put("mail.smtp.ssl.trust", "*") 
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

object EmailService {
    private val service: IEmailService = EmailServiceImpl()
    
    fun getAlertConfig() = service.getAlertConfig()
    fun updateAlertConfig(config: AlertConfig) = service.updateAlertConfig(config)
    suspend fun sendTestEmail(config: SmtpConfig, toEmail: String) = service.sendTestEmail(config, toEmail)
    suspend fun sendAlert(subject: String, message: String) = service.sendAlert(subject, message)
}
