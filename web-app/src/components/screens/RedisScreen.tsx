'use client';

import React, { useState, useEffect } from 'react';
import {
    Database, CheckCircle, XCircle, RefreshCw, Save, TestTube,
    AlertCircle, Info, Server, Lock, Globe, Zap, Trash2
} from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { RedisConfig, RedisStatus } from '@/lib/types';
import { toast } from 'sonner';
import { Button, ActionIconButton } from '../ui/Buttons';
import { StatCard } from '../ui/StatCard';

export default function RedisScreen() {
    const [config, setConfig] = useState<RedisConfig>({
        enabled: false,
        host: 'localhost',
        port: 6379,
        password: null,
        database: 0,
        ssl: false,
        timeout: 5000
    });
    const [status, setStatus] = useState<RedisStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [configData, statusData] = await Promise.all([
                DockerClient.getRedisConfig(),
                DockerClient.getRedisStatus()
            ]);
            setConfig(configData);
            setStatus(statusData);
        } catch (e) {
            console.error('Failed to fetch Redis data', e);
            toast.error('Failed to load Redis configuration');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(() => {
            if (config.enabled) {
                DockerClient.getRedisStatus().then(setStatus).catch(() => {});
            }
        }, 10000); // Refresh status every 10 seconds
        return () => clearInterval(interval);
    }, [config.enabled]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const result = await DockerClient.updateRedisConfig(config);
            if (result.success) {
                toast.success(result.message || 'Redis configuration saved');
                await fetchData();
            } else {
                toast.error(result.message || 'Failed to save Redis configuration');
            }
        } catch (e) {
            console.error('Failed to save Redis config', e);
            toast.error('Failed to save Redis configuration');
        } finally {
            setIsSaving(false);
        }
    };

    const handleTest = async () => {
        setIsTesting(true);
        try {
            const result = await DockerClient.testRedisConnection(config);
            if (result.success && result.connected) {
                toast.success('Redis connection test successful!');
            } else {
                toast.error(result.message || 'Redis connection test failed');
            }
        } catch (e) {
            console.error('Failed to test Redis connection', e);
            toast.error('Failed to test Redis connection');
        } finally {
            setIsTesting(false);
        }
    };

    const handleClearCache = async () => {
        if (!confirm('Are you sure you want to clear all cache? This will remove all cached data.')) {
            return;
        }
        try {
            const result = await DockerClient.clearCache();
            if (result.success) {
                toast.success('Cache cleared successfully');
            } else {
                toast.error(result.message || 'Failed to clear cache');
            }
        } catch (e) {
            console.error('Failed to clear cache', e);
            toast.error('Failed to clear cache');
        }
    };

    const handleInstallRedis = async () => {
        if (!confirm('This will install Redis in a Docker container. Continue?')) {
            return;
        }
        try {
            const result = await DockerClient.installRedis();
            if (result.success) {
                toast.success(result.message || 'Redis installed successfully');
                await fetchData();
            } else {
                toast.error(result.message || 'Failed to install Redis');
            }
        } catch (e) {
            console.error('Failed to install Redis', e);
            toast.error('Failed to install Redis');
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <RefreshCw className="animate-spin text-primary" size={32} />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 pb-10">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <Database className="text-primary" size={28} />
                        Redis Cache Configuration
                    </h1>
                    <p className="text-on-surface-variant/60 text-sm mt-1">Configure Redis for distributed caching and improved performance</p>
                </div>
                <ActionIconButton onClick={fetchData} icon={<RefreshCw />} title="Refresh" />
            </header>

            {/* Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                    label="Redis Status"
                    value={status?.connected ? 'Connected' : status?.enabled ? 'Disconnected' : 'Disabled'}
                    sub={status?.connected ? 'Cache active' : status?.enabled ? 'Connection failed' : 'Using in-memory cache'}
                    color={status?.connected ? 'green' : status?.enabled ? 'orange' : 'gray'}
                    icon={status?.connected ? <CheckCircle size={20} /> : <XCircle size={20} />}
                />
                <StatCard
                    label="Host"
                    value={config.host}
                    sub={`Port: ${config.port}`}
                    color="primary"
                    icon={<Server size={20} />}
                />
                <StatCard
                    label="Database"
                    value={config.database.toString()}
                    sub={config.ssl ? 'SSL Enabled' : 'No SSL'}
                    color="indigo"
                    icon={<Database size={20} />}
                />
            </div>

            {/* Configuration Form */}
            <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold">Redis Settings</h2>
                    <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={config.enabled}
                                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                                className="w-5 h-5 rounded accent-primary"
                            />
                            <span className="text-sm font-bold">Enable Redis</span>
                        </label>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                        <label className="text-xs font-black uppercase text-on-surface-variant px-1 tracking-widest flex items-center gap-2">
                            <Server size={14} />
                            Host Address
                        </label>
                        <input
                            type="text"
                            value={config.host}
                            onChange={(e) => setConfig({ ...config, host: e.target.value })}
                            placeholder="localhost"
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono font-bold focus:outline-none focus:border-primary/50"
                            disabled={!config.enabled}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-black uppercase text-on-surface-variant px-1 tracking-widest flex items-center gap-2">
                            <Globe size={14} />
                            Port
                        </label>
                        <input
                            type="number"
                            value={config.port}
                            onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 6379 })}
                            placeholder="6379"
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono font-bold focus:outline-none focus:border-primary/50"
                            disabled={!config.enabled}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-black uppercase text-on-surface-variant px-1 tracking-widest flex items-center gap-2">
                            <Lock size={14} />
                            Password (Optional)
                        </label>
                        <input
                            type="password"
                            value={config.password || ''}
                            onChange={(e) => setConfig({ ...config, password: e.target.value || null })}
                            placeholder="Leave empty if no password"
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono font-bold focus:outline-none focus:border-primary/50"
                            disabled={!config.enabled}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-black uppercase text-on-surface-variant px-1 tracking-widest flex items-center gap-2">
                            <Database size={14} />
                            Database Number
                        </label>
                        <input
                            type="number"
                            value={config.database}
                            onChange={(e) => setConfig({ ...config, database: parseInt(e.target.value) || 0 })}
                            placeholder="0"
                            min="0"
                            max="15"
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono font-bold focus:outline-none focus:border-primary/50"
                            disabled={!config.enabled}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-black uppercase text-on-surface-variant px-1 tracking-widest flex items-center gap-2">
                            <Zap size={14} />
                            Connection Timeout (ms)
                        </label>
                        <input
                            type="number"
                            value={config.timeout}
                            onChange={(e) => setConfig({ ...config, timeout: parseInt(e.target.value) || 5000 })}
                            placeholder="5000"
                            min="1000"
                            max="30000"
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono font-bold focus:outline-none focus:border-primary/50"
                            disabled={!config.enabled}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-black uppercase text-on-surface-variant px-1 tracking-widest flex items-center gap-2">
                            <Lock size={14} />
                            SSL/TLS
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={config.ssl}
                                onChange={(e) => setConfig({ ...config, ssl: e.target.checked })}
                                className="w-5 h-5 rounded accent-primary"
                                disabled={!config.enabled}
                            />
                            <span className="text-sm font-bold">Enable SSL/TLS encryption</span>
                        </label>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3 mt-8 pt-6 border-t border-outline/10">
                    <Button
                        onClick={handleTest}
                        disabled={!config.enabled || isTesting}
                        className="flex items-center gap-2 bg-blue-500/10 text-blue-500 border border-blue-500/20 hover:bg-blue-500/20"
                    >
                        <TestTube size={16} />
                        {isTesting ? 'Testing...' : 'Test Connection'}
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 bg-primary text-on-primary"
                    >
                        <Save size={16} />
                        {isSaving ? 'Saving...' : 'Save Configuration'}
                    </Button>
                    <Button
                        onClick={handleClearCache}
                        disabled={!status?.connected}
                        className="flex items-center gap-2 bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20"
                    >
                        <Trash2 size={16} />
                        Clear Cache
                    </Button>
                    <Button
                        onClick={handleInstallRedis}
                        className="flex items-center gap-2 bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500/20"
                    >
                        <Database size={16} />
                        Install Redis (Docker)
                    </Button>
                </div>
            </div>

            {/* Info Section */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-[32px] p-6">
                <div className="flex items-start gap-4">
                    <Info className="text-blue-500 shrink-0 mt-1" size={20} />
                    <div className="space-y-2">
                        <h3 className="font-bold text-lg">About Redis Caching</h3>
                        <ul className="text-sm text-on-surface-variant space-y-1 list-disc list-inside">
                            <li>Redis provides distributed caching for improved performance and scalability</li>
                            <li>Historical analytics data is cached with a 24-hour TTL</li>
                            <li>When Redis is disabled, the system uses in-memory caching</li>
                            <li>Cache is automatically cleared when data is reprocessed</li>
                            <li>Connection status is checked every 10 seconds when enabled</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}

