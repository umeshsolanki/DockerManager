'use client';

import React, { useEffect, useState } from 'react';
import { Globe, Plus, Search, RefreshCw, Trash2, Power, Server, ExternalLink, FileKey, Pencil, Layers, Database, Lock, Network, Activity, ShieldCheck, Copy, CheckCircle2, Calendar, Building2, AlertTriangle } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { ProxyHost, PathRoute, SSLCertificate } from '@/lib/types';
import { toast } from 'sonner';
import Editor from '@monaco-editor/react';


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
                                                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                                                    {host.hstsEnabled && <span className="text-[8px] bg-purple-500/10 text-purple-500 px-1 py-0.5 rounded font-bold uppercase">HSTS</span>}
                                                    {host.websocketEnabled && <span className="text-[8px] bg-blue-500/10 text-blue-500 px-1 py-0.5 rounded font-bold uppercase">WS</span>}
                                                    {host.allowedIps && host.allowedIps.length > 0 && <span className="text-[8px] bg-amber-500/10 text-amber-500 px-1 py-0.5 rounded font-bold uppercase flex items-center gap-0.5"><ShieldCheck size={8} /> IP RESTRICTED</span>}
                                                    {host.paths && host.paths.length > 0 && (
                                                        <span className={`text-[8px] px-1 py-0.5 rounded font-bold uppercase flex items-center gap-0.5 ${
                                                            host.paths.filter(p => p.enabled !== false).length === host.paths.length
                                                                ? 'bg-indigo-500/10 text-indigo-500'
                                                                : 'bg-orange-500/10 text-orange-500'
                                                        }`}>
                                                            <Layers size={8} /> 
                                                            {host.paths.filter(p => p.enabled !== false).length}/{host.paths.length} PATH{host.paths.length > 1 ? 'S' : ''}
                                                        </span>
                                                    )}
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

                            <div className="mt-3 flex justify-center">
                                <button
                                    onClick={() => setIsComposeModalOpen(true)}
                                    className="text-xs font-bold text-on-surface-variant hover:text-primary flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all"
                                >
                                    <Pencil size={12} />
                                    <span>Edit Proxy Compose File</span>
                                </button>
                            </div>
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
    const [certs, setCerts] = useState<SSLCertificate[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [allowedIps, setAllowedIps] = useState<string[]>(initialHost?.allowedIps || []);
    const [newIp, setNewIp] = useState('');
    const [paths, setPaths] = useState<PathRoute[]>(initialHost?.paths || []);
    const [isPathModalOpen, setIsPathModalOpen] = useState(false);
    const [editingPath, setEditingPath] = useState<PathRoute | null>(null);

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
            </div>
        </div>
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
            order: parseInt(order) || 0
        };

        // Save path route - it will be included when the host is saved
        onSave(pathData);
        onClose();
        setIsSubmitting(false);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-surface border border-outline/20 rounded-2xl w-full max-w-md shadow-2xl p-5 max-h-[90vh] overflow-y-auto">
                <h2 className="text-lg font-bold mb-4">{initialPath ? 'Edit Path Route' : 'Add Path Route'}</h2>
                <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1 ml-1">Name (Optional)</label>
                        <input
                            type="text"
                            placeholder="e.g. API Backend, Static Files"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-white/5 border border-outline/20 rounded-xl px-4 py-2 focus:outline-none focus:border-primary text-sm"
                        />
                        <p className="text-[10px] text-on-surface-variant mt-1 ml-1">Display name for this path route</p>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1 ml-1">Path</label>
                        <input
                            required
                            type="text"
                            placeholder="e.g. /api, /static, /admin"
                            value={path}
                            onChange={(e) => setPath(e.target.value)}
                            className="w-full bg-white/5 border border-outline/20 rounded-xl px-4 py-2 focus:outline-none focus:border-primary font-mono text-sm"
                        />
                        <p className="text-[10px] text-on-surface-variant mt-1 ml-1">Must start with /</p>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1 ml-1">Target URL</label>
                        <input
                            required
                            type="text"
                            placeholder="e.g. http://backend:8080"
                            value={target}
                            onChange={(e) => setTarget(e.target.value)}
                            className="w-full bg-white/5 border border-outline/20 rounded-xl px-4 py-2 focus:outline-none focus:border-primary font-mono text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1 ml-1">Order/Priority</label>
                        <input
                            type="number"
                            placeholder="0"
                            value={order}
                            onChange={(e) => setOrder(e.target.value)}
                            className="w-full bg-white/5 border border-outline/20 rounded-xl px-4 py-2 focus:outline-none focus:border-primary font-mono text-sm"
                        />
                        <p className="text-[10px] text-on-surface-variant mt-1 ml-1">Higher numbers = higher priority (matched first)</p>
                    </div>

                    <div className="flex flex-col gap-2 pt-2 border-t border-outline/10">
                        <div className="flex items-center gap-3 py-1">
                            <input
                                type="checkbox"
                                id="path-enabled-toggle"
                                checked={enabled}
                                onChange={(e) => setEnabled(e.target.checked)}
                                className="w-5 h-5 rounded border-outline/20 bg-white/5 checked:bg-green-500 accent-green-500"
                            />
                            <label htmlFor="path-enabled-toggle" className="text-sm font-medium cursor-pointer text-on-surface flex items-center gap-2">
                                Enable Path Route
                                <span className="text-[9px] bg-green-500/10 text-green-500 px-1 py-0.5 rounded font-bold uppercase">Active</span>
                            </label>
                        </div>

                        <div className="flex items-center gap-3 py-1">
                            <input
                                type="checkbox"
                                id="path-ws-toggle"
                                checked={websocketEnabled}
                                onChange={(e) => setWebsocketEnabled(e.target.checked)}
                                className="w-5 h-5 rounded border-outline/20 bg-white/5 checked:bg-primary accent-primary"
                            />
                            <label htmlFor="path-ws-toggle" className="text-sm font-medium cursor-pointer text-on-surface">Enable Websockets</label>
                        </div>

                        <div className="flex items-center gap-3 py-1">
                            <input
                                type="checkbox"
                                id="strip-prefix-toggle"
                                checked={stripPrefix}
                                onChange={(e) => setStripPrefix(e.target.checked)}
                                className="w-5 h-5 rounded border-outline/20 bg-white/5 checked:bg-orange-500 accent-orange-500"
                            />
                            <label htmlFor="strip-prefix-toggle" className="text-sm font-medium cursor-pointer text-on-surface flex items-center gap-2">
                                Strip Path Prefix
                                <span className="text-[9px] bg-orange-500/10 text-orange-500 px-1 py-0.5 rounded font-bold uppercase">Remove /path before forwarding</span>
                            </label>
                        </div>
                    </div>

                    {/* IP Restrictions */}
                    <div className="pt-2 border-t border-outline/10">
                        <label className="block text-xs font-bold text-on-surface-variant uppercase mb-2 ml-1">IP Restrictions (Optional)</label>
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                placeholder="IP or CIDR"
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
                        <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto no-scrollbar p-1">
                            {allowedIps.map(ip => (
                                <div key={ip} className="flex items-center gap-2 bg-surface border border-outline/20 px-2 py-1 rounded-lg text-[10px] font-mono">
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
                        </div>
                    </div>

                    {/* Custom Config */}
                    <div className="pt-2 border-t border-outline/10">
                        <label className="block text-xs font-bold text-on-surface-variant uppercase mb-2 ml-1">Custom Nginx Config (Optional)</label>
                        <textarea
                            value={customConfig}
                            onChange={(e) => setCustomConfig(e.target.value)}
                            placeholder="e.g. proxy_read_timeout 300s;&#10;proxy_connect_timeout 60s;"
                            className="w-full bg-white/5 border border-outline/20 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary h-20 resize-none"
                        />
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
                            {initialPath ? 'Save Changes' : 'Create Path'}
                        </button>
                    </div>
                </form>
            </div>
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
        <div className="bg-surface/50 border border-outline/10 rounded-2xl p-3 relative overflow-hidden group hover:border-primary/20 transition-all">
            <div className="absolute top-0 right-0 p-3 opacity-5">
                <FileKey size={32} />
            </div>
            
            {/* Header */}
            <div className="flex items-start justify-between mb-2 relative z-10">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shadow-inner shrink-0 ${
                        isExpired ? 'bg-red-500/10 text-red-500' :
                        isExpiringSoon ? 'bg-orange-500/10 text-orange-500' :
                        'bg-green-500/10 text-green-500'
                    }`}>
                        <Lock size={14} />
                    </div>
                    <div className="overflow-hidden flex-1 min-w-0">
                        <h3 className="font-bold truncate text-sm pr-2">{cert.domain}</h3>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className={`text-[8px] font-black px-1 py-0.5 rounded uppercase ${
                                isLetsEncrypt 
                                    ? 'bg-blue-500/10 text-blue-500' 
                                    : 'bg-purple-500/10 text-purple-500'
                            }`}>
                                {isLetsEncrypt ? 'LE' : 'Custom'}
                            </span>
                            {cert.id !== cert.domain && (
                                <span className="text-[8px] text-on-surface-variant font-mono truncate max-w-[80px]">
                                    {cert.id}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Status Badge */}
            <div className="mb-2 relative z-10">
                {isExpired ? (
                    <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1">
                        <AlertTriangle size={10} className="text-red-500" />
                        <span className="text-[9px] font-bold text-red-500">EXPIRED</span>
                    </div>
                ) : isExpiringSoon ? (
                    <div className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/20 rounded-lg px-2 py-1">
                        <AlertTriangle size={10} className="text-orange-500" />
                        <span className="text-[9px] font-bold text-orange-500">
                            {daysUntilExpiry}d left
                        </span>
                    </div>
                ) : expiresAt ? (
                    <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-lg px-2 py-1">
                        <CheckCircle2 size={10} className="text-green-500" />
                        <span className="text-[9px] font-bold text-green-500 truncate">
                            {expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 bg-surface-variant/10 border border-outline/10 rounded-lg px-2 py-1">
                        <ShieldCheck size={10} className="text-on-surface-variant" />
                        <span className="text-[9px] font-bold text-on-surface-variant">VALID</span>
                    </div>
                )}
            </div>

            {/* Issuer Info */}
            {cert.issuer && (
                <div className="mb-2 flex items-center gap-1.5 text-[9px] text-on-surface-variant relative z-10">
                    <Building2 size={10} />
                    <span className="font-medium truncate">{cert.issuer}</span>
                </div>
            )}

            {/* Certificate Paths */}
            <div className="space-y-1.5 mb-2 relative z-10">
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[8px] text-on-surface-variant uppercase font-black tracking-wider">Cert</span>
                        <button
                            onClick={() => copyToClipboard(cert.certPath, 'cert')}
                            className="p-0.5 hover:bg-white/5 rounded transition-all"
                            title="Copy path"
                        >
                            {copiedPath === 'cert' ? (
                                <CheckCircle2 size={10} className="text-green-500" />
                            ) : (
                                <Copy size={10} className="text-on-surface-variant" />
                            )}
                        </button>
                    </div>
                    <div className="text-[9px] bg-black/10 p-1.5 rounded font-mono truncate border border-outline/5 text-on-surface-variant group-hover:bg-black/20 transition-colors">
                        {cert.certPath}
                    </div>
                </div>
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[8px] text-on-surface-variant uppercase font-black tracking-wider">Key</span>
                        <button
                            onClick={() => copyToClipboard(cert.keyPath, 'key')}
                            className="p-0.5 hover:bg-white/5 rounded transition-all"
                            title="Copy path"
                        >
                            {copiedPath === 'key' ? (
                                <CheckCircle2 size={10} className="text-green-500" />
                            ) : (
                                <Copy size={10} className="text-on-surface-variant" />
                            )}
                        </button>
                    </div>
                    <div className="text-[9px] bg-black/10 p-1.5 rounded font-mono truncate border border-outline/5 text-on-surface-variant group-hover:bg-black/20 transition-colors">
                        {cert.keyPath}
                    </div>
                </div>
            </div>

            {/* Footer Actions */}
            <div className="pt-2 border-t border-outline/5 flex justify-between items-center relative z-10">
                {expiresAt && (
                    <div className="flex items-center gap-1 text-[8px] text-on-surface-variant">
                        <Calendar size={8} />
                        <span className="font-medium">
                            {daysUntilExpiry !== null && daysUntilExpiry > 0 
                                ? `${daysUntilExpiry}d`
                                : 'Expired'
                            }
                        </span>
                    </div>
                )}
                {isLetsEncrypt && (
                    <button 
                        className="text-[9px] font-bold text-primary hover:underline flex items-center gap-0.5"
                        onClick={() => {
                            // Find host using this certificate and request renewal
                            const host = hosts.find(h => h.domain === cert.domain);
                            if (host) {
                                onRenew(host.id);
                            } else {
                                toast.info('No proxy host found for this domain');
                            }
                        }}
                    >
                        <RefreshCw size={8} />
                        RENEW
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

