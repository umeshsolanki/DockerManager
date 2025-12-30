'use client';

import React, { useEffect, useState } from 'react';
import { Shield, ShieldAlert, ShieldCheck, Trash2, Plus, Search, RefreshCw, Globe, Lock } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { FirewallRule, BlockIPRequest } from '@/lib/types';
import { toast } from 'sonner';

export default function FirewallScreen() {
    const [rules, setRules] = useState<FirewallRule[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const fetchRules = async () => {
        setIsLoading(true);
        const data = await DockerClient.listFirewallRules();
        setRules(data);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchRules();
    }, []);

    const handleDelete = async (id: string) => {
        if (confirm('Are you sure you want to unblock this IP?')) {
            const success = await DockerClient.unblockIP(id);
            if (success) {
                toast.success('IP Unblocked successfully');
                fetchRules();
            } else {
                toast.error('Failed to unblock IP');
            }
        }
    };

    const filteredRules = rules.filter(r =>
        r.ip.includes(searchQuery) ||
        (r.comment?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
    );

    return (
        <div className="flex flex-col h-full relative">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-bold">Firewall</h1>
                    {isLoading && <RefreshCw className="animate-spin text-primary" size={24} />}
                </div>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-xl hover:opacity-90 transition-opacity"
                >
                    <Plus size={20} />
                    <span>Block IP</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-surface border border-outline/10 rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <Shield size={24} />
                    </div>
                    <div>
                        <div className="text-2xl font-bold">{rules.length}</div>
                        <div className="text-xs text-on-surface-variant uppercase font-bold tracking-wider">Active Blocks</div>
                    </div>
                </div>
                <div className="bg-surface border border-outline/10 rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                        <ShieldAlert size={24} />
                    </div>
                    <div>
                        <div className="text-2xl font-bold">{rules.filter(r => r.port === '22').length}</div>
                        <div className="text-xs text-on-surface-variant uppercase font-bold tracking-wider">SSH Specific</div>
                    </div>
                </div>
                <div className="bg-surface border border-outline/10 rounded-2xl p-4 flex items-center gap-4 relative overflow-hidden group">
                    <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500">
                        <ShieldCheck size={24} />
                    </div>
                    <div>
                        <div className="text-2xl font-bold">Active</div>
                        <div className="text-xs text-on-surface-variant uppercase font-bold tracking-wider">Status</div>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
                    <input
                        type="text"
                        placeholder="Search IP or comment..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-surface border border-outline/20 rounded-xl py-2 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
                <button
                    onClick={fetchRules}
                    className="p-2 bg-surface border border-outline/20 rounded-xl hover:bg-white/5 transition-colors"
                >
                    <RefreshCw size={20} />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRules.map(rule => (
                    <div key={rule.id} className="bg-surface/50 border border-outline/10 rounded-2xl p-4 hover:border-primary/30 transition-all group">
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-on-surface-variant group-hover:text-primary transition-colors">
                                    <Globe size={20} />
                                </div>
                                <div>
                                    <div className="font-mono font-bold text-lg">{rule.ip}</div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold uppercase tracking-wider">
                                            {rule.port ? `Port ${rule.port}` : 'All Ports'}
                                        </span>
                                        <span className="text-[10px] text-on-surface-variant">
                                            {new Date(rule.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => handleDelete(rule.id)}
                                className="p-2 text-on-surface-variant hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                        {rule.comment && (
                            <div className="text-sm text-on-surface-variant italic bg-black/20 p-2 rounded-xl mt-2 line-clamp-2">
                                "{rule.comment}"
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {filteredRules.length === 0 && !isLoading && (
                <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant py-20">
                    <Shield size={64} className="mb-4 opacity-10" />
                    <p className="text-lg italic">No active firewall rules found</p>
                </div>
            )}

            {isAddModalOpen && (
                <AddBlockModal
                    onClose={() => setIsAddModalOpen(false)}
                    onAdded={() => { setIsAddModalOpen(false); fetchRules(); }}
                />
            )}
        </div>
    );
}

function AddBlockModal({ onClose, onAdded }: { onClose: () => void, onAdded: () => void }) {
    const [ip, setIp] = useState('');
    const [port, setPort] = useState('');
    const [comment, setComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!ip) return;

        setIsSubmitting(true);
        const success = await DockerClient.blockIP({
            ip,
            port: port || undefined,
            comment: comment || undefined,
            protocol: 'TCP'
        });

        if (success) {
            toast.success(`IP ${ip} blocked successfully`);
            onAdded();
        } else {
            toast.error('Failed to block IP. Ensure container has NET_ADMIN capability.');
        }
        setIsSubmitting(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-surface border border-outline/20 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b border-outline/10 flex items-center justify-between bg-primary/5">
                    <div className="flex items-center gap-3">
                        <Lock className="text-primary" size={24} />
                        <h2 className="text-xl font-bold">Block IP Address</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <Plus size={24} className="rotate-45" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1.5 ml-1">IP Address</label>
                        <input
                            autoFocus
                            required
                            type="text"
                            placeholder="e.g. 1.2.3.4"
                            value={ip}
                            onChange={(e) => setIp(e.target.value)}
                            className="w-full bg-white/5 border border-outline/20 rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary transition-all font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1.5 ml-1">Port (Optional)</label>
                        <input
                            type="text"
                            placeholder="e.g. 22 or 8080 (Leave empty for all ports)"
                            value={port}
                            onChange={(e) => setPort(e.target.value)}
                            className="w-full bg-white/5 border border-outline/20 rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary transition-all font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1.5 ml-1">Comment</label>
                        <textarea
                            placeholder="Reason for blocking..."
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="w-full bg-white/5 border border-outline/20 rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary transition-all min-h-[80px] resize-none"
                        />
                    </div>

                    <div className="pt-2 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 rounded-xl border border-outline/20 hover:bg-white/5 transition-all font-bold"
                        >
                            Cancel
                        </button>
                        <button
                            disabled={isSubmitting || !ip}
                            type="submit"
                            className="flex-1 bg-primary text-on-primary px-4 py-2.5 rounded-xl font-bold hover:opacity-90 transition-all disabled:opacity-50"
                        >
                            {isSubmitting ? 'Blocking...' : 'Block IP'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
