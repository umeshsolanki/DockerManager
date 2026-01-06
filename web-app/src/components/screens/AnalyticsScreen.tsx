'use client';

import React, { useEffect, useState } from 'react';
import {
    BarChart3, Activity, Globe, Server, User, Link2,
    RefreshCw, MousePointerClick, Zap, TrendingUp, Clock,
    Network, Hash, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { ProxyStats, GenericHitEntry } from '@/lib/types';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import { toast } from 'sonner';

export default function AnalyticsScreen() {
    const [stats, setStats] = useState<ProxyStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshInterval, setRefreshInterval] = useState(30000);

    const fetchData = async (manual = false) => {
        if (manual) setIsLoading(true);
        try {
            const data = await DockerClient.getProxyStats();
            setStats(data);
            if (manual) toast.success('Analytics data refreshed');
        } catch (e) {
            console.error('Failed to fetch analytics', e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, refreshInterval);
        return () => clearInterval(interval);
    }, [refreshInterval]);

    const handleForceRefresh = async () => {
        setIsLoading(true);
        const data = await DockerClient.refreshProxyStats();
        setStats(data);
        setIsLoading(false);
        toast.success('Stats recalculated from logs');
    };

    if (!stats && isLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <RefreshCw className="animate-spin text-primary" size={32} />
            </div>
        );
    }

    const chartData = stats?.hitsOverTime ?
        Object.entries(stats.hitsOverTime).map(([time, hits]) => ({
            time: time.split(' ')[1] || time,
            hits
        })).sort((a, b) => a.time.localeCompare(b.time)) : [];

    return (
        <div className="flex flex-col gap-6 pb-10">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <Activity className="text-primary" size={28} />
                        Analytics
                    </h1>
                    <p className="text-on-surface-variant/60 text-sm mt-1">Traffic patterns and infrastructure performance insights</p>
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={refreshInterval}
                        onChange={(e) => setRefreshInterval(Number(e.target.value))}
                        className="bg-surface border border-outline/10 rounded-xl px-3 py-1.5 text-xs font-bold text-on-surface-variant outline-none focus:border-primary transition-all"
                    >
                        <option value={10000}>10s Refresh</option>
                        <option value={30000}>30s Refresh</option>
                        <option value={60000}>1m Refresh</option>
                    </select>
                    <button
                        onClick={handleForceRefresh}
                        className="p-2 bg-surface border border-outline/10 rounded-xl hover:bg-white/5 transition-all text-primary"
                        title="Recalculate from source logs"
                    >
                        <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </header>

            {/* High Level Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <AnalyticCard
                    label="Total Requests"
                    value={stats?.totalHits.toLocaleString() || '0'}
                    icon={<MousePointerClick size={20} />}
                    sub="Lifetime Traffic"
                    color="primary"
                />
                <AnalyticCard
                    label="Active Domains"
                    value={Object.keys(stats?.hitsByDomain || {}).length.toString()}
                    icon={<Globe size={20} />}
                    sub="Configured Hosts"
                    color="blue"
                />
                <AnalyticCard
                    label="Unique Reach"
                    value={stats?.topIps.length.toString() || '0'}
                    icon={<Network size={20} />}
                    sub="Unique Source IPs"
                    color="indigo"
                />
                <AnalyticCard
                    label="Error Rate"
                    value={stats ? `${((Object.entries(stats.hitsByStatus).filter(([s]) => !s.startsWith('2')).reduce((acc, [_, v]) => acc + v, 0) / stats.totalHits) * 100).toFixed(1)}%` : '0%'}
                    icon={<Zap size={20} />}
                    sub="Non-200 Responses"
                    color="red"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Traffic Profile Chart */}
                <div className="lg:col-span-2 bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] p-6">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-xl font-bold">Traffic Velocity</h3>
                            <p className="text-xs text-on-surface-variant font-medium">Request frequency over the last 24 hours</p>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full text-[10px] font-black tracking-tighter text-primary uppercase">
                            <TrendingUp size={12} />
                            Real-time Intensity
                        </div>
                    </div>
                    <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="colorHits" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--md-sys-color-primary)" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="var(--md-sys-color-primary)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="time"
                                    stroke="rgba(255,255,255,0.05)"
                                    tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    stroke="rgba(255,255,255,0.05)"
                                    tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'rgba(15,15,15,0.9)',
                                        borderRadius: '20px',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        backdropFilter: 'blur(12px)',
                                        fontSize: '12px',
                                        fontWeight: 'bold'
                                    }}
                                    itemStyle={{ color: 'var(--md-sys-color-primary)' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="hits"
                                    stroke="var(--md-sys-color-primary)"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorHits)"
                                    animationDuration={2000}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top Hosts Pie */}
                <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] p-6 flex flex-col">
                    <h3 className="text-xl font-bold mb-6">Host Distribution</h3>
                    <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-invisible">
                        {stats?.hitsByDomain && Object.entries(stats.hitsByDomain).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([domain, count], i) => (
                            <div key={domain} className="group">
                                <div className="flex justify-between items-center mb-1.5 px-1">
                                    <span className="text-xs font-bold truncate pr-3 group-hover:text-primary transition-colors">{domain}</span>
                                    <span className="text-[10px] font-black text-on-surface-variant opacity-60">{count.toLocaleString()}</span>
                                </div>
                                <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                    <div
                                        className="h-full bg-primary/60 rounded-full transition-all duration-1000"
                                        style={{ width: `${(count / stats.totalHits) * 100}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 pt-6 border-t border-outline/5">
                        <div className="flex justify-between items-center text-[10px] font-black uppercase text-on-surface-variant/40 tracking-widest px-2">
                            <span>Target</span>
                            <span>Proportion</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Popular Routes */}
                <StatsListCard
                    title="Active Routes"
                    icon={<Server size={18} />}
                    items={stats?.topPaths.slice(0, 8).map(p => ({ label: p.path, value: p.count, sub: 'Path' })) || []}
                    color="primary"
                    total={stats?.totalHits || 1}
                />

                {/* Top Sources */}
                <StatsListCard
                    title="Source Networks"
                    icon={<Network size={18} />}
                    items={stats?.topIps.slice(0, 8).map(p => ({ label: p.label, value: p.count, sub: 'IP Source' })) || []}
                    color="indigo"
                    total={stats?.totalHits || 1}
                />

                {/* Top Browsers/UAs */}
                <StatsListCard
                    title="User Agents"
                    icon={<User size={18} />}
                    items={stats?.topUserAgents.slice(0, 8).map(p => ({ label: p.label, value: p.count, sub: 'Client' })) || []}
                    color="pink"
                    total={stats?.totalHits || 1}
                />
            </div>

            {/* Advanced Analytics Table - Recent Hits Log */}
            <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] overflow-hidden">
                <div className="p-6 border-b border-outline/5 flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold">Real-time Traffic Stream</h3>
                        <p className="text-xs text-on-surface-variant font-medium">Last 50 edge requests</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest">Live</span>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-black/20">
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-on-surface-variant/60 tracking-widest">Timestamp</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-on-surface-variant/60 tracking-widest">Method</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-on-surface-variant/60 tracking-widest">Domain</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-on-surface-variant/60 tracking-widest">Path</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-on-surface-variant/60 tracking-widest">Source IP</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-on-surface-variant/60 tracking-widest text-center">Status</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-on-surface-variant/60 tracking-widest text-right">Time</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-outline/5">
                            {stats?.recentHits.slice(0, 50).map((hit, i) => (
                                <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="px-6 py-3 font-mono text-[10px] text-on-surface-variant">
                                        {new Date(hit.timestamp).toLocaleTimeString()}
                                    </td>
                                    <td className="px-6 py-3">
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded ${hit.method === 'GET' ? 'bg-green-500/10 text-green-500' :
                                            hit.method === 'POST' ? 'bg-blue-500/10 text-blue-500' :
                                                'bg-purple-500/10 text-purple-500'
                                            }`}>
                                            {hit.method}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-xs font-bold truncate max-w-[150px]" title={hit.domain}>
                                        {hit.domain}
                                    </td>
                                    <td className="px-6 py-3 text-xs font-medium truncate max-w-[200px]" title={hit.path}>
                                        {hit.path}
                                    </td>
                                    <td className="px-6 py-3 text-xs font-mono text-on-surface-variant">
                                        {hit.ip}
                                    </td>
                                    <td className="px-6 py-3 text-center">
                                        <span className={`text-[10px] font-black ${hit.status.toString().startsWith('2') ? 'text-green-500' :
                                            hit.status.toString().startsWith('3') ? 'text-blue-500' :
                                                'text-red-500'
                                            }`}>
                                            {hit.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-right font-mono text-[10px] text-on-surface-variant">
                                        {hit.responseTime}ms
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function AnalyticCard({ label, value, icon, sub, color }: { label: string, value: string, icon: React.ReactNode, sub: string, color: string }) {
    const colorClasses: Record<string, string> = {
        primary: 'bg-primary/10 text-primary border-primary/10',
        blue: 'bg-blue-500/10 text-blue-500 border-blue-500/10',
        indigo: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/10',
        red: 'bg-red-500/10 text-red-500 border-red-500/10',
    };

    return (
        <div className="bg-surface/30 border border-outline/10 rounded-[28px] p-5 flex flex-col gap-3 hover:translate-y-[-2px] transition-all duration-300">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border shadow-inner ${colorClasses[color]}`}>
                {icon}
            </div>
            <div className="flex flex-col">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{label}</span>
                <span className="text-2xl font-black mt-0.5">{value}</span>
                <span className="text-[10px] font-medium text-on-surface-variant/40 mt-1">{sub}</span>
            </div>
        </div>
    );
}

function StatsListCard({ title, icon, items, color, total }: { title: string, icon: React.ReactNode, items: any[], color: string, total: number }) {
    const colorClasses: Record<string, string> = {
        primary: 'text-primary bg-primary/10',
        indigo: 'text-indigo-500 bg-indigo-500/10',
        pink: 'text-pink-500 bg-pink-500/10',
    };

    return (
        <div className="bg-surface/30 border border-outline/10 rounded-[32px] p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-6">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${colorClasses[color]}`}>
                    {icon}
                </div>
                <h3 className="text-sm font-bold">{title}</h3>
            </div>
            <div className="space-y-4 flex-1">
                {items.map((item, i) => (
                    <div key={i} className="group">
                        <div className="flex justify-between items-center mb-1.5 px-1 truncate">
                            <div className="flex flex-col min-w-0">
                                <span className="text-[11px] font-bold truncate pr-3 group-hover:text-on-surface transition-colors">{item.label}</span>
                                <span className="text-[8px] font-black uppercase text-on-surface-variant/40 tracking-wider font-mono">{item.sub}</span>
                            </div>
                            <span className="text-[10px] font-black text-on-surface-variant">{item.value.toLocaleString()}</span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden border border-white/5">
                            <div
                                className={`h-full opacity-60 rounded-full transition-all duration-1000 ${color === 'primary' ? 'bg-primary' :
                                    color === 'indigo' ? 'bg-indigo-500' : 'bg-pink-500'
                                    }`}
                                style={{ width: `${(item.value / total) * 100}%` }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
