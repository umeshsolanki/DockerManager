'use client';

import React, { useEffect, useState } from 'react';
import {
    Shield, ShieldAlert, ShieldCheck, Trash2, Plus, Search,
    RefreshCw, Globe, Lock, Activity, Terminal, ListFilter,
    ShieldOff, AlertTriangle, UserMinus, History, Settings,
    Edit2, X, Save, Copy, GitBranch, AlertCircle, Ban, FileText, Server
} from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { FirewallRule, BtmpStats, SystemConfig, ProxyJailRule, ProxyJailRuleType, RuleChain, RuleCondition, RuleAction, RuleOperator, RuleActionConfig } from '@/lib/types';
import { toast } from 'sonner';
import { StatCard } from '../ui/StatCard';
import { TabButton, TabsList } from '../ui/Tabs';
import { Modal } from '../ui/Modal';
import { SearchInput } from '../ui/SearchInput';
import { Button, ActionIconButton } from '../ui/Buttons';
import { useActionTrigger } from '@/hooks/useActionTrigger';

export default function SecurityScreen() {
    const [firewallRules, setFirewallRules] = useState<FirewallRule[]>([]);
    const [btmpStats, setBtmpStats] = useState<BtmpStats | null>(null);
    const [proxyConfig, setProxyConfig] = useState<SystemConfig | null>(null);
    const [ruleChains, setRuleChains] = useState<RuleChain[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'firewall' | 'jails' | 'rules'>('overview');
    const { trigger } = useActionTrigger();

    // Firewall Modal
    const [isFirewallModalOpen, setIsFirewallModalOpen] = useState(false);
    
    // Rule Chain Modal
    const [isRuleChainModalOpen, setIsRuleChainModalOpen] = useState(false);
    const [editingChain, setEditingChain] = useState<RuleChain | null>(null);

    const fetchData = async (manual = false) => {
        if (manual) setIsLoading(true);
        try {
            const [firewall, btmp, proxy, chains] = await Promise.all([
                DockerClient.listFirewallRules(),
                DockerClient.getBtmpStats(),
                DockerClient.getProxySecuritySettings(),
                DockerClient.getRuleChains()
            ]);
            setFirewallRules(firewall);
            setBtmpStats(btmp);
            setProxyConfig(proxy);
            setRuleChains(chains);
        } catch (e) {
            console.error('Failed to fetch security data', e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(() => fetchData(), 15000);
        return () => clearInterval(interval);
    }, []);

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

        await trigger(() => DockerClient.updateProxySecuritySettings(newSettings), {
            onSuccess: (result) => {
                if (!result.success) {
                    toast.error(result.message);
                    fetchData();
                } else {
                    toast.success(result.message);
                }
            },
            // We handle progress manually here because it's an optimistic update with success check inside result
        });
    };

    const updateAutoJailSettings = async (updated: { enabled?: boolean, threshold?: number, duration?: number }) => {
        if (!btmpStats) return;
        const e = updated.enabled ?? btmpStats.autoJailEnabled;
        const t = updated.threshold ?? btmpStats.jailThreshold;
        const d = updated.duration ?? btmpStats.jailDurationMinutes;

        // Optimistic update
        setBtmpStats({ ...btmpStats, autoJailEnabled: e, jailThreshold: t, jailDurationMinutes: d });

        await trigger(() => DockerClient.updateAutoJailSettings(e, t, d), {
            successMessage: 'Incarceration settings updated',
            errorMessage: 'Failed to update settings',
            onSuccess: (success) => {
                if (!success) fetchData();
            }
        });
    };

    if (isLoading && !btmpStats) {
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
                    <ActionIconButton onClick={() => fetchData(true)} icon={<RefreshCw />} title="Refresh Security Data" />
                </div>
            </header>

            {activeTab === 'overview' && (
                <div className="space-y-6 animate-in fade-in duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard
                            label="Failed Auth"
                            value={btmpStats?.totalFailedAttempts.toLocaleString() || '0'}
                            sub="Global SSH Failures"
                            color="orange"
                            icon={<Terminal size={20} />}
                        />
                        <StatCard
                            label="Active Blocks"
                            value={firewallRules.length.toString()}
                            sub="Firewall IP Restrictions"
                            color="indigo"
                            icon={<ShieldCheck size={20} />}
                        />
                        <StatCard
                            label="Jailed IPs"
                            value={(btmpStats?.jailedIps.length || 0).toString()}
                            sub="Auto-mitigated threats"
                            color="red"
                            icon={<UserMinus size={20} />}
                        />
                        <StatCard
                            label="Rule Chains"
                            value={(ruleChains.length || 0).toString()}
                            sub="Active Rule Chains"
                            color="primary"
                            icon={<GitBranch size={20} />}
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* SSH Monitoring */}
                        <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] p-6">
                            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
                                <Terminal size={18} className="text-orange-400" />
                                Host Intrusion Feed
                            </h3>
                            <div className="space-y-3">
                                {btmpStats?.recentFailures.slice(0, 6).map((failure, i) => (
                                    <div key={i} className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/5 group hover:border-orange-500/20 transition-all">
                                        <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 shrink-0">
                                            <ShieldAlert size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-center mb-0.5">
                                                <span className="text-xs font-black truncate text-on-surface">
                                                    Failed <span className="text-orange-400 font-mono font-bold">{failure.user}</span>
                                                </span>
                                                <span className="text-[10px] font-bold text-on-surface-variant/40">{new Date(failure.timestamp).toLocaleTimeString()}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] font-mono text-on-surface-variant">{failure.ip}</span>
                                                {failure.country && <span className="text-[8px] font-black uppercase text-on-surface-variant/30 tracking-widest">{failure.country}</span>}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Top Attackers */}
                        <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] p-6">
                            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
                                <AlertTriangle size={18} className="text-red-500" />
                                Top Threat Sources
                            </h3>
                            <div className="space-y-4">
                                {btmpStats?.topIps.slice(0, 6).map((entry, i) => (
                                    <div key={entry.ip} className="group">
                                        <div className="flex justify-between items-center mb-1 px-1">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-[10px] font-black text-red-500/60 font-mono">#{i + 1}</span>
                                                <span className="text-xs font-bold font-mono truncate">{entry.ip}</span>
                                                {entry.country && <span className="text-[8px] font-black uppercase text-on-surface-variant/30 tracking-widest">({entry.country})</span>}
                                            </div>
                                            <span className="text-[10px] font-black text-on-surface-variant">{entry.count} Attempts</span>
                                        </div>
                                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                            <div
                                                className="h-full bg-red-500/40 rounded-full transition-all duration-1000"
                                                style={{ width: `${(entry.count / (btmpStats.topIps[0]?.count || 1)) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'firewall' && (
                <div className="space-y-6 animate-in fade-in duration-500">
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
                                    {firewallRules.map((rule) => (
                                        <tr key={rule.id} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="px-6 py-4 flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                                                    <Lock size={14} />
                                                </div>
                                                <span className="text-sm font-bold font-mono">{rule.ip}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-xs font-mono font-bold">{rule.port || 'ALL'}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-surface/50 border border-outline/10">
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
                                                    <ShieldOff size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {firewallRules.length === 0 && (
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
                </div>
            )}

            {activeTab === 'jails' && (
                <div className="space-y-6 animate-in fade-in duration-500">
                    <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] p-6">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-xl font-bold">Active Incarcerations</h3>
                                <p className="text-xs text-on-surface-variant font-medium">Temporarily jailed IPs from automation engines</p>
                            </div>
                            <div className="flex items-center gap-2 text-primary font-black uppercase text-[10px] tracking-widest bg-primary/10 px-4 py-1.5 rounded-full">
                                <ShieldAlert size={14} />
                                Intrusion Prevention Active
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {btmpStats?.jailedIps.map((jail) => (
                                <div key={jail.ip} className="bg-surface/50 border border-outline/10 rounded-2xl p-4 group hover:border-red-500/30 transition-all">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center">
                                                <UserMinus size={18} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold font-mono">{jail.ip}</span>
                                                {jail.country && <span className="text-[10px] font-black uppercase text-on-surface-variant/40 tracking-tighter">{jail.country}</span>}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-[9px] font-black text-red-500 uppercase">JAILED</span>
                                            <span className="text-[8px] text-on-surface-variant font-bold mt-0.5">Expires in 30m</span>
                                        </div>
                                    </div>
                                    <div className="text-[10px] bg-black/20 p-2.5 rounded-xl border border-outline/5 text-on-surface-variant min-h-[3rem] italic">
                                        {jail.reason}
                                    </div>
                                </div>
                            ))}
                            {btmpStats?.jailedIps.length === 0 && (
                                <div className="col-span-full py-20 flex flex-col items-center justify-center border-2 border-dashed border-outline/10 rounded-3xl opacity-30">
                                    <ShieldCheck size={64} className="mb-4 text-green-500" />
                                    <p className="font-bold text-lg">No Active Jails</p>
                                    <p className="text-xs">Your system is currently clear of temporary bans.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'rules' && (
                <div className="space-y-6 animate-in fade-in duration-500">
                    {/* Security Engine Controls */}
                    <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] p-6">
                        <div className="flex flex-wrap items-center justify-between gap-4 mb-8 border-b border-white/5 pb-8">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                                    <ShieldCheck size={24} className="text-primary" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black font-mono">Edge Intelligence</h3>
                                    <p className="text-xs text-on-surface-variant font-bold uppercase tracking-wider">Reverse Proxy & SSH Guard Rails</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-6">
                                {/* Proxy Armor Global Toggle */}
                                <div className="flex flex-col items-end gap-1">
                                    <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-tighter">Proxy Armor Status</span>
                                    <button
                                        onClick={() => updateProxySecurity({ proxyJailEnabled: !proxyConfig?.proxyJailEnabled })}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all border ${proxyConfig?.proxyJailEnabled ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}
                                    >
                                        {proxyConfig?.proxyJailEnabled ? <ShieldCheck size={14} /> : <ShieldOff size={14} />}
                                        <span className="text-[10px] font-black uppercase">{proxyConfig?.proxyJailEnabled ? 'Active' : 'Disabled'}</span>
                                    </button>
                                </div>

                            </div>
                        </div>

                        {/* Rule Chains Section */}
                        <div className="space-y-4 pt-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-lg font-bold flex items-center gap-2">
                                        <GitBranch size={18} className="text-primary" />
                                        Rule Chains
                                    </h4>
                                    <p className="text-xs text-on-surface-variant mt-1">Configure advanced rules with AND/OR logic and nginx-level blocking</p>
                                </div>
                                <Button
                                    onClick={() => {
                                        setEditingChain(null);
                                        setIsRuleChainModalOpen(true);
                                    }}
                                    className="flex items-center gap-2 bg-primary text-on-primary"
                                >
                                    <Plus size={16} />
                                    New Rule Chain
                                </Button>
                            </div>

                            <div className="space-y-3">
                                {ruleChains
                                    .sort((a, b) => a.order - b.order)
                                    .map((chain) => (
                                        <div
                                            key={chain.id}
                                            className={`group bg-surface/50 border rounded-2xl p-5 transition-all ${
                                                chain.enabled
                                                    ? 'border-outline/20 hover:border-primary/30'
                                                    : 'border-outline/10 opacity-60'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between mb-4">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={async () => {
                                                                    const updated = chain.enabled
                                                                        ? ruleChains.map((c) =>
                                                                              c.id === chain.id ? { ...c, enabled: false } : c
                                                                          )
                                                                        : ruleChains.map((c) =>
                                                                              c.id === chain.id ? { ...c, enabled: true } : c
                                                                          );
                                                                    await trigger(() => DockerClient.updateRuleChains(updated), {
                                                                        onSuccess: () => fetchData(),
                                                                        successMessage: 'Rule chain updated',
                                                                        errorMessage: 'Failed to update rule chain',
                                                                    });
                                                                }}
                                                                className={`p-1.5 rounded-lg transition-all ${
                                                                    chain.enabled
                                                                        ? 'bg-green-500/10 text-green-500'
                                                                        : 'bg-gray-500/10 text-gray-500'
                                                                }`}
                                                            >
                                                                {chain.enabled ? <ShieldCheck size={14} /> : <ShieldOff size={14} />}
                                                            </button>
                                                            <h5 className="text-base font-bold">{chain.name}</h5>
                                                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-primary/10 text-primary">
                                                                Order: {chain.order}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {chain.description && (
                                                        <p className="text-xs text-on-surface-variant mb-3">{chain.description}</p>
                                                    )}
                                                    <div className="flex items-center gap-4 text-xs">
                                                        <span className="flex items-center gap-1.5">
                                                            <GitBranch size={12} className="text-on-surface-variant" />
                                                            <span className="font-bold text-on-surface-variant">
                                                                {chain.operator === RuleOperator.AND ? 'AND' : 'OR'}
                                                            </span>
                                                        </span>
                                                        <span className="flex items-center gap-1.5">
                                                            {chain.action === RuleAction.JAIL && <ShieldAlert size={12} className="text-orange-500" />}
                                                            {chain.action === RuleAction.NGINX_BLOCK && <Ban size={12} className="text-red-500" />}
                                                            {chain.action === RuleAction.NGINX_DENY && <X size={12} className="text-red-600" />}
                                                            {chain.action === RuleAction.LOG_ONLY && <FileText size={12} className="text-blue-500" />}
                                                            <span className="font-bold">
                                                                {chain.action === RuleAction.JAIL && 'Jail IP'}
                                                                {chain.action === RuleAction.NGINX_BLOCK && 'Block at Nginx'}
                                                                {chain.action === RuleAction.NGINX_DENY && 'Deny at Nginx'}
                                                                {chain.action === RuleAction.LOG_ONLY && 'Log Only'}
                                                            </span>
                                                        </span>
                                                        <span className="text-on-surface-variant">
                                                            {chain.conditions.length} condition{chain.conditions.length !== 1 ? 's' : ''}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => {
                                                            setEditingChain(chain);
                                                            setIsRuleChainModalOpen(true);
                                                        }}
                                                        className="p-2 hover:bg-primary/10 text-primary rounded-xl transition-all"
                                                        title="Edit rule chain"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            if (!confirm(`Delete rule chain "${chain.name}"?`)) return;
                                                            await trigger(() => DockerClient.deleteRuleChain(chain.id), {
                                                                onSuccess: () => fetchData(),
                                                                successMessage: 'Rule chain deleted',
                                                                errorMessage: 'Failed to delete rule chain',
                                                            });
                                                        }}
                                                        className="p-2 hover:bg-red-500/10 text-red-500 rounded-xl transition-all"
                                                        title="Delete rule chain"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Conditions */}
                                            <div className="space-y-2 mt-4 pt-4 border-t border-outline/10">
                                                {chain.conditions.map((condition, idx) => (
                                                    <div
                                                        key={condition.id}
                                                        className="flex items-center gap-3 p-3 bg-black/20 rounded-xl border border-outline/5"
                                                    >
                                                        {idx > 0 && (
                                                            <span className="text-xs font-black text-primary px-2 py-0.5 rounded bg-primary/10">
                                                                {chain.operator}
                                                            </span>
                                                        )}
                                                        <div className="flex-1 flex items-center gap-2">
                                                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-500">
                                                                {condition.type}
                                                            </span>
                                                            {condition.negate && (
                                                                <span className="text-[10px] font-black text-red-500">NOT</span>
                                                            )}
                                                            <span className="text-xs font-mono font-bold text-on-surface">
                                                                {condition.pattern}
                                                            </span>
                                                            {condition.description && (
                                                                <span className="text-xs text-on-surface-variant italic">
                                                                    ({condition.description})
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                                {chain.conditions.length === 0 && (
                                                    <div className="text-xs text-on-surface-variant italic text-center py-2">
                                                        No conditions defined
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action Config */}
                                            {chain.actionConfig && (
                                                <div className="mt-3 pt-3 border-t border-outline/5 text-xs text-on-surface-variant">
                                                    {chain.action === RuleAction.JAIL && chain.actionConfig.jailDurationMinutes && (
                                                        <span>Jail Duration: {chain.actionConfig.jailDurationMinutes} minutes</span>
                                                    )}
                                                    {(chain.action === RuleAction.NGINX_BLOCK || chain.action === RuleAction.NGINX_DENY) && (
                                                        <span>
                                                            Response Code: {chain.actionConfig.nginxResponseCode || 403}
                                                            {chain.actionConfig.nginxResponseMessage && (
                                                                <> - {chain.actionConfig.nginxResponseMessage}</>
                                                            )}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                {ruleChains.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-outline/10 rounded-3xl bg-surface/20">
                                        <GitBranch className="text-on-surface-variant/20 mb-4" size={48} />
                                        <p className="text-sm font-bold text-on-surface-variant mb-2">No rule chains defined</p>
                                        <p className="text-xs text-on-surface-variant/60">Create a rule chain to start protecting your proxy</p>
                                    </div>
                                )}
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

            {isRuleChainModalOpen && (
                <RuleChainModal
                    chain={editingChain}
                    onClose={() => {
                        setIsRuleChainModalOpen(false);
                        setEditingChain(null);
                    }}
                    onSave={async (chain) => {
                        if (editingChain) {
                            await trigger(() => DockerClient.updateRuleChain(chain.id, chain), {
                                onSuccess: () => {
                                    fetchData();
                                    setIsRuleChainModalOpen(false);
                                    setEditingChain(null);
                                },
                                successMessage: 'Rule chain updated',
                                errorMessage: 'Failed to update rule chain',
                            });
                        } else {
                            await trigger(() => DockerClient.addRuleChain(chain), {
                                onSuccess: () => {
                                    fetchData();
                                    setIsRuleChainModalOpen(false);
                                },
                                successMessage: 'Rule chain added',
                                errorMessage: 'Failed to add rule chain',
                            });
                        }
                    }}
                />
            )}
        </div>
    );
}

function RuleChainModal({
    chain,
    onClose,
    onSave,
}: {
    chain: RuleChain | null;
    onClose: () => void;
    onSave: (chain: RuleChain) => void;
}) {
    const [name, setName] = useState(chain?.name || '');
    const [description, setDescription] = useState(chain?.description || '');
    const [enabled, setEnabled] = useState(chain?.enabled ?? true);
    const [operator, setOperator] = useState<RuleOperator>(chain?.operator || RuleOperator.OR);
    const [action, setAction] = useState<RuleAction>(chain?.action || RuleAction.JAIL);
    const [conditions, setConditions] = useState<RuleCondition[]>(chain?.conditions || []);
    const [actionConfig, setActionConfig] = useState<RuleActionConfig>(chain?.actionConfig || {});
    const [order, setOrder] = useState(chain?.order || 0);

    const addCondition = () => {
        setConditions([
            ...conditions,
            {
                id: Math.random().toString(36).substring(2, 11),
                type: ProxyJailRuleType.PATH,
                pattern: '',
                negate: false,
            },
        ]);
    };

    const updateCondition = (id: string, updates: Partial<RuleCondition>) => {
        setConditions(conditions.map((c) => (c.id === id ? { ...c, ...updates } : c)));
    };

    const removeCondition = (id: string) => {
        setConditions(conditions.filter((c) => c.id !== id));
    };

    const handleSave = () => {
        if (!name.trim()) {
            toast.error('Rule chain name is required');
            return;
        }
        if (conditions.length === 0) {
            toast.error('At least one condition is required');
            return;
        }
        if (conditions.some((c) => !c.pattern.trim())) {
            toast.error('All conditions must have a pattern');
            return;
        }

        const newChain: RuleChain = {
            id: chain?.id || Math.random().toString(36).substr(2, 9),
            name: name.trim(),
            description: description.trim() || undefined,
            enabled,
            operator,
            conditions,
            action,
            actionConfig: Object.keys(actionConfig).length > 0 ? actionConfig : undefined,
            order,
        };

        onSave(newChain);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
            <div className="bg-surface border border-outline/20 rounded-[32px] w-full max-w-4xl shadow-2xl p-8 my-8">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                            <GitBranch size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">{chain ? 'Edit Rule Chain' : 'New Rule Chain'}</h2>
                            <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-widest">
                                Configure advanced security rules
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/5 rounded-xl transition-all"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-black uppercase text-on-surface-variant px-1 tracking-widest">
                                Rule Chain Name *
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Block SQL Injection Attempts"
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-primary/50"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black uppercase text-on-surface-variant px-1 tracking-widest">
                                Description
                            </label>
                            <input
                                type="text"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Optional description"
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-primary/50"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-black uppercase text-on-surface-variant px-1 tracking-widest">
                                    Evaluation Order
                                </label>
                                <input
                                    type="number"
                                    value={order}
                                    onChange={(e) => setOrder(parseInt(e.target.value) || 0)}
                                    min="0"
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-primary/50"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-black uppercase text-on-surface-variant px-1 tracking-widest">
                                    Status
                                </label>
                                <button
                                    onClick={() => setEnabled(!enabled)}
                                    className={`w-full py-3 rounded-xl border transition-all ${
                                        enabled
                                            ? 'bg-green-500/10 text-green-500 border-green-500/20'
                                            : 'bg-red-500/10 text-red-500 border-red-500/20'
                                    }`}
                                >
                                    {enabled ? 'Enabled' : 'Disabled'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Conditions */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-black uppercase text-on-surface-variant px-1 tracking-widest">
                                Conditions *
                            </label>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-on-surface-variant">Logic:</span>
                                <button
                                    onClick={() => setOperator(RuleOperator.AND)}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                        operator === RuleOperator.AND
                                            ? 'bg-primary text-on-primary'
                                            : 'bg-black/40 text-on-surface-variant'
                                    }`}
                                >
                                    AND
                                </button>
                                <button
                                    onClick={() => setOperator(RuleOperator.OR)}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                        operator === RuleOperator.OR
                                            ? 'bg-primary text-on-primary'
                                            : 'bg-black/40 text-on-surface-variant'
                                    }`}
                                >
                                    OR
                                </button>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {conditions.map((condition, idx) => (
                                <div
                                    key={condition.id}
                                    className="bg-black/20 border border-outline/10 rounded-xl p-4 space-y-3"
                                >
                                    {idx > 0 && (
                                        <div className="flex items-center justify-center mb-2">
                                            <span className="text-xs font-black text-primary px-3 py-1 rounded-full bg-primary/10">
                                                {operator}
                                            </span>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-4 gap-3">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase text-on-surface-variant">
                                                Type
                                            </label>
                                            <select
                                                value={condition.type}
                                                onChange={(e) =>
                                                    updateCondition(condition.id, {
                                                        type: e.target.value as ProxyJailRuleType,
                                                    })
                                                }
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                                            >
                                                <option value={ProxyJailRuleType.IP}>IP Address</option>
                                                <option value={ProxyJailRuleType.USER_AGENT}>User Agent</option>
                                                <option value={ProxyJailRuleType.METHOD}>HTTP Method</option>
                                                <option value={ProxyJailRuleType.PATH}>Path/URL</option>
                                                <option value={ProxyJailRuleType.STATUS_CODE}>Status Code</option>
                                                <option value={ProxyJailRuleType.REFERER}>Referer</option>
                                                <option value={ProxyJailRuleType.DOMAIN}>Domain</option>
                                            </select>
                                        </div>
                                        <div className="col-span-2 space-y-1.5">
                                            <label className="text-[10px] font-black uppercase text-on-surface-variant">
                                                Pattern (Regex) *
                                            </label>
                                            <input
                                                type="text"
                                                value={condition.pattern}
                                                onChange={(e) =>
                                                    updateCondition(condition.id, { pattern: e.target.value })
                                                }
                                                placeholder="e.g. ^sqlmap/.* or 192.168.1.0/24"
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono font-bold focus:outline-none"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase text-on-surface-variant">
                                                Negate
                                            </label>
                                            <button
                                                onClick={() =>
                                                    updateCondition(condition.id, { negate: !condition.negate })
                                                }
                                                className={`w-full py-2 rounded-xl border transition-all text-xs font-bold ${
                                                    condition.negate
                                                        ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                                        : 'bg-black/40 border-white/10 text-on-surface-variant'
                                                }`}
                                            >
                                                {condition.negate ? 'NOT' : 'Match'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase text-on-surface-variant">
                                            Description (Optional)
                                        </label>
                                        <input
                                            type="text"
                                            value={condition.description || ''}
                                            onChange={(e) =>
                                                updateCondition(condition.id, { description: e.target.value || undefined })
                                            }
                                            placeholder="e.g. SQL injection tool"
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                                        />
                                    </div>
                                    <button
                                        onClick={() => removeCondition(condition.id)}
                                        className="w-full py-2 text-red-500 hover:bg-red-500/10 rounded-xl border border-red-500/20 transition-all text-xs font-bold"
                                    >
                                        Remove Condition
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={addCondition}
                                className="w-full py-3 border-2 border-dashed border-outline/20 hover:border-primary/30 rounded-xl text-xs font-bold text-on-surface-variant hover:text-primary transition-all flex items-center justify-center gap-2"
                            >
                                <Plus size={16} />
                                Add Condition
                            </button>
                        </div>
                    </div>

                    {/* Action */}
                    <div className="space-y-4">
                        <label className="text-xs font-black uppercase text-on-surface-variant px-1 tracking-widest">
                            Action *
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setAction(RuleAction.JAIL)}
                                className={`p-4 rounded-xl border transition-all flex items-center gap-3 ${
                                    action === RuleAction.JAIL
                                        ? 'bg-orange-500/10 text-orange-500 border-orange-500/30'
                                        : 'bg-black/40 border-white/10 text-on-surface-variant hover:border-primary/30'
                                }`}
                            >
                                <ShieldAlert size={20} />
                                <span className="text-sm font-bold">Jail IP</span>
                            </button>
                            <button
                                onClick={() => setAction(RuleAction.NGINX_BLOCK)}
                                className={`p-4 rounded-xl border transition-all flex items-center gap-3 ${
                                    action === RuleAction.NGINX_BLOCK
                                        ? 'bg-red-500/10 text-red-500 border-red-500/30'
                                        : 'bg-black/40 border-white/10 text-on-surface-variant hover:border-primary/30'
                                }`}
                            >
                                <Ban size={20} />
                                <span className="text-sm font-bold">Block at Nginx</span>
                            </button>
                            <button
                                onClick={() => setAction(RuleAction.NGINX_DENY)}
                                className={`p-4 rounded-xl border transition-all flex items-center gap-3 ${
                                    action === RuleAction.NGINX_DENY
                                        ? 'bg-red-600/10 text-red-600 border-red-600/30'
                                        : 'bg-black/40 border-white/10 text-on-surface-variant hover:border-primary/30'
                                }`}
                            >
                                <X size={20} />
                                <span className="text-sm font-bold">Deny at Nginx</span>
                            </button>
                            <button
                                onClick={() => setAction(RuleAction.LOG_ONLY)}
                                className={`p-4 rounded-xl border transition-all flex items-center gap-3 ${
                                    action === RuleAction.LOG_ONLY
                                        ? 'bg-blue-500/10 text-blue-500 border-blue-500/30'
                                        : 'bg-black/40 border-white/10 text-on-surface-variant hover:border-primary/30'
                                }`}
                            >
                                <FileText size={20} />
                                <span className="text-sm font-bold">Log Only</span>
                            </button>
                        </div>

                        {/* Action Config */}
                        {action === RuleAction.JAIL && (
                            <div className="space-y-1.5 bg-black/20 p-4 rounded-xl border border-outline/10">
                                <label className="text-xs font-black uppercase text-on-surface-variant">
                                    Jail Duration (minutes, optional - uses default if not set)
                                </label>
                                <input
                                    type="number"
                                    value={actionConfig.jailDurationMinutes || ''}
                                    onChange={(e) =>
                                        setActionConfig({
                                            ...actionConfig,
                                            jailDurationMinutes: e.target.value ? parseInt(e.target.value) : undefined,
                                        })
                                    }
                                    placeholder="Leave empty for default"
                                    min="1"
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm font-bold focus:outline-none"
                                />
                            </div>
                        )}

                        {(action === RuleAction.NGINX_BLOCK || action === RuleAction.NGINX_DENY) && (
                            <div className="space-y-3 bg-black/20 p-4 rounded-xl border border-outline/10">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-black uppercase text-on-surface-variant">
                                        Response Code
                                    </label>
                                    <select
                                        value={actionConfig.nginxResponseCode || 403}
                                        onChange={(e) =>
                                            setActionConfig({
                                                ...actionConfig,
                                                nginxResponseCode: parseInt(e.target.value),
                                            })
                                        }
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm font-bold focus:outline-none"
                                    >
                                        <option value={403}>403 Forbidden</option>
                                        <option value={444}>444 Close Connection (NGINX_DENY only)</option>
                                        <option value={429}>429 Too Many Requests</option>
                                    </select>
                                </div>
                                {action === RuleAction.NGINX_BLOCK && (
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-black uppercase text-on-surface-variant">
                                            Response Message (Optional)
                                        </label>
                                        <input
                                            type="text"
                                            value={actionConfig.nginxResponseMessage || ''}
                                            onChange={(e) =>
                                                setActionConfig({
                                                    ...actionConfig,
                                                    nginxResponseMessage: e.target.value || undefined,
                                                })
                                            }
                                            placeholder="e.g. Access Denied"
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm font-bold focus:outline-none"
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex gap-3 pt-6 mt-6 border-t border-outline/10">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 rounded-xl text-sm font-bold hover:bg-white/5 transition-all text-on-surface-variant"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-1 py-3 rounded-xl bg-primary text-on-primary text-sm font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        <Save size={16} />
                        {chain ? 'Update Rule Chain' : 'Create Rule Chain'}
                    </button>
                </div>
            </div>
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
                        <ShieldAlert size={24} />
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
