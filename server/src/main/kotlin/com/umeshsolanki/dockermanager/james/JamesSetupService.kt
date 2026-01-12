package com.umeshsolanki.dockermanager.james
import com.umeshsolanki.dockermanager.*
import com.umeshsolanki.dockermanager.utils.ResourceLoader

import org.slf4j.LoggerFactory
import java.io.File

object JamesSetupService {
    private val logger = LoggerFactory.getLogger(JamesSetupService::class.java)

    private val tlsConfig: String by lazy {
        ResourceLoader.loadResourceOrThrow("templates/james/tls-config.xml")
    }

    private val tlsSslConfig: String by lazy {
        ResourceLoader.loadResourceOrThrow("templates/james/tls-ssl-config.xml")
    }

    private val defaults: Map<String, String> by lazy {
        mapOf(
            "james-database.properties" to ResourceLoader.loadResourceOrThrow("templates/james/james-database.properties"),
            "usersrepository.xml" to ResourceLoader.loadResourceOrThrow("templates/james/usersrepository.xml"),
            "domainlist.xml" to ResourceLoader.loadResourceOrThrow("templates/james/domainlist.xml"),
            "droplists.xml" to ResourceLoader.loadResourceOrThrow("templates/james/droplists.xml"),
            "smtpserver.xml" to loadSmtpServerConfig(),
            "imapserver.xml" to loadImapServerConfig(),
            "lmtpserver.xml" to ResourceLoader.loadResourceOrThrow("templates/james/lmtpserver.xml"),
            "logback.xml" to ResourceLoader.loadResourceOrThrow("templates/james/logback.xml")
        )
    }

    private fun indentXmlBlock(xml: String, indentSpaces: Int): String {
        if (xml.isBlank()) return xml
        val indent = " ".repeat(indentSpaces)
        return xml.lines()
            .filter { it.isNotBlank() } // Remove blank lines
            .joinToString("\n") { line ->
                "$indent${line.trimStart()}"
            }
    }

    private fun loadSmtpServerConfig(): String {
        val template = ResourceLoader.loadResourceOrThrow("templates/james/smtpserver.xml")
        return ResourceLoader.replacePlaceholders(template, mapOf(
            "tlsConfig" to indentXmlBlock(tlsConfig, 8),
            "tlsSslConfig" to indentXmlBlock(tlsSslConfig, 8)
        ))
    }

    private fun loadImapServerConfig(): String {
        val template = ResourceLoader.loadResourceOrThrow("templates/james/imapserver.xml")
        return ResourceLoader.replacePlaceholders(template, mapOf(
            "tlsConfig" to indentXmlBlock(tlsConfig, 8),
            "tlsSslConfig" to indentXmlBlock(tlsSslConfig, 8)
        ))
    }

    fun initialize(forceOverwrite: Boolean = false) {
        val configDir = AppConfig.jamesConfigDir
        if (!configDir.exists()) {
            configDir.mkdirs()
        }

        defaults.forEach { (filename, content) ->
            ensureFile(configDir, filename, content, forceOverwrite)
        }
        
        // Ensure var directory exists
        val varDir = AppConfig.jamesVarDir
        if (!varDir.exists()) {
            varDir.mkdirs()
        }
    }

    fun getDefaultContent(filename: String): String? {
        return defaults[filename]
    }

    fun listDefaultFiles(): List<String> {
        return defaults.keys.toList()
    }

    private fun ensureFile(dir: File, filename: String, content: String, forceOverwrite: Boolean = false) {
        val file = File(dir, filename)
        if (!file.exists() || forceOverwrite) {
            logger.info("Generating default James configuration: $filename${if (forceOverwrite) " (overwriting existing)" else ""}")
            file.writeText(content)
        }
    }
}
