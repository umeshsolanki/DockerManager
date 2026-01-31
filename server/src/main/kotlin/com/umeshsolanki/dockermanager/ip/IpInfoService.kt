package com.umeshsolanki.dockermanager.ip

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.constants.FileConstants
import com.umeshsolanki.dockermanager.utils.JsonPersistence
import org.slf4j.LoggerFactory
import java.io.File
import java.util.concurrent.ConcurrentHashMap

interface IIpInfoService {
    fun getIpInfo(ip: String): IpInfo?
    fun saveIpInfo(info: IpInfo)
    fun getAllIps(): List<IpInfo>
}

class IpInfoServiceImpl : IIpInfoService {
    private val logger = LoggerFactory.getLogger(IpInfoServiceImpl::class.java)
    private val file = File(AppConfig.dataRoot, FileConstants.IPS_JSON)
    private val jsonPersistence = JsonPersistence.create<List<IpInfo>>(
        file = file,
        defaultContent = emptyList(),
        loggerName = IpInfoServiceImpl::class.java.name
    )
    
    // In-memory cache for fast lookup
    private val cache = ConcurrentHashMap<String, IpInfo>()
    
    init {
        loadCache()
    }
    
    private fun loadCache() {
        try {
            val list = jsonPersistence.load()
            list.forEach { 
                cache[it.ip] = it 
            }
            logger.info("Loaded ${cache.size} IPs into cache")
        } catch (e: Exception) {
            logger.error("Failed to load IPs cache", e)
        }
    }
    
    private fun persist() {
        try {
            jsonPersistence.save(cache.values.toList())
        } catch (e: Exception) {
            logger.error("Failed to persist IPs", e)
        }
    }

    override fun getIpInfo(ip: String): IpInfo? {
        return cache[ip]
    }

    override fun saveIpInfo(info: IpInfo) {
        cache[info.ip] = info
        // Persist on every save for now to ensure data safety, 
        // can be optimized to debounce if high write volume.
        persist()
    }

    override fun getAllIps(): List<IpInfo> {
        return cache.values.toList()
    }
}
