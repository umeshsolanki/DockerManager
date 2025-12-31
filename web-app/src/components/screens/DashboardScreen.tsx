'use client';

import React, { useEffect, useState } from 'react';
import {
    Shield,
    Globe,
    Activity,
    Zap,
    ShieldAlert,
    TrendingUp,
    Clock,
    Lock,
    Users,
    MousePointerClick,
    Server,
    Container
} from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { BtmpStats, ProxyStats, DockerContainer } from '@/lib/types';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import { RefreshCw } from 'lucide-react'; // Added import

export default function DashboardScreen() {
    const [btmpStats, setBtmpStats] = useState<BtmpStats | null>(null);
    const [proxyStats, setProxyStats] = useState<ProxyStats | null>(null);
    const [containers, setContainers] = useState<DockerContainer[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [btmp, proxy, conts] = await Promise.all([
                DockerClient.getBtmpStats(),
                DockerClient.getProxyStats(),
                DockerClient.listContainers()
            ]);
            setBtmpStats(btmp);
            setProxyStats(proxy);
            setContainers(conts);
        } catch (e) {
            console.error('Failed to fetch dashboard data', e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, []);

    const runningContainers = containers.filter(c => c.state === 'running').length;

    // Prepare chart data from proxy hits over time
    const chartData = proxyStats?.hitsOverTime ?
        Object.entries(proxyStats.hitsOverTime).map(([time, hits]) => ({
            time: time.split(' ')[1] || time, // Just the time part
            hits
        })).sort((a, b) => a.time.localeCompare(b.time)) : [];

    return (
        <div className="flex flex-col gap-5 pb-8">
            <header className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                    <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
                        <Activity className="text-primary" size={24} />
                        System Overview
                    </h1>
                    <p className="text-on-surface-variant/50 font-bold uppercase text-[8px] tracking-[0.2em] ml-0.5">
                        Real-time infrastructure monitoring
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchData}
                        disabled={isLoading}
                        className="p-2 bg-surface/50 border border-outline/10 rounded-xl hover:bg-white/5 transition-all text-on-surface-variant"
                    >
                        <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                    {btmpStats?.lastUpdated && (
                        <div className="flex flex-col items-end">
                            <span className="text-[8px] font-bold text-on-surface-variant/40 uppercase">Last Sync</span>
                            <span className="text-[10px] font-mono text-on-surface-variant/60">{new Date(btmpStats.lastUpdated).toLocaleTimeString()}</span>
                        </div>
                    )}
                </div>
            </header>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    icon={<Container size={20} />}
                    label="Containers"
                    value={runningContainers.toString()}
                    subValue={`Total ${containers.length}`}
                    color="primary"
                />
                <StatCard
                    icon={<Shield size={20} />}
                    label="Security"
                    value={btmpStats?.totalFailedAttempts?.toString() || '0'}
                    subValue={`${btmpStats?.jailedIps?.length || 0} Blocked`}
                    color="red"
                />
                <StatCard
                    icon={<MousePointerClick size={20} />}
                    label="Hits"
                    value={proxyStats?.totalHits.toLocaleString() || '0'}
                    subValue="Total Traffic"
                    color="blue"
                />
                <StatCard
                    icon={<Zap size={20} />}
                    label="Threats"
                    value={btmpStats?.topIps?.length?.toString() || '0'}
                    subValue="Unique Sources"
                    color="orange"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Traffic Trend Chart */}
                <div className="lg:col-span-2 bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[24px] p-5 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <h3 className="text-sm font-bold flex items-center gap-2">
                                <TrendingUp size={16} className="text-blue-400" />
                                Traffic Profile
                            </h3>
                            <span className="text-[9px] uppercase font-bold text-on-surface-variant/30 tracking-wider">Velocity over 24h</span>
                        </div>
                    </div>
                    <div className="h-[200px] w-full">
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
                                    stroke="rgba(255,255,255,0.1)"
                                    fontSize={10}
                                    tick={{ fill: 'rgba(255,255,255,0.3)' }}
                                />
                                <YAxis
                                    stroke="rgba(255,255,255,0.1)"
                                    fontSize={10}
                                    tick={{ fill: 'rgba(255,255,255,0.3)' }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'rgba(20,20,20,0.9)',
                                        borderRadius: '16px',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        fontSize: '12px'
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="hits"
                                    stroke="var(--md-sys-color-primary)"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorHits)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top Attackers List */}
                <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[24px] p-5 flex flex-col gap-4">
                    <div className="flex flex-col">
                        <h3 className="text-sm font-bold flex items-center gap-2">
                            <ShieldAlert size={16} className="text-red-400" />
                            Threat Sources
                        </h3>
                        <span className="text-[9px] uppercase font-bold text-on-surface-variant/30 tracking-wider">Top attacking IPs</span>
                    </div>
                    <div className="flex flex-col gap-2">
                        {btmpStats?.topIps?.slice(0, 4).map(({ first: ip, second: count }, i) => (
                            <div key={ip} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 group hover:border-red-500/20 transition-all">
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-red-500/10 text-red-500 text-[10px] font-bold">
                                        #{i + 1}
                                    </div>
                                    <span className="font-mono text-xs font-bold group-hover:text-red-400 transition-colors">{ip}</span>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-xs font-black">{count}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Recent Security Events */}
                <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[24px] p-5 flex flex-col gap-4">
                    <div className="flex flex-col">
                        <h3 className="text-sm font-bold flex items-center gap-2">
                            <Lock size={16} className="text-orange-400" />
                            Security Feed
                        </h3>
                        <span className="text-[9px] uppercase font-bold text-on-surface-variant/30 tracking-wider">Latest auth failures</span>
                    </div>
                    <div className="space-y-2">
                        {btmpStats?.recentFailures?.slice(0, 4).map((failure, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                                <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500">
                                    <ShieldAlert size={14} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold truncate"><span className="text-primary">{failure.user}</span> Login Failed</span>
                                        <span className="text-[9px] opacity-40 font-bold">{new Date(failure.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <p className="text-[9px] text-on-surface-variant/50 font-mono mt-0.5 truncate">{failure.ip}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Popular Proxy Paths */}
                <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[24px] p-5 flex flex-col gap-4">
                    <div className="flex flex-col">
                        <h3 className="text-sm font-bold flex items-center gap-2">
                            <Globe size={16} className="text-blue-400" />
                            Active Paths
                        </h3>
                        <span className="text-[9px] uppercase font-bold text-on-surface-variant/30 tracking-wider">Most visited routes</span>
                    </div>
                    <div className="space-y-2">
                        {proxyStats?.topPaths?.slice(0, 4).map(({ first: path, second: count }, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                                    <Server size={14} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold truncate">{path}</span>
                                        <span className="text-xs font-black text-blue-400">{count}</span>
                                    </div>
                                    <div className="mt-1.5 w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-500/50"
                                            style={{ width: `${Math.min(100, (count / (proxyStats?.topPaths?.[0]?.second || 1)) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ icon, label, value, subValue, color }: { icon: React.ReactNode, label: string, value: string, subValue: string, color: 'primary' | 'red' | 'blue' | 'orange' }) {
    const colorMap = {
        primary: 'text-primary bg-primary/10 border-primary/20',
        red: 'text-red-500 bg-red-500/10 border-red-500/20',
        blue: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
        orange: 'text-orange-500 bg-orange-500/10 border-orange-500/20'
    };

    return (
        <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 p-4 rounded-[24px] flex flex-col gap-3 hover:translate-y-[-2px] transition-all duration-300">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${colorMap[color]}`}>
                {icon}
            </div>
            <div className="flex flex-col">
                <span className="text-[9px] uppercase font-black text-on-surface-variant/30 tracking-[0.1em] mb-0.5">{label}</span>
                <span className="text-2xl font-black">{value}</span>
                <span className="text-[9px] font-bold text-on-surface-variant/50">{subValue}</span>
            </div>
        </div>
    );
}
