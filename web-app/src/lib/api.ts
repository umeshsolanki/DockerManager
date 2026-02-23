import {
    DockerContainer, DockerImage, ComposeFile, BatteryStatus, DockerSecret,
    DockerNetwork, DockerVolume, ContainerDetails, VolumeDetails, BackupResult,
    CreateContainerRequest, SaveComposeRequest, ComposeResult, SystemLog,
    FirewallRule, BlockIPRequest, ProxyHost, PathRoute, ProxyHit, ProxyStats, DailyProxyStats,
    IptablesRule, SSLCertificate, DnsConfig, EmailDomain, EmailUser,
    CreateEmailUserRequest, UpdateEmailUserPasswordRequest, SystemConfig,
    UpdateSystemConfigRequest, EmailMailbox, NetworkDetails, EmailTestRequest,
    EmailTestResult, AuthRequest, AuthResponse, UpdatePasswordRequest,
    UpdateUsernameRequest, TwoFactorSetupResponse, Enable2FARequest, EmailGroup, EmailUserDetail,
    FileItem, RedisConfig, RedisStatus, RedisTestResult, RedisConfigUpdateResult,
    DockerStack, StackService, StackTask, DeployStackRequest, MigrateComposeToStackRequest, StopStackRequest,
    SaveProjectFileRequest, KafkaTopicInfo, KafkaMessage, CreateNetworkRequest, StorageInfo,
    ExternalDbConfig, SqlQueryRequest, KafkaRule, KafkaProcessedEvent, CustomPage,
    IpReputation, SavedQuery, EmailFolder, EmailMessage, EmailClientConfig, ProxyJailRule,
    PullProgress,
    DnsZone, DnsRecord, DnsServiceStatus, ZoneValidationResult, CreateZoneRequest, UpdateZoneRequest, DnsActionResult,
    DnsAcl, TsigKey, DnsForwarderConfig, DnssecStatus, DnsLookupRequest, DnsLookupResult,
    DnsQueryStats, ZoneTemplate, BulkImportRequest, BulkImportResult, PullZoneRequest,
    DnsInstallRequest, DnsInstallStatus, GlobalSecurityConfig,
    SpfConfig, DmarcConfig, DkimKey, DkimKeyGenRequest, PropagationStatus,
    PropagationCheckResult, IpPtrSuggestion, DnsRecordType,
    SrvConfig, EmailHealthStatus, ReverseDnsDashboard
} from './types';


const DEFAULT_SERVER_URL = "http://localhost:9091";

// --- Base Request Helpers ---

async function apiFetch(path: string, options: RequestInit = {}) {
    const serverUrl = DockerClient.getServerUrl();
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...DockerClient.getHeaders(),
        ...options.headers,
    };

    const response = await fetch(`${serverUrl}${path}`, { ...options, headers });
    return response;
}

async function req<T>(path: string, options: RequestInit = {}, defaultValue: T): Promise<T> {
    try {
        const res = await apiFetch(path, options);
        return res.ok ? await res.json() : defaultValue;
    } catch (e) {
        console.error(`API Error [${path}]:`, e);
        return defaultValue;
    }
}

async function textReq(path: string, options: RequestInit = {}, defaultVal = ""): Promise<string> {
    try {
        const res = await apiFetch(path, options);
        return res.ok ? await res.text() : defaultVal;
    } catch (e) {
        console.error(e);
        return defaultVal;
    }
}

async function safeReq<T = { success: boolean; message: string }>(path: string, options: RequestInit = {}): Promise<T> {
    try {
        const res = await apiFetch(path, options);
        const text = await res.text();
        try {
            return JSON.parse(text);
        } catch {
            return { success: res.ok, message: text } as unknown as T;
        }
    } catch (e) {
        return { success: false, message: 'Network error' } as unknown as T;
    }
}

