'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Search, RefreshCw, Trash, Share2, Eye, XCircle, Box } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DockerNetwork, NetworkDetails } from '@/lib/types';

export default function NetworksScreen() {
    const [networks, setNetworks] = useState<DockerNetwork[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [inspectNetworkId, setInspectNetworkId] = useState<string | null>(null);

    const fetchNetworks = async () => {
        setIsLoading(true);
        const data = await DockerClient.listNetworks();
        setNetworks(data);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchNetworks();
    }, []);

    const handleAction = async (action: () => Promise<any>) => {
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
            <div className="flex items-center gap-4 mb-5">
                <h1 className="text-3xl font-bold">Networks</h1>
                {isLoading && <RefreshCw className="animate-spin text-primary" size={24} />}
            </div>

            <div className="flex items-center gap-4 mb-5">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
                    <input
                        type="text"
                        placeholder="Search networks..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-surface border border-outline/20 rounded-xl py-2 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
                <button
                    onClick={fetchNetworks}
                    className="p-2.5 bg-surface border border-outline/20 rounded-xl hover:bg-white/5 transition-colors"
                    title="Refresh"
                >
                    <RefreshCw size={18} />
                </button>
            </div>

            {filteredNetworks.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-on-surface-variant">
                    No networks found
                </div>
            ) : (
                <div className="bg-surface/30 border border-outline/10 rounded-xl overflow-hidden divide-y divide-outline/5">
                    {filteredNetworks.map(network => (
                        <div key={network.id} className="p-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors group">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <Share2 size={16} className="text-primary" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-sm font-bold truncate text-on-surface" title={network.name}>
                                        {network.name}
                                    </span>
                                    <div className="flex items-center gap-2 text-[10px] text-on-surface-variant font-mono">
                                        <span className="font-bold uppercase text-[9px] bg-white/5 px-1 rounded">{network.driver}</span>
                                        <span className="opacity-30">•</span>
                                        <span className="truncate">{network.scope}</span>
                                        {network.internal && (
                                            <>
                                                <span className="opacity-30">•</span>
                                                <span className="text-[8px] bg-yellow-500/10 text-yellow-500 px-1 rounded uppercase font-bold">Internal</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-1 opacity-10 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => setInspectNetworkId(network.id)}
                                    className="p-1.5 hover:bg-blue-500/10 text-blue-400 rounded-lg transition-colors"
                                    title="Inspect"
                                >
                                    <Eye size={14} />
                                </button>
                                <button
                                    onClick={() => handleAction(() => DockerClient.removeNetwork(network.id))}
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

            {inspectNetworkId && (
                <NetworkInspectModal
                    networkId={inspectNetworkId}
                    onClose={() => setInspectNetworkId(null)}
                />
            )}
        </div>
    );
}

function NetworkInspectModal({ networkId, onClose }: { networkId: string; onClose: () => void }) {
    const [details, setDetails] = useState<NetworkDetails | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetch = async () => {
            const data = await DockerClient.inspectNetwork(networkId);
            setDetails(data);
            setLoading(false);
        };
        fetch();
    }, [networkId]);

    if (!details && !loading) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-surface border border-outline/20 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in duration-200">
                <div className="flex items-center justify-between p-6 border-b border-outline/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            <Share2 size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">Network Details</h2>
                            <p className="text-sm text-on-surface-variant font-mono">{networkId.substring(0, 12)}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                        <XCircle size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="flex justify-center items-center py-20">
                            <RefreshCw className="animate-spin text-primary" size={32} />
                        </div>
                    ) : details ? (
                        <div className="space-y-8">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <InfoItem label="Name" value={details.name} />
                                <InfoItem label="Driver" value={details.driver} />
                                <InfoItem label="Scope" value={details.scope} />
                                <InfoItem label="Internal" value={details.internal ? 'Yes' : 'No'} />
                            </div>

                            {details.ipam.config.length > 0 && (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">IPAM Configuration</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {details.ipam.config.map((config, i) => (
                                            <div key={i} className="bg-surface-variant/30 rounded-xl p-4 border border-outline/5">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <InfoItem label="Subnet" value={config.subnet || '-'} compact />
                                                    <InfoItem label="Gateway" value={config.gateway || '-'} compact />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">Connected Containers ({Object.keys(details.containers).length})</h3>
                                </div>
                                {Object.keys(details.containers).length === 0 ? (
                                    <p className="text-on-surface-variant italic">No containers connected to this network.</p>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {Object.entries(details.containers).map(([id, container]) => (
                                            <div key={id} className="bg-surface-variant/30 rounded-xl p-4 border border-outline/5 flex items-start gap-3">
                                                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500 mt-1">
                                                    <Box size={18} />
                                                </div>
                                                <div className="space-y-1 min-w-0">
                                                    <div className="font-medium truncate" title={container.name}>{container.name}</div>
                                                    <div className="text-xs text-on-surface-variant font-mono">{container.ipv4Address.split('/')[0]}</div>
                                                    {container.macAddress && <div className="text-[10px] text-on-surface-variant/70 font-mono">MAC: {container.macAddress}</div>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {(Object.keys(details.labels).length > 0 || Object.keys(details.options).length > 0) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {Object.keys(details.labels).length > 0 && (
                                        <div className="space-y-3">
                                            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">Labels</h3>
                                            <div className="bg-surface-variant/30 rounded-xl p-4 border border-outline/5 space-y-2">
                                                {Object.entries(details.labels).map(([k, v]) => (
                                                    <div key={k} className="flex justify-between text-sm">
                                                        <span className="text-on-surface-variant">{k}:</span>
                                                        <span className="font-mono text-on-surface truncate ml-4" title={v}>{v}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {Object.keys(details.options).length > 0 && (
                                        <div className="space-y-3">
                                            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">Options</h3>
                                            <div className="bg-surface-variant/30 rounded-xl p-4 border border-outline/5 space-y-2">
                                                {Object.entries(details.options).map(([k, v]) => (
                                                    <div key={k} className="flex justify-between text-sm">
                                                        <span className="text-on-surface-variant">{k}:</span>
                                                        <span className="font-mono text-on-surface truncate ml-4" title={v}>{v}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function InfoItem({ label, value, compact = false }: { label: string, value: string, compact?: boolean }) {
    return (
        <div>
            <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">{label}</p>
            <p className={`text-on-surface font-medium truncate ${compact ? 'text-sm' : 'text-base'} mt-0.5`} title={value}>{value}</p>
        </div>
    );
}
