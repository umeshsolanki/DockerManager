'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Search, RefreshCw, FileText, XCircle, Terminal, Shield, User, Clock, Settings, Lock, Ban, ChevronDown, ChevronRight, Folder, ArrowLeft, Database } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { SystemLog, BlockIPRequest, BtmpStats } from '@/lib/types';
import { toast } from 'sonner';

export default function LogsScreen() {
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);
    const [logContent, setLogContent] = useState<string>('');
    const [isReadingLog, setIsReadingLog] = useState(false);
    const [awkFilter, setAwkFilter] = useState('');
    const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
    const [ipToBlock, setIpToBlock] = useState('');
    const [btmpStats, setBtmpStats] = useState<BtmpStats | null>(null);
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [statsModalType, setStatsModalType] = useState<'IPS' | 'ATTEMPTS' | 'USERS' | 'CONFIG' | 'JAILED'>('IPS');
    const [isRefreshingBtmp, setIsRefreshingBtmp] = useState(false);
    const [btmpSearch, setBtmpSearch] = useState('');
    const [btmpSortBy, setBtmpSortBy] = useState<'time' | 'user' | 'ip'>('time');
    const [tailLines, setTailLines] = useState<number>(200);
    const [since, setSince] = useState<string>('');
    const [until, setUntil] = useState<string>('');
    const [isStatsExpanded, setIsStatsExpanded] = useState(true);

    const setQuickTimeRange = (range: 'today' | 'yesterday' | 'week' | 'month') => {
        const now = new Date();
        const start = new Date();
        start.setHours(0, 0, 0, 0);

        const format = (date: Date) => {
            const tzoffset = (new Date()).getTimezoneOffset() * 60000;
            return (new Date(date.getTime() - tzoffset)).toISOString().slice(0, 16);
        };

        switch (range) {
            case 'today':
                setSince(format(start));
                setUntil(format(now));
                break;
            case 'yesterday':
                const yesterday = new Date(start);
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayEnd = new Date(start);
                yesterdayEnd.setMilliseconds(-1);
                setSince(format(yesterday));
                setUntil(format(yesterdayEnd));
                break;
            case 'week':
                const week = new Date(start);
                week.setDate(week.getDate() - 7);
                setSince(format(week));
                setUntil(format(now));
                break;
            case 'month':
                const month = new Date(start);
                month.setMonth(month.getMonth() - 1);
                setSince(format(month));
                setUntil(format(now));
                break;
        }
    };

    const [jailThreshold, setJailThreshold] = useState(5);
    const [jailDuration, setJailDuration] = useState(30);
    const [isAutoJailEnabled, setIsAutoJailEnabled] = useState(false);

    const [currentPath, setCurrentPath] = useState('');

    const fetchLogs = async (path?: string) => {
        setIsLoading(true);
        const [logsData, btmpData] = await Promise.all([
            DockerClient.listSystemLogs(path || currentPath),
            DockerClient.getBtmpStats()
        ]);
        setLogs(logsData || []);
        if (btmpData) {
            setBtmpStats(btmpData);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        fetchLogs(currentPath);
    }, [currentPath]);

    const handlePathChange = (path: string) => {
        setCurrentPath(path);
        setSelectedLog(null);
    };

    const breadcrumbs = useMemo(() => {
        if (!currentPath) return [];
        const parts = currentPath.split('/');
        return parts.map((part, i) => ({
            name: part,
            path: parts.slice(0, i + 1).join('/')
        }));
    }, [currentPath]);

    const manualRefreshBtmp = async () => {
        setIsRefreshingBtmp(true);
        const data = await DockerClient.refreshBtmpStats();
        if (data) {
            setBtmpStats(data);
            toast.success('Login stats updated');
        }
        setIsRefreshingBtmp(false);
    };

    const fetchLogContent = async (log: SystemLog, filter?: string) => {
        if (log.isDirectory) {
            handlePathChange(log.path);
            return;
        }
        setIsReadingLog(true);
        setSelectedLog(log);
        const content = await DockerClient.getSystemLogContent(log.path, tailLines, filter, since, until);
        setLogContent(content);
        setIsReadingLog(false);
    };

    useEffect(() => {
        const interval = setInterval(() => fetchLogs(currentPath), 30000);
        return () => clearInterval(interval);
    }, [currentPath]);

    const filteredLogs = useMemo(() => {
        return logs.filter(l =>
            l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            l.path.toLowerCase().includes(searchQuery.toLowerCase())
        ).sort((a, b) => b.lastModified - a.lastModified);
    }, [logs, searchQuery]);

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleString();
    };

    return (
        <div className="flex flex-col h-full relative">
            <div className="flex items-center gap-4 mb-5">
                <h1 className="text-3xl font-bold">System Logs</h1>
                {isLoading && <RefreshCw className="animate-spin text-primary" size={24} />}
            </div>

            {/* Security Insights Dashboard with Collapse/Expand */}
            {btmpStats && btmpStats.totalFailedAttempts > 0 && (
                <div className="mb-6 bg-white/5 border border-outline/10 rounded-3xl overflow-hidden transition-all duration-300">
                    <div
                        onClick={() => setIsStatsExpanded(!isStatsExpanded)}
                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-all group"
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-xl transition-all ${isStatsExpanded ? 'bg-red-500/20 text-red-500' : 'bg-red-500/10 text-red-500/60'}`}>
                                <Shield size={18} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold tracking-tight">Login Security Insights</span>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] text-on-surface-variant uppercase font-bold tracking-widest opacity-60">Authentication Monitoring</span>
                                    {!isStatsExpanded && (
                                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                            <span className="text-[10px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full font-bold">
                                                {btmpStats.totalFailedAttempts} FAILURES DETECTED
                                            </span>
                                            <span className="text-[10px] text-on-surface-variant/40">
                                                Last attack {new Date(btmpStats.lastUpdated).toLocaleTimeString()}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            {!isStatsExpanded && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); manualRefreshBtmp(); }}
                                    disabled={isRefreshingBtmp}
                                    className="p-2 hover:bg-white/10 rounded-xl transition-all text-on-surface-variant group-hover:text-primary"
                                    title="Refresh Security Data"
                                >
                                    <RefreshCw size={16} className={isRefreshingBtmp ? 'animate-spin' : ''} />
                                </button>
                            )}
                            <div className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 text-on-surface-variant group-hover:bg-primary group-hover:text-white transition-all">
                                {isStatsExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                            </div>
                        </div>
                    </div>

                    {isStatsExpanded && (
                        <div className="px-5 pb-5 animate-in fade-in zoom-in-95 duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-4">
                                    <div className="flex items-center justify-between text-red-500 mb-2">
                                        <div className="flex items-center gap-3">
                                            <XCircle size={18} />
                                            <span className="text-xs font-bold uppercase tracking-wider">Failed Logins (btmp)</span>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); manualRefreshBtmp(); }}
                                            disabled={isRefreshingBtmp}
                                            className="p-1 hover:bg-white/10 rounded-lg transition-all"
                                            title="Force Refresh"
                                        >
                                            <RefreshCw size={12} className={isRefreshingBtmp ? 'animate-spin' : ''} />
                                        </button>
                                    </div>
                                    <div className="text-3xl font-bold text-red-500">{btmpStats.totalFailedAttempts}</div>
                                    <div className="text-[9px] text-on-surface-variant mt-1 flex justify-between">
                                        <span>Total recorded attempts</span>
                                        {btmpStats.lastUpdated > 0 && <span>Updated: {new Date(btmpStats.lastUpdated).toLocaleTimeString()}</span>}
                                    </div>
                                </div>

                                <div className="bg-surface border border-outline/10 rounded-2xl p-4">
                                    <div className="flex items-center gap-3 text-on-surface-variant mb-3">
                                        <Shield size={18} />
                                        <span className="text-xs font-bold uppercase tracking-wider">Top Attacking IPs</span>
                                    </div>
                                    <div className="space-y-2 max-h-[100px] overflow-y-hidden pr-2">
                                        {btmpStats.topIps.slice(0, 1000).map(({ first: ip, second: count }) => (
                                            <div key={ip} className="flex justify-between items-center text-[10px]">
                                                <span className="font-mono text-primary cursor-pointer hover:underline" onClick={() => { setIpToBlock(ip); setIsBlockModalOpen(true); }}>{ip}</span>
                                                <span className="bg-white/5 px-1.5 py-0.5 rounded font-bold">{count}</span>
                                            </div>
                                        ))}
                                    </div>
                                    {btmpStats.topIps.length > 4 && (
                                        <button
                                            onClick={() => { setStatsModalType('IPS'); setIsStatsModalOpen(true); }}
                                            className="w-full text-center text-[9px] font-bold text-primary mt-3 hover:underline underline-offset-4"
                                        >
                                            VIEW ALL {btmpStats.topIps.length} IPS
                                        </button>
                                    )}
                                </div>

                                <div className="bg-surface border border-outline/10 rounded-2xl p-4">
                                    <div className="flex items-center gap-3 text-on-surface-variant mb-3">
                                        <Terminal size={18} />
                                        <span className="text-xs font-bold uppercase tracking-wider">Recent Attempts</span>
                                    </div>
                                    <div className="space-y-1.5 max-h-[100px] overflow-y-hidden pr-2">
                                        {btmpStats.recentFailures.slice(0, 1000).map((entry, i) => (
                                            <div key={i} className="text-[9px] font-mono truncate text-on-surface-variant">
                                                <span className="text-red-400 font-bold">FAILED</span> {entry.user} from {entry.ip}
                                            </div>
                                        ))}
                                    </div>
                                    {btmpStats.recentFailures.length > 4 && (
                                        <button
                                            onClick={() => { setStatsModalType('ATTEMPTS'); setIsStatsModalOpen(true); }}
                                            className="w-full text-center text-[9px] font-bold text-primary mt-3 hover:underline underline-offset-4"
                                        >
                                            VIEW ALL RECENT ATTEMPTS
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
                <div className="relative min-w-[200px] lg:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={16} />
                    <input
                        type="text"
                        placeholder="Search file names..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-surface/50 backdrop-blur-sm border border-outline/20 rounded-xl py-2 pl-10 pr-4 text-xs focus:outline-none focus:border-primary transition-colors"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2 flex-1">
                    <div className="relative flex-1 min-w-[150px]">
                        <Terminal className="absolute left-3 top-1/2 -translate-y-1/2 text-primary/70" size={14} />
                        <input
                            type="text"
                            placeholder="AWK filter..."
                            value={awkFilter}
                            onChange={(e) => setAwkFilter(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && selectedLog) {
                                    fetchLogContent(selectedLog, awkFilter);
                                }
                            }}
                            className="w-full bg-surface/50 backdrop-blur-sm border border-outline/20 rounded-xl py-2 pl-10 pr-4 text-xs font-mono focus:outline-none focus:border-primary transition-colors h-9"
                        />
                    </div>

                    <div className="flex items-center bg-surface/50 backdrop-blur-sm border border-outline/20 rounded-xl px-2 h-9">
                        <span className="text-[10px] uppercase font-bold text-on-surface-variant/50 ml-1 mr-2">Lines</span>
                        <input
                            type="number"
                            min="10"
                            max="5000"
                            step="100"
                            value={tailLines}
                            onChange={(e) => setTailLines(parseInt(e.target.value) || 200)}
                            className="w-12 bg-transparent border-none text-xs font-mono focus:outline-none text-primary font-bold"
                        />
                    </div>

                    <div className="flex items-center bg-surface/50 backdrop-blur-sm border border-outline/20 rounded-xl px-3 h-9 gap-2">
                        <Clock size={14} className="text-on-surface-variant/50" />
                        <input
                            type="datetime-local"
                            value={since}
                            onChange={(e) => setSince(e.target.value)}
                            className="bg-transparent border-none text-[10px] font-mono focus:outline-none text-primary selection:bg-primary/30 w-32"
                            title="Since"
                        />
                        <span className="text-[10px] opacity-20">→</span>
                        <input
                            type="datetime-local"
                            value={until}
                            onChange={(e) => setUntil(e.target.value)}
                            className="bg-transparent border-none text-[10px] font-mono focus:outline-none text-primary selection:bg-primary/30 w-32"
                            title="Until"
                        />
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => selectedLog && fetchLogContent(selectedLog, awkFilter)}
                            disabled={isReadingLog}
                            className="px-4 h-9 bg-primary/10 text-primary border border-primary/20 rounded-xl hover:bg-primary/20 transition-all font-bold text-[10px] uppercase tracking-wider"
                        >
                            Apply
                        </button>

                        <button
                            onClick={() => {
                                const ipMatch = logContent.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
                                if (ipMatch) setIpToBlock(ipMatch[0]);
                                setIsBlockModalOpen(true);
                            }}
                            className="w-9 h-9 flex items-center justify-center bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-all"
                            title="Block Detected IP Address"
                        >
                            <Ban size={16} />
                        </button>

                        <button
                            onClick={() => fetchLogs()}
                            className="w-9 h-9 flex items-center justify-center bg-surface/50 border border-outline/20 rounded-xl hover:bg-white/5 transition-all"
                            title="Refresh list"
                        >
                            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-5 px-1">
                <span className="text-[10px] uppercase font-bold text-on-surface-variant/60 mr-1 tracking-wider">Quick Filters:</span>
                <div className="flex bg-surface border border-outline/10 rounded-lg p-0.5 mr-4">
                    {(['today', 'yesterday', 'week', 'month'] as const).map(r => (
                        <button
                            key={r}
                            onClick={() => setQuickTimeRange(r)}
                            className="px-2 py-1 text-[9px] uppercase font-bold hover:bg-white/5 rounded-md transition-all text-on-surface-variant/80 hover:text-primary"
                        >
                            {r === 'week' ? 'this week' : r === 'month' ? 'this month' : r}
                        </button>
                    ))}
                    <button
                        onClick={() => { setSince(''); setUntil(''); }}
                        className="px-2 py-1 text-[9px] uppercase font-bold hover:bg-red-500/10 rounded-md transition-all text-red-400"
                    >
                        Reset Time
                    </button>
                </div>
                <QuickFilterBtn
                    label="Errors"
                    awk="/[Ee]rror|ERROR/"
                    current={awkFilter}
                    onClick={(awk) => { setAwkFilter(awk); selectedLog && fetchLogContent(selectedLog, awk); }}
                />
                <QuickFilterBtn
                    label="Failures"
                    awk="/[Ff]ail|FAILED/"
                    current={awkFilter}
                    onClick={(awk) => { setAwkFilter(awk); selectedLog && fetchLogContent(selectedLog, awk); }}
                />
                <QuickFilterBtn
                    label="Logins (utmp)"
                    awk="/\[7\]/"
                    current={awkFilter}
                    onClick={(awk) => { setAwkFilter(awk); selectedLog && fetchLogContent(selectedLog, awk); }}
                />
                <QuickFilterBtn
                    label="SSH"
                    awk="/ssh/"
                    current={awkFilter}
                    onClick={(awk) => { setAwkFilter(awk); selectedLog && fetchLogContent(selectedLog, awk); }}
                />
                <QuickFilterBtn
                    label="IP Counts"
                    awk='| awk "{for(i=1;i<=NF;i++) if(\\$i ~ /([0-9]{1,3}\\.){3}[0-9]{1,3}/) a[\\$i]++} END {for(i in a) print a[i], i | \"sort -rn\"}"'
                    current={awkFilter}
                    onClick={(awk) => { setAwkFilter(awk); selectedLog && fetchLogContent(selectedLog, awk); }}
                />
                <button
                    onClick={() => { setAwkFilter(''); selectedLog && fetchLogContent(selectedLog, ''); }}
                    className="ml-auto px-2 py-1 text-[10px] text-primary/70 hover:text-primary transition-colors underline decoration-dotted underline-offset-4"
                >
                    Clear Filter
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden">
                {/* Log List */}
                <div className="lg:col-span-1 flex flex-col gap-2 overflow-y-auto pb-4 custom-scrollbar">
                    {filteredLogs.map(log => (
                        <div
                            key={log.path}
                            onClick={() => fetchLogContent(log, awkFilter)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${selectedLog?.path === log.path
                                ? 'bg-primary/20 border-primary/40 shadow-[0_0_20px_rgba(var(--md-sys-color-primary-rgb),0.1)]'
                                : log.isDirectory
                                    ? 'bg-blue-500/5 border-blue-500/10 hover:bg-blue-500/10 hover:border-blue-500/20'
                                    : 'bg-surface/50 border-outline/10 hover:bg-surface hover:border-outline/20'
                                }`}
                        >
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${selectedLog?.path === log.path
                                    ? 'bg-primary text-on-primary'
                                    : log.isDirectory
                                        ? 'bg-blue-500/10 text-blue-500'
                                        : 'bg-white/5 text-on-surface-variant'
                                }`}>
                                {log.isDirectory ? <Folder size={18} /> : <FileText size={18} />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold truncate flex items-center gap-2">
                                    {log.name}
                                    {log.isDirectory && <span className="text-[8px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-md uppercase tracking-widest font-black">DIR</span>}
                                </div>
                                <div className="text-[10px] text-on-surface-variant/60 flex justify-between mt-1 font-medium">
                                    <span className="flex items-center gap-1">
                                        {!log.isDirectory && <><Database size={10} /> {formatSize(log.size)}</>}
                                        {log.isDirectory && "Directory"}
                                    </span>
                                    <span>{new Date(log.lastModified).toLocaleDateString()}</span>
                                </div>
                            </div>
                            <ChevronRight size={14} className="text-on-surface-variant/20" />
                        </div>
                    ))}
                    {filteredLogs.length === 0 && !isLoading && (
                        <div className="flex flex-col items-center justify-center py-10 opacity-40 italic text-sm">
                            <Folder size={32} className="mb-2 opacity-20" />
                            No logs or folders found
                        </div>
                    )}
                </div>

                {/* Log Content Viewer */}
                <div className="lg:col-span-2 bg-black/40 rounded-xl border border-outline/10 flex flex-col overflow-hidden">
                    {!selectedLog && (
                        <div className="flex items-center gap-2 mb-4 bg-surface/50 p-2 rounded-xl border border-outline/5 overflow-x-auto no-scrollbar">
                            <button
                                onClick={() => handlePathChange('')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${!currentPath ? 'bg-primary/20 text-primary border border-primary/20' : 'text-on-surface-variant hover:bg-white/10'}`}
                            >
                                <Folder size={14} />
                                root
                            </button>
                            {breadcrumbs.map((bc, i) => (
                                <React.Fragment key={bc.path}>
                                    <ChevronRight size={12} className="text-on-surface-variant/40 shrink-0" />
                                    <button
                                        onClick={() => handlePathChange(bc.path)}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${i === breadcrumbs.length - 1 ? 'bg-primary/20 text-primary border border-primary/20' : 'text-on-surface-variant hover:bg-white/10'}`}
                                    >
                                        {bc.name}
                                    </button>
                                </React.Fragment>
                            ))}
                        </div>
                    )}

                    {selectedLog ? (
                        <>
                            <div className="p-3 border-b border-outline/10 flex items-center justify-between bg-white/5">
                                <div className="flex items-center gap-2 min-w-0">
                                    <Terminal size={16} className="text-primary" />
                                    <span className="text-xs font-mono truncate text-on-surface-variant">{selectedLog.path}</span>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-[10px] text-on-surface-variant hidden md:block">
                                        Last modified: {formatDate(selectedLog.lastModified)}
                                    </span>
                                    <button
                                        onClick={() => fetchLogContent(selectedLog, awkFilter)}
                                        disabled={isReadingLog}
                                        className="p-1 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
                                        title="Reload content"
                                    >
                                        <RefreshCw size={14} className={isReadingLog ? 'animate-spin' : ''} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 p-4 font-mono text-xs overflow-auto">
                                {isReadingLog ? (
                                    <div className="flex items-center justify-center h-full text-on-surface-variant italic">
                                        Reading log file...
                                    </div>
                                ) : (
                                    <pre className="whitespace-pre-wrap text-green-400/90 leading-relaxed">
                                        {logContent || 'File is empty'}
                                    </pre>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant p-10 text-center">
                            <FileText size={48} className="mb-4 opacity-20" />
                            <p className="text-sm italic">Select a log file from the list to view its contents</p>
                            <p className="text-[10px] mt-2 opacity-50 max-w-xs">Viewing files from host machine's /var/log directory as mounted in /host/var/log</p>
                        </div>
                    )}
                </div>
            </div>
            {isBlockModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-surface border border-outline/20 rounded-3xl w-full max-w-md shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center gap-3 mb-6">
                            <Shield className="text-red-500" size={24} />
                            <h2 className="text-xl font-bold">Quick Block IP</h2>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1.5 ml-1">IP Address</label>
                                <input
                                    type="text"
                                    value={ipToBlock}
                                    onChange={(e) => setIpToBlock(e.target.value)}
                                    placeholder="e.g. 1.2.3.4"
                                    className="w-full bg-white/5 border border-outline/20 rounded-xl px-4 py-2.5 focus:outline-none focus:border-red-500 transition-all font-mono"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setIsBlockModalOpen(false)}
                                    className="flex-1 px-4 py-2.5 rounded-xl border border-outline/20 hover:bg-white/5 transition-all font-bold"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        const success = await DockerClient.blockIP({
                                            ip: ipToBlock,
                                            comment: `Blocked from Logs: ${selectedLog?.name}`,
                                            protocol: 'ALL'
                                        });
                                        if (success) {
                                            toast.success(`IP ${ipToBlock} blocked`);
                                            setIsBlockModalOpen(false);
                                        } else {
                                            toast.error('Failed to block IP');
                                        }
                                    }}
                                    className="flex-1 bg-red-500 text-white px-4 py-2.5 rounded-xl font-bold hover:opacity-90 transition-all"
                                >
                                    Confirm Block
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Stats View All Modal */}
            {isStatsModalOpen && btmpStats && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="bg-surface border border-outline/20 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-outline/10 bg-white/5 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 text-primary">
                                    {statsModalType === 'IPS' && <Shield size={24} />}
                                    {statsModalType === 'ATTEMPTS' && <Terminal size={24} />}
                                    {statsModalType === 'USERS' && <User size={24} />}
                                    {statsModalType === 'JAILED' && <Lock size={24} className="text-red-500" />}
                                    {statsModalType === 'CONFIG' && <Settings size={24} />}
                                    <h2 className="text-xl font-bold">
                                        {statsModalType === 'IPS' && 'Top Attacking IPs'}
                                        {statsModalType === 'ATTEMPTS' && 'Authentication Failures'}
                                        {statsModalType === 'USERS' && 'Top Targeted Users'}
                                        {statsModalType === 'JAILED' && 'Active Jails'}
                                        {statsModalType === 'CONFIG' && 'System Security Config'}
                                    </h2>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={manualRefreshBtmp}
                                        disabled={isRefreshingBtmp}
                                        className="p-2 hover:bg-white/10 rounded-xl transition-all"
                                    >
                                        <RefreshCw size={18} className={isRefreshingBtmp ? 'animate-spin' : ''} />
                                    </button>
                                    <button onClick={() => setIsStatsModalOpen(false)} className="p-2 hover:bg-red-500/10 text-on-surface-variant hover:text-red-500 rounded-xl transition-all">
                                        <XCircle size={20} />
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                {(['IPS', 'USERS', 'ATTEMPTS', 'JAILED', 'CONFIG'] as const).map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => setStatsModalType(tab)}
                                        className={`px-3 py-1.5 text-[10px] rounded-lg border transition-all uppercase font-bold flex items-center gap-2 ${statsModalType === tab
                                            ? 'bg-primary/20 border-primary/40 text-primary'
                                            : 'bg-white/5 border-white/10 text-on-surface-variant hover:bg-white/10'}`}
                                    >
                                        {tab === 'IPS' && <Shield size={12} />}
                                        {tab === 'USERS' && <User size={12} />}
                                        {tab === 'ATTEMPTS' && <Terminal size={12} />}
                                        {tab === 'JAILED' && <Lock size={12} />}
                                        {tab === 'CONFIG' && <Settings size={12} />}
                                        {tab}
                                        {tab === 'JAILED' && btmpStats.jailedIps && btmpStats.jailedIps.length > 0 && (
                                            <span className="bg-red-500 text-white px-1.5 rounded-full text-[8px]">{btmpStats.jailedIps.length}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            {statsModalType === 'IPS' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {btmpStats.topIps.map(({ first: ip, second: count }) => (
                                        <div key={ip} className="flex justify-between items-center bg-white/5 border border-outline/5 rounded-xl p-4 hover:border-primary/20 transition-all group">
                                            <div className="flex flex-col">
                                                <span className="font-mono text-sm text-primary font-bold">{ip}</span>
                                                <span className="text-[9px] text-on-surface-variant uppercase font-bold mt-1">Found in <span className="text-red-400">{count}</span> attempts</span>
                                            </div>
                                            <button
                                                onClick={() => { setIpToBlock(ip); setIsBlockModalOpen(true); }}
                                                className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all shadow-lg shadow-red-500/0 hover:shadow-red-500/20"
                                                title="Block IP Address"
                                            >
                                                <Ban size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {statsModalType === 'USERS' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                    {btmpStats.topUsers.map(({ first: user, second: count }) => (
                                        <div key={user} className="bg-white/5 border border-outline/5 rounded-xl p-3 flex flex-col items-center text-center">
                                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2 text-primary">
                                                <User size={20} />
                                            </div>
                                            <span className="font-bold text-sm truncate w-full">{user}</span>
                                            <span className="text-[10px] text-on-surface-variant font-bold uppercase mt-1">{count} Hits</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {statsModalType === 'ATTEMPTS' && (
                                <div className="border border-outline/10 rounded-2xl overflow-hidden bg-black/20">
                                    <table className="w-full text-left border-collapse font-mono text-[11px]">
                                        <thead className="bg-white/5 text-[10px] uppercase font-bold text-on-surface-variant/70">
                                            <tr>
                                                <th className="px-4 py-3">User</th>
                                                <th className="px-4 py-3">IP Address</th>
                                                <th className="px-4 py-3">Time</th>
                                                <th className="px-4 py-3 text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {btmpStats.recentFailures.map((entry, i) => (
                                                <tr key={i} className="hover:bg-white/5 transition-colors border-b border-outline/5 last:border-0 group">
                                                    <td className="px-4 py-3 text-red-400 font-bold uppercase">{entry.user}</td>
                                                    <td className="px-4 py-3 text-primary font-bold">{entry.ip}</td>
                                                    <td className="px-4 py-3 text-on-surface-variant">{entry.timestampString}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <button
                                                            onClick={() => { setIpToBlock(entry.ip); setIsBlockModalOpen(true); }}
                                                            className="p-1 text-red-500 border border-red-500/20 rounded-lg hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                                                            title="Block IP"
                                                        >
                                                            <Ban size={14} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {statsModalType === 'JAILED' && (
                                <div className="space-y-3">
                                    {(btmpStats.jailedIps?.length || 0) === 0 ? (
                                        <div className="text-center py-20 text-on-surface-variant italic opacity-50">
                                            No IPs currently in jail. The system is secure.
                                        </div>
                                    ) : (
                                        btmpStats.jailedIps?.map(jail => (
                                            <div key={jail.ip} className="flex justify-between items-center bg-red-500/5 border border-red-500/20 rounded-2xl p-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-500">
                                                        <Lock size={20} />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-mono text-lg text-red-500 font-bold">{jail.ip}</span>
                                                        <span className="text-[10px] text-on-surface-variant uppercase font-bold">{jail.reason}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right flex flex-col">
                                                    <span className="text-[10px] uppercase font-bold text-on-surface-variant mb-1">Expires in</span>
                                                    <span className="text-sm font-mono font-bold text-primary">
                                                        {Math.max(0, Math.ceil((jail.expiresAt - Date.now()) / 60000))} MINUTES
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {statsModalType === 'CONFIG' && (
                                <div className="max-w-md mx-auto space-y-6 py-6">
                                    <div className="flex items-center justify-between bg-white/5 border border-outline/10 p-4 rounded-2xl">
                                        <div className="flex flex-col">
                                            <span className="font-bold">Auto-Jail Active</span>
                                            <span className="text-[10px] text-on-surface-variant uppercase font-bold">Automatically block offending IPs</span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const newState = !isAutoJailEnabled;
                                                setIsAutoJailEnabled(newState);
                                                DockerClient.updateAutoJailSettings(newState, jailThreshold, jailDuration);
                                            }}
                                            className={`w-12 h-6 rounded-full transition-all relative ${isAutoJailEnabled ? 'bg-primary' : 'bg-white/10'}`}
                                        >
                                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isAutoJailEnabled ? 'left-7' : 'left-1'}`} />
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-on-surface-variant uppercase mb-2 ml-1">Jail Threshold</label>
                                            <div className="flex gap-4 items-center">
                                                <input
                                                    type="range" min="1" max="20"
                                                    value={jailThreshold}
                                                    onChange={(e) => setJailThreshold(parseInt(e.target.value))}
                                                    className="flex-1 accent-primary"
                                                />
                                                <span className="w-12 text-center bg-white/5 border border-outline/10 rounded-lg py-1 font-bold font-mono text-primary">{jailThreshold}</span>
                                            </div>
                                            <p className="text-[9px] text-on-surface-variant mt-2 italic">Number of failed attempts before automatic IP block</p>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-on-surface-variant uppercase mb-2 ml-1">Jail Duration (Minutes)</label>
                                            <div className="flex gap-4 items-center">
                                                <input
                                                    type="range" min="5" max="1440" step="5"
                                                    value={jailDuration}
                                                    onChange={(e) => setJailDuration(parseInt(e.target.value))}
                                                    className="flex-1 accent-primary"
                                                />
                                                <span className="w-12 text-center bg-white/5 border border-outline/10 rounded-lg py-1 font-bold font-mono text-primary">{jailDuration}</span>
                                            </div>
                                            <p className="text-[9px] text-on-surface-variant mt-2 italic">How long the IP stays in jail before being automatically released</p>
                                        </div>

                                        <button
                                            onClick={async () => {
                                                const success = await DockerClient.updateAutoJailSettings(isAutoJailEnabled, jailThreshold, jailDuration);
                                                if (success) toast.success('Security settings saved');
                                            }}
                                            className="w-full bg-primary text-white py-3 rounded-2xl font-bold hover:shadow-lg hover:shadow-primary/30 transition-all active:scale-95 mt-4"
                                        >
                                            SAVE CONFIGURATION
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-outline/10 bg-white/5 flex items-center justify-between">
                            <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest opacity-50">
                                {btmpStats.lastUpdated > 0 && `System Clock: ${new Date(btmpStats.lastUpdated).toLocaleTimeString()}`}
                            </span>
                            <button
                                onClick={() => setIsStatsModalOpen(false)}
                                className="px-8 py-2.5 bg-primary text-white rounded-xl font-bold hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function QuickFilterBtn({ label, awk, current, onClick }: { label: string, awk: string, current: string, onClick: (awk: string) => void }) {
    const isActive = current === awk;
    return (
        <button
            onClick={() => onClick(awk)}
            className={`px-2 py-1 text-[10px] rounded-lg border transition-all ${isActive
                ? 'bg-primary/20 border-primary/40 text-primary'
                : 'bg-white/5 border-white/10 text-on-surface-variant hover:bg-white/10 hover:border-white/20'
                }`}
        >
            {label}
        </button>
    );
}
