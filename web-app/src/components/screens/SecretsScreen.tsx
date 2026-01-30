'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { RefreshCw, Lock, Trash2, Plus, X, Key } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DockerSecret } from '@/lib/types';
import { SearchInput } from '../ui/SearchInput';
import { ActionIconButton, Button } from '../ui/Buttons';

export default function SecretsScreen() {
    const [secrets, setSecrets] = useState<DockerSecret[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newData, setNewData] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBatchDeleting, setIsBatchDeleting] = useState(false);

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
        if (!confirm('Are you sure you want to remove this secret?')) return;
        setIsLoading(true);
        await DockerClient.removeSecret(id);
        await fetchSecrets();
    };

    const handleBatchRemove = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Are you sure you want to remove ${selectedIds.size} secrets?`)) return;

        setIsBatchDeleting(true);
        try {
            await DockerClient.removeSecrets(Array.from(selectedIds));
            setSelectedIds(new Set());
            await fetchSecrets();
        } finally {
            setIsBatchDeleting(false);
        }
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredSecrets.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredSecrets.map(s => s.id)));
        }
    };

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setSelectedIds(next);
    };

    const filteredSecrets = useMemo(() => {
        return secrets.filter(s =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.id.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [secrets, searchQuery]);

    return (
        <div className="flex flex-col relative">
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search secrets..."
                    className="flex-1 min-w-[200px]"
                />

                {/* Actions */}
                <div className="flex items-center gap-2">
                    {isLoading && <RefreshCw className="animate-spin text-primary mr-2" size={20} />}

                    {selectedIds.size > 0 && (
                        <Button
                            onClick={handleBatchRemove}
                            variant="danger"
                            disabled={isLoading || isBatchDeleting}
                            icon={<Trash2 size={16} />}
                            className="bg-red-500/20 hover:bg-red-500/30 text-red-500 border-red-500/20"
                        >
                            Delete ({selectedIds.size})
                        </Button>
                    )}

                    <Button
                        onClick={() => setIsCreateOpen(true)}
                        icon={<Plus size={18} />}
                    >
                        New Secret
                    </Button>
                    <ActionIconButton
                        onClick={fetchSecrets}
                        icon={<RefreshCw />}
                        title="Refresh"
                    />
                </div>
            </div>

            {filteredSecrets.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-on-surface-variant flex-col gap-4">
                    <Lock size={48} className="opacity-20" />
                    <span>No secrets found</span>
                </div>
            ) : (
                <div className="bg-surface/30 border border-outline/10 rounded-xl overflow-hidden transition-all">
                    <div className="bg-surface/50 p-2 px-3 flex items-center justify-between border-b border-outline/10">
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                checked={filteredSecrets.length > 0 && selectedIds.size === filteredSecrets.length}
                                onChange={toggleSelectAll}
                                className="w-4 h-4 rounded border-outline/30 bg-surface text-primary focus:ring-primary/20 cursor-pointer"
                            />
                            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Secrets ({filteredSecrets.length})</span>
                        </div>
                    </div>
                    <div className="flex flex-col p-2 gap-2">
                        {filteredSecrets.map(secret => (
                            <SecretCard
                                key={secret.id}
                                secret={secret}
                                onRemove={handleRemove}
                                isSelected={selectedIds.has(secret.id)}
                                onSelect={() => toggleSelect(secret.id)}
                            />
                        ))}
                    </div>
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

function SecretCard({ secret, onRemove, isSelected, onSelect }: {
    secret: DockerSecret;
    onRemove: (id: string) => Promise<void>;
    isSelected: boolean;
    onSelect: () => void;
}) {
    return (
        <div className={`bg-surface/50 border border-outline/10 rounded-xl p-3 flex items-center justify-between hover:bg-surface transition-colors ${isSelected ? 'bg-primary/10 border-primary/30' : ''}`} onClick={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            onSelect();
        }}>
            <div className="flex items-center gap-4 flex-1 overflow-hidden">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={onSelect}
                    className="w-4 h-4 rounded border-outline/30 bg-surface text-primary focus:ring-primary/20 cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                />
                <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary shrink-0">
                    <Key size={18} />
                </div>
                <div className="flex flex-col overflow-hidden">
                    <span className="text-md font-bold text-on-surface truncate">{secret.name}</span>
                    <div className="flex items-center gap-1.5 text-on-surface-variant font-mono text-[10px]">
                        <span>ID: {secret.id.substring(0, 12)}</span>
                        <span className="opacity-20">•</span>
                        <span>Created: {new Date(secret.createdAt).toLocaleDateString()}</span>
                    </div>
                </div>
            </div>

            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove(secret.id);
                }}
                className="p-2 hover:bg-red-500/10 text-red-500 rounded-xl transition-colors"
                title="Remove Secret"
            >
                <Trash2 size={20} />
            </button>
        </div>
    );
}
