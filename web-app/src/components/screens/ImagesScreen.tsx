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

    const handleRemove = async (id: string) => {
        setIsLoading(true);
        await DockerClient.removeImage(id);
        await fetchImages();
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
                <div className="bg-surface/30 border border-outline/10 rounded-xl divide-y divide-outline/5">
                    {filteredImages.map(image => (
                        <div key={image.id} className="p-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors group">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <Database size={16} className="text-primary" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-sm font-bold truncate text-on-surface" title={image.tags?.join(', ')}>
                                        {image.tags?.[0] || image.id.substring(0, 12)}
                                        {image.tags && image.tags.length > 1 && (
                                            <span className="ml-2 text-[10px] text-on-surface-variant font-normal">+{image.tags.length - 1} more</span>
                                        )}
                                    </span>
                                    <div className="flex items-center gap-2 text-[10px] text-on-surface-variant font-mono">
                                        <span>{(image.size / (1024 * 1024)).toFixed(1)} MB</span>
                                        <span className="opacity-30">•</span>
                                        <span>{image.id.substring(0, 12)}</span>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => handleRemove(image.id)}
                                className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-red-400 rounded-lg transition-all"
                                title="Remove Image"
                            >
                                <Trash size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
