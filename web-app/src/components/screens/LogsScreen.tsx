'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Search, RefreshCw, FileText, XCircle, Terminal } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { SystemLog } from '@/lib/types';

export default function LogsScreen() {
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);
    const [logContent, setLogContent] = useState<string>('');
    const [isReadingLog, setIsReadingLog] = useState(false);
    const [awkFilter, setAwkFilter] = useState('');

    const fetchLogs = async () => {
        setIsLoading(true);
        const data = await DockerClient.listSystemLogs();
        setLogs(data);
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
