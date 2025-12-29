import { DockerContainer, DockerImage, ComposeFile, BatteryStatus, DockerSecret } from './types';

const DEFAULT_SERVER_URL = "http://192.168.1.3:85";

export const DockerClient = {
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

    async composeUp(path: string) {
        try {
            await fetch(`${this.getServerUrl()}/compose/up?file=${encodeURIComponent(path)}`, { method: 'POST' });
        } catch (e) {
            console.error(e);
        }
    },

    async composeDown(path: string) {
        try {
            await fetch(`${this.getServerUrl()}/compose/down?file=${encodeURIComponent(path)}`, { method: 'POST' });
        } catch (e) {
            console.error(e);
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
    }
};
