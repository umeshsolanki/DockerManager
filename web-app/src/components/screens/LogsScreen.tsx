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

    const fetchLogs = async () => {
        setIsLoading(true);
        const data = await DockerClient.listSystemLogs();
        setLogs(data);
        setIsLoading(false);
    };

    const fetchLogContent = async (log: SystemLog) => {
        setIsReadingLog(true);
        setSelectedLog(log);
        const content = await DockerClient.getSystemLogContent(log.path, 200);
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

            <div className="flex items-center gap-4 mb-5">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
                    <input
                        type="text"
                        placeholder="Search logs..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-surface border border-outline/20 rounded-xl py-2 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
                <button
                    onClick={fetchLogs}
                    className="p-2 bg-surface border border-outline/20 rounded-xl hover:bg-white/5 transition-colors"
                    title="Refresh"
                >
                    <RefreshCw size={18} />
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden">
                {/* Log List */}
                <div className="lg:col-span-1 flex flex-col gap-2 overflow-y-auto pb-4">
                    {filteredLogs.map(log => (
                        <div
                            key={log.path}
                            onClick={() => fetchLogContent(log)}
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
                                        onClick={() => fetchLogContent(selectedLog)}
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
