'use client';

import React, { useState, useEffect } from 'react';
import { DockerClient } from '@/lib/api';
import { DnsQueryStats } from '@/lib/types';
import { SectionCard } from './DnsShared';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { RefreshCw } from 'lucide-react';

export default function DnsAnalyticsTab() {
    const [stats, setStats] = useState<DnsQueryStats | null>(null);
    const [logs, setLogs] = useState<string>('');
    const [loading, setLoading] = useState(true);

    const loadStats = async () => {
        setLoading(true);
        try {
            const [data, logsData] = await Promise.all([
                DockerClient.getDnsQueryStats(),
                DockerClient.getDnsLogs(200)
            ]);
            setStats(data);
            setLogs(logsData);
        } catch (e) {
            console.error('Failed to load DNS analytics', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStats();
    }, []);

    if (!stats) return <div className="p-4 text-center text-on-surface-variant">Loading analytics...</div>;

    const typeEntries = Object.entries(stats.queryTypes)
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name, value }));

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Query Overview</h2>
                <button onClick={loadStats} className="btn-sm bg-surface-container">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard label="Total Queries" value={stats.totalQueries} color="text-blue-400" />
                <StatCard label="Throughput (QPS)" value={stats.qps.toFixed(2)} color="text-indigo-400" />
                <StatCard label="Successful" value={stats.successQueries} color="text-green-400" />
                <StatCard label="Recursive" value={stats.recursiveQueries} color="text-purple-400" />
                <StatCard label="Dropped / Blocked" value={stats.droppedQueries} color="text-slate-400" />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 pb-2">
                <StatCard label="NXDOMAIN (Floods)" value={stats.nxdomainQueries} color={stats.nxdomainQueries > 1000 ? "text-amber-400" : "text-amber-400/60"} />
                <StatCard label="SERVFAIL (Unloaded)" value={stats.servfailQueries} color={stats.servfailQueries > 0 ? "text-red-400 font-black animate-pulse" : "text-red-400/60"} />
                <StatCard label="REFUSED (Critical)" value={stats.refusedQueries} color={stats.refusedQueries > 0 ? "text-rose-400 font-black animate-pulse" : "text-rose-400/60"} />
                <StatCard label="TCP Queries" value={stats.tcpQueries} color="text-orange-400" />
                <StatCard label="TCP Fallback Rate" value={`${(stats.totalQueries > 0 ? (stats.tcpQueries / stats.totalQueries) * 100 : 0).toFixed(1)}%`} color="text-yellow-400" />
            </div>

            {typeEntries.length > 0 && (
                <SectionCard title="Query Types">
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={typeEntries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <XAxis dataKey="name" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value} />
                                <Tooltip
                                    cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                                    contentStyle={{ backgroundColor: '#1e1e2d', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                    {typeEntries.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={getColor(index)} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </SectionCard>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {stats.rawStats && (
                    <SectionCard title="Raw Output (rndc stats / named.stats)">
                        <pre className="text-[10px] font-mono text-on-surface-variant whitespace-pre-wrap h-64 overflow-y-auto bg-surface p-3 rounded-lg border border-outline/10">
                            {stats.rawStats}
                        </pre>
                    </SectionCard>
                )}

                <SectionCard title="System Logs">
                    <pre className="text-[10px] font-mono text-on-surface-variant whitespace-pre-wrap h-64 overflow-y-auto bg-[#1e1e2d] p-3 rounded-lg border border-outline/10">
                        {logs || "No logs available"}
                    </pre>
                </SectionCard>
            </div>
        </div>
    );
}

function StatCard({ label, value, color }: { label: string; value: any; color: string }) {
    const displayValue = typeof value === 'number' ? value.toLocaleString() : value;
    return (
        <div className="rounded-xl border border-outline/10 bg-surface-container p-4">
            <div className={`text-2xl font-bold ${color}`}>{displayValue}</div>
            <div className="text-xs text-on-surface-variant mt-1 font-medium">{label}</div>
        </div>
    );
}

const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16'];
function getColor(index: number) {
    return COLORS[index % COLORS.length];
}
