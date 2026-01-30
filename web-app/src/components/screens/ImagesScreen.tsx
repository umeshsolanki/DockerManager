'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { RefreshCw, Download, Trash, Database } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DockerImage } from '@/lib/types';
import { SearchInput } from '../ui/SearchInput';
import { ActionIconButton, Button } from '../ui/Buttons';

export default function ImagesScreen() {
    const [images, setImages] = useState<DockerImage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [pullingImage, setPullingImage] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBatchDeleting, setIsBatchDeleting] = useState(false);
    const [forceDelete, setForceDelete] = useState(false);

    const fetchImages = async () => {
        setIsLoading(true);
        const data = await DockerClient.listImages();
        setImages(data);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchImages();
    }, []);

    const handlePull = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pullingImage) return;
        setIsLoading(true);
        await DockerClient.pullImage(pullingImage);
        setPullingImage('');
        // Wait a bit before fetching to let the pull start
        setTimeout(() => fetchImages(), 1000);
    };

    const handleRemove = async (id: string, force = forceDelete) => {
        if (!confirm(`Are you sure you want to remove this image${force ? ' (FORCED)' : ''}?`)) return;
        setIsLoading(true);
        await DockerClient.removeImage(id, force);
        await fetchImages();
    };

    const handleBatchRemove = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Are you sure you want to remove ${selectedIds.size} images${forceDelete ? ' (FORCED)' : ''}?`)) return;

        setIsBatchDeleting(true);
        try {
            await DockerClient.removeImages(Array.from(selectedIds), forceDelete);
            setSelectedIds(new Set());
            await fetchImages();
        } finally {
            setIsBatchDeleting(false);
        }
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredImages.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredImages.map(img => img.id)));
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

    const handlePrune = async () => {
        if (!confirm('Are you sure you want to remove all dangling images?')) return;
        setIsLoading(true);
        await DockerClient.pruneImages();
        await fetchImages();
    };

    const filteredImages = useMemo(() => {
        return images.filter(img =>
            img.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
            img.id.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [images, searchQuery]);

    return (
        <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search images..."
                    className="flex-1 min-w-[200px]"
                />

                {/* Pull Image Form */}
                <form onSubmit={handlePull} className="flex gap-2 min-w-[300px]">
                    <input
                        type="text"
                        placeholder="Image name (e.g., nginx:latest)"
                        value={pullingImage}
                        onChange={(e) => setPullingImage(e.target.value)}
                        className="flex-1 bg-surface border border-outline/20 rounded-xl py-2 px-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                    <Button
                        type="submit"
                        disabled={isLoading || !pullingImage}
                        icon={<Download size={18} />}
                    >
                        Pull
                    </Button>
                </form>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    {isLoading && <RefreshCw className="animate-spin text-primary mr-2" size={20} />}

                    <div className="flex items-center gap-2 bg-surface/50 border border-outline/10 rounded-xl p-1 px-2">
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={forceDelete}
                                onChange={(e) => setForceDelete(e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-outline/30 bg-surface text-primary focus:ring-primary/20"
                            />
                            <span className="text-[10px] font-bold text-on-surface-variant group-hover:text-red-400 transition-colors uppercase tracking-wider">Force</span>
                        </label>
                    </div>

                    {selectedIds.size > 0 && (
                        <Button
                            onClick={handleBatchRemove}
                            variant="danger"
                            disabled={isLoading || isBatchDeleting}
                            icon={<Trash size={16} />}
                            className="bg-red-500/20 hover:bg-red-500/30 text-red-500 border-red-500/20"
                        >
                            Delete ({selectedIds.size})
                        </Button>
                    )}

                    <ActionIconButton
                        onClick={handlePrune}
                        icon={<Trash />}
                        color="red"
                        title="Prune Dangling"
                    />
                    <ActionIconButton
                        onClick={fetchImages}
                        icon={<RefreshCw />}
                        title="Refresh"
                    />
                </div>
            </div>

            {filteredImages.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-on-surface-variant">
                    No images found
                </div>
            ) : (
                <div className="bg-surface/30 border border-outline/10 rounded-xl overflow-hidden">
                    <div className="bg-surface/50 p-2 px-3 flex items-center justify-between border-b border-outline/10">
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                checked={filteredImages.length > 0 && selectedIds.size === filteredImages.length}
                                onChange={toggleSelectAll}
                                className="w-4 h-4 rounded border-outline/30 bg-surface text-primary focus:ring-primary/20 cursor-pointer"
                            />
                            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Images ({filteredImages.length})</span>
                        </div>
                        <div className="flex items-center gap-8 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest px-12">
                            <span>Size</span>
                            <span className="w-24">ID</span>
                        </div>
                    </div>
                    <div className="divide-y divide-outline/5">
                        {filteredImages.map(image => (
                            <div key={image.id} className={`p-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors group ${selectedIds.has(image.id) ? 'bg-primary/[0.03]' : ''}`}>
                                <div className="flex items-center gap-3 min-w-0">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(image.id)}
                                        onChange={() => toggleSelect(image.id)}
                                        className="w-4 h-4 rounded border-outline/30 bg-surface text-primary focus:ring-primary/20 cursor-pointer"
                                    />
                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                        <Database size={16} className="text-primary" />
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-sm font-bold truncate text-on-surface" title={image.tags?.join(', ')}>
                                            {image.tags?.[0] || '<none>:<none>'}
                                            {image.tags && image.tags.length > 1 && (
                                                <span className="ml-2 text-[10px] text-on-surface-variant font-normal">+{image.tags.length - 1} more</span>
                                            )}
                                        </span>
                                        <span className="text-[9px] text-on-surface-variant/60 font-medium uppercase tracking-tight truncate">
                                            {image.tags?.slice(1).join(' • ') || 'Untagged Image'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-8 text-[10px] text-on-surface-variant font-mono mr-4">
                                        <span className="w-12 text-right">{(image.size / (1024 * 1024)).toFixed(1)} MB</span>
                                        <span className="w-24 opacity-60">{image.id.substring(7, 19)}</span>
                                    </div>

                                    <button
                                        onClick={() => handleRemove(image.id)}
                                        className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-red-400 rounded-lg transition-all"
                                        title="Remove Image"
                                    >
                                        <Trash size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
