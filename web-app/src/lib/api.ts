import { DockerContainer, DockerImage, ComposeFile, BatteryStatus, DockerSecret, DockerNetwork, DockerVolume, ContainerDetails, VolumeDetails, BackupResult, CreateContainerRequest, SaveComposeRequest, ComposeResult, SystemLog, FirewallRule, BlockIPRequest, ProxyHost, ProxyHit, ProxyStats, BtmpStats, BtmpEntry, IptablesRule, SSLCertificate, EmailDomain, EmailUser, CreateEmailUserRequest, UpdateEmailUserPasswordRequest, SystemConfig, UpdateSystemConfigRequest, EmailMailbox, NetworkDetails, EmailTestRequest, EmailTestResult } from './types';

const DEFAULT_SERVER_URL = "http://192.168.1.3:9091";

export const DockerClient = {
    getServerUrl(): string {
        if (typeof window === 'undefined') return DEFAULT_SERVER_URL;

        const stored = localStorage.getItem('SERVER_URL');
        if (stored) return stored;

        // Otherwise assume the UI is being served by the UCpanel backend itself
        return window.location.origin;
    },

    setServerUrl(url: string) {
        if (typeof window !== 'undefined') {
            localStorage.setItem('SERVER_URL', url);
        }
    },

    getAuthToken(): string | null {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem('AUTH_TOKEN');
    },

    setAuthToken(token: string | null) {
        if (typeof window !== 'undefined') {
            if (token) localStorage.setItem('AUTH_TOKEN', token);
            else localStorage.removeItem('AUTH_TOKEN');
        }
    },

    getHeaders(): HeadersInit {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
        };
        const token = this.getAuthToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    },

    // --- Auth ---

    async login(request: import('./types').AuthRequest): Promise<import('./types').AuthResponse | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/auth/login`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(request)
            });

            if (response.status === 401) {
                const data = await response.json();
                if (data.requires2FA) return { token: '', requires2FA: true };
                return null;
            }

            if (!response.ok) return null;
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async checkAuth(): Promise<boolean> {
        try {
            const response = await fetch(`${this.getServerUrl()}/auth/check`, {
                headers: this.getHeaders()
            });
            return response.ok;
        } catch (e) {
            return false;
        }
    },

    async updatePassword(request: import('./types').UpdatePasswordRequest): Promise<{ success: boolean; message?: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/auth/password`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(request)
            });
            return await response.json();
        } catch (e) {
            return { success: false, message: 'Network error' };
        }
    },

    async updateUsername(request: import('./types').UpdateUsernameRequest): Promise<{ success: boolean; message?: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/auth/username`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(request)
            });
            return await response.json();
        } catch (e) {
            return { success: false, message: 'Network error' };
        }
    },

    async setup2FA(): Promise<import('./types').TwoFactorSetupResponse | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/auth/2fa/setup`, {
                headers: this.getHeaders()
            });
            return await response.json();
        } catch (e) {
            return null;
        }
    },

    async enable2FA(request: import('./types').Enable2FARequest): Promise<{ success: boolean; message?: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/auth/2fa/enable`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(request)
            });
            return await response.json();
        } catch (e) {
            return { success: false, message: 'Network error' };
        }
    },

    async disable2FA(password: string): Promise<{ success: boolean; message?: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/auth/2fa/disable`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ password })
            });
            return await response.json();
        } catch (e) {
            return { success: false, message: 'Network error' };
        }
    },

    async listContainers(): Promise<DockerContainer[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/containers`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async inspectContainer(id: string): Promise<ContainerDetails | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/containers/${id}/inspect`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async createContainer(request: CreateContainerRequest): Promise<string | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/containers`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(request)
            });
            if (response.ok) return await response.text();
            return null;
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async startContainer(id: string) {
        try {
            await fetch(`${this.getServerUrl()}/containers/${id}/start`, { method: 'POST', headers: this.getHeaders() });
        } catch (e) {
            console.error(e);
        }
    },

    async stopContainer(id: string) {
        try {
            await fetch(`${this.getServerUrl()}/containers/${id}/stop`, { method: 'POST', headers: this.getHeaders() });
        } catch (e) {
            console.error(e);
        }
    },

    async removeContainer(id: string) {
        try {
            await fetch(`${this.getServerUrl()}/containers/${id}`, { method: 'DELETE', headers: this.getHeaders() });
        } catch (e) {
            console.error(e);
        }
    },

    async pruneContainers() {
        try {
            await fetch(`${this.getServerUrl()}/containers/prune`, { method: 'POST', headers: this.getHeaders() });
        } catch (e) {
            console.error(e);
        }
    },

    async getContainerLogs(id: string, tail: number = 100): Promise<string> {
        try {
            const response = await fetch(`${this.getServerUrl()}/containers/${id}/logs?tail=${tail}`, { headers: this.getHeaders() });
            return await response.text();
        } catch (e) {
            console.error(e);
            return 'Error fetching logs';
        }
    },

    async listImages(): Promise<DockerImage[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/images`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async pullImage(name: string) {
        try {
            await fetch(`${this.getServerUrl()}/images/pull?image=${encodeURIComponent(name)}`, { method: 'POST', headers: this.getHeaders() });
        } catch (e) {
            console.error(e);
        }
    },

    async removeImage(id: string) {
        try {
            await fetch(`${this.getServerUrl()}/images/${id}`, { method: 'DELETE', headers: this.getHeaders() });
        } catch (e) {
            console.error(e);
        }
    },

    async listComposeFiles(): Promise<ComposeFile[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/compose`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async composeUp(path: string): Promise<ComposeResult | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/compose/up?file=${encodeURIComponent(path)}`, { method: 'POST', headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async composeDown(path: string): Promise<ComposeResult | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/compose/down?file=${encodeURIComponent(path)}`, { method: 'POST', headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async saveComposeFile(request: SaveComposeRequest): Promise<boolean> {
        try {
            const response = await fetch(`${this.getServerUrl()}/compose/save`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(request)
            });
            return response.ok;
        } catch (e) {
            console.error(e);
            return false;
        }
    },

    async getComposeFileContent(path: string): Promise<string> {
        try {
            const response = await fetch(`${this.getServerUrl()}/compose/content?file=${encodeURIComponent(path)}`, { headers: this.getHeaders() });
            if (response.ok) return await response.text();
            return "";
        } catch (e) {
            console.error(e);
            return "";
        }
    },

    async backupCompose(name: string): Promise<BackupResult | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/compose/${name}/backup`, { method: 'POST', headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async backupAllCompose(): Promise<BackupResult | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/compose/backup-all`, { method: 'POST', headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async getBatteryStatus(): Promise<BatteryStatus | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/system/battery`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async listSecrets(): Promise<DockerSecret[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/secrets`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async createSecret(name: string, data: string) {
        try {
            await fetch(`${this.getServerUrl()}/secrets?name=${encodeURIComponent(name)}&data=${encodeURIComponent(data)}`, { method: 'POST', headers: this.getHeaders() });
        } catch (e) {
            console.error(e);
        }
    },

    async removeSecret(id: string) {
        try {
            await fetch(`${this.getServerUrl()}/secrets/${id}`, { method: 'DELETE', headers: this.getHeaders() });
        } catch (e) {
            console.error(e);
        }
    },

    async listNetworks(): Promise<DockerNetwork[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/networks`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async inspectNetwork(id: string): Promise<NetworkDetails | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/networks/${id}`, { headers: this.getHeaders() });
            if (response.status === 404) return null;
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async removeNetwork(id: string) {
        try {
            await fetch(`${this.getServerUrl()}/networks/${id}`, { method: 'DELETE', headers: this.getHeaders() });
        } catch (e) {
            console.error(e);
        }
    },

    async listVolumes(): Promise<DockerVolume[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/volumes`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async removeVolume(name: string) {
        try {
            await fetch(`${this.getServerUrl()}/volumes/${name}`, { method: 'DELETE', headers: this.getHeaders() });
        } catch (e) {
            console.error(e);
        }
    },

    async pruneVolumes() {
        try {
            await fetch(`${this.getServerUrl()}/volumes/prune`, { method: 'POST', headers: this.getHeaders() });
        } catch (e) {
            console.error(e);
        }
    },

    async inspectVolume(name: string): Promise<VolumeDetails | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/volumes/${name}/inspect`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async backupVolume(name: string): Promise<BackupResult | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/volumes/${name}/backup`, { method: 'POST', headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async listSystemLogs(path?: string): Promise<SystemLog[]> {
        try {
            let url = `${this.getServerUrl()}/logs/system`;
            if (path) url += `?path=${encodeURIComponent(path)}`;
            const response = await fetch(url, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async getSystemLogContent(path: string, tail: number = 100, filter?: string, since?: string, until?: string): Promise<string> {
        try {
            let url = `${this.getServerUrl()}/logs/system/content?path=${encodeURIComponent(path)}&tail=${tail}`;
            if (filter) url += `&filter=${encodeURIComponent(filter)}`;
            if (since) url += `&since=${since}`;
            if (until) url += `&until=${until}`;
            const response = await fetch(url, { headers: this.getHeaders() });
            return await response.text();
        } catch (e) {
            console.error(e);
            return 'Error fetching system logs';
        }
    },

    async getBtmpStats(): Promise<BtmpStats | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/logs/system/btmp-stats`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async refreshBtmpStats(): Promise<BtmpStats | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/logs/system/btmp-stats/refresh`, { method: 'POST', headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async updateAutoJailSettings(enabled: boolean, threshold: number, duration: number): Promise<boolean> {
        try {
            const response = await fetch(`${this.getServerUrl()}/logs/system/btmp-stats/auto-jail?enabled=${enabled}&threshold=${threshold}&duration=${duration}`, { method: 'POST', headers: this.getHeaders() });
            return response.ok;
        } catch (e) {
            console.error(e);
            return false;
        }
    },

    async updateBtmpMonitoring(active: boolean, interval: number): Promise<boolean> {
        try {
            const response = await fetch(`${this.getServerUrl()}/logs/system/btmp-stats/monitoring?active=${active}&interval=${interval}`, { method: 'POST', headers: this.getHeaders() });
            return response.ok;
        } catch (e) {
            console.error(e);
            return false;
        }
    },

    async listFirewallRules(): Promise<FirewallRule[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/firewall/rules`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async blockIP(request: BlockIPRequest): Promise<boolean> {
        try {
            const response = await fetch(`${this.getServerUrl()}/firewall/block`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(request)
            });
            return response.ok;
        } catch (e) {
            console.error(e);
            return false;
        }
    },

    async unblockIP(id: string): Promise<boolean> {
        try {
            const response = await fetch(`${this.getServerUrl()}/firewall/rules/${id}`, {
                method: 'DELETE',
                headers: this.getHeaders()
            });
            return response.ok;
        } catch (e) {
            console.error(e);
            return false;
        }
    },

    async getIptablesVisualisation(): Promise<Record<string, IptablesRule[]>> {
        try {
            const response = await fetch(`${this.getServerUrl()}/firewall/iptables`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return {};
        }
    },

    async listProxyHosts(): Promise<ProxyHost[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/proxy/hosts`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async createProxyHost(host: Partial<ProxyHost>): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/proxy/hosts`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(host)
            });
            const text = await response.text();
            return { success: response.ok, message: text };
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error or unknown failure' };
        }
    },

    async updateProxyHost(host: ProxyHost): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/proxy/hosts/${host.id}`, {
                method: 'PUT',
                headers: this.getHeaders(),
                body: JSON.stringify(host)
            });
            const text = await response.text();
            return { success: response.ok, message: text };
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error or unknown failure' };
        }
    },

    async deleteProxyHost(id: string): Promise<boolean> {
        try {
            const response = await fetch(`${this.getServerUrl()}/proxy/hosts/${id}`, {
                method: 'DELETE',
                headers: this.getHeaders()
            });
            return response.ok;
        } catch (e) {
            console.error(e);
            return false;
        }
    },

    async toggleProxyHost(id: string): Promise<boolean> {
        try {
            const response = await fetch(`${this.getServerUrl()}/proxy/hosts/${id}/toggle`, {
                method: 'POST',
                headers: this.getHeaders()
            });
            return response.ok;
        } catch (e) {
            console.error(e);
            return false;
        }
    },

    async requestProxySSL(id: string): Promise<boolean> {
        try {
            const response = await fetch(`${this.getServerUrl()}/proxy/hosts/${id}/request-ssl`, {
                method: 'POST',
                headers: this.getHeaders()
            });
            return response.ok;
        } catch (e) {
            console.error(e);
            return false;
        }
    },

    async getProxyStats(): Promise<ProxyStats | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/proxy/stats`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async listProxyCertificates(): Promise<SSLCertificate[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/proxy/certificates`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async getProxyContainerStatus(): Promise<any> {
        try {
            const response = await fetch(`${this.getServerUrl()}/proxy/container/status`, { headers: this.getHeaders() });
            const data = await this.safeJson(response);
            if (data && data.success === false && data.message?.startsWith('Server error')) {
                return null;
            }
            return data;
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async safeJson(response: Response) {
        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            console.error('Failed to parse JSON:', text);
            return { success: false, message: `Server error: ${response.status} ${response.statusText}` };
        }
    },

    async buildProxyImage(): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/proxy/container/build`, {
                method: 'POST',
                headers: this.getHeaders()
            });
            return await this.safeJson(response);
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    async createProxyContainer(): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/proxy/container/create`, {
                method: 'POST',
                headers: this.getHeaders()
            });
            return await this.safeJson(response);
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    async startProxyContainer(): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/proxy/container/start`, {
                method: 'POST',
                headers: this.getHeaders()
            });
            return await this.safeJson(response);
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    async stopProxyContainer(): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/proxy/container/stop`, {
                method: 'POST',
                headers: this.getHeaders()
            });
            return await this.safeJson(response);
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    async restartProxyContainer(): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/proxy/container/restart`, {
                method: 'POST',
                headers: this.getHeaders()
            });
            return await this.safeJson(response);
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    async updateProxyComposeConfig(content: string): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/proxy/container/compose`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ content })
            });
            return await this.safeJson(response);
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    async getProxyComposeConfig(): Promise<string> {
        try {
            const response = await fetch(`${this.getServerUrl()}/proxy/container/compose`, { headers: this.getHeaders() });
            const data = await this.safeJson(response);
            return data.content || '';
        } catch (e) {
            console.error(e);
            return '';
        }
    },

    async ensureProxyContainer(): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/proxy/container/ensure`, {
                method: 'POST',
                headers: this.getHeaders()
            });
            return await this.safeJson(response);
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    // Email Management
    async listEmailDomains(): Promise<EmailDomain[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/domains`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async createEmailDomain(domain: string): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/domains/${domain}`, { method: 'PUT', headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    async deleteEmailDomain(domain: string): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/domains/${domain}`, { method: 'DELETE', headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    async listEmailUsers(): Promise<EmailUser[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/users`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async createEmailUser(userAddress: string, request: CreateEmailUserRequest): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/users/${userAddress}`, {
                method: 'PUT',
                headers: this.getHeaders(),
                body: JSON.stringify(request)
            });
            return await response.json();
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    async deleteEmailUser(userAddress: string): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/users/${userAddress}`, { method: 'DELETE', headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    async updateEmailUserPassword(userAddress: string, request: UpdateEmailUserPasswordRequest): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/users/${userAddress}/password`, {
                method: 'PATCH',
                headers: this.getHeaders(),
                body: JSON.stringify(request)
            });
            return await response.json();
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    async listEmailMailboxes(userAddress: string): Promise<EmailMailbox[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/users/${userAddress}/mailboxes`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async createEmailMailbox(userAddress: string, mailboxName: string): Promise<{ success: boolean, message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/users/${userAddress}/mailboxes/${mailboxName}`, {
                method: 'PUT',
                headers: this.getHeaders()
            });
            return await response.json();
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    async deleteEmailMailbox(userAddress: string, mailboxName: string): Promise<{ success: boolean, message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/users/${userAddress}/mailboxes/${mailboxName}`, {
                method: 'DELETE',
                headers: this.getHeaders()
            });
            return await response.json();
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    // Email Groups
    async listEmailGroups(): Promise<import('./types').EmailGroup[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/groups`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async getEmailGroupMembers(groupAddress: string): Promise<string[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/groups/${groupAddress}`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async createEmailGroup(groupAddress: string, memberAddress: string): Promise<{ success: boolean, message: string }> {
        return this.addEmailGroupMember(groupAddress, memberAddress);
    },

    async addEmailGroupMember(groupAddress: string, memberAddress: string): Promise<{ success: boolean, message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/groups/${groupAddress}/${memberAddress}`, {
                method: 'PUT',
                headers: this.getHeaders()
            });
            return await response.json();
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    async removeEmailGroupMember(groupAddress: string, memberAddress: string): Promise<{ success: boolean, message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/groups/${groupAddress}/${memberAddress}`, {
                method: 'DELETE',
                headers: this.getHeaders()
            });
            return await response.json();
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    // Email Quotas
    async getEmailUserQuota(userAddress: string): Promise<import('./types').EmailUserDetail | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/quota/${userAddress}`, { headers: this.getHeaders() });
            if (response.status === 404) return null;
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async setEmailUserQuota(userAddress: string, type: 'count' | 'size', value: number): Promise<{ success: boolean, message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/quota/${userAddress}/${type}`, {
                method: 'PUT',
                headers: this.getHeaders(),
                body: value.toString()
            });
            return await response.json();
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    async deleteEmailUserQuota(userAddress: string): Promise<{ success: boolean, message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/quota/${userAddress}`, {
                method: 'DELETE',
                headers: this.getHeaders()
            });
            return await response.json();
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    // James Management
    async getJamesStatus(): Promise<any> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/james/status`, { headers: this.getHeaders() });
            return await this.safeJson(response);
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async ensureJamesConfig(): Promise<{ success: boolean, message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/james/config`, { method: 'POST', headers: this.getHeaders() });
            return await this.safeJson(response);
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    async getJamesComposeConfig(): Promise<string> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/james/compose`, { headers: this.getHeaders() });
            const data = await this.safeJson(response);
            return data.content || '';
        } catch (e) {
            console.error(e);
            return '';
        }
    },

    async updateJamesComposeConfig(content: string): Promise<{ success: boolean, message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/james/compose`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ name: 'james', content })
            });
            return await this.safeJson(response);
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    async startJames(): Promise<{ success: boolean, message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/james/start`, { method: 'POST', headers: this.getHeaders() });
            return await this.safeJson(response);
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    async stopJames(): Promise<{ success: boolean, message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/james/stop`, { method: 'POST', headers: this.getHeaders() });
            return await this.safeJson(response);
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    async restartJames(): Promise<{ success: boolean, message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/james/restart`, { method: 'POST', headers: this.getHeaders() });
            return await this.safeJson(response);
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    async listJamesConfigFiles(): Promise<string[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/james/files`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async getJamesConfigContent(filename: string): Promise<string> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/james/files/${filename}`, { headers: this.getHeaders() });
            const data = await response.json();
            return data.content || '';
        } catch (e) {
            console.error(e);
            return '';
        }
    },

    async updateJamesConfigContent(filename: string, content: string): Promise<{ success: boolean, message: string }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/james/files/${filename}`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ content })
            });
            return await response.json();
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    },

    async getDefaultJamesConfigContent(filename: string): Promise<string> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/james/files/${filename}/default`, { headers: this.getHeaders() });
            const data = await response.json();
            return data.content || '';
        } catch (e) {
            console.error(e);
            return '';
        }
    },

    async getSystemConfig(): Promise<SystemConfig | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/system/config`, { headers: this.getHeaders() });
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async updateSystemConfig(request: UpdateSystemConfigRequest): Promise<{ success: boolean }> {
        try {
            const response = await fetch(`${this.getServerUrl()}/system/config`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(request)
            });
            return await response.json();
        } catch (e) {
            console.error(e);
            return { success: false };
        }
    },

    async testJamesEmail(request: EmailTestRequest): Promise<EmailTestResult> {
        try {
            const response = await fetch(`${this.getServerUrl()}/emails/james/test`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(request)
            });
            return await response.json();
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error', logs: [] };
        }
    },
};
