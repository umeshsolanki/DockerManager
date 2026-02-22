'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
    BarChart3, Activity, Globe, Server, User, Link2,
    RefreshCw, MousePointerClick, Zap, TrendingUp, Clock,
    Network, Hash, Search, Download, ChevronDown, ChevronUp,
    Trash2, ShieldAlert, X, ChevronRight, Database
} from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { ProxyStats, GenericHitEntry, DailyProxyStats, ProxyHit, ProxyActionResult } from '@/lib/types';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts';
import { toast } from 'sonner';
import { StatCard } from '../ui/StatCard';
import { useTheme } from '@/contexts/ThemeContext';
import { Modal } from '../ui/Modal';

export default function AnalyticsScreen() {
    const { theme } = useTheme();
    const [stats, setStats] = useState<ProxyStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [refreshInterval, setRefreshInterval] = useState(30000);
    const [viewMode, setViewMode] = useState<'today' | 'history'>('today');
    const [availableDates, setAvailableDates] = useState<string[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [historyStats, setHistoryStats] = useState<DailyProxyStats | null>(null);
    const [selectedHost, setSelectedHost] = useState<string>('global');
    const [securityMode, setSecurityMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        paths: false,
        ips: false,
        userAgents: false,
        referers: false,
        methods: false,
        domains: false,
        countries: false,
        providers: false,
        asns: false
    });
    const [itemsToShow, setItemsToShow] = useState<Record<string, number>>({
        paths: 10,
        ips: 10,
        userAgents: 10,
        referers: 10,
        methods: 10,
        domains: 10,
        countries: 10,
        providers: 10,
        asns: 10
    });

    // Security Logs Modal State
    const [isSecurityLogsModalOpen, setIsSecurityLogsModalOpen] = useState(false);
    const [securityLogs, setSecurityLogs] = useState<ProxyHit[]>([]);
    const [isSecurityLogsLoading, setIsSecurityLogsLoading] = useState(false);
    const [securityLogsPage, setSecurityLogsPage] = useState(1);
    const [securityLogsSearch, setSecurityLogsSearch] = useState('');

    // IP Drill-down State
    const [selectedIp, setSelectedIp] = useState<string | null>(null);
    const [ipDetailLogs, setIpDetailLogs] = useState<ProxyHit[]>([]);
    const [isIpDetailLoading, setIsIpDetailLoading] = useState(false);

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
        if (viewMode === 'history' && selectedDate) {
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
        setHistoryStats(null);
        try {
            const data = await DockerClient.getHistoricalStats(date);
            if (data) {
                // Convert DailyProxyStats to ProxyStats format for display
                const convertedStats: ProxyStats = {
                    ...data,
                    recentHits: [], // Historical stats don't have recent hits
                    recentWebSocketConnections: [] // Historical stats don't have recent WebSocket connections
                };
                setHistoryStats(data);
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

    const handleTruncateLogs = async () => {
        if (confirm('Are you sure you want to truncate the proxy logs table? This will clear all current statistics.')) {
            setIsLoading(true);
            try {
                const result = await DockerClient.truncateProxyLogs();
                if (result.success) {
                    toast.success('Logs truncated');
                    fetchData();
                    if (viewMode === 'history') {
                        fetchAvailableDates();
                    }
                } else {
                    toast.error(result.message);
                }
            } catch (e) {
                console.error('Failed to truncate logs', e);
                toast.error('Failed to clear logs from database');
            } finally {
                setIsLoading(false);
            }
        }
    };

    const fetchSecurityLogs = async (page = 1, search = '') => {
        setIsSecurityLogsLoading(true);
        try {
            const [logFileEntries, mirrorEntries] = await Promise.all([
                DockerClient.getAnalyticsLogs('security', page, 50, search, viewMode === 'history' ? selectedDate : undefined),
                page === 1 && viewMode === 'today' ? DockerClient.getSecurityMirrors(100) : Promise.resolve([] as ProxyHit[])
            ]);
            let merged: ProxyHit[] = logFileEntries;
            if (page === 1 && mirrorEntries.length > 0) {
                const filteredMirror = search
                    ? mirrorEntries.filter(
                        (m) =>
                            m.ip?.toLowerCase().includes(search.toLowerCase()) ||
                            m.path?.toLowerCase().includes(search.toLowerCase()) ||
                            m.domain?.toLowerCase().includes(search.toLowerCase()) ||
                            m.violationReason?.toLowerCase().includes(search.toLowerCase())
                    )
                    : mirrorEntries;
                merged = [...filteredMirror, ...logFileEntries].sort((a, b) => b.timestamp - a.timestamp);
            }
            if (page === 1) {
                setSecurityLogs(merged);
            } else {
                setSecurityLogs(prev => [...prev, ...logFileEntries].sort((a, b) => b.timestamp - a.timestamp));
            }
            setSecurityLogsPage(page);
        } catch (e) {
            toast.error('Failed to fetch security logs');
        } finally {
            setIsSecurityLogsLoading(false);
        }
    };

    useEffect(() => {
        if (isSecurityLogsModalOpen) {
            fetchSecurityLogs(1, securityLogsSearch);
        }
    }, [isSecurityLogsModalOpen, securityLogsSearch]);

    const drillIntoIp = useCallback((ip: string) => {
        setSelectedIp(ip);
        setSearchQuery(ip);
    }, []);

    const clearIpDrill = useCallback(() => {
        setSelectedIp(null);
        setSearchQuery('');
    }, []);

    useEffect(() => {
        if (!selectedIp) {
            setIpDetailLogs([]);
            return;
        }
        setIsIpDetailLoading(true);
        DockerClient.getAnalyticsLogs('access', 1, 100, selectedIp, viewMode === 'history' ? selectedDate : undefined)
            .then((logs) => {
                setIpDetailLogs(logs.filter(h => h.ip === selectedIp));
            })
            .catch(() => setIpDetailLogs([]))
            .finally(() => setIsIpDetailLoading(false));
    }, [selectedIp, viewMode, selectedDate]);

    const filteredPaths = useMemo(() => {
        const source = (selectedHost !== 'global' && stats?.hostwiseStats?.[selectedHost])
            ? stats.hostwiseStats[selectedHost].topPaths
            : stats?.topPaths;

        return source
            ?.filter(p => !searchQuery || p.path.toLowerCase().includes(searchQuery.toLowerCase()))
            .map(p => ({ label: p.path, value: p.count, sub: 'Path' })) || [];
    }, [stats?.topPaths, stats?.hostwiseStats, selectedHost, searchQuery]); // Paths are generic, no error-specific path stats available in current API

    const filteredIps = useMemo(() => {
        if (securityMode && selectedHost === 'global') {
            return stats?.topIpsWithErrors
                ?.filter(p => !searchQuery || p.label.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(p => ({ label: p.label, value: p.count, sub: 'Error Source' })) || [];
        }

        const source = (selectedHost !== 'global' && stats?.hostwiseStats?.[selectedHost])
            ? stats.hostwiseStats[selectedHost].topIps
            : stats?.topIps;

        return source
            ?.filter(p => !searchQuery || p.label.toLowerCase().includes(searchQuery.toLowerCase()))
            .map(p => ({ label: p.label, value: p.count, sub: 'IP Source' })) || [];
    }, [stats?.topIps, stats?.hostwiseStats, selectedHost, searchQuery, stats?.topIpsWithErrors, securityMode]);

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
        const source = (selectedHost !== 'global' && stats?.hostwiseStats?.[selectedHost])
            ? stats.hostwiseStats[selectedHost].topMethods
            : stats?.topMethods;

        return source
            ?.filter(p => !searchQuery || p.label.toLowerCase().includes(searchQuery.toLowerCase()))
            .map(p => ({ label: p.label, value: p.count, sub: 'Method' })) || [];
    }, [stats?.topMethods, stats?.hostwiseStats, selectedHost, searchQuery]);

    const filteredDomains = useMemo(() => {
        const source = securityMode && stats?.hitsByDomainErrors ? stats.hitsByDomainErrors : stats?.hitsByDomain;
        return source
            ? Object.entries(source)
                .filter(([domain]) => !searchQuery || domain.toLowerCase().includes(searchQuery.toLowerCase()))
                .sort(([, a], [, b]) => b - a)
                .map(([domain, count]) => ({ label: domain, value: count, sub: 'Domain' }))
            : [];
    }, [stats?.hitsByDomain, stats?.hitsByDomainErrors, searchQuery, securityMode]);

    const filteredCountries = useMemo(() => {
        return stats?.hitsByCountry
            ? Object.entries(stats.hitsByCountry)
                .filter(([country]) => !searchQuery || country.toLowerCase().includes(searchQuery.toLowerCase()))
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([country, count]) => ({ label: country, value: count, sub: 'Country' }))
            : [];
    }, [stats?.hitsByCountry, searchQuery]);

    const filteredProviders = useMemo(() => {
        return stats?.hitsByProvider
            ? Object.entries(stats.hitsByProvider)
                .filter(([provider]) => !searchQuery || provider.toLowerCase().includes(searchQuery.toLowerCase()))
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([provider, count]) => ({ label: provider.length > 40 ? provider.substring(0, 40) + '...' : provider, value: count, sub: 'Provider' }))
            : [];
    }, [stats?.hitsByProvider, searchQuery]);

    const filteredAsns = useMemo(() => {
        return stats?.hitsByAsn
            ? Object.entries(stats.hitsByAsn)
                .filter(([asn]) => !searchQuery || asn.toLowerCase().includes(searchQuery.toLowerCase()))
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([asn, count]) => ({ label: asn, value: count, sub: 'ASN' }))
            : [];
    }, [stats?.hitsByAsn, searchQuery]);

    const chartData = useMemo(() => {
        return stats?.hitsOverTime ?
            Object.entries(stats.hitsOverTime).map(([key, hits]) => {
                let displayTime = key;
                // Handle ISO 8601 (yyyy-MM-dd'T'HH:00:00XXX)
                if (key.includes('T')) {
                    try {
                        const date = new Date(key);
                        displayTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    } catch (e) {
                        displayTime = key;
                    }
                } else {
                    // Fallback for old HH:00 format
                    displayTime = key.split(' ')[1] || key;
                }

                return {
                    originalKey: key,
                    time: displayTime,
                    hits
                };
            }).sort((a, b) => a.originalKey.localeCompare(b.originalKey)) : [];
    }, [stats?.hitsOverTime]);

    // Calculate security metrics
    const securityMetrics = useMemo(() => {
        if (!stats) return { totalErrors: 0, errorRate: 0, uniqueErrorIps: 0 };

        let totalHits = 0;
        let errorHits = 0;

        const statusData = (selectedHost !== 'global' && stats.hostwiseStats?.[selectedHost])
            ? stats.hostwiseStats[selectedHost].hitsByStatus
            : stats.hitsByStatus;

        if (statusData) {
            Object.entries(statusData).forEach(([status, count]) => {
                const code = parseInt(status);
                totalHits += count;
                if (code >= 400) errorHits += count;
            });
        }

        const uniqueErrorIps = selectedHost === 'global' ? (stats.topIpsWithErrors?.length || 0) : 0;

        return {
            totalErrors: errorHits,
            totalHits,
            errorRate: totalHits > 0 ? (errorHits / totalHits) * 100 : 0,
            uniqueErrorIps
        };
    }, [stats, selectedHost]);

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
                            : historyStats
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
                                setHistoryStats(null);
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
                                setViewMode('history');
                                fetchAvailableDates();
                            }}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === 'history'
                                ? 'bg-primary text-on-primary'
                                : 'text-on-surface-variant hover:bg-white/5'
                                }`}
                        >
                            Historical
                        </button>
                    </div>

                    <button
                        onClick={() => setSecurityMode(!securityMode)}
                        className={`group px-3 py-2 rounded-xl border transition-all flex items-center gap-2 ${securityMode
                            ? 'bg-red-500/10 border-red-500/30 text-red-500'
                            : 'bg-surface border-outline/10 text-on-surface-variant hover:bg-white/5'
                            }`}
                        title="Toggle Security Focus Mode"
                    >
                        <ShieldAlert size={16} className={securityMode ? 'animate-pulse' : ''} />
                        <span className={`text-xs font-bold ${!securityMode && 'hidden sm:inline'}`}>Security</span>
                    </button>

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

                    {viewMode === 'history' && (
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

                    <button
                        onClick={handleTruncateLogs}
                        disabled={isLoading}
                        className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-all text-red-500 group disabled:opacity-50"
                        title="Clear suspicious logs from database"
                    >
                        <Trash2 size={18} />
                        <span className="text-[10px] font-black uppercase tracking-widest hidden sm:block">Truncate DB</span>
                    </button>
                </div>
            </header>

            {/* Host Tabs */}
            {stats && Object.keys(stats.hostwiseStats || {}).length > 0 && (
                <div className="flex flex-wrap gap-2 p-1 bg-surface/30 border border-outline/5 rounded-2xl">
                    <button
                        onClick={() => setSelectedHost('global')}
                        className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${selectedHost === 'global'
                            ? 'bg-primary text-on-primary shadow-lg shadow-primary/20'
                            : 'text-on-surface-variant hover:bg-white/5'
                            }`}
                    >
                        Global
                    </button>
                    {Object.keys(stats.hostwiseStats || {})
                        .sort((a, b) => (stats.hostwiseStats?.[b]?.totalHits || 0) - (stats.hostwiseStats?.[a]?.totalHits || 0))
                        .map(host => (
                            <button
                                key={host}
                                onClick={() => setSelectedHost(host)}
                                className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${selectedHost === host
                                    ? 'bg-primary text-on-primary shadow-lg shadow-primary/20'
                                    : 'text-on-surface-variant hover:bg-white/5'
                                    }`}
                            >
                                {host}
                            </button>
                        ))}
                </div>
            )}

            {/* High Level Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label={securityMode ? "Blocked Requests" : "Requests"}
                    value={securityMode
                        ? securityMetrics.totalErrors.toLocaleString()
                        : (selectedHost !== 'global' && stats?.hostwiseStats?.[selectedHost] ? stats.hostwiseStats[selectedHost].totalHits : stats?.totalHits || 0).toLocaleString()
                    }
                    icon={securityMode ? <ShieldAlert size={20} /> : <MousePointerClick size={20} />}
                    sub={selectedHost === 'global' ? (securityMode ? '4xx/5xx Errors' : 'All Traffic') : `${selectedHost} traffic`}
                    color={securityMode ? "red" : "primary"}
                />
                <StatCard
                    label={selectedHost === 'global' ? "Active Domains" : "Domain Share"}
                    value={(() => {
                        if (securityMode) {
                            if (selectedHost === 'global') {
                                return Object.keys(stats?.hitsByDomainErrors || {}).length.toString();
                            }
                            // Calculate share of errors
                            let globalErrors = 0;
                            if (stats?.hitsByStatus) {
                                Object.entries(stats.hitsByStatus).forEach(([s, c]) => {
                                    if (parseInt(s) >= 400) globalErrors += c;
                                });
                            }
                            const share = globalErrors > 0 ? (securityMetrics.totalErrors / globalErrors) * 100 : 0;
                            return `${share.toFixed(1)}%`;
                        } else {
                            // Normal mode
                            return selectedHost === 'global'
                                ? Object.keys(stats?.hitsByDomain || {}).length.toString()
                                : `${((stats?.hostwiseStats?.[selectedHost]?.totalHits || 0) / (stats?.totalHits || 1) * 100).toFixed(1)}%`;
                        }
                    })()}
                    icon={<Globe size={20} />}
                    sub={selectedHost === 'global' ? (securityMode ? "Targeted Domains" : "Configured Hosts") : (securityMode ? "of total threats" : "of total requests")}
                    color="indigo"
                />
                <StatCard
                    label={securityMode ? "Attacking IPs" : "Unique Reach"}
                    value={securityMode
                        ? (selectedHost === 'global' ? securityMetrics.uniqueErrorIps.toString() : "N/A")
                        : (selectedHost !== 'global' && stats?.hostwiseStats?.[selectedHost] ? stats.hostwiseStats[selectedHost].topIps.length : stats?.topIps?.length || 0).toString()
                    }
                    icon={securityMode ? <ShieldAlert size={20} /> : <Network size={20} />}
                    sub={securityMode ? (selectedHost === 'global' ? "Unique Sources" : "Global Stats Only") : "Unique Source IPs"}
                    color="indigo"
                />
                <StatCard
                    label="Security Mirrors"
                    value={(stats?.securityHits || 0).toLocaleString()}
                    icon={<ShieldAlert size={20} />}
                    sub="Threats Mirrored (Click to view)"
                    color="red"
                    onClick={() => setIsSecurityLogsModalOpen(true)}
                />
                {!securityMode ? (
                    <StatCard
                        label="Distribution"
                        value={selectedHost === 'global'
                            ? `${Object.keys(stats?.hitsByStatus || {}).length} Statuses`
                            : `${Object.keys(stats?.hostwiseStats?.[selectedHost]?.hitsByStatus || {}).length} Statuses`}
                        icon={<Zap size={20} />}
                        sub="Response variety"
                        color="red"
                    />
                ) : (
                    <StatCard
                        label="Error Rate"
                        value={`${securityMetrics.errorRate.toFixed(1)}%`}
                        icon={<ShieldAlert size={20} />}
                        sub={`${securityMetrics.totalErrors.toLocaleString()} Threats`}
                        color="red"
                    />
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Traffic Profile Chart */}
                <div className={`lg:col-span-2 bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] p-6 ${securityMode ? 'opacity-50 grayscale' : ''}`}>
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-xl font-bold">{securityMode ? "Traffic Velocity (Unfiltered)" : "Traffic Velocity"}</h3>
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
                        {stats?.hitsByDomain && Object.entries(securityMode && stats.hitsByDomainErrors ? stats.hitsByDomainErrors : stats.hitsByDomain)
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
                    {(() => {
                        const source = (selectedHost !== 'global' && stats?.hostwiseStats?.[selectedHost])
                            ? stats.hostwiseStats[selectedHost].hitsByStatus
                            : stats?.hitsByStatus;

                        const total = (selectedHost !== 'global' && stats?.hostwiseStats?.[selectedHost])
                            ? stats.hostwiseStats[selectedHost].totalHits
                            : stats?.totalHits || 0;

                        if (!source || Object.keys(source).length === 0) return null;

                        return Object.entries(source)
                            .sort(([a], [b]) => parseInt(a) - parseInt(b))
                            .map(([status, count]) => {
                                const statusInt = parseInt(status);
                                if (securityMode && statusInt < 400) return null;

                                const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
                                const colorClass = statusInt >= 500 ? 'bg-red-500/20 text-red-500 border-red-500/30' :
                                    statusInt >= 400 ? 'bg-orange-500/20 text-orange-500 border-orange-500/30' :
                                        statusInt >= 300 ? 'bg-blue-500/20 text-blue-500 border-blue-500/30' :
                                            statusInt >= 200 ? 'bg-green-500/20 text-green-500 border-green-500/30' :
                                                'bg-gray-500/20 text-gray-500 border-gray-500/30';

                                return (
                                    <div key={status} className={`p-4 rounded-xl border ${colorClass} transition-transform hover:scale-[1.02]`}>
                                        <div className="text-2xl font-black">{status}</div>
                                        <div className="text-xs font-bold mt-1 opacity-80">{count.toLocaleString()}</div>
                                        <div className="text-[10px] font-medium mt-1 opacity-60">{percentage}%</div>
                                    </div>
                                );
                            });
                    })()}
                    {(!stats?.hitsByStatus || Object.keys(stats.hitsByStatus).length === 0) && (
                        <div className="col-span-full text-center py-8 text-on-surface-variant/60 text-sm">
                            No status code data available
                        </div>
                    )}
                </div>
            </div>

            {/* IP Drill-down Banner */}
            {selectedIp && (
                <div className="flex items-center justify-between gap-4 p-4 bg-primary/10 border border-primary/20 rounded-2xl">
                    <div className="flex items-center gap-3">
                        <Network className="text-primary" size={22} />
                        <div>
                            <p className="text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider">Drilling into</p>
                            <p className="font-mono font-bold text-primary text-lg">{selectedIp}</p>
                        </div>
                        <button
                            onClick={clearIpDrill}
                            className="p-1.5 rounded-lg hover:bg-primary/20 text-primary transition-colors"
                            title="Clear IP filter"
                        >
                            <X size={18} />
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => { setSecurityLogsSearch(selectedIp); setIsSecurityLogsModalOpen(true); }}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-all text-xs font-bold"
                        >
                            <ShieldAlert size={14} />
                            View in Security Logs
                        </button>
                    </div>
                </div>
            )}

            {/* IP Detail Panel - Activity & Logs */}
            {selectedIp && (
                <div className="bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[32px] overflow-hidden">
                    <div className="px-6 py-4 border-b border-outline/5 flex items-center justify-between">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                            <Network className="text-primary" size={20} />
                            Activity for {selectedIp}
                        </h3>
                        {isIpDetailLoading && <RefreshCw className="animate-spin text-primary" size={18} />}
                    </div>
                    <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2">
                            <h4 className="text-xs font-bold uppercase text-on-surface-variant/60 mb-3">Recent requests</h4>
                            <div className="max-h-[300px] overflow-y-auto border border-outline/10 rounded-xl custom-scrollbar">
                                {ipDetailLogs.length > 0 ? (
                                    <table className="w-full text-left text-xs">
                                        <thead className="sticky top-0 bg-surface/90">
                                            <tr>
                                                <th className="px-3 py-2 font-bold text-on-surface-variant/60">Time</th>
                                                <th className="px-3 py-2 font-bold text-on-surface-variant/60">Method</th>
                                                <th className="px-3 py-2 font-bold text-on-surface-variant/60">Path</th>
                                                <th className="px-3 py-2 font-bold text-on-surface-variant/60">Domain</th>
                                                <th className="px-3 py-2 font-bold text-on-surface-variant/60 text-right">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-outline/5">
                                            {ipDetailLogs.slice(0, 50).map((h, i) => (
                                                <tr key={i} className="hover:bg-white/5">
                                                    <td className="px-3 py-2 font-mono">{new Date(h.timestamp).toLocaleTimeString()}</td>
                                                    <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${h.method === 'GET' ? 'bg-green-500/10 text-green-500' : h.method === 'POST' ? 'bg-blue-500/10 text-blue-500' : 'bg-purple-500/10 text-purple-500'}`}>{h.method}</span></td>
                                                    <td className="px-3 py-2 truncate max-w-[200px]" title={h.path}>{h.path}</td>
                                                    <td className="px-3 py-2 truncate max-w-[120px]">{h.domain ?? '-'}</td>
                                                    <td className="px-3 py-2 text-right font-bold">{h.status}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : isIpDetailLoading ? (
                                    <div className="p-8 text-center text-on-surface-variant/60">Loading...</div>
                                ) : (
                                    <div className="p-8 text-center text-on-surface-variant/60">No access logs found for this IP in current view</div>
                                )}
                            </div>
                        </div>
                        <div>
                            <h4 className="text-xs font-bold uppercase text-on-surface-variant/60 mb-3">Status distribution</h4>
                            <div className="space-y-2">
                                {Object.entries(
                                    ipDetailLogs.reduce<Record<number, number>>((acc, h) => {
                                        acc[h.status] = (acc[h.status] || 0) + 1;
                                        return acc;
                                    }, {})
                                )
                                    .sort(([a], [b]) => parseInt(String(a)) - parseInt(String(b)))
                                    .map(([status, count]) => {
                                        const s = parseInt(status);
                                        const pct = ipDetailLogs.length > 0 ? ((count / ipDetailLogs.length) * 100).toFixed(0) : '0';
                                        const color = s >= 500 ? 'bg-red-500/20 text-red-500' : s >= 400 ? 'bg-orange-500/20 text-orange-500' : s >= 300 ? 'bg-blue-500/20 text-blue-500' : 'bg-green-500/20 text-green-500';
                                        return (
                                            <div key={status} className={`flex justify-between items-center px-3 py-2 rounded-lg ${color}`}>
                                                <span className="font-bold">{status}</span>
                                                <span className="text-xs font-black">{count} ({pct}%)</span>
                                            </div>
                                        );
                                    })}
                                {ipDetailLogs.length === 0 && !isIpDetailLoading && (
                                    <div className="text-center py-6 text-on-surface-variant/40 text-xs">No data</div>
                                )}
                            </div>
                            <h4 className="text-xs font-bold uppercase text-on-surface-variant/60 mt-6 mb-3">Top paths</h4>
                            <div className="space-y-2 max-h-[140px] overflow-y-auto">
                                {Object.entries(
                                    ipDetailLogs.reduce<Record<string, number>>((acc, h) => {
                                        const path = h.path || '/';
                                        acc[path] = (acc[path] || 0) + 1;
                                        return acc;
                                    }, {})
                                )
                                    .sort(([, a], [, b]) => b - a)
                                    .slice(0, 8)
                                    .map(([path, count]) => (
                                        <div key={path} className="flex justify-between items-center text-xs py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                                            <span className="truncate flex-1 pr-2" title={path}>{path}</span>
                                            <span className="font-bold text-primary shrink-0">{count}</span>
                                        </div>
                                    ))}
                                {ipDetailLogs.length === 0 && !isIpDetailLoading && (
                                    <div className="text-center py-4 text-on-surface-variant/40 text-xs">No paths</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Search and Filter Bar */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
                    <input
                        type="text"
                        placeholder={selectedIp ? `Filtering by ${selectedIp}` : "Search paths, IPs, domains..."}
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
                    // Hide paths in security mode as we don't have error-specific paths
                    sectionKey="paths"
                    expanded={expandedSections.paths}
                    onToggle={() => setExpandedSections(prev => ({ ...prev, paths: !prev.paths }))}
                    itemsToShow={itemsToShow.paths}
                    onShowMore={() => setItemsToShow(prev => ({ ...prev, paths: prev.paths + 20 }))}
                    className={securityMode ? 'opacity-50 grayscale' : ''}
                />

                {/* Top Sources */}
                <ExpandableStatsCard
                    title={securityMode ? "Top Threat Actors" : "All Source IPs"}
                    icon={securityMode ? <ShieldAlert size={18} /> : <Network size={18} />}
                    items={filteredIps}
                    color="indigo"
                    total={stats?.totalHits || 1}
                    sectionKey="ips"
                    expanded={expandedSections.ips}
                    onToggle={() => setExpandedSections(prev => ({ ...prev, ips: !prev.ips }))}
                    itemsToShow={itemsToShow.ips}
                    onShowMore={() => setItemsToShow(prev => ({ ...prev, ips: prev.ips + 20 }))}
                    onItemClick={drillIntoIp}
                    clickableItemKeys={['ips']}
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

                {/* ASNs */}
                <ExpandableStatsCard
                    title="Top ASNs"
                    icon={<Database size={18} />}
                    items={filteredAsns}
                    color="indigo"
                    total={stats?.totalHits || 1}
                    sectionKey="asns"
                    expanded={expandedSections.asns}
                    onToggle={() => setExpandedSections(prev => ({ ...prev, asns: !prev.asns }))}
                    itemsToShow={itemsToShow.asns}
                    onShowMore={() => setItemsToShow(prev => ({ ...prev, asns: prev.asns + 20 }))}
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
                                {stats?.recentHits
                                    .filter(h => !securityMode || h.status >= 400)
                                    .slice(0, 50).map((hit, i) => (
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
                                            <td className="px-3 py-1.5">
                                                <button
                                                    onClick={() => drillIntoIp(hit.ip)}
                                                    className="text-[9px] font-mono text-on-surface-variant hover:text-primary transition-colors text-left"
                                                    title="Drill into this IP"
                                                >
                                                    {hit.ip}
                                                </button>
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

            {/* Security Logs Modal */}
            {isSecurityLogsModalOpen && (
                <Modal
                    onClose={() => setIsSecurityLogsModalOpen(false)}
                    title="Security Logs"
                    icon={<ShieldAlert className="text-red-500" size={24} />}
                    maxWidth="max-w-6xl"
                    headerActions={
                        <button
                            onClick={() => fetchSecurityLogs(1, securityLogsSearch)}
                            className="p-2 hover:bg-white/10 rounded-xl transition-all"
                            title="Refresh Logs"
                        >
                            <RefreshCw size={18} className={isSecurityLogsLoading ? 'animate-spin' : ''} />
                        </button>
                    }
                >
                    <div className="flex flex-col gap-4 mt-4 h-[70vh]">
                        <div className="flex items-center gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search by IP, path, domain or violation reason..."
                                    value={securityLogsSearch}
                                    onChange={(e) => setSecurityLogsSearch(e.target.value)}
                                    className="w-full bg-white/5 border border-outline/20 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-red-500/50 transition-all font-medium"
                                />
                            </div>
                            {viewMode === 'history' && selectedDate && (
                                <div className="bg-red-500/10 text-red-500 px-4 py-2 rounded-xl text-xs font-bold border border-red-500/20">
                                    History: {selectedDate}
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-auto border border-outline/10 rounded-2xl bg-black/20 custom-scrollbar">
                            <table className="w-full text-left border-collapse font-mono text-[11px]">
                                <thead className="sticky top-0 bg-[#0f0f0f] z-10 border-b border-outline/10">
                                    <tr>
                                        <th className="px-4 py-3 text-[10px] uppercase font-bold text-on-surface-variant/50">Time</th>
                                        <th className="px-4 py-3 text-[10px] uppercase font-bold text-on-surface-variant/50">Source IP</th>
                                        <th className="px-4 py-3 text-[10px] uppercase font-bold text-on-surface-variant/50">Domain</th>
                                        <th className="px-4 py-3 text-[10px] uppercase font-bold text-on-surface-variant/50">Method</th>
                                        <th className="px-4 py-3 text-[10px] uppercase font-bold text-on-surface-variant/50">Path</th>
                                        <th className="px-4 py-3 text-[10px] uppercase font-bold text-on-surface-variant/50">Reason</th>
                                        <th className="px-4 py-3 text-[10px] uppercase font-bold text-on-surface-variant/50 text-right">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-outline/5">
                                    {securityLogs.map((log, i) => (
                                        <tr key={i} className="hover:bg-white/5 transition-colors group">
                                            <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">
                                                {new Date(log.timestamp).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={() => { drillIntoIp(log.ip); setIsSecurityLogsModalOpen(false); }}
                                                    className="text-primary font-bold hover:underline text-left"
                                                    title="Drill into this IP"
                                                >
                                                    {log.ip}
                                                </button>
                                            </td>
                                            <td className="px-4 py-3 text-on-surface truncate max-w-[120px]" title={log.domain}>{log.domain ?? '-'}</td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded text-[9px] font-black ${log.method === 'GET' ? 'bg-green-500/10 text-green-500' :
                                                    log.method === 'POST' ? 'bg-blue-500/10 text-blue-500' :
                                                        'bg-purple-500/10 text-purple-500'
                                                    }`}>
                                                    {log.method}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-on-surface-variant truncate max-w-[180px]" title={log.path}>
                                                {log.path}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {log.source === 'mirror' && (
                                                        <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-amber-500/20 text-amber-500 shrink-0">
                                                            Live
                                                        </span>
                                                    )}
                                                    {log.violationReason ? (
                                                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-500" title={log.violationReason}>
                                                            {log.violationReason.length > 16 ? log.violationReason.slice(0, 16) + '…' : log.violationReason}
                                                        </span>
                                                    ) : (
                                                        <span className="text-on-surface-variant/40">—</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className={`font-black ${log.status.toString().startsWith('2') ? 'text-green-500' :
                                                    log.status.toString().startsWith('4') ? 'text-orange-500' :
                                                        'text-red-500'
                                                    }`}>
                                                    {log.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {securityLogs.length === 0 && !isSecurityLogsLoading && (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-20 text-center text-on-surface-variant/40 italic">
                                                No security mirror hits found matching your criteria
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                            {securityLogs.length > 0 && securityLogs.length % 50 === 0 && (
                                <div className="p-4 flex justify-center">
                                    <button
                                        onClick={() => fetchSecurityLogs(securityLogsPage + 1, securityLogsSearch)}
                                        disabled={isSecurityLogsLoading}
                                        className="px-6 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                                    >
                                        {isSecurityLogsLoading ? 'Loading...' : 'Load More'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}



interface StatEntry {
    label: string;
    value: number;
    sub: string;
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
    onShowMore,
    onItemClick,
    clickableItemKeys,
    className
}: {
    title: string,
    icon: React.ReactNode,
    items: StatEntry[],
    color: string,
    total: number,
    sectionKey: string,
    expanded: boolean,
    onToggle: () => void,
    itemsToShow: number,
    onShowMore: () => void,
    onItemClick?: (label: string) => void,
    clickableItemKeys?: string[],
    className?: string
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
        <div className={`bg-surface/30 border border-outline/10 rounded-[32px] p-6 flex flex-col ${className || ''}`}>
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
                    displayedItems.map((item, i) => {
                        const isClickable = onItemClick && clickableItemKeys?.includes(sectionKey);
                        return (
                            <div key={i} className="group">
                                <div className="flex justify-between items-center mb-1.5 px-1 truncate">
                                    <div className="flex flex-col min-w-0 flex-1">
                                        {isClickable ? (
                                            <button
                                                onClick={() => onItemClick?.(item.label)}
                                                className="text-[11px] font-bold truncate pr-3 text-left w-full hover:text-primary transition-colors flex items-center gap-1.5 group/btn"
                                                title={`Click to drill into ${item.label}`}
                                            >
                                                <span className="truncate">{item.label}</span>
                                                <ChevronRight size={10} className="opacity-0 group-hover/btn:opacity-100 shrink-0 text-primary" />
                                            </button>
                                        ) : (
                                            <span className="text-[11px] font-bold truncate pr-3 group-hover:text-on-surface transition-colors" title={item.label}>
                                                {item.label}
                                            </span>
                                        )}
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
                        );
                    })
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
