'use client';

import React, { useState, useEffect } from 'react';
import { Database, Zap, RefreshCw, CheckCircle, XCircle, Server, Globe, Lock, Trash2, Save, TestTube, Info, Plus, Table, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Download, Bookmark } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { RedisConfig, RedisStatus } from '@/lib/types';
import { toast } from 'sonner';
import { Button, ActionIconButton } from '../ui/Buttons';
import { StatCard } from '../ui/StatCard';

type DatabaseTab = 'Redis' | 'Postgres' | 'Console' | 'External';

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
            case 'Console': return <SqlConsoleTab />;
            case 'External': return <ExternalDbsTab />;
        }
    };

    const tabs: { id: DatabaseTab; label: string; icon: React.ElementType }[] = [
        { id: 'Redis', label: 'Redis Cache', icon: Zap },
        { id: 'Postgres', label: 'PostgreSQL', icon: Database },
        { id: 'Console', label: 'SQL Console', icon: Globe },
        { id: 'External', label: 'External DBs', icon: Server },
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

            {status?.isInstalled && <PostgresDataBrowser />}

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

function PostgresDataBrowser() {
    const [tables, setTables] = useState<string[]>([]);
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [tableData, setTableData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Sorting & Pagination
    const [sortBy, setSortBy] = useState<string | undefined>(undefined);
    const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC');
    const [page, setPage] = useState(0);
    const pageSize = 50;

    const fetchTables = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const tabs = await DockerClient.getPostgresTables();
            setTables(tabs.sort());
        } catch (e) {
            console.error(e);
            setError('Failed to fetch tables');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchTableData = async (table: string, p = page, sort = sortBy, dir = sortDir) => {
        setIsLoading(true);
        setError(null);
        try {
            const offset = p * pageSize;
            const data = await DockerClient.queryPostgresTable(table, sort, dir, pageSize, offset);
            setTableData(data);
        } catch (e) {
            console.error(e);
            setError(`Failed to fetch data for ${table}`);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchTables();
        }
    }, [isOpen]);

    useEffect(() => {
        if (selectedTable) {
            // Reset state on table change
            setPage(0);
            setSortBy(undefined);
            setSortDir('ASC');
            fetchTableData(selectedTable, 0, undefined, 'ASC');
        } else {
            setTableData([]);
        }
    }, [selectedTable]);

    const handleSort = (column: string) => {
        let newDir: 'ASC' | 'DESC' = 'ASC';
        if (sortBy === column) {
            newDir = sortDir === 'ASC' ? 'DESC' : 'ASC';
        }
        setSortBy(column);
        setSortDir(newDir);
        setPage(0); // Reset to first page on sort
        if (selectedTable) {
            fetchTableData(selectedTable, 0, column, newDir);
        }
    };

    const handlePageChange = (newPage: number) => {
        if (newPage < 0) return;
        setPage(newPage);
        if (selectedTable) {
            fetchTableData(selectedTable, newPage, sortBy, sortDir);
        }
    };

    return (
        <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] overflow-hidden">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-6 hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-surface-variant/20 flex items-center justify-center">
                        <Table size={18} className="text-on-surface" />
                    </div>
                    <div className="text-left">
                        <h3 className="font-bold text-lg">Database Browser</h3>
                        <p className="text-sm text-on-surface-variant">View tables and data</p>
                    </div>
                </div>
                <div className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                    <Plus className="rotate-45" size={24} />
                </div>
            </button>

            {isOpen && (
                <div className="px-6 pb-6 animate-in slide-in-from-top-2 duration-200">
                    <div className="flex flex-col md:flex-row gap-6">
                        {/* Sidebar: Table List */}
                        <div className="w-full md:w-1/4 bg-[#1e1e1e] rounded-2xl p-4 border border-white/5 h-[600px] overflow-y-auto">
                            <h4 className="font-bold text-sm text-on-surface mb-4 flex items-center justify-between">
                                <span>Tables ({tables.length})</span>
                                <button onClick={fetchTables} title="Refresh Tables" className="hover:text-primary transition-colors"><RefreshCw size={14} /></button>
                            </h4>
                            <div className="space-y-1">
                                {tables.map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setSelectedTable(t)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedTable === t ? 'bg-primary/20 text-primary font-bold' : 'hover:bg-white/5 text-on-surface-variant'}`}
                                    >
                                        {t}
                                    </button>
                                ))}
                                {tables.length === 0 && !isLoading && <p className="text-xs text-on-surface-variant/50 italic px-2">No tables found</p>}
                            </div>
                        </div>

                        {/* Main Content: Data View */}
                        <div className="w-full md:w-3/4 bg-[#1e1e1e] rounded-2xl p-4 border border-white/5 h-[600px] overflow-hidden flex flex-col">
                            {selectedTable ? (
                                <>
                                    <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-4">
                                        <div className="flex items-center gap-4">
                                            <h4 className="font-bold text-sm text-on-surface">Data: <span className="text-primary">{selectedTable}</span></h4>
                                            {sortBy && (
                                                <span className="text-xs text-on-surface-variant bg-white/5 px-2 py-1 rounded">
                                                    Sorted by: {sortBy} ({sortDir})
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center bg-black/40 rounded-lg p-1 mr-2">
                                                <button
                                                    onClick={() => handlePageChange(page - 1)}
                                                    disabled={page === 0 || isLoading}
                                                    className="p-1 hover:bg-white/10 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                                                >
                                                    <ChevronLeft size={16} />
                                                </button>
                                                <span className="text-xs font-mono px-3 text-on-surface-variant">Page {page + 1}</span>
                                                <button
                                                    onClick={() => handlePageChange(page + 1)}
                                                    disabled={tableData.length < pageSize || isLoading}
                                                    className="p-1 hover:bg-white/10 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                                                >
                                                    <ChevronRight size={16} />
                                                </button>
                                            </div>
                                            <button onClick={() => fetchTableData(selectedTable)} title="Refresh Data" className="hover:text-primary transition-colors p-1"><RefreshCw size={16} /></button>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-auto relative">
                                        {isLoading && (
                                            <div className="absolute inset-0 bg-black/50 z-20 flex items-center justify-center backdrop-blur-sm">
                                                <div className="flex items-center gap-2 text-primary font-bold">
                                                    <RefreshCw className="animate-spin" size={20} /> Loading...
                                                </div>
                                            </div>
                                        )}

                                        {tableData.length > 0 ? (
                                            <table className="w-full text-left text-xs border-collapse">
                                                <thead className="sticky top-0 bg-[#252525] z-10 shadow-lg">
                                                    <tr>
                                                        {Object.keys(tableData[0]).map(k => (
                                                            <th
                                                                key={k}
                                                                onClick={() => handleSort(k)}
                                                                className="p-3 border-b border-white/10 font-bold text-on-surface whitespace-nowrap cursor-pointer hover:bg-white/5 transition-colors select-none group"
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    {k}
                                                                    <span className={`transition-opacity ${sortBy === k ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-30'}`}>
                                                                        {sortBy === k && sortDir === 'DESC' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                                                                    </span>
                                                                </div>
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {tableData.map((row, i) => (
                                                        <tr key={i} className="hover:bg-white/5 font-mono text-on-surface-variant border-b border-white/5 last:border-0">
                                                            {Object.values(row).map((v: any, j) => (
                                                                <td key={j} className="p-2 max-w-[200px] truncate" title={String(v)}>
                                                                    {v === null ? <span className="text-white/20">NULL</span> : String(v)}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            !isLoading && (
                                                <div className="flex items-center justify-center h-full text-on-surface-variant/50 italic">
                                                    No data found or table empty
                                                </div>
                                            )
                                        )}
                                    </div>
                                    <div className="pt-2 text-[10px] text-on-surface-variant/40 text-right">
                                        Showing {tableData.length} rows (Limit: {pageSize})
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center justify-center h-full text-on-surface-variant/50">
                                    <div className="text-center">
                                        <Database size={48} className="mx-auto mb-2 opacity-20" />
                                        <p>Select a table to view data</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SqlConsoleTab() {
    const [sql, setSql] = useState('SELECT * FROM settings LIMIT 10;');
    const [results, setResults] = useState<any[]>([]);
    const [externalDbs, setExternalDbs] = useState<any[]>([]);
    const [selectedDb, setSelectedDb] = useState<string>('primary');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [savedQueries, setSavedQueries] = useState<{ name: string; sql: string }[]>([]);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [newQueryName, setNewQueryName] = useState('');

    useEffect(() => {
        DockerClient.listExternalDbs().then(setExternalDbs);
        const storedQueries = localStorage.getItem('savedSqlQueries');
        if (storedQueries) {
            setSavedQueries(JSON.parse(storedQueries));
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('savedSqlQueries', JSON.stringify(savedQueries));
    }, [savedQueries]);

    const handleExecute = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const request = {
                sql,
                externalDbId: selectedDb === 'primary' ? undefined : selectedDb
            };
            const data = await DockerClient.executeSqlQuery(request);
            if (data && (data as any).error) {
                setError((data as any).error);
                setResults([]);
            } else {
                setResults(Array.isArray(data) ? data : []);
            }
        } catch (e: any) {
            setError(e.message || 'Execution failed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveQuery = () => {
        setNewQueryName('');
        setShowSaveModal(true);
    };

    const confirmSaveQuery = () => {
        if (!newQueryName.trim()) {
            toast.error('Query name cannot be empty.');
            return;
        }
        if (savedQueries.some(q => q.name === newQueryName.trim())) {
            toast.error('A query with this name already exists.');
            return;
        }
        setSavedQueries([...savedQueries, { name: newQueryName.trim(), sql }]);
        toast.success(`Query "${newQueryName.trim()}" saved!`);
        setShowSaveModal(false);
    };

    const handleDeleteQuery = (index: number, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent triggering the parent button's onClick
        if (confirm('Are you sure you want to delete this saved query?')) {
            const updatedQueries = savedQueries.filter((_, i) => i !== index);
            setSavedQueries(updatedQueries);
            toast.success('Query deleted.');
        }
    };

    const handleExportCSV = () => {
        if (results.length === 0) {
            toast.info('No data to export.');
            return;
        }
        const headers = Object.keys(results[0]);
        const csv = [
            headers.join(','),
            ...results.map(row => headers.map(fieldName => JSON.stringify(row[fieldName])).join(','))
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', 'query_results.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('CSV exported successfully!');
    };

    const handleExportJSON = () => {
        if (results.length === 0) {
            toast.info('No data to export.');
            return;
        }
        const json = JSON.stringify(results, null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', 'query_results.json');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('JSON exported successfully!');
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Globe size={20} className="text-primary" /> SQL Console
                    </h2>
                    <div className="flex items-center gap-4">
                        <select
                            value={selectedDb}
                            onChange={(e) => setSelectedDb(e.target.value)}
                            className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:border-primary/50"
                        >
                            <option value="primary">Primary Database (Local)</option>
                            {externalDbs.map(db => (
                                <option key={db.id} value={db.id}>{db.name} ({db.host})</option>
                            ))}
                        </select>
                        <Button
                            onClick={handleExecute}
                            disabled={isLoading}
                            className="bg-primary text-on-primary px-6 py-2 rounded-xl font-bold flex items-center gap-2"
                        >
                            {isLoading ? <RefreshCw className="animate-spin" size={18} /> : <Zap size={18} />}
                            Execute SQL
                        </Button>
                    </div>
                </div>

                <div className="relative group mb-4">
                    <textarea
                        value={sql}
                        onChange={(e) => setSql(e.target.value)}
                        placeholder="Enter SQL command here..."
                        className="w-full h-40 bg-black/60 border border-white/10 rounded-2xl p-4 font-mono text-sm text-green-400 focus:outline-none focus:border-primary/50 transition-all resize-none shadow-inner"
                    />
                    <div className="absolute top-2 right-2 opacity-30 group-hover:opacity-100 transition-opacity flex gap-2">
                        <button
                            onClick={handleSaveQuery}
                            className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                            title="Save Query"
                        >
                            <Save size={16} />
                        </button>
                    </div>
                </div>

                {savedQueries.length > 0 && (
                    <div className="mb-4">
                        <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Bookmark size={12} /> Saved Queries
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {savedQueries.map((q, i) => (
                                <button
                                    key={i}
                                    onClick={() => setSql(q.sql)}
                                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-xs font-medium flex items-center gap-2 group transition-all"
                                >
                                    {q.name}
                                    <span
                                        onClick={(e) => handleDeleteQuery(i, e)}
                                        className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                                    >
                                        <XCircle size={12} />
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {error && (
                    <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm font-mono flex gap-2">
                        <XCircle size={18} className="shrink-0 mt-0.5" />
                        <div>
                            <p className="font-bold">Execution Error</p>
                            <p>{error}</p>
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] overflow-hidden min-h-[400px] flex flex-col">
                <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                    <h3 className="font-bold text-sm">Results {results.length > 0 && `(${results.length} rows)`}</h3>
                    {results.length > 0 && (
                        <div className="flex gap-2">
                            <Button onClick={handleExportCSV} className="px-2 py-1 text-[10px] bg-white/5 hover:bg-white/10 flex items-center gap-1">
                                <Download size={12} /> CSV
                            </Button>
                            <Button onClick={handleExportJSON} className="px-2 py-1 text-[10px] bg-white/5 hover:bg-white/10 flex items-center gap-1">
                                <Download size={12} /> JSON
                            </Button>
                            <Button onClick={() => setResults([])} className="px-2 py-1 text-[10px] bg-red-500/10 text-red-500 hover:bg-red-500/20">Clear</Button>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-auto">
                    {results.length > 0 ? (
                        <table className="w-full text-left text-xs border-collapse">
                            <thead className="sticky top-0 bg-[#252525] z-10 shadow-lg">
                                <tr>
                                    {Object.keys(results[0]).map(k => (
                                        <th key={k} className="p-3 border-b border-white/10 font-bold text-on-surface whitespace-nowrap bg-[#2a2a2a]">
                                            {k}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((row, i) => (
                                    <tr key={i} className="hover:bg-white/5 font-mono text-on-surface-variant border-b border-white/5 last:border-0">
                                        {Object.values(row).map((v: any, j) => (
                                            <td key={j} className="p-2 max-w-[300px] truncate" title={String(v)}>
                                                {v === null ? <span className="text-white/20">NULL</span> : String(v)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-on-surface-variant/30 py-20">
                            <Zap size={64} className="mb-4 opacity-10" />
                            <p className="font-medium italic">No results to display. Execute a query to see data.</p>
                        </div>
                    )}
                </div>
            </div>

            {showSaveModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-surface border border-outline/10 rounded-[32px] w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <Save size={20} className="text-primary" /> Save Query
                            </h3>
                            <input
                                autoFocus
                                type="text"
                                value={newQueryName}
                                onChange={(e) => setNewQueryName(e.target.value)}
                                placeholder="Query Name (e.g., 'Recent Users')"
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-primary/50 mb-6"
                                onKeyDown={(e) => e.key === 'Enter' && confirmSaveQuery()}
                            />
                            <div className="flex gap-2 justify-end">
                                <Button onClick={() => setShowSaveModal(false)} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold">Cancel</Button>
                                <Button onClick={confirmSaveQuery} className="px-6 py-2 bg-primary text-on-primary rounded-xl text-xs font-bold">Save</Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ExternalDbsTab() {
    const [dbs, setDbs] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isTesting, setIsTesting] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState<any | null>(null);

    const fetchDbs = async () => {
        setIsLoading(true);
        try {
            const data = await DockerClient.listExternalDbs();
            setDbs(data);
        } catch (e) {
            toast.error('Failed to fetch external databases');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDbs();
    }, []);

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to remove this connection?')) return;
        try {
            const res = await DockerClient.deleteExternalDb(id);
            if (res.success) {
                toast.success('Database connection removed');
                fetchDbs();
            } else {
                toast.error(res.message || 'Failed to delete');
            }
        } catch (e) {
            toast.error('Network error while deleting');
        }
    };

    const handleTest = async (config: any) => {
        setIsTesting(config.id);
        try {
            const res = await DockerClient.testExternalDb(config);
            if (res.success) {
                toast.success('Connection successful!');
            } else {
                toast.error(res.message || 'Connection failed');
            }
        } catch (e) {
            toast.error('Test failed with error');
        } finally {
            setIsTesting(null);
        }
    };

    const handleSave = async (config: any) => {
        try {
            const res = await DockerClient.saveExternalDb(config);
            if (res.success) {
                toast.success('Database connection saved');
                setIsEditing(null);
                fetchDbs();
            } else {
                toast.error(res.message || 'Failed to save');
            }
        } catch (e) {
            toast.error('Network error while saving');
        }
    };

    if (isLoading) return <div className="flex justify-center p-10"><RefreshCw className="animate-spin text-primary" size={32} /></div>;

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold">External Database Connections</h2>
                    <p className="text-sm text-on-surface-variant">Manage connections to third-party databases for querying</p>
                </div>
                <Button
                    onClick={() => setIsEditing({
                        id: 'db_' + Date.now(),
                        name: 'New Database',
                        type: 'postgres',
                        host: '',
                        port: 5432,
                        database: '',
                        user: '',
                        password: '',
                        ssl: false
                    })}
                    className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-xl font-bold"
                >
                    <Plus size={18} /> Add Connection
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {dbs.map(db => (
                    <div key={db.id} className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] p-6 hover:border-primary/30 transition-all flex flex-col group">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 bg-surface-variant/20 rounded-2xl flex items-center justify-center">
                                <Server size={24} className="text-on-surface" />
                            </div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <ActionIconButton onClick={() => setIsEditing(db)} icon={<Save size={14} />} title="Edit" />
                                <ActionIconButton onClick={() => handleDelete(db.id)} icon={<Trash2 size={14} />} title="Delete" className="text-red-500 hover:bg-red-500/10" />
                            </div>
                        </div>
                        <h3 className="font-bold text-lg mb-1">{db.name}</h3>
                        <p className="text-xs font-mono text-on-surface-variant mb-4">{db.type.toUpperCase()} • {db.host}:{db.port}</p>

                        <div className="mt-auto pt-4 flex items-center gap-2">
                            <Button
                                onClick={() => handleTest(db)}
                                disabled={isTesting === db.id}
                                className="flex-1 bg-white/5 hover:bg-white/10 text-[10px] font-bold py-2 rounded-lg transition-colors border border-white/5"
                            >
                                {isTesting === db.id ? <RefreshCw className="animate-spin" size={12} /> : <Zap size={12} />}
                                <span className="ml-1.5">{isTesting === db.id ? 'Testing...' : 'Test Connection'}</span>
                            </Button>
                        </div>
                    </div>
                ))}

                {dbs.length === 0 && !isEditing && (
                    <div className="col-span-full py-20 text-center border-2 border-dashed border-white/5 rounded-[32px]">
                        <Server size={48} className="mx-auto mb-4 opacity-10" />
                        <p className="text-on-surface-variant italic">No external database connections found.</p>
                    </div>
                )}
            </div>

            {isEditing && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-surface border border-outline/10 rounded-[40px] w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-8">
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-2xl font-bold flex items-center gap-3">
                                    <Server size={24} className="text-primary" />
                                    {isEditing.name === 'New Database' ? 'Add External DB' : 'Edit Connection'}
                                </h3>
                                <button onClick={() => setIsEditing(null)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                                    <Plus className="rotate-45" size={24} />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-1.5 col-span-2">
                                    <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-wider px-1">Friendly Name</label>
                                    <input
                                        type="text"
                                        value={isEditing.name}
                                        onChange={e => setIsEditing({ ...isEditing, name: e.target.value })}
                                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:border-primary/40 transition-all font-bold"
                                        placeholder="Production Analytics"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-wider px-1">DB Type</label>
                                    <select
                                        value={isEditing.type}
                                        onChange={e => setIsEditing({ ...isEditing, type: e.target.value })}
                                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:border-primary/40 transition-all font-bold"
                                    >
                                        <option value="postgres">PostgreSQL</option>
                                        <option value="mysql">MySQL</option>
                                        <option value="mariadb">MariaDB</option>
                                        <option value="sqlite">SQLite (Path as Host)</option>
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-wider px-1">Host / IP</label>
                                    <input
                                        type="text"
                                        value={isEditing.host}
                                        onChange={e => setIsEditing({ ...isEditing, host: e.target.value })}
                                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:border-primary/40 transition-all font-mono"
                                        placeholder="db.example.com"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-wider px-1">Port</label>
                                    <input
                                        type="number"
                                        value={isEditing.port}
                                        onChange={e => setIsEditing({ ...isEditing, port: parseInt(e.target.value) || 0 })}
                                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:border-primary/40 transition-all font-mono"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-wider px-1">Database Name</label>
                                    <input
                                        type="text"
                                        value={isEditing.database}
                                        onChange={e => setIsEditing({ ...isEditing, database: e.target.value })}
                                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:border-primary/40 transition-all font-mono"
                                        placeholder="main_db"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-wider px-1">Username</label>
                                    <input
                                        type="text"
                                        value={isEditing.user}
                                        onChange={e => setIsEditing({ ...isEditing, user: e.target.value })}
                                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:border-primary/40 transition-all font-mono"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-wider px-1">Password</label>
                                    <div className="relative">
                                        <input
                                            type="password"
                                            value={isEditing.password}
                                            onChange={e => setIsEditing({ ...isEditing, password: e.target.value })}
                                            className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:border-primary/40 transition-all font-mono pr-10"
                                        />
                                        <Lock className="absolute right-3 top-3.5 opacity-20" size={16} />
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 flex items-center justify-between pt-6 border-t border-white/5">
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={isEditing.ssl}
                                        onChange={e => setIsEditing({ ...isEditing, ssl: e.target.checked })}
                                        className="w-5 h-5 rounded accent-primary bg-black"
                                    />
                                    <span className="text-sm font-bold group-hover:text-primary transition-colors">Require SSL (TLS)</span>
                                </label>
                                <div className="flex gap-3">
                                    <Button onClick={() => setIsEditing(null)} className="px-6 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 font-bold transition-all">Cancel</Button>
                                    <Button onClick={() => handleSave(isEditing)} className="px-8 py-2.5 rounded-2xl bg-primary text-on-primary font-bold shadow-lg shadow-primary/20 transition-all">Save Connection</Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
