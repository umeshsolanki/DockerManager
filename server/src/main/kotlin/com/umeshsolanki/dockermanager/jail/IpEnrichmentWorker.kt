package com.umeshsolanki.dockermanager.jail

import com.umeshsolanki.dockermanager.AppConfig
import com.umeshsolanki.dockermanager.firewall.IFirewallService
import com.umeshsolanki.dockermanager.ip.IIpReputationService
import com.umeshsolanki.dockermanager.utils.DigLookup
import com.umeshsolanki.dockermanager.utils.WhoisLookup
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
    private val ipReputationService: IIpReputationService
) {
    private val logger = LoggerFactory.getLogger(IpEnrichmentWorker::class.java)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var job: Job? = null
    private val gson = Gson()
    private val client = HttpClient(Java)

    fun start() {
        job?.cancel()
        job = scope.launch {
            logger.info("IpEnrichmentWorker started")
            while (isActive) {
                try {
                    enrichMissingLocationData()
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                    logger.error("Error in IpEnrichmentWorker loop", e)
                }
                delay(30_000)
            }
        }
    }

    fun stop() {
        job?.cancel()
        client.close()
        scope.cancel()
    }

    private suspend fun enrichMissingLocationData() {
        val allRules = firewallService.listRules()
        // Enrich firewall rules that are missing location data
        val rulesMissingData = allRules.filter {
            it.country == null || it.city == null
        }.take(100)

        if (rulesMissingData.isNotEmpty()) {
            logger.info("Enrichment Worker: Processing batch of ${rulesMissingData.size} IPs")

            for (rule in rulesMissingData) {
                if (!scope.isActive) break
                try {
                    val loc = fetchAndSaveGeoInfo(rule.ip)
                    if (loc != null) {
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
                    delay(1500) // Respect ip-api.com rate limit (45 req/min)
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                    logger.error("Failed to enrich rule ${rule.id} for IP ${rule.ip}", e)
                    delay(5000)
                }
            }
        }
    }

    private data class GeoResult(
        val country: String? = null,
        val countryCode: String? = null,
        val city: String? = null,
        val isp: String? = null,
        val lat: Double? = null,
        val lon: Double? = null,
        val timezone: String? = null,
        val zip: String? = null,
        val region: String? = null,
        val regionName: String? = null,
        val asName: String? = null,
        val asn: String? = null,
        val org: String? = null
    )

    /**
     * Checks the ip_reputation table for cached geo data first.
     * If not present, fetches from ip-api.com and persists it back via saveGeoInfo.
     * Returns null if the IP is local or the fetch failed.
     */
    private suspend fun fetchAndSaveGeoInfo(ip: String): GeoResult? {
        if (ip.isBlank()) return null
        if (AppConfig.isLocalIP(ip)) return GeoResult(countryCode = "LOC", country = "Local Network")

        // 1. Check reputation cache first
        try {
            val cached = ipReputationService.getIpReputation(ip)
            if (cached?.geoInfoUpdatedOn != null) {
                return GeoResult(
                    country = cached.country,
                    countryCode = cached.country, // country col holds code in ip_reputation
                    city = cached.city,
                    isp = cached.isp,
                    lat = cached.lat,
                    lon = cached.lon,
                    timezone = cached.timezone,
                    zip = cached.zip,
                    region = cached.region,
                    regionName = cached.regionName,
                    asName = cached.asName,
                    asn = cached.asn
                )
            }
        } catch (e: Exception) {
            logger.warn("Reputation cache lookup failed for $ip", e)
        }

        // 2. Fetch from ip-api.com, fall back to local whois on 429
        return try {
            val response = client.get("http://ip-api.com/json/$ip")
            if (response.status.value == 429) {
                logger.warn("Rate limit hit for IP-API, falling back to dig/whois for $ip")
                return fetchFromDigOrWhois(ip)
            }

            val text = response.bodyAsText()
            val json = gson.fromJson(text, JsonObject::class.java)

            if (json.get("status")?.asString == "fail") {
                logger.debug("IP-API failed for $ip: ${json.get("message")?.asString}, trying dig/whois")
                return fetchFromDigOrWhois(ip)
            }

            val result = GeoResult(
                country      = json.get("country")?.asString,
                countryCode  = json.get("countryCode")?.asString,
                city         = json.get("city")?.asString,
                isp          = json.get("isp")?.asString,
                lat          = json.get("lat")?.asDouble,
                lon          = json.get("lon")?.asDouble,
                timezone     = json.get("timezone")?.asString,
                zip          = json.get("zip")?.asString,
                region       = json.get("region")?.asString,
                regionName   = json.get("regionName")?.asString,
                asName       = json.get("as")?.asString,
                asn          = json.get("as")?.asString?.split(" ")?.getOrNull(0),
                org          = json.get("org")?.asString
            )

            // Persist asynchronously — don't block the caller
            scope.launch {
                try {
                    ipReputationService.saveGeoInfo(
                        ip          = ip,
                        city        = result.city,
                        lat         = result.lat,
                        lon         = result.lon,
                        timezone    = result.timezone,
                        zip         = result.zip,
                        region      = result.region,
                        regionName  = result.regionName,
                        asName      = result.asName,
                        asn         = result.asn,
                        countryCode = result.countryCode,
                        isp         = result.isp
                    )
                } catch (e: Exception) {
                    logger.error("Failed to async-save geo info for $ip", e)
                }
            }

            result
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            logger.debug("Network failure enriching $ip: ${e.message}, trying dig/whois")
            fetchFromDigOrWhois(ip)
        }
    }

    /**
     * Fallback: try dig (ASN + CIDR + country) first, then whois (org/isp).
     * Merges results when both succeed.
     */
    private fun fetchFromDigOrWhois(ip: String): GeoResult? {
        val dig = DigLookup.lookupIp(ip)
        val whois = WhoisLookup.lookup(ip)

        val country = dig?.countryCode ?: whois?.country
        val isp = whois?.isp ?: whois?.org ?: dig?.asn
        val asn = dig?.asn ?: whois?.asn
        val cidr = dig?.cidr ?: whois?.cidr

        if (country == null && isp == null && asn == null) return null

        val result = GeoResult(
            country     = null,
            countryCode = country,
            city        = null,
            isp         = isp,
            org         = whois?.org,
            asName      = asn,
            asn         = asn
        )

        scope.launch {
            try {
                ipReputationService.saveGeoInfo(
                    ip          = ip,
                    city        = null,
                    lat         = null,
                    lon         = null,
                    timezone    = null,
                    zip         = null,
                    region      = null,
                    regionName  = null,
                    asName      = asn,
                    asn         = asn,
                    countryCode = country,
                    isp         = isp
                )
            } catch (e: Exception) {
                logger.error("Failed to save dig/whois geo info for $ip", e)
            }
        }

        logger.info("dig/whois fallback resolved $ip → country=$country, isp=$isp, asn=$asn, cidr=$cidr")
        return result
    }
}
