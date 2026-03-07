package com.umeshsolanki.ucpanel.api

import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.request.delete
import io.ktor.client.request.parameter
import io.ktor.http.ContentType
import io.ktor.http.contentType
import com.umeshsolanki.ucpanel.*

object SecurityApiService {
    private val client = HttpClientFactory.client

    suspend fun listRules(): List<FirewallRule> = try {
        client.get("firewall/rules").body()
    } catch (e: Exception) {
        e.printStackTrace()
        emptyList()
    }

    suspend fun blockIP(request: BlockIPRequest) = try {
        client.post("firewall/block") {
            contentType(ContentType.Application.Json)
            setBody(request)
        }
    } catch (e: Exception) {
        e.printStackTrace()
    }

    suspend fun unblockIP(id: String) = try {
        client.delete("firewall/rules/$id")
    } catch (e: Exception) {
        e.printStackTrace()
    }
    
    suspend fun listCidrRules(): List<CidrRule> = try {
        client.get("firewall/cidr").body()
    } catch (e: Exception) {
        e.printStackTrace()
        emptyList()
    }
    
    suspend fun addCidrRule(rule: CidrRule) = try {
        client.post("firewall/cidr") {
            contentType(ContentType.Application.Json)
            setBody(rule)
        }
    } catch (e: Exception) {
        e.printStackTrace()
    }
    
    suspend fun removeCidrRule(id: String) = try {
        client.delete("firewall/cidr/$id")
    } catch (e: Exception) {
        e.printStackTrace()
    }
}
