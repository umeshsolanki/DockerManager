'use client';

import React, { useState, useEffect } from 'react';
import { DockerClient } from '@/lib/api';
import { IpReputation } from '@/lib/types';
import { Globe, Trash2, Search, RefreshCw, AlertTriangle, Shield, Clock, MapPin, Activity, Save, Info, Plus } from 'lucide-react';
import { Modal } from '../ui/Modal';

export default function IpReputationScreen() {
    const [reputations, setReputations] = useState<IpReputation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [limit, setLimit] = useState(50);
    const [offset, setOffset] = useState(0);
    const [ipRangesCount, setIpRangesCount] = useState(0);
    const [showIpImportModal, setShowIpImportModal] = useState(false);
    const [ipCsv, setIpCsv] = useState('');
    const [importingIpRanges, setImportingIpRanges] = useState(false);

    const fetchReputations = async () => {
        setIsLoading(true);
        try {
            const data = await DockerClient.listIpReputations(limit, offset, search);
            data.sort((a, b) => b.blockedTimes - a.blockedTimes);
            setReputations(data);
        } catch (e) {
            console.error('Failed to fetch IP reputations', e);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const ipStats = await DockerClient.getIpRangeStats();
            setIpRangesCount(ipStats.totalRanges);
        } catch (e) {
            console.error('Failed to fetch stats', e);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

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


            {/* IP Geolocation Settings (Compact) */}
            <div className="bg-surface/50 border border-outline/10 rounded-2xl shadow-sm backdrop-blur-md overflow-hidden group">
                {/* Header Row */}
                <div className="flex flex-col md:flex-row md:items-center justify-between p-4 gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-secondary/10 rounded-lg text-secondary border border-secondary/20">
                            <Globe size={18} />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-on-surface flex items-center gap-2">
                                IP Geolocation Data
                                <span className="px-2 py-0.5 rounded-md bg-surface-variant/50 border border-outline/5 text-[10px] text-on-surface-variant/80 font-mono">
                                    {ipRangesCount.toLocaleString()} Ranges
                                </span>
                            </h2>
                            <p className="text-[10px] text-on-surface-variant font-medium">Manage IP range databases for country/ISP identification</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-surface-variant/50 border border-outline/10 rounded-lg text-xs font-bold transition-all active:scale-95 text-on-surface"
                            onClick={() => setShowIpImportModal(true)}
                        >
                            <Save size={14} className="text-secondary" />
                            <span>Import CSV</span>
                        </button>
                    </div>
                </div>

                {/* Actions Row */}
                <div className="bg-surface/30 px-4 py-2.5 border-t border-outline/5 flex flex-col md:flex-row items-center gap-4">
                    {/* Auto Fetchers */}
                    <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto no-scrollbar pb-1 md:pb-0">
                        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider whitespace-nowrap mr-1">Auto-Fetch:</span>
                        {[
                            { id: 'cloudflare', name: 'CF', full: 'Cloudflare', color: 'text-[#F38020] border-[#F38020]/20 hover:bg-[#F38020]/10' },
                            { id: 'aws', name: 'AWS', full: 'AWS', color: 'text-[#FF9900] border-[#FF9900]/20 hover:bg-[#FF9900]/10' },
                            { id: 'google', name: 'GCP', full: 'Google', color: 'text-[#4285F4] border-[#4285F4]/20 hover:bg-[#4285F4]/10' },
                            { id: 'digitalocean', name: 'DO', full: 'DigitalOcean', color: 'text-[#0080FF] border-[#0080FF]/20 hover:bg-[#0080FF]/10' }
                        ].map((provider) => (
                            <button
                                key={provider.id}
                                disabled={importingIpRanges}
                                onClick={async () => {
                                    setImportingIpRanges(true);
                                    try {
                                        console.log(`Fetching IP ranges for ${provider.full}...`);
                                        const res = await DockerClient.fetchIpRanges(provider.id as any) as any;

                                        if (res && res.status === 'success') {
                                            alert(`Successfully fetched ${res.imported} ranges from ${provider.full}!`);
                                            fetchStats();
                                        } else {
                                            const errorMsg = res ? (res.error || res.message) : 'Unknown error';
                                            alert(`Failed to fetch ${provider.full} ranges: ${errorMsg}`);
                                        }
                                    } catch (e: any) {
                                        console.error(e);
                                        alert(`Error fetching ${provider.full} ranges: ${e.message || e}`);
                                    } finally {
                                        setImportingIpRanges(false);
                                    }
                                }}
                                className={`px-2.5 py-1 rounded-md border text-[10px] font-bold transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap ${provider.color}`}
                                title={`Fetch ${provider.full} Ranges`}
                            >
                                {provider.name}
                            </button>
                        ))}
                    </div>

                    <div className="hidden md:block w-px h-5 bg-outline/10"></div>

                    {/* Custom URL */}
                    <div className="flex items-center gap-2 flex-1 w-full md:w-auto min-w-0">
                        <div className="relative flex-1 min-w-0">
                            <input
                                type="text"
                                placeholder="https://example.com/ips.csv"
                                className="w-full bg-surface border border-outline/10 rounded-lg px-2.5 py-1 text-[10px] focus:outline-none focus:border-secondary transition-all h-7"
                                id="custom-ip-url"
                            />
                        </div>
                        <button
                            onClick={async () => {
                                const url = (document.getElementById('custom-ip-url') as HTMLInputElement).value;
                                if (!url) return alert('Please enter a URL');
                                setImportingIpRanges(true);
                                try {
                                    console.log(`Fetching custom IP ranges from ${url}...`);
                                    const res = await DockerClient.fetchIpRanges('custom', url) as any;

                                    if (res && res.status === 'success') {
                                        alert(`Successfully fetched ${res.imported} ranges!`);
                                        fetchStats();
                                    } else {
                                        const errorMsg = res ? (res.error || res.message) : 'Unknown error';
                                        alert(`Failed to fetch custom ranges: ${errorMsg}`);
                                    }
                                } catch (e: any) {
                                    console.error(e);
                                    alert(`Error fetching custom ranges: ${e.message || e}`);
                                } finally {
                                    setImportingIpRanges(false);
                                }
                            }}
                            disabled={importingIpRanges}
                            className="px-3 py-1 bg-secondary text-on-secondary rounded-lg text-[10px] font-bold hover:opacity-90 active:scale-95 disabled:opacity-50 h-7 whitespace-nowrap"
                        >
                            Fetch
                        </button>
                    </div>
                </div>
            </div>

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

            {/* Compact List */}
            <div className="flex flex-col gap-2">
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-bold text-on-surface-variant/50 uppercase tracking-wider">
                    <div className="col-span-3">IP Address</div>
                    <div className="col-span-2">Country</div>
                    <div className="col-span-2 text-center">Blocked</div>
                    <div className="col-span-3">Last Activity</div>
                    <div className="col-span-2 text-right">Actions</div>
                </div>

                {reputations.length === 0 && !isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant/40 border-2 border-dashed border-outline/10 rounded-3xl bg-surface/10">
                        <Globe size={48} className="mb-4 opacity-50" />
                        <span className="text-lg font-bold">No reputation records found</span>
                        <span className="text-sm">IPs will appear here when activity or blocks are recorded.</span>
                    </div>
                ) : (
                    reputations.map((rep) => (
                        <div key={rep.ip} className="group bg-surface hover:bg-surface-variant/5 border border-outline/10 rounded-xl p-3 transition-all hover:border-primary/20 shadow-sm">
                            <div className="grid grid-cols-12 gap-4 items-center">
                                {/* IP & Risk */}
                                <div className="col-span-3 flex items-center gap-3">
                                    <div className={`p-1.5 rounded-lg ${rep.blockedTimes > 0 ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                                        {rep.blockedTimes > 0 ? <Shield size={14} /> : <Activity size={14} />}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-mono text-sm font-bold text-on-surface">{rep.ip}</span>
                                        {rep.reasons && rep.reasons.length > 0 && (
                                            <span className="text-[10px] text-on-surface-variant/70 truncate max-w-[150px]" title={rep.reasons.join(', ')}>
                                                {rep.reasons[0]} {rep.reasons.length > 1 && `+${rep.reasons.length - 1}`}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Country */}
                                <div className="col-span-2">
                                    {rep.country ? (
                                        <div className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
                                            <MapPin size={12} className="opacity-70" />
                                            {rep.country}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-on-surface-variant/30 italic">Unknown</span>
                                    )}
                                </div>

                                {/* Compacter Block Stats */}
                                <div className="col-span-2 text-center">
                                    <div className="inline-flex flex-col items-center">
                                        <span className={`text-sm font-black ${rep.blockedTimes > 0 ? 'text-red-500' : 'text-on-surface-variant/50'}`}>
                                            {rep.blockedTimes}
                                        </span>
                                        <span className="text-[9px] font-bold text-on-surface-variant/40 uppercase">Blocks</span>
                                    </div>
                                </div>

                                {/* Activity Times */}
                                <div className="col-span-3 flex flex-col justify-center text-[10px] text-on-surface-variant/70 gap-0.5">
                                    <div className="flex items-center gap-1.5">
                                        <Activity size={10} />
                                        <span>Active: {new Date(rep.lastActivity).toLocaleString()}</span>
                                    </div>
                                    {rep.lastBlocked && (
                                        <div className="flex items-center gap-1.5 text-red-400/80">
                                            <Shield size={10} />
                                            <span>Blocked: {new Date(rep.lastBlocked).toLocaleString()}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="col-span-2 flex justify-end">
                                    <button
                                        onClick={() => handleDelete(rep.ip)}
                                        className="p-1.5 rounded-lg text-on-surface-variant/50 hover:bg-red-500/10 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                        title="Delete Record"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
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

            {/* IP Import Modal */}
            {showIpImportModal && (
                <Modal
                    onClose={() => setShowIpImportModal(false)}
                    title="Import IP Range Data"
                    description="CSV: cidr, country_code, country_name, provider, type"
                    icon={<Globe size={24} />}
                    maxWidth="max-w-2xl"
                    className="flex flex-col"
                >
                    <div className="flex-1 overflow-y-auto mt-4 pr-2 custom-scrollbar">
                        <div className="mb-4">
                            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                                CSV Content (One range per line)
                            </label>
                            <textarea
                                className="w-full h-80 bg-on-surface/5 border border-outline/10 rounded-2xl p-4 text-sm font-mono focus:outline-none focus:border-secondary/50 focus:bg-on-surface/[0.08] transition-all resize-none"
                                placeholder="8.8.8.0/24, US, United States, Google, hosting&#10;1.1.1.0/24, AU, Australia, Cloudflare, hosting"
                                value={ipCsv}
                                onChange={(e) => setIpCsv(e.target.value)}
                            />
                        </div>

                        <div className="flex items-center gap-3 bg-secondary/5 p-4 rounded-2xl border border-secondary/10 mb-6 text-on-surface-variant">
                            <Info size={20} className="text-secondary shrink-0" />
                            <p className="text-xs leading-relaxed">
                                IPv4 and IPv6 CIDR notations are supported. The system will skip empty or invalid lines. Large imports may take a moment.
                            </p>
                        </div>

                        <div className="flex items-center gap-3 pb-2">
                            <button
                                className="flex-1 bg-on-surface text-surface py-3.5 rounded-2xl font-bold text-sm hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                disabled={importingIpRanges || !ipCsv.trim()}
                                onClick={async () => {
                                    setImportingIpRanges(true);
                                    try {
                                        const res = await DockerClient.importIpRanges(ipCsv) as any;
                                        if (res.status === 'success') {
                                            alert(`Successfully imported ${res.imported} ranges!`);
                                            setShowIpImportModal(false);
                                            setIpCsv('');
                                            fetchStats();
                                        } else {
                                            alert(res.error || 'Failed to import ranges');
                                        }
                                    } catch (e) {
                                        console.error(e);
                                        alert('An error occurred during import');
                                    } finally {
                                        setImportingIpRanges(false);
                                    }
                                }}
                            >
                                {importingIpRanges ? (
                                    <RefreshCw size={18} className="animate-spin" />
                                ) : (
                                    <Save size={18} />
                                )}
                                <span>{importingIpRanges ? 'Importing...' : 'Confirm Import'}</span>
                            </button>
                            <button
                                className="px-6 py-3.5 bg-on-surface/5 text-on-surface rounded-2xl font-bold text-sm hover:bg-on-surface/10 transition-all"
                                onClick={() => setShowIpImportModal(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
