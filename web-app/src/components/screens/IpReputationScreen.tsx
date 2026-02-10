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
        <div className="flex flex-col gap-6 pb-10 max-w-[1600px] mx-auto">
            {/* Header */}
            <header className="flex items-center justify-between p-6 bg-white/[0.02] border border-white/5 rounded-3xl backdrop-blur-xl shadow-2xl">
                <div className="flex items-center gap-4">
                    <div className="p-4 bg-gradient-to-br from-primary/20 to-primary/5 rounded-2xl border border-primary/20 shadow-lg">
                        <Globe className="text-primary" size={32} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black tracking-tight">IP Reputation</h1>
                        <p className="text-sm text-on-surface-variant/60 font-medium mt-1">
                            Monitor and manage IP reputation based on activity and block history.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchReputations}
                        disabled={isLoading}
                        className="p-3 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 hover:border-primary/30 transition-all text-on-surface-variant hover:text-primary active:scale-95 disabled:opacity-50 shadow-lg hover:shadow-primary/20"
                        title="Refresh"
                    >
                        <RefreshCw size={20} strokeWidth={2.5} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </header>


            {/* IP Geolocation Settings */}
            <div className="bg-white/[0.02] border border-white/5 rounded-3xl shadow-2xl backdrop-blur-xl overflow-hidden">
                {/* Header Row */}
                <div className="flex flex-col md:flex-row md:items-center justify-between p-6 gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-br from-secondary/20 to-secondary/5 rounded-2xl border border-secondary/20 shadow-lg">
                            <Globe size={24} strokeWidth={2.5} className="text-secondary" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-on-surface flex items-center gap-3">
                                IP Geolocation Data
                                <span className="px-3 py-1 rounded-xl bg-secondary/10 border border-secondary/20 text-xs text-secondary font-bold">
                                    {ipRangesCount.toLocaleString()} Ranges
                                </span>
                            </h2>
                            <p className="text-xs text-on-surface-variant/60 font-medium mt-1">Manage IP range databases for country/ISP identification</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            className="flex items-center gap-2 px-4 py-2.5 bg-secondary/10 hover:bg-secondary/20 border border-secondary/20 rounded-2xl text-sm font-bold transition-all active:scale-95 text-secondary shadow-lg hover:shadow-secondary/20"
                            onClick={() => setShowIpImportModal(true)}
                        >
                            <Plus size={16} strokeWidth={2.5} />
                            <span>Import CSV</span>
                        </button>
                    </div>
                </div>

                {/* Actions Row */}
                <div className="bg-black/20 px-6 py-4 border-t border-white/5 flex flex-col md:flex-row items-center gap-4">
                    {/* Auto Fetchers */}
                    <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto no-scrollbar">
                        <span className="text-xs font-black text-on-surface-variant/70 uppercase tracking-widest whitespace-nowrap">Auto-Fetch:</span>
                        {[
                            { id: 'cloudflare', name: 'CF', full: 'Cloudflare', color: 'text-[#F38020] border-[#F38020]/30 hover:bg-[#F38020]/20' },
                            { id: 'aws', name: 'AWS', full: 'AWS', color: 'text-[#FF9900] border-[#FF9900]/30 hover:bg-[#FF9900]/20' },
                            { id: 'google', name: 'GCP', full: 'Google', color: 'text-[#4285F4] border-[#4285F4]/30 hover:bg-[#4285F4]/20' },
                            { id: 'digitalocean', name: 'DO', full: 'DigitalOcean', color: 'text-[#0080FF] border-[#0080FF]/30 hover:bg-[#0080FF]/20' }
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
                                className={`px-4 py-2 rounded-xl border text-xs font-bold transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap shadow-md ${provider.color}`}
                                title={`Fetch ${provider.full} Ranges`}
                            >
                                {provider.name}
                            </button>
                        ))}
                    </div>

                    <div className="hidden md:block w-px h-6 bg-white/10"></div>

                    {/* Custom URL */}
                    <div className="flex items-center gap-2 flex-1 w-full md:w-auto min-w-0">
                        <div className="relative flex-1 min-w-0">
                            <input
                                type="text"
                                placeholder="https://example.com/ips.csv"
                                className="w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:border-secondary/50 focus:ring-2 focus:ring-secondary/20 transition-all font-medium placeholder:text-white/30"
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
                            className="px-5 py-2.5 bg-secondary text-on-secondary rounded-2xl text-sm font-bold hover:opacity-90 active:scale-95 disabled:opacity-50 whitespace-nowrap shadow-lg shadow-secondary/30"
                        >
                            Fetch
                        </button>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white/[0.02] p-5 rounded-3xl border border-white/5 backdrop-blur-xl shadow-xl">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50" size={20} strokeWidth={2.5} />
                    <input
                        type="text"
                        placeholder="Search IP, Country, Reason..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-2xl pl-12 pr-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all placeholder:text-white/30"
                    />
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-on-surface-variant/70 uppercase tracking-widest">Show:</span>
                    <select
                        value={limit}
                        onChange={(e) => setLimit(Number(e.target.value))}
                        className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
                    >
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={500}>500</option>
                    </select>
                </div>
            </div>

            {/* Compact List */}
            <div className="flex flex-col gap-3">
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs font-black text-on-surface-variant/60 uppercase tracking-widest bg-white/[0.02] border border-white/5 rounded-2xl">
                    <div className="col-span-3">IP Address</div>
                    <div className="col-span-2">Country</div>
                    <div className="col-span-2 text-center">Blocked</div>
                    <div className="col-span-3">Last Activity</div>
                    <div className="col-span-2 text-right">Actions</div>
                </div>

                {reputations.length === 0 && !isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 text-on-surface-variant/40 border-2 border-dashed border-white/10 rounded-3xl bg-white/[0.02]">
                        <Globe size={64} className="mb-4 opacity-30" strokeWidth={1.5} />
                        <span className="text-xl font-black">No reputation records found</span>
                        <span className="text-sm font-medium mt-1">IPs will appear here when activity or blocks are recorded.</span>
                    </div>
                ) : (
                    reputations.map((rep) => (
                        <div key={rep.ip} className="group bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 rounded-2xl p-4 transition-all hover:border-primary/30 shadow-lg hover:shadow-primary/10">
                            <div className="grid grid-cols-12 gap-4 items-center">
                                {/* IP & Risk */}
                                <div className="col-span-3 flex items-center gap-3">
                                    <div className={`p-2 rounded-xl border ${rep.blockedTimes > 0 ? 'bg-red-500/10 text-red-500 border-red-500/30' : 'bg-green-500/10 text-green-500 border-green-500/30'} shadow-md`}>
                                        {rep.blockedTimes > 0 ? <Shield size={16} strokeWidth={2.5} /> : <Activity size={16} strokeWidth={2.5} />}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-mono text-sm font-bold text-on-surface">{rep.ip}</span>
                                        {rep.reasons && rep.reasons.length > 0 && (
                                            <span className="text-[10px] text-on-surface-variant/70 truncate max-w-[150px] font-medium" title={rep.reasons.join(', ')}>
                                                {rep.reasons[0]} {rep.reasons.length > 1 && `+${rep.reasons.length - 1}`}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Country */}
                                <div className="col-span-2">
                                    {rep.country ? (
                                        <div className="flex items-center gap-2 text-sm font-bold text-on-surface-variant">
                                            <MapPin size={14} strokeWidth={2.5} className="opacity-70" />
                                            {rep.country}
                                        </div>
                                    ) : (
                                        <span className="text-sm text-on-surface-variant/30 italic font-medium">Unknown</span>
                                    )}
                                </div>

                                {/* Block Stats */}
                                <div className="col-span-2 text-center">
                                    <div className="inline-flex flex-col items-center">
                                        <span className={`text-lg font-black ${rep.blockedTimes > 0 ? 'text-red-500' : 'text-on-surface-variant/40'}`}>
                                            {rep.blockedTimes}
                                        </span>
                                        <span className="text-[9px] font-black text-on-surface-variant/50 uppercase tracking-wider">Blocks</span>
                                    </div>
                                </div>

                                {/* Activity Times */}
                                <div className="col-span-3 flex flex-col justify-center text-xs text-on-surface-variant/70 gap-1 font-medium">
                                    <div className="flex items-center gap-2">
                                        <Activity size={12} strokeWidth={2.5} />
                                        <span>Active: {new Date(rep.lastActivity).toLocaleString()}</span>
                                    </div>
                                    {rep.lastBlocked && (
                                        <div className="flex items-center gap-2 text-red-400/80">
                                            <Shield size={12} strokeWidth={2.5} />
                                            <span>Blocked: {new Date(rep.lastBlocked).toLocaleString()}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="col-span-2 flex justify-end">
                                    <button
                                        onClick={() => handleDelete(rep.ip)}
                                        className="p-2 rounded-xl text-on-surface-variant/50 hover:bg-red-500/20 hover:text-red-500 hover:border-red-500/30 transition-all opacity-0 group-hover:opacity-100 border border-transparent"
                                        title="Delete Record"
                                    >
                                        <Trash2 size={16} strokeWidth={2.5} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Pagination */}
            <div className="flex justify-center gap-3 py-4">
                <button
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    className="px-6 py-3 rounded-2xl bg-white/[0.02] border border-white/5 text-sm font-bold disabled:opacity-40 hover:bg-white/[0.05] hover:border-primary/30 transition-all shadow-lg disabled:cursor-not-allowed"
                >
                    Previous
                </button>
                <div className="px-6 py-3 bg-primary/10 border border-primary/20 rounded-2xl text-sm font-black flex items-center text-primary">
                    {offset} - {offset + limit}
                </div>
                <button
                    disabled={reputations.length < limit}
                    onClick={() => setOffset(offset + limit)}
                    className="px-6 py-3 rounded-2xl bg-white/[0.02] border border-white/5 text-sm font-bold disabled:opacity-40 hover:bg-white/[0.05] hover:border-primary/30 transition-all shadow-lg disabled:cursor-not-allowed"
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
