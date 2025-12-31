'use client';

import React, { useEffect, useState } from 'react';
import { Globe, Plus, Search, RefreshCw, Trash2, Power, BarChart3, Activity, Clock, Server, ExternalLink, ShieldCheck, Lock, Network, FileKey } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { ProxyHost, ProxyStats, SSLCertificate } from '@/lib/types';
import { toast } from 'sonner';

export default function ProxyScreen() {
    const [hosts, setHosts] = useState<ProxyHost[]>([]);
    const [stats, setStats] = useState<ProxyStats | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const fetchData = async () => {
        setIsLoading(true);
        const [hostsData, statsData] = await Promise.all([
            DockerClient.listProxyHosts(),
            DockerClient.getProxyStats()
        ]);
        setHosts(hostsData);
        setStats(statsData);
        setIsLoading(false);
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

    return (
        <div className="flex flex-col h-full relative">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-bold">Reverse Proxy</h1>
                    {isLoading && <RefreshCw className="animate-spin text-primary" size={24} />}
                </div>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-xl"
                >
                    <Plus size={20} />
                    <span>Add Host</span>
                </button>
            </div>

            {/* Stats Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-surface border border-outline/10 rounded-2xl p-4">
                    <div className="flex items-center gap-3 text-on-surface-variant mb-2">
                        <Activity size={18} />
                        <span className="text-xs font-bold uppercase tracking-wider">Total Hits</span>
                    </div>
                    <div className="text-3xl font-bold">{stats?.totalHits || 0}</div>
                    <div className="text-[10px] text-green-500 mt-1">Last 1000 lines</div>
                </div>
                <div className="bg-surface border border-outline/10 rounded-2xl p-4">
                    <div className="flex items-center gap-3 text-on-surface-variant mb-2">
                        <Server size={18} />
                        <span className="text-xs font-bold uppercase tracking-wider">Active Hosts</span>
                    </div>
                    <div className="text-3xl font-bold">{hosts.filter(h => h.enabled).length}</div>
                    <div className="text-[10px] text-on-surface-variant mt-1">Out of {hosts.length} total</div>
                </div>
                <div className="md:col-span-2 bg-surface border border-outline/10 rounded-2xl p-4 overflow-hidden">
                    <div className="flex items-center gap-3 text-on-surface-variant mb-3">
                        <BarChart3 size={18} />
                        <span className="text-xs font-bold uppercase tracking-wider">Hits Distribution (24h)</span>
                    </div>
                    <div className="flex items-end gap-1 h-12">
                        {stats && Object.entries(stats.hitsOverTime).map(([hour, count]) => (
                            <div
                                key={hour}
                                className="flex-1 bg-primary/30 hover:bg-primary transition-colors rounded-t-sm relative group"
                                style={{ height: `${Math.max(10, (count / (stats.totalHits || 1)) * 100)}%` }}
                            >
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-surface-variant text-[8px] px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                    {hour}: {count}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden">
                {/* Host List */}
                <div className="lg:col-span-2 flex flex-col gap-4 overflow-y-auto pr-2 pb-4">
                    <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
                        <input
                            type="text"
                            placeholder="Search domains or targets..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-surface border border-outline/20 rounded-xl py-2 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors"
                        />
                    </div>

                    {filteredHosts.map(host => (
                        <div key={host.id} className="bg-surface/50 border border-outline/10 rounded-2xl p-4 hover:border-primary/20 transition-all group">
                            <div className="flex items-start justify-between">
                                <div className="flex gap-4">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${host.enabled ? 'bg-primary/20 text-primary' : 'bg-white/5 text-on-surface-variant'}`}>
                                        <Globe size={24} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-lg font-bold">{host.domain}</h3>
                                            {!host.enabled && <span className="text-[10px] bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded font-bold uppercase">Disabled</span>}
                                            {host.ssl && <span className="text-[10px] bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1"><Lock size={10} /> SSL</span>}
                                            {host.hstsEnabled && <span className="text-[10px] bg-purple-500/10 text-purple-500 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1"><ShieldCheck size={10} /> HSTS</span>}
                                            {host.websocketEnabled && <span className="text-[10px] bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1"><Network size={10} /> WS</span>}
                                        </div>
                                        <div className="flex items-center gap-2 text-on-surface-variant text-sm mt-1">
                                            <ExternalLink size={14} />
                                            <span className="font-mono">{host.target}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    {!host.ssl && host.enabled && (
                                        <button
                                            onClick={() => handleRequestSSL(host.id)}
                                            className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-all"
                                            title="Request SSL"
                                        >
                                            <ShieldCheck size={18} />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleToggle(host.id)}
                                        className={`p-2 rounded-lg transition-all ${host.enabled ? 'text-green-500 hover:bg-green-500/10' : 'text-on-surface-variant hover:bg-white/10'}`}
                                        title={host.enabled ? "Disable" : "Enable"}
                                    >
                                        <Power size={18} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(host.id)}
                                        className="p-2 text-on-surface-variant hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                        title="Delete"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {filteredHosts.length === 0 && (
                        <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant py-20">
                            <Globe size={64} className="mb-4 opacity-10" />
                            <p className="italic">No proxy hosts configured</p>
                        </div>
                    )}
                </div>

                {/* Real-time Visualization & Recent Hits */}
                <div className="lg:col-span-1 flex flex-col gap-6 overflow-hidden">
                    {/* Top Paths */}
                    <div className="bg-surface border border-outline/10 rounded-3xl p-5 flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
                                <Activity size={16} className="text-primary" />
                                <span>Popular Paths</span>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {stats?.topPaths.map(({ first: path, second: count }) => (
                                <div key={path} className="space-y-1">
                                    <div className="flex justify-between text-[10px] font-mono">
                                        <span className="truncate pr-4">{path}</span>
                                        <span className="shrink-0">{count}</span>
                                    </div>
                                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary/40 rounded-full"
                                            style={{ width: `${(count / (stats.totalHits || 1)) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Recent Access Logs */}
                    <div className="bg-black/20 border border-outline/10 rounded-3xl p-5 flex-1 flex flex-col overflow-hidden">
                        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider mb-4">
                            <Clock size={16} className="text-secondary" />
                            <span>Recent Traffic</span>
                        </div>
                        <div className="flex-1 overflow-y-auto pr-2 space-y-3 font-mono text-[9px]">
                            {stats?.recentHits.slice().reverse().map((hit, i) => (
                                <div key={i} className="flex gap-2 border-l border-outline/20 pl-2 py-1">
                                    <span className="text-on-surface-variant uppercase shrink-0">[{new Date(hit.timestamp).toLocaleTimeString()}]</span>
                                    <span className={`shrink-0 ${hit.status < 400 ? 'text-green-500' : 'text-red-500'}`}>{hit.status}</span>
                                    <span className="text-primary shrink-0">{hit.method}</span>
                                    <span className="truncate">{hit.path}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {isAddModalOpen && (
                <AddHostModal
                    onClose={() => setIsAddModalOpen(false)}
                    onAdded={() => { setIsAddModalOpen(false); fetchData(); }}
                />
            )}
        </div>
    );
}

function AddHostModal({ onClose, onAdded }: { onClose: () => void, onAdded: () => void }) {
    const [domain, setDomain] = useState('');
    const [target, setTarget] = useState('http://');
    const [websocketEnabled, setWebsocketEnabled] = useState(false);
    const [hstsEnabled, setHstsEnabled] = useState(false);
    const [sslEnabled, setSslEnabled] = useState(false);
    const [selectedCert, setSelectedCert] = useState<string>('');
    const [certs, setCerts] = useState<SSLCertificate[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        DockerClient.listProxyCertificates().then(setCerts);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        const success = await DockerClient.createProxyHost({
            id: '',
            domain,
            target,
            enabled: true,
            ssl: sslEnabled,
            websocketEnabled,
            hstsEnabled: sslEnabled ? hstsEnabled : false,
            customSslPath: (sslEnabled && selectedCert) ? selectedCert : undefined,
            createdAt: Date.now()
        });
        if (success) {
            toast.success('Proxy host created');
            onAdded();
        } else {
            toast.error('Failed to create proxy host');
        }
        setIsSubmitting(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-surface border border-outline/20 rounded-3xl w-full max-w-md shadow-2xl p-6">
                <h2 className="text-xl font-bold mb-6">Add Proxy Host</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
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

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 rounded-xl border border-outline/20 hover:bg-white/5"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 bg-primary text-on-primary px-4 py-2 rounded-xl font-bold"
                        >
                            {isSubmitting ? 'Creating...' : 'Create Host'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
