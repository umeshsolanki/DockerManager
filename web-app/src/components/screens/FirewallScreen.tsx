'use client';

import React, { useEffect, useState } from 'react';
import { Shield, ShieldAlert, ShieldCheck, Trash2, Plus, Search, RefreshCw, Globe, Lock, Activity, Terminal, ChevronRight, ListFilter, Database, MapPin, Save, Info, Settings } from 'lucide-react';
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
    const [iptables, setIptables] = useState<Record<string, IptablesRule[]>>({});
    const [iptablesRaw, setIptablesRaw] = useState<string>('');
    const [isIptablesRaw, setIsIptablesRaw] = useState(false);
    const [nftables, setNftables] = useState<string>('');
    const [nftablesJson, setNftablesJson] = useState<any>(null);
    const [isNftablesRaw, setIsNftablesRaw] = useState(false);
    const [expandedChain, setExpandedChain] = useState<string | null>('INPUT');

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

    useEffect(() => {
        fetchRules();
    }, []);

    useEffect(() => {
        if (activeTab === 'reputation' || activeTab === 'geolocation') {
            fetchIpRangeStats();
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

            {(activeTab === 'rules' || activeTab === 'reputation' || activeTab === 'geolocation') && (
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
                            <div className="text-2xl font-bold">{activeTab === 'reputation' ? reputations.length : 'Active'}</div>
                            <div className="text-xs text-on-surface-variant uppercase font-bold tracking-wider">{activeTab === 'reputation' ? 'Tracked IPs' : 'Status'}</div>
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
                <>
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-6">
                        <div className="relative flex-1 w-full md:w-96">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50" size={20} />
                            <input
                                type="text"
                                placeholder="Search IP, country, ISP, range or reason..."
                                value={repSearch}
                                onChange={(e) => setRepSearch(e.target.value)}
                                className="w-full bg-surface border border-outline/20 rounded-xl py-2 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-on-surface-variant uppercase">Show:</span>
                            <select value={repLimit} onChange={(e) => setRepLimit(Number(e.target.value))} className="bg-surface border border-outline/20 rounded-xl px-4 py-2 text-sm font-bold">
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                                <option value={500}>500</option>
                            </select>
                        </div>
                        <button onClick={fetchReputations} disabled={isRepLoading} className="p-2 bg-surface border border-outline/20 rounded-xl hover:bg-white/5 transition-colors disabled:opacity-50">
                            <RefreshCw size={20} className={isRepLoading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                    <div className="bg-black/40 border border-outline/10 rounded-2xl overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-outline/10 bg-white/5">
                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider">IP Address</th>
                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider">Country</th>
                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider">ISP / Range Provider</th>
                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider">First Appeared</th>
                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider text-center">Blocked</th>
                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider">Last Activity</th>
                                    <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/50 tracking-wider text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-outline/5">
                                {reputations.map((rep) => (
                                    <tr key={rep.ip} className="hover:bg-white/5 transition-colors group">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className={`p-1.5 rounded-lg ${rep.blockedTimes > 0 ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                                                    {rep.blockedTimes > 0 ? <Shield size={14} /> : <Activity size={14} />}
                                                </div>
                                                <span className="font-mono font-bold text-sm text-primary">{rep.ip}</span>
                                            </div>
                                            {rep.reasons && rep.reasons.length > 0 && (
                                                <span className="text-[10px] text-on-surface-variant/70 truncate max-w-[180px] block mt-0.5" title={rep.reasons.join(', ')}>
                                                    {rep.reasons[0]}{rep.reasons.length > 1 && ` +${rep.reasons.length - 1}`}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {rep.country ? (
                                                <div className="flex items-center gap-2 text-sm font-medium text-on-surface-variant">
                                                    <MapPin size={14} className="opacity-70" />
                                                    {rep.country}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-on-surface-variant/30 italic">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {(rep.range || rep.isp) ? (
                                                <span className="text-xs font-medium text-on-surface-variant truncate max-w-[180px] block" title={[rep.range, rep.isp].filter(Boolean).join(' · ')}>
                                                    {rep.range && <span className="uppercase font-bold text-primary/90">{rep.range}</span>}
                                                    {rep.range && rep.isp && <span className="text-on-surface-variant/60 mx-1">·</span>}
                                                    {rep.isp && <span>{rep.isp}</span>}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-on-surface-variant/30 italic">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-on-surface-variant">
                                            {new Date(rep.firstObserved).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`font-bold ${rep.blockedTimes > 0 ? 'text-red-500' : 'text-on-surface-variant/40'}`}>{rep.blockedTimes}</span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-on-surface-variant">
                                            {new Date(rep.lastActivity).toLocaleString()}
                                            {rep.lastBlocked && (
                                                <div className="text-red-400/80 mt-0.5">Blocked: {new Date(rep.lastBlocked).toLocaleString()}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button onClick={() => handleDeleteReputation(rep.ip)} className="p-1.5 text-on-surface-variant hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100" title="Delete record">
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {reputations.length === 0 && !isRepLoading && (
                        <div className="flex flex-col items-center justify-center py-24 text-on-surface-variant/40 border-2 border-dashed border-outline/10 rounded-2xl bg-surface/30">
                            <Globe size={64} className="mb-4 opacity-30" />
                            <span className="text-lg font-bold">No reputation records found</span>
                            <span className="text-sm mt-1">IPs will appear when activity or blocks are recorded.</span>
                        </div>
                    )}
                    <div className="flex justify-center gap-3 py-4">
                        <button disabled={repOffset === 0} onClick={() => setRepOffset(Math.max(0, repOffset - repLimit))} className="px-6 py-3 rounded-2xl bg-surface border border-outline/10 text-sm font-bold disabled:opacity-40 hover:bg-white/5 disabled:cursor-not-allowed">
                            Previous
                        </button>
                        <div className="px-6 py-3 bg-primary/10 border border-primary/20 rounded-2xl text-sm font-black text-primary">
                            {repOffset} - {repOffset + repLimit}
                        </div>
                        <button disabled={reputations.length < repLimit} onClick={() => setRepOffset(repOffset + repLimit)} className="px-6 py-3 rounded-2xl bg-surface border border-outline/10 text-sm font-bold disabled:opacity-40 hover:bg-white/5 disabled:cursor-not-allowed">
                            Next
                        </button>
                    </div>
                </>
            ) : activeTab === 'geolocation' ? (
                <div className="bg-surface/30 border border-outline/10 rounded-2xl overflow-hidden">
                    <div className="flex flex-col md:flex-row md:items-center justify-between p-6 gap-4">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-secondary/10 rounded-2xl border border-secondary/20">
                                <Globe size={24} className="text-secondary" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold flex items-center gap-3">
                                    IP Geolocation Data
                                    <span className="px-3 py-1 rounded-xl bg-secondary/10 border border-secondary/20 text-xs text-secondary font-bold">
                                        {ipRangesCount.toLocaleString()} Ranges
                                    </span>
                                </h2>
                                <p className="text-xs text-on-surface-variant/60 mt-1">Manage IP range databases for country/ISP identification</p>
                            </div>
                        </div>
                        <button onClick={() => setShowIpImportModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-secondary/10 hover:bg-secondary/20 border border-secondary/20 rounded-2xl text-sm font-bold text-secondary">
                            <Plus size={16} />
                            Import CSV
                        </button>
                    </div>
                    <div className="bg-black/20 px-6 py-4 border-t border-outline/5 flex flex-col md:flex-row items-center gap-4 flex-wrap">
                        <span className="text-xs font-bold text-on-surface-variant/70 uppercase">Auto-Fetch:</span>
                        {[
                            { id: 'cloudflare', name: 'CF', full: 'Cloudflare', color: 'text-[#F38020] border-[#F38020]/30 hover:bg-[#F38020]/20' },
                            { id: 'aws', name: 'AWS', full: 'AWS', color: 'text-[#FF9900] border-[#FF9900]/30 hover:bg-[#FF9900]/20' },
                            { id: 'google', name: 'GCP', full: 'Google', color: 'text-[#4285F4] border-[#4285F4]/30 hover:bg-[#4285F4]/20' },
                            { id: 'digitalocean', name: 'DO', full: 'DigitalOcean', color: 'text-[#0080FF] border-[#0080FF]/30 hover:bg-[#0080FF]/20' }
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
                                            fetchIpRangeStats();
                                        } else {
                                            toast.error(res?.error || res?.message || `Failed to fetch ${p.full}`);
                                        }
                                    } catch (e: any) {
                                        toast.error(e?.message || 'Fetch failed');
                                    } finally {
                                        setImportingIpRanges(false);
                                    }
                                }}
                                className={`px-4 py-2 rounded-xl border text-xs font-bold disabled:opacity-50 ${p.color}`}
                            >
                                {p.name}
                            </button>
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
                                            fetchIpRangeStats();
                                        } else {
                                            toast.error(res?.error || res?.message || 'Fetch failed');
                                        }
                                    } catch (e: any) {
                                        toast.error('Fetch failed');
                                    } finally {
                                        setImportingIpRanges(false);
                                    }
                                }}
                                className="px-5 py-2 bg-secondary text-on-secondary rounded-xl text-sm font-bold disabled:opacity-50"
                            >
                                Fetch
                            </button>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'jails' ? (
                <div className="bg-surface/30 border border-outline/10 rounded-2xl p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-xl font-bold">Active Shield Jails</h3>
                            <p className="text-[10px] text-on-surface-variant uppercase font-black tracking-widest mt-1 opacity-50">Temporary Incarcerations</p>
                        </div>
                        <div className="p-3 bg-red-500/10 text-red-500 rounded-2xl">
                            <Lock size={24} />
                        </div>
                    </div>
                    <div className="space-y-4">
                        {rules.filter(r => r.expiresAt != null).map((jail) => (
                            <div key={jail.id} className="p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-red-500/10 transition-all flex items-center justify-between group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                                        <Lock size={18} />
                                    </div>
                                    <div>
                                        <div className="font-mono font-bold text-sm text-on-surface">{jail.ip}</div>
                                        <div className="text-[10px] text-on-surface-variant/40 mt-0.5 uppercase font-bold tracking-tight">Reason: {jail.comment || '—'}</div>
                                        {jail.isp && <div className="text-[10px] text-on-surface-variant/50 mt-0.5">ISP: {jail.isp}</div>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <div className="text-[11px] font-black text-red-400 uppercase tracking-widest">Expires In</div>
                                        <div className="text-[10px] font-mono text-on-surface-variant/60">
                                            {Math.round((jail.expiresAt! - Date.now()) / 60000)}m remaining
                                        </div>
                                    </div>
                                    <button onClick={() => handleDelete(jail.id)} className="p-2 hover:bg-red-500/10 text-red-400 rounded-xl transition-all opacity-0 group-hover:opacity-100">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {rules.filter(r => r.expiresAt != null).length === 0 && (
                            <div className="py-20 text-center text-on-surface-variant/20 italic">Prison is currently empty</div>
                        )}
                    </div>
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
