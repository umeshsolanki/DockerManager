'use client';

import React, { useState, useEffect } from 'react';
import { Database, Zap, RefreshCw, CheckCircle, XCircle, Server, Globe, Lock, Trash2, Save, TestTube, Info, Plus } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { RedisConfig, RedisStatus } from '@/lib/types';
import { toast } from 'sonner';
import { Button, ActionIconButton } from '../ui/Buttons';
import { StatCard } from '../ui/StatCard';

type DatabaseTab = 'Redis' | 'Postgres';

export default function DatabaseScreen() {
    const [activeTab, setActiveTab] = useState<DatabaseTab>('Redis');
    const [dbStatuses, setDbStatuses] = useState<any[]>([]);
    const [isStatusLoading, setIsStatusLoading] = useState(true);

    const fetchStatuses = async () => {
        setIsStatusLoading(true);
        try {
            const statuses = await DockerClient.getDatabaseStatus();
            setDbStatuses(statuses);
        } catch (e) {
            console.error('Failed to fetch DB statuses', e);
        } finally {
            setIsStatusLoading(false);
        }
    };

    useEffect(() => {
        fetchStatuses();
    }, []);

    const renderContent = () => {
        switch (activeTab) {
            case 'Redis': return <RedisTab onInstalled={fetchStatuses} />;
            case 'Postgres':
                return <PostgresTab
                    onInstalled={fetchStatuses}
                    status={dbStatuses.find(s => s.type.toLowerCase() === 'postgres')}
                />;
        }
    };

    const tabs: { id: DatabaseTab; label: string; icon: React.ElementType }[] = [
        { id: 'Redis', label: 'Redis Cache', icon: Zap },
        { id: 'Postgres', label: 'PostgreSQL', icon: Database },
    ];

    return (
        <div className="flex flex-col gap-6 pb-10">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <Database className="text-primary" size={28} />
                        Databases
                    </h1>
                    <p className="text-on-surface-variant/60 text-sm mt-1">Manage database services and application caching</p>
                </div>
                <div className="flex items-center gap-2">
                    <ActionIconButton onClick={fetchStatuses} icon={<RefreshCw className={isStatusLoading ? 'animate-spin' : ''} />} title="Refresh Status" />
                </div>
            </header>

            <div className="flex items-center gap-6 border-b border-white/5">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const status = dbStatuses.find(s => s.type.toLowerCase() === tab.id.toLowerCase());
                    const isRunning = status?.status === 'active';

                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-1 py-4 border-b-2 transition-all duration-200 ${activeTab === tab.id
                                ? 'border-primary text-primary'
                                : 'border-transparent text-on-surface-variant hover:text-on-surface'
                                }`}
                        >
                            <Icon size={18} />
                            <span className="font-medium text-sm">{tab.label}</span>
                            {status && (
                                <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500' : 'bg-red-500'}`} />
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="mt-4">
                {renderContent()}
            </div>
        </div>
    );
}

