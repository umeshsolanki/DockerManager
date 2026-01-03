'use client';

import React, { useState, useEffect } from 'react';
import { Link, Save, CheckCircle, Info, Database, Server, Terminal, RefreshCw, Settings2, Globe, XCircle } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { SystemConfig } from '@/lib/types';
import dynamic from 'next/dynamic';
import packageJson from '../../../package.json';

const WebShell = dynamic(() => import('../Terminal'), { ssr: false });

export default function SettingsScreen() {
    const [serverUrl, setServerUrl] = useState(DockerClient.getServerUrl());
    const [dockerSocket, setDockerSocket] = useState('');
    const [jamesUrl, setJamesUrl] = useState('');
    const [message, setMessage] = useState('');
    const [config, setConfig] = useState<SystemConfig | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isShellOpen, setIsShellOpen] = useState(false);

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const data = await DockerClient.getSystemConfig();
            setConfig(data);
            if (data) {
                setDockerSocket(data.dockerSocket);
                setJamesUrl(data.jamesWebAdminUrl);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConfig();
    }, []);

    const handleSaveServer = () => {
        DockerClient.setServerUrl(serverUrl);
        setMessage('Server URL saved successfully!');
        setTimeout(() => setMessage(''), 3000);
        fetchConfig();
    };

    const handleSaveSystem = async () => {
        setSaving(true);
        try {
            const result = await DockerClient.updateSystemConfig({
                dockerSocket: dockerSocket,
                jamesWebAdminUrl: jamesUrl
            });
            if (result.success) {
                setMessage('System settings updated successfully!');
                fetchConfig();
            } else {
                setMessage('Failed to update system settings');
            }
        } catch (e) {
            console.error(e);
            setMessage('Error saving system settings');
        } finally {
            setSaving(false);
            setTimeout(() => setMessage(''), 3000);
        }
    };

    const handleUseDefault = () => {
        const DEFAULT_URL = "http://192.168.1.3:9091";
        setServerUrl(DEFAULT_URL);
        DockerClient.setServerUrl(DEFAULT_URL);
        setMessage('Reset to default server URL');
        setTimeout(() => setMessage(''), 3000);
        fetchConfig();
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto pb-6">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-bold">Settings</h1>
                <button
                    onClick={fetchConfig}
                    className="p-1.5 hover:bg-surface rounded-full transition-colors text-on-surface-variant hover:text-primary"
                    disabled={loading}
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {message && (
                <div className="fixed top-6 right-6 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl shadow-lg font-medium text-sm">
                        <CheckCircle size={16} />
                        <span>{message}</span>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Client Configuration */}
                <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 shadow-sm backdrop-blur-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            <Server size={20} />
                        </div>
                        <h2 className="text-lg font-semibold">Client Connection</h2>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-on-surface/70 px-1">Manager Server URL</label>
                            <div className="relative">
                                <Link className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={16} />
                                <input
                                    type="text"
                                    value={serverUrl}
                                    onChange={(e) => setServerUrl(e.target.value)}
                                    placeholder="e.g., http://192.168.1.100:9091"
                                    className="w-full bg-surface border border-outline/20 rounded-lg py-2 pl-10 pr-3 text-on-surface focus:outline-none focus:border-primary transition-colors text-sm"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={handleSaveServer}
                                className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-all active:scale-95 shadow-md shadow-primary/10 text-sm"
                            >
                                <Save size={16} />
                                <span>Save URL</span>
                            </button>
                            <button
                                onClick={handleUseDefault}
                                className="flex-1 flex items-center justify-center gap-2 bg-surface border border-outline/20 text-on-surface font-semibold px-4 py-2 rounded-lg hover:bg-surface-variant transition-all active:scale-95 text-sm"
                            >
                                <span>Default</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* System Configuration (Server-side) */}
                <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 shadow-sm backdrop-blur-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-2 bg-secondary/10 rounded-lg text-secondary">
                            <Settings2 size={20} />
                        </div>
                        <h2 className="text-lg font-semibold">System Settings</h2>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-on-surface/70 px-1">Docker Socket</label>
                            <div className="relative">
                                <Database className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={16} />
                                <input
                                    type="text"
                                    value={dockerSocket}
                                    onChange={(e) => setDockerSocket(e.target.value)}
                                    placeholder="/var/run/docker.sock"
                                    className="w-full bg-surface border border-outline/20 rounded-lg py-2 pl-10 pr-3 text-on-surface focus:outline-none focus:border-primary transition-colors text-sm"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-medium text-on-surface/70 px-1">James Admin URL</label>
                            <div className="relative">
                                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={16} />
                                <input
                                    type="text"
                                    value={jamesUrl}
                                    onChange={(e) => setJamesUrl(e.target.value)}
                                    placeholder="http://localhost:8001"
                                    className="w-full bg-surface border border-outline/20 rounded-lg py-2 pl-10 pr-3 text-on-surface focus:outline-none focus:border-primary transition-colors text-sm"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleSaveSystem}
                            disabled={saving || loading}
                            className="w-full flex items-center justify-center gap-2 bg-secondary text-secondary-foreground font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-all active:scale-95 shadow-md shadow-secondary/10 disabled:opacity-50 text-sm mt-1"
                        >
                            {saving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                            <span>Apply Settings</span>
                        </button>
                    </div>
                </div>

                {/* Environment Information */}
                <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 shadow-sm backdrop-blur-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                            <Info size={20} />
                        </div>
                        <h2 className="text-lg font-semibold">Environment Info</h2>
                    </div>

                    {config ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="p-3 bg-surface/80 rounded-xl border border-outline/5 overflow-hidden">
                                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Docker Binary</p>
                                <p className="text-on-surface font-mono text-[11px] mt-0.5 truncate" title={config.dockerCommand}>{config.dockerCommand}</p>
                            </div>
                            <div className="p-3 bg-surface/80 rounded-xl border border-outline/5 overflow-hidden">
                                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Docker Compose</p>
                                <p className="text-on-surface font-mono text-[11px] mt-0.5 truncate" title={config.dockerComposeCommand}>{config.dockerComposeCommand}</p>
                            </div>
                            <div className="p-3 bg-surface/80 rounded-xl border border-outline/5 sm:col-span-2 overflow-hidden">
                                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Data Root</p>
                                <p className="text-on-surface font-mono text-[11px] mt-0.5 truncate" title={config.dataRoot}>{config.dataRoot}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-4 text-center">
                            <p className="text-xs text-on-surface-variant italic">No server information available.</p>
                        </div>
                    )}
                </div>

                {/* Server Shell */}
                <div className="bg-primary/5 border border-primary/10 rounded-2xl p-5 shadow-sm backdrop-blur-sm flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="p-2 bg-primary/20 rounded-lg text-primary">
                            <Terminal size={20} />
                        </div>
                        <h2 className="text-lg font-semibold">Host Access</h2>
                    </div>
                    <p className="text-xs text-on-surface-variant mb-4 flex-grow">
                        Launch an interactive web terminal session to manage the host system directly from this interface.
                    </p>
                    <button
                        onClick={() => setIsShellOpen(true)}
                        className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-lg hover:opacity-90 transition-all active:scale-95 shadow-md shadow-primary/20 text-sm"
                    >
                        <Terminal size={18} />
                        <span>Launch Server Terminal</span>
                    </button>
                </div>

                {/* Version Info */}
                <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 shadow-sm backdrop-blur-sm md:col-span-2">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500">
                            <Info size={20} />
                        </div>
                        <h2 className="text-lg font-semibold">Application Version</h2>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-surface/80 rounded-xl border border-outline/5 flex items-center justify-between">
                            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Client Version</p>
                            <p className="text-sm font-mono font-medium text-on-surface">v{packageJson.version}</p>
                        </div>
                        <div className="p-3 bg-surface/80 rounded-xl border border-outline/5 flex items-center justify-between">
                            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Server Version</p>
                            <p className="text-sm font-mono font-medium text-on-surface">{config ? `v${config.appVersion}` : 'Checking...'}</p>
                        </div>
                    </div>
                </div>
            </div>

            {isShellOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="bg-surface border border-outline/20 rounded-3xl w-full max-w-5xl h-[80vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in duration-300">
                        <div className="p-6 border-b border-outline/10 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Terminal size={24} className="text-primary" />
                                <h2 className="text-2xl font-bold">Host Server Shell</h2>
                            </div>
                            <button onClick={() => setIsShellOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                <XCircle size={24} />
                            </button>
                        </div>
                        <div className="flex-1 p-4 bg-black">
                            <WebShell url={`${DockerClient.getServerUrl()}/shell/server`} onClose={() => setIsShellOpen(false)} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

