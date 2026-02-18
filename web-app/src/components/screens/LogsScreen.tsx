'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Search, RefreshCw, FileText, XCircle, Terminal, Shield, User, Clock, Settings, Lock, Ban, ChevronDown, ChevronRight, Folder, ArrowLeft, Database, Plus } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { SystemLog, BlockIPRequest } from '@/lib/types';
import { toast } from 'sonner';
import { Modal } from '../ui/Modal';

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
    const [tailLines, setTailLines] = useState<number>(200);
    const [since, setSince] = useState<string>('');
    const [until, setUntil] = useState<string>('');
    const [isStatsExpanded, setIsStatsExpanded] = useState(true);
    const [viewMode, setViewMode] = useState<'SYSTEM' | 'SYSLOG' | 'JOURNAL'>('SYSTEM');
    const [syslogContent, setSyslogContent] = useState<string>('');
    const [journalContent, setJournalContent] = useState<string>('');
    const [selectedUnit, setSelectedUnit] = useState<string>('');
    const [isJournalLoading, setIsJournalLoading] = useState(false);
    const [isSyslogLoading, setIsSyslogLoading] = useState(false);

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
    const [refreshInterval, setRefreshInterval] = useState(5);
    const [isMonitoringActive, setIsMonitoringActive] = useState(true);
    const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);


    const [currentPath, setCurrentPath] = useState('');

    const [isLinux, setIsLinux] = useState(false);

    const fetchLogs = async (path?: string) => {
        setIsLoading(true);
        const [logsData, systemConfig] = await Promise.all([
            DockerClient.listSystemLogs(path || currentPath),
            DockerClient.getSystemConfig()
        ]);
        setLogs(logsData || []);
        if (systemConfig) {
            setIsLinux(systemConfig.osName?.toLowerCase().includes('linux') || false);
        }
        setIsLoading(false);
    };

    const fetchSyslog = async (filterOverride?: string) => {
        setIsSyslogLoading(true);
        const filter = filterOverride !== undefined ? filterOverride : awkFilter;
        const content = await DockerClient.getSyslogLogs(tailLines, filter);
        setSyslogContent(content);
        setIsSyslogLoading(false);
    };

    const fetchJournal = async (filterOverride?: string) => {
        setIsJournalLoading(true);
        const filter = filterOverride !== undefined ? filterOverride : awkFilter;
        const content = await DockerClient.getJournalLogs(tailLines, selectedUnit, filter, since, until);
        setJournalContent(content);
        setIsJournalLoading(false);
    };


    useEffect(() => {
        if (viewMode === 'SYSTEM') {
            fetchLogs(currentPath);
        } else if (viewMode === 'SYSLOG') {
            fetchSyslog();
        } else if (viewMode === 'JOURNAL') {
            fetchJournal();
        }
    }, [currentPath, viewMode, selectedUnit, tailLines]);

    const handleApplyFilter = (filterOverride?: string) => {
        const filter = filterOverride !== undefined ? filterOverride : awkFilter;
        if (viewMode === 'SYSTEM') {
            if (selectedLog) fetchLogContent(selectedLog, filter);
            else fetchLogs(currentPath);
        } else if (viewMode === 'SYSLOG') {
            fetchSyslog(filter);
        } else if (viewMode === 'JOURNAL') {
            fetchJournal(filter);
        }
    };

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
        if (!autoRefreshEnabled) return;
        const interval = setInterval(() => {
            if (viewMode === 'SYSTEM') fetchLogs(currentPath);
            else if (viewMode === 'SYSLOG') fetchSyslog();
            else if (viewMode === 'JOURNAL') fetchJournal();
        }, 30000);
        return () => clearInterval(interval);
    }, [currentPath, viewMode, selectedUnit, autoRefreshEnabled]);


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
                <h1 className="text-3xl font-bold">Logs</h1>
                <div className="flex bg-surface border border-outline/10 rounded-xl p-1 ml-2">
                    <button
                        onClick={() => setViewMode('SYSTEM')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'SYSTEM' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-white/5'}`}
                    >
                        System Logs
                    </button>
                    <button
                        onClick={() => setViewMode('SYSLOG')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'SYSLOG' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-white/5'}`}
                    >
                        Syslog
                    </button>
                    <button
                        onClick={() => setViewMode('JOURNAL')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'JOURNAL' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-white/5'}`}
                    >
                        Journalctl
                    </button>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${autoRefreshEnabled ? 'bg-primary/10 text-primary border border-primary/30' : 'bg-white/5 text-on-surface-variant border border-white/10'}`}
                        title={autoRefreshEnabled ? 'Auto-refresh ON (30s)' : 'Auto-refresh OFF'}
                    >
                        <RefreshCw size={14} className={autoRefreshEnabled ? 'animate-spin-slow' : ''} />
                        Auto
                    </button>
                    {(isLoading || isSyslogLoading || isJournalLoading) && <RefreshCw className="animate-spin text-primary" size={24} />}
                </div>
            </div>


            <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
                <div className="relative min-w-[200px] lg:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={16} />
                    <input
                        type="text"
                        placeholder={viewMode === 'SYSTEM' ? "Search file names..." : "Search messages..."}
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
                            type="text"
                            value={since}
                            onChange={(e) => setSince(e.target.value)}
                            placeholder="Since (e.g. today)"
                            className="bg-transparent border-none text-[10px] font-mono focus:outline-none text-primary selection:bg-primary/30 w-36 placeholder:text-on-surface-variant/30"
                            title="Since (ISO or '5 minutes ago')"
                        />
                        <span className="text-[10px] opacity-20">→</span>
                        <input
                            type="text"
                            value={until}
                            onChange={(e) => setUntil(e.target.value)}
                            placeholder="Until (now)"
                            className="bg-transparent border-none text-[10px] font-mono focus:outline-none text-primary selection:bg-primary/30 w-36 placeholder:text-on-surface-variant/30"
                            title="Until (ISO or 'yesterday')"
                        />
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => handleApplyFilter()}
                            disabled={isReadingLog || isLoading || isSyslogLoading || isJournalLoading}
                            className="px-4 h-9 bg-primary/10 text-primary border border-primary/20 rounded-xl hover:bg-primary/20 transition-all font-bold text-[10px] uppercase tracking-wider disabled:opacity-50"
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


            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden">
                {viewMode === 'SYSTEM' && (
                    <>
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
                            <div className="flex items-center gap-1 mb-2 bg-surface/50 p-1.5 rounded-xl border border-outline/5 overflow-x-auto no-scrollbar">
                                <button
                                    onClick={() => handlePathChange('')}
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap ${!currentPath ? 'bg-primary/20 text-primary border border-primary/20' : 'text-on-surface-variant hover:bg-white/10'}`}
                                >
                                    <Folder size={12} />
                                    root
                                </button>
                                {breadcrumbs.map((bc, i) => (
                                    <React.Fragment key={bc.path}>
                                        <ChevronRight size={10} className="text-on-surface-variant/40 shrink-0" />
                                        <button
                                            onClick={() => handlePathChange(bc.path)}
                                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap ${i === breadcrumbs.length - 1 ? 'bg-primary/20 text-primary border border-primary/20' : 'text-on-surface-variant hover:bg-white/10'}`}
                                        >
                                            {bc.name}
                                        </button>
                                    </React.Fragment>
                                ))}
                            </div>

                            {selectedLog ? (
                                <>
                                    <div className="p-3 border-b border-outline/10 flex items-center justify-between bg-white/5">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <button
                                                onClick={() => setSelectedLog(null)}
                                                className="p-1.5 hover:bg-white/10 rounded-lg text-on-surface-variant hover:text-primary transition-colors mr-1"
                                                title="Back to file list"
                                            >
                                                <ArrowLeft size={16} />
                                            </button>
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
                    </>
                )}

                {(viewMode === 'SYSLOG' || viewMode === 'JOURNAL') && (
                    <div className="lg:col-span-3 flex flex-col gap-4 overflow-hidden h-full">
                        <div className="flex items-center justify-between px-2">
                            <div className="flex items-center gap-4">
                                <span className="text-[10px] font-bold text-on-surface-variant/60 uppercase">
                                    {viewMode === 'JOURNAL' ? 'Journalctl Output' : 'Syslog Output'}
                                </span>
                                {viewMode === 'JOURNAL' && (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            placeholder="Unit (e.g. docker.service)"
                                            className="bg-surface/50 border border-outline/10 rounded-lg px-3 py-1 text-[10px] font-bold focus:outline-none focus:border-primary/40 w-48"
                                            value={selectedUnit}
                                            onChange={(e) => setSelectedUnit(e.target.value)}
                                        />
                                    </div>
                                )}
                                <div className="flex bg-white/5 rounded-lg p-0.5 ml-2">
                                    <button onClick={() => setQuickTimeRange('today')} className="px-2 py-0.5 text-[8px] font-black uppercase hover:bg-white/5 rounded transition-all">Today</button>
                                    <button onClick={() => setQuickTimeRange('yesterday')} className="px-2 py-0.5 text-[8px] font-black uppercase hover:bg-white/5 rounded transition-all">Yesterday</button>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-on-surface-variant uppercase">Rows:</span>
                                    <select
                                        value={tailLines}
                                        onChange={(e) => setTailLines(parseInt(e.target.value))}
                                        className="bg-surface/50 border border-outline/10 rounded-lg px-2 py-1 text-[10px] font-bold focus:outline-none focus:border-primary/40"
                                    >
                                        {[100, 200, 500, 1000].map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                </div>
                                <button
                                    onClick={() => handleApplyFilter()}
                                    className="p-2 bg-surface/50 border border-outline/10 rounded-xl hover:bg-white/5 text-on-surface-variant transition-all"
                                >
                                    <RefreshCw size={16} className={(viewMode === 'JOURNAL' ? isJournalLoading : isSyslogLoading) ? 'animate-spin' : ''} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 bg-black/40 rounded-2xl border border-outline/10 overflow-hidden flex flex-col p-4 font-mono text-xs">
                            <div className="flex-1 overflow-auto custom-scrollbar">
                                {(viewMode === 'JOURNAL' ? isJournalLoading : isSyslogLoading) ? (
                                    <div className="flex items-center justify-center h-full text-on-surface-variant italic">
                                        Querying {viewMode === 'JOURNAL' ? 'journalctl' : 'syslog'}...
                                    </div>
                                ) : (
                                    <pre className="whitespace-pre-wrap text-green-400/90 leading-relaxed text-[11px]">
                                        {(viewMode === 'JOURNAL' ? journalContent : syslogContent) || 'No entries found matching criteria'}
                                    </pre>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
