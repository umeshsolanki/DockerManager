package com.umeshsolanki.dockermanager.jail

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.firewall.IFirewallService
import com.umeshsolanki.dockermanager.ip.IIpInfoService
import com.umeshsolanki.dockermanager.ip.IpInfo
import com.google.gson.Gson
import com.google.gson.JsonObject
import io.ktor.client.*
import io.ktor.client.engine.java.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import kotlinx.coroutines.*
import org.slf4j.LoggerFactory

class IpEnrichmentWorker(
    private val firewallService: IFirewallService,
    private val ipInfoService: IIpInfoService
) {
    private val logger = LoggerFactory.getLogger(IpEnrichmentWorker::class.java)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var job: Job? = null
    private val gson = Gson()
    private val client = HttpClient(Java)

    fun start() {
        job?.cancel()
        job = scope.launch {
            logger.info("IpEnrichmentWorker started (Optimized)")
            while (isActive) {
                try {
                    enrichMissingLocationData()
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                    logger.error("Error in IpEnrichmentWorker loop", e)
                }
                delay(30_000) // 30 seconds interval in production
            }
        }
    }

    fun stop() {
        job?.cancel()
        client.close()
        scope.cancel()
    }

    private suspend fun enrichMissingLocationData() {
        // Only fetch a batch of rules needing enrichment to avoid memory spikes
        val allRules = firewallService.listRules()
        val rulesMissingData = allRules.filter {
            it.country == null || it.city == null
        }.take(100) // Batch of 100 per cycle

        if (rulesMissingData.isNotEmpty()) {
            logger.info("Enrichment Worker: Processing batch of ${rulesMissingData.size} IPs")

            for (rule in rulesMissingData) {
                if (!scope.isActive) break

                try {
                    val loc = fetchLocationInfo(rule.ip)

                    if (loc.countryCode != null || loc.country != null) {
                        val updatedRule = rule.copy(
                            country = loc.countryCode,
                            city = loc.city,
                            isp = loc.isp,
                            lat = loc.lat,
                            lon = loc.lon,
                            timezone = loc.timezone,
                            zip = loc.zip,
                            region = loc.region
                        )
                        firewallService.updateRule(updatedRule)
                    }

                    // Respect ip-api.com rate limits (45 requests per minute)
                    delay(1500) 

                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                    logger.error("Failed to enrich rule ${rule.id} for IP ${rule.ip}", e)
                    // If we hit a rate limit or network error, wait longer
                    delay(5000)
                }
            }
        }
    }

    private data class IpLocation(
        val country: String? = null,
        val countryCode: String? = null,
        val city: String? = null,
        val isp: String? = null,
        val lat: Double? = null,
        val lon: Double? = null,
        val timezone: String? = null,
        val zip: String? = null,
        val region: String? = null
    )

    private suspend fun fetchLocationInfo(ip: String): IpLocation {
        if (ip.isBlank()) return IpLocation()
        if (AppConfig.isLocalIP(ip)) return IpLocation(countryCode = "LOC", country = "Local Network")

        // 1. Check local cache/DB first (High Performance)
        try {
            val cached = ipInfoService.getIpInfo(ip)
            if (cached != null) {
                return IpLocation(
                    country = cached.country,
                    countryCode = cached.countryCode,
                    city = cached.city,
                    isp = cached.isp,
                    lat = cached.lat,
                    lon = cached.lon,
                    timezone = cached.timezone,
                    zip = cached.zip,
                    region = cached.region
                )
            }
        } catch (e: Exception) {
            logger.warn("Database cache lookup failed for $ip", e)
        }

        // 2. Fetch from External API (Optimized non-blocking)
        return try {
            val response = client.get("http://ip-api.com/json/$ip")
            if (response.status.value == 429) {
                logger.warn("Rate limit hit for IP-API. Throttling...")
                delay(60_000)
                return IpLocation()
            }
            
            val text = response.bodyAsText()
            val json = gson.fromJson(text, JsonObject::class.java)

            if (json.get("status")?.asString == "fail") {
                 logger.debug("IP-API failed for $ip: ${json.get("message")?.asString}")
                 return IpLocation()
            }

            val info = IpInfo(
                ip = ip,
                country = json.get("country")?.asString,
                countryCode = json.get("countryCode")?.asString,
                city = json.get("city")?.asString,
                isp = json.get("isp")?.asString,
                lat = json.get("lat")?.asDouble,
                lon = json.get("lon")?.asDouble,
                timezone = json.get("timezone")?.asString,
                zip = json.get("zip")?.asString,
                region = json.get("region")?.asString,
                regionName = json.get("regionName")?.asString,
                org = json.get("org")?.asString,
                asName = json.get("as")?.asString
            )

            // Async save to not block the current flow
            scope.launch {
                try {
                    ipInfoService.saveIpInfo(info)
                } catch (e: Exception) {
                    logger.error("Failed to async save IP info for $ip", e)
                }
            }

            IpLocation(
                country = info.country,
                countryCode = info.countryCode,
                city = info.city,
                isp = info.isp,
                lat = info.lat,
                lon = info.lon,
                timezone = info.timezone,
                zip = info.zip,
                region = info.region
            )
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            logger.debug("Network failure enriching $ip: ${e.message}")
            IpLocation()
        }
    }
}
