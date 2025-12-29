'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Search, RefreshCw, Trash2, Play, Square, Trash } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DockerContainer } from '@/lib/types';

export default function ContainersScreen() {
    const [containers, setContainers] = useState<DockerContainer[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchContainers = async () => {
        setIsLoading(true);
        const data = await DockerClient.listContainers();
        setContainers(data);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchContainers();
    }, []);

    const handleAction = async (action: () => Promise<void>) => {
        setIsLoading(true);
        await action();
        await fetchContainers();
    };

    const filteredContainers = useMemo(() => {
        return containers.filter(c =>
            c.names.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.image.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [containers, searchQuery]);

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-4 mb-8">
                <h1 className="text-4xl font-bold">Containers</h1>
                {isLoading && <RefreshCw className="animate-spin text-primary" size={24} />}
            </div>

            <div className="flex items-center gap-4 mb-8">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
                    <input
                        type="text"
                        placeholder="Search containers..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-surface border border-outline/20 rounded-xl py-3 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
                <button
                    onClick={fetchContainers}
                    className="p-3 bg-surface border border-outline/20 rounded-xl hover:bg-white/5 transition-colors"
                    title="Refresh"
                >
                    <RefreshCw size={20} />
                </button>
                <button
                    onClick={() => handleAction(() => DockerClient.pruneContainers())}
                    className="p-3 bg-surface border border-outline/20 rounded-xl hover:bg-red-500/10 text-red-400 transition-colors"
                    title="Prune"
                >
                    <Trash2 size={20} />
                </button>
            </div>

            {filteredContainers.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-on-surface-variant">
                    No containers found
                </div>
            ) : (
                <div className="flex flex-col gap-3 overflow-y-auto pb-8">
                    {filteredContainers.map(container => (
                        <ContainerCard
                            key={container.id}
                            container={container}
                            onAction={handleAction}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function ContainerCard({ container, onAction }: {
    container: DockerContainer;
    onAction: (action: () => Promise<void>) => Promise<void>;
}) {
    const isRunning = container.state.toLowerCase().includes('running');

    return (
        <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 flex items-center justify-between hover:bg-surface transition-colors">
            <div className="flex items-center gap-4 flex-1">
                <div className={`w-3 h-3 rounded-full ${isRunning ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-gray-500'}`} />
                <div className="flex flex-col">
                    <span className="text-lg font-medium text-on-surface">{container.names}</span>
                    <span className="text-sm text-on-surface-variant">{container.image}</span>
                    <span className={`text-[10px] font-bold uppercase mt-1 ${isRunning ? 'text-green-500/80' : 'text-on-surface-variant/60'}`}>
                        {container.status}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-2">
                {isRunning ? (
                    <button
                        onClick={() => onAction(() => DockerClient.stopContainer(container.id))}
                        className="p-2 hover:bg-red-500/10 text-red-400 rounded-lg transition-colors"
                        title="Stop"
                    >
                        <Square size={20} fill="currentColor" />
                    </button>
                ) : (
                    <button
                        onClick={() => onAction(() => DockerClient.startContainer(container.id))}
                        className="p-2 hover:bg-green-500/10 text-green-500 rounded-lg transition-colors"
                        title="Start"
                    >
                        <Play size={20} fill="currentColor" />
                    </button>
                )}
                <button
                    onClick={() => onAction(() => DockerClient.removeContainer(container.id))}
                    disabled={isRunning}
                    className={`p-2 rounded-lg transition-colors ${isRunning ? 'opacity-20 cursor-not-allowed' : 'hover:bg-red-500/10 text-red-500'}`}
                    title="Remove"
                >
                    <Trash size={20} />
                </button>
            </div>
        </div>
    );
}
