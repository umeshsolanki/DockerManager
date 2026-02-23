'use client';

import React, { useEffect, useState } from 'react';
import { Shield, ShieldAlert, ShieldCheck, Trash2, Plus, Search, RefreshCw, Globe, Lock, Activity, Terminal, ChevronRight, ListFilter, Database, MapPin, Save, Info, Settings, Timer, UserX, Zap, Clock, AlertTriangle, Filter, ArrowDown } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { FirewallRule, IptablesRule, IpReputation, SystemConfig } from '@/lib/types';
import { toast } from 'sonner';
import { Modal } from '../ui/Modal';
import { StatCard } from '../ui/StatCard';
import { useActionTrigger } from '@/hooks/useActionTrigger';
import ProxyRulesTab from '../security/ProxyRulesTab';

type FirewallTab = 'overview' | 'rules' | 'reputation' | 'geolocation' | 'jails' | 'proxy-rules' | 'iptables' | 'nftables';

export default function FirewallScreen({ initialTab }: { initialTab?: FirewallTab }) {
    const [rules, setRules] = useState<FirewallRule[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const validTabs: FirewallTab[] = ['overview', 'rules', 'reputation', 'geolocation', 'jails', 'proxy-rules', 'iptables', 'nftables'];
    const [activeTab, setActiveTab] = useState<FirewallTab>(initialTab && validTabs.includes(initialTab) ? initialTab : 'rules');

    // Proxy / Security state (from SecurityScreen)
    const [proxyConfig, setProxyConfig] = useState<SystemConfig | null>(null);
    const { trigger } = useActionTrigger();

    // IP Reputation state
    const [reputations, setReputations] = useState<IpReputation[]>([]);
    const [isRepLoading, setIsRepLoading] = useState(false);
    const [repSearch, setRepSearch] = useState('');
    const [repLimit, setRepLimit] = useState(50);
    const [repOffset, setRepOffset] = useState(0);
    const [ipRangesCount, setIpRangesCount] = useState(0);
    const [showIpImportModal, setShowIpImportModal] = useState(false);
    const [ipCsv, setIpCsv] = useState('');
    const [importingIpRanges, setImportingIpRanges] = useState(false);
    // Geo ranges browser
    type GeoRow = { id: number; cidr: string | null; countryCode: string | null; countryName: string | null; provider: string | null; type: string | null };
    const [geoRows, setGeoRows] = useState<GeoRow[]>([]);
    const [geoTotal, setGeoTotal] = useState(0);
    const [geoPage, setGeoPage] = useState(0);
    const [geoLimit] = useState(50);
    const [geoSearch, setGeoSearch] = useState('');
    const [isGeoLoading, setIsGeoLoading] = useState(false);
    const [iptables, setIptables] = useState<Record<string, IptablesRule[]>>({});
    const [iptablesRaw, setIptablesRaw] = useState<string>('');
    const [isIptablesRaw, setIsIptablesRaw] = useState(false);
    const [nftables, setNftables] = useState<string>('');
    const [nftablesJson, setNftablesJson] = useState<any>(null);
    const [isNftablesRaw, setIsNftablesRaw] = useState(false);
    const [expandedChain, setExpandedChain] = useState<string | null>('INPUT');

    // Jail tab state
    const [jailSearch, setJailSearch] = useState('');
    const [jailFilter, setJailFilter] = useState<'all' | 'proxy' | 'login' | 'other'>('all');
    const [nowTick, setNowTick] = useState(Date.now());
    const [showManualJailModal, setShowManualJailModal] = useState(false);
    const [manualJailIp, setManualJailIp] = useState('');
    const [manualJailDuration, setManualJailDuration] = useState('30');
    const [manualJailReason, setManualJailReason] = useState('');
    const [isManualJailing, setIsManualJailing] = useState(false);

    const fetchRules = async () => {
        setIsLoading(true);
        try {
            const [rulesData, proxyData, iptablesData, iptablesRawData, nftablesData, nftablesJsonData] = await Promise.all([
                DockerClient.listFirewallRules(),
                DockerClient.getProxySecuritySettings(),
                DockerClient.getIptablesVisualisation(),
                DockerClient.getIptablesRaw(),
                DockerClient.getNftablesVisualisation(),
                DockerClient.getNftablesJson()
            ]);
            setRules(rulesData || []);
            setProxyConfig(proxyData);
            setIptables(iptablesData || {});
            setIptablesRaw(iptablesRawData || '');
            setNftables(nftablesData || '');
            setNftablesJson(nftablesJsonData);
        } catch (e) {
            console.error('Failed to fetch security data', e);
        } finally {
            setIsLoading(false);
        }
    };

    const updateProxySecurity = async (updated: Partial<SystemConfig>) => {
        if (!proxyConfig) return;
        const newSettings = { ...proxyConfig, ...updated };
        setProxyConfig(newSettings);
        try {
            const result = await DockerClient.updateProxySecuritySettings(newSettings) as { success?: boolean; message?: string };
            if (result && result.success === false) {
                toast.error(result.message || 'Update failed');
                fetchRules();
            } else {
                toast.success(result?.message || 'Settings updated');
            }
        } catch (e) {
            toast.error('Failed to update settings');
            fetchRules();
        }
    };

    const fetchReputations = async () => {
        setIsRepLoading(true);
        try {
            const data = await DockerClient.listIpReputations(repLimit, repOffset, repSearch);
            data.sort((a, b) => b.blockedTimes - a.blockedTimes);
            setReputations(data);
        } catch (e) {
            console.error('Failed to fetch IP reputations', e);
            setReputations([]);
        } finally {
            setIsRepLoading(false);
        }
    };

    const fetchIpRangeStats = async () => {
        try {
            const ipStats = await DockerClient.getIpRangeStats();
            setIpRangesCount(ipStats.totalRanges);
        } catch (e) {
            console.error('Failed to fetch stats', e);
        }
    };

    const fetchGeoRanges = async (page = geoPage, search = geoSearch) => {
        setIsGeoLoading(true);
        try {
            const data = await DockerClient.listIpRanges(page, geoLimit, search);
            setGeoRows(data.rows);
            setGeoTotal(data.total);
            setGeoPage(data.page);
        } catch (e) {
            console.error('Failed to fetch IP ranges', e);
        } finally {
            setIsGeoLoading(false);
        }
    };

    useEffect(() => {
        fetchRules();
    }, []);

    // Live countdown ticker for jails tab
    useEffect(() => {
        if (activeTab !== 'jails') return;
        const interval = setInterval(() => setNowTick(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'reputation' || activeTab === 'geolocation') {
            fetchIpRangeStats();
        }
        if (activeTab === 'geolocation') {
            setGeoPage(0);
            setGeoSearch('');
            fetchGeoRanges(0, '');
        }
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'reputation') {
            setRepOffset(0);
        }
    }, [activeTab, repSearch, repLimit]);

    useEffect(() => {
        if (activeTab === 'reputation') {
            const timer = setTimeout(fetchReputations, 300);
            return () => clearTimeout(timer);
        }
    }, [activeTab, repSearch, repLimit, repOffset]);

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to unblock this IP?')) return;
        await trigger(() => DockerClient.unblockIP(id), {
            onSuccess: () => fetchRules(),
            successMessage: 'IP Unblocked successfully',
            errorMessage: 'Failed to unblock IP'
        });
    };

    const filteredRules = rules.filter(r =>
        r.ip.includes(searchQuery) ||
        (r.comment?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        (r.country?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
    );

    const handleDeleteReputation = async (ip: string) => {
        if (!confirm(`Are you sure you want to delete reputation for ${ip}?`)) return;
        try {
            const success = await DockerClient.deleteIpReputation(ip);
            if (success) {
                toast.success('Reputation record removed');
                fetchReputations();
            } else {
                toast.error('Failed to delete IP reputation');
            }
        } catch (e) {
            console.error('Failed to delete IP reputation', e);
            toast.error('Failed to delete IP reputation');
        }
    };

    return (
        <div className="flex flex-col relative">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-bold">Security & Firewall</h1>
                    {(isLoading || (activeTab === 'reputation' && isRepLoading)) && <RefreshCw className="animate-spin text-primary" size={24} />}
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex bg-surface border border-outline/10 p-1 rounded-xl flex-wrap gap-1">
                        <button
                            onClick={() => setActiveTab('overview')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'overview' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-white/5'}`}
                        >
                            <Shield size={16} />
                            Overview
                        </button>
                        <button
                            onClick={() => setActiveTab('rules')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'rules' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-white/5'}`}
                        >
                            <ListFilter size={16} />
                            Rules
                        </button>
                        <button
                            onClick={() => setActiveTab('reputation')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'reputation' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-white/5'}`}
                        >
                            <ShieldAlert size={16} />
                            Reputation
                        </button>
                        <button
                            onClick={() => setActiveTab('geolocation')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'geolocation' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-white/5'}`}
                        >
                            <Globe size={16} />
                            Geolocation
                        </button>
                        <button
                            onClick={() => setActiveTab('jails')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'jails' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-white/5'}`}
                        >
                            <Lock size={16} />
                            Jails
                        </button>
                        <button
                            onClick={() => setActiveTab('proxy-rules')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'proxy-rules' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-white/5'}`}
                        >
                            <Settings size={16} />
                            Proxy Rules
                        </button>
                        <button
                            onClick={() => setActiveTab('iptables')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'iptables' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-white/5'}`}
                        >
                            <Activity size={16} />
                            iptables
                        </button>
                        <button
                            onClick={() => setActiveTab('nftables')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'nftables' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-white/5'}`}
                        >
                            <Terminal size={16} />
                            nftables
                        </button>
                    </div>
                    {activeTab === 'rules' && (
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-xl hover:opacity-90 transition-opacity"
                        >
                            <Plus size={20} />
                            <span className="text-sm font-bold">Block IP</span>
                        </button>
                    )}
                </div>
            </div>

            {activeTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <StatCard label="Active Blocks" value={rules.length.toString()} icon={<Shield size={24} />} sub="Firewall level restrictions" color="primary" />
                    <StatCard label="Jailed IPs" value={rules.filter(r => r.expiresAt != null).length.toString()} icon={<Lock size={24} />} sub="Timed security jails" color="indigo" />
                    <StatCard label="Proxy Rules" value={(proxyConfig?.proxyJailRules?.length || 0).toString()} icon={<Terminal size={24} />} sub="Active armor patterns" color="orange" />
                </div>
            )}

            {(activeTab === 'rules' || activeTab === 'geolocation') && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-surface border border-outline/10 rounded-2xl p-4 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                            <Shield size={24} />
                        </div>
                        <div>
                            <div className="text-2xl font-bold">{rules.length}</div>
                            <div className="text-xs text-on-surface-variant uppercase font-bold tracking-wider">Active Blocks</div>
                        </div>
                    </div>
                    <div className="bg-surface border border-outline/10 rounded-2xl p-4 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                            <ShieldAlert size={24} />
                        </div>
                        <div>
                            <div className="text-2xl font-bold">{activeTab === 'geolocation' ? ipRangesCount.toLocaleString() : rules.filter(r => String(r.port) === '22').length}</div>
                            <div className="text-xs text-on-surface-variant uppercase font-bold tracking-wider">{activeTab === 'geolocation' ? 'IP Ranges' : 'SSH Specific'}</div>
                        </div>
                    </div>
                    <div className="bg-surface border border-outline/10 rounded-2xl p-4 flex items-center gap-4 relative overflow-hidden group">
                        <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500">
                            <ShieldCheck size={24} />
                        </div>
                        <div>
                            <div className="text-2xl font-bold">Active</div>
                            <div className="text-xs text-on-surface-variant uppercase font-bold tracking-wider">Status</div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'rules' ? (
                <>
                    <div className="flex items-center gap-4 mb-6">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
                            <input
                                type="text"
                                placeholder="Search IP, country or comment..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-surface border border-outline/20 rounded-xl py-2 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                        <button
                            onClick={fetchRules}
                            className="p-2 bg-surface border border-outline/20 rounded-xl hover:bg-white/5 transition-colors"
                        >
                            <RefreshCw size={20} />
                        </button>
                    </div>

                    <div className="bg-black/40 border border-outline/10 rounded-2xl overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-outline/10 bg-white/5">
                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider">IP Address</th>
                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider">Country</th>
                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider">Port</th>
                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider">Created</th>
                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider">Comment</th>
                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-outline/5">
                                {filteredRules.map(rule => (
                                    <tr key={rule.id} className="hover:bg-white/5 transition-colors group">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <Globe size={14} className="text-on-surface-variant/50" />
                                                <span className="font-mono font-bold text-sm text-primary">{rule.ip}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {rule.country ? (
                                                <div className="flex items-center gap-2 text-sm font-medium text-on-surface-variant">
                                                    <MapPin size={14} className="text-on-surface-variant/50" />
                                                    {rule.country}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-on-surface-variant/30 italic">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold uppercase tracking-wider">
                                                {rule.port != null ? String(rule.port) : 'All'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs font-mono text-on-surface-variant">
                                            {new Date(rule.createdAt).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-on-surface-variant italic opacity-70 max-w-[200px] truncate">
                                            {rule.comment || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={() => handleDelete(rule.id)}
                                                className="p-1.5 text-on-surface-variant hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                                title="Unblock IP"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {filteredRules.length === 0 && !isLoading && (
                        <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant py-20">
                            <Shield size={64} className="mb-4 opacity-10" />
                            <p className="text-lg italic">No active firewall rules found</p>
                        </div>
                    )}
                </>
            ) : activeTab === 'reputation' ? (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-5">
                    {/* Stats bar */}
                    {(() => {
                        const totalBlocked = reputations.reduce((s, r) => s + r.blockedTimes, 0);
                        const highThreat = reputations.filter(r => r.blockedTimes >= 5).length;
                        const topCountry = (() => {
                            const counts: Record<string, number> = {};
                            reputations.forEach(r => { if (r.country) counts[r.country] = (counts[r.country] || 0) + 1; });
                            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                            return sorted.length > 0 ? sorted[0][0] : null;
                        })();
                        const uniqueCountries = new Set(reputations.map(r => r.country).filter(Boolean)).size;
                        const topISP = (() => {
                            const counts: Record<string, number> = {};
                            reputations.forEach(r => { if (r.isp) counts[r.isp] = (counts[r.isp] || 0) + 1; });
                            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                            return sorted.length > 0 ? sorted[0][0] : null;
                        })();
                        const uniqueISPs = new Set(reputations.map(r => r.isp).filter(Boolean)).size;
                        return (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                                <div className="bg-surface border border-outline/10 rounded-2xl p-4 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary"><Activity size={18} /></div>
                                    <div>
                                        <div className="text-2xl font-black">{reputations.length}</div>
                                        <div className="text-[10px] uppercase font-bold text-on-surface-variant/60 tracking-wider">Tracked IPs</div>
                                    </div>
                                </div>
                                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400"><Shield size={18} /></div>
                                    <div>
                                        <div className="text-2xl font-black text-red-400">{highThreat}</div>
                                        <div className="text-[10px] uppercase font-bold text-on-surface-variant/60 tracking-wider">High Threat</div>
                                    </div>
                                </div>
                                <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center text-orange-400"><AlertTriangle size={18} /></div>
                                    <div>
                                        <div className="text-2xl font-black text-orange-400">{totalBlocked}</div>
                                        <div className="text-[10px] uppercase font-bold text-on-surface-variant/60 tracking-wider">Total Blocks</div>
                                    </div>
                                </div>
                                <div
                                    className="bg-teal-500/10 border border-teal-500/20 rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:bg-teal-500/20 transition-colors group"
                                    title={topCountry ? `Click to filter by ${topCountry}` : undefined}
                                    onClick={() => topCountry && setRepSearch(prev => {
                                        const cleaned = prev.replace(/country:\S+/gi, '').trim();
                                        return `${cleaned} country:${topCountry}`.trim();
                                    })}
                                >
                                    <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center text-teal-400 group-hover:scale-110 transition-transform"><Globe size={18} /></div>
                                    <div className="min-w-0">
                                        <div className="text-2xl font-black text-teal-400">{uniqueCountries}</div>
                                        <div className="text-[10px] uppercase font-bold text-on-surface-variant/60 tracking-wider truncate">
                                            {topCountry ? `Countries · #1 ${topCountry}` : 'Countries'}
                                        </div>
                                        {topCountry && <div className="text-[9px] text-teal-400/50 mt-0.5">Click to filter ↓</div>}
                                    </div>
                                </div>
                                <div
                                    className="bg-violet-500/10 border border-violet-500/20 rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:bg-violet-500/20 transition-colors group"
                                    title={topISP ? `Click to filter by ${topISP}` : undefined}
                                    onClick={() => topISP && setRepSearch(prev => {
                                        const cleaned = prev.replace(/isp:\S+/gi, '').trim();
                                        return `${cleaned} isp:${topISP}`.trim();
                                    })}
                                >
                                    <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center text-violet-400 group-hover:scale-110 transition-transform"><Activity size={18} /></div>
                                    <div className="min-w-0">
                                        <div className="text-2xl font-black text-violet-400">{uniqueISPs}</div>
                                        <div className="text-[10px] uppercase font-bold text-on-surface-variant/60 tracking-wider truncate">
                                            {topISP ? `ISPs · #1 ${topISP}` : 'ISPs'}
                                        </div>
                                        {topISP && <div className="text-[9px] text-violet-400/50 mt-0.5">Click to filter ↓</div>}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Toolbar */}
                    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50" size={16} />
                            <input
                                type="text"
                                placeholder="Search IP, country, ISP, range or reason…"
                                value={repSearch}
                                onChange={(e) => setRepSearch(e.target.value)}
                                className="w-full bg-surface border border-outline/20 rounded-xl py-2 pl-9 pr-4 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-bold text-on-surface-variant/60 uppercase">Show</span>
                            <select value={repLimit} onChange={(e) => setRepLimit(Number(e.target.value))} className="bg-surface border border-outline/20 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none">
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                                <option value={500}>500</option>
                            </select>
                        </div>
                        <button onClick={fetchReputations} disabled={isRepLoading} className="p-2 bg-surface border border-outline/20 rounded-xl hover:bg-white/5 transition-colors disabled:opacity-50 shrink-0">
                            <RefreshCw size={16} className={isRepLoading ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    {/* Filter chips + table — fully inline */}
                    {(() => {
                        // Parse key:value tokens from search string
                        const filters: Record<string, string> = {};
                        const freeText = repSearch.replace(/(\w+):(\S+)/g, (_, k, v) => {
                            filters[k.toLowerCase()] = v.toLowerCase();
                            return '';
                        }).trim();

                        const activeChips = Object.entries(filters);

                        const filtered = reputations
                            .filter(rep => {
                                if (filters.country && !rep.country?.toLowerCase().includes(filters.country)) return false;
                                if (filters.isp && !rep.isp?.toLowerCase().includes(filters.isp)) return false;
                                if (filters.range && !rep.range?.toLowerCase().includes(filters.range)) return false;
                                if (filters.blocked) {
                                    const n = parseInt(filters.blocked, 10);
                                    if (!isNaN(n) && rep.blockedTimes < n) return false;
                                }
                                if (filters.threat) {
                                    const t = filters.threat;
                                    const b = rep.blockedTimes;
                                    const level = b >= 10 ? 'critical' : b >= 5 ? 'high' : b >= 1 ? 'medium' : 'low';
                                    if (level !== t && !(t === 'clean' && level === 'low')) return false;
                                }
                                if (freeText) {
                                    const q = freeText.toLowerCase();
                                    return rep.ip.includes(q)
                                        || (rep.country?.toLowerCase().includes(q) ?? false)
                                        || (rep.isp?.toLowerCase().includes(q) ?? false)
                                        || (rep.range?.toLowerCase().includes(q) ?? false)
                                        || (rep.reasons?.some(r => r.toLowerCase().includes(q)) ?? false);
                                }
                                return true;
                            })
                            // Sort: most-recent activity first, then most-blocked as tiebreak
                            .slice()
                            .sort((a, b) => {
                                const tDiff = new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
                                if (tDiff !== 0) return tDiff;
                                return b.blockedTimes - a.blockedTimes;
                            });

                        return (
                            <>
                                {/* Active filter chips */}
                                {activeChips.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {activeChips.map(([k, v]) => (
                                            <span key={k} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-xs font-bold text-primary">
                                                <span className="opacity-60">{k}:</span>{v}
                                                <button
                                                    onClick={() => setRepSearch(prev => prev.replace(new RegExp(`${k}:\\S+`, 'i'), '').trim())}
                                                    className="ml-0.5 hover:text-red-400 transition-colors leading-none text-base"
                                                >×</button>
                                            </span>
                                        ))}
                                        <button onClick={() => setRepSearch('')} className="text-[10px] font-bold text-on-surface-variant/40 hover:text-on-surface-variant transition-colors px-1">
                                            Clear all
                                        </button>
                                    </div>
                                )}

                                {/* Empty state */}
                                {filtered.length === 0 && !isRepLoading ? (
                                    <div className="flex flex-col items-center justify-center py-24 text-on-surface-variant/40 border-2 border-dashed border-outline/10 rounded-2xl bg-surface/20">
                                        <Globe size={56} className="mb-4 opacity-20" />
                                        <span className="text-lg font-bold">{reputations.length === 0 ? 'No reputation records found' : 'No records match filters'}</span>
                                        <span className="text-sm mt-1 opacity-60">{reputations.length === 0 ? 'IPs appear automatically when activity or blocks are recorded.' : 'Try adjusting your search or filters.'}</span>
                                    </div>
                                ) : (
                                    <div className="bg-black/40 border border-outline/10 rounded-2xl overflow-y-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b border-outline/10 bg-white/5">
                                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider">IP Address</th>
                                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider">Country</th>
                                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider">ISP / Range</th>
                                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider">Threat</th>
                                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider">Blocks</th>
                                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider">Last Activity</th>
                                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider text-right">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-outline/5">
                                                {reputations.map((rep) => {
                                                    const threat = rep.blockedTimes >= 10 ? 'critical'
                                                        : rep.blockedTimes >= 5 ? 'high'
                                                            : rep.blockedTimes >= 1 ? 'medium'
                                                                : 'low';
                                                    const threatStyle = {
                                                        critical: { label: 'Critical', badge: 'text-red-400 bg-red-500/10 border-red-500/20' },
                                                        high: { label: 'High', badge: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
                                                        medium: { label: 'Medium', badge: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
                                                        low: { label: 'Clean', badge: 'text-green-400 bg-green-500/10 border-green-500/20' },
                                                    }[threat];

                                                    const msAgo = Date.now() - new Date(rep.lastActivity).getTime();
                                                    const daysAgo = Math.floor(msAgo / 86400000);
                                                    const timeAgo = daysAgo > 1 ? `${daysAgo}d ago` : daysAgo === 1 ? 'Yesterday' : 'Today';

                                                    return (
                                                        <tr key={rep.ip} className="hover:bg-white/5 transition-colors group">
                                                            <td className="px-4 py-3">
                                                                <div className="flex items-center gap-2">
                                                                    <Globe size={14} className="text-on-surface-variant/50" />
                                                                    <span className="font-mono font-bold text-sm text-on-surface">{rep.ip}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                {rep.country ? (
                                                                    <div className="flex items-center gap-2 text-sm font-medium text-on-surface-variant">
                                                                        <MapPin size={14} className="text-on-surface-variant/50" />
                                                                        {rep.country}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-xs text-on-surface-variant/30 italic">—</span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3 text-xs text-on-surface-variant">
                                                                {rep.isp || rep.range || '—'}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${threatStyle.badge}`}>
                                                                    {threatStyle.label}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-xs font-mono text-on-surface-variant">
                                                                {rep.blockedTimes}× {rep.exponentialBlockedTimes > 0 && `(x${Math.pow(2, rep.exponentialBlockedTimes)} escalated)`}
                                                            </td>
                                                            <td className="px-4 py-3 text-xs font-mono text-on-surface-variant">
                                                                {timeAgo}
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <button
                                                                        onClick={async () => {
                                                                            if (!confirm(`Block ${rep.ip} permanently?`)) return;
                                                                            await trigger(() => DockerClient.blockIP({
                                                                                ip: rep.ip,
                                                                                protocol: 'tcp',
                                                                                comment: `Manual block from reputation: ${(rep.reasons ?? []).join(', ')}`.slice(0, 120)
                                                                            }), {
                                                                                onSuccess: fetchRules,
                                                                                successMessage: `${rep.ip} blocked`,
                                                                                errorMessage: 'Failed to block IP'
                                                                            });
                                                                        }}
                                                                        title="Block IP permanently"
                                                                        className="p-1.5 text-orange-400/70 hover:text-orange-400 hover:bg-orange-500/10 rounded-lg transition-all"
                                                                    >
                                                                        <Lock size={13} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteReputation(rep.ip)}
                                                                        title="Delete reputation record"
                                                                        className="p-1.5 text-on-surface-variant/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                                                    >
                                                                        <Trash2 size={13} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        );
                    })()}

                    {/* Pagination */}
                    <div className="flex items-center justify-center gap-3 py-2">
                        <button
                            disabled={repOffset === 0}
                            onClick={() => setRepOffset(Math.max(0, repOffset - repLimit))}
                            className="px-5 py-2.5 rounded-xl bg-surface border border-outline/10 text-sm font-bold disabled:opacity-40 hover:bg-white/5 disabled:cursor-not-allowed transition-colors"
                        >
                            ← Prev
                        </button>
                        <div className="px-5 py-2.5 bg-primary/10 border border-primary/20 rounded-xl text-sm font-black text-primary">
                            {repOffset + 1}–{repOffset + reputations.length}
                        </div>
                        <button
                            disabled={reputations.length < repLimit}
                            onClick={() => setRepOffset(repOffset + repLimit)}
                            className="px-5 py-2.5 rounded-xl bg-surface border border-outline/10 text-sm font-bold disabled:opacity-40 hover:bg-white/5 disabled:cursor-not-allowed transition-colors"
                        >
                            Next →
                        </button>
                    </div>
                </div>
            ) : activeTab === 'geolocation' ? (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
                    {/* Import header */}
                    <div className="bg-surface/30 border border-outline/10 rounded-2xl overflow-hidden">
                        <div className="flex flex-col md:flex-row md:items-center justify-between p-5 gap-4">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-secondary/10 rounded-2xl border border-secondary/20">
                                    <Globe size={22} className="text-secondary" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold flex items-center gap-3">
                                        IP Geolocation Data
                                        <span className="px-3 py-1 rounded-xl bg-secondary/10 border border-secondary/20 text-xs text-secondary font-bold">
                                            {ipRangesCount.toLocaleString()} Ranges
                                        </span>
                                    </h2>
                                    <p className="text-xs text-on-surface-variant/60 mt-0.5">Manage IP range databases for country/ISP identification</p>
                                </div>
                            </div>
                            <button onClick={() => setShowIpImportModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-secondary/10 hover:bg-secondary/20 border border-secondary/20 rounded-2xl text-sm font-bold text-secondary">
                                <Plus size={16} />
                                Import CSV
                            </button>
                        </div>
                        <div className="bg-black/20 px-5 py-3 border-t border-outline/5 flex flex-col md:flex-row items-center gap-3 flex-wrap">
                            <span className="text-xs font-bold text-on-surface-variant/70 uppercase">Auto-Fetch:</span>
                            {[
                                { id: 'cloudflare', name: 'CF', full: 'Cloudflare', color: 'text-[#F38020] border-[#F38020]/30 hover:bg-[#F38020]/20' },
                                { id: 'aws', name: 'AWS', full: 'AWS', color: 'text-[#FF9900] border-[#FF9900]/30 hover:bg-[#FF9900]/20' },
                                { id: 'google', name: 'GCP', full: 'Google', color: 'text-[#4285F4] border-[#4285F4]/30 hover:bg-[#4285F4]/20' },
                                { id: 'digitalocean', name: 'DO', full: 'DigitalOcean', color: 'text-[#0080FF] border-[#0080FF]/30 hover:bg-[#0080FF]/20' },
                                { id: 'github', name: 'GitHub', full: 'GitHub', color: 'text-[#24292F] border-[#24292F]/30 hover:bg-[#24292F]/20' }
                            ].map((p) => (
                                <button
                                    key={p.id}
                                    disabled={importingIpRanges}
                                    onClick={async () => {
                                        setImportingIpRanges(true);
                                        try {
                                            const res = await DockerClient.fetchIpRanges(p.id as any) as any;
                                            if (res?.status === 'success') {
                                                toast.success(`Fetched ${res.imported} ranges from ${p.full}`);
                                                fetchIpRangeStats(); fetchGeoRanges(0, geoSearch);
                                            } else { toast.error(res?.error || res?.message || `Failed to fetch ${p.full}`); }
                                        } catch (e: any) { toast.error(e?.message || 'Fetch failed'); }
                                        finally { setImportingIpRanges(false); }
                                    }}
                                    className={`px-4 py-2 rounded-xl border text-xs font-bold disabled:opacity-50 ${p.color}`}
                                >{p.name}</button>
                            ))}
                            <div className="flex gap-2 flex-1 min-w-0">
                                <input type="text" placeholder="https://example.com/ips.csv" id="custom-ip-url" className="flex-1 min-w-0 bg-black/20 border border-outline/10 rounded-xl px-4 py-2 text-sm" />
                                <button
                                    disabled={importingIpRanges}
                                    onClick={async () => {
                                        const url = (document.getElementById('custom-ip-url') as HTMLInputElement)?.value;
                                        if (!url) return toast.error('Enter a URL');
                                        setImportingIpRanges(true);
                                        try {
                                            const res = await DockerClient.fetchIpRanges('custom', url) as any;
                                            if (res?.status === 'success') {
                                                toast.success(`Fetched ${res.imported} ranges`);
                                                fetchIpRangeStats(); fetchGeoRanges(0, geoSearch);
                                            } else { toast.error(res?.error || res?.message || 'Fetch failed'); }
                                        } catch (e: any) { toast.error('Fetch failed'); }
                                        finally { setImportingIpRanges(false); }
                                    }}
                                    className="px-5 py-2 bg-secondary text-on-secondary rounded-xl text-sm font-bold disabled:opacity-50"
                                >Fetch</button>
                            </div>
                        </div>
                    </div>

                    {/* Range browser */}
                    <div className="bg-surface/30 border border-outline/10 rounded-2xl overflow-hidden">
                        {/* Search + refresh toolbar */}
                        <div className="flex items-center gap-3 p-4 border-b border-outline/5">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50" size={15} />
                                <input
                                    type="text"
                                    placeholder="Search CIDR, country, provider…"
                                    value={geoSearch}
                                    onChange={e => setGeoSearch(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && fetchGeoRanges(0, geoSearch)}
                                    className="w-full bg-surface border border-outline/20 rounded-xl py-2 pl-9 pr-4 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
                                />
                            </div>
                            <button
                                onClick={() => fetchGeoRanges(0, geoSearch)}
                                disabled={isGeoLoading}
                                className="p-2 bg-surface border border-outline/20 rounded-xl hover:bg-white/5 transition-colors disabled:opacity-50"
                            >
                                <RefreshCw size={15} className={isGeoLoading ? 'animate-spin' : ''} />
                            </button>
                            <span className="text-xs text-on-surface-variant/50 whitespace-nowrap">
                                {geoTotal.toLocaleString()} ranges
                            </span>
                        </div>

                        {/* Table */}
                        {geoRows.length === 0 && !isGeoLoading ? (
                            <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant/40">
                                <Globe size={48} className="mb-3 opacity-20" />
                                <span className="font-bold">{ipRangesCount === 0 ? 'No ranges imported yet' : 'No results match your search'}</span>
                                <span className="text-xs mt-1 opacity-60">{ipRangesCount === 0 ? 'Use Auto-Fetch or Import CSV above' : 'Try a different query'}</span>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-outline/10 bg-white/5">
                                            <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider">CIDR</th>
                                            <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider">Country</th>
                                            <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider">Provider</th>
                                            <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider">Type</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-outline/5">
                                        {geoRows.map(row => (
                                            <tr key={row.id} className="hover:bg-white/5 transition-colors">
                                                <td className="px-4 py-2.5 font-mono text-xs text-primary font-bold">{row.cidr || '—'}</td>
                                                <td className="px-4 py-2.5 text-xs">
                                                    {row.countryCode ? (
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold">{row.countryCode}</span>
                                                            {row.countryName && <span className="text-on-surface-variant/60">{row.countryName}</span>}
                                                        </div>
                                                    ) : <span className="text-on-surface-variant/30 italic">—</span>}
                                                </td>
                                                <td className="px-4 py-2.5 text-xs text-on-surface-variant">{row.provider || '—'}</td>
                                                <td className="px-4 py-2.5">
                                                    {row.type ? (
                                                        <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${row.type === 'hosting' ? 'bg-blue-500/10 text-blue-400' :
                                                            row.type === 'residential' ? 'bg-green-500/10 text-green-400' :
                                                                row.type === 'dynamic' ? 'bg-yellow-500/10 text-yellow-400' :
                                                                    'bg-surface text-on-surface-variant/60'
                                                            }`}>{row.type}</span>
                                                    ) : <span className="text-on-surface-variant/30 italic text-xs">—</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Pagination */}
                        {geoTotal > geoLimit && (
                            <div className="flex items-center justify-between px-4 py-3 border-t border-outline/5">
                                <button
                                    onClick={() => { const p = Math.max(0, geoPage - 1); setGeoPage(p); fetchGeoRanges(p, geoSearch); }}
                                    disabled={geoPage === 0 || isGeoLoading}
                                    className="px-4 py-1.5 text-xs font-bold rounded-xl bg-surface border border-outline/20 hover:bg-white/5 disabled:opacity-40"
                                >← Prev</button>
                                <span className="text-xs text-on-surface-variant/60">
                                    Page {geoPage + 1} of {Math.ceil(geoTotal / geoLimit)}
                                </span>
                                <button
                                    onClick={() => { const p = geoPage + 1; setGeoPage(p); fetchGeoRanges(p, geoSearch); }}
                                    disabled={(geoPage + 1) * geoLimit >= geoTotal || isGeoLoading}
                                    className="px-4 py-1.5 text-xs font-bold rounded-xl bg-surface border border-outline/20 hover:bg-white/5 disabled:opacity-40"
                                >Next →</button>
                            </div>
                        )}
                    </div>
                </div>
            ) : activeTab === 'jails' ? (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-5">
                    {/* Header + Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {(() => {
                            const jails = rules.filter(r => r.expiresAt != null && r.expiresAt > nowTick);
                            const proxyJails = jails.filter(j => j.comment?.toLowerCase().startsWith('proxy'));
                            const loginJails = jails.filter(j => j.comment?.toLowerCase().includes('login') || j.comment?.toLowerCase().includes('failed'));
                            const longestMs = jails.reduce((mx, j) => Math.max(mx, (j.expiresAt ?? 0) - nowTick), 0);
                            return (
                                <>
                                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400"><Lock size={18} /></div>
                                        <div>
                                            <div className="text-2xl font-black text-red-400">{jails.length}</div>
                                            <div className="text-[10px] uppercase font-bold text-on-surface-variant/60 tracking-wider">Active Jails</div>
                                        </div>
                                    </div>
                                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center text-orange-400"><Zap size={18} /></div>
                                        <div>
                                            <div className="text-2xl font-black text-orange-400">{proxyJails.length}</div>
                                            <div className="text-[10px] uppercase font-bold text-on-surface-variant/60 tracking-wider">Proxy Jails</div>
                                        </div>
                                    </div>
                                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center text-yellow-400"><AlertTriangle size={18} /></div>
                                        <div>
                                            <div className="text-2xl font-black text-yellow-400">{loginJails.length}</div>
                                            <div className="text-[10px] uppercase font-bold text-on-surface-variant/60 tracking-wider">Login Jails</div>
                                        </div>
                                    </div>
                                    <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary"><Clock size={18} /></div>
                                        <div>
                                            <div className="text-2xl font-black text-primary">{longestMs > 0 ? `${Math.ceil(longestMs / 60000)}m` : '—'}</div>
                                            <div className="text-[10px] uppercase font-bold text-on-surface-variant/60 tracking-wider">Max Remaining</div>
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                    </div>

                    {/* Toolbar */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50" size={16} />
                            <input
                                type="text"
                                placeholder="Search IP, reason, country, ISP…"
                                value={jailSearch}
                                onChange={e => setJailSearch(e.target.value)}
                                className="w-full bg-surface border border-outline/20 rounded-xl py-2 pl-9 pr-4 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Filter size={14} className="text-on-surface-variant/50 shrink-0" />
                            {(['all', 'proxy', 'login', 'other'] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setJailFilter(f)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${jailFilter === f ? 'bg-primary text-on-primary' : 'bg-surface border border-outline/20 text-on-surface-variant hover:bg-white/5'
                                        }`}
                                >{f}</button>
                            ))}
                        </div>
                        <button
                            onClick={() => setShowManualJailModal(true)}
                            className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0"
                        >
                            <UserX size={16} />
                            Manual Jail
                        </button>
                        <button onClick={fetchRules} className="p-2 bg-surface border border-outline/20 rounded-xl hover:bg-white/5 transition-colors shrink-0">
                            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    {/* Jail List */}
                    {(() => {
                        const jailEntries = rules.filter(r => r.expiresAt != null && r.expiresAt > nowTick);
                        const filtered = jailEntries.filter(j => {
                            const q = jailSearch.toLowerCase();
                            const matchesSearch = !q || j.ip.includes(q) || (j.comment?.toLowerCase().includes(q)) || (j.country?.toLowerCase().includes(q)) || (j.isp?.toLowerCase().includes(q));
                            let matchesFilter = true;
                            if (jailFilter === 'proxy') matchesFilter = j.comment?.toLowerCase().startsWith('proxy') ?? false;
                            else if (jailFilter === 'login') matchesFilter = (j.comment?.toLowerCase().includes('login') || j.comment?.toLowerCase().includes('failed')) ?? false;
                            else if (jailFilter === 'other') matchesFilter = !(j.comment?.toLowerCase().startsWith('proxy')) && !(j.comment?.toLowerCase().includes('login') || j.comment?.toLowerCase().includes('failed'));
                            return matchesSearch && matchesFilter;
                        });

                        if (filtered.length === 0) {
                            return (
                                <div className="flex flex-col items-center justify-center py-24 text-on-surface-variant/30 border-2 border-dashed border-outline/10 rounded-2xl bg-surface/20">
                                    <Lock size={56} className="mb-4 opacity-20" />
                                    <span className="text-lg font-bold">{jailEntries.length === 0 ? 'No active jails' : 'No jails match filter'}</span>
                                    <span className="text-sm mt-1 opacity-60">{jailEntries.length === 0 ? 'All IPs roam free for now.' : 'Try adjusting the search or filter.'}</span>
                                </div>
                            );
                        }

                        return (
                            <div className="space-y-2">
                                {filtered.map(jail => {
                                    const msLeft = (jail.expiresAt ?? 0) - nowTick;
                                    const totalMs = (jail.expiresAt ?? 0) - jail.createdAt;
                                    const pct = totalMs > 0 ? Math.max(0, Math.min(100, (msLeft / totalMs) * 100)) : 0;
                                    const minsLeft = Math.floor(msLeft / 60000);
                                    const secsLeft = Math.floor((msLeft % 60000) / 1000);
                                    const hoursLeft = Math.floor(minsLeft / 60);
                                    const displayTime = hoursLeft > 0
                                        ? `${hoursLeft}h ${minsLeft % 60}m`
                                        : minsLeft > 0
                                            ? `${minsLeft}m ${secsLeft}s`
                                            : `${secsLeft}s`;

                                    const isProxy = jail.comment?.toLowerCase().startsWith('proxy');
                                    const isLogin = jail.comment?.toLowerCase().includes('login') || jail.comment?.toLowerCase().includes('failed');
                                    const reasonColor = isProxy ? 'text-orange-400 bg-orange-500/10 border-orange-500/20'
                                        : isLogin ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
                                            : 'text-blue-400 bg-blue-500/10 border-blue-500/20';
                                    const reasonLabel = isProxy ? 'Proxy' : isLogin ? 'Login' : 'Manual';

                                    return (
                                        <div key={jail.id} className="group relative p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-red-500/20 hover:bg-red-500/[0.03] transition-all">
                                            {/* Progress bar */}
                                            <div className="absolute bottom-0 left-0 h-[2px] bg-red-500/30 rounded-bl-2xl transition-all duration-1000" style={{ width: `${pct}%` }} />

                                            <div className="flex items-center gap-4">
                                                {/* Icon */}
                                                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/10 flex items-center justify-center text-red-500 group-hover:scale-105 transition-transform shrink-0">
                                                    <Lock size={18} />
                                                </div>

                                                {/* IP + Meta */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-mono font-bold text-sm text-on-surface">{jail.ip}</span>
                                                        {jail.country && (
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-on-surface-variant font-bold uppercase tracking-wider">
                                                                {jail.country}
                                                            </span>
                                                        )}
                                                        {jail.city && (
                                                            <span className="text-[10px] text-on-surface-variant/40">{jail.city}</span>
                                                        )}
                                                        {jail.asn && (
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-on-surface-variant font-bold uppercase tracking-wider">
                                                                {jail.asn}
                                                            </span>
                                                        )}
                                                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${reasonColor}`}>
                                                            {reasonLabel}
                                                        </span>
                                                    </div>
                                                    <div className="mt-1 text-xs text-on-surface-variant/50 truncate" title={jail.comment}>
                                                        {jail.comment || '—'}
                                                    </div>
                                                    {jail.isp && <div className="text-[10px] text-on-surface-variant/30 mt-0.5 truncate">ISP: {jail.isp}</div>}
                                                </div>

                                                {/* Countdown */}
                                                <div className="text-right shrink-0">
                                                    <div className="flex items-center gap-1.5 justify-end text-red-400">
                                                        <Timer size={12} />
                                                        <span className="font-mono font-black text-sm tabular-nums">{displayTime}</span>
                                                    </div>
                                                    <div className="text-[9px] uppercase font-bold text-on-surface-variant/30 tracking-wider mt-0.5">remaining</div>
                                                </div>

                                                {/* Release */}
                                                <button
                                                    onClick={() => handleDelete(jail.id)}
                                                    title="Release IP"
                                                    className="p-2 hover:bg-red-500/15 text-red-400/60 hover:text-red-400 rounded-xl transition-all opacity-0 group-hover:opacity-100 shrink-0"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })()}

                    {/* Manual Jail Modal */}
                    {showManualJailModal && (
                        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowManualJailModal(false)}>
                            <div className="bg-surface border border-outline/20 rounded-3xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500"><UserX size={20} /></div>
                                    <div>
                                        <h3 className="text-lg font-bold">Manual Jail</h3>
                                        <p className="text-xs text-on-surface-variant">Temporarily block an IP address</p>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">IP Address</label>
                                        <input
                                            type="text"
                                            value={manualJailIp}
                                            onChange={e => setManualJailIp(e.target.value)}
                                            placeholder="e.g. 1.2.3.4"
                                            className="w-full bg-on-surface/5 border border-outline/10 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-red-500/50 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Duration</label>
                                        <div className="flex gap-2">
                                            {['15', '30', '60', '120', '1440'].map(d => (
                                                <button
                                                    key={d}
                                                    onClick={() => setManualJailDuration(d)}
                                                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${manualJailDuration === d ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'border-outline/10 text-on-surface-variant hover:bg-white/5'
                                                        }`}
                                                >
                                                    {d === '1440' ? '1d' : `${d}m`}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Reason</label>
                                        <input
                                            type="text"
                                            value={manualJailReason}
                                            onChange={e => setManualJailReason(e.target.value)}
                                            placeholder="Optional reason…"
                                            className="w-full bg-on-surface/5 border border-outline/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-500/50 transition-colors"
                                        />
                                    </div>
                                    <div className="flex gap-3 pt-2">
                                        <button
                                            disabled={isManualJailing || !manualJailIp.trim()}
                                            onClick={async () => {
                                                if (!manualJailIp.trim()) return;
                                                setIsManualJailing(true);
                                                try {
                                                    await DockerClient.blockIP({
                                                        ip: manualJailIp.trim(),
                                                        protocol: 'tcp',
                                                        comment: manualJailReason || 'Manual jail',
                                                        expiresAt: Date.now() + parseInt(manualJailDuration) * 60000
                                                    });
                                                    toast.success(`${manualJailIp} jailed for ${manualJailDuration}m`);
                                                    setShowManualJailModal(false);
                                                    setManualJailIp('');
                                                    setManualJailReason('');
                                                    fetchRules();
                                                } catch (e: any) {
                                                    toast.error(e?.message || 'Failed to jail IP');
                                                } finally {
                                                    setIsManualJailing(false);
                                                }
                                            }}
                                            className="flex-1 flex items-center justify-center gap-2 bg-red-500 text-white py-3 rounded-2xl font-bold text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
                                        >
                                            {isManualJailing ? <RefreshCw size={16} className="animate-spin" /> : <Lock size={16} />}
                                            {isManualJailing ? 'Jailing…' : 'Jail IP'}
                                        </button>
                                        <button onClick={() => setShowManualJailModal(false)} className="px-5 py-3 bg-on-surface/5 rounded-2xl font-bold text-sm hover:bg-on-surface/10">Cancel</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : activeTab === 'proxy-rules' ? (
                <ProxyRulesTab
                    proxyConfig={proxyConfig}
                    setProxyConfig={setProxyConfig}
                    updateProxySecurity={updateProxySecurity}
                />
            ) : activeTab === 'iptables' ? (
                <div className="flex flex-col flex-1 h-[600px] bg-black/40 rounded-3xl border border-outline/10 overflow-hidden mb-8">
                    {!isIptablesRaw ? (
                        <div className="flex h-full">
                            {/* Chains Sidebar */}
                            <div className="w-64 border-r border-outline/10 flex flex-col bg-white/5">
                                <div className="p-4 border-b border-outline/10 flex items-center justify-between bg-white/5">
                                    <div className="flex items-center gap-2">
                                        <Activity className="text-primary" size={16} />
                                        <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Filter Chains</span>
                                    </div>
                                    <button
                                        onClick={() => setIsIptablesRaw(true)}
                                        className="text-[10px] font-bold text-primary hover:underline"
                                    >
                                        Raw View
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                                    {Object.keys(iptables).map(chain => (
                                        <button
                                            key={chain}
                                            onClick={() => setExpandedChain(chain)}
                                            className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${expandedChain === chain ? 'bg-primary/20 text-primary border border-primary/20' : 'hover:bg-white/5 text-on-surface-variant'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-2 h-2 rounded-full ${expandedChain === chain ? 'bg-primary' : 'bg-white/10'}`} />
                                                <span className="text-xs font-bold truncate">{chain}</span>
                                            </div>
                                            <span className="text-[10px] font-mono opacity-40">{iptables[chain].length}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Rules Content */}
                            <div className="flex-1 flex flex-col overflow-hidden">
                                <div className="p-4 border-b border-outline/10 bg-white/2 flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <h3 className="text-lg font-bold flex items-center gap-2 leading-none">
                                            <Terminal size={18} className="text-primary" />
                                            Chain <span className="text-primary">{expandedChain || 'None'}</span>
                                        </h3>
                                        <span className="text-[10px] uppercase font-bold text-on-surface-variant/40 tracking-wider mt-1.5 ml-0.5">Active packet filtering rules</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-outline/5 flex items-center gap-2">
                                            <Database size={14} className="text-blue-400" />
                                            <span className="text-xs font-mono font-bold text-blue-400">
                                                {iptables[expandedChain || '']?.reduce((acc, r) => acc + (parseInt(r.pkts) || 0), 0).toLocaleString() ?? 0} <span className="text-[10px] opacity-40">PKTS</span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-auto custom-scrollbar">
                                    {!expandedChain || !iptables[expandedChain] ? (
                                        <div className="flex flex-col items-center justify-center h-full text-on-surface-variant/50 gap-2">
                                            <ShieldAlert size={48} className="opacity-20" />
                                            <p className="font-bold">No chain data available</p>
                                            <p className="text-xs">Check server logs or permissions (iptables access required)</p>
                                        </div>
                                    ) : (
                                        <table className="w-full text-left border-collapse">
                                            <thead className="sticky top-0 bg-surface z-10">
                                                <tr className="border-b border-outline/10">
                                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/40 tracking-wider">Target</th>
                                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/40 tracking-wider">Proto</th>
                                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/40 tracking-wider">Source</th>
                                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/40 tracking-wider">Destination</th>
                                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/40 tracking-wider">Extra Information</th>
                                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/40 tracking-wider text-right">Activity</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-outline/5">
                                                {iptables[expandedChain].map((rule, i) => (
                                                    <tr key={i} className="hover:bg-white/2 transition-colors group">
                                                        <td className="px-4 py-3">
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${rule.target === 'DROP' || rule.target === 'REJECT' ? 'bg-red-500/20 text-red-500' :
                                                                rule.target === 'ACCEPT' ? 'bg-green-500/20 text-green-500' :
                                                                    'bg-primary/20 text-primary'
                                                                }`}>
                                                                {rule.target}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-xs font-mono font-bold text-on-surface-variant uppercase">{rule.prot}</td>
                                                        <td className="px-4 py-3 text-xs font-mono font-medium text-primary">
                                                            {rule.extra?.includes('match-set') ? (
                                                                <div className="flex items-center gap-1.5">
                                                                    <Database size={10} className="text-secondary opacity-70" />
                                                                    <span className="font-bold text-secondary text-[10px]">
                                                                        {rule.extra.match(/match-set\s+(\S+)/)?.[1] ?? 'Unknown Set'}
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                rule.source === '0.0.0.0/0' ? <span className="opacity-50 italic">Anywhere</span> : rule.source
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-xs font-mono font-medium text-on-surface-variant">
                                                            {rule.destination === '0.0.0.0/0' ? <span className="opacity-50 italic">Anywhere</span> : rule.destination}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="max-w-md truncate text-[10px] font-bold text-on-surface-variant/60 group-hover:text-on-surface-variant transition-colors">
                                                                {rule.extra?.replace(/match-set\s+\S+\s+src/, '') || '--'}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            <div className="flex flex-col items-end gap-0.5">
                                                                <div className="flex items-center gap-1.5 text-[10px] font-bold">
                                                                    <span className="text-on-surface-variant/30 uppercase tracking-tighter">P:</span>
                                                                    <span className="text-primary">{rule.pkts}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5 text-[10px] font-bold">
                                                                    <span className="text-on-surface-variant/30 uppercase tracking-tighter">B:</span>
                                                                    <span className="text-blue-400">{rule.bytes}</span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full">
                            <div className="p-4 border-b border-outline/10 bg-white/2 flex items-center justify-between">
                                <div className="flex flex-col">
                                    <h3 className="text-lg font-bold flex items-center gap-2 leading-none">
                                        <Terminal size={18} className="text-primary" />
                                        Raw <span className="text-primary">iptables-save</span> Output
                                    </h3>
                                    <span className="text-[10px] uppercase font-bold text-on-surface-variant/40 tracking-wider mt-1.5 ml-0.5">Current iptables configuration in raw format</span>
                                </div>
                                <button
                                    onClick={() => setIsIptablesRaw(false)}
                                    className="text-[10px] font-bold text-primary hover:underline"
                                >
                                    Visual View
                                </button>
                            </div>
                            <div className="flex-1 overflow-auto custom-scrollbar p-6 bg-black/20">
                                <pre className="text-xs font-mono text-primary/80 leading-relaxed whitespace-pre">
                                    {iptablesRaw || 'No raw iptables data available.'}
                                </pre>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col flex-1 bg-black/40 rounded-3xl border border-outline/10 overflow-hidden mb-8 h-[600px]">
                    <div className="p-4 border-b border-outline/10 bg-white/2 flex items-center justify-between">
                        <div className="flex flex-col">
                            <h3 className="text-lg font-bold flex items-center gap-2 leading-none">
                                <Terminal size={18} className="text-primary" />
                                {isNftablesRaw ? 'Raw nftables Ruleset' : 'Visual nftables Inspector'}
                            </h3>
                            <span className="text-[10px] uppercase font-bold text-on-surface-variant/40 tracking-wider mt-1.5 ml-0.5">
                                {isNftablesRaw ? 'Current netfilter ruleset configuration' : 'Interactive view of netfilter tables and chains'}
                            </span>
                        </div>
                        <button
                            onClick={() => setIsNftablesRaw(!isNftablesRaw)}
                            className="text-[10px] font-bold text-primary hover:underline"
                        >
                            {isNftablesRaw ? 'Visual View' : 'Raw View'}
                        </button>
                    </div>

                    <div className="flex-1 overflow-auto custom-scrollbar">
                        {isNftablesRaw ? (
                            <div className="p-6 bg-black/20">
                                <pre className="text-xs font-mono text-primary/80 leading-relaxed whitespace-pre">
                                    {nftables || 'No nftables data available. Ensure nftables is installed and active.'}
                                </pre>
                            </div>
                        ) : (
                            <div className="p-6">
                                {!nftablesJson || !nftablesJson.nftables ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant/50">
                                        <Activity size={48} className="mb-4 opacity-20" />
                                        <p className="font-bold">No structured nftables data</p>
                                        <p className="text-xs">Parsing JSON failed or nftables is not configured</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* Group by tables */}
                                        {nftablesJson.nftables.filter((obj: any) => obj.table).map((tableObj: any) => {
                                            const table = tableObj.table;
                                            const chains = nftablesJson.nftables.filter((obj: any) => obj.chain && obj.chain.table === table.name && obj.chain.family === table.family);

                                            return (
                                                <div key={`${table.family}-${table.name}`} className="bg-surface/30 border border-outline/10 rounded-2xl overflow-hidden">
                                                    <div className="p-4 bg-primary/10 border-b border-outline/10 flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary text-[10px] font-black uppercase">
                                                                {table.family}
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="text-xs font-black uppercase tracking-widest text-on-surface/80">Table: {table.name}</span>
                                                                <span className="text-[8px] font-bold text-on-surface-variant/50 uppercase tracking-tighter">Handle: {table.handle}</span>
                                                            </div>
                                                        </div>
                                                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-white/5 text-on-surface-variant">{chains.length} Chains</span>
                                                    </div>

                                                    <div className="divide-y divide-outline/5">
                                                        {chains.map((chainObj: any) => {
                                                            const chain = chainObj.chain;
                                                            const rules = nftablesJson.nftables.filter((obj: any) => obj.rule && obj.rule.table === table.name && obj.rule.chain === chain.name);

                                                            return (
                                                                <div key={chain.name} className="p-4 hover:bg-white/[0.02] transition-colors">
                                                                    <div className="flex items-center justify-between mb-3">
                                                                        <div className="flex items-center gap-2">
                                                                            <ChevronRight size={14} className="text-primary/40" />
                                                                            <span className="text-sm font-bold">{chain.name}</span>
                                                                            {chain.type && (
                                                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 uppercase">
                                                                                    {chain.type}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            {chain.policy && (
                                                                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${chain.policy === 'accept' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                                                                    Policy: {chain.policy}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    <div className="space-y-1.5 pl-6 border-l border-outline/5 ml-1.5">
                                                                        {rules.length === 0 ? (
                                                                            <span className="text-[10px] italic text-on-surface-variant/40">No rules defined</span>
                                                                        ) : (
                                                                            rules.map((ruleObj: any, ruleIdx: number) => {
                                                                                const rule = ruleObj.rule;
                                                                                const stringifyNft = (v: any): string => {
                                                                                    if (typeof v !== 'object' || v === null) return String(v);
                                                                                    if (v.payload) return `${v.payload.protocol} ${v.payload.field}`;
                                                                                    if (v.meta) return v.meta.key;
                                                                                    if (v.ct) return `ct ${v.ct.key}`;
                                                                                    if (v.prefix) return `${v.prefix.addr}/${v.prefix.len}`;
                                                                                    if (v.range) return `${v.range[0]}-${v.range[1]}`;
                                                                                    if (v.set) return `@${v.set}`;
                                                                                    if (v.immediate) return String(v.immediate.data);
                                                                                    if (v.iifname) return `iif ${v.iifname}`;
                                                                                    if (v.oifname) return `oif ${v.oifname}`;

                                                                                    // Generic key-value if only one key exists
                                                                                    const keys = Object.keys(v);
                                                                                    if (keys.length === 1) return `${keys[0]} ${v[keys[0]]}`;

                                                                                    return JSON.stringify(v);
                                                                                };

                                                                                const exprStr = rule.expr
                                                                                    ? rule.expr.map((e: any) => {
                                                                                        const key = Object.keys(e)[0];
                                                                                        const val = e[key];
                                                                                        if (key === 'match') return `${stringifyNft(val.left)} ${val.op} ${stringifyNft(val.right)}`;
                                                                                        if (key === 'accept') return 'accept';
                                                                                        if (key === 'drop') return 'drop';
                                                                                        if (key === 'reject') return 'reject';
                                                                                        if (key === 'counter') return 'counter';
                                                                                        if (key === 'log') return 'log';
                                                                                        if (key === 'target') return val.name || key;
                                                                                        if (key === 'limit') return `limit ${val.rate}${val.unit}`;
                                                                                        if (key === 'lookup') return `${stringifyNft(val.map)} @${val.set}`;
                                                                                        if (key === 'mangle') return `mangle ${stringifyNft(val.key)} set ${stringifyNft(val.value)}`;
                                                                                        return key;
                                                                                    }).join(' ')
                                                                                    : '...';

                                                                                return (
                                                                                    <div key={ruleIdx} className="group relative flex items-start gap-3 py-1">
                                                                                        <span className="text-[9px] font-mono text-on-surface-variant/30 mt-0.5 font-bold">[{rule.handle}]</span>
                                                                                        <code className="text-[11px] font-mono text-primary/70 break-all leading-tight">
                                                                                            {exprStr}
                                                                                        </code>
                                                                                    </div>
                                                                                );
                                                                            })
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div >
            )
            }

            {isAddModalOpen && (
                <AddBlockModal
                    onClose={() => setIsAddModalOpen(false)}
                    onAdded={() => { setIsAddModalOpen(false); fetchRules(); }}
                />
            )}

            {showIpImportModal && (
                <Modal
                    onClose={() => setShowIpImportModal(false)}
                    title="Import IP Range Data"
                    description="CSV: cidr, country_code, country_name, provider, type"
                    icon={<Globe size={24} />}
                    maxWidth="max-w-2xl"
                    className="flex flex-col"
                >
                    <div className="flex-1 overflow-y-auto mt-4 pr-2 custom-scrollbar">
                        <div className="mb-4">
                            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">CSV Content (One range per line)</label>
                            <textarea
                                className="w-full h-80 bg-on-surface/5 border border-outline/10 rounded-2xl p-4 text-sm font-mono focus:outline-none focus:border-secondary/50 resize-none"
                                placeholder="8.8.8.0/24, US, United States, Google, hosting&#10;1.1.1.0/24, AU, Australia, Cloudflare, hosting"
                                value={ipCsv}
                                onChange={(e) => setIpCsv(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-3 bg-secondary/5 p-4 rounded-2xl border border-secondary/10 mb-6 text-on-surface-variant">
                            <Info size={20} className="text-secondary shrink-0" />
                            <p className="text-xs leading-relaxed">IPv4 and IPv6 CIDR notations are supported. Empty or invalid lines are skipped.</p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                disabled={importingIpRanges || !ipCsv.trim()}
                                onClick={async () => {
                                    setImportingIpRanges(true);
                                    try {
                                        const res = await DockerClient.importIpRanges(ipCsv) as any;
                                        if (res?.status === 'success') {
                                            toast.success(`Imported ${res.imported} ranges`);
                                            setShowIpImportModal(false);
                                            setIpCsv('');
                                            fetchIpRangeStats();
                                        } else {
                                            toast.error(res?.error || 'Import failed');
                                        }
                                    } catch (e) {
                                        toast.error('Import failed');
                                    } finally {
                                        setImportingIpRanges(false);
                                    }
                                }}
                                className="flex-1 flex items-center justify-center gap-2 bg-primary text-on-primary py-3.5 rounded-2xl font-bold text-sm hover:opacity-90 disabled:opacity-50"
                            >
                                {importingIpRanges ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                                {importingIpRanges ? 'Importing...' : 'Confirm Import'}
                            </button>
                            <button onClick={() => setShowIpImportModal(false)} className="px-6 py-3.5 bg-on-surface/5 rounded-2xl font-bold text-sm hover:bg-on-surface/10">
                                Cancel
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div >
    );
}

function AddBlockModal({ onClose, onAdded }: { onClose: () => void, onAdded: () => void }) {
    const [ip, setIp] = useState('');
    const [port, setPort] = useState('');
    const [comment, setComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!ip) return;

        setIsSubmitting(true);
        const portNum = port.trim() ? parseInt(port, 10) : undefined;
        const success = await DockerClient.blockIP({
            ip,
            port: (portNum !== undefined && !isNaN(portNum)) ? portNum : undefined,
            comment: comment || undefined,
            protocol: 'TCP'
        });

        if (success) {
            toast.success(`IP ${ip} blocked successfully`);
            onAdded();
        } else {
            toast.error('Failed to block IP. Ensure container has NET_ADMIN capability.');
        }
        setIsSubmitting(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-surface border border-outline/20 rounded-3xl w-full max-w-md shadow-2xl overflow-y-auto animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b border-outline/10 flex items-center justify-between bg-primary/5">
                    <div className="flex items-center gap-3">
                        <Lock className="text-primary" size={24} />
                        <h2 className="text-xl font-bold">Block IP Address</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <Plus size={24} className="rotate-45" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1.5 ml-1">IP Address</label>
                        <input
                            autoFocus
                            required
                            type="text"
                            placeholder="e.g. 1.2.3.4"
                            value={ip}
                            onChange={(e) => setIp(e.target.value)}
                            className="w-full bg-white/5 border border-outline/20 rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary transition-all font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1.5 ml-1">Port (Optional)</label>
                        <input
                            type="text"
                            placeholder="e.g. 22 or 8080 (Leave empty for all ports)"
                            value={port}
                            onChange={(e) => setPort(e.target.value)}
                            className="w-full bg-white/5 border border-outline/20 rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary transition-all font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1.5 ml-1">Comment</label>
                        <textarea
                            placeholder="Reason for blocking..."
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="w-full bg-white/5 border border-outline/20 rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary transition-all min-h-[80px] resize-none"
                        />
                    </div>

                    <div className="pt-2 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 rounded-xl border border-outline/20 hover:bg-white/5 transition-all font-bold"
                        >
                            Cancel
                        </button>
                        <button
                            disabled={isSubmitting || !ip}
                            type="submit"
                            className="flex-1 bg-primary text-on-primary px-4 py-2.5 rounded-xl font-bold hover:opacity-90 transition-all disabled:opacity-50"
                        >
                            {isSubmitting ? 'Blocking...' : 'Block IP'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