export const DockerClient = {
    // --- Config & Auth ---
    getServerUrl: () => (typeof window === 'undefined' ? DEFAULT_SERVER_URL : (localStorage.getItem('SERVER_URL') || window.location.origin)),
    setServerUrl: (url: string) => typeof window !== 'undefined' && localStorage.setItem('SERVER_URL', url),
    getAuthToken: () => (typeof window === 'undefined' ? null : localStorage.getItem('AUTH_TOKEN')),
    setAuthToken: (token: string | null) => {
        if (typeof window === 'undefined') return;
        token ? localStorage.setItem('AUTH_TOKEN', token) : localStorage.removeItem('AUTH_TOKEN');
    },
    getHeaders(): HeadersInit {
        const token = this.getAuthToken();
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    },

    async login(request: AuthRequest): Promise<AuthResponse | null> {
        const res = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(request) });
        if (res.status === 401) {
            const data = await res.json();
            if (data.requires2FA) return { token: '', requires2FA: true };
            throw new Error(data.message || 'Invalid credentials');
        }
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.message || 'An error occurred during login');
        }
        return res.json();
    },
    checkAuth: () => apiFetch('/auth/check').then(r => r.ok).catch(() => false),
    updatePassword: (body: UpdatePasswordRequest) => safeReq('/auth/password', { method: 'POST', body: JSON.stringify(body) }),
    updateUsername: (body: UpdateUsernameRequest) => safeReq('/auth/username', { method: 'POST', body: JSON.stringify(body) }),
    setup2FA: () => req<TwoFactorSetupResponse | null>('/auth/2fa/setup', {}, null),
    enable2FA: (body: Enable2FARequest) => safeReq('/auth/2fa/enable', { method: 'POST', body: JSON.stringify(body) }),
    disable2FA: (password: string) => safeReq('/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ password }) }),

    // --- Containers ---
    listContainers: () => req<DockerContainer[]>('/containers', {}, []),
    inspectContainer: (id: string) => req<ContainerDetails | null>(`/containers/${id}/inspect`, {}, null),
    createContainer: (body: CreateContainerRequest) => textReq('/containers', { method: 'POST', body: JSON.stringify(body) }, null as any),
    startContainer: (id: string) => apiFetch(`/containers/${id}/start`, { method: 'POST' }),
    stopContainer: (id: string) => apiFetch(`/containers/${id}/stop`, { method: 'POST' }),
    async removeContainer(id: string, force: boolean = false): Promise<boolean> {
        const response = await apiFetch(`/containers/${id}?force=${force}`, { method: 'DELETE' });
        return response.ok;
    },
    async removeContainers(ids: string[], force: boolean = false): Promise<Record<string, boolean>> {
        const response = await apiFetch('/containers/batch-delete', {
            method: 'POST',
            body: JSON.stringify({ ids, force })
        });
        return await response.json();
    },
    pruneContainers: () => apiFetch('/containers/prune', { method: 'POST' }),
    getContainerLogs: (id: string, tail = 100) => textReq(`/containers/${id}/logs?tail=${tail}`),

    // --- Images ---
    listImages: () => req<DockerImage[]>('/images', {}, []),
    pullImage: (name: string) => apiFetch(`/images/pull?image=${encodeURIComponent(name)}`, { method: 'POST' }),
    pullImageProgress(name: string, onProgress: (progress: PullProgress) => void, onComplete: () => void, onError: (err: any) => void) {
        const baseUrl = this.getServerUrl().replace('http', 'ws');
        const token = this.getAuthToken();
        const ws = new WebSocket(`${baseUrl}/images/pull/${encodeURIComponent(name)}${token ? `?token=${token}` : ''}`);

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                onProgress(data);
                if (data.status === 'Status: Downloaded newer image for ' + name || data.status?.includes('Downloaded newer image')) {
                    // This is a bit brittle, but usually the last message. 
                    // Better to rely on onclose or a specific completed status if added to backend.
                }
            } catch (e) {
                console.error("Error parsing pull progress", e);
            }
        };

        ws.onclose = () => onComplete();
        ws.onerror = (err) => onError(err);

        return () => ws.close(); // Return cleanup function
    },

    async removeImage(id: string, force: boolean = false): Promise<boolean> {
        const response = await apiFetch(`/images/${id}?force=${force}`, { method: 'DELETE' });
        return response.ok;
    },
    async removeImages(ids: string[], force: boolean = false): Promise<Record<string, boolean>> {
        const response = await apiFetch('/images/batch-delete', {
            method: 'POST',
            body: JSON.stringify({ ids, force })
        });
        return await response.json();
    },
    pruneImages: () => apiFetch('/images/prune', { method: 'POST' }),

    // --- Compose ---
    listComposeFiles: () => req<ComposeFile[]>('/compose', {}, []),
    composeUp: (path: string) => req<ComposeResult | null>(`/compose/up?file=${encodeURIComponent(path)}`, { method: 'POST' }, null),
    composeBuild: (path: string) => req<ComposeResult | null>(`/compose/build?file=${encodeURIComponent(path)}`, { method: 'POST' }, null),
    composeDown: (path: string) => req<ComposeResult | null>(`/compose/down?file=${encodeURIComponent(path)}`, { method: 'POST' }, null),
    composeRestart: (path: string) => req<ComposeResult | null>(`/compose/restart?file=${encodeURIComponent(path)}`, { method: 'POST' }, null),
    saveComposeFile: (body: SaveComposeRequest) => apiFetch('/compose/save', { method: 'POST', body: JSON.stringify(body) }).then(r => r.ok),
    saveProjectFile: (body: SaveProjectFileRequest) => apiFetch('/compose/save-file', { method: 'POST', body: JSON.stringify(body) }).then(r => r.ok),
    getComposeFileContent: (path: string) => textReq(`/compose/content?file=${encodeURIComponent(path)}`),
    getProjectFileContent: (projectName: string, fileName: string) => textReq(`/compose/project-file?projectName=${encodeURIComponent(projectName)}&fileName=${encodeURIComponent(fileName)}`),
    backupCompose: (name: string) => req<BackupResult | null>(`/compose/${name}/backup`, { method: 'POST' }, null),
    backupAllCompose: () => req<BackupResult | null>('/compose/backup-all', { method: 'POST' }, null),
    deleteComposeProject: (name: string) => safeReq<ComposeResult>(`/compose/${encodeURIComponent(name)}`, { method: 'DELETE' }),

    // --- Docker Stack (Swarm) ---
    listStacks: () => req<DockerStack[]>('/compose/stack', {}, []),
    deployStack: (body: DeployStackRequest) => safeReq<ComposeResult>('/compose/stack/deploy', { method: 'POST', body: JSON.stringify(body) }),
    startStack: (body: DeployStackRequest) => safeReq<ComposeResult>('/compose/stack/start', { method: 'POST', body: JSON.stringify(body) }),
    stopStack: (stackName: string) => safeReq<ComposeResult>(`/compose/stack/stop?stackName=${encodeURIComponent(stackName)}`, { method: 'POST' }),
    restartStack: (body: DeployStackRequest) => safeReq<ComposeResult>('/compose/stack/restart', { method: 'POST', body: JSON.stringify(body) }),
    updateStack: (body: DeployStackRequest) => safeReq<ComposeResult>('/compose/stack/update', { method: 'POST', body: JSON.stringify(body) }),
    removeStack: (stackName: string) => safeReq<ComposeResult>(`/compose/stack/${encodeURIComponent(stackName)}`, { method: 'DELETE' }),
    listStackServices: (stackName: string) => req<StackService[]>(`/compose/stack/${encodeURIComponent(stackName)}/services`, {}, []),
    listStackTasks: (stackName: string) => req<StackTask[]>(`/compose/stack/${encodeURIComponent(stackName)}/tasks`, {}, []),
    checkStackStatus: (stackName: string) => req<{ status: string }>(`/compose/stack/${encodeURIComponent(stackName)}/status`, {}, { status: 'unknown' }),
    checkComposeStatus: (filePath: string) => req<{ status: string }>(`/compose/status?file=${encodeURIComponent(filePath)}`, {}, { status: 'unknown' }),
    migrateComposeToStack: (body: MigrateComposeToStackRequest) => safeReq<ComposeResult>('/compose/migrate-to-stack', { method: 'POST', body: JSON.stringify(body) }),

    // --- Resources: Secrets, Networks, Volumes ---
    listSecrets: () => req<DockerSecret[]>('/secrets', {}, []),
    createSecret: (name: string, data: string) => apiFetch(`/secrets?name=${encodeURIComponent(name)}&data=${encodeURIComponent(data)}`, { method: 'POST' }),
    removeSecret: (id: string) => apiFetch(`/secrets/${id}`, { method: 'DELETE' }),
    async removeSecrets(ids: string[]): Promise<Record<string, boolean>> {
        const response = await apiFetch('/secrets/batch-delete', {
            method: 'POST',
            body: JSON.stringify({ ids })
        });
        return await response.json();
    },

    listNetworks: () => req<DockerNetwork[]>('/networks', {}, []),
    inspectNetwork: (id: string) => req<NetworkDetails | null>(`/networks/${id}`, {}, null),
    createNetwork: (body: CreateNetworkRequest) => safeReq('/networks', { method: 'POST', body: JSON.stringify(body) }),
    removeNetwork: (id: string) => apiFetch(`/networks/${id}`, { method: 'DELETE' }).then(r => r.ok),
    async removeNetworks(ids: string[]): Promise<Record<string, boolean>> {
        const response = await apiFetch('/networks/batch-delete', {
            method: 'POST',
            body: JSON.stringify({ ids })
        });
        return await response.json();
    },

    listVolumes: () => req<DockerVolume[]>('/volumes', {}, []),
    inspectVolume: (name: string) => req<VolumeDetails | null>(`/volumes/${name}/inspect`, {}, null),
    async removeVolume(name: string, force: boolean = false): Promise<boolean> {
        const response = await apiFetch(`/volumes/${name}?force=${force}`, { method: 'DELETE' });
        return response.ok;
    },
    async removeVolumes(ids: string[], force: boolean = false): Promise<Record<string, boolean>> {
        const response = await apiFetch('/volumes/batch-delete', {
            method: 'POST',
            body: JSON.stringify({ ids, force })
        });
        return await response.json();
    },
    pruneVolumes: () => apiFetch('/volumes/prune', { method: 'POST' }),
    backupVolume: (name: string) => req<BackupResult | null>(`/volumes/${name}/backup`, { method: 'POST' }, null),
    listVolumeFiles: (name: string, path = "") => req<FileItem[]>(`/volumes/${name}/files?path=${encodeURIComponent(path)}`, {}, []),
    readVolumeFile: (name: string, path: string) => req<{ content: string }>(`/volumes/${name}/files/content?path=${encodeURIComponent(path)}`, {}, { content: '' }).then(r => r.content),

    // --- System, Logs, Security ---
    getBatteryStatus: () => req<BatteryStatus | null>('/system/battery', {}, null),
    getSystemConfig: () => req<SystemConfig | null>('/system/config', {}, null),
    getRecommendedProxyRules: () => req<ProxyJailRule[]>('/system/proxy/recommended-rules', {}, []),
    updateSystemConfig: (body: UpdateSystemConfigRequest) => req<{ success: boolean }>('/system/config', { method: 'POST', body: JSON.stringify(body) }, { success: false }),
    importIpRanges: (csv: string) => safeReq('/system/ip-ranges/import', { method: 'POST', body: csv, headers: { 'Content-Type': 'text/plain' } }),
    fetchIpRanges: (provider: 'cloudflare' | 'aws' | 'google' | 'digitalocean' | 'github' | 'custom', url?: string, customProvider?: string) => {
        return safeReq('/system/ip-ranges/fetch', {
            method: 'POST',
            body: JSON.stringify({ provider, url, customProvider })
        });
    },
    getIpRangeStats: () => req<{ totalRanges: number }>('/system/ip-ranges/stats', {}, { totalRanges: 0 }),
    listIpRanges: (page = 0, limit = 50, search = '') =>
        req<{ rows: { id: number; cidr: string | null; countryCode: string | null; countryName: string | null; provider: string | null; type: string | null }[]; total: number; page: number; limit: number }>(
            `/system/ip-ranges/list?page=${page}&limit=${limit}${search ? `&search=${encodeURIComponent(search)}` : ''}`,
            {},
            { rows: [], total: 0, page: 0, limit }
        ),
    getStorageInfo: () => req<StorageInfo | null>('/system/storage', {}, null),
    refreshStorageInfo: () => req<{ status: string; message: string }>('/system/storage/refresh', { method: 'POST' }, { status: 'error', message: 'Failed to trigger refresh' }),

    listSystemLogs: (path?: string) => req<SystemLog[]>(`/logs/system${path ? `?path=${encodeURIComponent(path)}` : ''}`, {}, []),
    getSystemLogContent: (path: string, tail = 100, filter?: string, since?: string, until?: string) => {
        let url = `/logs/system/content?path=${encodeURIComponent(path)}&tail=${tail}`;
        if (filter) url += `&filter=${encodeURIComponent(filter)}`;
        if (since) url += `&since=${since}`;
        if (until) url += `&until=${until}`;
        return textReq(url);
    },

    getJournalLogs: (tail = 100, unit?: string, filter?: string, since?: string, until?: string) => {
        let url = `/logs/system/journal?tail=${tail}`;
        if (unit) url += `&unit=${encodeURIComponent(unit)}`;
        if (filter) url += `&filter=${encodeURIComponent(filter)}`;
        if (since) url += `&since=${since}`;
        if (until) url += `&until=${until}`;
        return textReq(url);
    },



    getSyslogLogs: (tail = 100, filter?: string) => {
        let url = `/logs/system/syslog?tail=${tail}`;
        if (filter) url += `&filter=${encodeURIComponent(filter)}`;
        return textReq(url);
    },



    listFirewallRules: () => req<FirewallRule[]>('/firewall/rules', {}, []),
    blockIP: (body: BlockIPRequest) => apiFetch('/firewall/block', { method: 'POST', body: JSON.stringify(body) }).then(r => r.ok),
    unblockIP: (id: string) => apiFetch(`/firewall/rules/${id}`, { method: 'DELETE' }).then(r => r.ok),
    getIptablesVisualisation: () => req<Record<string, IptablesRule[]>>('/firewall/iptables', {}, {}),
    getIptablesRaw: () => textReq('/firewall/iptables/raw'),
    getNftablesVisualisation: () => textReq('/firewall/nftables'),
    getNftablesJson: () => req<any>('/firewall/nftables/json', {}, {}),

    // --- Reverse Proxy (NGINX/Edge) ---
    listProxyHosts: () => req<ProxyHost[]>('/proxy/hosts', {}, []),
    createProxyHost: (body: Partial<ProxyHost>) => safeReq('/proxy/hosts', { method: 'POST', body: JSON.stringify(body) }),
    updateProxyHost: (body: ProxyHost) => safeReq(`/proxy/hosts/${body.id}`, { method: 'PUT', body: JSON.stringify(body) }),
    deleteProxyHost: (id: string) => apiFetch(`/proxy/hosts/${id}`, { method: 'DELETE' }).then(r => r.ok),
    toggleProxyHost: (id: string) => apiFetch(`/proxy/hosts/${id}/toggle`, { method: 'POST' }).then(r => r.ok),
    requestProxySSL: (id: string) => apiFetch(`/proxy/hosts/${id}/request-ssl`, { method: 'POST' }).then(r => r.ok),
    // Path Routes
    listPathRoutes: (hostId: string) => req<PathRoute[]>(`/proxy/hosts/${hostId}/paths`, {}, []),
    createPathRoute: (hostId: string, body: Partial<PathRoute>) => safeReq(`/proxy/hosts/${hostId}/paths`, { method: 'POST', body: JSON.stringify(body) }),
    updatePathRoute: (hostId: string, pathId: string, body: PathRoute) => safeReq(`/proxy/hosts/${hostId}/paths/${pathId}`, { method: 'PUT', body: JSON.stringify(body) }),
    deletePathRoute: (hostId: string, pathId: string) => safeReq(`/proxy/hosts/${hostId}/paths/${pathId}`, { method: 'DELETE' }),
    togglePathRoute: (hostId: string, pathId: string) => safeReq(`/proxy/hosts/${hostId}/paths/${pathId}/toggle`, { method: 'POST' }),
    getProxyStats: () => req<ProxyStats | null>('/analytics/stats', {}, null),
    refreshProxyStats: () => req<ProxyStats | null>('/analytics/stats/refresh', {}, null),
    listAnalyticsDates: () => req<string[]>('/analytics/stats/history/dates', {}, []),
    getHistoricalStats: (date: string) => req<DailyProxyStats | null>(`/analytics/stats/history/${date}`, {}, null),
    getStatsForDateRange: (startDate: string, endDate: string) => req<DailyProxyStats[]>(`/analytics/stats/history/range?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`, {}, []),
    updateStatsForAllDaysInCurrentLog: () => safeReq('/analytics/stats/history/update-all-days', { method: 'POST' }),
    truncateProxyLogs: () => safeReq('/analytics/logs/truncate', { method: 'POST' }),

    getAnalyticsLogs: (type: 'access' | 'error' | 'security' | 'cidr' = 'access', page = 1, limit = 50, search?: string, date?: string) => {
        let url = `/analytics/logs?type=${type}&page=${page}&limit=${limit}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (date) url += `&date=${encodeURIComponent(date)}`;
        return req<ProxyHit[]>(url, {}, []);
    },
    getSecurityMirrors: (limit = 100) =>
        req<ProxyHit[]>(`/analytics/security/mirrors?limit=${limit}`, {}, []),

    // Redis Cache
    getRedisConfig: () => req<RedisConfig>('/cache/redis/config', {}, { enabled: false, host: 'localhost', port: 6379, database: 0, ssl: false, timeout: 5000 }),
    updateRedisConfig: (config: RedisConfig) => safeReq<RedisConfigUpdateResult>('/cache/redis/config', { method: 'POST', body: JSON.stringify(config) }),
    testRedisConnection: (config: RedisConfig) => safeReq<RedisTestResult>('/cache/redis/test', { method: 'POST', body: JSON.stringify(config) }),
    getRedisStatus: () => req<RedisStatus>('/cache/redis/status', {}, { enabled: false, connected: false, host: 'localhost', port: 6379 }),
    clearCache: () => safeReq('/cache/clear', { method: 'POST' }),
    installRedis: () => safeReq('/cache/install', { method: 'POST' }),

    // Database Management
    getDatabaseStatus: () => req<any[]>('/database/status', {}, []),
    installPostgres: () => safeReq<any>('/database/postgres/install', { method: 'POST' }),
    resetPostgresConfig: () => safeReq<any>('/database/postgres/reset', { method: 'POST' }),
    switchToPostgresFileStorage: () => safeReq<any>('/database/postgres/switch-to-file', { method: 'POST' }),
    switchToPostgresDbStorage: () => safeReq<any>('/database/postgres/switch-to-db', { method: 'POST' }),
    getPostgresLogs: (tail = 100) => textReq(`/database/postgres/logs?tail=${tail}`).then(text => {
        try {
            return JSON.parse(text).logs || text;
        } catch {
            return text;
        }
    }),
    getPostgresTables: async () => {
        const res = await apiFetch('/database/postgres/tables');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to list tables');
        return data.tables || [];
    },
    queryPostgresTable: async (table: string, orderBy?: string, orderDir: 'ASC' | 'DESC' = 'ASC', limit = 100, offset = 0) => {
        let url = `/database/postgres/query?table=${encodeURIComponent(table)}&limit=${limit}&offset=${offset}`;
        if (orderBy) url += `&orderBy=${encodeURIComponent(orderBy)}&orderDir=${orderDir}`;
        const res = await apiFetch(url);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to query table');
        return data.rows || [];
    },
    executeSqlQuery: (request: SqlQueryRequest) => safeReq<any>('/database/query', { method: 'POST', body: JSON.stringify(request) }),
    listExternalDbs: () => req<ExternalDbConfig[]>('/database/external/list', {}, []),
    testExternalDb: (config: ExternalDbConfig) => safeReq('/database/external/test', { method: 'POST', body: JSON.stringify({ config }) }),
    saveExternalDb: (config: ExternalDbConfig) => safeReq('/database/external/save', { method: 'POST', body: JSON.stringify(config) }),
    deleteExternalDb: (id: string) => safeReq(`/database/external/delete/${id}`, { method: 'POST' }),
    listSavedQueries: () => req<SavedQuery[]>('/database/queries/saved', {}, []),
    saveQuery: (query: SavedQuery) => safeReq('/database/queries/save', { method: 'POST', body: JSON.stringify(query) }),
    deleteQuery: (id: number) => safeReq(`/database/queries/delete/${id}`, { method: 'POST' }),


    getProxySecuritySettings: () => req<SystemConfig | null>('/proxy/security/settings', {}, null),
    updateProxySecuritySettings: (body: Partial<SystemConfig>) => safeReq('/proxy/security/settings', { method: 'POST', body: JSON.stringify(body) }),
    validateRegex: (pattern: string) => req<{ valid: string; error?: string; index?: string }>('/proxy/validate-regex', { method: 'POST', body: JSON.stringify({ pattern }) }, { valid: 'false', error: 'Network error' }),
    updateProxyDefaultBehavior: (return404: boolean) => safeReq('/proxy/settings/default-behavior', { method: 'POST', body: JSON.stringify({ return404 }) }),
    updateProxyRsyslogSettings: (enabled: boolean, dualLogging?: boolean) => safeReq('/proxy/settings/rsyslog', {
        method: 'POST',
        body: JSON.stringify({ enabled, ...(dualLogging !== undefined && { dualLogging }) })
    }),
    updateProxyLoggingSettings: (params: {
        jsonLoggingEnabled?: boolean;
        logBufferingEnabled?: boolean;
        logBufferSizeKb?: number;
        logFlushIntervalSeconds?: number;
    }) => safeReq('/proxy/settings/logging', {
        method: 'POST',
        body: JSON.stringify({
            ...(params.jsonLoggingEnabled !== undefined && { jsonLoggingEnabled: String(params.jsonLoggingEnabled) }),
            ...(params.logBufferingEnabled !== undefined && { logBufferingEnabled: String(params.logBufferingEnabled) }),
            ...(params.logBufferSizeKb !== undefined && { logBufferSizeKb: String(params.logBufferSizeKb) }),
            ...(params.logFlushIntervalSeconds !== undefined && { logFlushIntervalSeconds: String(params.logFlushIntervalSeconds) })
        })
    }),
    updateProxyBurstProtection: (enabled: boolean, rate?: number, burst?: number) => safeReq('/proxy/settings/burst-protection', {
        method: 'POST', body: JSON.stringify({
            enabled: String(enabled),
            rate: rate ? String(rate) : undefined,
            burst: burst ? String(burst) : undefined
        })
    }),
    listProxyCertificates: () => req<SSLCertificate[]>('/proxy/certificates', {}, []),

    // DNS Config Management
    listDnsConfigs: () => req<DnsConfig[]>('/proxy/dns-configs', {}, []),
    createDnsConfig: (body: Partial<DnsConfig>) => safeReq('/proxy/dns-configs', { method: 'POST', body: JSON.stringify(body) }),
    updateDnsConfig: (body: DnsConfig) => safeReq(`/proxy/dns-configs/${body.id}`, { method: 'PUT', body: JSON.stringify(body) }),
    deleteDnsConfig: (id: string) => safeReq(`/proxy/dns-configs/${id}`, { method: 'DELETE' }),
    // Custom Pages Management
    listCustomPages: () => req<CustomPage[]>('/proxy/custom-pages', {}, []),
    createCustomPage: (body: Partial<CustomPage>) => safeReq('/proxy/custom-pages', { method: 'POST', body: JSON.stringify(body) }),
    updateCustomPage: (body: CustomPage) => safeReq(`/proxy/custom-pages/${body.id}`, { method: 'PUT', body: JSON.stringify(body) }),
    deleteCustomPage: (id: string) => safeReq(`/proxy/custom-pages/${id}`, { method: 'DELETE' }),

    getProxyContainerStatus: () => safeReq('/proxy/container/status'),
    buildProxyImage: () => safeReq('/proxy/container/build', { method: 'POST' }),
    createProxyContainer: () => safeReq('/proxy/container/create', { method: 'POST' }),
    startProxyContainer: () => safeReq('/proxy/container/start', { method: 'POST' }),
    stopProxyContainer: () => safeReq('/proxy/container/stop', { method: 'POST' }),
    restartProxyContainer: () => safeReq('/proxy/container/restart', { method: 'POST' }),
    updateProxyComposeConfig: (content: string) => safeReq('/proxy/container/compose', { method: 'POST', body: JSON.stringify({ content }) }),
    resetProxyComposeConfig: () => safeReq('/proxy/container/compose/reset', { method: 'POST' }),
    getProxyComposeConfig: () => safeReq<{ content: string }>('/proxy/container/compose').then(r => r.content || ''),
    ensureProxyContainer: () => safeReq('/proxy/container/ensure', { method: 'POST' }),

    // --- Email Engine (James) ---
    // --- Email Client ---
    getEmailClientConfig: () => req<EmailClientConfig | null>('/emails/client/config', {}, null),
    updateEmailClientConfig: (config: EmailClientConfig) => safeReq('/emails/client/config', { method: 'POST', body: JSON.stringify(config) }),
    listEmailFolders: () => req<EmailFolder[]>('/emails/client/folders', {}, []),
    listEmailMessages: (folder: string, limit = 50) => req<EmailMessage[]>(`/emails/client/folders/${encodeURIComponent(folder)}/messages?limit=${limit}`, {}, []),
    sendTestEmail: (b: EmailTestRequest) => req<EmailTestResult>('/emails/test', { method: 'POST', body: JSON.stringify(b) }, { success: false, message: 'Network error', logs: [] }),

    // --- File Manager ---
    getFileContent: (path: string, mode: 'head' | 'tail' = 'head', maxBytes = 512 * 1024) => req<{ content: string }>(`/files/content?path=${encodeURIComponent(path)}&mode=${mode}&maxBytes=${maxBytes}`, {}, { content: '' }).then(r => r.content),
    saveFileContent: (path: string, content: string) => safeReq('/files/save-content', { method: 'POST', body: JSON.stringify({ path, content }) }),
    listFiles: (path = "") => req<FileItem[]>(`/files/list?path=${encodeURIComponent(path)}`, {}, []),
    renameFile: (path: string, newName: string) => apiFetch(`/files/rename?path=${encodeURIComponent(path)}&newName=${encodeURIComponent(newName)}`, { method: 'POST' }).then(r => r.ok),
    deleteFile: (path: string) => apiFetch(`/files/delete?path=${encodeURIComponent(path)}`, { method: 'DELETE' }).then(r => r.ok),
    createDirectory: (path: string) => apiFetch(`/files/mkdir?path=${encodeURIComponent(path)}`, { method: 'POST' }).then(r => r.ok),
    zipFile: (path: string, target: string) => apiFetch(`/files/zip?path=${encodeURIComponent(path)}&target=${encodeURIComponent(target)}`, { method: 'POST' }).then(r => r.ok),
    zipBulk: (paths: string[], target: string) => apiFetch(`/files/zip-bulk`, { method: 'POST', body: JSON.stringify({ paths, target }) }).then(r => r.ok),
    unzipFile: (path: string, target: string) => apiFetch(`/files/unzip?path=${encodeURIComponent(path)}&target=${encodeURIComponent(target)}`, { method: 'POST' }).then(r => r.ok),
    uploadFile: (path: string, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return apiFetch(`/files/upload?path=${encodeURIComponent(path)}`, {
            method: 'POST',
            body: formData,
            headers: {
                // Don't set Content-Type, fetch will set it with boundary
            }
        }).then(r => r.ok);
    },
    downloadFileUrl: (path: string) => `${DockerClient.getServerUrl()}/files/download?path=${encodeURIComponent(path)}&token=${DockerClient.getAuthToken()}`,
    getBookmarks: () => req<string[]>('/files/bookmarks', {}, []),
    updateBookmarks: (bookmarks: string[]) => safeReq('/files/bookmarks', { method: 'POST', body: JSON.stringify(bookmarks) }),

    // --- Kafka Management ---
    listKafkaTopics: () => req<KafkaTopicInfo[]>('/kafka/topics', {}, []),
    createKafkaTopic: (body: KafkaTopicInfo) => safeReq('/kafka/topics', { method: 'POST', body: JSON.stringify(body) }),
    deleteKafkaTopic: (name: string) => safeReq(`/kafka/topics/${name}`, { method: 'DELETE' }),
    getKafkaMessages: (topic: string, limit = 50) => req<KafkaMessage[]>(`/kafka/topics/${topic}/messages?limit=${limit}`, {}, []),
    getKafkaRules: () => req<KafkaRule[]>('/kafka/rules', {}, []),
    updateKafkaRules: (rules: KafkaRule[]) => safeReq<{ success: boolean }>('/kafka/rules', { method: 'POST', body: JSON.stringify(rules) }),
    getKafkaEvents: (limit = 100) => req<KafkaProcessedEvent[]>(`/kafka/events?limit=${limit}`, {}, []),

    // --- IP Reputation ---
    listIpReputations: (limit = 100, offset = 0, search = "") => req<IpReputation[]>(`/ip-reputation?limit=${limit}&offset=${offset}&search=${encodeURIComponent(search)}`, {}, []),
    deleteIpReputation: (ip: string) => apiFetch(`/ip-reputation/${encodeURIComponent(ip)}`, { method: 'DELETE' }).then(r => r.ok),

    // --- DNS / BIND9 Management ---

    // Service control
    getDnsStatus: () => req<DnsServiceStatus>('/dns/status', {}, { running: false, version: '', configValid: false, configOutput: '', uptime: '', zoneCount: 0, loadedZoneCount: 0 }),
    dnsReload: () => req<DnsActionResult>('/dns/reload', { method: 'POST' }, { success: false, message: 'Network error' }),
    dnsRestart: () => req<DnsActionResult>('/dns/restart', { method: 'POST' }, { success: false, message: 'Network error' }),
    dnsFlushCache: () => req<DnsActionResult>('/dns/flush-cache', { method: 'POST' }, { success: false, message: 'Network error' }),
    dnsRegenerateZoneFiles: () => req<DnsActionResult>('/dns/zones/regenerate', { method: 'POST' }, { success: false, message: 'Network error' }),
    dnsValidateConfig: () => req<ZoneValidationResult>('/dns/validate', {}, { valid: false, output: '' }),
    getDnsQueryStats: () => req<DnsQueryStats>('/dns/stats', {}, { totalQueries: 0, successQueries: 0, failedQueries: 0, nxdomainQueries: 0, servfailQueries: 0, refusedQueries: 0, droppedQueries: 0, recursiveQueries: 0, tcpQueries: 0, udpQueries: 0, qps: 0, queryTypes: {}, topDomains: {}, rawStats: '' }),
    getDnsLogs: (tail = 100) => textReq(`/dns/logs?tail=${tail}`),

    // Zones
    listDnsZones: () => req<DnsZone[]>('/dns/zones', {}, []),
    getDnsZone: (id: string) => req<DnsZone | null>(`/dns/zones/${id}`, {}, null),
    createDnsZone: (body: CreateZoneRequest) => safeReq<DnsZone>('/dns/zones', { method: 'POST', body: JSON.stringify(body) }),
    deleteDnsZone: (id: string) => apiFetch(`/dns/zones/${id}`, { method: 'DELETE' }).then(r => r.ok),
    toggleDnsZone: (id: string) => apiFetch(`/dns/zones/${id}/toggle`, { method: 'POST' }).then(r => r.ok),
    updateDnsZoneOptions: (id: string, opts: { allowTransfer?: string[]; allowUpdate?: string[]; allowQuery?: string[]; alsoNotify?: string[]; forwarders?: string[]; masterAddresses?: string[] }) =>
        safeReq(`/dns/zones/${id}/options`, { method: 'PUT', body: JSON.stringify(opts) }),
    updateDnsZone: (id: string, body: UpdateZoneRequest) =>
        safeReq(`/dns/zones/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    validateDnsZone: (id: string) => req<ZoneValidationResult>(`/dns/zones/${id}/validate`, {}, { valid: false, output: '' }),
    getDnsZoneFile: (id: string) => textReq(`/dns/zones/${id}/file`),
    exportDnsZone: (id: string) => textReq(`/dns/zones/${id}/export`),
    generateDnsReverseZones: (id: string) => req<DnsActionResult>(`/dns/zones/${id}/generate-reverse`, { method: 'POST' }, { success: false, message: 'Network error' }),

    // Records
    getDnsRecords: (zoneId: string) => req<DnsRecord[]>(`/dns/zones/${zoneId}/records`, {}, []),
    updateDnsRecords: (zoneId: string, records: DnsRecord[]) => safeReq(`/dns/zones/${zoneId}/records`, { method: 'PUT', body: JSON.stringify({ records }) }),
    addDnsRecord: (zoneId: string, record: Partial<DnsRecord>) => safeReq(`/dns/zones/${zoneId}/records`, { method: 'POST', body: JSON.stringify(record) }),
    deleteDnsRecord: (zoneId: string, recordId: string) => apiFetch(`/dns/zones/${zoneId}/records/${recordId}`, { method: 'DELETE' }).then(r => r.ok),

    // DNSSEC
    getDnssecStatus: (zoneId: String) => req<DnssecStatus>(`/dns/zones/${zoneId}/dnssec`, {}, { enabled: false, signed: false, kskKeyTag: '', zskKeyTag: '', dsRecords: [] }),
    enableDnssec: (zoneId: string) => req<DnsActionResult>(`/dns/zones/${zoneId}/dnssec/enable`, { method: 'POST' }, { success: false, message: 'Error' }),
    disableDnssec: (zoneId: string) => req<DnsActionResult>(`/dns/zones/${zoneId}/dnssec/disable`, { method: 'POST' }, { success: false, message: 'Error' }),
    signDnsZone: (zoneId: string) => req<DnsActionResult>(`/dns/zones/${zoneId}/dnssec/sign`, { method: 'POST' }, { success: false, message: 'Error' }),
    getDsRecords: (zoneId: string) => req<string[]>(`/dns/zones/${zoneId}/dnssec/ds`, {}, []),

    // Templates
    listDnsTemplates: () => req<ZoneTemplate[]>('/dns/templates', {}, []),
    createDnsTemplate: (t: Partial<ZoneTemplate>) => safeReq<ZoneTemplate>('/dns/templates', { method: 'POST', body: JSON.stringify(t) }),
    deleteDnsTemplate: (id: string) => apiFetch(`/dns/templates/${id}`, { method: 'DELETE' }).then(r => r.ok),
    applyDnsTemplate: (zoneId: string, templateId: string) => safeReq(`/dns/zones/${zoneId}/apply-template/${templateId}`, { method: 'POST' }),

    // Import
    importDnsZoneFile: (body: BulkImportRequest) => req<BulkImportResult>('/dns/import', { method: 'POST', body: JSON.stringify(body) }, { success: false, imported: 0, skipped: 0, errors: ['Network error'] }),
    pullDnsZone: (body: PullZoneRequest) => req<BulkImportResult>('/dns/pull', { method: 'POST', body: JSON.stringify(body) }, { success: false, imported: 0, skipped: 0, errors: ['Network error'] }),

    // Lookup
    dnsLookup: (body: DnsLookupRequest) => req<DnsLookupResult>('/dns/lookup', { method: 'POST', body: JSON.stringify(body) }, { success: false, query: body.query, type: body.type, answers: [], rawOutput: '', queryTime: '', server: '', status: '' }),

    // ACLs
    listDnsAcls: () => req<DnsAcl[]>('/dns/acls', {}, []),
    createDnsAcl: (acl: Partial<DnsAcl>) => safeReq<DnsAcl>('/dns/acls', { method: 'POST', body: JSON.stringify(acl) }),
    updateDnsAcl: (acl: DnsAcl) => safeReq('/dns/acls', { method: 'PUT', body: JSON.stringify(acl) }),
    deleteDnsAcl: (id: string) => apiFetch(`/dns/acls/${id}`, { method: 'DELETE' }).then(r => r.ok),

    // TSIG Keys
    listTsigKeys: () => req<TsigKey[]>('/dns/tsig', {}, []),
    createTsigKey: (key: Partial<TsigKey>) => safeReq<TsigKey>('/dns/tsig', { method: 'POST', body: JSON.stringify(key) }),
    deleteTsigKey: (id: string) => apiFetch(`/dns/tsig/${id}`, { method: 'DELETE' }).then(r => r.ok),

    // Global Forwarders
    getDnsForwarders: () => req<DnsForwarderConfig>('/dns/forwarders', {}, { forwarders: [], forwardOnly: false }),
    updateDnsForwarders: (config: DnsForwarderConfig) => safeReq('/dns/forwarders', { method: 'POST', body: JSON.stringify(config) }),

    // Global Security
    getGlobalSecurityConfig: () => req<GlobalSecurityConfig>('/dns/security', {}, { recursionEnabled: false, allowRecursion: ['localnets', 'localhost'], rateLimitEnabled: false, rateLimitResponsesPerSecond: 10, rateLimitWindow: 5, defaultNameServers: [], allowQuery: ['any'], minimalResponses: false, ednsUdpSize: 1232, ipv4Enabled: true, ipv6Enabled: true, tcpClients: 100, maxCacheSize: '128M', reuseport: false }),
    updateGlobalSecurityConfig: (config: GlobalSecurityConfig) => safeReq('/dns/security', { method: 'POST', body: JSON.stringify(config) }),

    // Installation
    getDnsInstallStatus: () => req<DnsInstallStatus>('/dns/install/status', {}, { installed: false, running: false, version: '', logs: [] }),
    installDns: (body: DnsInstallRequest) => req<DnsActionResult>('/dns/install', { method: 'POST', body: JSON.stringify(body) }, { success: false, message: 'Network error' }),
    uninstallDns: () => req<DnsActionResult>('/dns/uninstall', { method: 'POST' }, { success: false, message: 'Network error' }),
    createDefaultDnsZones: () => req<DnsZone[]>('/dns/zones/create-defaults', { method: 'POST' }, []),

    // Professional Hosting
    generateDkimKey: (body: DkimKeyGenRequest) => req<DkimKey>('/dns/hosting/dkim/generate', { method: 'POST', body: JSON.stringify(body) }, { selector: body.selector, publicKey: '', privateKey: '', dnsRecord: '' }),
    buildSpfRecord: (config: SpfConfig) => textReq('/dns/hosting/spf/build', { method: 'POST', body: JSON.stringify(config) }),
    buildDmarcRecord: (config: DmarcConfig) => textReq('/dns/hosting/dmarc/build', { method: 'POST', body: JSON.stringify(config) }),
    suggestReverseZone: (ip: string) => req<IpPtrSuggestion>(`/dns/hosting/reverse/suggest?ip=${encodeURIComponent(ip)}`, {}, { ip, domain: '', reverseZone: '', ptrRecordName: '' }),
    checkPropagation: (zoneId: string, name: string, type: DnsRecordType) => req<PropagationCheckResult>(`/dns/hosting/propagation/${zoneId}?name=${encodeURIComponent(name)}&type=${type}`, {}, { zoneId, recordName: name, recordType: type, expectedValue: '', checks: [] }),

    // Phase 2 Improvements
    buildSrvRecord: (body: SrvConfig) => req<{ record: string }>('/dns/hosting/srv/build', { method: 'POST', body: JSON.stringify(body) }, { record: '' }),
    getEmailHealth: (zoneId: string) => req<EmailHealthStatus>(`/dns/hosting/health/${zoneId}`, {}, { zoneId, hasMx: false, hasSpf: false, hasDkim: false, hasDmarc: false, issues: [] }),
    getReverseDnsDashboard: () => req<ReverseDnsDashboard>('/dns/hosting/reverse-dashboard', {}, { serverIps: [], managedReverseZones: [], ptrStatuses: [] }),
};
