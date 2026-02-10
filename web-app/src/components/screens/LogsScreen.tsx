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
    const [selectedUnit, setSelectedUnit] = useState<string>('');
    const [tailLines, setTailLines] = useState<number>(200);
    const [since, setSince] = useState<string>('');
    const [until, setUntil] = useState<string>('');
    const [viewMode, setViewMode] = useState<'SYSTEM' | 'SYSLOG' | 'JOURNAL'>('SYSTEM');
    const [syslogContent, setSyslogContent] = useState<string>('');
    const [journalContent, setJournalContent] = useState<string>('');
    const [isJournalLoading, setIsJournalLoading] = useState(false);
    const [isSyslogLoading, setIsSyslogLoading] = useState(false);
    const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
    const [currentPath, setCurrentPath] = useState('');
    const [isLinux, setIsLinux] = useState(false);

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

    const fetchLogs = async (path?: string) => {
        setIsLoading(true);
        try {
            const [logsData, systemConfig] = await Promise.all([
                DockerClient.listSystemLogs(path || currentPath),
                DockerClient.getSystemConfig()
            ]);
            setLogs(logsData || []);
            if (systemConfig) {
                setIsLinux(systemConfig.osName?.toLowerCase().includes('linux') || false);
            }
        } catch (e) {
            console.error('Failed to fetch logs', e);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchSyslog = async (filterOverride?: string) => {
        setIsSyslogLoading(true);
        try {
            const filter = filterOverride !== undefined ? filterOverride : awkFilter;
            const content = await DockerClient.getSyslogLogs(tailLines, filter);
            setSyslogContent(content);
        } catch (e) {
            console.error('Failed to fetch syslog', e);
        } finally {
            setIsSyslogLoading(false);
        }
    };

    const fetchJournal = async (filterOverride?: string) => {
        setIsJournalLoading(true);
        try {
            const filter = filterOverride !== undefined ? filterOverride : awkFilter;
            const content = await DockerClient.getJournalLogs(tailLines, selectedUnit, filter, since, until);
            setJournalContent(content);
        } catch (e) {
            console.error('Failed to fetch journal', e);
        } finally {
            setIsJournalLoading(false);
        }
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
        try {
            const content = await DockerClient.getSystemLogContent(log.path, tailLines, filter, since, until);
            setLogContent(content);
        } catch (e) {
            console.error('Failed to fetch log content', e);
        } finally {
            setIsReadingLog(false);
        }
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
                            title="Until (ISO or 'now')"
                        />
                    </div>

                    <div className="flex bg-surface/50 border border-outline/20 rounded-xl p-1 gap-1">
                        {(['today', 'yesterday', 'week'] as const).map(r => (
                            <button
                                key={r}
                                onClick={() => setQuickTimeRange(r)}
                                className="px-2 py-1 hover:bg-white/5 rounded-md text-[9px] font-black uppercase text-on-surface-variant transition-all"
                            >
                                {r}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 bg-surface/30 backdrop-blur-xl border border-outline/10 rounded-[24px] overflow-hidden flex flex-col">
                {viewMode === 'SYSTEM' ? (
                    <>
                        <div className="bg-white/5 px-6 py-3 border-b border-outline/10 flex items-center justify-between">
                            <div className="flex items-center gap-3 overflow-x-auto pb-1 no-scrollbar">
                                <button
                                    onClick={() => handlePathChange('')}
                                    className="p-1.5 hover:bg-white/10 rounded-lg text-primary transition-colors flex-shrink-0"
                                >
                                    <Folder size={16} />
                                </button>
                                <span className="text-on-surface-variant/20">/</span>
                                {breadcrumbs.map((crumb, i) => (
                                    <React.Fragment key={crumb.path}>
                                        <button
                                            onClick={() => handlePathChange(crumb.path)}
                                            className="text-xs font-bold hover:text-primary transition-colors whitespace-nowrap"
                                        >
                                            {crumb.name}
                                        </button>
                                        {i < breadcrumbs.length - 1 && <span className="text-on-surface-variant/20">/</span>}
                                    </React.Fragment>
                                ))}
                            </div>
                            {selectedLog && (
                                <button
                                    onClick={() => setSelectedLog(null)}
                                    className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
                                >
                                    <ArrowLeft size={14} /> Back to Files
                                </button>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {selectedLog ? (
                                <div className="p-0 h-full flex flex-col">
                                    <div className="flex-1 bg-black/40 font-mono text-xs p-6 overflow-auto whitespace-pre selection:bg-primary/30 leading-relaxed">
                                        {isReadingLog ? (
                                            <div className="flex items-center justify-center h-full gap-3 text-on-surface-variant/40">
                                                <RefreshCw size={20} className="animate-spin text-primary" />
                                                <span className="font-bold uppercase tracking-widest text-[10px]">Streaming Data...</span>
                                            </div>
                                        ) : (
                                            logContent || 'Log file is empty'
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 bg-surface/90 backdrop-blur-md border-b border-outline/10 z-10">
                                        <tr>
                                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Name</th>
                                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Size</th>
                                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Modified</th>
                                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {filteredLogs.map(log => (
                                            <tr
                                                key={log.path}
                                                className="group hover:bg-white/[0.02] cursor-pointer transition-colors"
                                                onClick={() => fetchLogContent(log)}
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`p-2 rounded-xl bg-surface-variant/30 ${log.isDirectory ? 'text-primary' : 'text-on-surface-variant'} border border-outline/5`}>
                                                            {log.isDirectory ? <Folder size={18} /> : <FileText size={18} />}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-bold group-hover:text-primary transition-colors">{log.name}</span>
                                                            <span className="text-[10px] font-mono text-on-surface-variant/40">{log.path}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-xs font-mono opacity-60 text-on-surface-variant uppercase font-bold">{log.isDirectory ? '--' : formatSize(log.size)}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-xs font-medium text-on-surface-variant/40">{formatDate(log.lastModified)}</span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); fetchLogContent(log); }}
                                                            className="p-2 hover:bg-primary/20 hover:text-primary rounded-lg transition-all"
                                                            title="View Content"
                                                        >
                                                            <ArrowLeft className="rotate-180" size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col h-full bg-black/40 p-4 font-mono text-xs overflow-hidden">
                        <div className="flex items-center justify-between mb-3 px-2">
                            <div className="flex items-center gap-3">
                                <span className={`w-2 h-2 rounded-full ${viewMode === 'JOURNAL' ? 'bg-orange-500' : 'bg-green-500'} animate-pulse`} />
                                <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                                    Live Stream: {viewMode}
                                </span>
                            </div>
                            {viewMode === 'JOURNAL' && (
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] uppercase font-bold text-on-surface-variant/40">Unit:</span>
                                    <input
                                        type="text"
                                        placeholder="e.g. docker.service"
                                        value={selectedUnit}
                                        onChange={(e) => setSelectedUnit(e.target.value)}
                                        className="bg-surface/50 border border-outline/20 rounded-lg px-3 py-1 text-[10px] focus:outline-none focus:border-primary w-48"
                                    />
                                </div>
                            )}
                        </div>
                        <div className="flex-1 overflow-auto custom-scrollbar p-4 selection:bg-primary/30 leading-relaxed text-on-surface/80">
                            {viewMode === 'JOURNAL' ? (
                                isJournalLoading ? (
                                    <div className="flex items-center justify-center h-full gap-3 opacity-40">
                                        <RefreshCw size={20} className="animate-spin text-primary" />
                                        <span className="font-bold uppercase tracking-widest text-[10px]">Filtering Journal...</span>
                                    </div>
                                ) : journalContent || 'No journal entries found matching filters'
                            ) : (
                                isSyslogLoading ? (
                                    <div className="flex items-center justify-center h-full gap-3 opacity-40">
                                        <RefreshCw size={20} className="animate-spin text-primary" />
                                        <span className="font-bold uppercase tracking-widest text-[10px]">Processing Syslog...</span>
                                    </div>
                                ) : syslogContent || 'Syslog is currently empty or unavailable'
                            )}
                        </div>
                    </div>
                )}
            </div>

            {isBlockModalOpen && (
                <Modal
                    onClose={() => setIsBlockModalOpen(false)}
                    title="Instant Firewall Block"
                >
                    <div className="p-6">
                        <div className="flex items-center gap-4 mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                            <div className="p-3 bg-red-500/20 rounded-xl text-red-500">
                                <Ban size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-red-500">Block IPv4 Address</h3>
                                <p className="text-xs text-on-surface-variant font-medium">This will immediately drop all traffic from this IP.</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Target IP Address</label>
                                <input
                                    type="text"
                                    value={ipToBlock}
                                    onChange={(e) => setIpToBlock(e.target.value)}
                                    className="w-full bg-surface border border-outline/10 rounded-xl px-4 py-3 text-sm font-mono font-bold focus:outline-none focus:border-red-500/50 transition-all"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3 mt-8">
                                <button
                                    onClick={() => setIsBlockModalOpen(false)}
                                    className="px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all text-xs"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        const success = await DockerClient.blockIP({
                                            ip: ipToBlock,
                                            protocol: 'all',
                                            comment: 'Manual block from security insights'
                                        });
                                        if (success) { toast.success(`Blocked ${ipToBlock}`); setIsBlockModalOpen(false); }
                                        else { toast.error(`Failed to block ${ipToBlock}`); }
                                    }}
                                    className="px-4 py-3 bg-red-500 text-white rounded-xl font-bold shadow-xl shadow-red-500/20 hover:opacity-90 transition-all text-xs"
                                >
                                    Confirm Block
                                </button>
                            </div>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
