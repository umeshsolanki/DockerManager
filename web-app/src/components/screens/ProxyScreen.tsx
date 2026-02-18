'use client';

import React, { useEffect, useState } from 'react';
import { Globe, Plus, Search, RefreshCw, Trash2, Power, Server, ExternalLink, FileKey, Pencil, Layers, Database, Lock, Network, Activity, ShieldCheck, Copy, CheckCircle2, Calendar, Building2, AlertTriangle, FolderCode, Construction, Zap, FileText } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { ProxyHost, PathRoute, SSLCertificate, DnsConfig, CustomPage } from '@/lib/types';
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

    const [activeTab, setActiveTab] = useState<'domains' | 'container' | 'certs' | 'dns' | 'pages'>('domains');
    const [certs, setCerts] = useState<SSLCertificate[]>([]);
    const [dnsConfigs, setDnsConfigs] = useState<DnsConfig[]>([]);
    const [isAddDnsModalOpen, setIsAddDnsModalOpen] = useState(false);
    const [editingDnsConfig, setEditingDnsConfig] = useState<DnsConfig | null>(null);
    const [isComposeModalOpen, setIsComposeModalOpen] = useState(false);
    const [customPages, setCustomPages] = useState<CustomPage[]>([]);
    const [isAddPageModalOpen, setIsAddPageModalOpen] = useState(false);
    const [editingPage, setEditingPage] = useState<CustomPage | null>(null);

    const fetchData = async () => {
        setIsLoading(true);
        const [hostsData, containerStatusData, certsData, dnsConfigsData, customPagesData] = await Promise.all([
            DockerClient.listProxyHosts(),
            DockerClient.getProxyContainerStatus(),
            DockerClient.listProxyCertificates(),
            DockerClient.listDnsConfigs(),
            DockerClient.listCustomPages()
        ]);
        setHosts(hostsData);
        setContainerStatus(containerStatusData);
        setCerts(certsData);
        setDnsConfigs(dnsConfigsData);
        setCustomPages(customPagesData);
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
        { id: 'pages', label: 'Custom Pages', icon: <Construction size={18} /> },
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
                {(activeTab === 'domains' || activeTab === 'pages') && (
                    <button
                        onClick={() => activeTab === 'domains' ? setIsAddModalOpen(true) : setIsAddPageModalOpen(true)}
                        className="flex items-center justify-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-2xl hover:opacity-90 transition-all shadow-lg active:scale-95 text-sm font-bold"
                    >
                        <Plus size={18} />
                        <span>{activeTab === 'domains' ? 'Add Host' : 'Create Page'}</span>
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
                        <div className="relative mb-6">
                            <div className="absolute inset-0 bg-primary/20 blur-3xl opacity-10 rounded-full pointer-events-none" />
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={18} />
                            <input
                                type="text"
                                placeholder="Search domains (e.g., app.example.com) or targets..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-surface/30 backdrop-blur-md border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all font-medium placeholder:text-on-surface-variant/30 shadow-inner"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5 pb-20">
                            {filteredHosts.map(host => (
                                <div key={host.id} className="group relative bg-[#0a0a0a]/40 backdrop-blur-xl border border-white/5 rounded-[24px] p-5 hover:border-primary/20 transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/5 flex flex-col h-full overflow-hidden">
                                    {/* Ambient Background Gradient */}
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none transition-opacity opacity-50 group-hover:opacity-100" />

                                    {/* Header: Domain & Status */}
                                    <div className="flex items-start justify-between mb-4 relative z-10">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner shrink-0 transition-all duration-300 ${host.enabled
                                                ? 'bg-gradient-to-br from-primary/20 to-primary/5 text-primary border border-primary/10 group-hover:scale-110'
                                                : 'bg-white/5 text-on-surface-variant border border-white/5 grayscale'}`}>
                                                {host.isStatic ? <FolderCode size={20} className={host.enabled ? "animate-pulse-slow" : ""} /> : <Globe size={20} className={host.enabled ? "animate-pulse-slow" : ""} />}
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-base font-bold truncate tracking-tight text-on-surface group-hover:text-primary transition-colors">{host.domain}</h3>
                                                <div className="flex items-center gap-1.5 mt-1">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${host.enabled ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`} />
                                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${host.enabled ? 'text-green-500' : 'text-red-500/70'}`}>
                                                        {host.enabled ? 'Active' : 'Disabled'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-1 items-end">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setEditingHost(host); }}
                                                className="p-2 text-on-surface-variant/50 hover:text-on-surface hover:bg-white/10 rounded-xl transition-all"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Middle: Target Flow */}
                                    <div className="relative z-10 bg-black/20 rounded-xl p-3 border border-white/5 mb-4 group-hover:border-white/10 transition-colors">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{host.isStatic ? "Static Path" : "Proxy Target"}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs font-mono text-on-surface overflow-hidden">
                                            <Server size={12} className="text-primary shrink-0" />
                                            <span className="truncate opacity-80" title={host.target}>{host.target}</span>
                                        </div>
                                    </div>

                                    {/* Badges */}
                                    <div className="flex flex-wrap gap-1.5 mb-6 relative z-10 flex-1 content-start">
                                        {host.isStatic && (<span className="inline-flex items-center gap-1 text-[9px] bg-amber-500/10 text-amber-500 px-2 py-1 rounded-lg font-bold uppercase border border-amber-500/10 shadow-[0_0_10px_rgba(245,158,11,0.1)]"><FolderCode size={8} /> Static Content</span>)} {host.ssl && (
                                            <span className="inline-flex items-center gap-1 text-[9px] bg-green-500/10 text-green-500 px-2 py-1 rounded-lg font-bold uppercase border border-green-500/10 shadow-[0_0_10px_rgba(34,197,94,0.1)]">
                                                <Lock size={8} /> SSL Secured
                                            </span>
                                        )}
                                        {host.hstsEnabled && (
                                            <span className="inline-flex items-center gap-1 text-[9px] bg-purple-500/10 text-purple-500 px-2 py-1 rounded-lg font-bold uppercase border border-purple-500/10">
                                                <ShieldCheck size={8} /> HSTS
                                            </span>
                                        )}
                                        {host.websocketEnabled && (
                                            <span className="inline-flex items-center gap-1 text-[9px] bg-blue-500/10 text-blue-500 px-2 py-1 rounded-lg font-bold uppercase border border-blue-500/10">
                                                <Activity size={8} /> WS
                                            </span>
                                        )}
                                        {host.allowedIps && host.allowedIps.length > 0 && (
                                            <span className="inline-flex items-center gap-1 text-[9px] bg-amber-500/10 text-amber-500 px-2 py-1 rounded-lg font-bold uppercase border border-amber-500/10">
                                                <ShieldCheck size={8} /> {host.allowedIps.length} ACL Rules
                                            </span>
                                        )}
                                        {host.paths && host.paths.length > 0 && (
                                            <span className="inline-flex items-center gap-1 text-[9px] bg-indigo-500/10 text-indigo-500 px-2 py-1 rounded-lg font-bold uppercase border border-indigo-500/10">
                                                <Layers size={8} /> {host.paths.length} Routes
                                            </span>
                                        )}
                                    </div>

                                    {/* Footer Actions */}
                                    <div className="flex items-center justify-between pt-3 border-t border-white/5 relative z-10 mt-auto">
                                        <div className="flex gap-2">
                                            {!host.ssl && host.enabled && (
                                                <button
                                                    onClick={() => handleRequestSSL(host.id)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-bold transition-all"
                                                >
                                                    <Lock size={10} /> Get SSL
                                                </button>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleDelete(host.id)}
                                                className="p-2 text-on-surface-variant/50 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                                title="Delete Host"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleToggle(host.id)}
                                                className={`w-10 h-6 rounded-full p-1 transition-colors duration-300 relative ${host.enabled ? 'bg-green-500' : 'bg-white/10'}`}
                                            >
                                                <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-300 ${host.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
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
                {activeTab === 'pages' && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pb-20">
                            {customPages.map(page => (
                                <div key={page.id} className="group relative bg-[#0a0a0a]/40 backdrop-blur-xl border border-white/5 rounded-[24px] p-6 hover:border-primary/20 transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/5 flex flex-col h-full overflow-hidden">
                                    {/* Ambient Background Gradient */}
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none transition-opacity opacity-50 group-hover:opacity-100" />

                                    <div className="flex items-start justify-between mb-4 relative z-10">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                                                <Construction size={24} />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-on-surface group-hover:text-primary transition-colors">{page.title}</h3>
                                                <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider mt-1">Created {new Date(page.createdAt).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => setEditingPage(page)}
                                                className="p-2 text-on-surface-variant/50 hover:text-on-surface hover:bg-white/10 rounded-xl transition-all"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (confirm('Delete this custom page?')) {
                                                        const success = await DockerClient.deleteCustomPage(page.id);
                                                        if (success) {
                                                            toast.success('Page deleted');
                                                            fetchData();
                                                        }
                                                    }
                                                }}
                                                className="p-2 text-on-surface-variant/50 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="bg-black/20 rounded-2xl p-4 border border-white/5 mb-4 max-h-40 overflow-hidden relative z-10 group-hover:border-white/10 transition-colors">
                                        <div className="text-[10px] font-mono text-on-surface-variant whitespace-pre-wrap opacity-60">
                                            {page.content}
                                        </div>
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                                    </div>

                                    <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5 relative z-10">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] font-black px-2 py-1 rounded-lg bg-primary/10 text-primary uppercase tracking-widest border border-primary/10">HTML5</span>
                                            <span className="text-[9px] font-black px-2 py-1 rounded-lg bg-white/5 text-on-surface-variant uppercase tracking-widest border border-white/5">ID: {page.id.substring(0, 8)}</span>
                                        </div>
                                        {hosts.some(h => h.underConstruction && h.underConstructionPageId === page.id) && (
                                            <span className="text-[9px] font-black text-green-500 uppercase flex items-center gap-1">
                                                <CheckCircle2 size={10} /> In Use
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {customPages.length === 0 && (
                            <div className="flex flex-col items-center justify-center text-on-surface-variant py-20 opacity-30">
                                <Construction size={80} className="mb-4" />
                                <p className="italic text-xl">No custom pages created</p>
                                <p className="text-sm mt-2">Create a page to use for site maintenance</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'container' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
                        {/* Status Hero */}
                        <div className="relative bg-[#0a0a0a]/60 backdrop-blur-xl border border-white/5 rounded-3xl p-6 overflow-hidden">
                            <div className={`absolute top-0 right-0 w-64 h-64 blur-[100px] rounded-full pointer-events-none transition-colors duration-500 opacity-20 ${containerStatus?.running ? 'bg-green-500' : 'bg-red-500'}`} />
                            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                                <div className="flex items-center gap-5">
                                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-500 ${containerStatus?.running
                                        ? 'bg-green-500/10 text-green-500 border border-green-500/20 shadow-green-500/10'
                                        : 'bg-red-500/10 text-red-500 border border-red-500/20 shadow-red-500/10'}`}>
                                        <Server size={32} />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">Proxy Engine Status</h2>
                                        <div className="flex items-center gap-2 mt-1">
                                            <div className={`w-2 h-2 rounded-full ${containerStatus?.running ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                                            <span className={`text-sm font-medium ${containerStatus?.running ? 'text-green-500' : 'text-red-500'}`}>
                                                {containerStatus?.running ? 'System Operational' : 'System Stopped'}
                                            </span>
                                            <span className="text-on-surface-variant/30 mx-2">•</span>
                                            <span className="text-xs font-mono text-on-surface-variant">OpenResty Gateway</span>
                                        </div>
                                    </div>
                                </div>

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
                                        className="h-10 px-4 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                                    >
                                        <Activity size={14} />
                                        Force Sync
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Power Controls & Stats Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Controls */}
                            <div className="md:col-span-1 bg-surface/30 backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col justify-center gap-3">
                                <h3 className="text-xs font-black text-on-surface-variant uppercase tracking-wider mb-1">Power Controls</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { label: 'Start', icon: <Activity size={16} />, action: () => DockerClient.startProxyContainer(), color: 'hover:bg-green-500/20 hover:text-green-500 hover:border-green-500/30', disabled: !containerStatus?.exists || containerStatus?.running },
                                        { label: 'Stop', icon: <Power size={16} />, action: () => DockerClient.stopProxyContainer(), color: 'hover:bg-red-500/20 hover:text-red-500 hover:border-red-500/30', disabled: !containerStatus?.running },
                                        { label: 'Restart', icon: <RefreshCw size={16} />, action: () => DockerClient.restartProxyContainer(), color: 'hover:bg-orange-500/20 hover:text-orange-500 hover:border-orange-500/30', disabled: !containerStatus?.running },
                                        { label: 'Config', icon: <Pencil size={16} />, action: () => { setIsComposeModalOpen(true); return { success: true }; }, color: 'hover:bg-blue-500/20 hover:text-blue-500 hover:border-blue-500/30', disabled: false },
                                    ].map((btn, i) => (
                                        <button
                                            key={i}
                                            onClick={async () => {
                                                if (btn.label !== 'Config') setIsContainerActionLoading(true);
                                                const result = await btn.action();
                                                if (result?.success) {
                                                    if (btn.label !== 'Config') {
                                                        toast.success((result as any).message || 'Success');
                                                        setTimeout(fetchContainerStatus, 1000);
                                                    }
                                                } else {
                                                    if (result) toast.error((result as any).message || 'Failed');
                                                }
                                                setIsContainerActionLoading(false);
                                            }}
                                            disabled={isContainerActionLoading || btn.disabled}
                                            className={`h-12 flex flex-col items-center justify-center gap-1 rounded-xl bg-black/20 border border-white/5 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${btn.color}`}
                                        >
                                            {btn.icon}
                                            <span className="text-[10px] font-bold uppercase">{btn.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                    { label: 'Installation', value: containerStatus?.exists ? 'INSTALLED' : 'MISSING', color: containerStatus?.exists ? 'text-green-500' : 'text-red-500', icon: <Layers size={14} />, bg: containerStatus?.exists ? 'bg-green-500/5' : 'bg-red-500/5' },
                                    { label: 'Docker Image', value: containerStatus?.imageExists ? 'AVAILABLE' : 'PULLING', color: containerStatus?.imageExists ? 'text-blue-500' : 'text-orange-500', icon: <Database size={14} />, bg: containerStatus?.imageExists ? 'bg-blue-500/5' : 'bg-orange-500/5' },
                                    { label: 'Engine State', value: containerStatus?.status || 'UNKNOWN', color: 'text-purple-500', icon: <Activity size={14} />, bg: 'bg-purple-500/5' },
                                    { label: 'Instance ID', value: containerStatus?.containerId?.substring(0, 8) || 'N/A', color: 'text-on-surface', icon: <FileKey size={14} />, bg: 'bg-white/5' }
                                ].map((stat, i) => (
                                    <div key={i} className={`rounded-2xl p-4 border border-white/5 flex flex-col justify-between ${stat.bg}`}>
                                        <div className="flex items-center justify-between mb-2 opacity-50">
                                            {stat.icon}
                                        </div>
                                        <div>
                                            <div className={`text-xs font-black tracking-widest truncate ${stat.color}`}>{stat.value}</div>
                                            <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mt-1">{stat.label}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Advanced Config Row */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="bg-surface/30 backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col justify-center hover:border-primary/20 transition-all">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                                        <ShieldCheck size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-on-surface">Fallback Routing Strategy</h3>
                                        <p className="text-xs text-on-surface-variant">Determine behavior when no host matches</p>
                                    </div>
                                </div>
                                <div className="scale-100 origin-top-left w-full">
                                    <DefaultBehaviorToggle />
                                </div>
                            </div>

                            <div className="bg-surface/30 backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col justify-center hover:border-primary/20 transition-all">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                                        <FileText size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-on-surface">Proxy Logging</h3>
                                        <p className="text-xs text-on-surface-variant">Destination, format, and buffering</p>
                                    </div>
                                </div>
                                <div className="scale-100 origin-top-left w-full">
                                    <LoggingConfigCard />
                                </div>
                            </div>

                            <div className="bg-surface/30 backdrop-blur-md border border-white/5 rounded-2xl p-5 hover:border-primary/20 transition-all">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                                        <Network size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-on-surface">Network & Storage</h3>
                                        <p className="text-xs text-on-surface-variant">Port bindings and volume mounts</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 bg-black/40 rounded-xl border border-white/5 flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Public Ports</span>
                                        <div className="flex gap-1.5">
                                            <span className="text-[10px] font-mono font-bold bg-white/10 text-white px-2 py-1 rounded-md">80</span>
                                            <span className="text-[10px] font-mono font-bold bg-white/10 text-white px-2 py-1 rounded-md">443</span>
                                        </div>
                                    </div>
                                    <div className="p-3 bg-black/40 rounded-xl border border-white/5 flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Volume</span>
                                        <span className="text-[10px] font-mono font-bold text-on-surface truncate ml-2">data/nginx</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-surface/30 backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col justify-center hover:border-primary/20 transition-all">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 rounded-lg bg-red-500/10 text-red-500">
                                        <Zap size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-on-surface">Global Burst Protection</h3>
                                        <p className="text-xs text-on-surface-variant">Prevent DDoS attacks across all hosts</p>
                                    </div>
                                </div>
                                <div className="scale-100 origin-top-left w-full">
                                    <ProxyBurstProtectionToggle />
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
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-2xl font-bold bg-gradient-to-r from-on-surface to-on-surface-variant bg-clip-text text-transparent">SSL Certificates</h2>
                                <p className="text-sm text-on-surface-variant mt-1">Manage TLS certificates for your proxy hosts</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={fetchData}
                                    className="h-10 px-4 bg-surface border border-outline/10 rounded-xl hover:bg-white/5 transition-all text-primary flex items-center gap-2 font-bold text-xs"
                                    title="Refresh certificates"
                                >
                                    <RefreshCw size={14} />
                                    Refresh
                                </button>
                                <span className="h-10 px-4 flex items-center bg-surface border border-outline/20 rounded-xl text-xs font-bold text-on-surface">
                                    {certs.length} {certs.length === 1 ? 'Cert' : 'Certs'}
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
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
                            <div className="mt-8 bg-surface/30 border border-outline/10 rounded-2xl overflow-hidden hover:border-primary/20 transition-all">
                                <div className="px-5 py-4 border-b border-outline/5 bg-surface/50 flex items-center justify-between">
                                    <h3 className="text-sm font-bold flex items-center gap-2">
                                        <Network size={16} className="text-primary" />
                                        <span>DNS Challenge Configuration</span>
                                    </h3>
                                    <span className="text-[10px] text-on-surface-variant/60 font-medium bg-black/20 px-2 py-1 rounded-full border border-white/5">Manual Hooks</span>
                                </div>
                                <div className="divide-y divide-outline/5">
                                    {hosts.filter(h => h.sslChallengeType === 'dns' && h.dnsProvider === 'manual').map(host => (
                                        <div key={host.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-all group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                                                    <Globe size={18} />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold text-on-surface">{host.domain}</div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${host.dnsAuthScript ? 'bg-purple-500/10 text-purple-500' : host.dnsHost ? 'bg-blue-500/10 text-blue-500' : 'bg-amber-500/10 text-amber-500'}`}>
                                                            {host.dnsAuthScript ? 'Script' : host.dnsHost ? 'API' : 'Manual'}
                                                        </span>
                                                        {host.ssl && <span className="text-[9px] text-green-500 font-bold uppercase tracking-widest flex items-center gap-1"><CheckCircle2 size={10} /> Active</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setEditingHost(host)}
                                                className="px-4 py-2 bg-white/5 text-on-surface rounded-xl text-xs font-bold hover:bg-white/10 transition-all active:scale-95 opacity-0 group-hover:opacity-100"
                                            >
                                                Edit Config
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {certs.length === 0 && (
                            <div className="flex flex-col items-center justify-center text-on-surface-variant py-32 opacity-30">
                                <FileKey size={100} className="mb-6 opacity-50" />
                                <p className="italic text-2xl mb-2 font-light">No certificates found</p>
                                <p className="text-sm">Request SSL certificates for your proxy hosts to see them here.</p>
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

            {isAddPageModalOpen && (
                <CustomPageModal
                    onClose={() => setIsAddPageModalOpen(false)}
                    onSaved={() => { setIsAddPageModalOpen(false); fetchData(); }}
                />
            )}

            {editingPage && (
                <CustomPageModal
                    initialPage={editingPage}
                    onClose={() => setEditingPage(null)}
                    onSaved={() => { setEditingPage(null); fetchData(); }}
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

function LoggingConfigCard() {
    const [config, setConfig] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [localBuffering, setLocalBuffering] = useState({ size: 32, flush: 5 });

    const refresh = () => DockerClient.getProxySecuritySettings().then(c => {
        setConfig(c);
        if (c) setLocalBuffering({ size: c.logBufferSizeKb ?? 32, flush: c.logFlushIntervalSeconds ?? 5 });
    });

    useEffect(() => { refresh(); }, []);

    const destination = !config?.proxyRsyslogEnabled ? 'file' : config?.proxyDualLoggingEnabled ? 'both' : 'syslog';
    const setDestination = async (mode: 'file' | 'syslog' | 'both') => {
        const enabled = mode !== 'file';
        const dualLogging = mode === 'both';
        setLoading(true);
        try {
            const result = await DockerClient.updateProxyRsyslogSettings(enabled, dualLogging);
            if (result.success) {
                toast.success('Logging destination updated');
                await refresh();
            } else {
                toast.error(result.message || 'Failed');
            }
        } catch (e) {
            toast.error('Failed to update');
        } finally {
            setLoading(false);
        }
    };

    const setFormat = async (json: boolean) => {
        setLoading(true);
        try {
            const result = await DockerClient.updateProxyLoggingSettings({ jsonLoggingEnabled: json });
            if (result.success) {
                toast.success('Log format updated');
                await refresh();
            } else {
                toast.error(result.message || 'Failed');
            }
        } catch (e) {
            toast.error('Failed to update');
        } finally {
            setLoading(false);
        }
    };

    const setBuffering = async (enabled: boolean, size?: number, flush?: number) => {
        setLoading(true);
        try {
            const result = await DockerClient.updateProxyLoggingSettings({
                logBufferingEnabled: enabled,
                ...(size !== undefined && { logBufferSizeKb: size }),
                ...(flush !== undefined && { logFlushIntervalSeconds: flush })
            });
            if (result.success) {
                toast.success('Buffering settings updated');
                await refresh();
            } else {
                toast.error(result.message || 'Failed');
            }
        } catch (e) {
            toast.error('Failed to update');
        } finally {
            setLoading(false);
        }
    };

    if (!config) return <div className="animate-pulse h-10 bg-surface/50 rounded-xl" />;

    return (
        <div className="flex flex-col gap-3">
            <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider mb-1">Destination</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                    { id: 'file' as const, label: 'File only', desc: 'Local nginx logs' },
                    { id: 'syslog' as const, label: 'Rsyslog only', desc: 'Stream to syslog' },
                    { id: 'both' as const, label: 'Both (dual)', desc: 'File + Rsyslog' }
                ].map(({ id, label, desc }) => (
                    <div
                        key={id}
                        onClick={() => !loading && setDestination(id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer ${destination === id ? 'bg-primary/10 border-primary/30 ring-1 ring-primary/30' : 'bg-surface/50 hover:bg-surface/80 border-outline/10'}`}
                    >
                        <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${destination === id ? 'border-primary bg-primary' : 'border-outline/30'}`}>
                                {destination === id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                            <div>
                                <p className="font-semibold text-xs text-on-surface">{label}</p>
                                <p className="text-[10px] text-on-surface-variant">{desc}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider mt-2 mb-1">Format</p>
            <div className="flex gap-2">
                <button
                    onClick={() => !loading && setFormat(false)}
                    className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${!config?.jsonLoggingEnabled ? 'bg-primary/10 border-primary/30 ring-1 ring-primary/30' : 'bg-surface/50 hover:bg-surface/80 border-outline/10'}`}
                >
                    Standard
                </button>
                <button
                    onClick={() => !loading && setFormat(true)}
                    className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${config?.jsonLoggingEnabled ? 'bg-primary/10 border-primary/30 ring-1 ring-primary/30' : 'bg-surface/50 hover:bg-surface/80 border-outline/10'}`}
                >
                    JSON
                </button>
            </div>

            <div className="mt-2 pt-2 border-t border-white/5">
                <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-[10px] font-black text-primary uppercase tracking-wider hover:underline"
                >
                    {showAdvanced ? '−' : '+'} Advanced buffering
                </button>
                {showAdvanced && (
                    <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold">Enable buffering</span>
                            <button
                                type="button"
                                onClick={() => !loading && setBuffering(!config?.logBufferingEnabled)}
                                className={`w-12 h-6 rounded-full transition-all relative ${config?.logBufferingEnabled ? 'bg-primary' : 'bg-white/10'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${config?.logBufferingEnabled ? 'right-1' : 'left-1'}`} />
                            </button>
                        </div>
                        {config?.logBufferingEnabled && (
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-on-surface-variant mb-1 block">Buffer (KB)</label>
                                    <input
                                        type="number"
                                        value={localBuffering.size}
                                        onChange={e => setLocalBuffering(p => ({ ...p, size: parseInt(e.target.value) || 32 }))}
                                        onBlur={e => setBuffering(true, parseInt(e.target.value) || 32, localBuffering.flush)}
                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-2 py-1.5 text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-on-surface-variant mb-1 block">Flush (s)</label>
                                    <input
                                        type="number"
                                        value={localBuffering.flush}
                                        onChange={e => setLocalBuffering(p => ({ ...p, flush: parseInt(e.target.value) || 5 }))}
                                        onBlur={e => setBuffering(true, localBuffering.size, parseInt(e.target.value) || 5)}
                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-2 py-1.5 text-xs"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {loading && <div className="text-xs text-center text-primary animate-pulse">Updating...</div>}
        </div>
    );
}

function ProxyBurstProtectionToggle() {
    const [config, setConfig] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [settings, setSettings] = useState({ rate: 10, burst: 10 });

    useEffect(() => {
        DockerClient.getProxySecuritySettings().then(c => {
            setConfig(c);
            if (c) {
                setSettings({
                    rate: c.proxyBurstProtectionRate || 10,
                    burst: c.proxyBurstProtectionBurst || 10
                });
            }
        });
    }, []);

    const handleUpdate = async (enabled: boolean, newSettings?: { rate: number, burst: number }) => {
        setLoading(true);
        try {
            const currentSettings = newSettings || settings;
            const result = await DockerClient.updateProxyBurstProtection(enabled, currentSettings.rate, currentSettings.burst);
            if (result.success) {
                toast.success('Burst protection settings updated');
                const newConfig = await DockerClient.getProxySecuritySettings();
                setConfig(newConfig);
                setEditMode(false);
            } else {
                toast.error(result.message || 'Failed to update settings');
            }
        } catch (e) {
            toast.error('Failed to update settings');
        } finally {
            setLoading(false);
        }
    };

    if (!config) return <div className="animate-pulse h-10 bg-surface/50 rounded-xl" />;

    return (
        <div className="flex flex-col gap-3">
            <div
                className={`p-4 rounded-xl border border-outline/10 transition-all ${config.proxyBurstProtectionEnabled ? 'bg-primary/10 border-primary/30 ring-1 ring-primary/30' : 'bg-surface/50 hover:bg-surface/80'}`}
            >
                <div className="flex items-center justify-between mb-2">
                    <div
                        className="flex items-center gap-3 cursor-pointer"
                        onClick={() => !loading && handleUpdate(true)}
                    >
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${config.proxyBurstProtectionEnabled ? 'border-primary bg-primary text-white' : 'border-outline/30'}`}>
                            {config.proxyBurstProtectionEnabled && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                        <div>
                            <p className="font-semibold text-sm text-on-surface">Enable Global Burst Protection</p>
                            <p className="text-xs text-on-surface-variant">Limit requests across all hosts</p>
                        </div>
                    </div>
                    {config.proxyBurstProtectionEnabled && (
                        <button
                            onClick={() => setEditMode(!editMode)}
                            className="p-1 hover:bg-white/10 rounded-lg text-xs font-bold text-primary flex items-center gap-1"
                        >
                            <Pencil size={12} />
                            {editMode ? 'Close' : 'Configure'}
                        </button>
                    )}
                </div>

                {config.proxyBurstProtectionEnabled && (
                    <div className={`overflow-hidden transition-all ${editMode ? 'max-h-40 opacity-100 mt-3 pt-3 border-t border-white/5' : 'max-h-0 opacity-0'}`}>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                                <label className="text-[10px] uppercase font-bold text-on-surface-variant mb-1 block">Rate (req/s)</label>
                                <input
                                    type="number"
                                    value={settings.rate}
                                    onChange={(e) => setSettings({ ...settings, rate: parseInt(e.target.value) || 10 })}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:border-primary/50"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-on-surface-variant mb-1 block">Burst (queue)</label>
                                <input
                                    type="number"
                                    value={settings.burst}
                                    onChange={(e) => setSettings({ ...settings, burst: parseInt(e.target.value) || 10 })}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:border-primary/50"
                                />
                            </div>
                        </div>
                        <button
                            onClick={() => handleUpdate(true)}
                            disabled={loading}
                            className="w-full bg-primary/20 hover:bg-primary/30 text-primary text-xs font-bold py-1.5 rounded-lg transition-colors"
                        >
                            Apply Settings
                        </button>
                    </div>
                )}

                {config.proxyBurstProtectionEnabled && !editMode && (
                    <div className="flex gap-4 mt-1 ml-8">
                        <div className="text-xs text-on-surface-variant flex items-center gap-1">
                            <Activity size={12} />
                            <span>Limit: <b>{config.proxyBurstProtectionRate || 10}r/s</b></span>
                        </div>
                        <div className="text-xs text-on-surface-variant flex items-center gap-1">
                            <Layers size={12} />
                            <span>Burst: <b>{config.proxyBurstProtectionBurst || 10}</b></span>
                        </div>
                    </div>
                )}
            </div>

            <div
                className={`p-4 rounded-xl border border-outline/10 transition-all cursor-pointer ${!config.proxyBurstProtectionEnabled ? 'bg-primary/10 border-primary/30 ring-1 ring-primary/30' : 'bg-surface/50 hover:bg-surface/80'}`}
                onClick={() => !loading && handleUpdate(false)}
            >
                <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${!config.proxyBurstProtectionEnabled ? 'border-primary bg-primary text-white' : 'border-outline/30'}`}>
                        {!config.proxyBurstProtectionEnabled && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div>
                        <p className="font-semibold text-sm text-on-surface">Disable Global Limits</p>
                        <p className="text-xs text-on-surface-variant">No global rate limiting (per-host rules still apply)</p>
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
        <div className="group relative bg-[#0a0a0a]/40 backdrop-blur-xl border border-white/5 rounded-[24px] p-5 hover:border-primary/20 transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/5 flex flex-col h-full overflow-hidden">
            {/* Ambient Background Gradient */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none transition-opacity opacity-50 group-hover:opacity-100" />

            <div className="flex items-start justify-between mb-4 relative z-10">
                <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner shrink-0 ${isExpired ? 'bg-red-500/10 text-red-500 border border-red-500/10' :
                        isExpiringSoon ? 'bg-orange-500/10 text-orange-500 border border-orange-500/10' :
                            'bg-green-500/10 text-green-500 border border-green-500/10'
                        }`}>
                        <Lock size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold truncate text-sm pr-2 text-on-surface">{cert.domain}</h3>
                        <div className="flex items-center gap-1.5 mt-1">
                            {/* Issuer Badge */}
                            <div className="flex items-center gap-1">
                                <div className={`w-1.5 h-1.5 rounded-full ${isLetsEncrypt ? 'bg-blue-500' : 'bg-purple-500'}`} />
                                <span className="text-[10px] font-medium text-on-surface-variant">
                                    {cert.issuer || (isLetsEncrypt ? "Let's Encrypt" : "Custom")}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Status Section */}
            <div className="relative z-10 bg-black/20 rounded-xl p-3 border border-white/5 mb-4 group-hover:border-white/10 transition-colors">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Status</span>
                    {isExpired ? (
                        <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider animate-pulse">Expired</span>
                    ) : isExpiringSoon ? (
                        <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">Expiring Soon</span>
                    ) : (
                        <span className="text-[10px] font-bold text-green-500 uppercase tracking-wider">Active</span>
                    )}
                </div>

                <div className="flex items-center gap-2 text-xs font-mono text-on-surface">
                    <Calendar size={12} className={isExpiringSoon ? "text-orange-500" : "text-on-surface-variant"} />
                    <span className={isExpiringSoon ? "text-orange-500 font-bold" : "text-on-surface-variant"}>
                        {expiresAt
                            ? `${daysUntilExpiry} days left (${expiresAt.toLocaleDateString()})`
                            : 'Permanent'}
                    </span>
                </div>
            </div>

            {/* Paths */}
            <div className="space-y-2 mb-4 relative z-10 flex-1">
                {[
                    { label: 'CRT', path: cert.certPath, type: 'cert' as const },
                    { label: 'KEY', path: cert.keyPath, type: 'key' as const }
                ].map((item, idx) => (
                    <div key={idx} className="group/path">
                        <div className="flex items-center justify-between px-1 mb-1">
                            <span className="text-[9px] text-on-surface-variant/60 uppercase font-black tracking-wider">{item.label} Path</span>
                        </div>
                        <div
                            onClick={() => copyToClipboard(item.path, item.type)}
                            className="text-[10px] bg-black/40 hover:bg-black/60 cursor-pointer p-2 rounded-lg font-mono truncate border border-white/5 text-on-surface-variant hover:text-primary transition-colors flex items-center justify-between gap-2"
                        >
                            <span className="truncate">{item.path}</span>
                            {copiedPath === item.type ? <CheckCircle2 size={10} className="text-green-500 shrink-0" /> : <Copy size={10} className="opacity-0 group-hover/path:opacity-50 shrink-0" />}
                        </div>
                    </div>
                ))}
            </div>

            {/* Actions */}
            {(isLetsEncrypt || isExpired) && (
                <div className="pt-3 border-t border-white/5 mt-auto relative z-10">
                    <button
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold transition-all text-on-surface hover:text-primary"
                        onClick={() => {
                            const host = hosts.find(h => h.domain === cert.domain);
                            if (host) onRenew(host.id);
                        }}
                    >
                        <RefreshCw size={12} />
                        Renew Certificate
                    </button>
                </div>
            )}
        </div>
    );
}

function CustomPageModal({ initialPage, onClose, onSaved }: { initialPage?: CustomPage, onClose: () => void, onSaved: () => void }) {
    const [title, setTitle] = useState(initialPage?.title || '');
    const [content, setContent] = useState(initialPage?.content || '<!DOCTYPE html>\n<html>\n<head>\n    <title>Under Construction</title>\n    <style>\n        body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white; text-align: center; }\n        .container { padding: 2rem; }\n        h1 { font-size: 3rem; margin-bottom: 1rem; }\n        p { opacity: 0.7; }\n    </style>\n</head>\n<body>\n    <div className="container">\n        <h1>Coming Soon</h1>\n        <p>This site is currently under construction. Please check back later.</p>\n    </div>\n</body>\n</html>');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const pageData: CustomPage = {
            id: initialPage?.id || '',
            title,
            content,
            createdAt: initialPage?.createdAt || Date.now()
        };

        const result = initialPage
            ? await DockerClient.updateCustomPage(pageData)
            : await DockerClient.createCustomPage(pageData);

        if (result.success) {
            toast.success(result.message);
            onSaved();
        } else {
            toast.error(result.message);
        }
        setIsSubmitting(false);
    };

    return (
        <Modal
            onClose={onClose}
            title={initialPage ? 'Edit Custom Page' : 'Create Custom Page'}
            description="Create a custom maintenance page for your proxy hosts"
            icon={<Construction size={24} />}
            maxWidth="max-w-4xl"
        >
            <form onSubmit={handleSubmit} className="space-y-6 mt-4">
                <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Page Title</label>
                    <input
                        required
                        type="text"
                        placeholder="e.g. Maintenance Page"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full bg-white/5 border border-outline/20 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-all font-bold"
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">HTML Content</label>
                    <div className="rounded-2xl overflow-hidden border border-outline/20">
                        <Editor
                            height="400px"
                            language="html"
                            theme="vs-dark"
                            value={content}
                            onChange={(v) => setContent(v || '')}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 13,
                                wordWrap: 'on'
                            }}
                        />
                    </div>
                </div>

                <div className="flex gap-2 pt-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-4 py-3 rounded-2xl border border-outline/20 hover:bg-white/5 text-sm font-bold transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 bg-primary text-on-primary px-4 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all"
                    >
                        {initialPage ? 'Save Changes' : 'Create Page'}
                    </button>
                </div>
            </form>
        </Modal>
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



