'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Search, RefreshCw, Trash, HardDrive, Download, Info, XCircle, CheckCircle2 } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DockerVolume, VolumeDetails, BackupResult } from '@/lib/types';

export default function VolumesScreen() {
    const [volumes, setVolumes] = useState<DockerVolume[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [inspectingVolume, setInspectingVolume] = useState<VolumeDetails | null>(null);
    const [backupResult, setBackupResult] = useState<BackupResult | null>(null);

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

    const handleInspect = async (name: string) => {
        setIsLoading(true);
        const details = await DockerClient.inspectVolume(name);
        setInspectingVolume(details);
        setIsLoading(false);
    };

    const handleBackup = async (name: string) => {
        setIsLoading(true);
        const result = await DockerClient.backupVolume(name);
        setBackupResult(result);
        setIsLoading(false);
    };

    const filteredVolumes = useMemo(() => {
        return volumes.filter(v =>
            v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            v.driver.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [volumes, searchQuery]);

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-4 mb-5">
                <h1 className="text-3xl font-bold">Volumes</h1>
                {isLoading && <RefreshCw className="animate-spin text-primary" size={24} />}
            </div>

            <div className="flex items-center gap-4 mb-5">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
                    <input
                        type="text"
                        placeholder="Search volumes..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-surface border border-outline/20 rounded-xl py-2 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
                <button
                    onClick={fetchVolumes}
                    className="p-2.5 bg-surface border border-outline/20 rounded-xl hover:bg-white/5 transition-colors"
                    title="Refresh"
                >
                    <RefreshCw size={18} />
                </button>
                <button
                    onClick={() => handleAction(() => DockerClient.pruneVolumes())}
                    className="p-2.5 bg-surface border border-outline/20 rounded-xl hover:bg-red-500/10 text-red-400 transition-colors"
                    title="Prune Unused Volumes"
                >
                    <Trash size={18} />
                </button>
            </div>

            {filteredVolumes.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-on-surface-variant">
                    No volumes found
                </div>
            ) : (
                <div className="bg-surface/30 border border-outline/10 rounded-xl overflow-hidden divide-y divide-outline/5">
                    {filteredVolumes.map(volume => (
                        <div key={volume.name} className="p-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors group">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                                    <HardDrive size={16} className="text-secondary" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-sm font-bold truncate text-on-surface" title={volume.name}>
                                        {volume.name}
                                    </span>
                                    <div className="flex items-center gap-2 text-[10px] text-on-surface-variant font-mono">
                                        <span className="font-bold uppercase text-[9px] bg-white/5 px-1 rounded">{volume.driver}</span>
                                        <span className="opacity-30">•</span>
                                        <span className="truncate">{volume.mountpoint}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-1 opacity-10 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => handleInspect(volume.name)}
                                    className="p-1.5 hover:bg-blue-500/10 text-blue-400 rounded-lg transition-colors"
                                    title="Inspect"
                                >
                                    <Info size={14} />
                                </button>
                                <button
                                    onClick={() => handleBackup(volume.name)}
                                    className="p-1.5 hover:bg-white/10 text-on-surface-variant hover:text-secondary rounded-lg transition-colors"
                                    title="Backup"
                                >
                                    <Download size={14} />
                                </button>
                                <button
                                    onClick={() => handleAction(() => DockerClient.removeVolume(volume.name))}
                                    className="p-1.5 hover:bg-red-500/10 text-red-400 rounded-lg transition-colors"
                                    title="Remove"
                                >
                                    <Trash size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {inspectingVolume && (
                <InspectModal
                    details={inspectingVolume}
                    onClose={() => setInspectingVolume(null)}
                />
            )}

            {backupResult && (
                <BackupModal
                    result={backupResult}
                    onClose={() => setBackupResult(null)}
                />
            )}
        </div>
    );
}

function InspectModal({ details, onClose }: { details: VolumeDetails; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-surface border border-outline/20 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
                <div className="p-4 border-b border-outline/10 flex items-center justify-between">
                    <h2 className="text-xl font-bold truncate pr-8">{details.name}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors shrink-0">
                        <XCircle size={20} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <VolumeDetailItem label="Driver" value={details.driver} />
                        <VolumeDetailItem label="Scope" value={details.scope} />
                        <VolumeDetailItem label="Created At" value={details.createdAt || 'N/A'} />
                    </div>

                    <div>
                        <div className="text-xs text-on-surface-variant uppercase font-bold mb-2">Mountpoint</div>
                        <div className="bg-black/20 rounded-xl p-3 font-mono text-sm break-all">
                            {details.mountpoint}
                        </div>
                    </div>

                    {Object.keys(details.labels).length > 0 && (
                        <div>
                            <div className="text-xs text-on-surface-variant uppercase font-bold mb-2">Labels</div>
                            <div className="space-y-2">
                                {Object.entries(details.labels).map(([k, v]) => (
                                    <div key={k} className="flex gap-2 text-sm">
                                        <span className="text-secondary font-medium shrink-0">{k}:</span>
                                        <span className="text-on-surface-variant">{v}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function VolumeDetailItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-white/5 rounded-xl p-3">
            <div className="text-xs text-on-surface-variant uppercase font-bold mb-1">{label}</div>
            <div className="text-sm truncate">{value}</div>
        </div>
    );
}

function BackupModal({ result, onClose }: { result: BackupResult; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-surface border border-outline/20 rounded-xl w-full max-w-md p-6 shadow-2xl flex flex-col items-center text-center">
                {result.success ? (
                    <CheckCircle2 size={64} className="text-green-500 mb-4" />
                ) : (
                    <XCircle size={64} className="text-red-500 mb-4" />
                )}
                <h3 className="text-2xl font-bold mb-2">{result.success ? 'Backup Successful' : 'Backup Failed'}</h3>
                <p className="text-on-surface-variant mb-6">{result.message}</p>
                {result.filePath && (
                    <div className="bg-black/20 rounded-xl p-3 w-full font-mono text-xs text-left mb-6 break-all">
                        {result.filePath}
                    </div>
                )}
                <button
                    onClick={onClose}
                    className="w-full py-3 bg-primary text-on-primary rounded-xl font-bold hover:opacity-90 transition-opacity"
                >
                    Close
                </button>
            </div>
        </div>
    );
}
