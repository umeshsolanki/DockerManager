import {
    DockerContainer, DockerImage, ComposeFile, BatteryStatus, DockerSecret,
    DockerNetwork, DockerVolume, ContainerDetails, VolumeDetails, BackupResult,
    CreateContainerRequest, SaveComposeRequest, ComposeResult, SystemLog,
    FirewallRule, BlockIPRequest, ProxyHost, PathRoute, ProxyHit, ProxyStats, DailyProxyStats, BtmpStats,
    BtmpEntry, IptablesRule, SSLCertificate, EmailDomain, EmailUser,
    CreateEmailUserRequest, UpdateEmailUserPasswordRequest, SystemConfig,
    UpdateSystemConfigRequest, EmailMailbox, NetworkDetails, EmailTestRequest,
    EmailTestResult, AuthRequest, AuthResponse, UpdatePasswordRequest,
    UpdateUsernameRequest, TwoFactorSetupResponse, Enable2FARequest, EmailGroup, EmailUserDetail, JamesContainerStatus,
    FileItem, RedisConfig, RedisStatus, RedisTestResult, RedisConfigUpdateResult,
    DockerStack, StackService, StackTask, DeployStackRequest, MigrateComposeToStackRequest, StopStackRequest
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
            return data.requires2FA ? { token: '', requires2FA: true } : null;
        }
        return res.ok ? res.json() : null;
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
    removeContainer: (id: string) => apiFetch(`/containers/${id}`, { method: 'DELETE' }),
    pruneContainers: () => apiFetch('/containers/prune', { method: 'POST' }),
    getContainerLogs: (id: string, tail = 100) => textReq(`/containers/${id}/logs?tail=${tail}`),

    // --- Images ---
    listImages: () => req<DockerImage[]>('/images', {}, []),
    pullImage: (name: string) => apiFetch(`/images/pull?image=${encodeURIComponent(name)}`, { method: 'POST' }),
    removeImage: (id: string) => apiFetch(`/images/${id}`, { method: 'DELETE' }),

    // --- Compose ---
    listComposeFiles: () => req<ComposeFile[]>('/compose', {}, []),
    composeUp: (path: string) => req<ComposeResult | null>(`/compose/up?file=${encodeURIComponent(path)}`, { method: 'POST' }, null),
    composeDown: (path: string) => req<ComposeResult | null>(`/compose/down?file=${encodeURIComponent(path)}`, { method: 'POST' }, null),
    saveComposeFile: (body: SaveComposeRequest) => apiFetch('/compose/save', { method: 'POST', body: JSON.stringify(body) }).then(r => r.ok),
    getComposeFileContent: (path: string) => textReq(`/compose/content?file=${encodeURIComponent(path)}`),
    backupCompose: (name: string) => req<BackupResult | null>(`/compose/${name}/backup`, { method: 'POST' }, null),
    backupAllCompose: () => req<BackupResult | null>('/compose/backup-all', { method: 'POST' }, null),
    
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

    listNetworks: () => req<DockerNetwork[]>('/networks', {}, []),
    inspectNetwork: (id: string) => req<NetworkDetails | null>(`/networks/${id}`, {}, null),
    removeNetwork: (id: string) => apiFetch(`/networks/${id}`, { method: 'DELETE' }),

    listVolumes: () => req<DockerVolume[]>('/volumes', {}, []),
    inspectVolume: (name: string) => req<VolumeDetails | null>(`/volumes/${name}/inspect`, {}, null),
    removeVolume: (name: string) => apiFetch(`/volumes/${name}`, { method: 'DELETE' }),
    pruneVolumes: () => apiFetch('/volumes/prune', { method: 'POST' }),
    backupVolume: (name: string) => req<BackupResult | null>(`/volumes/${name}/backup`, { method: 'POST' }, null),

    // --- System, Logs, Security ---
    getBatteryStatus: () => req<BatteryStatus | null>('/system/battery', {}, null),
    getSystemConfig: () => req<SystemConfig | null>('/system/config', {}, null),
    updateSystemConfig: (body: UpdateSystemConfigRequest) => req<{ success: boolean }>('/system/config', { method: 'POST', body: JSON.stringify(body) }, { success: false }),

    listSystemLogs: (path?: string) => req<SystemLog[]>(`/logs/system${path ? `?path=${encodeURIComponent(path)}` : ''}`, {}, []),
    getSystemLogContent: (path: string, tail = 100, filter?: string, since?: string, until?: string) => {
        let url = `/logs/system/content?path=${encodeURIComponent(path)}&tail=${tail}`;
        if (filter) url += `&filter=${encodeURIComponent(filter)}`;
        if (since) url += `&since=${since}`;
        if (until) url += `&until=${until}`;
        return textReq(url);
    },

    getBtmpStats: () => req<BtmpStats | null>('/logs/system/btmp-stats', {}, null),
    refreshBtmpStats: () => req<BtmpStats | null>('/logs/system/btmp-stats/refresh', { method: 'POST' }, null),
    updateAutoJailSettings: (e: boolean, t: number, d: number) => apiFetch(`/logs/system/btmp-stats/auto-jail?enabled=${e}&threshold=${t}&duration=${d}`, { method: 'POST' }).then(r => r.ok),
    updateBtmpMonitoring: (a: boolean, i: number) => apiFetch(`/logs/system/btmp-stats/monitoring?active=${a}&interval=${i}`, { method: 'POST' }).then(r => r.ok),

    listFirewallRules: () => req<FirewallRule[]>('/firewall/rules', {}, []),
    blockIP: (body: BlockIPRequest) => apiFetch('/firewall/block', { method: 'POST', body: JSON.stringify(body) }).then(r => r.ok),
    unblockIP: (id: string) => apiFetch(`/firewall/rules/${id}`, { method: 'DELETE' }).then(r => r.ok),
    getIptablesVisualisation: () => req<Record<string, IptablesRule[]>>('/firewall/iptables', {}, {}),

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
    
    // Redis Cache
    getRedisConfig: () => req<RedisConfig>('/cache/redis/config', {}, { enabled: false, host: 'localhost', port: 6379, database: 0, ssl: false, timeout: 5000 }),
    updateRedisConfig: (config: RedisConfig) => safeReq<RedisConfigUpdateResult>('/cache/redis/config', { method: 'POST', body: JSON.stringify(config) }),
    testRedisConnection: (config: RedisConfig) => safeReq<RedisTestResult>('/cache/redis/test', { method: 'POST', body: JSON.stringify(config) }),
    getRedisStatus: () => req<RedisStatus>('/cache/redis/status', {}, { enabled: false, connected: false, host: 'localhost', port: 6379 }),
    clearCache: () => safeReq('/cache/clear', { method: 'POST' }),
    installRedis: () => safeReq('/cache/install', { method: 'POST' }),
    
    getProxySecuritySettings: () => req<SystemConfig | null>('/proxy/security/settings', {}, null),
    updateProxySecuritySettings: (body: Partial<SystemConfig>) => safeReq('/proxy/security/settings', { method: 'POST', body: JSON.stringify(body) }),
    listProxyCertificates: () => req<SSLCertificate[]>('/proxy/certificates', {}, []),
    getProxyContainerStatus: () => safeReq('/proxy/container/status'),
    buildProxyImage: () => safeReq('/proxy/container/build', { method: 'POST' }),
    createProxyContainer: () => safeReq('/proxy/container/create', { method: 'POST' }),
    startProxyContainer: () => safeReq('/proxy/container/start', { method: 'POST' }),
    stopProxyContainer: () => safeReq('/proxy/container/stop', { method: 'POST' }),
    restartProxyContainer: () => safeReq('/proxy/container/restart', { method: 'POST' }),
    updateProxyComposeConfig: (content: string) => safeReq('/proxy/container/compose', { method: 'POST', body: JSON.stringify({ content }) }),
    getProxyComposeConfig: () => safeReq<{ content: string }>('/proxy/container/compose').then(r => r.content || ''),
    ensureProxyContainer: () => safeReq('/proxy/container/ensure', { method: 'POST' }),

    // --- Email Engine (James) ---
    listEmailDomains: () => req<EmailDomain[]>('/emails/domains', {}, []),
    createEmailDomain: (d: string) => safeReq(`/emails/domains/${d}`, { method: 'PUT' }),
    deleteEmailDomain: (d: string) => safeReq(`/emails/domains/${d}`, { method: 'DELETE' }),
    listEmailUsers: () => req<EmailUser[]>('/emails/users', {}, []),
    createEmailUser: (u: string, b: CreateEmailUserRequest) => safeReq(`/emails/users/${u}`, { method: 'PUT', body: JSON.stringify(b) }),
    deleteEmailUser: (u: string) => safeReq(`/emails/users/${u}`, { method: 'DELETE' }),
    updateEmailUserPassword: (u: string, b: UpdateEmailUserPasswordRequest) => safeReq(`/emails/users/${u}/password`, { method: 'PATCH', body: JSON.stringify(b) }),
    listEmailMailboxes: (u: string) => req<EmailMailbox[]>(`/emails/users/${u}/mailboxes`, {}, []),
    createEmailMailbox: (u: string, m: string) => safeReq(`/emails/users/${u}/mailboxes/${m}`, { method: 'PUT' }),
    deleteEmailMailbox: (u: string, m: string) => safeReq(`/emails/users/${u}/mailboxes/${m}`, { method: 'DELETE' }),
    listEmailGroups: () => req<EmailGroup[]>('/emails/groups', {}, []),
    createEmailGroup: (g: string, m: string) => safeReq(`/emails/groups/${g}/${m}`, { method: 'PUT' }),
    getEmailGroupMembers: (g: string) => req<string[]>(`/emails/groups/${g}`, {}, []),
    addEmailGroupMember: (g: string, m: string) => safeReq(`/emails/groups/${g}/${m}`, { method: 'PUT' }),
    removeEmailGroupMember: (g: string, m: string) => safeReq(`/emails/groups/${g}/${m}`, { method: 'DELETE' }),
    getEmailUserQuota: (u: string) => req<EmailUserDetail | null>(`/emails/quota/${u}`, {}, null),
    setEmailUserQuota: (u: string, t: string, v: number) => safeReq(`/emails/quota/${u}/${t}`, { method: 'PUT', body: v.toString() }),
    deleteEmailUserQuota: (u: string) => safeReq(`/emails/quota/${u}`, { method: 'DELETE' }),

    getJamesStatus: () => safeReq<JamesContainerStatus>('/emails/james/status'),
    ensureJamesConfig: () => safeReq('/emails/james/config', { method: 'POST' }),
    getJamesComposeConfig: () => safeReq<{ content: string }>('/emails/james/compose').then(r => r.content || ''),
    updateJamesComposeConfig: (content: string) => safeReq('/emails/james/compose', { method: 'POST', body: JSON.stringify({ name: 'james', content }) }),
    startJames: () => safeReq('/emails/james/start', { method: 'POST' }),
    stopJames: () => safeReq('/emails/james/stop', { method: 'POST' }),
    restartJames: () => safeReq('/emails/james/restart', { method: 'POST' }),
    listJamesConfigFiles: () => req<string[]>('/emails/james/files', {}, []),
    getJamesConfigContent: (f: string) => req<{ content: string }>(`/emails/james/files/${f}`, {}, { content: '' }).then(r => r.content),
    updateJamesConfigContent: (f: string, c: string) => safeReq(`/emails/james/files/${f}`, { method: 'POST', body: JSON.stringify({ content: c }) }),
    getDefaultJamesConfigContent: (f: string) => req<{ content: string }>(`/emails/james/files/${f}/default`, {}, { content: '' }).then(r => r.content),
    testJamesEmail: (b: EmailTestRequest) => req<EmailTestResult>('/emails/james/test', { method: 'POST', body: JSON.stringify(b) }, { success: false, message: 'Network error', logs: [] }),

    // --- File Manager ---
    listFiles: (path = "") => req<FileItem[]>(`/files/list?path=${encodeURIComponent(path)}`, {}, []),
    deleteFile: (path: string) => apiFetch(`/files/delete?path=${encodeURIComponent(path)}`, { method: 'DELETE' }).then(r => r.ok),
    createDirectory: (path: string) => apiFetch(`/files/mkdir?path=${encodeURIComponent(path)}`, { method: 'POST' }).then(r => r.ok),
    zipFile: (path: string, target: string) => apiFetch(`/files/zip?path=${encodeURIComponent(path)}&target=${encodeURIComponent(target)}`, { method: 'POST' }).then(r => r.ok),
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
};
