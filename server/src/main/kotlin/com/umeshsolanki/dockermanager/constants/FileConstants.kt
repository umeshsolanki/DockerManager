package com.umeshsolanki.dockermanager.constants

/**
 * Constants related to file names and directory structures.
 */
object FileConstants {
    // File names
    const val SETTINGS_JSON = "settings.json"
    const val RULES_JSON = "rules.json"
    const val HOSTS_JSON = "hosts.json"
    const val FCM_SERVICE_ACCOUNT_JSON = "fcm-service-account.json"
    
    // Directory names
    const val BACKUPS = "backups"
    const val COMPOSE_YMLS = "compose-ymls"
    const val NGINX = "nginx"
    const val CONFIG_D = "conf.d"
    const val LOGS = "logs"
    const val PROXY = "proxy"
    const val CERTBOT = "certbot"
    const val CONF = "conf"
    const val LIVE = "live"
    const val CERTS = "certs"
    const val FIREWALL = "firewall"
    const val JAMES = "james"
    const val VAR = "var"
    
    // File names (within directories)
    const val ACCESS_LOG = "access.log"
    const val ERROR_LOG = "error.log"
    const val DOCKER_COMPOSE_YML = "docker-compose.yml"
    const val DOCKERFILE_PROXY = "Dockerfile.proxy"
}





