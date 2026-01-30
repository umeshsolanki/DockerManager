'use client';

import React, { useEffect, useState } from 'react';
import { Globe, Plus, Search, RefreshCw, Trash2, Power, Server, ExternalLink, FileKey, Pencil, Layers, Database, Lock, Network, Activity, ShieldCheck, Copy, CheckCircle2, Calendar, Building2, AlertTriangle } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { ProxyHost, PathRoute, SSLCertificate, DnsConfig } from '@/lib/types';
import { toast } from 'sonner';
import Editor from '@monaco-editor/react';
import { Modal } from '../ui/Modal';
import { DnsConfigModal } from '../modals/DnsConfigModal';
import { ProxyHostModal } from '../modals/ProxyHostModal';


export default function ProxyScreen() {
    const [hosts, setHosts] = useState<ProxyHost[]>([]);
    const [containerStatus, setContainerStatus] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isContainerActionLoading, setIsContainerActionLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingHost, setEditingHost] = useState<ProxyHost | null>(null);

    const [activeTab, setActiveTab] = useState<'domains' | 'container' | 'certs' | 'dns'>('domains');
    const [certs, setCerts] = useState<SSLCertificate[]>([]);
    const [dnsConfigs, setDnsConfigs] = useState<DnsConfig[]>([]);
    const [isAddDnsModalOpen, setIsAddDnsModalOpen] = useState(false);
    const [editingDnsConfig, setEditingDnsConfig] = useState<DnsConfig | null>(null);
    const [isComposeModalOpen, setIsComposeModalOpen] = useState(false);

    const fetchData = async () => {
        setIsLoading(true);
        const [hostsData, containerStatusData, certsData, dnsConfigsData] = await Promise.all([
            DockerClient.listProxyHosts(),
            DockerClient.getProxyContainerStatus(),
            DockerClient.listProxyCertificates(),
            DockerClient.listDnsConfigs()
        ]);
        setHosts(hostsData);
        setContainerStatus(containerStatusData);
        setCerts(certsData);
        setDnsConfigs(dnsConfigsData);
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

    const getRootDomain = (domain: string) => {
        if (!domain) return 'unknown';
        const parts = domain.split(/\s+/)[0].split('.');
        if (parts.length <= 2) return domain.split(/\s+/)[0];
        const lastTwo = parts.slice(-2).join('.');
        const commonSLDs = [
            'com.', 'co.', 'org.', 'net.', 'gov.', 'edu.', 'mil.', 'int.',
            'ac.', 'io.', 'me.', 'biz.', 'info.', 'name.', 'pro.'
        ];
        const isDoubleTLD = commonSLDs.some(sld => lastTwo.startsWith(sld));
        if (isDoubleTLD && parts.length >= 3) {
            return parts.slice(-3).join('.');
        }
        return parts.slice(-2).join('.');
    };

    const groupedHosts = React.useMemo(() => {
        const groups: Record<string, ProxyHost[]> = {};
        filteredHosts.forEach(host => {
            const root = getRootDomain(host.domain);
            if (!groups[root]) groups[root] = [];
            groups[root].push(host);
        });
        return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    }, [filteredHosts]);

    const tabs = [
        { id: 'domains', label: 'Domain Hosts', icon: <Globe size={18} /> },
        { id: 'dns', label: 'DNS Configs', icon: <Network size={18} /> },
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
                                className="w-full bg-surface/50 border border-outline/10 rounded-xl py-2.5 pl-10 pr-4 text-xs text-on-surface focus:outline-none focus:border-primary/50 transition-all font-medium placeholder:font-normal"
                            />
                        </div>

                        <div className="space-y-8">
                            {groupedHosts.map(([rootDomain, domainHosts]) => (
                                <div key={rootDomain} className="space-y-3">
                                    <div className="flex items-center gap-3 px-1">
                                        <div className="h-px flex-1 bg-outline/10" />
                                        <div className="flex items-center gap-2">
                                            <Building2 size={12} className="text-on-surface-variant/40" />
                                            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60">
                                                {rootDomain}
                                            </h2>
                                            <span className="bg-surface border border-outline/10 px-2 py-0.5 rounded-full text-[9px] font-bold text-on-surface-variant/40">
                                                {domainHosts.length}
                                            </span>
                                        </div>
                                        <div className="h-px flex-1 bg-outline/10" />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {domainHosts.map(host => (
                                            <div key={host.id} className="bg-surface/60 backdrop-blur-md border border-outline/10 rounded-2xl p-0 hover:border-primary/20 hover:shadow-lg transition-all group relative overflow-hidden flex flex-col">
                                                <div className={`absolute top-0 left-0 w-1 h-full ${host.enabled ? 'bg-green-500' : 'bg-on-surface-variant/20'}`} />

                                                <div className="p-4 flex-1">
                                                    <div className="flex items-start justify-between gap-3 mb-3">
                                                        <div className="flex gap-3 min-w-0">
                                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 duration-300 shadow-inner ${host.enabled ? 'bg-primary/10 text-primary' : 'bg-on-surface/5 text-on-surface-variant'}`}>
                                                                <Globe size={18} />
                                                            </div>
                                                            <div className="min-w-0 flex flex-col justify-center">
                                                                <h3 className="text-sm font-black truncate tracking-tight text-on-surface">{host.domain}</h3>
                                                                <div className="flex items-center gap-1.5 text-on-surface-variant/70 text-[10px] font-mono truncate mt-0.5">
                                                                    <span className="text-primary/60">→</span>
                                                                    <span className="truncate hover:text-primary transition-colors cursor-pointer" title={host.target}>{host.target}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col gap-1 items-end">
                                                            {host.ssl && <span className="text-[9px] text-green-500 font-bold bg-green-500/10 px-1.5 py-0.5 rounded-md flex items-center gap-1"><Lock size={8} /> SSL</span>}
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-wrap gap-1.5 mb-4">
                                                        {!host.enabled && <span className="text-[9px] bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider border border-red-500/10">Disabled</span>}
                                                        {host.hstsEnabled && <span className="text-[9px] bg-purple-500/10 text-purple-500 px-1.5 py-0.5 rounded-md font-bold uppercase border border-purple-500/10">HSTS</span>}
                                                        {host.websocketEnabled && <span className="text-[9px] bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded-md font-bold uppercase border border-blue-500/10">WS</span>}
                                                        {host.allowedIps && host.allowedIps.length > 0 && (
                                                            <span className="text-[9px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded-md font-bold uppercase flex items-center gap-1 border border-amber-500/10">
                                                                <ShieldCheck size={10} /> {host.allowedIps.length} IPS
                                                            </span>
                                                        )}
                                                        {host.paths && host.paths.length > 0 && (
                                                            <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase flex items-center gap-1 border ${host.paths.filter(p => p.enabled !== false).length === host.paths.length
                                                                ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/10'
                                                                : 'bg-orange-500/10 text-orange-500 border-orange-500/10'
                                                                }`}>
                                                                <Layers size={10} />
                                                                {host.paths.filter(p => p.enabled !== false).length} Rules
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between p-2 bg-black/20 border-t border-outline/5 mt-auto mb-0">
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => setEditingHost(host)}
                                                            className="p-1.5 text-on-surface-variant hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all active:scale-95"
                                                            title="Edit"
                                                        >
                                                            <Pencil size={14} />
                                                        </button>
                                                        {!host.ssl && host.enabled && (
                                                            <button
                                                                onClick={() => handleRequestSSL(host.id)}
                                                                className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-all active:scale-95"
                                                                title="Request SSL"
                                                            >
                                                                <ShieldCheck size={14} />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleDelete(host.id)}
                                                            className="p-1.5 text-on-surface-variant hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all active:scale-95"
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>

                                                    <button
                                                        onClick={() => handleToggle(host.id)}
                                                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all font-bold text-[10px] active:scale-95 ${host.enabled
                                                            ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                                                            : 'bg-on-surface/5 text-on-surface-variant hover:bg-on-surface/10'}`}
                                                    >
                                                        <Power size={10} className={host.enabled ? 'text-green-500' : ''} />
                                                        <span>{host.enabled ? 'ON' : 'OFF'}</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {hosts.length === 0 && (
                            <div className="flex flex-col items-center justify-center text-on-surface-variant py-20 opacity-30">
                                <Globe size={80} className="mb-4" />
                                <p className="italic text-xl">No proxy hosts configured</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'container' && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Compact Container Management Card */}
                        <div className="bg-surface/40 backdrop-blur-sm border border-outline/10 rounded-2xl p-4 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none">
                                <Server size={100} />
                            </div>

                            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 relative z-10">
                                <div className="flex items-center gap-3 w-full md:w-auto">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-inner border border-white/10 relative shrink-0">
                                        <Server size={20} className="text-primary" />
                                        {containerStatus?.running && (
                                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-surface animate-pulse" />
                                        )}
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-on-surface">Proxy Engine</h2>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-medium text-on-surface-variant">OpenResty Gateway</span>
                                            <span className="w-1 h-1 rounded-full bg-on-surface-variant/30" />
                                            <span className={`text-[10px] font-bold uppercase tracking-wider ${containerStatus?.running ? 'text-green-500' : 'text-on-surface-variant'}`}>
                                                {containerStatus?.running ? 'Active' : 'Stopped'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
                                    {[
                                        { label: 'Start', icon: <Activity size={14} />, action: () => DockerClient.startProxyContainer(), color: 'bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/10', disabled: !containerStatus?.exists || containerStatus?.running },
                                        { label: 'Stop', icon: <Power size={14} />, action: () => DockerClient.stopProxyContainer(), color: 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/10', disabled: !containerStatus?.running },
                                        { label: 'Restart', icon: <RefreshCw size={14} />, action: () => DockerClient.restartProxyContainer(), color: 'bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 border-orange-500/10', disabled: !containerStatus?.running },
                                    ].map((btn, i) => (
                                        <button
                                            key={i}
                                            onClick={async () => {
                                                setIsContainerActionLoading(true);
                                                const result = await btn.action();
                                                if (result.success) {
                                                    toast.success(result.message || 'Success');
                                                    setTimeout(fetchContainerStatus, 1000);
                                                } else {
                                                    toast.error(result.message || 'Failed');
                                                }
                                                setIsContainerActionLoading(false);
                                            }}
                                            disabled={isContainerActionLoading || btn.disabled}
                                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${btn.color}`}
                                        >
                                            {btn.icon}
                                            {btn.label}
                                        </button>
                                    ))}

                                    <button
                                        onClick={() => setIsComposeModalOpen(true)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline/10 bg-surface text-on-surface-variant hover:text-primary hover:bg-white/5 text-[10px] font-bold uppercase tracking-wider transition-all"
                                    >
                                        <Pencil size={14} />
                                        Config
                                    </button>
                                </div>
                            </div>

                            {containerStatus && (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                                    {[
                                        { label: 'Status', value: containerStatus.exists ? 'Installed' : 'Missing', color: containerStatus.exists ? 'text-green-500' : 'text-red-500', icon: <Layers size={12} /> },
                                        { label: 'Image', value: containerStatus.imageExists ? 'Ready' : 'Pull Needed', color: containerStatus.imageExists ? 'text-green-500' : 'text-orange-500', icon: <Database size={12} /> },
                                        { label: 'State', value: containerStatus.status || 'Unknown', color: 'text-primary', icon: <Activity size={12} /> },
                                        { label: 'ID', value: containerStatus.containerId?.substring(0, 8) || '-', color: 'text-on-surface-variant', icon: <FileKey size={12} /> }
                                    ].map((stat, i) => (
                                        <div key={i} className="bg-black/20 rounded-xl p-2.5 border border-white/5 flex items-center justify-between group">
                                            <div className="flex items-center gap-2">
                                                <div className="text-on-surface-variant/50">{stat.icon}</div>
                                                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{stat.label}</span>
                                            </div>
                                            <span className={`text-[10px] font-bold font-mono ${stat.color}`}>{stat.value}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex gap-2">
                                <button
                                    onClick={async () => {
                                        setIsContainerActionLoading(true);
                                        const res = await DockerClient.ensureProxyContainer();
                                        if (res.success) {
                                            toast.success('Synced');
                                            setTimeout(fetchContainerStatus, 1500);
                                        } else {
                                            toast.error(res.message);
                                        }
                                        setIsContainerActionLoading(false);
                                    }}
                                    disabled={isContainerActionLoading}
                                    className="w-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                                >
                                    <Activity size={14} />
                                    Full Sync / Install
                                </button>
                            </div>
                        </div>

                        {/* Configuration & Networking Compact */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            <div className="bg-surface/40 border border-outline/10 rounded-2xl p-4 shadow-sm flex flex-col justify-center">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-sm font-bold flex items-center gap-2 text-on-surface">
                                        <ShieldCheck className="text-green-500" size={16} />
                                        <span>Default Route</span>
                                    </h3>
                                    <span className="text-[10px] text-on-surface-variant bg-white/5 px-2 py-0.5 rounded-full">fallback behavior</span>
                                </div>
                                <div className="scale-95 origin-top-left w-full">
                                    <DefaultBehaviorToggle />
                                </div>
                            </div>

                            <div className="bg-surface/40 border border-outline/10 rounded-2xl p-4 shadow-sm">
                                <h3 className="text-sm font-bold mb-3 flex items-center gap-2 text-on-surface">
                                    <Network className="text-primary" size={16} />
                                    <span>Ports & Storage</span>
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-2.5 bg-black/20 rounded-xl border border-white/5">
                                        <span className="block text-[9px] font-black text-on-surface-variant uppercase tracking-wider mb-1">Public Ports</span>
                                        <div className="flex gap-1.5">
                                            <span className="text-[10px] font-mono font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded">80</span>
                                            <span className="text-[10px] font-mono font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded">443</span>
                                        </div>
                                    </div>
                                    <div className="p-2.5 bg-black/20 rounded-xl border border-white/5">
                                        <span className="block text-[9px] font-black text-on-surface-variant uppercase tracking-wider mb-1">Data Vol</span>
                                        <span className="text-[10px] font-mono font-bold text-on-surface truncate block" title="data/nginx">data/nginx</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'dns' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-lg font-bold">DNS Challenge Configurations</h2>
                                <p className="text-xs text-on-surface-variant">Reusable DNS configs for SSL certificates</p>
                            </div>
                            <button
                                onClick={() => setIsAddDnsModalOpen(true)}
                                className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-xl hover:opacity-90 transition-all text-sm font-bold"
                            >
                                <Plus size={16} />
                                <span>Add Config</span>
                            </button>
                        </div>

                        {dnsConfigs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center text-on-surface-variant py-16 opacity-30">
                                <Network size={60} className="mb-3" />
                                <p className="italic text-base mb-1">No DNS configurations</p>
                                <p className="text-sm">Create a config to use with DNS-01 SSL challenges</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {dnsConfigs.map(config => {
                                    const usedBy = hosts.filter(h => h.dnsConfigId === config.id);
                                    return (
                                        <div key={config.id} className="bg-surface-variant/30 rounded-2xl border border-outline/5 p-4 hover:border-primary/20 transition-all">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                                        <Network size={20} />
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-sm">{config.name}</h3>
                                                        <span className="text-[10px] text-on-surface-variant uppercase tracking-wider">{config.provider}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setEditingDnsConfig(config)}
                                                        className="p-2 hover:bg-white/5 rounded-lg transition-all"
                                                    >
                                                        <Pencil size={14} className="text-on-surface-variant" />
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            if (confirm('Delete this DNS config?')) {
                                                                const result = await DockerClient.deleteDnsConfig(config.id);
                                                                if (result.success) {
                                                                    toast.success('DNS config deleted');
                                                                    fetchData();
                                                                } else {
                                                                    toast.error(result.message || 'Failed to delete');
                                                                }
                                                            }
                                                        }}
                                                        className="p-2 hover:bg-error/10 rounded-lg transition-all"
                                                    >
                                                        <Trash2 size={14} className="text-error" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`text-[8px] font-black px-2 py-1 rounded-full uppercase ${config.provider === 'cloudflare' ? 'bg-orange-500/10 text-orange-500' :
                                                    config.provider === 'digitalocean' ? 'bg-blue-500/10 text-blue-500' :
                                                        'bg-purple-500/10 text-purple-500'
                                                    }`}>
                                                    {config.provider === 'manual' ? (config.authScript ? 'Script' : config.dnsHost ? 'Default API' : 'HTTP Hook') : config.provider}
                                                </span>
                                                {usedBy.length > 0 && (
                                                    <span className="text-[8px] font-black px-2 py-1 rounded-full bg-green-500/10 text-green-500 uppercase">
                                                        {usedBy.length} host{usedBy.length > 1 ? 's' : ''}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
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

            {isAddDnsModalOpen && (
                <DnsConfigModal
                    onClose={() => setIsAddDnsModalOpen(false)}
                    onSaved={() => { setIsAddDnsModalOpen(false); fetchData(); }}
                />
            )}

            {editingDnsConfig && (
                <DnsConfigModal
                    initialConfig={editingDnsConfig}
                    onClose={() => setEditingDnsConfig(null)}
                    onSaved={() => { setEditingDnsConfig(null); fetchData(); }}
                />
            )}
        </div>
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



