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
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search networks..."
                    className="flex-1 min-w-[200px]"
                />
                <div className="flex items-center gap-2">
                    {isLoading && <RefreshCw className="animate-spin text-primary mr-2" size={20} />}
                    <ActionIconButton
                        onClick={() => fetchNetworks()}
                        icon={<RefreshCw />}
                        title="Refresh"
                    />
                </div>
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
    const [activeTab, setActiveTab] = useState<'details' | 'raw'>('details');

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
            title={details?.name || 'Network Details'}
            description={`ID: ${networkId}`}
            icon={<Share2 size={24} />}
            maxWidth="max-w-4xl"
            className="h-[85vh] flex flex-col"
        >
            <div className="flex gap-2 mb-6 bg-surface-variant/5 p-1 rounded-xl self-start">
                <button
                    onClick={() => setActiveTab('details')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'details' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-white/5'}`}
                >
                    Details
                </button>
                <button
                    onClick={() => setActiveTab('raw')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'raw' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-white/5'}`}
                >
                    JSON
                </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {loading ? (
                    <div className="flex flex-col justify-center items-center py-24 gap-4">
                        <RefreshCw className="animate-spin text-primary" size={40} />
                        <span className="text-sm text-on-surface-variant animate-pulse">Inspecting network...</span>
                    </div>
                ) : details ? (
                    activeTab === 'details' ? (
                        <div className="space-y-8 pb-8">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <InfoItem label="Driver" value={details.driver} icon={<Share2 size={14} />} />
                                <InfoItem label="Scope" value={details.scope} />
                                <InfoItem label="Created At" value={details.createdAt ? new Date(details.createdAt).toLocaleString() : 'N/A'} />
                                <div className="flex flex-col gap-1.5">
                                    <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest opacity-60">Status</p>
                                    <div className="flex flex-wrap gap-1">
                                        {details.internal && <Badge label="Internal" color="yellow" />}
                                        {details.attachable && <Badge label="Attachable" color="blue" />}
                                        {details.ingress && <Badge label="Ingress" color="purple" />}
                                        {details.enableIPv6 && <Badge label="IPv6" color="green" />}
                                        {!details.internal && !details.attachable && !details.ingress && !details.enableIPv6 && <span className="text-xs font-bold text-on-surface">Standard</span>}
                                    </div>
                                </div>
                            </div>

                            {/* IPAM Section */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs font-black text-primary uppercase tracking-widest">IPAM Configuration</h3>
                                    <div className="h-px flex-1 bg-primary/10"></div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-surface-variant/5 rounded-2xl p-4 border border-outline/5">
                                        <InfoItem label="IPAM Driver" value={details.ipam.driver} compact />
                                    </div>
                                    {details.ipam.config.map((config, i) => (
                                        <div key={i} className="bg-surface-variant/10 rounded-2xl p-4 border border-outline/10 shadow-sm space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <InfoItem label="Subnet" value={config.subnet || '-'} compact />
                                                <InfoItem label="Gateway" value={config.gateway || '-'} compact />
                                                {config.ipRange && <InfoItem label="IP Range" value={config.ipRange} compact />}
                                            </div>
                                            {config.auxAddresses && Object.keys(config.auxAddresses).length > 0 && (
                                                <div className="pt-2 border-t border-outline/5">
                                                    <p className="text-[9px] font-black text-on-surface-variant uppercase mb-2">Auxiliary Addresses</p>
                                                    <div className="grid grid-cols-1 gap-1">
                                                        {Object.entries(config.auxAddresses).map(([name, addr]) => (
                                                            <div key={name} className="flex justify-between items-center bg-black/20 px-2 py-1 rounded text-[11px] font-mono">
                                                                <span className="opacity-60">{name}</span>
                                                                <span className="text-primary">{addr}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Containers Section */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs font-black text-primary uppercase tracking-widest">Connected Containers ({Object.keys(details.containers).length})</h3>
                                    <div className="h-px flex-1 bg-primary/10"></div>
                                </div>
                                {Object.keys(details.containers).length === 0 ? (
                                    <div className="bg-surface-variant/5 rounded-2xl p-10 border border-dashed border-outline/20 flex flex-col items-center justify-center text-center">
                                        <Box size={32} className="text-on-surface-variant opacity-20 mb-3" />
                                        <p className="text-on-surface-variant italic text-sm">No containers are currently attached to this network.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {Object.entries(details.containers).map(([id, container]) => (
                                            <div key={id} className="bg-surface-variant/10 rounded-2xl p-4 border border-outline/5 hover:border-primary/30 transition-all group">
                                                <div className="flex items-start gap-3 mb-3">
                                                    <div className="p-2 bg-primary/10 rounded-xl text-primary group-hover:bg-primary group-hover:text-on-primary transition-all duration-300">
                                                        <Box size={18} />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-bold truncate text-sm" title={container.name}>{container.name}</div>
                                                        <div className="text-[10px] text-on-surface-variant font-mono truncate opacity-60" title={id}>{id.substring(0, 12)}</div>
                                                    </div>
                                                </div>
                                                <div className="space-y-2 pt-2 border-t border-outline/5">
                                                    {container.ipv4Address && (
                                                        <div className="flex justify-between items-center text-[10px] font-mono">
                                                            <span className="opacity-50 uppercase tracking-tighter">IPv4</span>
                                                            <span className="text-blue-400">{container.ipv4Address}</span>
                                                        </div>
                                                    )}
                                                    {container.ipv6Address && (
                                                        <div className="flex justify-between items-center text-[10px] font-mono">
                                                            <span className="opacity-50 uppercase tracking-tighter">IPv6</span>
                                                            <span className="text-green-400">{container.ipv6Address}</span>
                                                        </div>
                                                    )}
                                                    {container.macAddress && (
                                                        <div className="flex justify-between items-center text-[10px] font-mono">
                                                            <span className="opacity-50 uppercase tracking-tighter">MAC</span>
                                                            <span className="opacity-80">{container.macAddress}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Options & Labels */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-xs font-black text-primary uppercase tracking-widest">Labels</h3>
                                        <div className="h-px flex-1 bg-primary/10"></div>
                                    </div>
                                    {Object.keys(details.labels).length > 0 ? (
                                        <div className="bg-surface-variant/10 rounded-2xl p-4 border border-outline/5 space-y-3">
                                            {Object.entries(details.labels).map(([k, v]) => (
                                                <div key={k} className="flex flex-col gap-1">
                                                    <span className="text-[9px] font-black text-primary uppercase leading-none opacity-70">{k}</span>
                                                    <span className="font-mono text-xs text-on-surface break-all bg-black/20 p-2 rounded-lg">{v}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-[11px] text-on-surface-variant italic opacity-40 px-2 italic">No labels defined.</div>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-xs font-black text-primary uppercase tracking-widest">Driver Options</h3>
                                        <div className="h-px flex-1 bg-primary/10"></div>
                                    </div>
                                    {Object.keys(details.options).length > 0 ? (
                                        <div className="bg-surface-variant/10 rounded-2xl p-4 border border-outline/5 space-y-3">
                                            {Object.entries(details.options).map(([k, v]) => (
                                                <div key={k} className="flex flex-col gap-1">
                                                    <span className="text-[9px] font-black text-primary uppercase leading-none opacity-70">{k}</span>
                                                    <span className="font-mono text-xs text-on-surface break-all bg-black/20 p-2 rounded-lg">{v}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-[11px] text-on-surface-variant italic opacity-40 px-2 italic">No specific options.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col pt-2">
                            <div className="bg-black/40 rounded-2xl p-6 font-mono text-[11px] overflow-auto border border-white/5 shadow-inner">
                                <pre className="whitespace-pre-wrap text-blue-400/90 leading-relaxed selection:bg-primary/30">
                                    {JSON.stringify(details, null, 2)}
                                </pre>
                            </div>
                        </div>
                    )
                ) : null}
            </div>
        </Modal>
    );
}

function InfoItem({ label, value, compact = false, icon }: { label: string, value: string, compact?: boolean, icon?: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest opacity-60 leading-none">{label}</p>
            <div className="flex items-center gap-1.5 min-w-0">
                {icon && <span className="text-primary/50">{icon}</span>}
                <p className={`text-on-surface font-bold truncate ${compact ? 'text-xs' : 'text-[15px]'}`} title={value}>{value}</p>
            </div>
        </div>
    );
}

function Badge({ label, color }: { label: string, color: 'green' | 'blue' | 'yellow' | 'purple' | 'red' }) {
    const colors = {
        green: 'bg-green-500/10 text-green-500 border-green-500/20',
        blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
        yellow: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
        purple: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
        red: 'bg-red-500/10 text-red-500 border-red-500/20',
    };

    return (
        <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${colors[color]}`}>
            {label}
        </span>
    );
}
