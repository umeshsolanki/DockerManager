import React, { useEffect, useState, useMemo } from 'react';
import { RefreshCw, Trash, Share2, Eye, Box } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DockerNetwork, NetworkDetails } from '@/lib/types';
import { SearchInput } from '../ui/SearchInput';
import { ActionIconButton } from '../ui/Buttons';
import { Modal } from '../ui/Modal';
import { useActionTrigger } from '@/hooks/useActionTrigger';

export default function NetworksScreen() {
    const [networks, setNetworks] = useState<DockerNetwork[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [inspectNetworkId, setInspectNetworkId] = useState<string | null>(null);
    const { trigger } = useActionTrigger();

    const fetchNetworks = async (showLoading = true) => {
        if (showLoading) setIsLoading(true);
        const data = await DockerClient.listNetworks();
        setNetworks(data);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchNetworks();
    }, []);

    const handleAction = async (action: () => Promise<any>) => {
        await trigger(action, { onSuccess: () => fetchNetworks(false) });
    };

    const filteredNetworks = useMemo(() => {
        return networks.filter(n =>
            n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            n.driver.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [networks, searchQuery]);

    return (
        <div className="flex flex-col">
            <div className="flex items-center gap-4 mb-5">
                <h1 className="text-3xl font-bold">Networks</h1>
                {isLoading && <RefreshCw className="animate-spin text-primary" size={24} />}
            </div>

            <div className="flex items-center gap-4 mb-5">
                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search networks..."
                />
                <ActionIconButton
                    onClick={() => fetchNetworks()}
                    icon={<RefreshCw />}
                    title="Refresh"
                />
            </div>

            {filteredNetworks.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-on-surface-variant italic opacity-50">
                    No networks found
                </div>
            ) : (
                <div className="bg-surface/30 border border-outline/10 rounded-xl divide-y divide-outline/5 transition-all">
                    {filteredNetworks.map(network => (
                        <div key={network.id} className="p-3 flex items-center justify-between hover:bg-white/[0.02] transition-all group">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <Share2 size={16} className="text-primary" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-sm font-bold truncate text-on-surface" title={network.name}>
                                        {network.name}
                                    </span>
                                    <div className="flex items-center gap-2 text-[10px] text-on-surface-variant font-mono">
                                        <span className="font-black uppercase text-[9px] bg-white/5 px-1.5 py-0.5 rounded tracking-tighter">{network.driver}</span>
                                        <span className="opacity-30">•</span>
                                        <span className="truncate opacity-70">{network.scope}</span>
                                        {network.internal && (
                                            <>
                                                <span className="opacity-30">•</span>
                                                <span className="text-[8px] bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded uppercase font-black">Internal</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-1 opacity-10 group-hover:opacity-100 transition-opacity">
                                <ActionIconButton
                                    onClick={() => setInspectNetworkId(network.id)}
                                    icon={<Eye />}
                                    color="blue"
                                    title="Inspect"
                                />
                                <ActionIconButton
                                    onClick={() => handleAction(() => DockerClient.removeNetwork(network.id))}
                                    icon={<Trash />}
                                    color="red"
                                    title="Remove"
                                />
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
        <Modal
            onClose={onClose}
            title="Network Details"
            description={`ID: ${networkId.substring(0, 12)}`}
            icon={<Share2 size={24} />}
            maxWidth="max-w-4xl"
            className="max-h-[85vh] flex flex-col"
        >
            <div className="flex-1 overflow-y-auto mt-4 pr-2 custom-scrollbar">
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
                                <h3 className="text-xs font-black text-on-surface-variant uppercase tracking-widest opacity-50">IPAM Configuration</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {details.ipam.config.map((config, i) => (
                                        <div key={i} className="bg-surface-variant/10 rounded-2xl p-4 border border-outline/5">
                                            <div className="grid grid-cols-2 gap-4">
                                                <InfoItem label="Subnet" value={config.subnet || '-'} compact />
                                                <InfoItem label="Gateway" value={config.gateway || '-'} compact />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="space-y-3">
                            <h3 className="text-xs font-black text-on-surface-variant uppercase tracking-widest opacity-50">Connected Containers ({Object.keys(details.containers).length})</h3>
                            {Object.keys(details.containers).length === 0 ? (
                                <p className="text-on-surface-variant italic py-4 opacity-50">No containers connected to this network.</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {Object.entries(details.containers).map(([id, container]) => (
                                        <div key={id} className="bg-surface-variant/10 rounded-2xl p-4 border border-outline/5 flex items-center gap-4 group hover:border-primary/20 transition-all">
                                            <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-500 group-hover:scale-110 transition-transform">
                                                <Box size={20} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="font-bold truncate text-sm" title={container.name}>{container.name}</div>
                                                <div className="text-[10px] text-on-surface-variant font-mono mt-0.5">{container.ipv4Address.split('/')[0]}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {(Object.keys(details.labels).length > 0 || Object.keys(details.options).length > 0) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                                {Object.keys(details.labels).length > 0 && (
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-black text-on-surface-variant uppercase tracking-widest opacity-50">Labels</h3>
                                        <div className="bg-surface-variant/10 rounded-2xl p-4 border border-outline/5 space-y-2.5">
                                            {Object.entries(details.labels).map(([k, v]) => (
                                                <div key={k} className="flex flex-col gap-0.5">
                                                    <span className="text-[10px] font-bold text-on-surface-variant uppercase leading-none">{k}</span>
                                                    <span className="font-mono text-xs text-on-surface truncate" title={v}>{v}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {Object.keys(details.options).length > 0 && (
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-black text-on-surface-variant uppercase tracking-widest opacity-50">Options</h3>
                                        <div className="bg-surface-variant/10 rounded-2xl p-4 border border-outline/5 space-y-2.5">
                                            {Object.entries(details.options).map(([k, v]) => (
                                                <div key={k} className="flex flex-col gap-0.5">
                                                    <span className="text-[10px] font-bold text-on-surface-variant uppercase leading-none">{k}</span>
                                                    <span className="font-mono text-xs text-on-surface truncate" title={v}>{v}</span>
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
        </Modal>
    );
}

function InfoItem({ label, value, compact = false }: { label: string, value: string, compact?: boolean }) {
    return (
        <div className="flex flex-col gap-0.5">
            <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest opacity-60 leading-none">{label}</p>
            <p className={`text-on-surface font-bold truncate ${compact ? 'text-xs' : 'text-base'}`} title={value}>{value}</p>
        </div>
    );
}
