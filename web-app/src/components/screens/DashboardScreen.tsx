'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Shield,
    Globe,
    Activity,
    Zap,
    ShieldAlert,
    TrendingUp,
    Lock,
    MousePointerClick,
    Container,
    ArrowRight,
    Server
} from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { ProxyStats, DockerContainer } from '@/lib/types';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import { RefreshCw } from 'lucide-react';

export default function DashboardScreen() {
    const router = useRouter();

    const [proxyStats, setProxyStats] = useState<ProxyStats | null>(null);
    const [containers, setContainers] = useState<DockerContainer[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [proxy, conts] = await Promise.all([
                DockerClient.getProxyStats(),
                DockerClient.listContainers()
            ]);
            setProxyStats(proxy);
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

    const navigateTo = (screen: string) => {
        router.push(`/?screen=${screen}`);
    };

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
                    onClick={() => navigateTo('Containers')}
                />
                <StatCard
                    icon={<Shield size={20} />}
                    label="Security"
                    value="0"
                    subValue="Active Protection"
                    color="red"
                    onClick={() => navigateTo('Security')}
                />
                <StatCard
                    icon={<MousePointerClick size={20} />}
                    label="Hits"
                    value={proxyStats?.totalHits.toLocaleString() || '0'}
                    subValue="Total Traffic"
                    color="blue"
                    onClick={() => navigateTo('Analytics')}
                />
                <StatCard
                    icon={<Zap size={20} />}
                    label="Status"
                    value="Online"
                    subValue="System Stable"
                    color="orange"
                    onClick={() => navigateTo('System')}
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
                        <button
                            onClick={() => navigateTo('Analytics')}
                            className="p-1.5 hover:bg-white/5 rounded-lg text-on-surface-variant hover:text-primary transition-colors"
                            title="View detailed analytics"
                        >
                            <ArrowRight size={16} />
                        </button>
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

                <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[24px] p-5 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <h3 className="text-sm font-bold flex items-center gap-2">
                                <ShieldAlert size={16} className="text-red-400" />
                                Security Info
                            </h3>
                            <span className="text-[9px] uppercase font-bold text-on-surface-variant/30 tracking-wider">Infrastructure protection</span>
                        </div>
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant/20 py-10">
                        <Shield size={48} className="mb-2 opacity-5" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Shield Active</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[24px] p-5 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <h3 className="text-sm font-bold flex items-center gap-2">
                                <Lock size={16} className="text-orange-400" />
                                Monitor Feed
                            </h3>
                            <span className="text-[9px] uppercase font-bold text-on-surface-variant/30 tracking-wider">System events</span>
                        </div>
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant/20 py-10">
                        <Lock size={48} className="mb-2 opacity-5" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Logging Enabled</span>
                    </div>
                </div>

                {/* Popular Proxy Paths */}
                <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[24px] p-5 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <h3 className="text-sm font-bold flex items-center gap-2">
                                <Globe size={16} className="text-blue-400" />
                                Active Paths
                            </h3>
                            <span className="text-[9px] uppercase font-bold text-on-surface-variant/30 tracking-wider">Most visited routes</span>
                        </div>
                        <button
                            onClick={() => navigateTo('Analytics')}
                            className="p-1.5 hover:bg-white/5 rounded-lg text-on-surface-variant hover:text-primary transition-colors"
                            title="View full analytics"
                        >
                            <ArrowRight size={16} />
                        </button>
                    </div>
                    <div className="space-y-2">
                        {proxyStats?.topPaths?.slice(0, 4).map(({ path, count }, i) => (
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
                                            style={{ width: `${Math.min(100, (count / (proxyStats?.topPaths?.[0]?.count || 1)) * 100)}%` }}
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

function StatCard({ icon, label, value, subValue, color, onClick }: {
    icon: React.ReactNode,
    label: string,
    value: string,
    subValue: string,
    color: 'primary' | 'red' | 'blue' | 'orange',
    onClick?: () => void
}) {
    const colorMap = {
        primary: 'text-primary bg-primary/10 border-primary/20',
        red: 'text-red-500 bg-red-500/10 border-red-500/20',
        blue: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
        orange: 'text-orange-500 bg-orange-500/10 border-orange-500/20'
    };

    const Component = onClick ? 'button' : 'div';

    return (
        <Component
            onClick={onClick}
            className={`bg-surface/30 backdrop-blur-xl border border-outline/10 p-4 rounded-[24px] flex flex-col gap-3 hover:translate-y-[-2px] transition-all duration-300 text-left w-full ${onClick ? 'cursor-pointer hover:bg-white/5' : ''}`}
        >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${colorMap[color]}`}>
                {icon}
            </div>
            <div className="flex flex-col">
                <span className="text-[9px] uppercase font-black text-on-surface-variant/30 tracking-[0.1em] mb-0.5">{label}</span>
                <span className="text-2xl font-black">{value}</span>
                <span className="text-[9px] font-bold text-on-surface-variant/50">{subValue}</span>
            </div>
        </Component>
    );
}
