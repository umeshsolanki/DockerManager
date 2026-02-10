'use client';

import React, { useEffect, useState } from 'react';
import {
    Shield, ShieldAlert, ShieldCheck, Trash2, Plus,
    RefreshCw, Globe, Lock, Activity, Terminal, ListFilter,
    History, Settings, Zap, ShieldAlert as ShieldAlertIcon
} from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { FirewallRule, SystemConfig, ProxyJailRule, ProxyJailRuleType, IptablesRule } from '@/lib/types';
import { toast } from 'sonner';
import { StatCard } from '../ui/StatCard';
import { TabButton, TabsList } from '../ui/Tabs';
import { ActionIconButton } from '../ui/Buttons';
import { useActionTrigger } from '@/hooks/useActionTrigger';

export default function SecurityScreen() {
    const [rules, setRules] = useState<FirewallRule[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'firewall' | 'jails' | 'rules'>('overview');
    const [proxyConfig, setProxyConfig] = useState<SystemConfig | null>(null);

    // Firewall sub-tabs
    const [firewallSubTab, setFirewallSubTab] = useState<'rules' | 'iptables' | 'nftables'>('rules');
    const [iptables, setIptables] = useState<Record<string, IptablesRule[]>>({});
    const [iptablesRaw, setIptablesRaw] = useState<string>('');
    const [isIptablesRaw, setIsIptablesRaw] = useState(false);
    const [nftables, setNftables] = useState<string>('');
    const [nftablesJson, setNftablesJson] = useState<any>(null);
    const [isNftablesRaw, setIsNftablesRaw] = useState(false);
    const [expandedChain, setExpandedChain] = useState<string | null>('INPUT');
    const [rulesSubTab, setRulesSubTab] = useState<'active' | 'defaults'>('active');

    const { trigger } = useActionTrigger();

    // Firewall Modal
    const [isFirewallModalOpen, setIsFirewallModalOpen] = useState(false);

    const fetchData = async (manual = false) => {
        if (manual) setIsLoading(true);
        try {
            const [firewall, proxy, iptablesData, iptablesRawData, nftablesData, nftablesJsonData] = await Promise.all([
                DockerClient.listFirewallRules(),
                DockerClient.getSystemConfig(),
                DockerClient.getIptablesVisualisation(),
                DockerClient.getIptablesRaw(),
                DockerClient.getNftablesVisualisation(),
                DockerClient.getNftablesJson()
            ]);
            setRules(firewall || []);
            setProxyConfig(proxy);
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

    const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);

    useEffect(() => {
        fetchData();
        if (!autoRefreshEnabled) return;
        const interval = setInterval(() => fetchData(), 30000);
        return () => clearInterval(interval);
    }, [autoRefreshEnabled]);

    const handleUnblockIP = async (id: string) => {
        await trigger(() => DockerClient.unblockIP(id), {
            onSuccess: () => fetchData(),
            successMessage: 'Firewall rule removed',
            errorMessage: 'Failed to remove firewall rule'
        });
    };

    const updateProxySecurity = async (updated: Partial<SystemConfig>) => {
        if (!proxyConfig) return;
        const newSettings = { ...proxyConfig, ...updated };

        // Optimistic update
        setProxyConfig(newSettings);

        const result = await DockerClient.updateProxySecuritySettings(newSettings);
        if (!result.success) {
            toast.error(result.message);
            fetchData();
        } else {
            toast.success(result.message);
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <RefreshCw className="animate-spin text-primary" size={32} />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 pb-10">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <Lock className="text-primary" size={28} />
                        Security Center
                    </h1>
                    <p className="text-on-surface-variant/60 text-sm mt-1">Active threat mitigation and intrusion prevention systems</p>
                </div>
                <div className="flex items-center gap-3">
                    <TabsList>
                        <TabButton id="overview" label="Overview" icon={<Shield size={16} />} active={activeTab === 'overview'} onClick={(id) => setActiveTab(id as any)} title="Security Overview" />
                        <TabButton id="firewall" label="Firewall" icon={<ListFilter size={16} />} active={activeTab === 'firewall'} onClick={(id) => setActiveTab(id as any)} title="Firewall Rules" />
                        <TabButton id="jails" label="Active Jails" icon={<ShieldAlert size={16} />} active={activeTab === 'jails'} onClick={(id) => setActiveTab(id as any)} title="Active Jails" />
                        <TabButton id="rules" label="Rules" icon={<Settings size={16} />} active={activeTab === 'rules'} onClick={(id) => setActiveTab(id as any)} title="Edge Rules" />
                    </TabsList>
                    <button
                        onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
                        className={`p-2 rounded-xl transition-all ${autoRefreshEnabled ? 'bg-primary/10 text-primary' : 'bg-white/5 text-on-surface-variant hover:bg-white/10'}`}
                        title={autoRefreshEnabled ? 'Auto-refresh ON (30s)' : 'Auto-refresh OFF'}
                    >
                        <RefreshCw size={16} className={autoRefreshEnabled ? 'animate-spin-slow' : ''} />
                    </button>
                    <ActionIconButton onClick={() => fetchData(true)} icon={<RefreshCw />} title="Refresh Security Data" />
                </div>
            </header>

            {activeTab === 'overview' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <StatCard
                            label="Active Blocks"
                            value={rules.length.toString()}
                            icon={<Shield size={24} />}
                            sub="Firewall level restrictions"
                            color="primary"
                        />
                        <StatCard
                            label="Jailed IPs"
                            value={(rules.filter(r => r.expiresAt !== undefined && r.expiresAt !== null).length).toString()}
                            icon={<Lock size={24} />}
                            sub="Timed security jails"
                            color="indigo"
                        />
                        <StatCard
                            label="Proxy Rules"
                            value={(proxyConfig?.proxyJailRules?.length || 0).toString()}
                            icon={<Terminal size={24} />}
                            sub="Active armor patterns"
                            color="orange"
                        />
                    </div>
                </div>
            )}

            {activeTab === 'firewall' && (
                <div className="space-y-6 animate-in fade-in duration-500">
                    <div className="flex bg-surface/50 border border-outline/10 p-1 rounded-xl w-fit">
                        <button
                            onClick={() => setFirewallSubTab('rules')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${firewallSubTab === 'rules' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant/60 hover:bg-white/5'}`}
                        >
                            <ListFilter size={14} />
                            Rules
                        </button>
                        <button
                            onClick={() => setFirewallSubTab('iptables')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${firewallSubTab === 'iptables' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant/60 hover:bg-white/5'}`}
                        >
                            <Activity size={14} />
                            iptables
                        </button>
                        <button
                            onClick={() => setFirewallSubTab('nftables')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${firewallSubTab === 'nftables' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant/60 hover:bg-white/5'}`}
                        >
                            <Terminal size={14} />
                            nftables
                        </button>
                    </div>

                    {firewallSubTab === 'rules' ? (
                        <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] overflow-hidden">
                            <div className="p-6 border-b border-outline/5 flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-bold">Firewall Policy</h3>
                                    <p className="text-xs text-on-surface-variant font-medium">Explicit IP and Port level restrictions</p>
                                </div>
                                <button
                                    onClick={() => setIsFirewallModalOpen(true)}
                                    className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-xl text-xs font-bold hover:opacity-90 transition-opacity"
                                >
                                    <Plus size={16} /> Add Rule
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-black/20">
                                            <th className="px-6 py-4 text-[10px] font-black uppercase text-on-surface-variant/60 tracking-widest">IP Address</th>
                                            <th className="px-6 py-4 text-[10px] font-black uppercase text-on-surface-variant/60 tracking-widest">Target Port</th>
                                            <th className="px-6 py-4 text-[10px] font-black uppercase text-on-surface-variant/60 tracking-widest">Protocol</th>
                                            <th className="px-6 py-4 text-[10px] font-black uppercase text-on-surface-variant/60 tracking-widest">Comment</th>
                                            <th className="px-6 py-4 text-[10px] font-black uppercase text-on-surface-variant/60 tracking-widest text-right">Added On</th>
                                            <th className="px-6 py-4 text-[10px] font-black uppercase text-on-surface-variant/60 tracking-widest text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-outline/5">
                                        {rules.map((rule) => (
                                            <tr key={rule.id} className="hover:bg-white/[0.02] transition-colors group">
                                                <td className="px-6 py-4 flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                                                        <Lock size={14} />
                                                    </div>
                                                    <span className="text-sm font-bold font-mono text-primary">{rule.ip}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-xs font-mono font-bold">{rule.port || 'ALL'}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-surface/50 border border-outline/10 text-on-surface-variant">
                                                        {rule.protocol}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-xs italic text-on-surface-variant">
                                                    {rule.comment || '-'}
                                                </td>
                                                <td className="px-6 py-4 text-right font-mono text-[10px] text-on-surface-variant">
                                                    {new Date(rule.createdAt).toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button
                                                        onClick={() => handleUnblockIP(rule.id)}
                                                        className="p-2 hover:bg-red-500/10 text-red-400 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {rules.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-6 py-20 text-center text-sm text-on-surface-variant italic">
                                                    No direct firewall rules defined
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : firewallSubTab === 'iptables' ? (
                        <div className="flex flex-col bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] overflow-hidden h-[600px]">
                            {!isIptablesRaw ? (
                                <div className="flex h-full">
                                    <div className="w-64 border-r border-outline/10 flex flex-col bg-black/20">
                                        <div className="p-4 border-b border-outline/10 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Activity className="text-primary" size={16} />
                                                <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Filter Chains</span>
                                            </div>
                                            <button
                                                onClick={() => setIsIptablesRaw(true)}
                                                className="text-[10px] font-bold text-primary hover:underline"
                                            >
                                                Raw
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
                                    <div className="flex-1 flex flex-col overflow-hidden">
                                        <div className="p-4 border-b border-outline/10 bg-white/5 flex items-center justify-between">
                                            <h3 className="text-lg font-bold flex items-center gap-2">
                                                <Terminal size={18} className="text-primary" />
                                                Chain <span className="text-primary">{expandedChain || 'None'}</span>
                                            </h3>
                                        </div>
                                        <div className="flex-1 overflow-auto custom-scrollbar">
                                            {!expandedChain || !iptables[expandedChain] ? (
                                                <div className="flex items-center justify-center h-full text-on-surface-variant italic">
                                                    Select a chain to view rules
                                                </div>
                                            ) : (
                                                <table className="w-full text-left border-collapse">
                                                    <thead className="sticky top-0 bg-[#0f0f0f] z-10 border-b border-outline/10">
                                                        <tr>
                                                            <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/40 tracking-wider">Target</th>
                                                            <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/40 tracking-wider">Proto</th>
                                                            <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/40 tracking-wider">Source</th>
                                                            <th className="px-4 py-3 text-[10px] uppercase font-black text-on-surface-variant/40 tracking-wider text-right">Activity</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-outline/5 font-mono">
                                                        {iptables[expandedChain].map((rule, i) => (
                                                            <tr key={i} className="hover:bg-white/5 transition-colors">
                                                                <td className="px-4 py-2">
                                                                    <span className={`text-[10px] font-black ${rule.target === 'ACCEPT' ? 'text-green-500' : 'text-red-500'}`}>{rule.target}</span>
                                                                </td>
                                                                <td className="px-4 py-2 text-[10px]">{rule.prot}</td>
                                                                <td className="px-4 py-2 text-[10px] truncate max-w-[150px]">{rule.source}</td>
                                                                <td className="px-4 py-2 text-right text-[10px] text-primary">{rule.pkts} pkts</td>
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
                                    <div className="p-4 border-b border-outline/10 bg-white/5 flex items-center justify-between">
                                        <h3 className="text-lg font-bold flex items-center gap-2">
                                            <Terminal size={18} className="text-primary" />
                                            Raw Output
                                        </h3>
                                        <button
                                            onClick={() => setIsIptablesRaw(false)}
                                            className="text-[10px] font-bold text-primary hover:underline"
                                        >
                                            Visual
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-auto custom-scrollbar p-6 bg-black/20 font-mono text-xs text-primary/80 whitespace-pre">
                                        {iptablesRaw || 'No raw data available.'}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] overflow-hidden h-[600px]">
                            <div className="p-4 border-b border-outline/10 bg-white/5 flex items-center justify-between">
                                <div className="flex flex-col">
                                    <h3 className="text-lg font-bold flex items-center gap-2 leading-none">
                                        <Terminal size={18} className="text-primary" />
                                        {isNftablesRaw ? 'Raw nftables Ruleset' : 'Visual nftables'}
                                    </h3>
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
                                    <div className="p-6 bg-black/20 font-mono text-xs text-primary/80 whitespace-pre">
                                        {nftables || 'No nftables data available.'}
                                    </div>
                                ) : (
                                    <div className="p-6">
                                        {!nftablesJson || !nftablesJson.nftables ? (
                                            <div className="flex items-center justify-center h-40 text-on-surface-variant italic">
                                                No structured nftables data available.
                                            </div>
                                        ) : (
                                            <div className="space-y-6">
                                                {nftablesJson.nftables.filter((obj: any) => obj.table).map((tableObj: any) => {
                                                    const table = tableObj.table;
                                                    const chains = nftablesJson.nftables.filter((obj: any) => obj.chain && obj.chain.table === table.name && obj.chain.family === table.family);

                                                    return (
                                                        <div key={`${table.family}-${table.name}`} className="border border-outline/10 rounded-2xl overflow-hidden bg-black/20">
                                                            <div className="px-4 py-2 bg-white/5 border-b border-outline/10 flex items-center justify-between">
                                                                <span className="text-[10px] font-black uppercase tracking-widest text-primary">{table.family} / {table.name}</span>
                                                                <span className="text-[10px] font-mono text-on-surface-variant/40">Handle: {table.handle}</span>
                                                            </div>
                                                            <div className="divide-y divide-outline/5">
                                                                {chains.map((chainObj: any) => {
                                                                    const chain = chainObj.chain;
                                                                    const rules_internal = nftablesJson.nftables.filter((obj: any) => obj.rule && obj.rule.table === table.name && obj.rule.chain === chain.name);

                                                                    return (
                                                                        <div key={chain.name} className="p-4">
                                                                            <div className="flex items-center justify-between mb-2">
                                                                                <span className="text-xs font-bold text-on-surface">{chain.name}</span>
                                                                                {chain.policy && (
                                                                                    <span className={`text-[10px] font-black uppercase ${chain.policy === 'accept' ? 'text-green-500' : 'text-red-500'}`}>
                                                                                        {chain.policy}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <div className="space-y-1">
                                                                                {rules_internal.map((ruleObj: any, idx: number) => (
                                                                                    <div key={idx} className="flex gap-2">
                                                                                        <span className="text-[9px] font-mono text-on-surface-variant/20">[{ruleObj.rule.handle}]</span>
                                                                                        <code className="text-[10px] font-mono text-on-surface-variant truncate">
                                                                                            {ruleObj.rule.expr ? ruleObj.rule.expr.length + " expressions" : "..."}
                                                                                        </code>
                                                                                    </div>
                                                                                ))}
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
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'jails' && (
                <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
                        {rules.filter(r => r.expiresAt !== undefined && r.expiresAt !== null).map((jail) => (
                            <div key={jail.ip} className="p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-red-500/10 transition-all flex items-center justify-between group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                                        <Lock size={18} />
                                    </div>
                                    <div>
                                        <div className="font-mono font-bold text-sm text-on-surface">{jail.ip}</div>
                                        <div className="text-[10px] text-on-surface-variant/40 mt-0.5 uppercase font-bold tracking-tight">Reason: {jail.comment}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[11px] font-black text-red-400 uppercase tracking-widest">Expires In</div>
                                    <div className="text-[10px] font-mono text-on-surface-variant/60">
                                        {Math.round((jail.expiresAt! - Date.now()) / 60000)}m remaining
                                    </div>
                                </div>
                            </div>
                        ))}
                        {rules.filter(r => r.expiresAt !== undefined && r.expiresAt !== null).length === 0 && (
                            <div className="py-20 text-center text-on-surface-variant/20 italic">
                                Prison is currently empty
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'rules' && (
                <div className="space-y-6 animate-in fade-in duration-500">
                    <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] p-8">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-xl font-bold truncate">Security Policy Control</h3>
                                <p className="text-[10px] text-on-surface-variant uppercase font-black tracking-widest mt-1 opacity-50">Infrastructure Hardening</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5">
                                    <button
                                        onClick={() => setRulesSubTab('active')}
                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${rulesSubTab === 'active' ? 'bg-primary text-on-primary shadow-lg' : 'text-on-surface-variant hover:text-on-surface'}`}
                                    >
                                        Active
                                    </button>
                                    <button
                                        onClick={() => setRulesSubTab('defaults')}
                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${rulesSubTab === 'defaults' ? 'bg-secondary text-on-secondary shadow-lg' : 'text-on-surface-variant hover:text-on-surface'}`}
                                    >
                                        Defaults
                                    </button>
                                </div>
                                <div className="p-3 bg-primary/10 text-primary rounded-2xl">
                                    <ShieldCheck size={24} />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-8">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary border border-primary/10">
                                        <Zap size={18} />
                                    </div>
                                    <div>
                                        <span className="text-sm font-bold block leading-none">Proxy Armor Status</span>
                                        <span className="text-[10px] text-on-surface-variant/40 font-bold uppercase tracking-tighter">Real-time edge protection</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => updateProxySecurity({ proxyJailEnabled: !proxyConfig?.proxyJailEnabled })}
                                    className={`w-12 h-6 rounded-full transition-all relative ${proxyConfig?.proxyJailEnabled ? 'bg-primary shadow-[0_0_15px_rgba(var(--md-sys-color-primary-rgb),0.4)]' : 'bg-white/10'}`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${proxyConfig?.proxyJailEnabled ? 'right-1' : 'left-1'}`} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 pt-4">
                        <div className="lg:col-span-1 space-y-6">
                            <div className="bg-white/[0.03] border border-white/5 rounded-[24px] p-5">
                                <h4 className="text-[10px] font-black uppercase mb-6 flex items-center gap-2 tracking-widest text-primary">
                                    <ShieldCheck size={14} />
                                    Proxy Thresholds
                                </h4>
                                <div className="space-y-6">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-tighter">Proxy Sensitivity</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                value={proxyConfig?.proxyJailThresholdNon200 ?? 20}
                                                onChange={(e) => setProxyConfig(prev => prev ? { ...prev, proxyJailThresholdNon200: parseInt(e.target.value) || 0 } : null)}

                                                onBlur={(e) => { updateProxySecurity({ proxyJailThresholdNon200: parseInt(e.target.value) || 20 }); }}
                                                className="w-24 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm font-mono font-bold focus:outline-none focus:border-primary/50 transition-all"
                                            />
                                            <span className="text-[10px] font-black text-primary uppercase opacity-50">Points</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-black text-red-500 uppercase tracking-tighter">Danger Threshold</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                value={proxyConfig?.proxyJailThresholdDanger ?? 1}
                                                onChange={(e) => setProxyConfig(prev => prev ? { ...prev, proxyJailThresholdDanger: parseInt(e.target.value) || 0 } : null)}

                                                onBlur={(e) => { updateProxySecurity({ proxyJailThresholdDanger: parseInt(e.target.value) || 1 }); }}
                                                className="w-20 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm font-mono font-bold focus:outline-none focus:border-red-500/50 transition-all"
                                            />
                                            <span className="text-[10px] font-black text-red-500 uppercase opacity-50">Hits</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="lg:col-span-3">
                            <div className="bg-white/[0.03] border border-white/5 rounded-[32px] p-8">
                                <div className="flex items-center justify-between mb-8">
                                    <h4 className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest flex items-center gap-2">
                                        <Globe size={14} className={rulesSubTab === 'active' ? 'text-primary' : 'text-secondary'} />
                                        {rulesSubTab === 'active' ? 'Active Guard Rails' : 'Default Guard Rails'}
                                    </h4>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-bold ${rulesSubTab === 'active' ? 'text-primary bg-primary/10' : 'text-secondary bg-secondary/10'} px-3 py-1 rounded-full`}>
                                            {rulesSubTab === 'active'
                                                ? (proxyConfig?.proxyJailRules?.length || 0) + ' Rules Active'
                                                : (proxyConfig?.recommendedProxyJailRules?.length || 0) + ' Rules in Defaults'
                                            }
                                        </span>
                                        {rulesSubTab === 'active' && (!proxyConfig?.proxyJailRules || proxyConfig.proxyJailRules.length === 0) && (
                                            <button
                                                onClick={async () => {
                                                    const recommended = await DockerClient.getRecommendedProxyRules();
                                                    setProxyConfig(prev => prev ? { ...prev, proxyJailRules: recommended } : null);

                                                    toast.info(`Loaded ${recommended.length} recommended rules - Click Apply to save`);
                                                }}
                                                className="flex items-center gap-1.5 px-3 py-1 bg-secondary/10 text-secondary hover:bg-secondary/20 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border border-secondary/20"
                                            >
                                                <Plus size={12} /> Load Recommended
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 scrollbar-invisible">
                                    {(rulesSubTab === 'active' ? proxyConfig?.proxyJailRules : proxyConfig?.recommendedProxyJailRules)?.map((rule) => (
                                        <div key={rule.id} className={`group bg-white/5 border border-white/5 p-4 rounded-2xl ${rulesSubTab === 'active' ? 'hover:border-primary/30' : 'hover:border-secondary/30'} transition-all flex items-center justify-between`}>
                                            <div className="flex items-center gap-4 min-w-0">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${rule.type === 'USER_AGENT' ? 'bg-pink-500/10 text-pink-500' :
                                                    rule.type === 'METHOD' ? 'bg-orange-500/10 text-orange-500' :
                                                        rule.type === 'PATH' ? 'bg-indigo-500/10 text-indigo-500' :
                                                            'bg-teal-500/10 text-teal-500'
                                                    }`}>
                                                    {rule.type === 'USER_AGENT' ? <History size={18} /> :
                                                        rule.type === 'METHOD' ? <Terminal size={18} /> :
                                                            rule.type === 'PATH' ? <Globe size={18} /> :
                                                                <Shield size={18} />}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant/70 font-mono">{rule.type}</span>
                                                        {rule.description && <span className={`text-[10px] font-bold ${rulesSubTab === 'active' ? 'text-primary' : 'text-secondary'} truncate max-w-[200px]`}>{rule.description}</span>}
                                                    </div>
                                                    <div className="text-sm font-mono font-bold truncate text-on-surface break-all">{rule.pattern}</div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const field = rulesSubTab === 'active' ? 'proxyJailRules' : 'recommendedProxyJailRules';
                                                    const rules = (proxyConfig as any)?.[field] || [];
                                                    const newRules = rules.filter((r: any) => r.id !== rule.id);
                                                    setProxyConfig(prev => prev ? { ...prev, [field]: newRules } : null);
                                                }}
                                                className="p-2 text-on-surface-variant hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                    {(!(rulesSubTab === 'active' ? proxyConfig?.proxyJailRules : proxyConfig?.recommendedProxyJailRules) ||
                                        (rulesSubTab === 'active' ? proxyConfig?.proxyJailRules : proxyConfig?.recommendedProxyJailRules)?.length === 0) && (
                                            <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-white/5 rounded-3xl bg-white/[0.02]">
                                                <Shield size={48} className="text-on-surface-variant/10 mb-4" />
                                                <p className="text-sm font-bold text-on-surface-variant">No rules defined in this set.</p>
                                            </div>
                                        )}
                                </div>
                                {((rulesSubTab === 'active' ? proxyConfig?.proxyJailRules : proxyConfig?.recommendedProxyJailRules)?.length || 0) > 0 && (
                                    <button
                                        onClick={() => {
                                            const payload = rulesSubTab === 'active'
                                                ? { proxyJailRules: proxyConfig?.proxyJailRules }
                                                : { recommendedProxyJailRules: proxyConfig?.recommendedProxyJailRules };
                                            updateProxySecurity(payload as any);
                                            toast.success(`${rulesSubTab === 'active' ? 'Active' : 'Default'} rules applied`);
                                        }}
                                        className={`w-full mt-4 ${rulesSubTab === 'active' ? 'bg-primary text-on-primary shadow-primary/20' : 'bg-secondary text-on-secondary shadow-secondary/20'} py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all`}
                                    >
                                        Apply {rulesSubTab === 'active' ? 'Active' : 'Default'} Changes
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Add Rule Sidebar */}
                        <div className="lg:col-span-1">
                            <div className="bg-white/[0.03] border border-white/5 rounded-[24px] p-5 h-fit sticky top-6">
                                <h4 className="text-[10px] font-black uppercase mb-6 flex items-center gap-2 tracking-widest text-primary">
                                    <Plus size={16} />
                                    Add Armor Rule
                                </h4>
                                <form className="space-y-4" onSubmit={(e) => {
                                    e.preventDefault();
                                    const form = e.target as HTMLFormElement;
                                    const type = (form.elements.namedItem('rule-type') as HTMLSelectElement).value;
                                    const pattern = (form.elements.namedItem('rule-pattern') as HTMLInputElement).value;
                                    const description = (form.elements.namedItem('rule-description') as HTMLInputElement).value;

                                    if (!pattern) return toast.error('Pattern is required');

                                    // Basic regex validation for types that use regex
                                    if (type === 'USER_AGENT' || type === 'PATH') {
                                        try {
                                            new RegExp(pattern);
                                        } catch (e) {
                                            return toast.error('Invalid regex pattern: ' + (e as Error).message);
                                        }
                                    }

                                    const newRule: ProxyJailRule = {
                                        id: Math.random().toString(36).substr(2, 9),
                                        type: type as ProxyJailRuleType,
                                        pattern,
                                        description
                                    };

                                    const field = rulesSubTab === 'active' ? 'proxyJailRules' : 'recommendedProxyJailRules';
                                    const currentRules = (proxyConfig as any)?.[field] || [];
                                    updateProxySecurity({ [field]: [...currentRules, newRule] } as any);
                                    form.reset();
                                }}>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase text-on-surface-variant px-1 tracking-widest">Target</label>
                                        <select
                                            name="rule-type"
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none focus:border-primary/50 transition-all appearance-none"
                                        >
                                            <option value="USER_AGENT">User Agent (Regex)</option>
                                            <option value="PATH">Path / URL (Regex)</option>
                                            <option value="METHOD">HTTP Method</option>
                                            <option value="STATUS_CODE">Status Code</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase text-on-surface-variant px-1 tracking-widest">Pattern</label>
                                        <input
                                            name="rule-pattern"
                                            placeholder="e.g. ^sqlmap/.*"
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-mono font-bold focus:outline-none focus:border-primary/50"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase text-on-surface-variant px-1 tracking-widest">Description</label>
                                        <input
                                            name="rule-description"
                                            placeholder="e.g. Block SQL injection"
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none focus:border-primary/50"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        className="w-full bg-primary text-on-primary py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                    >
                                        Shield Up
                                    </button>
                                </form>
                            </div>

                            {/* Advanced Proxy Settings */}
                            <div className="bg-white/[0.03] border border-white/5 rounded-[24px] p-5 mt-4">
                                <h4 className="text-[10px] font-black uppercase mb-6 flex items-center gap-2 tracking-widest text-primary">
                                    <Activity size={14} />
                                    Advanced Configuration
                                </h4>
                                <div className="space-y-6">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase text-on-surface-variant px-1 tracking-widest">Analysis Window</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                value={proxyConfig?.proxyJailWindowMinutes ?? 1}
                                                onChange={(e) => setProxyConfig(prev => prev ? { ...prev, proxyJailWindowMinutes: parseInt(e.target.value) || 1 } : null)}

                                                onBlur={(e) => { updateProxySecurity({ proxyJailWindowMinutes: parseInt(e.target.value) || 1 }); }}
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm font-mono font-bold focus:outline-none focus:border-primary/50 transition-all"
                                            />
                                            <span className="text-[10px] font-black text-on-surface-variant uppercase opacity-50">Min</span>
                                        </div>
                                    </div>

                                    <div className="h-px bg-white/5" />

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest block">Mirror Traffic</span>
                                                <span className="text-[9px] text-on-surface-variant/40 font-bold block">Danger Proxy</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => updateProxySecurity({ dangerProxyEnabled: !proxyConfig?.dangerProxyEnabled })}
                                                className={`w-12 h-6 rounded-full transition-all relative ${proxyConfig?.dangerProxyEnabled ? 'bg-primary shadow-[0_0_15px_rgba(var(--md-sys-color-primary-rgb),0.4)]' : 'bg-white/10'}`}
                                            >
                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${proxyConfig?.dangerProxyEnabled ? 'right-1' : 'left-1'}`} />
                                            </button>
                                        </div>

                                        {proxyConfig?.dangerProxyEnabled && (
                                            <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-1.5">
                                                <label className="text-[9px] font-black uppercase text-on-surface-variant px-1 tracking-widest block">Mirror Host</label>
                                                <input
                                                    value={proxyConfig?.dangerProxyHost ?? ''}
                                                    onChange={(e) => setProxyConfig(prev => prev ? { ...prev, dangerProxyHost: e.target.value } : null)}

                                                    onBlur={(e) => { updateProxySecurity({ dangerProxyHost: e.target.value }); }}
                                                    placeholder="host:port"
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs font-mono font-bold focus:outline-none focus:border-primary/50"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isFirewallModalOpen && (
                <BlockIPModal
                    onClose={() => setIsFirewallModalOpen(false)}
                    onBlocked={() => { setIsFirewallModalOpen(false); fetchData(); }}
                />
            )}
        </div>
    );
}

function BlockIPModal({ onClose, onBlocked }: { onClose: () => void, onBlocked: () => void }) {
    const [ip, setIp] = useState('');
    const [port, setPort] = useState('');
    const [comment, setComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        const success = await DockerClient.blockIP({ ip, port: port || undefined, protocol: 'tcp', comment });
        if (success) {
            toast.success('IP Blocked on Firewall');
            onBlocked();
        } else {
            toast.error('Failed to block IP');
        }
        setIsSubmitting(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface border border-outline/20 rounded-[32px] w-full max-w-sm shadow-2xl p-8">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center">
                        <ShieldAlertIcon size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">Block IP Address</h2>
                        <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-widest">Firewall Restriction</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-on-surface-variant px-1">Source IP Address</label>
                        <input
                            required
                            type="text"
                            placeholder="e.g. 192.168.1.50"
                            value={ip}
                            onChange={(e) => setIp(e.target.value)}
                            className="w-full bg-black/20 border border-outline/20 rounded-2xl px-4 py-3 text-sm font-mono font-bold focus:outline-none focus:border-red-500/50 transition-all"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-on-surface-variant px-1">Specific Port (Optional)</label>
                        <input
                            type="text"
                            placeholder="e.g. 22 or 80"
                            value={port}
                            onChange={(e) => setPort(e.target.value)}
                            className="w-full bg-black/20 border border-outline/20 rounded-2xl px-4 py-3 text-sm font-mono font-bold focus:outline-none focus:border-red-500/50 transition-all"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-on-surface-variant px-1">Comment / Reason</label>
                        <input
                            type="text"
                            placeholder="e.g. SSH Brute Force"
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="w-full bg-black/20 border border-outline/20 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-red-500/50 transition-all"
                        />
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all text-on-surface-variant"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 py-3 rounded-2xl bg-red-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                            {isSubmitting ? 'Blocking...' : 'Confirm Block'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