function RedisTab({ onInstalled }: { onInstalled: () => void }) {
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
    }, []);

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
        if (!confirm('This will install Redis in a Docker container using Compose. Continue?')) {
            return;
        }
        try {
            const result = await DockerClient.installRedis();
            if (result.success) {
                toast.success(result.message || 'Redis installed successfully');
                await fetchData();
                onInstalled();
            } else {
                toast.error(result.message || 'Failed to install Redis');
            }
        } catch (e) {
            console.error('Failed to install Redis', e);
            toast.error('Failed to install Redis');
        }
    };

    if (isLoading) return <div className="flex justify-center p-10"><RefreshCw className="animate-spin text-primary" size={32} /></div>;

    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                    label="Redis Status"
                    value={status?.connected ? 'Connected' : status?.enabled ? 'Disconnected' : 'Disabled'}
                    sub={status?.connected ? 'Cache active' : status?.enabled ? 'Connection failed' : 'Using in-memory cache'}
                    color={status?.connected ? 'green' : status?.enabled ? 'orange' : 'indigo'}
                    icon={status?.connected ? <CheckCircle size={20} /> : <XCircle size={20} />}
                />
                <StatCard
                    label="Host"
                    value={config.host}
                    sub={`Port: ${config.port}\nBuilt with Dockerfile`}
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

            <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold">Redis Settings</h2>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={config.enabled}
                            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                            className="w-5 h-5 rounded accent-primary"
                        />
                        <span className="text-sm font-bold">Enable App Cache</span>
                    </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-foreground">
                    <div className="space-y-1.5">
                        <label className="text-xs font-black uppercase text-on-surface-variant px-1 tracking-widest flex items-center gap-2">
                            <Server size={14} /> Host
                        </label>
                        <input
                            type="text"
                            value={config.host}
                            onChange={(e) => setConfig({ ...config, host: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono font-bold focus:outline-none focus:border-primary/50"
                            disabled={!config.enabled}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-black uppercase text-on-surface-variant px-1 tracking-widest flex items-center gap-2">
                            <Globe size={14} /> Port
                        </label>
                        <input
                            type="number"
                            value={config.port}
                            onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 6379 })}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono font-bold focus:outline-none focus:border-primary/50"
                            disabled={!config.enabled}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3 mt-8 pt-6 border-t border-outline/10">
                    <Button onClick={handleTest} disabled={!config.enabled || isTesting} className="flex items-center gap-2 bg-blue-500/10 text-blue-500 border border-blue-500/20 hover:bg-blue-500/20">
                        <TestTube size={16} /> {isTesting ? 'Testing...' : 'Test Connection'}
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 bg-primary text-on-primary">
                        <Save size={16} /> {isSaving ? 'Saving...' : 'Save Configuration'}
                    </Button>
                    <Button onClick={handleClearCache} disabled={!status?.connected} className="flex items-center gap-2 bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20">
                        <Trash2 size={16} /> Clear Cache
                    </Button>
                    <Button onClick={handleInstallRedis} className="flex items-center gap-2 bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500/20">
                        <Plus size={16} /> Deploy Redis (Compose + Dockerfile)
                    </Button>
                </div>
            </div>

            {/* Info Section */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-[32px] p-6">
                <div className="flex items-start gap-4 text-foreground">
                    <Info className="text-blue-500 shrink-0 mt-1" size={20} />
                    <div className="space-y-2">
                        <h3 className="font-bold text-lg text-foreground">About Redis Caching</h3>
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

function PostgresTab({ onInstalled, status }: { onInstalled: () => void, status?: any }) {
    const [isLoading, setIsLoading] = useState(false);
    const [isInstalling, setIsInstalling] = useState(false);
    const [config, setConfig] = useState<any>(null);

    useEffect(() => {
        DockerClient.getSystemConfig().then(setConfig);
    }, []);

    const handleInstallPostgres = async () => {
        if (!confirm('This will install PostgreSQL. If it exists, it will be recreated. Continue?')) {
            return;
        }
        setIsInstalling(true);
        try {
            const result = await DockerClient.installPostgres();
            if (result.success) {
                toast.success(result.message || 'PostgreSQL installed successfully');
                onInstalled();
            } else {
                toast.error(result.message || 'Failed to install PostgreSQL');
            }
        } catch (e) {
            console.error('Failed to install PostgreSQL', e);
            toast.error('Failed to install PostgreSQL');
        } finally {
            setIsInstalling(false);
        }
    };

    const handleResetPostgres = async () => {
        if (!confirm('Are you sure you want to RESET PostgreSQL configuration? This will overwrite your docker-compose.yml and Dockerfile with defaults and generate a NEW password. EXISTING DATA will persist in the volume unless explicitly removed.')) {
            return;
        }
        setIsInstalling(true);
        try {
            const result = await DockerClient.resetPostgresConfig();
            if (result.success) {
                toast.success(result.message || 'PostgreSQL configuration reset successfully');
                onInstalled();
            } else {
                toast.error(result.message || 'Failed to reset PostgreSQL');
            }
        } catch (e) {
            console.error('Failed to reset PostgreSQL', e);
            toast.error('Failed to reset PostgreSQL');
        } finally {
            setIsInstalling(false);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] p-8 text-center">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Database className="text-primary" size={40} />
                </div>
                <h2 className="text-2xl font-bold mb-2">PostgreSQL Management</h2>

                {status && (
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4 font-bold text-xs ${status.isInstalled ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-surface border border-outline/10 text-on-surface-variant'}`}>
                        <div className={`w-2 h-2 rounded-full ${status.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                        {status.status ? status.status.toUpperCase() : 'UNKNOWN'}
                    </div>
                )}

                <p className="text-on-surface-variant/60 max-w-md mx-auto mb-8">
                    Deploy and manage PostgreSQL instances using Docker Compose. Includes support for custom Dockerfiles and automated secret management.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Button
                        onClick={handleInstallPostgres}
                        disabled={isInstalling}
                        className="flex items-center gap-2 bg-primary text-on-primary px-8 py-3 rounded-2xl font-bold"
                    >
                        {isInstalling ? <RefreshCw className="animate-spin" size={20} /> : <Plus size={20} />}
                        {status?.isInstalled ? 'Re-Deploy / Update' : 'Deploy Postgres (Compose)'}
                    </Button>

                    {status?.isInstalled && (
                        <div className="flex gap-4">
                            {config?.storageBackend === 'file' ? (
                                <Button
                                    onClick={async () => {
                                        if (confirm("Switch to Database storage?")) {
                                            setIsInstalling(true);
                                            try {
                                                const res = await DockerClient.switchToPostgresDbStorage();
                                                if (res.success) {
                                                    toast.success(res.message);
                                                    const newConfig = await DockerClient.getSystemConfig();
                                                    setConfig(newConfig);
                                                } else {
                                                    toast.error(res.message);
                                                }
                                            } finally {
                                                setIsInstalling(false);
                                            }
                                        }
                                    }}
                                    disabled={isInstalling}
                                    className="flex items-center gap-2 bg-indigo-500 text-white px-6 py-3 rounded-2xl font-bold"
                                >
                                    <Database size={20} />
                                    Activate DB Storage
                                </Button>
                            ) : (
                                <Button
                                    onClick={async () => {
                                        if (confirm("Switch to File storage?")) {
                                            setIsInstalling(true);
                                            try {
                                                const res = await DockerClient.switchToPostgresFileStorage();
                                                if (res.success) {
                                                    toast.success(res.message);
                                                    const newConfig = await DockerClient.getSystemConfig();
                                                    setConfig(newConfig);
                                                } else {
                                                    toast.error(res.message);
                                                }
                                            } finally {
                                                setIsInstalling(false);
                                            }
                                        }
                                    }}
                                    disabled={isInstalling}
                                    className="flex items-center gap-2 bg-orange-500/10 text-orange-500 border border-orange-500/20 px-6 py-3 rounded-2xl font-bold"
                                >
                                    <RefreshCw size={20} />
                                    Back to File
                                </Button>
                            )}

                            <Button
                                onClick={handleResetPostgres}
                                disabled={isInstalling}
                                className="flex items-center gap-2 bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 px-6 py-3 rounded-2xl font-bold"
                            >
                                <RefreshCw size={20} />
                                Reset Config
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {status?.isInstalled && <PostgresLogsViewer />}

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-[32px] p-6">
                <div className="flex items-start gap-4 text-foreground">
                    <Info className="text-blue-500 shrink-0 mt-1" size={20} />
                    <div className="space-y-2 text-foreground">
                        <h3 className="font-bold text-lg text-foreground">About PostgreSQL Deployment</h3>
                        <ul className="text-sm text-on-surface-variant space-y-1 list-disc list-inside">
                            <li>Managed via Docker Compose project "postgres"</li>
                            <li>Data persists in "postgres_data" volume</li>
                            <li>Default port is 5432</li>
                            <li>Automated password generation and management</li>
                            <li><strong>Reset Config</strong> will regenerate the docker-compose.yml and .env features, but keeps data.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}

function PostgresLogsViewer() {
    const [logs, setLogs] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const fetchLogs = async () => {
        setIsLoading(true);
        try {
            const logsData = await DockerClient.getPostgresLogs();
            setLogs(logsData);
        } catch (e) {
            console.error('Failed to fetch logs', e);
            toast.error('Failed to fetch logs');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchLogs();
        }
    }, [isOpen]);

    return (
        <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] overflow-hidden">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-6 hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-surface-variant/20 flex items-center justify-center">
                        <RefreshCw size={18} className="text-on-surface" />
                    </div>
                    <div className="text-left">
                        <h3 className="font-bold text-lg">System Logs</h3>
                        <p className="text-sm text-on-surface-variant">View container logs for troubleshooting</p>
                    </div>
                </div>
                <div className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                    <Plus className="rotate-45" size={24} />
                </div>
            </button>

            {isOpen && (
                <div className="px-6 pb-6 animate-in slide-in-from-top-2 duration-200">
                    <div className="bg-[#1e1e1e] rounded-2xl p-4 font-mono text-xs overflow-x-auto max-h-[400px] overflow-y-auto border border-white/5 relative">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-10 text-on-surface-variant gap-2">
                                <RefreshCw className="animate-spin" size={16} />
                                <span>Fetching logs...</span>
                            </div>
                        ) : logs ? (
                            <pre className="whitespace-pre-wrap text-emerald-400 leading-relaxed">
                                {logs}
                            </pre>
                        ) : (
                            <div className="text-center py-10 text-on-surface-variant italic">
                                No logs available
                            </div>
                        )}
                        <div className="absolute top-2 right-2">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    fetchLogs();
                                }}
                                className="p-2 hover:bg-white/10 rounded-lg text-on-surface-variant hover:text-white transition-colors"
                                title="Refresh Logs"
                            >
                                <RefreshCw size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
