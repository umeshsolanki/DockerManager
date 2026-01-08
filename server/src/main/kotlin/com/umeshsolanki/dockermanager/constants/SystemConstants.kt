package com.umeshsolanki.dockermanager.constants

/**
 * Constants related to system paths and commands.
 */
object SystemConstants {
    // System file paths
    const val DOCKERENV = "/.dockerenv"
    const val PROC_CGROUP = "/proc/1/cgroup"
    const val DOCKER_SOCKET_DEFAULT = "/var/run/docker.sock"
    const val VAR_LOG = "/var/log"
    const val HOST_VAR_LOG = "/host/var/log"
    const val BTMP_LOG = "/var/log/btmp"
    const val HOST_BTMP_LOG = "/host/var/log/btmp"
    const val APP_DATA = "/app/data"
    const val DEFAULT_DATA_DIR = "/opt/docker-manager/data"
    
    // Docker command paths
    const val DOCKER_BIN_DOCKER = "/usr/bin/docker"
    const val DOCKER_COMPOSE_BIN_HOMEBREW = "/opt/homebrew/bin/docker-compose"
    const val DOCKER_COMPOSE_BIN_USR = "/usr/bin/docker compose"
    const val DOCKER_COMMAND = "docker"
    const val DOCKER_COMPOSE_COMMAND = "docker compose"
    
    // System command paths
    const val IPTABLES_BIN_DOCKER = "/main/sbin/iptables"
    const val IPTABLES_BIN_USR_SBIN = "/usr/sbin/iptables"
    const val IPTABLES_BIN_SBIN = "/sbin/iptables"
    const val IPTABLES_COMMAND = "iptables"
    
    const val IPSET_BIN_DOCKER = "/main/sbin/ipset"
    const val IPSET_BIN_USR_SBIN = "/usr/sbin/ipset"
    const val IPSET_BIN_SBIN = "/sbin/ipset"
    const val IPSET_COMMAND = "ipset"
    
    // Environment variables
    const val ENV_DATA_DIR = "DATA_DIR"
    const val ENV_LC_ALL = "LC_ALL"
    const val ENV_LC_ALL_VALUE = "C"
}


