'use client';

import React, { useState, useEffect } from 'react';
import { Link, Save, CheckCircle, Info, Database, Server, Terminal, RefreshCw } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { SystemConfig } from '@/lib/types';

export default function SettingsScreen() {
    const [serverUrl, setServerUrl] = useState(DockerClient.getServerUrl());
    const [dockerSocket, setDockerSocket] = useState('');
    const [jamesUrl, setJamesUrl] = useState('');
    const [message, setMessage] = useState('');
    const [config, setConfig] = useState<SystemConfig | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

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
        <div className="flex flex-col h-full overflow-y-auto pb-10">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-bold">Settings</h1>
                <button
                    onClick={fetchConfig}
                    className="p-2 hover:bg-surface rounded-full transition-colors text-on-surface-variant hover:text-primary"
                    disabled={loading}
                >
                    <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {message && (
                <div className="fixed top-8 right-8 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center gap-3 bg-primary text-primary-foreground px-6 py-4 rounded-2xl shadow-2xl font-bold">
                        <CheckCircle size={20} />
                        <span>{message}</span>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl">
                {/* Server Configuration */}
                <div className="bg-surface/50 border border-outline/10 rounded-3xl p-8 shadow-xl backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                            <Server size={24} />
                        </div>
                        <h2 className="text-xl font-semibold">Client Configuration</h2>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-on-surface/80 px-1">Manager Server URL</label>
                            <div className="relative">
                                <Link className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
                                <input
                                    type="text"
                                    value={serverUrl}
                                    onChange={(e) => setServerUrl(e.target.value)}
                                    placeholder="e.g., http://192.168.1.100:9091"
                                    className="w-full bg-surface border border-outline/20 rounded-xl py-4 pl-12 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors text-lg"
                                />
                            </div>
                            <p className="text-xs text-on-surface-variant px-1 mt-2">
                                Specify the Docker Manager backend server address. This is stored locally in your browser.
                            </p>
                        </div>

                        <div className="flex gap-4 pt-4">
                            <button
                                onClick={handleSaveServer}
                                className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold px-6 py-4 rounded-xl hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-primary/20"
                            >
                                <Save size={20} />
                                <span>Save Client URL</span>
                            </button>
                            <button
                                onClick={handleUseDefault}
                                className="flex-1 flex items-center justify-center gap-2 bg-surface border border-outline/20 text-on-surface font-bold px-6 py-4 rounded-xl hover:bg-surface-variant transition-all active:scale-95"
                            >
                                <span>Use Default</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* System Configuration (Server-side) */}
                <div className="bg-surface/50 border border-outline/10 rounded-3xl p-8 shadow-xl backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-secondary/10 rounded-2xl text-secondary">
                            <Terminal size={24} />
                        </div>
                        <h2 className="text-xl font-semibold">System Configuration</h2>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-on-surface/80 px-1">Docker Socket Path</label>
                            <div className="relative">
                                <Database className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
                                <input
                                    type="text"
                                    value={dockerSocket}
                                    onChange={(e) => setDockerSocket(e.target.value)}
                                    placeholder="/var/run/docker.sock"
                                    className="w-full bg-surface border border-outline/20 rounded-xl py-4 pl-12 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors text-lg"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-on-surface/80 px-1">James WebAdmin URL</label>
                            <div className="relative">
                                <Server className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
                                <input
                                    type="text"
                                    value={jamesUrl}
                                    onChange={(e) => setJamesUrl(e.target.value)}
                                    placeholder="http://localhost:8001"
                                    className="w-full bg-surface border border-outline/20 rounded-xl py-4 pl-12 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors text-lg"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleSaveSystem}
                            disabled={saving || loading}
                            className="w-full flex items-center justify-center gap-2 bg-secondary text-secondary-foreground font-bold px-6 py-4 rounded-xl hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-secondary/20 disabled:opacity-50"
                        >
                            {saving ? <RefreshCw className="animate-spin" size={20} /> : <Save size={20} />}
                            <span>Save System Settings</span>
                        </button>
                    </div>
                </div>

                {/* Read-only System Info */}
                <div className="lg:col-span-2 bg-surface/50 border border-outline/10 rounded-3xl p-8 shadow-xl backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-500">
                            <Info size={24} />
                        </div>
                        <h2 className="text-xl font-semibold">Environment Information</h2>
                    </div>

                    {config ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="p-4 bg-surface rounded-2xl border border-outline/5">
                                <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">Docker Binary</p>
                                <p className="text-on-surface font-mono text-sm mt-1">{config.dockerCommand}</p>
                            </div>
                            <div className="p-4 bg-surface rounded-2xl border border-outline/5">
                                <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">Docker Compose</p>
                                <p className="text-on-surface font-mono text-sm mt-1">{config.dockerComposeCommand}</p>
                            </div>
                            <div className="p-4 bg-surface rounded-2xl border border-outline/5">
                                <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">Server Data Root</p>
                                <p className="text-on-surface font-mono text-sm mt-1">{config.dataRoot}</p>
                            </div>
                        </div>
                    ) : (
                        <p className="text-on-surface-variant">Connect to server to view environment details.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

