'use client';

import React, { useEffect, useState } from 'react';
import {
    Shield, ShieldAlert, ShieldCheck, Trash2, Plus, Search,
    RefreshCw, Globe, Lock, Activity, Terminal, ListFilter,
    ShieldOff, AlertTriangle, UserMinus, History, Settings
} from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { FirewallRule, BtmpStats, SystemConfig, ProxyJailRule, ProxyJailRuleType } from '@/lib/types';
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
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'firewall' | 'jails' | 'rules'>('overview');
    const { trigger } = useActionTrigger();

    // Firewall Modal
    const [isFirewallModalOpen, setIsFirewallModalOpen] = useState(false);

    const fetchData = async (manual = false) => {
        if (manual) setIsLoading(true);
        try {
            const [firewall, btmp, proxy] = await Promise.all([
                DockerClient.listFirewallRules(),
                DockerClient.getBtmpStats(),
                DockerClient.getProxySecuritySettings()
            ]);
            setFirewallRules(firewall);
            setBtmpStats(btmp);
            setProxyConfig(proxy);
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
                            label="Proxy Rules"
                            value={(proxyConfig?.proxyJailRules.length || 0).toString()}
                            sub="Reverse Proxy Jails"
                            color="primary"
                            icon={<Globe size={20} />}
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
                                            <span className="text-[8px] text-on-surface-variant font-bold mt-0.5">
                                                {jail.expiresAt ? `Expires in ${Math.max(0, Math.round((jail.expiresAt - Date.now()) / 60000))}m` : 'Permanent'}
                                            </span>
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

                                <div className="h-10 w-[1px] bg-white/5" />

                                {/* Proxy Threshold Slider */}
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-tighter">Proxy Sensitivity</span>
                                        <span className="text-[10px] font-mono font-black text-primary bg-primary/10 px-2 py-0.5 rounded">{proxyConfig?.proxyJailThresholdNon200 || 20} Errors</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="5"
                                        max="100"
                                        value={proxyConfig?.proxyJailThresholdNon200 || 20}
                                        onChange={(e) => updateProxySecurity({ proxyJailThresholdNon200: parseInt(e.target.value) })}
                                        className="w-32 accent-primary h-1 bg-white/5 rounded-full appearance-none cursor-pointer"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 pt-4">
                            {/* SSH Mitigation Settings */}
                            <div className="lg:col-span-1 space-y-6">
                                <div className="bg-white/[0.03] border border-white/5 rounded-[24px] p-5">
                                    <h4 className="text-[10px] font-black uppercase mb-6 flex items-center gap-2 tracking-widest text-orange-500">
                                        <Terminal size={14} />
                                        SSH Mitigation
                                    </h4>

                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black uppercase text-on-surface">Auto-Jail</span>
                                                <span className="text-[9px] text-on-surface-variant/60 font-medium whitespace-nowrap">Block SSH brute force</span>
                                            </div>
                                            <button
                                                onClick={() => updateAutoJailSettings({ enabled: !btmpStats?.autoJailEnabled })}
                                                className={`p-2 rounded-xl border transition-all ${btmpStats?.autoJailEnabled ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/10'}`}
                                            >
                                                {btmpStats?.autoJailEnabled ? <ShieldCheck size={18} /> : <ShieldOff size={18} />}
                                            </button>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-[10px] font-black uppercase text-on-surface-variant">Max Failures</span>
                                                <span className="text-[10px] font-mono font-black text-orange-500">{btmpStats?.jailThreshold || 5}</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="1"
                                                max="20"
                                                value={btmpStats?.jailThreshold || 5}
                                                onChange={(e) => updateAutoJailSettings({ threshold: parseInt(e.target.value) })}
                                                className="w-full accent-orange-500 h-1 bg-white/5 rounded-full appearance-none cursor-pointer"
                                            />
                                        </div>

                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-[10px] font-black uppercase text-on-surface-variant">Jail Duration</span>
                                            </div>
                                            <select
                                                value={btmpStats?.jailDurationMinutes || 30}
                                                onChange={(e) => updateAutoJailSettings({ duration: parseInt(e.target.value) })}
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold focus:outline-none"
                                            >
                                                <option value="15">15 Minutes</option>
                                                <option value="30">30 Minutes</option>
                                                <option value="60">1 Hour</option>
                                                <option value="1440">24 Hours</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Proxy Jail Rules List */}
                            <div className="lg:col-span-2">
                                <div className="flex items-center justify-between mb-4 px-1">
                                    <h4 className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest flex items-center gap-2">
                                        <Globe size={14} className="text-primary" />
                                        Active Guard Rails
                                    </h4>
                                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-3 py-1 rounded-full">{proxyConfig?.proxyJailRules?.length || 0} Rules Active</span>
                                </div>
                                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 scrollbar-invisible">
                                    {proxyConfig?.proxyJailRules?.map((rule) => (
                                        <div key={rule.id} className="group bg-white/5 border border-white/5 p-4 rounded-2xl hover:border-primary/30 transition-all flex items-center justify-between">
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
                                                        {rule.description && <span className="text-[10px] font-bold text-primary truncate max-w-[200px]">{rule.description}</span>}
                                                    </div>
                                                    <div className="text-sm font-mono font-bold truncate text-on-surface break-all">{rule.pattern}</div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const newRules = proxyConfig.proxyJailRules.filter(r => r.id !== rule.id);
                                                    updateProxySecurity({ proxyJailRules: newRules });
                                                }}
                                                className="p-2 text-on-surface-variant hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                    {(!proxyConfig?.proxyJailRules || proxyConfig.proxyJailRules.length === 0) && (
                                        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-white/5 rounded-3xl bg-white/[0.02]">
                                            <Shield className="text-on-surface-variant/10 mb-4" size={48} />
                                            <p className="text-sm font-bold text-on-surface-variant">No edge security rules defined.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Add Rule Sidebar */}
                            <div className="lg:col-span-1">
                                <div className="bg-white/[0.03] border border-white/5 rounded-[24px] p-5 h-fit sticky top-6">
                                    <h4 className="text-[10px] font-black uppercase mb-6 flex items-center gap-2 tracking-widest">
                                        <Plus size={16} className="text-primary" />
                                        Add Armor Rule
                                    </h4>
                                    <form className="space-y-4" onSubmit={(e) => {
                                        e.preventDefault();
                                        const form = e.target as HTMLFormElement;
                                        const type = (form.elements.namedItem('rule-type') as HTMLSelectElement).value;
                                        const pattern = (form.elements.namedItem('rule-pattern') as HTMLInputElement).value;
                                        const description = (form.elements.namedItem('rule-description') as HTMLInputElement).value;

                                        if (!pattern) return toast.error('Pattern is required');

                                        const newRule: ProxyJailRule = {
                                            id: Math.random().toString(36).substr(2, 9),
                                            type: type as ProxyJailRuleType,
                                            pattern,
                                            description
                                        };

                                        updateProxySecurity({ proxyJailRules: [...(proxyConfig?.proxyJailRules || []), newRule] });
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
