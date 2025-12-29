'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Search, RefreshCw, Download, Trash, Info } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DockerImage } from '@/lib/types';

export default function ImagesScreen() {
    const [images, setImages] = useState<DockerImage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [pullQuery, setPullQuery] = useState('');

    const fetchImages = async () => {
        setIsLoading(true);
        const data = await DockerClient.listImages();
        setImages(data);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchImages();
    }, []);

    const handlePull = async () => {
        if (!pullQuery.trim()) return;
        setIsLoading(true);
        await DockerClient.pullImage(pullQuery);
        setPullQuery('');
        await fetchImages();
    };

    const handleRemove = async (id: string) => {
        setIsLoading(true);
        await DockerClient.removeImage(id);
        await fetchImages();
    };

    const filteredImages = useMemo(() => {
        return images.filter(img => {
            const tags = img.tags?.join(', ') || '';
            return tags.toLowerCase().includes(searchQuery.toLowerCase()) ||
                img.id.toLowerCase().includes(searchQuery.toLowerCase());
        });
    }, [images, searchQuery]);

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-4 mb-8">
                <h1 className="text-4xl font-bold">Images</h1>
                {isLoading && <RefreshCw className="animate-spin text-primary" size={24} />}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {/* Pull Controls */}
                <div className="flex bg-surface/50 border border-outline/10 rounded-2xl p-4 gap-3 items-center">
                    <div className="relative flex-1">
                        <Download className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
                        <input
                            type="text"
                            placeholder="Image (e.g. nginx)"
                            value={pullQuery}
                            onChange={(e) => setPullQuery(e.target.value)}
                            className="w-full bg-surface/50 border border-outline/20 rounded-xl py-2 pl-9 pr-4 text-on-surface text-sm focus:outline-none focus:border-primary transition-colors"
                        />
                    </div>
                    <button
                        onClick={handlePull}
                        className="bg-primary text-primary-foreground font-semibold px-4 py-2 rounded-xl text-sm hover:opacity-90 transition-opacity"
                    >
                        Pull
                    </button>
                </div>

                {/* Search & Refresh */}
                <div className="flex gap-3 items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
                        <input
                            type="text"
                            placeholder="Search images..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-surface border border-outline/20 rounded-xl py-2 pl-9 pr-4 text-on-surface text-sm focus:outline-none focus:border-primary transition-colors"
                        />
                    </div>
                    <button
                        onClick={fetchImages}
                        className="p-2.5 bg-surface border border-outline/20 rounded-xl hover:bg-white/5 transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw size={18} />
                    </button>
                </div>
            </div>

            {filteredImages.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-on-surface-variant">
                    No images found
                </div>
            ) : (
                <div className="flex flex-col gap-3 overflow-y-auto pb-8">
                    {filteredImages.map(image => (
                        <ImageCard
                            key={image.id}
                            image={image}
                            onRemove={handleRemove}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function ImageCard({ image, onRemove }: {
    image: DockerImage;
    onRemove: (id: string) => Promise<void>;
}) {
    const tags = image.tags?.join(', ') || `ID: ${image.id.substring(0, 12)}`;
    const sizeMB = (image.size / (1024 * 1024)).toFixed(2);

    return (
        <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 flex items-center justify-between hover:bg-surface transition-colors">
            <div className="flex flex-col gap-1">
                <span className="text-lg font-medium text-on-surface truncate max-w-md">{tags}</span>
                <div className="flex items-center gap-2 text-on-surface-variant">
                    <Info size={14} />
                    <span className="text-xs">Size: {sizeMB} MB</span>
                </div>
            </div>

            <button
                onClick={() => onRemove(image.id)}
                className="p-2 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"
                title="Remove"
            >
                <Trash size={20} />
            </button>
        </div>
    );
}
