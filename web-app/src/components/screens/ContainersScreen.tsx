'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Search, RefreshCw, Trash2, Play, Square, Trash, Info, X, XCircle } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DockerContainer, ContainerDetails } from '@/lib/types';

export default function ContainersScreen() {
    const [containers, setContainers] = useState<DockerContainer[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [inspectingContainer, setInspectingContainer] = useState<ContainerDetails | null>(null);

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

    const handleInspect = async (id: string) => {
        setIsLoading(true);
        const details = await DockerClient.inspectContainer(id);
        setInspectingContainer(details);
        setIsLoading(false);
    };

    const filteredContainers = useMemo(() => {
        return containers.filter(c =>
            c.names.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.image.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [containers, searchQuery]);

    return (
        <div className="flex flex-col h-full relative">
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
                            onInspect={() => handleInspect(container.id)}
                        />
                    ))}
                </div>
            )}

            {inspectingContainer && (
                <InspectModal
                    details={inspectingContainer}
                    onClose={() => setInspectingContainer(null)}
                />
            )}
        </div>
    );
}

function InspectModal({ details, onClose }: { details: ContainerDetails; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-surface border border-outline/20 rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
                <div className="p-6 border-b border-outline/10 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold">{details.name}</h2>
                        <span className="text-xs text-on-surface-variant font-mono">{details.id}</span>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <XCircle size={24} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    <div className="grid grid-cols-2 gap-4">
                        <DetailItem label="Status" value={details.status} />
                        <DetailItem label="Image" value={details.image} />
                        <DetailItem label="Platform" value={details.platform} />
                        <DetailItem label="Created" value={details.createdAt} />
                    </div>

                    <div>
                        <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                            Environment Variables
                        </h3>
                        <div className="bg-black/20 rounded-xl p-4 font-mono text-sm space-y-1 overflow-x-auto">
                            {details.env.map((e: string, i: number) => (
                                <div key={i} className="text-green-400/80">{e}</div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h3 className="text-lg font-bold mb-3">Mounts</h3>
                        <div className="space-y-3">
                            {details.mounts.map((m: any, i: number) => (
                                <div key={i} className="bg-white/5 border border-white/5 rounded-xl p-4">
                                    <div className="text-xs text-on-surface-variant uppercase font-bold mb-1">{m.type}</div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <div className="text-[10px] text-on-surface-variant">Source</div>
                                            <div className="text-sm font-mono break-all">{m.source}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-on-surface-variant">Destination</div>
                                            <div className="text-sm font-mono break-all">{m.destination}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function DetailItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-white/5 rounded-xl p-4">
            <div className="text-xs text-on-surface-variant uppercase font-bold mb-1">{label}</div>
            <div className="text-sm truncate" title={value}>{value}</div>
        </div>
    );
}


function ContainerCard({ container, onAction, onInspect }: {
    container: DockerContainer;
    onAction: (action: () => Promise<void>) => Promise<void>;
    onInspect: () => void;
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
                <button
                    onClick={onInspect}
                    className="p-2 hover:bg-white/10 text-on-surface-variant hover:text-primary rounded-lg transition-colors"
                    title="Inspect"
                >
                    <Info size={20} />
                </button>
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

