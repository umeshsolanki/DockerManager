'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Search, RefreshCw, Trash, Share2 } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DockerNetwork } from '@/lib/types';

export default function NetworksScreen() {
    const [networks, setNetworks] = useState<DockerNetwork[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchNetworks = async () => {
        setIsLoading(true);
        const data = await DockerClient.listNetworks();
        setNetworks(data);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchNetworks();
    }, []);

    const handleAction = async (action: () => Promise<void>) => {
        setIsLoading(true);
        await action();
        await fetchNetworks();
    };

    const filteredNetworks = useMemo(() => {
        return networks.filter(n =>
            n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            n.driver.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [networks, searchQuery]);

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-4 mb-8">
                <h1 className="text-4xl font-bold">Networks</h1>
                {isLoading && <RefreshCw className="animate-spin text-primary" size={24} />}
            </div>

            <div className="flex items-center gap-4 mb-8">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
                    <input
                        type="text"
                        placeholder="Search networks..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-surface border border-outline/20 rounded-xl py-3 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
                <button
                    onClick={fetchNetworks}
                    className="p-3 bg-surface border border-outline/20 rounded-xl hover:bg-white/5 transition-colors"
                    title="Refresh"
                >
                    <RefreshCw size={20} />
                </button>
            </div>

            {filteredNetworks.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-on-surface-variant">
                    No networks found
                </div>
            ) : (
                <div className="flex flex-col gap-3 overflow-y-auto pb-8">
                    {filteredNetworks.map(network => (
                        <NetworkCard
                            key={network.id}
                            network={network}
                            onAction={handleAction}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function NetworkCard({ network, onAction }: {
    network: DockerNetwork;
    onAction: (action: () => Promise<void>) => Promise<void>;
}) {
    return (
        <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 flex items-center justify-between hover:bg-surface transition-colors">
            <div className="flex items-center gap-4 flex-1">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <Share2 size={24} />
                </div>
                <div className="flex flex-col">
                    <span className="text-lg font-medium text-on-surface">{network.name}</span>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm text-on-surface-variant">{network.driver}</span>
                        <span className="w-1 h-1 rounded-full bg-white/10" />
                        <span className="text-sm text-on-surface-variant">{network.scope}</span>
                        {network.internal && (
                            <>
                                <span className="w-1 h-1 rounded-full bg-white/10" />
                                <span className="text-[10px] bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full uppercase font-bold">
                                    Internal
                                </span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={() => onAction(() => DockerClient.removeNetwork(network.id))}
                    className="p-2 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"
                    title="Remove"
                >
                    <Trash size={20} />
                </button>
            </div>
        </div>
    );
}
