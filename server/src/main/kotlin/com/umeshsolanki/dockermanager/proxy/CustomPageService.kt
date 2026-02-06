package com.umeshsolanki.dockermanager.proxy

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.ServiceContainer
import com.umeshsolanki.dockermanager.utils.JsonPersistence
import org.slf4j.LoggerFactory
import java.io.File
import java.util.UUID

interface ICustomPageService {
    fun listCustomPages(): List<CustomPage>
    fun createCustomPage(page: CustomPage): Pair<Boolean, String>
    fun updateCustomPage(page: CustomPage): Pair<Boolean, String>
    fun deleteCustomPage(id: String): Boolean
    fun getCustomPage(id: String): CustomPage?
}

class CustomPageServiceImpl : ICustomPageService {
    private val logger = LoggerFactory.getLogger(CustomPageServiceImpl::class.java)
    private val configDir = AppConfig.proxyConfigDir
    private val customPagesFile = File(configDir, "custom-pages.json")
    
    private val customPagesPersistence = JsonPersistence.create<List<CustomPage>>(
        file = customPagesFile,
        defaultContent = emptyList(),
        loggerName = CustomPageServiceImpl::class.java.name
    )

    override fun listCustomPages(): List<CustomPage> = customPagesPersistence.load()

    override fun getCustomPage(id: String): CustomPage? {
        return listCustomPages().find { it.id == id }
    }

    override fun createCustomPage(page: CustomPage): Pair<Boolean, String> {
        return try {
            if (page.title.isBlank()) return false to "Title is required"
            val pages = listCustomPages().toMutableList()
            val newPage = if (page.id.isEmpty()) page.copy(id = UUID.randomUUID().toString()) else page
            pages.add(newPage)
            customPagesPersistence.save(pages)
            writeCustomPageFile(newPage)
            true to "Custom page created"
        } catch (e: Exception) {
            logger.error("Error creating custom page", e)
            false to "Error: ${e.message}"
        }
    }

    override fun updateCustomPage(page: CustomPage): Pair<Boolean, String> {
        return try {
            if (page.id.isEmpty()) return false to "ID is required"
            val pages = listCustomPages().toMutableList()
            val index = pages.indexOfFirst { it.id == page.id }
            if (index == -1) return false to "Page not found"
            
            pages[index] = page
            customPagesPersistence.save(pages)
            writeCustomPageFile(page)
            
            // Re-generate configs for hosts using this page
            // Note: We need to call ProxyService here, but to avoid circular dependency, 
            // the ProxyService will likely need to listen or be notified.
            // For now, since they are closely related, we can use the ProxyService object.
            
            val hosts = ServiceContainer.proxyService.listHosts()
            for (host in hosts) {
                if (host.underConstruction && host.underConstructionPageId == page.id) {
                    ServiceContainer.proxyService.updateHost(host)
                }
            }
            
            true to "Custom page updated"
        } catch (e: Exception) {
            logger.error("Error updating custom page", e)
            false to "Error: ${e.message}"
        }
    }

    override fun deleteCustomPage(id: String): Boolean {
        return try {
            val pages = listCustomPages().toMutableList()
            val page = pages.find { it.id == id } ?: return false
            pages.remove(page)
            customPagesPersistence.save(pages)
            
            val pageFile = File(AppConfig.proxyDir, "www/html/pages/${id}.html")
            if (pageFile.exists()) pageFile.delete()
            
            true
        } catch (e: Exception) {
            logger.error("Error deleting custom page", e)
            false
        }
    }

    private fun writeCustomPageFile(page: CustomPage) {
        try {
            val pagesDir = File(AppConfig.proxyDir, "www/html/pages")
            if (!pagesDir.exists()) pagesDir.mkdirs()
            
            val pageFile = File(pagesDir, "${page.id}.html")
            pageFile.writeText(page.content)
            logger.info("Wrote custom page HTML: ${pageFile.absolutePath}")
        } catch (e: Exception) {
            logger.error("Failed to write custom page file", e)
        }
    }
}

object CustomPageService {
    private val service: ICustomPageService by lazy {
        ServiceContainer.customPageService
    }

    fun listCustomPages() = service.listCustomPages()
    fun createCustomPage(page: CustomPage) = service.createCustomPage(page)
    fun updateCustomPage(page: CustomPage) = service.updateCustomPage(page)
    fun deleteCustomPage(id: String) = service.deleteCustomPage(id)
    fun getCustomPage(id: String) = service.getCustomPage(id)
}
