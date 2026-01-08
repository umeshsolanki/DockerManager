package com.umeshsolanki.dockermanager

import com.umeshsolanki.dockermanager.firewall.FirewallServiceImpl
import com.umeshsolanki.dockermanager.firewall.IFirewallService
import com.umeshsolanki.dockermanager.jail.IJailManagerService
import com.umeshsolanki.dockermanager.jail.JailManagerServiceImpl

/**
 * Service container for dependency injection.
 * All services are initialized here and can be injected externally.
 */
object ServiceContainer {
    // Core services
    val firewallService: IFirewallService = FirewallServiceImpl()
    
    // Dependent services
    val jailManagerService: IJailManagerService = JailManagerServiceImpl(firewallService)
    
    /**
     * Initialize all services.
     * This can be called during application startup to ensure services are ready.
     */
    fun initialize() {
        // Services are initialized lazily when accessed
        // This method can be used for any initialization logic if needed
    }
}


