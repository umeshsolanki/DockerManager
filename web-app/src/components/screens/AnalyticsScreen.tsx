'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
    BarChart3, Activity, Globe, Server, User, Link2,
    RefreshCw, MousePointerClick, Zap, TrendingUp, Clock,
    Network, Hash, ArrowUpRight, ArrowDownRight, Search,
    Download, Filter, ChevronDown, ChevronUp, Calendar
} from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { ProxyStats, GenericHitEntry, DailyProxyStats } from '@/lib/types';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import { toast } from 'sonner';
import { StatCard } from '../ui/StatCard';
import { useTheme } from '@/contexts/ThemeContext';

export default function AnalyticsScreen() {
    const { theme } = useTheme();
    const [stats, setStats] = useState<ProxyStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshInterval, setRefreshInterval] = useState(30000);
    const [viewMode, setViewMode] = useState<'today' | 'historical'>('today');
    const [availableDates, setAvailableDates] = useState<string[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [historicalStats, setHistoricalStats] = useState<DailyProxyStats | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        paths: false,
        ips: false,
        userAgents: false,
        referers: false,
        methods: false,
        domains: false,
        countries: false,
        providers: false
    });
    const [itemsToShow, setItemsToShow] = useState<Record<string, number>>({
        paths: 10,
        ips: 10,
        userAgents: 10,
        referers: 10,
        methods: 10,
        domains: 10,
        countries: 10,
        providers: 10
    });

    // Theme-aware colors for charts
    const chartColors = useMemo(() => {
        const isDark = theme === 'dark';
        return {
            axisStroke: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
            axisTick: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
            tooltipBg: isDark ? 'rgba(15,15,15,0.95)' : 'rgba(255,255,255,0.95)',
            tooltipBorder: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
            tooltipText: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.9)',
            primary: isDark ? 'var(--color-primary)' : 'var(--color-primary)',
        };
    }, [theme]);

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
        if (viewMode === 'today') {
            fetchData();
            const interval = setInterval(fetchData, refreshInterval);
            return () => clearInterval(interval);
        } else {
            fetchAvailableDates();
        }
    }, [refreshInterval, viewMode]);

    useEffect(() => {
        if (viewMode === 'historical' && selectedDate) {
            fetchHistoricalStats(selectedDate);
        }
    }, [selectedDate, viewMode]);

    const fetchAvailableDates = async () => {
        try {
            const dates = await DockerClient.listAnalyticsDates();
            console.log('Available dates:', dates);
            if (dates && dates.length > 0) {
                setAvailableDates(dates);
                if (!selectedDate) {
                    setSelectedDate(dates[0]); // Select most recent date
                }
            } else {
                // If no dates found, at least show today's date
                const today = new Date().toISOString().split('T')[0];
                setAvailableDates([today]);
                if (!selectedDate) {
                    setSelectedDate(today);
                }
            }
        } catch (e) {
            console.error('Failed to fetch available dates', e);
            // Fallback to today's date
            const today = new Date().toISOString().split('T')[0];
            setAvailableDates([today]);
            if (!selectedDate) {
                setSelectedDate(today);
            }
        }
    };

    const fetchHistoricalStats = async (date: string) => {
        setIsLoading(true);
        setStats(null); // Clear stats first to avoid showing stale data
        setHistoricalStats(null);
        try {
            const data = await DockerClient.getHistoricalStats(date);
            if (data) {
                // Convert DailyProxyStats to ProxyStats format for display
                const convertedStats: ProxyStats = {
                    ...data,
                    recentHits: [], // Historical stats don't have recent hits
                    recentWebSocketConnections: [] // Historical stats don't have recent WebSocket connections
                };
                setHistoricalStats(data);
                setStats(convertedStats);
            } else {
                setStats(null);
                toast.error(`No stats found for ${date}`);
            }
        } catch (e) {
            console.error('Failed to fetch historical stats', e);
            setStats(null);
            toast.error('Failed to load historical stats');
        } finally {
            setIsLoading(false);
        }
    };

    const handleForceRefresh = async () => {
        setIsLoading(true);
        const data = await DockerClient.refreshProxyStats();
        setStats(data);
        setIsLoading(false);
        toast.success('Stats recalculated from logs');
    };

    // Memoized filtered data - all hooks must be at top level BEFORE any early returns
    const filteredPaths = useMemo(() => {
        return stats?.topPaths
            ?.filter(p => !searchQuery || p.path.toLowerCase().includes(searchQuery.toLowerCase()))
            .map(p => ({ label: p.path, value: p.count, sub: 'Path' })) || [];
    }, [stats?.topPaths, searchQuery]);

    const filteredIps = useMemo(() => {
        return stats?.topIps
            ?.filter(p => !searchQuery || p.label.toLowerCase().includes(searchQuery.toLowerCase()))
            .map(p => ({ label: p.label, value: p.count, sub: 'IP Source' })) || [];
    }, [stats?.topIps, searchQuery]);

    const filteredUserAgents = useMemo(() => {
        return stats?.topUserAgents
            ?.filter(p => !searchQuery || p.label.toLowerCase().includes(searchQuery.toLowerCase()))
            .map(p => ({ label: p.label.length > 60 ? p.label.substring(0, 60) + '...' : p.label, value: p.count, sub: 'Client' })) || [];
    }, [stats?.topUserAgents, searchQuery]);

    const filteredReferers = useMemo(() => {
        return stats?.topReferers
            ?.filter(p => !searchQuery || p.label.toLowerCase().includes(searchQuery.toLowerCase()))
            .map(p => ({ label: p.label.length > 60 ? p.label.substring(0, 60) + '...' : p.label, value: p.count, sub: 'Referer' })) || [];
    }, [stats?.topReferers, searchQuery]);

    const filteredMethods = useMemo(() => {
        return stats?.topMethods
            ?.filter(p => !searchQuery || p.label.toLowerCase().includes(searchQuery.toLowerCase()))
            .map(p => ({ label: p.label, value: p.count, sub: 'Method' })) || [];
    }, [stats?.topMethods, searchQuery]);

    const filteredDomains = useMemo(() => {
        return stats?.hitsByDomain
            ? Object.entries(stats.hitsByDomain)
                .filter(([domain]) => !searchQuery || domain.toLowerCase().includes(searchQuery.toLowerCase()))
                .sort(([, a], [, b]) => b - a)
                .map(([domain, count]) => ({ label: domain, value: count, sub: 'Domain' }))
            : [];
    }, [stats?.hitsByDomain, searchQuery]);

    const filteredCountries = useMemo(() => {
        return stats?.hitsByCountry
            ? Object.entries(stats.hitsByCountry)
                .filter(([country]) => !searchQuery || country.toLowerCase().includes(searchQuery.toLowerCase()))
                .sort(([, a], [, b]) => (b as any) - (a as any))
                .map(([country, count]) => ({ label: country, value: count, sub: 'Country' }))
            : [];
    }, [stats?.hitsByCountry, searchQuery]);

    const filteredProviders = useMemo(() => {
        return stats?.hitsByProvider
            ? Object.entries(stats.hitsByProvider)
                .filter(([provider]) => !searchQuery || provider.toLowerCase().includes(searchQuery.toLowerCase()))
                .sort(([, a], [, b]) => (b as any) - (a as any))
                .map(([provider, count]) => ({ label: provider.length > 40 ? provider.substring(0, 40) + '...' : provider, value: count, sub: 'Provider' }))
            : [];
    }, [stats?.hitsByProvider, searchQuery]);

    const chartData = useMemo(() => {
        return stats?.hitsOverTime ?
            Object.entries(stats.hitsOverTime).map(([time, hits]) => ({
                time: time.split(' ')[1] || time,
                hits
            })).sort((a, b) => a.time.localeCompare(b.time)) : [];
    }, [stats?.hitsOverTime]);

    if (!stats && isLoading) {
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
                        <Activity className="text-primary" size={28} />
                        Analytics
                    </h1>
                    <p className="text-on-surface-variant/60 text-sm mt-1">
                        {viewMode === 'today'
                            ? 'Traffic patterns and infrastructure performance insights'
                            : historicalStats
                                ? `Historical analytics for ${new Date(selectedDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
                                : 'Select a date to view historical analytics'}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* View Mode Toggle */}
                    <div className="flex gap-1 bg-surface border border-outline/10 rounded-xl p-1">
                        <button
                            onClick={() => {
                                setViewMode('today');
                                setSelectedDate('');
                                setHistoricalStats(null);
                                setStats(null); // Clear stats to force refresh
                                fetchData(true);
                            }}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === 'today'
                                    ? 'bg-primary text-on-primary'
                                    : 'text-on-surface-variant hover:bg-white/5'
                                }`}
                        >
                            Today
                        </button>
                        <button
                            onClick={() => {
                                setViewMode('historical');
                                fetchAvailableDates();
                            }}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === 'historical'
                                    ? 'bg-primary text-on-primary'
                                    : 'text-on-surface-variant hover:bg-white/5'
                                }`}
                        >
                            Historical
                        </button>
                    </div>

                    {viewMode === 'today' && (
                        <>
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
                        </>
                    )}

                    {viewMode === 'historical' && (
                        <select
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="bg-surface border border-outline/10 rounded-xl px-3 py-1.5 text-xs font-bold text-on-surface-variant outline-none focus:border-primary transition-all"
                        >
                            <option value="">Select Date</option>
                            {availableDates.map(date => (
                                <option key={date} value={date}>
                                    {new Date(date).toLocaleDateString('en-US', {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric'
                                    })}
                                </option>
                            ))}
                        </select>
                    )}
                </div>
            </header>

            {/* High Level Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Total Requests"
                    value={stats?.totalHits.toLocaleString() || '0'}
                    icon={<MousePointerClick size={20} />}
                    sub={viewMode === 'today' ? 'Today\'s Traffic' : 'Daily Total'}
                    color="primary"
                />
                <StatCard
                    label="Active Domains"
                    value={Object.keys(stats?.hitsByDomain || {}).length.toString()}
                    icon={<Globe size={20} />}
                    sub="Configured Hosts"
                    color="indigo"
                />
                <StatCard
                    label="Unique Reach"
                    value={stats?.topIps?.length.toString() || '0'}
                    icon={<Network size={20} />}
                    sub="Unique Source IPs"
                    color="indigo"
                />
                <StatCard
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
                                        <stop offset="5%" stopColor={chartColors.primary} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={chartColors.primary} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="time"
                                    stroke={chartColors.axisStroke}
                                    tick={{ fill: chartColors.axisTick, fontSize: 10 }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    stroke={chartColors.axisStroke}
                                    tick={{ fill: chartColors.axisTick, fontSize: 10 }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: chartColors.tooltipBg,
                                        borderRadius: '20px',
                                        border: `1px solid ${chartColors.tooltipBorder}`,
                                        backdropFilter: 'blur(12px)',
                                        fontSize: '12px',
                                        fontWeight: 'bold',
                                        color: chartColors.tooltipText
                                    }}
                                    itemStyle={{ color: chartColors.primary }}
                                    labelStyle={{ color: chartColors.tooltipText }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="hits"
                                    stroke={chartColors.primary}
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorHits)"
                                    animationDuration={2000}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top Hosts Distribution */}
                <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-bold">Host Distribution</h3>
                        <span className="text-[10px] text-on-surface-variant/60">
                            {stats?.hitsByDomain ? Object.keys(stats.hitsByDomain).length : 0} domains
                        </span>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-4 pr-1 max-h-[400px] scrollbar-thin scrollbar-thumb-outline/20 scrollbar-track-transparent">
                        {stats?.hitsByDomain && Object.entries(stats.hitsByDomain)
                            .sort((a, b) => b[1] - a[1])
                            .map(([domain, count], i) => (
                                <div key={domain} className="group">
                                    <div className="flex justify-between items-center mb-1.5 px-1">
                                        <span className="text-xs font-bold truncate pr-3 group-hover:text-primary transition-colors" title={domain}>
                                            {domain}
                                        </span>
                                        <span className="text-[10px] font-black text-on-surface-variant opacity-60 shrink-0">
                                            {count.toLocaleString()}
                                        </span>
                                    </div>
                                    <div className={`h-2 ${theme === 'dark' ? 'bg-white/5' : 'bg-black/5'} rounded-full overflow-hidden border ${theme === 'dark' ? 'border-white/5' : 'border-black/5'}`}>
                                        <div
                                            className="h-full bg-primary/60 rounded-full transition-all duration-1000"
                                            style={{ width: `${Math.min((count / (stats.totalHits || 1)) * 100, 100)}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        {(!stats?.hitsByDomain || Object.keys(stats.hitsByDomain).length === 0) && (
                            <div className="text-center py-8 text-on-surface-variant/60 text-sm">
                                No domain data available
                            </div>
                        )}
                    </div>
                    <div className="mt-6 pt-6 border-t border-outline/5">
                        <div className="flex justify-between items-center text-[10px] font-black uppercase text-on-surface-variant/40 tracking-widest px-2">
                            <span>Target</span>
                            <span>Proportion</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Status Code Breakdown */}
            <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <BarChart3 size={20} className="text-primary" />
                        Status Code Distribution
                    </h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {stats?.hitsByStatus && Object.entries(stats.hitsByStatus)
                        .sort(([a], [b]) => parseInt(a) - parseInt(b))
                        .map(([status, count]) => {
                            const statusInt = parseInt(status);
                            const percentage = stats.totalHits > 0 ? ((count / stats.totalHits) * 100).toFixed(1) : '0';
                            const colorClass = statusInt >= 500 ? 'bg-red-500/20 text-red-500 border-red-500/30' :
                                statusInt >= 400 ? 'bg-orange-500/20 text-orange-500 border-orange-500/30' :
                                    statusInt >= 300 ? 'bg-blue-500/20 text-blue-500 border-blue-500/30' :
                                        statusInt >= 200 ? 'bg-green-500/20 text-green-500 border-green-500/30' :
                                            'bg-gray-500/20 text-gray-500 border-gray-500/30';

                            return (
                                <div key={status} className={`p-4 rounded-xl border ${colorClass}`}>
                                    <div className="text-2xl font-black">{status}</div>
                                    <div className="text-xs font-bold mt-1 opacity-80">{count.toLocaleString()}</div>
                                    <div className="text-[10px] font-medium mt-1 opacity-60">{percentage}%</div>
                                </div>
                            );
                        })}
                    {(!stats?.hitsByStatus || Object.keys(stats.hitsByStatus).length === 0) && (
                        <div className="col-span-full text-center py-8 text-on-surface-variant/60 text-sm">
                            No status code data available
                        </div>
                    )}
                </div>
            </div>

            {/* Search and Filter Bar */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
                    <input
                        type="text"
                        placeholder="Search paths, IPs, domains..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-surface border border-outline/10 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-primary transition-all"
                    />
                </div>
                <button
                    onClick={() => {
                        if (!stats) return;
                        const dataStr = JSON.stringify(stats, null, 2);
                        const dataBlob = new Blob([dataStr], { type: 'application/json' });
                        const url = URL.createObjectURL(dataBlob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `analytics-${viewMode === 'today' ? 'today' : selectedDate}-${Date.now()}.json`;
                        link.click();
                        URL.revokeObjectURL(url);
                        toast.success('Analytics data exported');
                    }}
                    className="p-2.5 bg-surface border border-outline/10 rounded-xl hover:bg-white/5 transition-all text-primary"
                    title="Export data"
                >
                    <Download size={18} />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Popular Routes */}
                <ExpandableStatsCard
                    title="All Paths"
                    icon={<Server size={18} />}
                    items={filteredPaths}
                    color="primary"
                    total={stats?.totalHits || 1}
                    sectionKey="paths"
                    expanded={expandedSections.paths}
                    onToggle={() => setExpandedSections(prev => ({ ...prev, paths: !prev.paths }))}
                    itemsToShow={itemsToShow.paths}
                    onShowMore={() => setItemsToShow(prev => ({ ...prev, paths: prev.paths + 20 }))}
                />

                {/* Top Sources */}
                <ExpandableStatsCard
                    title="All Source IPs"
                    icon={<Network size={18} />}
                    items={filteredIps}
                    color="indigo"
                    total={stats?.totalHits || 1}
                    sectionKey="ips"
                    expanded={expandedSections.ips}
                    onToggle={() => setExpandedSections(prev => ({ ...prev, ips: !prev.ips }))}
                    itemsToShow={itemsToShow.ips}
                    onShowMore={() => setItemsToShow(prev => ({ ...prev, ips: prev.ips + 20 }))}
                />

                {/* Top Browsers/UAs */}
                <ExpandableStatsCard
                    title="User Agents"
                    icon={<User size={18} />}
                    items={filteredUserAgents}
                    color="pink"
                    total={stats?.totalHits || 1}
                    sectionKey="userAgents"
                    expanded={expandedSections.userAgents}
                    onToggle={() => setExpandedSections(prev => ({ ...prev, userAgents: !prev.userAgents }))}
                    itemsToShow={itemsToShow.userAgents}
                    onShowMore={() => setItemsToShow(prev => ({ ...prev, userAgents: prev.userAgents + 20 }))}
                />

                {/* Referers */}
                <ExpandableStatsCard
                    title="Referers"
                    icon={<Link2 size={18} />}
                    items={filteredReferers}
                    color="teal"
                    total={stats?.totalHits || 1}
                    sectionKey="referers"
                    expanded={expandedSections.referers}
                    onToggle={() => setExpandedSections(prev => ({ ...prev, referers: !prev.referers }))}
                    itemsToShow={itemsToShow.referers}
                    onShowMore={() => setItemsToShow(prev => ({ ...prev, referers: prev.referers + 20 }))}
                />

                {/* Methods */}
                <ExpandableStatsCard
                    title="HTTP Methods"
                    icon={<Hash size={18} />}
                    items={filteredMethods}
                    color="orange"
                    total={stats?.totalHits || 1}
                    sectionKey="methods"
                    expanded={expandedSections.methods}
                    onToggle={() => setExpandedSections(prev => ({ ...prev, methods: !prev.methods }))}
                    itemsToShow={itemsToShow.methods}
                    onShowMore={() => setItemsToShow(prev => ({ ...prev, methods: prev.methods + 20 }))}
                />

                {/* Domains */}
                <ExpandableStatsCard
                    title="Domains"
                    icon={<Globe size={18} />}
                    items={filteredDomains}
                    color="green"
                    total={stats?.totalHits || 1}
                    sectionKey="domains"
                    expanded={expandedSections.domains}
                    onToggle={() => setExpandedSections(prev => ({ ...prev, domains: !prev.domains }))}
                    itemsToShow={itemsToShow.domains}
                    onShowMore={() => setItemsToShow(prev => ({ ...prev, domains: prev.domains + 20 }))}
                />

                {/* Countries */}
                <ExpandableStatsCard
                    title="Countries"
                    icon={<Globe size={18} />}
                    items={filteredCountries}
                    color="teal"
                    total={stats?.totalHits || 1}
                    sectionKey="countries"
                    expanded={expandedSections.countries}
                    onToggle={() => setExpandedSections(prev => ({ ...prev, countries: !prev.countries }))}
                    itemsToShow={itemsToShow.countries}
                    onShowMore={() => setItemsToShow(prev => ({ ...prev, countries: prev.countries + 20 }))}
                />

                {/* Providers */}
                <ExpandableStatsCard
                    title="ISP / Providers"
                    icon={<Activity size={18} />}
                    items={filteredProviders}
                    color="primary"
                    total={stats?.totalHits || 1}
                    sectionKey="providers"
                    expanded={expandedSections.providers}
                    onToggle={() => setExpandedSections(prev => ({ ...prev, providers: !prev.providers }))}
                    itemsToShow={itemsToShow.providers}
                    onShowMore={() => setItemsToShow(prev => ({ ...prev, providers: prev.providers + 20 }))}
                />
            </div>

            {/* Advanced Analytics Table - Recent Hits Log (only for today) */}
            {viewMode === 'today' && (
                <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] overflow-hidden">
                    <div className="px-4 py-3 border-b border-outline/5 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold">Real-time Traffic Stream</h3>
                            <p className="text-[10px] text-on-surface-variant font-medium">Last 50 edge requests</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[9px] font-black uppercase text-on-surface-variant tracking-widest">Live</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className={theme === 'dark' ? 'bg-black/20' : 'bg-white/20'}>
                                    <th className="px-3 py-2 text-[9px] font-black uppercase text-on-surface-variant/60 tracking-widest">Timestamp</th>
                                    <th className="px-3 py-2 text-[9px] font-black uppercase text-on-surface-variant/60 tracking-widest">Domain</th>
                                    <th className="px-3 py-2 text-[9px] font-black uppercase text-on-surface-variant/60 tracking-widest">Path</th>
                                    <th className="px-3 py-2 text-[9px] font-black uppercase text-on-surface-variant/60 tracking-widest">Source IP</th>
                                    <th className="px-3 py-2 text-[9px] font-black uppercase text-on-surface-variant/60 tracking-widest text-right">Time</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-outline/5">
                                {stats?.recentHits.slice(0, 50).map((hit, i) => (
                                    <tr key={i} className={`${theme === 'dark' ? 'hover:bg-white/[0.02]' : 'hover:bg-black/[0.02]'} transition-colors group`}>
                                        <td className="px-3 py-1.5 font-mono text-[9px] text-on-surface-variant">
                                            {new Date(hit.timestamp).toLocaleTimeString()}
                                        </td>
                                        <td className="px-3 py-1.5 text-[10px] font-bold truncate max-w-[150px]" title={hit.domain || undefined}>
                                            {hit.domain}
                                        </td>
                                        <td className="px-3 py-1.5 text-[10px] font-medium truncate max-w-[300px]" title={hit.path}>
                                            <div className="flex items-center gap-1.5">
                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 ${hit.method === 'GET' ? 'bg-green-500/10 text-green-500' :
                                                    hit.method === 'POST' ? 'bg-blue-500/10 text-blue-500' :
                                                        'bg-purple-500/10 text-purple-500'
                                                    }`}>
                                                    {hit.method}
                                                </span>
                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 ${hit.status.toString().startsWith('2') ? 'bg-green-500/10 text-green-500' :
                                                    hit.status.toString().startsWith('3') ? 'bg-blue-500/10 text-blue-500' :
                                                        'bg-red-500/10 text-red-500'
                                                    }`}>
                                                    {hit.status}
                                                </span>
                                                <span className="truncate">{hit.path}</span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-1.5 text-[9px] font-mono text-on-surface-variant">
                                            {hit.ip}
                                        </td>
                                        <td className="px-3 py-1.5 text-right font-mono text-[9px] text-on-surface-variant">
                                            {hit.responseTime}ms
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}



function ExpandableStatsCard({
    title,
    icon,
    items,
    color,
    total,
    sectionKey,
    expanded,
    onToggle,
    itemsToShow,
    onShowMore
}: {
    title: string,
    icon: React.ReactNode,
    items: any[],
    color: string,
    total: number,
    sectionKey: string,
    expanded: boolean,
    onToggle: () => void,
    itemsToShow: number,
    onShowMore: () => void
}) {
    const { theme } = useTheme();
    const colorClasses: Record<string, string> = {
        primary: 'text-primary bg-primary/10',
        indigo: 'text-indigo-500 bg-indigo-500/10',
        pink: 'text-pink-500 bg-pink-500/10',
        teal: 'text-teal-500 bg-teal-500/10',
        orange: 'text-orange-500 bg-orange-500/10',
        green: 'text-green-500 bg-green-500/10',
    };

    const displayedItems = expanded ? items : items.slice(0, itemsToShow);
    const hasMore = items.length > itemsToShow && !expanded;

    return (
        <div className="bg-surface/30 border border-outline/10 rounded-[32px] p-6 flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${colorClasses[color] || colorClasses.primary}`}>
                        {icon}
                    </div>
                    <div>
                        <h3 className="text-sm font-bold">{title}</h3>
                        <span className="text-[10px] text-on-surface-variant/60">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
                    </div>
                </div>
                <button
                    onClick={onToggle}
                    className={`p-1.5 ${theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-black/5'} rounded-lg transition-all`}
                    title={expanded ? 'Collapse' : 'Expand'}
                >
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
            </div>
            <div className={`space-y-4 flex-1 transition-all ${expanded ? 'max-h-[600px]' : 'max-h-[400px]'} overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-outline/20 scrollbar-track-transparent`}>
                {displayedItems.length > 0 ? (
                    displayedItems.map((item, i) => (
                        <div key={i} className="group">
                            <div className="flex justify-between items-center mb-1.5 px-1 truncate">
                                <div className="flex flex-col min-w-0 flex-1">
                                    <span className="text-[11px] font-bold truncate pr-3 group-hover:text-on-surface transition-colors" title={item.label}>
                                        {item.label}
                                    </span>
                                    <span className="text-[8px] font-black uppercase text-on-surface-variant/40 tracking-wider font-mono">{item.sub}</span>
                                </div>
                                <span className="text-[10px] font-black text-on-surface-variant ml-2 shrink-0">{item.value?.toLocaleString()}</span>
                            </div>
                            <div className={`h-1 ${theme === 'dark' ? 'bg-white/5' : 'bg-black/5'} rounded-full overflow-hidden border ${theme === 'dark' ? 'border-white/5' : 'border-black/5'}`}>
                                <div
                                    className={`h-full opacity-60 rounded-full transition-all duration-1000 ${color === 'primary' ? 'bg-primary' :
                                            color === 'indigo' ? 'bg-indigo-500' :
                                                color === 'pink' ? 'bg-pink-500' :
                                                    color === 'teal' ? 'bg-teal-500' :
                                                        color === 'orange' ? 'bg-orange-500' :
                                                            color === 'green' ? 'bg-green-500' :
                                                                'bg-primary'
                                        }`}
                                    style={{ width: `${Math.min((item.value / total) * 100, 100)}%` }}
                                />
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-8 text-on-surface-variant/60 text-sm">
                        No items found
                    </div>
                )}
                {hasMore && (
                    <button
                        onClick={onShowMore}
                        className="w-full py-2 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg transition-all"
                    >
                        Show {Math.min(20, items.length - itemsToShow)} more
                    </button>
                )}
            </div>
        </div>
    );
}
