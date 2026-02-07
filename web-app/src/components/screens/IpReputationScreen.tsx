'use client';

import React, { useState, useEffect } from 'react';
import { DockerClient } from '@/lib/api';
import { IpReputation } from '@/lib/types';
import { Globe, Trash2, Search, RefreshCw, AlertTriangle, Shield, Clock, MapPin, Activity } from 'lucide-react';

export default function IpReputationScreen() {
    const [reputations, setReputations] = useState<IpReputation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [limit, setLimit] = useState(50);
    const [offset, setOffset] = useState(0);

    const fetchReputations = async () => {
        setIsLoading(true);
        try {
            const data = await DockerClient.listIpReputations(limit, offset, search);
            setReputations(data);
        } catch (e) {
            console.error('Failed to fetch IP reputations', e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchReputations();
        }, 300);
        return () => clearTimeout(timer);
    }, [search, limit, offset]);

    const handleDelete = async (ip: string) => {
        if (!confirm(`Are you sure you want to delete reputation for ${ip}?`)) return;

        try {
            const success = await DockerClient.deleteIpReputation(ip);
            if (success) {
                fetchReputations();
            } else {
                alert('Failed to delete IP reputation (Not Found or Error)');
            }
        } catch (e) {
            console.error('Failed to delete IP reputation', e);
            alert('Failed to delete IP reputation');
        }
    };

    return (
        <div className="flex flex-col gap-6 pb-8 max-w-[1600px] mx-auto">
            <header className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                        <Globe className="text-primary" size={28} />
                        IP Reputation
                    </h1>
                    <p className="text-on-surface-variant/70 font-medium">
                        Monitor and manage IP reputation based on activity and block history.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchReputations}
                        disabled={isLoading}
                        className="p-2.5 bg-surface border border-outline/10 rounded-xl hover:bg-surface-variant/50 transition-all text-on-surface-variant hover:text-primary active:scale-95 disabled:opacity-50"
                        title="Refresh"
                    >
                        <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </header>

            {/* Controls */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-surface/30 p-4 rounded-2xl border border-outline/10">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50" size={18} />
                    <input
                        type="text"
                        placeholder="Search IP, Country, Reason..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-surface-variant/30 border border-outline/10 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-on-surface-variant/70 uppercase tracking-wide">Show:</span>
                    <select
                        value={limit}
                        onChange={(e) => setLimit(Number(e.target.value))}
                        className="bg-surface-variant/30 border border-outline/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                    >
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={500}>500</option>
                    </select>
                </div>
            </div>

            {/* List */}
            <div className="grid grid-cols-1 gap-4">
                {reputations.length === 0 && !isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant/40 border-2 border-dashed border-outline/10 rounded-3xl bg-surface/10">
                        <Globe size={48} className="mb-4 opacity-50" />
                        <span className="text-lg font-bold">No reputation records found</span>
                        <span className="text-sm">IPs will appear here when activity or blocks are recorded.</span>
                    </div>
                ) : (
                    reputations.map((rep) => (
                        <div key={rep.ip} className="bg-surface border border-outline/10 rounded-2xl p-5 hover:border-primary/30 transition-all group shadow-sm">
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                <div className="flex items-start gap-4">
                                    <div className={`mt-1 p-2.5 rounded-xl ${rep.blockedTimes > 0 ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                                        {rep.blockedTimes > 0 ? <Shield size={24} /> : <Activity size={24} />}
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-3">
                                            <span className="font-mono text-lg font-bold tracking-tight">{rep.ip}</span>
                                            {rep.country && (
                                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-variant/50 border border-outline/5 text-xs font-bold text-on-surface-variant">
                                                    <MapPin size={10} />
                                                    {rep.country}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant/70 mt-1">
                                            <div className="flex items-center gap-1.5" title="First Observed">
                                                <Clock size={12} />
                                                <span className="font-mono opacity-80">First Seen: {new Date(rep.firstObserved).toLocaleString()}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5" title="Last Activity">
                                                <Activity size={12} />
                                                <span className="font-mono opacity-80">Last Active: {new Date(rep.lastActivity).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col lg:items-end gap-2 lg:min-w-[300px]">
                                    <div className="flex items-center gap-4">
                                        <div className="flex flex-col items-end">
                                            <span className="text-[10px] uppercase font-bold text-on-surface-variant/50 tracking-wider">Times Blocked</span>
                                            <span className={`text-xl font-black ${rep.blockedTimes > 0 ? 'text-red-400' : 'text-on-surface-variant'}`}>{rep.blockedTimes}</span>
                                        </div>
                                        {rep.lastBlocked && (
                                            <div className="flex flex-col items-end border-l border-outline/10 pl-4">
                                                <span className="text-[10px] uppercase font-bold text-on-surface-variant/50 tracking-wider">Last Block</span>
                                                <span className="text-xs font-mono font-bold text-red-500">{new Date(rep.lastBlocked).toLocaleDateString()}</span>
                                                <span className="text-[10px] font-mono opacity-50">{new Date(rep.lastBlocked).toLocaleTimeString()}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Reasons */}
                            {rep.reasons && rep.reasons.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-outline/10 flex flex-wrap gap-2">
                                    {rep.reasons.map((reason, i) => (
                                        <div key={i} className="px-2.5 py-1 rounded-lg bg-surface-variant/30 border border-outline/5 text-xs font-medium text-on-surface-variant/80 flex items-center gap-1.5">
                                            <AlertTriangle size={10} className="text-orange-400" />
                                            {reason}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="mt-4 flex justify-end">
                                <button
                                    onClick={() => handleDelete(rep.ip)}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 size={14} />
                                    Delete Record
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Pagination */}
            <div className="flex justify-center gap-2 py-4">
                <button
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    className="px-4 py-2 rounded-lg bg-surface border border-outline/10 text-sm font-bold disabled:opacity-50 hover:bg-surface-variant/50"
                >
                    Previous
                </button>
                <div className="px-4 py-2 bg-surface-variant/20 rounded-lg text-sm font-mono flex items-center">
                    {offset} - {offset + limit}
                </div>
                <button
                    disabled={reputations.length < limit}
                    onClick={() => setOffset(offset + limit)}
                    className="px-4 py-2 rounded-lg bg-surface border border-outline/10 text-sm font-bold disabled:opacity-50 hover:bg-surface-variant/50"
                >
                    Next
                </button>
            </div>
        </div>
    );
}
