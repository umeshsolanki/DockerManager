import { DockerContainer, DockerImage, ComposeFile, BatteryStatus, DockerSecret, DockerNetwork, DockerVolume, ContainerDetails, VolumeDetails, BackupResult, CreateContainerRequest, SaveComposeRequest, ComposeResult, SystemLog, FirewallRule, BlockIPRequest, ProxyHost, ProxyHit, ProxyStats, BtmpStats, BtmpEntry, IptablesRule, SSLCertificate } from './types';

const DEFAULT_SERVER_URL = "http://192.168.1.3:9091";

export const DockerClient = {
    // ... rest of the code ...
    async createContainer(request: CreateContainerRequest): Promise<string | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/containers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request)
            });
            if (response.ok) return await response.text();
            return null;
        } catch (e) {
            console.error(e);
            return null;
        }
    },
    // ... rest of the code ...
    async inspectVolume(name: string): Promise<VolumeDetails | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/volumes/${name}/inspect`);
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async backupVolume(name: string): Promise<BackupResult | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/volumes/${name}/backup`, { method: 'POST' });
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },
    // ... rest of the code ...
    getServerUrl(): string {
        if (typeof window === 'undefined') return DEFAULT_SERVER_URL;
        return localStorage.getItem('SERVER_URL') || DEFAULT_SERVER_URL;
    },

    setServerUrl(url: string) {
        if (typeof window !== 'undefined') {
            localStorage.setItem('SERVER_URL', url);
        }
    },

    async listContainers(): Promise<DockerContainer[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/containers`);
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async inspectContainer(id: string): Promise<ContainerDetails | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/containers/${id}/inspect`);
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async startContainer(id: string) {
        try {
            await fetch(`${this.getServerUrl()}/containers/${id}/start`, { method: 'POST' });
        } catch (e) {
            console.error(e);
        }
    },

    async stopContainer(id: string) {
        try {
            await fetch(`${this.getServerUrl()}/containers/${id}/stop`, { method: 'POST' });
        } catch (e) {
            console.error(e);
        }
    },

    async removeContainer(id: string) {
        try {
            await fetch(`${this.getServerUrl()}/containers/${id}`, { method: 'DELETE' });
        } catch (e) {
            console.error(e);
        }
    },

    async pruneContainers() {
        try {
            await fetch(`${this.getServerUrl()}/containers/prune`, { method: 'POST' });
        } catch (e) {
            console.error(e);
        }
    },

    async getContainerLogs(id: string, tail: number = 100): Promise<string> {
        try {
            const response = await fetch(`${this.getServerUrl()}/containers/${id}/logs?tail=${tail}`);
            return await response.text();
        } catch (e) {
            console.error(e);
            return 'Error fetching logs';
        }
    },

    async listImages(): Promise<DockerImage[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/images`);
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async pullImage(name: string) {
        try {
            await fetch(`${this.getServerUrl()}/images/pull?image=${encodeURIComponent(name)}`, { method: 'POST' });
        } catch (e) {
            console.error(e);
        }
    },

    async removeImage(id: string) {
        try {
            await fetch(`${this.getServerUrl()}/images/${id}`, { method: 'DELETE' });
        } catch (e) {
            console.error(e);
        }
    },

    async listComposeFiles(): Promise<ComposeFile[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/compose`);
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async composeUp(path: string): Promise<ComposeResult | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/compose/up?file=${encodeURIComponent(path)}`, { method: 'POST' });
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async composeDown(path: string): Promise<ComposeResult | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/compose/down?file=${encodeURIComponent(path)}`, { method: 'POST' });
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
                headers: { 'Content-Type': 'application/json' },
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
            const response = await fetch(`${this.getServerUrl()}/compose/content?file=${encodeURIComponent(path)}`);
            if (response.ok) return await response.text();
            return "";
        } catch (e) {
            console.error(e);
            return "";
        }
    },

    async backupCompose(name: string): Promise<BackupResult | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/compose/${name}/backup`, { method: 'POST' });
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async backupAllCompose(): Promise<BackupResult | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/compose/backup-all`, { method: 'POST' });
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async getBatteryStatus(): Promise<BatteryStatus | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/system/battery`);
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async listSecrets(): Promise<DockerSecret[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/secrets`);
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async createSecret(name: string, data: string) {
        try {
            await fetch(`${this.getServerUrl()}/secrets?name=${encodeURIComponent(name)}&data=${encodeURIComponent(data)}`, { method: 'POST' });
        } catch (e) {
            console.error(e);
        }
    },

    async removeSecret(id: string) {
        try {
            await fetch(`${this.getServerUrl()}/secrets/${id}`, { method: 'DELETE' });
        } catch (e) {
            console.error(e);
        }
    },

    async listNetworks(): Promise<DockerNetwork[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/networks`);
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async removeNetwork(id: string) {
        try {
            await fetch(`${this.getServerUrl()}/networks/${id}`, { method: 'DELETE' });
        } catch (e) {
            console.error(e);
        }
    },

    async listVolumes(): Promise<DockerVolume[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/volumes`);
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async removeVolume(name: string) {
        try {
            await fetch(`${this.getServerUrl()}/volumes/${name}`, { method: 'DELETE' });
        } catch (e) {
            console.error(e);
        }
    },

    async pruneVolumes() {
        try {
            await fetch(`${this.getServerUrl()}/volumes/prune`, { method: 'POST' });
        } catch (e) {
            console.error(e);
        }
    },

    async listSystemLogs(path?: string): Promise<SystemLog[]> {
        try {
            let url = `${this.getServerUrl()}/logs/system`;
            if (path) url += `?path=${encodeURIComponent(path)}`;
            const response = await fetch(url);
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
            const response = await fetch(url);
            return await response.text();
        } catch (e) {
            console.error(e);
            return 'Error fetching system logs';
        }
    },

    async getBtmpStats(): Promise<BtmpStats | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/logs/system/btmp-stats`);
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async refreshBtmpStats(): Promise<BtmpStats | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/logs/system/btmp-stats/refresh`, { method: 'POST' });
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async updateAutoJailSettings(enabled: boolean, threshold: number, duration: number): Promise<boolean> {
        try {
            const response = await fetch(`${this.getServerUrl()}/logs/system/btmp-stats/auto-jail?enabled=${enabled}&threshold=${threshold}&duration=${duration}`, { method: 'POST' });
            return response.ok;
        } catch (e) {
            console.error(e);
            return false;
        }
    },

    async updateBtmpMonitoring(active: boolean, interval: number): Promise<boolean> {
        try {
            const response = await fetch(`${this.getServerUrl()}/logs/system/btmp-stats/monitoring?active=${active}&interval=${interval}`, { method: 'POST' });
            return response.ok;
        } catch (e) {
            console.error(e);
            return false;
        }
    },

    async listFirewallRules(): Promise<FirewallRule[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/firewall/rules`);
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
                headers: { 'Content-Type': 'application/json' },
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
                method: 'DELETE'
            });
            return response.ok;
        } catch (e) {
            console.error(e);
            return false;
        }
    },

    async getIptablesVisualisation(): Promise<Record<string, IptablesRule[]>> {
        try {
            const response = await fetch(`${this.getServerUrl()}/firewall/iptables`);
            return await response.json();
        } catch (e) {
            console.error(e);
            return {};
        }
    },

    async listProxyHosts(): Promise<ProxyHost[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/proxy/hosts`);
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
                headers: { 'Content-Type': 'application/json' },
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
                headers: { 'Content-Type': 'application/json' },
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
                method: 'DELETE'
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
                method: 'POST'
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
                method: 'POST'
            });
            return response.ok;
        } catch (e) {
            console.error(e);
            return false;
        }
    },

    async getProxyStats(): Promise<ProxyStats | null> {
        try {
            const response = await fetch(`${this.getServerUrl()}/proxy/stats`);
            return await response.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    async listProxyCertificates(): Promise<SSLCertificate[]> {
        try {
            const response = await fetch(`${this.getServerUrl()}/proxy/certificates`);
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    // Proxy Container Management
    async getProxyContainerStatus(): Promise<any> {
        try {
            const response = await fetch(`${this.getServerUrl()}/proxy/container/status`);
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
                method: 'POST'
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
                method: 'POST'
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
                method: 'POST'
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
                method: 'POST'
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
                method: 'POST'
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
                headers: { 'Content-Type': 'application/json' },
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
            const response = await fetch(`${this.getServerUrl()}/proxy/container/compose`);
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
                method: 'POST'
            });
            return await this.safeJson(response);
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Network error' };
        }
    }
};
