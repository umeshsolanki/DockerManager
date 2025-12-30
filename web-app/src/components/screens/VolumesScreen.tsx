'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Search, RefreshCw, Trash, HardDrive, Info } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DockerVolume } from '@/lib/types';

export default function VolumesScreen() {
    const [volumes, setVolumes] = useState<DockerVolume[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchVolumes = async () => {
        setIsLoading(true);
        const data = await DockerClient.listVolumes();
        setVolumes(data);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchVolumes();
    }, []);

    const handleAction = async (action: () => Promise<void>) => {
        setIsLoading(true);
        await action();
        await fetchVolumes();
    };

    const filteredVolumes = useMemo(() => {
        return volumes.filter(v =>
            v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            v.driver.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [volumes, searchQuery]);

    const driverStats = useMemo(() => {
        const stats: Record<string, number> = {};
        volumes.forEach(v => {
            stats[v.driver] = (stats[v.driver] || 0) + 1;
        });
        return Object.entries(stats);
    }, [volumes]);

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-4 mb-8">
                <h1 className="text-4xl font-bold">Volumes</h1>
                {isLoading && <RefreshCw className="animate-spin text-primary" size={24} />}
            </div>

            {/* Visualisation Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-surface/50 border border-outline/10 rounded-2xl p-6">
                    <div className="text-sm text-on-surface-variant mb-2">Total Volumes</div>
                    <div className="text-3xl font-bold">{volumes.length}</div>
                </div>
                <div className="bg-surface/50 border border-outline/10 rounded-2xl p-6 col-span-1 md:col-span-2">
                    <div className="text-sm text-on-surface-variant mb-4">Drivers Distribution</div>
                    <div className="flex h-3 rounded-full overflow-hidden bg-white/5">
                        {driverStats.map(([driver, count], index) => {
                            const colors = ['bg-primary', 'bg-secondary', 'bg-tertiary', 'bg-green-500', 'bg-yellow-500'];
                            const width = (count / volumes.length) * 100;
                            return (
                                <div
                                    key={driver}
                                    className={`${colors[index % colors.length]} h-full`}
                                    style={{ width: `${width}%` }}
                                    title={`${driver}: ${count}`}
                                />
                            );
                        })}
                    </div>
                    <div className="flex flex-wrap gap-4 mt-4">
                        {driverStats.map(([driver, count], index) => {
                            const dotColors = ['bg-primary', 'bg-secondary', 'bg-tertiary', 'bg-green-500', 'bg-yellow-500'];
                            return (
                                <div key={driver} className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${dotColors[index % dotColors.length]}`} />
                                    <span className="text-xs text-on-surface-variant">{driver} ({count})</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-4 mb-8">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
                    <input
                        type="text"
                        placeholder="Search volumes..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-surface border border-outline/20 rounded-xl py-3 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
                <button
                    onClick={fetchVolumes}
                    className="p-3 bg-surface border border-outline/20 rounded-xl hover:bg-white/5 transition-colors"
                    title="Refresh"
                >
                    <RefreshCw size={20} />
                </button>
                <button
                    onClick={() => handleAction(() => DockerClient.pruneVolumes())}
                    className="p-3 bg-surface border border-outline/20 rounded-xl hover:bg-red-500/10 text-red-400 transition-colors"
                    title="Prune Unused"
                >
                    <Trash size={20} />
                </button>
            </div>

            {filteredVolumes.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-on-surface-variant">
                    No volumes found
                </div>
            ) : (
                <div className="flex flex-col gap-3 overflow-y-auto pb-8">
                    {filteredVolumes.map(volume => (
                        <VolumeCard
                            key={volume.name}
                            volume={volume}
                            onAction={handleAction}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function VolumeCard({ volume, onAction }: {
    volume: DockerVolume;
    onAction: (action: () => Promise<void>) => Promise<void>;
}) {
    return (
        <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 flex items-center justify-between hover:bg-surface transition-colors">
            <div className="flex items-center gap-4 flex-1">
                <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
                    <HardDrive size={24} />
                </div>
                <div className="flex flex-col truncate">
                    <span className="text-lg font-medium text-on-surface truncate">{volume.name}</span>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm text-on-surface-variant">{volume.driver}</span>
                        <span className="w-1 h-1 rounded-full bg-white/10" />
                        <span className="text-sm text-on-surface-variant truncate font-mono text-xs">{volume.mountpoint}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 ml-4">
                <button
                    onClick={() => onAction(() => DockerClient.removeVolume(volume.name))}
                    className="p-2 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"
                    title="Remove"
                >
                    <Trash size={20} />
                </button>
            </div>
        </div>
    );
}
