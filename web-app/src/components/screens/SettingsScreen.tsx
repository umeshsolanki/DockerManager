'use client';

import React, { useState, useEffect } from 'react';
import { Link, Save, CheckCircle, Info, Database, Server, Terminal, RefreshCw } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { SystemConfig } from '@/lib/types';

export default function SettingsScreen() {
    const [serverUrl, setServerUrl] = useState(DockerClient.getServerUrl());
    const [message, setMessage] = useState('');
    const [config, setConfig] = useState<SystemConfig | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const data = await DockerClient.getSystemConfig();
            setConfig(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConfig();
    }, []);

    const handleSave = () => {
        DockerClient.setServerUrl(serverUrl);
        setMessage('Settings saved successfully!');
        setTimeout(() => setMessage(''), 3000);
        fetchConfig();
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl">
                {/* Server Configuration */}
                <div className="bg-surface/50 border border-outline/10 rounded-3xl p-8 shadow-xl backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                            <Server size={24} />
                        </div>
                        <h2 className="text-xl font-semibold">Server Configuration</h2>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-on-surface/80 px-1">Server URL</label>
                            <div className="relative">
                                <Link className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
                                <input
                                    type="text"
                                    value={serverUrl}
                                    onChange={(e) => setServerUrl(e.target.value)}
                                    placeholder="e.g., http://192.168.1.100:8080"
                                    className="w-full bg-surface border border-outline/20 rounded-xl py-4 pl-12 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors text-lg"
                                />
                            </div>
                            <p className="text-xs text-on-surface-variant px-1 mt-2">
                                Specify the Docker Manager backend server address.
                            </p>
                        </div>

                        <div className="flex flex-col gap-4 mt-8">
                            <div className="flex items-center gap-2 h-6">
                                {message && (
                                    <div className="flex items-center gap-2 text-green-500 animate-in fade-in slide-in-from-left-2 duration-300">
                                        <CheckCircle size={18} />
                                        <span className="text-sm font-medium">{message}</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-4">
                                <button
                                    onClick={handleSave}
                                    className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold px-6 py-4 rounded-xl hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-primary/20"
                                >
                                    <Save size={20} />
                                    <span>Save</span>
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
                </div>

                {/* System Information */}
                <div className="bg-surface/50 border border-outline/10 rounded-3xl p-8 shadow-xl backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-secondary/10 rounded-2xl text-secondary">
                            <Info size={24} />
                        </div>
                        <h2 className="text-xl font-semibold">System Information</h2>
                    </div>

                    {!config && !loading ? (
                        <div className="flex flex-col items-center justify-center py-10 text-on-surface-variant">
                            <p>No system information available.</p>
                            <p className="text-sm">Check your server connection.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-4">
                                    <div className="flex items-start gap-4 p-4 bg-surface rounded-2xl border border-outline/5 hover:border-primary/20 transition-colors">
                                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                                            <Terminal size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">Docker Command</p>
                                            <p className="text-on-surface font-mono text-sm truncate mt-1">{config?.dockerCommand || 'N/A'}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-4 p-4 bg-surface rounded-2xl border border-outline/5 hover:border-primary/20 transition-colors">
                                        <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500">
                                            <Terminal size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">Docker Compose</p>
                                            <p className="text-on-surface font-mono text-sm truncate mt-1">{config?.dockerComposeCommand || 'N/A'}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-4 p-4 bg-surface rounded-2xl border border-outline/5 hover:border-primary/20 transition-colors">
                                        <div className="p-2 bg-green-500/10 rounded-lg text-green-500">
                                            <Database size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">Data Root</p>
                                            <p className="text-on-surface font-mono text-sm truncate mt-1">{config?.dataRoot || 'N/A'}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-4 p-4 bg-surface rounded-2xl border border-outline/5 hover:border-primary/20 transition-colors">
                                        <div className="p-2 bg-orange-500/10 rounded-lg text-orange-500">
                                            <Server size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">James WebAdmin</p>
                                            <p className="text-on-surface font-mono text-sm truncate mt-1">{config?.jamesWebAdminUrl || 'N/A'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {loading && (
                        <div className="flex items-center justify-center py-20">
                            <RefreshCw className="animate-spin text-primary" size={32} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

