'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Search, RefreshCw, Lock, Trash2, Plus, X, Key } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DockerSecret } from '@/lib/types';

export default function SecretsScreen() {
    const [secrets, setSecrets] = useState<DockerSecret[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newData, setNewData] = useState('');

    const fetchSecrets = async () => {
        setIsLoading(true);
        const data = await DockerClient.listSecrets();
        setSecrets(data);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchSecrets();
    }, []);

    const handleCreate = async () => {
        if (!newName.trim() || !newData.trim()) return;
        setIsLoading(true);
        await DockerClient.createSecret(newName, newData);
        setNewName('');
        setNewData('');
        setIsCreateOpen(false);
        await fetchSecrets();
    };

    const handleRemove = async (id: string) => {
        setIsLoading(true);
        await DockerClient.removeSecret(id);
        await fetchSecrets();
    };

    const filteredSecrets = useMemo(() => {
        return secrets.filter(s =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.id.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [secrets, searchQuery]);

    return (
        <div className="flex flex-col relative">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-bold">Secrets</h1>
                    {isLoading && <RefreshCw className="animate-spin text-primary" size={24} />}
                </div>
                <button
                    onClick={() => setIsCreateOpen(true)}
                    className="flex items-center gap-2 bg-primary text-primary-foreground font-bold px-6 py-3 rounded-xl hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-primary/20"
                >
                    <Plus size={20} />
                    <span>Create Secret</span>
                </button>
            </div>

            <div className="flex items-center gap-4 mb-5">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
                    <input
                        type="text"
                        placeholder="Search secrets..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-surface border border-outline/20 rounded-xl py-3 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
                <button
                    onClick={fetchSecrets}
                    className="p-3 bg-surface border border-outline/20 rounded-xl hover:bg-white/5 transition-colors"
                    title="Refresh"
                >
                    <RefreshCw size={20} />
                </button>
            </div>

            {filteredSecrets.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-on-surface-variant flex-col gap-4">
                    <Lock size={48} className="opacity-20" />
                    <span>No secrets found</span>
                </div>
            ) : (
                <div className="flex flex-col gap-3 pb-6">
                    {filteredSecrets.map(secret => (
                        <SecretCard
                            key={secret.id}
                            secret={secret}
                            onRemove={handleRemove}
                        />
                    ))}
                </div>
            )}

            {/* Create Secret Side Panel */}
            {isCreateOpen && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsCreateOpen(false)} />
                    <div className="relative w-full max-w-md bg-surface border-l border-outline/10 h-full p-8 shadow-2xl animate-in slide-in-from-right duration-300">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-2xl font-bold">New Secret</h2>
                            <button onClick={() => setIsCreateOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-on-surface/80">Secret Name</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="e.g., db_password"
                                    className="w-full bg-background border border-outline/20 rounded-xl py-3 px-4 text-on-surface focus:outline-none focus:border-primary transition-colors"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-on-surface/80">Secret Data</label>
                                <textarea
                                    value={newData}
                                    onChange={(e) => setNewData(e.target.value)}
                                    placeholder="Paste your secret content here..."
                                    rows={8}
                                    className="w-full bg-background border border-outline/20 rounded-xl py-3 px-4 text-on-surface focus:outline-none focus:border-primary transition-colors resize-none font-mono text-sm"
                                />
                                <p className="text-[10px] text-on-surface-variant italic">
                                    The data will be Base64 encoded before being sent to the server.
                                </p>
                            </div>

                            <button
                                onClick={handleCreate}
                                disabled={!newName.trim() || !newData.trim()}
                                className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-xl hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 disabled:scale-100 shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                            >
                                <Lock size={20} />
                                <span>Save Secret</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SecretCard({ secret, onRemove }: {
    secret: DockerSecret;
    onRemove: (id: string) => Promise<void>;
}) {
    return (
        <div className="bg-surface/50 border border-outline/10 rounded-xl p-4 flex items-center justify-between hover:bg-surface transition-colors">
            <div className="flex items-center gap-4 flex-1 overflow-hidden">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                    <Key size={20} />
                </div>
                <div className="flex flex-col overflow-hidden">
                    <span className="text-lg font-medium text-on-surface truncate">{secret.name}</span>
                    <div className="flex items-center gap-1.5 text-on-surface-variant font-mono text-[10px]">
                        <span>ID: {secret.id.substring(0, 12)}</span>
                        <span className="opacity-20">•</span>
                        <span>Created: {new Date(secret.createdAt).toLocaleDateString()}</span>
                    </div>
                </div>
            </div>

            <button
                onClick={() => onRemove(secret.id)}
                className="p-3 hover:bg-red-500/10 text-red-500 rounded-xl transition-colors"
                title="Remove Secret"
            >
                <Trash2 size={22} />
            </button>
        </div>
    );
}
