'use client';

import React, { useEffect, useState } from 'react';
import { Globe, Plus, Search, RefreshCw, Trash2, Power, Server, ExternalLink, FileKey, Pencil, Layers, Database, Lock, Network, Activity, ShieldCheck, Copy, CheckCircle2, Calendar, Building2, AlertTriangle } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { ProxyHost, PathRoute, SSLCertificate } from '@/lib/types';
import { toast } from 'sonner';
import Editor from '@monaco-editor/react';
import { Modal } from '../ui/Modal';


export default function ProxyScreen() {
    const [hosts, setHosts] = useState<ProxyHost[]>([]);
    const [containerStatus, setContainerStatus] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isContainerActionLoading, setIsContainerActionLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingHost, setEditingHost] = useState<ProxyHost | null>(null);

    const [activeTab, setActiveTab] = useState<'domains' | 'container' | 'certs'>('domains');
    const [certs, setCerts] = useState<SSLCertificate[]>([]);
    const [isComposeModalOpen, setIsComposeModalOpen] = useState(false);

    const fetchData = async () => {
        setIsLoading(true);
        const [hostsData, containerStatusData, certsData] = await Promise.all([
            DockerClient.listProxyHosts(),
            DockerClient.getProxyContainerStatus(),
            DockerClient.listProxyCertificates()
        ]);
        setHosts(hostsData);
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
        { id: 'certs', label: 'Certificates', icon: <FileKey size={18} /> }
    ] as const;

    return (
        <div className="flex flex-col h-full relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-on-surface to-on-surface-variant bg-clip-text text-transparent">Reverse Proxy</h1>
                    {isLoading && <RefreshCw className="animate-spin text-primary shrink-0" size={20} />}
                </div>
                {activeTab === 'domains' && (
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center justify-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-2xl hover:opacity-90 transition-all shadow-lg active:scale-95 text-sm font-bold"
                    >
                        <Plus size={18} />
                        <span>Add Host</span>
                    </button>
                )}
            </div>

            {/* Tab Selector - Scrollable on Mobile */}
            <div className="flex overflow-x-auto no-scrollbar gap-1 bg-surface-variant/30 p-1 rounded-2xl mb-4 w-full md:w-fit border border-outline/5">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex-1 md:flex-initial ${activeTab === tab.id
                            ? 'bg-primary text-on-primary shadow-lg shadow-primary/20'
                            : 'hover:bg-primary/5 text-on-surface-variant hover:text-on-surface'
                            }`}
                    >
                        <span className="flex-shrink-0">
                            {tab.icon}
                        </span>
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar pb-6 px-1">
                {activeTab === 'domains' && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="relative mb-3">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/40" size={16} />
                            <input
                                type="text"
                                placeholder="Search domains or targets..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-surface/50 border border-outline/10 rounded-xl py-2.5 pl-10 pr-4 text-xs text-on-surface focus:outline-none focus:border-primary/50 transition-all"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {filteredHosts.map(host => (
                                <div key={host.id} className="bg-surface/40 backdrop-blur-md border border-outline/10 rounded-2xl p-4 hover:border-primary/20 transition-all group relative overflow-hidden">
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex gap-3 min-w-0">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 duration-300 ${host.enabled ? 'bg-primary/10 text-primary' : 'bg-on-surface/5 text-on-surface-variant'}`}>
                                                    <Globe size={18} />
                                                </div>
                                                <div className="min-w-0 pt-0.5">
                                                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                                        <h3 className="text-sm font-bold truncate tracking-tight">{host.domain}</h3>
                                                        <div className="flex gap-1 shrink-0">
                                                            {!host.enabled && <span className="text-[8px] bg-red-500/10 text-red-500 px-1 py-0.5 rounded font-black uppercase tracking-wider">OFF</span>}
                                                            {host.ssl && <span className="text-[8px] bg-green-500/10 text-green-500 px-1 py-0.5 rounded font-black uppercase tracking-wider flex items-center gap-0.5"><Lock size={8} /> SSL</span>}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-on-surface-variant/60 text-[10px] font-mono truncate">
                                                        <ExternalLink size={10} className="shrink-0 opacity-40" />
                                                        <span className="truncate">{host.target}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className={`w-1.5 h-1.5 rounded-full mt-2 ${host.enabled ? 'bg-green-500' : 'bg-red-500'}`} />
                                        </div>

                                        <div className="flex flex-wrap gap-1 items-center">
                                            {host.hstsEnabled && <span className="text-[8px] bg-purple-500/10 text-purple-500 px-1.5 py-0.5 rounded font-bold uppercase">HSTS</span>}
                                            {host.websocketEnabled && <span className="text-[8px] bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded font-bold uppercase">WS</span>}
                                            {host.allowedIps && host.allowedIps.length > 0 && (
                                                <span className="text-[8px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1">
                                                    <ShieldCheck size={10} /> {host.allowedIps.length} IPS
                                                </span>
                                            )}
                                            {host.paths && host.paths.length > 0 && (
                                                <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1 ${host.paths.filter(p => p.enabled !== false).length === host.paths.length
                                                    ? 'bg-indigo-500/10 text-indigo-500'
                                                    : 'bg-orange-500/10 text-orange-500'
                                                    }`}>
                                                    <Layers size={10} />
                                                    {host.paths.filter(p => p.enabled !== false).length}/{host.paths.length} PATHS
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between pt-2 border-t border-outline/5 mt-auto">
                                            <div className="flex gap-0.5">
                                                <button
                                                    onClick={() => setEditingHost(host)}
                                                    className="p-2 text-on-surface-variant hover:text-blue-500 hover:bg-blue-500/5 rounded-lg transition-all active:scale-95"
                                                    title="Edit"
                                                >
                                                    <Pencil size={15} />
                                                </button>
                                                {!host.ssl && host.enabled && (
                                                    <button
                                                        onClick={() => handleRequestSSL(host.id)}
                                                        className="p-2 text-primary hover:bg-primary/5 rounded-lg transition-all active:scale-95"
                                                        title="Request SSL"
                                                    >
                                                        <ShieldCheck size={15} />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDelete(host.id)}
                                                    className="p-2 text-on-surface-variant hover:text-red-500 hover:bg-red-500/5 rounded-lg transition-all active:scale-95"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>

                                            <button
                                                onClick={() => handleToggle(host.id)}
                                                className={`flex items-center gap-1.5 pr-3 pl-2 py-1 rounded-xl transition-all font-bold text-[10px] active:scale-95 ${host.enabled
                                                    ? 'bg-green-500/15 text-green-500 border border-green-500/10'
                                                    : 'bg-on-surface/5 text-on-surface-variant border border-on-surface/10'}`}
                                            >
                                                <Power size={12} className={host.enabled ? 'animate-pulse' : ''} />
                                                <span>{host.enabled ? 'Enabled' : 'Disabled'}</span>
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
                        <div className="bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20 rounded-2xl p-6 shadow-lg overflow-hidden relative">
                            {/* ... (existing content) ... */}
                            {/* Keep existing container management content here. I will just insert the section at the bottom of THIS card or a new card */}
                            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                                <Server size={120} />
                            </div>

                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8 relative z-10">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center shadow-xl backdrop-blur-md border border-white/20 relative">
                                        <Server size={30} className="text-primary" />
                                        {containerStatus?.running && (
                                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-surface animate-pulse" />
                                        )}
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black tracking-tight">Proxy Engine</h2>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">OpenResty Gateway</span>
                                            <span className="w-1 h-1 rounded-full bg-on-surface-variant/30" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-primary">v1.21.x</span>
                                        </div>
                                    </div>
                                </div>
                                {containerStatus && (
                                    <div className={`px-5 py-2.5 rounded-2xl font-black text-xs flex items-center gap-3 shadow-lg backdrop-blur-xl border transition-all ${containerStatus.running
                                        ? 'bg-green-500/15 text-green-500 border-green-500/30'
                                        : containerStatus.exists
                                            ? 'bg-orange-500/15 text-orange-500 border-orange-500/30'
                                            : 'bg-red-500/15 text-red-500 border-red-500/30'
                                        }`}>
                                        <div className={`w-2.5 h-2.5 rounded-full ${containerStatus.running ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)] animate-pulse' : 'bg-current'
                                            }`} />
                                        <span className="tracking-widest">{containerStatus.running ? 'SYSTEM RUNNING' : containerStatus.exists ? 'SYSTEM STOPPED' : 'NOT INITIALIZED'}</span>
                                    </div>
                                )}
                            </div>

                            {containerStatus && (
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                                    {[
                                        { label: 'Infrastructure', value: containerStatus.exists ? 'Deployed' : 'Missing', color: containerStatus.exists ? 'text-green-500' : 'text-red-500', icon: <Layers size={14} /> },
                                        { label: 'Docker Image', value: containerStatus.imageExists ? 'Available' : 'Missing', color: containerStatus.imageExists ? 'text-green-500' : 'text-red-500', icon: <Database size={14} /> },
                                        { label: 'Lifecycle', value: containerStatus.status, color: 'text-primary', icon: <Activity size={14} /> },
                                        { label: 'System ID', value: containerStatus.containerId?.substring(0, 12) || 'N/A', color: 'text-on-surface', icon: <FileKey size={14} /> }
                                    ].map((stat, i) => (
                                        <div key={i} className="bg-surface/40 backdrop-blur-md rounded-2xl p-4 border border-white/5 shadow-sm group hover:border-primary/30 transition-all">
                                            <div className="flex items-center gap-2 text-[10px] text-on-surface-variant/70 uppercase font-black mb-2 tracking-widest">
                                                {stat.icon}
                                                <span>{stat.label}</span>
                                            </div>
                                            <div className={`text-sm font-black font-mono tracking-tight ${stat.color}`}>{stat.value}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex flex-wrap gap-3 mb-6">
                                {[
                                    { label: 'Build', icon: <Activity className="rotate-90" />, action: () => DockerClient.buildProxyImage(), color: 'bg-surface/50 hover:bg-surface-variant border-outline/20 text-on-surface' },
                                    { label: 'Create', icon: <Plus />, action: () => DockerClient.createProxyContainer(), color: 'bg-surface/50 hover:bg-surface-variant border-outline/20 text-on-surface', disabled: !containerStatus?.imageExists },
                                    { label: 'Start', icon: <Activity />, action: () => DockerClient.startProxyContainer(), color: 'bg-green-500 hover:bg-green-600 text-white shadow-green-500/20', disabled: !containerStatus?.exists || containerStatus?.running },
                                    { label: 'Stop', icon: <Power />, action: () => DockerClient.stopProxyContainer(), color: 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20', disabled: !containerStatus?.running },
                                    { label: 'Restart', icon: <RefreshCw />, action: () => DockerClient.restartProxyContainer(), color: 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/20', disabled: !containerStatus?.running },
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
                                        className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl transition-all shadow-lg active:scale-95 border font-black text-[10px] uppercase tracking-widest disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed flex-1 sm:flex-initial ${btn.color}`}
                                    >
                                        <span className="shrink-0">{btn.icon}</span>
                                        <span>{btn.label}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="flex flex-col sm:flex-row items-center gap-3 mb-4">
                                <button
                                    onClick={async () => {
                                        setIsContainerActionLoading(true);
                                        toast.promise(
                                            DockerClient.ensureProxyContainer(),
                                            {
                                                loading: 'Initializing proxy infrastructure...',
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
                                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-lg active:scale-[0.98] disabled:opacity-50"
                                >
                                    <Activity size={18} />
                                    <span>Sync Infrastructure</span>
                                </button>
                                <button
                                    onClick={() => setIsComposeModalOpen(true)}
                                    className="inline-flex items-center gap-2 text-xs font-semibold text-on-surface-variant hover:text-primary px-4 py-2.5 rounded-xl hover:bg-white/5 transition-all border border-outline/10"
                                >
                                    <Pencil size={14} />
                                    <span>Edit Compose</span>
                                </button>
                            </div>
                        </div>

                        {/* Configuration & Behavior */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 shadow-lg">
                                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                    <ShieldCheck className="text-green-500" size={20} />
                                    <span>Default Behavior</span>
                                </h3>
                                <p className="text-sm text-on-surface-variant mb-4">
                                    Configure how the proxy handles requests that don't match any defined host.
                                </p>
                                <DefaultBehaviorToggle />
                            </div>

                            {/* Information Guide */}
                            <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 shadow-lg">
                                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                    <Network className="text-primary" size={20} />
                                    <span>Network Topology</span>
                                </h3>
                                <div className="space-y-3 text-sm text-on-surface-variant">
                                    <div className="p-3.5 bg-primary/5 rounded-xl border border-primary/10">
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="font-semibold text-primary text-sm">Inbound (WAN)</span>
                                            <span className="text-[10px] font-mono bg-white/5 px-2 py-0.5 rounded">80, 443</span>
                                        </div>
                                        <p className="text-xs leading-relaxed">Traffic enters through the proxy container and is routed to internal targets based on the Host header.</p>
                                    </div>
                                    <div className="p-3.5 bg-secondary/5 rounded-xl border border-secondary/10">
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="font-semibold text-secondary text-sm">Local Storage</span>
                                            <span className="text-[10px] font-mono bg-white/5 px-2 py-0.5 rounded">data/nginx</span>
                                        </div>
                                        <p className="text-xs leading-relaxed">Configurations and logs are persisted locally for easy access and backup.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'certs' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-xl font-bold">SSL Certificates</h2>
                                <p className="text-[10px] text-on-surface-variant mt-0.5">Manage TLS certificates for your proxy hosts</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={fetchData}
                                    className="p-1.5 bg-surface border border-outline/10 rounded-lg hover:bg-white/5 transition-all text-primary"
                                    title="Refresh certificates"
                                >
                                    <RefreshCw size={14} />
                                </button>
                                <span className="bg-surface border border-outline/20 px-3 py-1 rounded-full text-[10px] font-bold">
                                    {certs.length} {certs.length === 1 ? 'Cert' : 'Certs'}
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            {certs.map(cert => (
                                <CertificateCard
                                    key={cert.id}
                                    cert={cert}
                                    hosts={hosts}
                                    onRenew={handleRequestSSL}
                                />
                            ))}
                        </div>

                        {/* DNS Challenge Settings Section */}
                        {hosts.some(h => h.sslChallengeType === 'dns' && h.dnsProvider === 'manual') && (
                            <div className="mt-4 bg-surface/30 border border-outline/10 rounded-xl overflow-hidden">
                                <div className="px-3 py-2 border-b border-outline/5 bg-surface/50 flex items-center justify-between">
                                    <h3 className="text-[11px] font-black uppercase tracking-wider flex items-center gap-2">
                                        <Network size={12} className="text-primary" />
                                        <span>DNS Challenge Configuration</span>
                                    </h3>
                                    <span className="text-[9px] text-on-surface-variant/40 font-medium">Manual Hooks</span>
                                </div>
                                <div className="divide-y divide-outline/5">
                                    {hosts.filter(h => h.sslChallengeType === 'dns' && h.dnsProvider === 'manual').map(host => (
                                        <div key={host.id} className="p-2.5 flex items-center justify-between hover:bg-white/5 transition-all">
                                            <div className="flex items-center gap-3">
                                                <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                    <Globe size={12} />
                                                </div>
                                                <div>
                                                    <div className="text-[11px] font-bold">{host.domain}</div>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <span className={`text-[7px] font-black px-1.5 py-0.5 rounded uppercase ${host.dnsAuthScript ? 'bg-purple-500/10 text-purple-500' : host.dnsHost ? 'bg-blue-500/10 text-blue-500' : 'bg-amber-500/10 text-amber-500'}`}>
                                                            {host.dnsAuthScript ? 'Script' : host.dnsHost ? 'API' : 'Manual'}
                                                        </span>
                                                        {host.ssl && <span className="text-[7px] text-green-500 font-bold uppercase tracking-widest">Active</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setEditingHost(host)}
                                                className="px-2 py-1 bg-primary/10 text-primary rounded-lg text-[10px] font-black uppercase hover:bg-primary/20 transition-all active:scale-95"
                                            >
                                                Edit
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {certs.length === 0 && (
                            <div className="flex flex-col items-center justify-center text-on-surface-variant py-16 opacity-30">
                                <FileKey size={60} className="mb-3" />
                                <p className="italic text-base mb-1">No certificates found</p>
                                <p className="text-xs">Request SSL certificates for your proxy hosts</p>
                            </div>
                        )}
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
                    initialHost={editingHost || undefined}
                    onClose={() => setEditingHost(null)}
                    onAdded={() => { setEditingHost(null); fetchData(); }}
                />
            )}

            {isComposeModalOpen && (
                <ProxyComposeModal
                    onClose={() => setIsComposeModalOpen(false)}
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
    const [sslChallengeType, setSslChallengeType] = useState<'http' | 'dns'>(initialHost?.sslChallengeType || 'http');
    const [dnsProvider, setDnsProvider] = useState(initialHost?.dnsProvider || 'cloudflare');
    const [dnsApiToken, setDnsApiToken] = useState(initialHost?.dnsApiToken || '');
    const [dnsAuthUrl, setDnsAuthUrl] = useState(initialHost?.dnsAuthUrl || '');
    const [dnsCleanupUrl, setDnsCleanupUrl] = useState(initialHost?.dnsCleanupUrl || '');
    const [dnsHost, setDnsHost] = useState(initialHost?.dnsHost || '');
    const [dnsManualMode, setDnsManualMode] = useState<'api' | 'script' | 'default'>(initialHost?.dnsHost ? 'default' : initialHost?.dnsAuthScript ? 'script' : 'api');
    const [dnsAuthScript, setDnsAuthScript] = useState(initialHost?.dnsAuthScript || '#!/bin/sh\n# Use $CERTBOT_DOMAIN and $CERTBOT_VALIDATION\n');
    const [dnsCleanupScript, setDnsCleanupScript] = useState(initialHost?.dnsCleanupScript || '#!/bin/sh\n');
    const [certs, setCerts] = useState<SSLCertificate[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [allowedIps, setAllowedIps] = useState<string[]>(initialHost?.allowedIps || []);
    const [newIp, setNewIp] = useState('');
    const [paths, setPaths] = useState<PathRoute[]>(initialHost?.paths || []);
    const [isPathModalOpen, setIsPathModalOpen] = useState(false);
    const [editingPath, setEditingPath] = useState<PathRoute | null>(null);

    // Rate Limiting State
    const [rateLimitEnabled, setRateLimitEnabled] = useState(initialHost?.rateLimit?.enabled || false);
    const [rateLimitRate, setRateLimitRate] = useState(initialHost?.rateLimit?.rate?.toString() || '10');
    const [rateLimitPeriod, setRateLimitPeriod] = useState<'s' | 'm'>(initialHost?.rateLimit?.period || 's');
    const [rateLimitBurst, setRateLimitBurst] = useState(initialHost?.rateLimit?.burst?.toString() || '20');
    const [rateLimitNodelay, setRateLimitNodelay] = useState(initialHost?.rateLimit?.nodelay ?? true);

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
            allowedIps,
            paths: paths.length > 0 ? paths : undefined,
            createdAt: initialHost?.createdAt || Date.now(),
            sslChallengeType,
            dnsProvider: sslChallengeType === 'dns' ? dnsProvider : undefined,
            dnsApiToken: sslChallengeType === 'dns' ? dnsApiToken : undefined,
            dnsHost: (sslChallengeType === 'dns' && dnsProvider === 'manual' && dnsManualMode === 'default') ? dnsHost : undefined,
            dnsAuthUrl: (sslChallengeType === 'dns' && dnsProvider === 'manual' && dnsManualMode === 'api') ? dnsAuthUrl : undefined,
            dnsCleanupUrl: (sslChallengeType === 'dns' && dnsProvider === 'manual' && dnsManualMode === 'api') ? dnsCleanupUrl : undefined,
            dnsAuthScript: (sslChallengeType === 'dns' && dnsProvider === 'manual' && dnsManualMode === 'script' && dnsAuthScript.trim() !== '#!/bin/sh\n# Use $CERTBOT_DOMAIN and $CERTBOT_VALIDATION\n') ? dnsAuthScript : undefined,
            dnsCleanupScript: (sslChallengeType === 'dns' && dnsProvider === 'manual' && dnsManualMode === 'script' && dnsCleanupScript.trim() !== '#!/bin/sh\n') ? dnsCleanupScript : undefined,
            rateLimit: rateLimitEnabled ? {
                enabled: true,
                rate: parseInt(rateLimitRate) || 10,
                period: rateLimitPeriod,
                burst: parseInt(rateLimitBurst) || 20,
                nodelay: rateLimitNodelay
            } : undefined
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
        <Modal
            onClose={onClose}
            title={initialHost ? 'Edit Proxy Host' : 'Add Proxy Host'}
            description="Configure Routing & Security"
            icon={<Globe size={24} />}
            maxWidth="max-w-lg"
            className="flex flex-col"
        >
            <form onSubmit={handleSubmit} className="mt-4 flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto px-1 custom-scrollbar space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Domain Name</label>
                            <input
                                required
                                type="text"
                                placeholder="e.g. app.example.com"
                                value={domain}
                                onChange={(e) => setDomain(e.target.value)}
                                className="w-full bg-white/5 border border-outline/20 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-all font-bold placeholder:font-normal"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Target URL</label>
                            <input
                                required
                                type="text"
                                placeholder="e.g. http://localhost:8080"
                                value={target}
                                onChange={(e) => setTarget(e.target.value)}
                                className="w-full bg-white/5 border border-outline/20 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-all font-mono font-bold placeholder:font-normal"
                            />
                        </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-outline/5">
                        <h3 className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Security & Protocol</h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* WebSocket Toggle */}
                            <label className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-outline/10 cursor-pointer hover:border-primary/30 transition-all group">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${websocketEnabled ? 'bg-primary/20 text-primary' : 'bg-white/5 text-on-surface-variant'}`}>
                                    <Activity size={18} className={websocketEnabled ? 'animate-pulse' : ''} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-on-surface">Websockets</div>
                                    <div className="text-[10px] text-on-surface-variant font-medium">Full duplex proxying</div>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={websocketEnabled}
                                    onChange={(e) => setWebsocketEnabled(e.target.checked)}
                                    className="w-5 h-5 rounded-lg border-outline/20 bg-white/5 checked:bg-primary accent-primary"
                                />
                            </label>

                            {/* SSL Toggle */}
                            <label className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-outline/10 cursor-pointer hover:border-green-500/30 transition-all group">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${sslEnabled ? 'bg-green-500/20 text-green-500' : 'bg-white/5 text-on-surface-variant'}`}>
                                    <Lock size={18} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-on-surface">SSL (HTTPS)</div>
                                    <div className="text-[10px] text-on-surface-variant font-medium">Secure traffic only</div>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={sslEnabled}
                                    onChange={(e) => setSslEnabled(e.target.checked)}
                                    className="w-5 h-5 rounded-lg border-outline/20 bg-white/5 checked:bg-green-500 accent-green-500"
                                />
                            </label>
                        </div>

                        {/* SSL Options - Only visible when SSL is enabled */}
                        {sslEnabled && (
                            <div className="p-5 rounded-3xl bg-green-500/5 border border-green-500/10 space-y-5 animate-in slide-in-from-top-4 duration-300">
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-green-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                                        <FileKey size={12} /> SSL Certificate Source
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={selectedCert}
                                            onChange={(e) => setSelectedCert(e.target.value)}
                                            className="w-full bg-white/5 border border-green-500/20 rounded-2xl px-4 py-3 appearance-none focus:outline-none focus:border-green-500 text-sm font-bold"
                                        >
                                            <option value="">Auto-generate (Let's Encrypt)</option>
                                            {certs.map(cert => (
                                                <option key={cert.id} value={`${cert.certPath}|${cert.keyPath}`}>
                                                    {cert.domain} ({cert.id})
                                                </option>
                                            ))}
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                                            <Plus size={14} className="rotate-45" />
                                        </div>
                                    </div>
                                </div>

                                {!selectedCert && (
                                    <div className="space-y-4 animate-in fade-in duration-300">
                                        <div className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black uppercase text-on-surface">Challenge Type</span>
                                                <span className="text-[9px] text-on-surface-variant font-medium">Use DNS for Wildcards</span>
                                            </div>
                                            <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                                                <button
                                                    type="button"
                                                    onClick={() => setSslChallengeType('http')}
                                                    className={`px-3 py-1 text-[10px] font-black uppercase rounded-lg transition-all ${sslChallengeType === 'http' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}
                                                >
                                                    HTTP-01
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setSslChallengeType('dns')}
                                                    className={`px-3 py-1 text-[10px] font-black uppercase rounded-lg transition-all ${sslChallengeType === 'dns' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}
                                                >
                                                    DNS-01
                                                </button>
                                            </div>
                                        </div>

                                        {sslChallengeType === 'dns' && (
                                            <div className="space-y-4 pt-1 animate-in slide-in-from-top-2">
                                                <div className="space-y-1.5">
                                                    <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">DNS Provider</label>
                                                    <select
                                                        value={dnsProvider}
                                                        onChange={(e) => setDnsProvider(e.target.value)}
                                                        className="w-full bg-black/20 border border-outline/20 rounded-2xl px-4 py-2.5 text-sm font-bold focus:outline-none"
                                                    >
                                                        <option value="cloudflare">Cloudflare</option>
                                                        <option value="digitalocean">DigitalOcean</option>
                                                        <option value="manual">Manual (DNS TXT)</option>
                                                    </select>
                                                </div>
                                                {dnsProvider === 'manual' ? (
                                                    <div className="space-y-4 animate-in slide-in-from-top-2">
                                                        <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                                                            <button
                                                                type="button"
                                                                onClick={() => setDnsManualMode('default')}
                                                                className={`flex-1 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${dnsManualMode === 'default' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant'}`}
                                                            >
                                                                Default
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setDnsManualMode('api')}
                                                                className={`flex-1 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${dnsManualMode === 'api' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant'}`}
                                                            >
                                                                Custom Hook
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setDnsManualMode('script')}
                                                                className={`flex-1 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${dnsManualMode === 'script' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant'}`}
                                                            >
                                                                Script
                                                            </button>
                                                        </div>

                                                        {dnsManualMode === 'default' && (
                                                            <div className="space-y-4 animate-in slide-in-from-top-2">
                                                                <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl mb-2">
                                                                    <p className="text-[10px] text-primary/80 font-medium leading-relaxed">
                                                                        Uses default GET templates for
                                                                        <code className="bg-black/40 px-1 rounded mx-1">/add</code> and
                                                                        <code className="bg-black/40 px-1 rounded mx-1">/delete</code>.
                                                                    </p>
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">DNS API Host</label>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="e.g. https://dns.example.com"
                                                                        value={dnsHost}
                                                                        onChange={(e) => setDnsHost(e.target.value)}
                                                                        className="w-full bg-black/20 border border-outline/20 rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
                                                                    />
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">API Token</label>
                                                                    <input
                                                                        type="password"
                                                                        placeholder="Your API Token"
                                                                        value={dnsApiToken}
                                                                        onChange={(e) => setDnsApiToken(e.target.value)}
                                                                        className="w-full bg-black/20 border border-outline/20 rounded-2xl px-4 py-2.5 text-sm font-mono focus:outline-none"
                                                                    />
                                                                </div>
                                                            </div>
                                                        )}

                                                        {dnsManualMode === 'api' ? (
                                                            <>
                                                                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-2">
                                                                    <p className="text-[10px] text-amber-200 font-medium leading-relaxed">
                                                                        An HTTP POST will be sent with JSON:
                                                                        <code className="bg-black/40 px-1 rounded ml-1">{"{domain, validation, token}"}</code>
                                                                    </p>
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Auth Hook URL (POST)</label>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="https://api.example.com/dns/auth"
                                                                        value={dnsAuthUrl}
                                                                        onChange={(e) => setDnsAuthUrl(e.target.value)}
                                                                        className="w-full bg-black/20 border border-outline/20 rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
                                                                    />
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Cleanup Hook URL (POST)</label>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="https://api.example.com/dns/cleanup"
                                                                        value={dnsCleanupUrl}
                                                                        onChange={(e) => setDnsCleanupUrl(e.target.value)}
                                                                        className="w-full bg-black/20 border border-outline/20 rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
                                                                    />
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">API Token (Optional)</label>
                                                                    <input
                                                                        type="password"
                                                                        placeholder="Secret token for your API"
                                                                        value={dnsApiToken}
                                                                        onChange={(e) => setDnsApiToken(e.target.value)}
                                                                        className="w-full bg-black/20 border border-outline/20 rounded-2xl px-4 py-2.5 text-sm font-mono focus:outline-none"
                                                                    />
                                                                </div>
                                                            </>
                                                        ) : dnsManualMode === 'script' ? (
                                                            <div className="space-y-4 animate-in slide-in-from-top-2">
                                                                <div className="space-y-1.5">
                                                                    <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1 flex justify-between">
                                                                        <span>Auth Script (sh)</span>
                                                                        <span className="text-primary tracking-normal lowercase opacity-60">Uses $CERTBOT_DOMAIN, $CERTBOT_VALIDATION</span>
                                                                    </label>
                                                                    <div className="rounded-xl overflow-hidden border border-white/10 bg-black/40">
                                                                        <Editor
                                                                            height="150px"
                                                                            language="shell"
                                                                            theme="vs-dark"
                                                                            value={dnsAuthScript}
                                                                            onChange={(v) => setDnsAuthScript(v || '')}
                                                                            options={{
                                                                                minimap: { enabled: false },
                                                                                lineNumbers: 'on',
                                                                                scrollBeyondLastLine: false,
                                                                                fontSize: 10,
                                                                                fontFamily: 'monospace'
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Cleanup Script (Optional)</label>
                                                                    <div className="rounded-xl overflow-hidden border border-white/10 bg-black/40">
                                                                        <Editor
                                                                            height="100px"
                                                                            language="shell"
                                                                            theme="vs-dark"
                                                                            value={dnsCleanupScript}
                                                                            onChange={(v) => setDnsCleanupScript(v || '')}
                                                                            options={{
                                                                                minimap: { enabled: false },
                                                                                lineNumbers: 'on',
                                                                                scrollBeyondLastLine: false,
                                                                                fontSize: 10,
                                                                                fontFamily: 'monospace'
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                ) : (
                                                    <div className="space-y-1.5 animate-in slide-in-from-top-2">
                                                        <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">API Token / Secret</label>
                                                        <input
                                                            type="password"
                                                            placeholder={dnsProvider === 'cloudflare' ? 'Cloudflare API Token' : 'DigitalOcean Personal Access Token'}
                                                            value={dnsApiToken}
                                                            onChange={(e) => setDnsApiToken(e.target.value)}
                                                            className="w-full bg-black/20 border border-outline/20 rounded-2xl px-4 py-2.5 text-sm font-mono focus:outline-none"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={hstsEnabled}
                                        onChange={(e) => setHstsEnabled(e.target.checked)}
                                        className="w-4 h-4 rounded-md border-outline/20 bg-white/5 checked:bg-purple-500 accent-purple-500"
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold flex items-center gap-2">
                                            Enable HSTS
                                            <span className="text-[9px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">Strict Security</span>
                                        </span>
                                        <span className="text-[10px] text-on-surface-variant/60">Enforce HTTPS on browsers</span>
                                    </div>
                                </label>
                            </div>
                        )}
                    </div>

                    {/* Rate Limiting */}
                    <div className="pt-4 border-t border-outline/10">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <ShieldCheck size={16} className={rateLimitEnabled ? 'text-primary' : 'text-on-surface-variant/40'} />
                                <label className="block text-[11px] font-black text-on-surface-variant uppercase tracking-widest">Rate Limiting</label>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={rateLimitEnabled}
                                    onChange={(e) => setRateLimitEnabled(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                            </label>
                        </div>

                        {rateLimitEnabled && (
                            <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 space-y-4 animate-in slide-in-from-top-2 duration-200">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="block text-[9px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Rate</label>
                                        <div className="flex gap-1">
                                            <input
                                                type="number"
                                                value={rateLimitRate}
                                                onChange={(e) => setRateLimitRate(e.target.value)}
                                                className="w-full bg-black/20 border border-outline/20 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-primary"
                                                placeholder="10"
                                            />
                                            <select
                                                value={rateLimitPeriod}
                                                onChange={(e) => setRateLimitPeriod(e.target.value as 's' | 'm')}
                                                className="bg-black/20 border border-outline/20 rounded-xl px-2 py-2 text-[10px] font-bold focus:outline-none"
                                            >
                                                <option value="s">r/s</option>
                                                <option value="m">r/m</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="block text-[9px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Burst</label>
                                        <input
                                            type="number"
                                            value={rateLimitBurst}
                                            onChange={(e) => setRateLimitBurst(e.target.value)}
                                            className="w-full bg-black/20 border border-outline/20 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-primary"
                                            placeholder="20"
                                        />
                                    </div>
                                </div>
                                <label className="flex items-center gap-3 cursor-pointer group select-none">
                                    <input
                                        type="checkbox"
                                        checked={rateLimitNodelay}
                                        onChange={(e) => setRateLimitNodelay(e.target.checked)}
                                        className="w-4 h-4 rounded-md border-outline/20 bg-white/5 checked:bg-primary accent-primary"
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-[11px] font-bold">No Delay</span>
                                        <span className="text-[9px] text-on-surface-variant/60 font-medium">Process requests immediately within burst</span>
                                    </div>
                                </label>
                            </div>
                        )}
                    </div>

                    {/* IP Restrictions */}
                    <div className="pt-2 border-t border-outline/10">
                        <label className="block text-xs font-bold text-on-surface-variant uppercase mb-2 ml-1">IP Restrictions</label>
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                placeholder="IP or CIDR (e.g. 1.2.3.4)"
                                value={newIp}
                                onChange={(e) => setNewIp(e.target.value)}
                                className="flex-1 bg-white/5 border border-outline/20 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (newIp.trim()) {
                                            setAllowedIps([...allowedIps, newIp.trim()]);
                                            setNewIp('');
                                        }
                                    }
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    if (newIp.trim()) {
                                        setAllowedIps([...allowedIps, newIp.trim()]);
                                        setNewIp('');
                                    }
                                }}
                                className="bg-primary/20 text-primary p-2 rounded-xl hover:bg-primary/30 transition-all"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto no-scrollbar p-1">
                            {allowedIps.map(ip => (
                                <div key={ip} className="flex items-center gap-2 bg-surface border border-outline/20 px-2 py-1 rounded-lg text-[10px] font-mono group">
                                    <span>{ip}</span>
                                    <button
                                        type="button"
                                        onClick={() => setAllowedIps(allowedIps.filter(i => i !== ip))}
                                        className="text-on-surface-variant hover:text-red-500 transition-colors"
                                    >
                                        <Plus size={10} className="rotate-45" />
                                    </button>
                                </div>
                            ))}
                            {allowedIps.length === 0 && (
                                <span className="text-[10px] text-on-surface-variant italic">No restrictions (Public)</span>
                            )}
                        </div>
                    </div>

                    {/* Path Routes */}
                    <div className="pt-2 border-t border-outline/10">
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-xs font-bold text-on-surface-variant uppercase ml-1">Path Routes</label>
                            <button
                                type="button"
                                onClick={() => setIsPathModalOpen(true)}
                                className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                            >
                                <Plus size={12} />
                                Add Path
                            </button>
                        </div>
                        {paths.length > 0 ? (
                            <div className="space-y-2 max-h-32 overflow-y-auto no-scrollbar">
                                {paths.map(path => (
                                    <div key={path.id} className={`flex items-center justify-between bg-surface/40 border rounded-lg p-2 group ${path.enabled !== false ? 'border-outline/10' : 'border-red-500/20 opacity-60'}`}>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {path.name && (
                                                    <>
                                                        <span className="text-xs font-bold text-on-surface">{path.name}</span>
                                                        <span className="text-[10px] text-on-surface-variant">•</span>
                                                    </>
                                                )}
                                                <span className="text-xs font-mono font-bold text-primary">{path.path}</span>
                                                <span className="text-[10px] text-on-surface-variant">→</span>
                                                <span className="text-[10px] font-mono truncate text-on-surface-variant">{path.target}</span>
                                                {path.enabled === false && <span className="text-[8px] bg-red-500/10 text-red-500 px-1 py-0.5 rounded font-bold uppercase">DISABLED</span>}
                                                {path.stripPrefix && <span className="text-[8px] bg-orange-500/10 text-orange-500 px-1 py-0.5 rounded font-bold uppercase">STRIP</span>}
                                                {path.websocketEnabled && <span className="text-[8px] bg-blue-500/10 text-blue-500 px-1 py-0.5 rounded font-bold uppercase">WS</span>}
                                                {path.order !== undefined && path.order !== 0 && <span className="text-[8px] bg-purple-500/10 text-purple-500 px-1 py-0.5 rounded font-bold uppercase">ORDER: {path.order}</span>}
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingPath(path);
                                                    setIsPathModalOpen(true);
                                                }}
                                                className="p-1 text-on-surface-variant hover:text-blue-500 transition-colors"
                                                title="Edit"
                                            >
                                                <Pencil size={12} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPaths(paths.filter(p => p.id !== path.id))}
                                                className="p-1 text-on-surface-variant hover:text-red-500 transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <span className="text-[10px] text-on-surface-variant italic">No custom paths (default route: / → {target})</span>
                        )}
                    </div>

                </div>

                <div className="flex gap-2 pt-4 border-t border-outline/5 flex-shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-outline/20 hover:bg-white/5 text-sm font-bold transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 bg-primary text-on-primary px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all"
                    >
                        {initialHost ? 'Save Changes' : 'Create Host'}
                    </button>
                </div>
            </form>

            {/* Path Route Modal - rendered inside ProxyHostModal */}
            {isPathModalOpen && (
                <PathRouteModal
                    hostId={initialHost?.id || ''}
                    initialPath={editingPath || undefined}
                    onClose={() => {
                        setIsPathModalOpen(false);
                        setEditingPath(null);
                    }}
                    onSave={(path) => {
                        if (editingPath) {
                            setPaths(paths.map(p => p.id === path.id ? path : p));
                        } else {
                            setPaths([...paths, path]);
                        }
                        setIsPathModalOpen(false);
                        setEditingPath(null);
                    }}
                />
            )}
        </Modal>
    );
}

function PathRouteModal({
    onClose,
    onSave,
    initialPath,
    hostId
}: {
    onClose: () => void,
    onSave: (path: PathRoute) => void,
    initialPath?: PathRoute,
    hostId: string
}) {
    const [path, setPath] = useState(initialPath?.path || '/');
    const [target, setTarget] = useState(initialPath?.target || 'http://');
    const [websocketEnabled, setWebsocketEnabled] = useState(initialPath?.websocketEnabled || false);
    const [stripPrefix, setStripPrefix] = useState(initialPath?.stripPrefix || false);
    const [allowedIps, setAllowedIps] = useState<string[]>(initialPath?.allowedIps || []);
    const [newIp, setNewIp] = useState('');
    const [customConfig, setCustomConfig] = useState(initialPath?.customConfig || '');
    const [enabled, setEnabled] = useState(initialPath?.enabled !== undefined ? initialPath.enabled : true);
    const [name, setName] = useState(initialPath?.name || '');
    const [order, setOrder] = useState(initialPath?.order?.toString() || '0');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Rate Limiting State
    const [rateLimitEnabled, setRateLimitEnabled] = useState(initialPath?.rateLimit?.enabled || false);
    const [rateLimitRate, setRateLimitRate] = useState(initialPath?.rateLimit?.rate?.toString() || '10');
    const [rateLimitPeriod, setRateLimitPeriod] = useState<'s' | 'm'>(initialPath?.rateLimit?.period || 's');
    const [rateLimitBurst, setRateLimitBurst] = useState(initialPath?.rateLimit?.burst?.toString() || '20');
    const [rateLimitNodelay, setRateLimitNodelay] = useState(initialPath?.rateLimit?.nodelay ?? true);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const pathData: PathRoute = {
            id: initialPath?.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            path: path.startsWith('/') ? path : `/${path}`,
            target,
            websocketEnabled,
            stripPrefix,
            allowedIps: allowedIps.length > 0 ? allowedIps : undefined,
            customConfig: customConfig.trim() || undefined,
            enabled,
            name: name.trim() || undefined,
            order: parseInt(order) || 0,
            rateLimit: rateLimitEnabled ? {
                enabled: true,
                rate: parseInt(rateLimitRate) || 10,
                period: rateLimitPeriod,
                burst: parseInt(rateLimitBurst) || 20,
                nodelay: rateLimitNodelay
            } : undefined
        };

        await onSave(pathData);
        setIsSubmitting(false);
    };



    return (
        <Modal
            onClose={onClose}
            title={initialPath ? 'Edit Path Route' : 'Add Path Route'}
            description="Fine-grained routing rules"
            icon={<Network size={24} />}
            maxWidth="max-w-xl"
            className="flex flex-col"
        >
            <div className="flex-1 overflow-y-auto mt-4 px-1 custom-scrollbar">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Path Prefix</label>
                            <input
                                required
                                type="text"
                                placeholder="e.g. /api"
                                value={path}
                                onChange={(e) => setPath(e.target.value)}
                                className="w-full bg-white/5 border border-outline/20 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-all font-bold placeholder:font-normal"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Target Internal Address</label>
                            <input
                                required
                                type="text"
                                placeholder="e.g. http://127.0.0.1:3000"
                                value={target}
                                onChange={(e) => setTarget(e.target.value)}
                                className="w-full bg-white/5 border border-outline/20 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-all font-mono font-bold placeholder:font-normal"
                            />
                        </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 rounded-2xl bg-white/5 border border-outline/10 cursor-pointer hover:border-primary/30 transition-all group">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${stripPrefix ? 'bg-primary/20 text-primary' : 'bg-white/5 text-on-surface-variant'}`}>
                            <Activity size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-on-surface">Strip Prefix</div>
                            <div className="text-[10px] text-on-surface-variant font-medium">Remove path from target request</div>
                        </div>
                        <input
                            type="checkbox"
                            checked={stripPrefix}
                            onChange={(e) => setStripPrefix(e.target.checked)}
                            className="w-5 h-5 rounded-lg border-outline/20 bg-white/5 checked:bg-primary accent-primary"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Custom Nginx Config</label>
                        <textarea
                            value={customConfig}
                            onChange={(e) => setCustomConfig(e.target.value)}
                            placeholder="# e.g. proxy_set_header X-Custom yes;"
                            className="w-full bg-[#1e1e1e] border border-outline/20 rounded-2xl px-4 py-4 text-xs font-mono focus:outline-none focus:border-primary h-32 resize-none shadow-inner"
                        />
                    </div>

                    <div className="flex gap-3 pt-6 sticky bottom-0 bg-surface sm:bg-transparent -mx-6 px-6 sm:mx-0 sm:px-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-4 rounded-[22px] border border-outline/20 hover:bg-white/5 text-xs font-black uppercase tracking-widest transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 bg-primary text-on-primary py-4 rounded-[22px] font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20 disabled:opacity-50 active:scale-95 transition-all"
                        >
                            {initialPath ? 'Confirm Update' : 'Initialize Path'}
                        </button>
                    </div>
                </form>
            </div>
        </Modal>
    );

}

function DefaultBehaviorToggle() {
    const [config, setConfig] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        DockerClient.getProxySecuritySettings().then(setConfig);
    }, []);

    const handleToggle = async (return404: boolean) => {
        setLoading(true);
        try {
            const result = await DockerClient.updateProxyDefaultBehavior(return404);
            if (result.success) {
                toast.success('Default behavior updated');
                const newConfig = await DockerClient.getProxySecuritySettings();
                setConfig(newConfig);
            } else {
                toast.error(result.message || 'Failed to update behavior');
            }
        } catch (e) {
            toast.error('Failed to update behavior');
        } finally {
            setLoading(false);
        }
    };

    if (!config) return <div className="animate-pulse h-10 bg-surface/50 rounded-xl" />;

    return (
        <div className="flex flex-col gap-3">
            <div
                className={`p-4 rounded-xl border border-outline/10 transition-all cursor-pointer ${!config.proxyDefaultReturn404 ? 'bg-primary/10 border-primary/30 ring-1 ring-primary/30' : 'bg-surface/50 hover:bg-surface/80'}`}
                onClick={() => !loading && handleToggle(false)}
            >
                <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${!config.proxyDefaultReturn404 ? 'border-primary bg-primary text-white' : 'border-outline/30'}`}>
                        {!config.proxyDefaultReturn404 && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div>
                        <p className="font-semibold text-sm text-on-surface">Show Default Page</p>
                        <p className="text-xs text-on-surface-variant">Serve the "Welcome to Docker Manager" landing page</p>
                    </div>
                </div>
            </div>

            <div
                className={`p-4 rounded-xl border border-outline/10 transition-all cursor-pointer ${config.proxyDefaultReturn404 ? 'bg-primary/10 border-primary/30 ring-1 ring-primary/30' : 'bg-surface/50 hover:bg-surface/80'}`}
                onClick={() => !loading && handleToggle(true)}
            >
                <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${config.proxyDefaultReturn404 ? 'border-primary bg-primary text-white' : 'border-outline/30'}`}>
                        {config.proxyDefaultReturn404 && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div>
                        <p className="font-semibold text-sm text-on-surface">Return 404 Not Found</p>
                        <p className="text-xs text-on-surface-variant">Return a generic 404 error code for unmatched requests</p>
                    </div>
                </div>
            </div>

            {loading && <div className="text-xs text-center text-primary animate-pulse">Updating Nginx configuration...</div>}
        </div>
    );
}

function CertificateCard({ cert, hosts, onRenew }: { cert: SSLCertificate, hosts: ProxyHost[], onRenew: (id: string) => void }) {
    const isLetsEncrypt = cert.type === 'letsencrypt' || !cert.type;
    const expiresAt = cert.expiresAt ? new Date(cert.expiresAt * 1000) : null;
    const now = new Date();
    const daysUntilExpiry = expiresAt ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
    const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 30;
    const isExpired = daysUntilExpiry !== null && daysUntilExpiry <= 0;

    const [copiedPath, setCopiedPath] = useState<string | null>(null);

    const copyToClipboard = async (text: string, pathType: 'cert' | 'key') => {
        await navigator.clipboard.writeText(text);
        setCopiedPath(pathType);
        setTimeout(() => setCopiedPath(null), 2000);
    };

    return (
        <div className="bg-surface/50 border border-outline/10 rounded-xl p-2.5 relative overflow-hidden group hover:border-primary/20 transition-all">
            <div className="absolute top-0 right-0 p-2 opacity-5">
                <FileKey size={24} />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between mb-1.5 relative z-10">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shadow-inner shrink-0 ${isExpired ? 'bg-red-500/10 text-red-500' :
                        isExpiringSoon ? 'bg-orange-500/10 text-orange-500' :
                            'bg-green-500/10 text-green-500'
                        }`}>
                        <Lock size={12} />
                    </div>
                    <div className="overflow-hidden flex-1 min-w-0">
                        <h3 className="font-bold truncate text-[13px] pr-2">{cert.domain}</h3>
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            <span className={`text-[7px] font-black px-1 py-0.5 rounded uppercase ${isLetsEncrypt
                                ? 'bg-blue-500/10 text-blue-500'
                                : 'bg-purple-500/10 text-purple-500'
                                }`}>
                                {isLetsEncrypt ? 'LE' : 'Custom'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Status Badge */}
            <div className="mb-2 relative z-10">
                {isExpired ? (
                    <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/10 rounded px-1.5 py-0.5">
                        <AlertTriangle size={8} className="text-red-500" />
                        <span className="text-[8px] font-bold text-red-500 uppercase">Expired</span>
                    </div>
                ) : isExpiringSoon ? (
                    <div className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/10 rounded px-1.5 py-0.5">
                        <AlertTriangle size={8} className="text-orange-500" />
                        <span className="text-[8px] font-bold text-orange-500 uppercase">{daysUntilExpiry}d left</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/10 rounded px-1.5 py-0.5">
                        <CheckCircle2 size={8} className="text-green-500" />
                        <span className="text-[8px] font-bold text-green-500 uppercase">Valid</span>
                    </div>
                )}
            </div>

            {/* Issuer Info */}
            {cert.issuer && (
                <div className="mb-1.5 flex items-center gap-1 text-[8px] text-on-surface-variant/40 relative z-10">
                    <Building2 size={8} />
                    <span className="font-medium truncate">{cert.issuer}</span>
                </div>
            )}

            {/* Certificate Paths */}
            <div className="space-y-1 mb-2 relative z-10">
                {[
                    { label: 'CRT', path: cert.certPath, type: 'cert' as const },
                    { label: 'KEY', path: cert.keyPath, type: 'key' as const }
                ].map((item, idx) => (
                    <div key={idx} className="flex flex-col gap-0.5">
                        <div className="flex items-center justify-between px-1">
                            <span className="text-[7px] text-on-surface-variant/40 uppercase font-black">{item.label}</span>
                            <button
                                onClick={() => copyToClipboard(item.path, item.type)}
                                className="p-0.5 hover:bg-white/5 rounded transition-all"
                            >
                                {copiedPath === item.type ? (
                                    <CheckCircle2 size={8} className="text-green-500" />
                                ) : (
                                    <Copy size={8} className="text-on-surface-variant/30" />
                                )}
                            </button>
                        </div>
                        <div className="text-[8px] bg-black/5 p-1 rounded font-mono truncate border border-outline/5 text-on-surface-variant/60">
                            {item.path}
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer Actions */}
            <div className="pt-1.5 border-t border-outline/5 flex justify-between items-center relative z-10">
                {expiresAt && (
                    <div className="flex items-center gap-1 text-[8px] text-on-surface-variant/40">
                        <Calendar size={8} />
                        <span>{expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                )}
                {isLetsEncrypt && (
                    <button
                        className="text-[8px] font-bold text-primary hover:underline"
                        onClick={() => {
                            const host = hosts.find(h => h.domain === cert.domain);
                            if (host) onRenew(host.id);
                        }}
                    >
                        Renew
                    </button>
                )}
            </div>
        </div>
    );
}

function ProxyComposeModal({ onClose }: { onClose: () => void }) {
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        DockerClient.getProxyComposeConfig().then(data => {
            setContent(data);
            setIsLoading(false);
        });
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        const result = await DockerClient.updateProxyComposeConfig(content);
        if (result.success) {
            toast.success('Compose configuration updated');
            onClose();
        } else {
            toast.error(result.message || 'Failed to update configuration');
        }
        setIsSaving(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-surface border border-outline/20 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col h-[85vh] max-h-[900px] overflow-hidden">
                <div className="p-5 border-b border-outline/10 flex justify-between items-center bg-surface">
                    <div>
                        <h2 className="text-lg font-bold">Edit Proxy Compose</h2>
                        <p className="text-[10px] text-on-surface-variant uppercase font-bold">docker-compose.yml</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-all">
                        <Plus className="rotate-45" size={20} />
                    </button>
                </div>

                <div className="flex-1 relative bg-[#1e1e1e]">
                    {isLoading ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-surface z-10">
                            <div className="flex flex-col items-center gap-3">
                                <RefreshCw className="animate-spin text-primary" size={32} />
                                <span className="text-xs font-bold text-on-surface-variant animate-pulse lowercase tracking-widest">Loading Editor...</span>
                            </div>
                        </div>
                    ) : (
                        <Editor
                            height="100%"
                            defaultLanguage="yaml"
                            theme="vs-dark"
                            value={content}
                            onChange={(value) => setContent(value || '')}
                            options={{
                                minimap: { enabled: true },
                                fontSize: 13,
                                lineNumbers: 'on',
                                roundedSelection: true,
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                padding: { top: 20, bottom: 20 },
                                cursorStyle: 'block',
                                cursorBlinking: 'smooth',
                                smoothScrolling: true,
                                contextmenu: true,
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
                            }}
                        />
                    )}
                </div>

                <div className="p-4 border-t border-outline/10 flex gap-3 bg-surface">
                    <button
                        onClick={async () => {
                            if (confirm('Are you sure you want to reset the proxy configuration to defaults? This will overwrite your current changes.')) {
                                setIsLoading(true);
                                const result = await DockerClient.resetProxyComposeConfig();
                                if (result.success) {
                                    toast.success('Configuration reset to defaults');
                                    const data = await DockerClient.getProxyComposeConfig();
                                    setContent(data);
                                } else {
                                    toast.error(result.message || 'Failed to reset configuration');
                                }
                                setIsLoading(false);
                            }
                        }}
                        disabled={isSaving || isLoading}
                        className="mr-auto px-4 py-2 rounded-xl border border-red-500/20 text-red-500 hover:bg-red-500/10 text-sm font-bold transition-all flex items-center gap-2"
                    >
                        <RefreshCw size={14} />
                        Reset Defaults
                    </button>
                    <button
                        onClick={onClose}
                        className="px-6 py-2 rounded-xl border border-outline/20 hover:bg-white/5 text-sm font-bold text-on-surface transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || isLoading}
                        className="flex-1 bg-primary text-on-primary px-6 py-2 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 disabled:opacity-50 hover:brightness-110 active:scale-[0.98] transition-all"
                    >
                        {isSaving ? 'Saving...' : 'Save Configuration'}
                    </button>
                </div>
            </div>
        </div>
    );
}

