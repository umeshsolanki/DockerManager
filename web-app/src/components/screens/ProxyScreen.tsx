'use client';

import React, { useEffect, useState } from 'react';
import { Globe, Plus, Search, RefreshCw, Trash2, Power, BarChart3, Activity, Clock, Server, ExternalLink, ShieldCheck, Lock, Network, FileKey, Pencil, Layers, Database } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { ProxyHost, ProxyStats, SSLCertificate } from '@/lib/types';
import { toast } from 'sonner';

export default function ProxyScreen() {
    const [hosts, setHosts] = useState<ProxyHost[]>([]);
    const [stats, setStats] = useState<ProxyStats | null>(null);
    const [containerStatus, setContainerStatus] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isContainerActionLoading, setIsContainerActionLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingHost, setEditingHost] = useState<ProxyHost | null>(null);

    const [activeTab, setActiveTab] = useState<'domains' | 'container' | 'certs' | 'analytics'>('domains');
    const [certs, setCerts] = useState<SSLCertificate[]>([]);

    const fetchData = async () => {
        setIsLoading(true);
        const [hostsData, statsData, containerStatusData, certsData] = await Promise.all([
            DockerClient.listProxyHosts(),
            DockerClient.getProxyStats(),
            DockerClient.getProxyContainerStatus(),
            DockerClient.listProxyCertificates()
        ]);
        setHosts(hostsData);
        setStats(statsData);
        setContainerStatus(containerStatusData);
        setCerts(certsData);
        setIsLoading(false);
    };

    const fetchContainerStatus = async () => {
        const status = await DockerClient.getProxyContainerStatus();
        setContainerStatus(status);
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, []);

    const handleDelete = async (id: string) => {
        if (confirm('Are you sure you want to delete this proxy host?')) {
            const success = await DockerClient.deleteProxyHost(id);
            if (success) {
                toast.success('Proxy host deleted');
                fetchData();
            }
        }
    };

    const handleToggle = async (id: string) => {
        const success = await DockerClient.toggleProxyHost(id);
        if (success) {
            fetchData();
        }
    };

    const handleRequestSSL = async (id: string) => {
        toast.promise(DockerClient.requestProxySSL(id), {
            loading: 'Requesting SSL certificate from Let\'s Encrypt...',
            success: (success) => {
                if (success) {
                    fetchData();
                    return 'SSL Certificate installed successfully';
                }
                throw new Error('Failed to obtain certificate');
            },
            error: 'Domain verification failed. Ensure domain points to this IP and port 80 is open.'
        });
    };

    const filteredHosts = hosts.filter(h =>
        h.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h.target.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const tabs = [
        { id: 'domains', label: 'Domain Hosts', icon: <Globe size={18} /> },
        { id: 'container', label: 'Infrastructure', icon: <Server size={18} /> },
        { id: 'certs', label: 'Certificates', icon: <FileKey size={18} /> },
        { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={18} /> }
    ] as const;

    return (
        <div className="flex flex-col h-full relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-bold">Reverse Proxy</h1>
                    {isLoading && <RefreshCw className="animate-spin text-primary" size={24} />}
                </div>
                {activeTab === 'domains' && (
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-xl hover:opacity-90 transition-all shadow-lg"
                    >
                        <Plus size={20} />
                        <span>Add Host</span>
                    </button>
                )}
            </div>

            {/* Tab Selector */}
            <div className="flex gap-1 bg-surface-variant/30 p-1 rounded-2xl mb-6 w-fit self-center md:self-start">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id
                            ? 'bg-primary text-on-primary shadow-md'
                            : 'hover:bg-primary/10 text-on-surface-variant'
                            }`}
                    >
                        {tab.icon}
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar pb-6 px-1">
                {activeTab === 'domains' && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="relative mb-2">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
                            <input
                                type="text"
                                placeholder="Search domains or targets..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-surface border border-outline/20 rounded-2xl py-3 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary transition-all shadow-sm"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {filteredHosts.map(host => (
                                <div key={host.id} className="bg-surface/50 border border-outline/10 rounded-2xl p-4 hover:border-primary/20 transition-all group hover:shadow-md">
                                    <div className="flex items-start justify-between">
                                        <div className="flex gap-3">
                                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${host.enabled ? 'bg-primary/20 text-primary' : 'bg-white/5 text-on-surface-variant'}`}>
                                                <Globe size={22} />
                                            </div>
                                            <div className="overflow-hidden">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className="text-base font-bold truncate max-w-[150px]">{host.domain}</h3>
                                                    <div className="flex gap-1">
                                                        {!host.enabled && <span className="text-[9px] bg-red-500/10 text-red-500 px-1 py-0.5 rounded font-bold uppercase">OFF</span>}
                                                        {host.ssl && <span className="text-[9px] bg-green-500/10 text-green-500 px-1 py-0.5 rounded font-bold uppercase flex items-center gap-1"><Lock size={9} /> SSL</span>}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 text-on-surface-variant text-xs mt-0.5">
                                                    <ExternalLink size={12} className="shrink-0" />
                                                    <span className="font-mono truncate">{host.target}</span>
                                                </div>
                                                <div className="flex gap-1.5 mt-1.5">
                                                    {host.hstsEnabled && <span className="text-[8px] bg-purple-500/10 text-purple-500 px-1 py-0.5 rounded font-bold uppercase">HSTS</span>}
                                                    {host.websocketEnabled && <span className="text-[8px] bg-blue-500/10 text-blue-500 px-1 py-0.5 rounded font-bold uppercase">WS</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-0.5 self-start">
                                            {!host.ssl && host.enabled && (
                                                <button
                                                    onClick={() => handleRequestSSL(host.id)}
                                                    className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-all"
                                                    title="Request SSL"
                                                >
                                                    <ShieldCheck size={16} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setEditingHost(host)}
                                                className="p-1.5 text-on-surface-variant hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all"
                                                title="Edit"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleToggle(host.id)}
                                                className={`p-1.5 rounded-lg transition-all ${host.enabled ? 'text-green-500 hover:bg-green-500/10' : 'text-on-surface-variant hover:bg-white/10'}`}
                                                title={host.enabled ? "Disable" : "Enable"}
                                            >
                                                <Power size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(host.id)}
                                                className="p-1.5 text-on-surface-variant hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                                title="Delete"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {filteredHosts.length === 0 && (
                            <div className="flex flex-col items-center justify-center text-on-surface-variant py-20 opacity-30">
                                <Globe size={80} className="mb-4" />
                                <p className="italic text-xl">No proxy hosts configured</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'container' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Container Management Card */}
                        <div className="bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20 rounded-3xl p-5 shadow-inner overflow-hidden relative">
                            <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                                <Server size={140} />
                            </div>

                            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-5 relative z-10">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shadow-lg backdrop-blur-md border border-white/10">
                                        <Server size={24} className="text-primary" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold">Proxy Engine</h2>
                                        <p className="text-xs text-on-surface-variant">OpenResty & Certbot Management</p>
                                    </div>
                                </div>
                                {containerStatus && (
                                    <div className={`px-4 py-2 rounded-xl font-bold text-base flex items-center gap-2 shadow-lg backdrop-blur-md border ${containerStatus.running
                                        ? 'bg-green-500/20 text-green-500 border-green-500/30'
                                        : containerStatus.exists
                                            ? 'bg-orange-500/20 text-orange-500 border-orange-500/30'
                                            : 'bg-red-500/20 text-red-500 border-red-500/30'
                                        }`}>
                                        <div className={`w-2.5 h-2.5 rounded-full ${containerStatus.running ? 'bg-green-500 animate-pulse' : 'bg-current'
                                            }`} />
                                        {containerStatus.running ? 'RUNNING' : containerStatus.exists ? 'STOPPED' : 'NOT CREATED'}
                                    </div>
                                )}
                            </div>

                            {containerStatus && (
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                                    {[
                                        { label: 'Infrastructure', value: containerStatus.exists ? 'Deployed' : 'Missing', color: containerStatus.exists ? 'text-green-500' : 'text-red-500', icon: <Layers size={12} /> },
                                        { label: 'Docker Image', value: containerStatus.imageExists ? 'Available' : 'Missing', color: containerStatus.imageExists ? 'text-green-500' : 'text-red-500', icon: <Database size={12} /> },
                                        { label: 'Lifecycle', value: containerStatus.status, color: 'text-primary', icon: <Activity size={12} /> },
                                        { label: 'System ID', value: containerStatus.containerId?.substring(0, 12) || 'N/A', color: 'text-on-surface', icon: <FileKey size={12} /> }
                                    ].map((stat, i) => (
                                        <div key={i} className="bg-surface/40 backdrop-blur-sm rounded-xl p-3 border border-white/5 shadow-sm">
                                            <div className="flex items-center gap-1.5 text-[9px] text-on-surface-variant uppercase font-bold mb-1 tracking-wider">
                                                {stat.icon}
                                                <span>{stat.label}</span>
                                            </div>
                                            <div className={`text-base font-bold font-mono ${stat.color}`}>{stat.value}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
                                {[
                                    { label: 'Build', icon: <Activity className="rotate-90" />, action: () => DockerClient.buildProxyImage(), color: 'bg-surface hover:bg-surface-variant border-outline/20' },
                                    { label: 'Create', icon: <Plus />, action: () => DockerClient.createProxyContainer(), color: 'bg-surface hover:bg-surface-variant border-outline/20', disabled: !containerStatus?.imageExists },
                                    { label: 'Start', icon: <Activity />, action: () => DockerClient.startProxyContainer(), color: 'bg-green-500 text-on-primary', disabled: !containerStatus?.exists || containerStatus?.running },
                                    { label: 'Stop', icon: <Power />, action: () => DockerClient.stopProxyContainer(), color: 'bg-red-500 text-on-primary', disabled: !containerStatus?.running },
                                    { label: 'Restart', icon: <RefreshCw />, action: () => DockerClient.restartProxyContainer(), color: 'bg-orange-500 text-on-primary', disabled: !containerStatus?.running },
                                ].map((btn, i) => (
                                    <button
                                        key={i}
                                        onClick={async () => {
                                            setIsContainerActionLoading(true);
                                            const result = await btn.action();
                                            if (result.success) {
                                                toast.success(`${btn.label} successful`);
                                                setTimeout(fetchContainerStatus, 1000);
                                            } else {
                                                toast.error(result.message || `Failed to ${btn.label.toLowerCase()}`);
                                            }
                                            setIsContainerActionLoading(false);
                                        }}
                                        disabled={isContainerActionLoading || btn.disabled}
                                        className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl transition-all shadow-md active:scale-95 border border-white/5 font-bold text-xs disabled:opacity-30 disabled:grayscale ${btn.color}`}
                                    >
                                        {React.cloneElement(btn.icon as React.ReactElement<any>, { size: 16 })}
                                        <span>{btn.label}</span>
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={async () => {
                                    setIsContainerActionLoading(true);
                                    toast.promise(
                                        DockerClient.ensureProxyContainer(),
                                        {
                                            loading: 'Initializing absolute proxy infrastructure...',
                                            success: (result) => {
                                                setTimeout(fetchContainerStatus, 1500);
                                                return result.message || 'Infrastructure synchronized!';
                                            },
                                            error: (err) => err.message || 'Synchronization failed'
                                        }
                                    );
                                    setIsContainerActionLoading(false);
                                }}
                                disabled={isContainerActionLoading}
                                className="w-full bg-primary hover:bg-primary/90 text-on-primary px-4 py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all shadow-xl active:scale-[0.98] disabled:opacity-50"
                            >
                                <Activity size={20} />
                                <span>AUTOMATIC INFRASTRUCTURE SYNC</span>
                            </button>
                        </div>

                        {/* Information Guide */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-surface border border-outline/10 rounded-3xl p-6">
                                <h3 className="text-xl font-bold mb-4 flex items-center gap-3">
                                    <ShieldCheck className="text-green-500" />
                                    <span>Security & Compliance</span>
                                </h3>
                                <ul className="space-y-4 text-sm text-on-surface-variant">
                                    <li className="flex gap-3">
                                        <div className="w-6 h-6 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                        </div>
                                        <p>Automatic SSL certificate renewal every 60 days via Let's Encrypt.</p>
                                    </li>
                                    <li className="flex gap-3">
                                        <div className="w-6 h-6 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                        </div>
                                        <p>Enhanced OpenResty build with custom security headers and HSTS support.</p>
                                    </li>
                                    <li className="flex gap-3">
                                        <div className="w-6 h-6 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                        </div>
                                        <p>Isolated network mode ensures maximum performance and compatibility.</p>
                                    </li>
                                </ul>
                            </div>
                            <div className="bg-surface border border-outline/10 rounded-3xl p-6">
                                <h3 className="text-xl font-bold mb-4 flex items-center gap-3">
                                    <Network className="text-primary" />
                                    <span>Network Topology</span>
                                </h3>
                                <div className="space-y-4 text-sm text-on-surface-variant">
                                    <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-bold text-primary">Inbound (Wan)</span>
                                            <span className="text-xs font-mono bg-white/5 px-2 py-1 rounded">Ports: 80, 443</span>
                                        </div>
                                        <p className="text-xs">Traffic enters through the proxy container and is routed to internal targets based on the Host header.</p>
                                    </div>
                                    <div className="p-4 bg-secondary/5 rounded-2xl border border-secondary/10">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-bold text-secondary">Local Storage</span>
                                            <span className="text-xs font-mono bg-white/5 px-2 py-1 rounded">Volume: data/nginx</span>
                                        </div>
                                        <p className="text-xs">Configurations and logs are persisted locally for easy access and backup.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'certs' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold">Installed Certificates</h2>
                            <span className="bg-surface border border-outline/20 px-4 py-1.5 rounded-full text-sm font-bold">
                                {certs.length} Active Certificates
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {certs.map(cert => (
                                <div key={cert.id} className="bg-surface/50 border border-outline/10 rounded-3xl p-5 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-6 opacity-5">
                                        <FileKey size={48} />
                                    </div>
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="w-12 h-12 rounded-2xl bg-green-500/10 text-green-500 flex items-center justify-center shadow-inner">
                                            <Lock size={20} />
                                        </div>
                                        <div className="overflow-hidden">
                                            <h3 className="font-bold truncate text-lg pr-4">{cert.domain}</h3>
                                            <p className="text-[10px] text-on-surface-variant font-mono uppercase tracking-tighter truncate">{cert.id}</p>
                                        </div>
                                    </div>
                                    <div className="space-y-2 mt-4">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[9px] text-on-surface-variant uppercase font-black tracking-widest">Public Key Chain</span>
                                            <div className="text-[10px] bg-black/10 p-2 rounded-lg font-mono truncate border border-outline/5 text-on-surface-variant">
                                                {cert.certPath}
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[9px] text-on-surface-variant uppercase font-black tracking-widest">Private RSA Key</span>
                                            <div className="text-[10px] bg-black/10 p-2 rounded-lg font-mono truncate border border-outline/5 text-on-surface-variant">
                                                {cert.keyPath}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-outline/5 flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-green-500 flex items-center gap-1">
                                            <ShieldCheck size={12} />
                                            VALIDATED
                                        </span>
                                        <button className="text-[10px] font-bold text-primary hover:underline">RENEW</button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {certs.length === 0 && (
                            <div className="flex flex-col items-center justify-center text-on-surface-variant py-20 opacity-30">
                                <FileKey size={80} className="mb-4" />
                                <p className="italic text-xl">No certificates found</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'analytics' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Summary Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div className="bg-surface border border-outline/10 rounded-2xl p-4 shadow-sm">
                                <div className="flex items-center gap-2 text-on-surface-variant mb-2">
                                    <Activity size={16} className="text-primary" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Global Throughput</span>
                                </div>
                                <div className="text-2xl font-black">{stats?.totalHits || 0}</div>
                                <div className="text-[10px] text-green-500 mt-1 font-bold flex items-center gap-1">
                                    <Activity size={10} />
                                    HTTP Requests
                                </div>
                            </div>
                            <div className="bg-surface border border-outline/10 rounded-2xl p-4 shadow-sm">
                                <div className="flex items-center gap-2 text-on-surface-variant mb-2">
                                    <Server size={16} className="text-secondary" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Active Upstreams</span>
                                </div>
                                <div className="text-2xl font-black">{hosts.filter(h => h.enabled).length}</div>
                                <div className="text-[10px] text-on-surface-variant mt-1 font-bold">Domains</div>
                            </div>
                            <div className="md:col-span-2 bg-gradient-to-r from-surface to-surface/40 border border-outline/10 rounded-2xl p-4 shadow-sm overflow-hidden flex flex-col">
                                <div className="flex items-center gap-2 text-on-surface-variant mb-3">
                                    <BarChart3 size={16} className="text-primary" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Traffic (24h)</span>
                                </div>
                                <div className="flex items-end gap-1 h-full min-h-[3rem]">
                                    {stats && Object.entries(stats.hitsOverTime).map(([hour, count]) => {
                                        const max = Math.max(...Object.values(stats.hitsOverTime), 1);
                                        return (
                                            <div
                                                key={hour}
                                                className="flex-1 bg-primary/40 hover:bg-primary transition-all rounded-t-md relative group cursor-help"
                                                style={{ height: `${Math.max(5, (count / max) * 100)}%` }}
                                            >
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-surface backdrop-blur-xl border border-outline/10 text-[8px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap z-20 shadow-xl font-bold">
                                                    {hour}: {count}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {/* Hot Paths */}
                            <div className="bg-surface border border-outline/10 rounded-2xl p-4 shadow-sm flex flex-col">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                                            <Activity size={18} className="text-primary" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold">Hot Paths</h3>
                                            <p className="text-[9px] text-on-surface-variant uppercase font-bold">Top Resources</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-3 flex-1">
                                    {stats?.topPaths.map(({ first: path, second: count }) => (
                                        <div key={path} className="group">
                                            <div className="flex justify-between items-center mb-1 px-1">
                                                <span className="text-[11px] font-mono font-bold truncate pr-4 group-hover:text-primary transition-colors">{path}</span>
                                                <span className="text-xs font-bold text-on-surface-variant">{count}</span>
                                            </div>
                                            <div className="h-1.5 bg-surface-variant/20 rounded-full overflow-hidden border border-outline/5">
                                                <div
                                                    className="h-full bg-gradient-to-r from-primary to-primary/40 rounded-full transition-all duration-1000"
                                                    style={{ width: `${(count / (stats.totalHits || 1)) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Live Firehose */}
                            <div className="bg-surface border border-outline/10 rounded-2xl p-4 shadow-sm flex flex-col overflow-hidden max-h-[25rem]">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
                                            <Clock size={18} className="text-orange-500" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold">Real-time Traffic</h3>
                                            <p className="text-[9px] text-on-surface-variant uppercase font-bold">Live Deck</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 px-2 py-0.5 bg-green-500/10 rounded-full">
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                        <span className="text-[8px] font-bold text-green-500 uppercase">Live</span>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 scrollbar-invisible">
                                    {stats?.recentHits.slice().reverse().map((hit, i) => (
                                        <div key={i} className="flex gap-3 items-center bg-surface-variant/5 p-2 rounded-xl border border-outline/5 hover:bg-surface-variant/10 transition-all font-mono">
                                            <div className={`w-1 h-5 rounded-full shrink-0 ${hit.status < 400 ? 'bg-green-500' : 'bg-red-500'}`} />
                                            <div className="flex flex-col gap-0 overflow-hidden flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[10px] font-bold ${hit.status < 400 ? 'bg-green-500' : 'bg-red-500'}`}>{hit.status}</span>
                                                    <span className="text-[9px] font-bold text-primary uppercase">{hit.method}</span>
                                                    <span className="text-[9px] text-on-surface-variant font-bold truncate">{hit.path}</span>
                                                </div>
                                                <div className="flex items-center justify-between text-[8px] text-on-surface-variant/60">
                                                    <span>{hit.ip}</span>
                                                    <span className="italic">{new Date(hit.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {isAddModalOpen && (
                <ProxyHostModal
                    onClose={() => setIsAddModalOpen(false)}
                    onAdded={() => { setIsAddModalOpen(false); fetchData(); }}
                />
            )}

            {editingHost && (
                <ProxyHostModal
                    initialHost={editingHost}
                    onClose={() => setEditingHost(null)}
                    onAdded={() => { setEditingHost(null); fetchData(); }}
                />
            )}
        </div>
    );
}

function ProxyHostModal({ onClose, onAdded, initialHost }: { onClose: () => void, onAdded: () => void, initialHost?: ProxyHost }) {
    const [domain, setDomain] = useState(initialHost?.domain || '');
    const [target, setTarget] = useState(initialHost?.target || 'http://');
    const [websocketEnabled, setWebsocketEnabled] = useState(initialHost?.websocketEnabled || false);
    const [hstsEnabled, setHstsEnabled] = useState(initialHost?.hstsEnabled || false);
    const [sslEnabled, setSslEnabled] = useState(initialHost?.ssl || false);
    const [selectedCert, setSelectedCert] = useState<string>(initialHost?.customSslPath || '');
    const [certs, setCerts] = useState<SSLCertificate[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        DockerClient.listProxyCertificates().then(setCerts);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const hostData: ProxyHost = {
            id: initialHost?.id || '',
            domain,
            target,
            enabled: initialHost?.enabled ?? true,
            ssl: sslEnabled,
            websocketEnabled,
            hstsEnabled: sslEnabled ? hstsEnabled : false,
            customSslPath: (sslEnabled && selectedCert) ? selectedCert : undefined,
            createdAt: initialHost?.createdAt || Date.now()
        };

        const result = initialHost
            ? await DockerClient.updateProxyHost(hostData)
            : await DockerClient.createProxyHost(hostData);

        if (result.success) {
            toast.success(result.message || (initialHost ? 'Proxy host updated' : 'Proxy host created'));
            onAdded();
        } else {
            toast.error(result.message || (initialHost ? 'Failed to update proxy host' : 'Failed to create proxy host'));
            if (!initialHost && result.message?.includes("SSL")) onAdded(); // Allow save if SSL partially failed
        }
        setIsSubmitting(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-surface border border-outline/20 rounded-2xl w-full max-w-sm shadow-2xl p-5">
                <h2 className="text-lg font-bold mb-4">{initialHost ? 'Edit Proxy Host' : 'Add Proxy Host'}</h2>
                <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1 ml-1">Domain Name</label>
                        <input
                            required
                            type="text"
                            placeholder="e.g. app.example.com"
                            value={domain}
                            onChange={(e) => setDomain(e.target.value)}
                            className="w-full bg-white/5 border border-outline/20 rounded-xl px-4 py-2 focus:outline-none focus:border-primary"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1 ml-1">Target URL</label>
                        <input
                            required
                            type="text"
                            placeholder="e.g. http://localhost:8080"
                            value={target}
                            onChange={(e) => setTarget(e.target.value)}
                            className="w-full bg-white/5 border border-outline/20 rounded-xl px-4 py-2 focus:outline-none focus:border-primary"
                        />
                    </div>

                    <div className="flex flex-col gap-2 pt-2 border-t border-outline/10">
                        {/* WebSocket Toggle */}
                        <div className="flex items-center gap-3 py-1">
                            <input
                                type="checkbox"
                                id="ws-toggle"
                                checked={websocketEnabled}
                                onChange={(e) => setWebsocketEnabled(e.target.checked)}
                                className="w-5 h-5 rounded border-outline/20 bg-white/5 checked:bg-primary accent-primary"
                            />
                            <label htmlFor="ws-toggle" className="text-sm font-medium cursor-pointer text-on-surface">Enable Websockets Support</label>
                        </div>

                        {/* SSL Toggle */}
                        <div className="flex items-center gap-3 py-1">
                            <input
                                type="checkbox"
                                id="ssl-toggle"
                                checked={sslEnabled}
                                onChange={(e) => setSslEnabled(e.target.checked)}
                                className="w-5 h-5 rounded border-outline/20 bg-white/5 checked:bg-green-500 accent-green-500"
                            />
                            <label htmlFor="ssl-toggle" className="text-sm font-medium cursor-pointer text-on-surface flex items-center gap-2">
                                Enable SSL (HTTPS)
                                <Lock size={12} className="text-green-500" />
                            </label>
                        </div>

                        {/* SSL Options - Only visible when SSL is enabled */}
                        {sslEnabled && (
                            <div className="pl-4 ml-2 border-l-2 border-green-500/20 space-y-3 mt-1 animate-in slide-in-from-left-2 duration-200">
                                <div>
                                    <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">SSL Certificate Source</label>
                                    <div className="relative">
                                        <select
                                            value={selectedCert}
                                            onChange={(e) => setSelectedCert(e.target.value)}
                                            className="w-full bg-white/5 border border-outline/20 rounded-xl px-3 py-2 appearance-none focus:outline-none focus:border-green-500 text-sm"
                                        >
                                            <option value="">Auto-generate (Let's Encrypt)</option>
                                            {certs.map(cert => (
                                                <option key={cert.id} value={`${cert.certPath}|${cert.keyPath}`}>
                                                    {cert.domain} ({cert.id})
                                                </option>
                                            ))}
                                        </select>
                                        <FileKey size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        id="hsts-toggle"
                                        checked={hstsEnabled}
                                        onChange={(e) => setHstsEnabled(e.target.checked)}
                                        className="w-4 h-4 rounded border-outline/20 bg-white/5 checked:bg-purple-500 accent-purple-500"
                                    />
                                    <label htmlFor="hsts-toggle" className="text-xs font-medium cursor-pointer flex items-center gap-2 text-on-surface-variant">
                                        Enable HSTS
                                        <span className="text-[9px] bg-purple-500/10 text-purple-500 px-1 py-0.5 rounded font-bold uppercase">Strict Security</span>
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 rounded-xl border border-outline/20 hover:bg-white/5 text-sm font-bold"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 bg-primary text-on-primary px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-primary/20"
                        >
                            {initialHost ? 'Save Changes' : 'Create Host'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
