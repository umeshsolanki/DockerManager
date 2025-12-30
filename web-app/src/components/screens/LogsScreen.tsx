'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Search, RefreshCw, FileText, XCircle, Terminal, Shield } from 'lucide-react';
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

    const fetchLogs = async () => {
        setIsLoading(true);
        const [logsData, btmpData] = await Promise.all([
            DockerClient.listSystemLogs(),
            DockerClient.getBtmpStats()
        ]);
        setLogs(logsData);
        setBtmpStats(btmpData);
        setIsLoading(false);
    };

    const fetchLogContent = async (log: SystemLog, filter?: string) => {
        setIsReadingLog(true);
        setSelectedLog(log);
        const content = await DockerClient.getSystemLogContent(log.path, 200, filter);
        setLogContent(content);
        setIsReadingLog(false);
    };

    useEffect(() => {
        fetchLogs();
        const interval = setInterval(fetchLogs, 30000);
        return () => clearInterval(interval);
    }, []);

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

            {/* Btmp Stats Dashboard */}
            {btmpStats && btmpStats.totalFailedAttempts > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-4">
                        <div className="flex items-center gap-3 text-red-500 mb-2">
                            <XCircle size={18} />
                            <span className="text-xs font-bold uppercase tracking-wider">Failed Logins (btmp)</span>
                        </div>
                        <div className="text-3xl font-bold text-red-500">{btmpStats.totalFailedAttempts}</div>
                        <div className="text-[10px] text-on-surface-variant mt-1">Total recorded attempts</div>
                    </div>

                    <div className="bg-surface border border-outline/10 rounded-2xl p-4">
                        <div className="flex items-center gap-3 text-on-surface-variant mb-3">
                            <Shield size={18} />
                            <span className="text-xs font-bold uppercase tracking-wider">Top Attacking IPs</span>
                        </div>
                        <div className="space-y-2">
                            {btmpStats.topIps.slice(0, 3).map(([ip, count]) => (
                                <div key={ip} className="flex justify-between items-center text-[10px]">
                                    <span className="font-mono text-primary cursor-pointer hover:underline" onClick={() => { setIpToBlock(ip); setIsBlockModalOpen(true); }}>{ip}</span>
                                    <span className="bg-white/5 px-1.5 py-0.5 rounded font-bold">{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-surface border border-outline/10 rounded-2xl p-4">
                        <div className="flex items-center gap-3 text-on-surface-variant mb-3">
                            <Terminal size={18} />
                            <span className="text-xs font-bold uppercase tracking-wider">Recent Attempts</span>
                        </div>
                        <div className="space-y-1.5 overflow-hidden">
                            {btmpStats.recentFailures.slice(0, 3).map((entry, i) => (
                                <div key={i} className="text-[9px] font-mono truncate text-on-surface-variant">
                                    <span className="text-red-400">FAILED</span> {entry.user} from {entry.ip}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
                    <input
                        type="text"
                        placeholder="Search file names..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-surface border border-outline/20 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Terminal className="absolute left-3 top-1/2 -translate-y-1/2 text-primary" size={18} />
                        <input
                            type="text"
                            placeholder="AWK filter (e.g. /error/ for searching error)..."
                            value={awkFilter}
                            onChange={(e) => setAwkFilter(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && selectedLog) {
                                    fetchLogContent(selectedLog, awkFilter);
                                }
                            }}
                            className="w-full bg-surface border border-outline/20 rounded-xl py-2 pl-10 pr-4 text-sm font-mono focus:outline-none focus:border-primary transition-colors"
                        />
                    </div>
                    <button
                        onClick={() => selectedLog && fetchLogContent(selectedLog, awkFilter)}
                        className="p-2 bg-primary/10 text-primary border border-primary/20 rounded-xl hover:bg-primary/20 transition-colors"
                        title="Apply AWK"
                    >
                        Apply
                    </button>
                    <button
                        onClick={() => {
                            const ipMatch = logContent.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
                            if (ipMatch) setIpToBlock(ipMatch[0]);
                            setIsBlockModalOpen(true);
                        }}
                        className="p-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-colors"
                        title="Block Detected IP"
                    >
                        <Shield size={18} />
                    </button>
                    <button
                        onClick={fetchLogs}
                        className="p-2 bg-surface border border-outline/20 rounded-xl hover:bg-white/5 transition-colors"
                        title="Refresh list"
                    >
                        <RefreshCw size={18} />
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-5 px-1">
                <span className="text-[10px] uppercase font-bold text-on-surface-variant/60 mr-1 tracking-wider">Quick Filters:</span>
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
                    awk='tail -n 50000 | awk "{for(i=1;i<=NF;i++) if(\\$i ~ /([0-9]{1,3}\\.){3}[0-9]{1,3}/) a[\\$i]++} END {for(i in a) print a[i], i | \"sort -rn\"}"'
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
                <div className="lg:col-span-1 flex flex-col gap-2 overflow-y-auto pb-4">
                    {filteredLogs.map(log => (
                        <div
                            key={log.path}
                            onClick={() => fetchLogContent(log, awkFilter)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${selectedLog?.path === log.path
                                ? 'bg-primary/10 border-primary/30'
                                : 'bg-surface/50 border-outline/10 hover:bg-surface'
                                }`}
                        >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedLog?.path === log.path ? 'bg-primary/20 text-primary' : 'bg-white/5 text-on-surface-variant'
                                }`}>
                                <FileText size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{log.name}</div>
                                <div className="text-[10px] text-on-surface-variant flex justify-between mt-1">
                                    <span>{formatSize(log.size)}</span>
                                    <span>{new Date(log.lastModified).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {filteredLogs.length === 0 && !isLoading && (
                        <div className="text-center py-10 text-on-surface-variant text-sm italic">
                            No logs found in /var/log
                        </div>
                    )}
                </div>

                {/* Log Content Viewer */}
                <div className="lg:col-span-2 bg-black/40 rounded-xl border border-outline/10 flex flex-col overflow-hidden">
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
