import React, { useEffect, useState, useMemo } from 'react';
import { Search, RefreshCw, Trash2, Play, Square, Trash, Info, X, XCircle, Plus, Globe, Shield, Terminal, Settings2, Box } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DockerContainer, ContainerDetails, CreateContainerRequest, DockerNetwork, DockerVolume, DockerImage } from '@/lib/types';
import dynamic from 'next/dynamic';
import { Button, ActionIconButton } from '../ui/Buttons';
import { SearchInput } from '../ui/SearchInput';
import { Modal } from '../ui/Modal';
import { TabButton, TabsList } from '../ui/Tabs';
import { useActionTrigger } from '@/hooks/useActionTrigger';

const WebShell = dynamic(() => import('../Terminal'), { ssr: false });

export default function ContainersScreen() {
    const [containers, setContainers] = useState<DockerContainer[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [inspectingContainer, setInspectingContainer] = useState<ContainerDetails | null>(null);
    const [shellContainerId, setShellContainerId] = useState<string | null>(null);
    const [isWizardOpen, setIsWizardOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [forceDelete, setForceDelete] = useState(false);
    const [isBatchDeleting, setIsBatchDeleting] = useState(false);
    const { trigger, isLoading: isActionLoading } = useActionTrigger();

    const fetchContainers = async (showLoading = true) => {
        if (showLoading) setIsLoading(true);
        const data = await DockerClient.listContainers();
        setContainers(data);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchContainers();
    }, []);

    const handleAction = async (action: () => Promise<any>) => {
        await trigger(action, { onSuccess: () => fetchContainers(false) });
    };

    const handleRemove = async (id: string, force = forceDelete) => {
        if (!confirm(`Are you sure you want to remove this container${force ? ' (FORCED)' : ''}?`)) return;
        await trigger(() => DockerClient.removeContainer(id, force), { onSuccess: () => fetchContainers(false) });
    };

    const handleBatchRemove = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Are you sure you want to remove ${selectedIds.size} containers${forceDelete ? ' (FORCED)' : ''}?`)) return;

        setIsBatchDeleting(true);
        try {
            await DockerClient.removeContainers(Array.from(selectedIds), forceDelete);
            setSelectedIds(new Set());
            await fetchContainers();
        } finally {
            setIsBatchDeleting(false);
        }
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredContainers.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredContainers.map(c => c.id)));
        }
    };

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setSelectedIds(next);
    };

    const handleInspect = async (id: string) => {
        setIsLoading(true);
        const details = await DockerClient.inspectContainer(id);
        setInspectingContainer(details);
        setIsLoading(false);
    };

    const handleShell = (id: string) => {
        setShellContainerId(id);
    };

    const filteredContainers = useMemo(() => {
        return containers.filter(c =>
            c.names.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.image.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [containers, searchQuery]);

    return (
        <div className="flex flex-col relative">
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search containers..."
                    className="flex-1 min-w-[200px]"
                />
                <div className="flex items-center gap-2">
                    {isLoading && <RefreshCw className="animate-spin text-primary mr-2" size={20} />}

                    <div className="flex items-center gap-2 bg-surface/50 border border-outline/10 rounded-xl p-1 px-2">
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={forceDelete}
                                onChange={(e) => setForceDelete(e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-outline/30 bg-surface text-primary focus:ring-primary/20"
                            />
                            <span className="text-[10px] font-bold text-on-surface-variant group-hover:text-red-400 transition-colors uppercase tracking-wider">Force</span>
                        </label>
                    </div>

                    {selectedIds.size > 0 && (
                        <Button
                            onClick={handleBatchRemove}
                            variant="danger"
                            disabled={isLoading || isBatchDeleting}
                            icon={<Trash size={16} />}
                            className="bg-red-500/20 hover:bg-red-500/30 text-red-500 border-red-500/20"
                        >
                            Delete ({selectedIds.size})
                        </Button>
                    )}

                    <Button onClick={() => setIsWizardOpen(true)} icon={<Plus size={18} />}>
                        New Container
                    </Button>
                    <ActionIconButton
                        onClick={() => fetchContainers()}
                        icon={<RefreshCw />}
                        title="Refresh"
                    />
                    <ActionIconButton
                        onClick={() => handleAction(() => DockerClient.pruneContainers())}
                        icon={<Trash2 />}
                        color="red"
                        title="Prune"
                    />
                </div>
            </div>

            {filteredContainers.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-on-surface-variant italic opacity-50">
                    No containers found
                </div>
            ) : (
                <div className="bg-surface/30 border border-outline/10 rounded-xl overflow-hidden transition-all">
                    <div className="bg-surface/50 p-2 px-3 flex items-center justify-between border-b border-outline/10">
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                checked={filteredContainers.length > 0 && selectedIds.size === filteredContainers.length}
                                onChange={toggleSelectAll}
                                className="w-4 h-4 rounded border-outline/30 bg-surface text-primary focus:ring-primary/20 cursor-pointer"
                            />
                            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Containers ({filteredContainers.length})</span>
                        </div>
                        <div className="flex items-center gap-8 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest px-12">
                            <span>Status</span>
                            <span className="w-24">ID</span>
                        </div>
                    </div>
                    <div className="divide-y divide-outline/5">
                        {filteredContainers.map(container => {
                            const isRunning = container.state.toLowerCase().includes('running');
                            return (
                                <div key={container.id} className={`p-3 flex items-center justify-between hover:bg-white/[0.02] transition-all group ${selectedIds.has(container.id) ? 'bg-primary/[0.03]' : ''}`}>
                                    <div className="flex items-center gap-3 min-w-0">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(container.id)}
                                            onChange={() => toggleSelect(container.id)}
                                            className="w-4 h-4 rounded border-outline/30 bg-surface text-primary focus:ring-primary/20 cursor-pointer"
                                        />
                                        <div className={`w-2 h-2 rounded-full shrink-0 ${isRunning ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.3)]' : 'bg-gray-500/50 grayscale'}`} />
                                        <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold truncate text-on-surface" title={container.names}>
                                                    {container.names}
                                                </span>
                                                <span className="text-[10px] text-on-surface-variant font-mono truncate opacity-60">
                                                    {container.image}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-on-surface-variant font-mono">
                                                <span className={isRunning ? 'text-green-500/80 font-bold' : 'text-on-surface-variant/70'}>
                                                    {container.status}
                                                </span>
                                                {container.ipAddress && (
                                                    <>
                                                        <span className="opacity-30">•</span>
                                                        <span className="text-primary font-bold">{container.ipAddress}</span>
                                                    </>
                                                )}
                                                <span className="opacity-30">•</span>
                                                <span className="truncate opacity-50">{container.id.substring(0, 12)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1 opacity-10 group-hover:opacity-100 transition-opacity">
                                        <ActionIconButton
                                            onClick={() => handleInspect(container.id)}
                                            icon={<Info />}
                                            color="blue"
                                            title="Inspect"
                                        />
                                        {isRunning ? (
                                            <ActionIconButton
                                                onClick={() => handleAction(() => DockerClient.stopContainer(container.id))}
                                                icon={<Square fill="currentColor" />}
                                                color="red"
                                                title="Stop"
                                            />
                                        ) : (
                                            <ActionIconButton
                                                onClick={() => handleAction(() => DockerClient.startContainer(container.id))}
                                                icon={<Play fill="currentColor" />}
                                                color="green"
                                                title="Start"
                                            />
                                        )}
                                        <ActionIconButton
                                            onClick={() => handleShell(container.id)}
                                            icon={<Terminal />}
                                            color="primary"
                                            disabled={!isRunning}
                                            title="Terminal Shell"
                                        />
                                        <ActionIconButton
                                            onClick={() => handleRemove(container.id)}
                                            icon={<Trash />}
                                            color="red"
                                            disabled={isRunning && !forceDelete}
                                            title="Remove"
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {inspectingContainer && (
                <InspectModal
                    details={inspectingContainer}
                    onClose={() => setInspectingContainer(null)}
                />
            )}

            {shellContainerId && (
                <ShellModal
                    containerId={shellContainerId}
                    onClose={() => setShellContainerId(null)}
                />
            )}

            {isWizardOpen && (
                <CreateContainerWizard
                    onClose={() => setIsWizardOpen(false)}
                    onCreated={() => {
                        setIsWizardOpen(false);
                        fetchContainers();
                    }}
                />
            )}
        </div>
    );
}


function ShellModal({ containerId, onClose }: { containerId: string; onClose: () => void }) {
    return (
        <Modal
            onClose={onClose}
            title={`Container Shell: ${containerId.substring(0, 12)}`}
            description="Interactive Terminal Access"
            icon={<Terminal size={24} />}
            maxWidth="max-w-5xl"
            className="h-[80vh] flex flex-col"
        >
            <div className="flex-1 bg-black rounded-2xl overflow-hidden mt-4 border border-outline/10">
                <WebShell url={`${DockerClient.getServerUrl()}/shell/container/${containerId}`} onClose={onClose} />
            </div>
        </Modal>
    );
}

function InspectModal({ details, onClose }: { details: ContainerDetails; onClose: () => void }) {
    const [activeTab, setActiveTab] = React.useState<'details' | 'logs' | 'raw'>('details');
    const [logs, setLogs] = React.useState<string>('');
    const [isLoadingLogs, setIsLoadingLogs] = React.useState(false);
    const [logTail, setLogTail] = React.useState<number>(100);

    const fetchLogs = async (tail: number = logTail) => {
        setIsLoadingLogs(true);
        const logData = await DockerClient.getContainerLogs(details.id, tail);
        setLogs(logData);
        setIsLoadingLogs(false);
    };

    React.useEffect(() => {
        if (activeTab === 'logs' && !logs) {
            fetchLogs();
        }
    }, [activeTab]);

    return (
        <Modal
            onClose={onClose}
            title={details.name}
            description={`Container ID: ${details.id.substring(0, 12)}`}
            icon={<Box size={24} />}
            maxWidth="max-w-3xl"
            className="h-[80vh] flex flex-col"
        >
            <TabsList className="mb-6">
                <TabButton id="details" label="Details" active={activeTab === 'details'} onClick={() => setActiveTab('details')} />
                <TabButton id="logs" label="Logs" active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} />
                <TabButton id="raw" label="JSON" active={activeTab === 'raw'} onClick={() => setActiveTab('raw')} />
            </TabsList>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {activeTab === 'details' ? (
                    <div className="space-y-8">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <DetailItem label="Status" value={details.status} />
                            <DetailItem label="Image" value={details.image} />
                            <DetailItem label="Platform" value={details.platform} />
                            <DetailItem label="Driver" value={details.driver || 'unknown'} />
                            <DetailItem label="Hostname" value={details.hostname || 'None'} />
                            <DetailItem label="Restart Policy" value={details.restartPolicy || 'no'} />
                        </div>

                        <div>
                            <h3 className="text-lg font-bold mb-3">Lifecycle</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <DetailItem label="Created At" value={new Date(details.createdAt || 0).toLocaleString()} />
                                <DetailItem label="Started At" value={details.startedAt ? new Date(details.startedAt).toLocaleString() : 'N/A'} />
                                {details.finishedAt && details.finishedAt !== 0 ? (
                                    <DetailItem label="Finished At" value={new Date(details.finishedAt).toLocaleString()} />
                                ) : null}
                                {details.exitCode !== undefined && (
                                    <DetailItem label="Exit Code" value={details.exitCode.toString()} />
                                )}
                            </div>
                            {details.error && (
                                <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm font-mono">
                                    <div className="font-bold mb-1">Error:</div>
                                    {details.error}
                                </div>
                            )}
                        </div>

                        <div>
                            <h3 className="text-lg font-bold mb-3">Configuration</h3>
                            <div className="space-y-4">
                                <div className="bg-white/5 rounded-xl p-4">
                                    <div className="text-[10px] text-on-surface-variant uppercase font-bold mb-2">Command</div>
                                    <div className="text-sm font-mono break-all bg-black/30 p-2 rounded border border-white/5">
                                        {details.command && details.command.length > 0 ? details.command.join(' ') : 'None'}
                                    </div>
                                </div>
                                <div className="bg-white/5 rounded-xl p-4">
                                    <div className="text-[10px] text-on-surface-variant uppercase font-bold mb-2">Entrypoint</div>
                                    <div className="text-sm font-mono break-all bg-black/30 p-2 rounded border border-white/5">
                                        {details.entrypoint && details.entrypoint.length > 0 ? details.entrypoint.join(' ') : 'None'}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <DetailItem label="Working Dir" value={details.workingDir || '/'} />
                                    <DetailItem label="Privileged" value={details.privileged ? 'Yes' : 'No'} />
                                    <DetailItem label="TTY" value={details.tty ? 'Yes' : 'No'} />
                                    <DetailItem label="Auto Remove" value={details.autoRemove ? 'Yes' : 'No'} />
                                </div>
                            </div>
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
                            <h3 className="text-lg font-bold mb-3">Ports</h3>
                            <div className="space-y-2">
                                {details.ports && details.ports.length > 0 ? (
                                    details.ports.map((p: any, i: number) => (
                                        <div key={i} className="bg-white/5 border border-white/5 rounded-xl p-4">
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div>
                                                    <div className="text-[10px] text-on-surface-variant">Container Port</div>
                                                    <div className="text-sm font-mono">{p.containerPort}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-on-surface-variant">Host Port</div>
                                                    <div className="text-sm font-mono">{p.hostPort}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-on-surface-variant">Protocol</div>
                                                    <div className="text-sm font-mono uppercase">{p.protocol}</div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-sm text-on-surface-variant italic">No port mappings</div>
                                )}
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-bold mb-3">Networking</h3>
                            <div className="space-y-2">
                                {details.networks && Object.keys(details.networks).length > 0 ? (
                                    Object.entries(details.networks).map(([name, net]: [string, any], i: number) => (
                                        <div key={i} className="bg-white/5 border border-white/5 rounded-xl p-4">
                                            <div className="text-xs text-on-surface-variant uppercase font-bold mb-1">{name}</div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <div className="text-[10px] text-on-surface-variant">IP Address</div>
                                                    <div className="text-sm font-mono">{net.ipv4Address || 'None'}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-on-surface-variant">MAC Address</div>
                                                    <div className="text-sm font-mono">{net.macAddress || 'None'}</div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-sm text-on-surface-variant italic">No network information available</div>
                                )}
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-bold mb-3">Mounts</h3>
                            <div className="space-y-2">
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
                ) : activeTab === 'logs' ? (
                    <div className="h-full">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-bold">Container Logs (Last {logTail} lines)</h3>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center bg-black/20 rounded-lg px-3 h-8 border border-outline/10 group focus-within:border-primary/50 transition-all">
                                    <span className="text-[10px] text-on-surface-variant uppercase font-bold mr-2 opacity-50">Lines</span>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10000"
                                        step="50"
                                        value={logTail}
                                        onChange={(e) => setLogTail(parseInt(e.target.value) || 0)}
                                        className="w-14 bg-transparent py-1 text-xs outline-none font-mono text-primary font-bold"
                                    />
                                </div>
                                <button
                                    onClick={() => fetchLogs()}
                                    disabled={isLoadingLogs}
                                    className="h-8 px-4 bg-primary text-on-primary rounded-lg hover:opacity-90 transition-all text-xs font-bold disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isLoadingLogs ? <RefreshCw className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                                    {isLoadingLogs ? 'Loading...' : 'Refresh'}
                                </button>
                            </div>
                        </div>
                        <div className="bg-black/60 rounded-2xl p-4 font-mono text-[11px] overflow-auto max-h-[60vh] border border-outline/5 shadow-inner">
                            <pre className="whitespace-pre-wrap text-green-400/90 selection:bg-primary/30 leading-relaxed">
                                {logs || 'No logs available. Refresh to fetch.'}
                            </pre>
                        </div>
                    </div>
                ) : (
                    <div className="h-full">
                        <h3 className="text-lg font-bold mb-3">Raw Inspection Data</h3>
                        <div className="bg-black/60 rounded-2xl p-4 font-mono text-[11px] overflow-auto max-h-[65vh] border border-outline/5 shadow-inner">
                            <pre className="whitespace-pre-wrap text-blue-400/90 selection:bg-primary/30 leading-relaxed">
                                {JSON.stringify(details, null, 2)}
                            </pre>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
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


function CreateContainerWizard({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);

    // Data for dropdowns
    const [images, setImages] = useState<DockerImage[]>([]);
    const [networks, setNetworks] = useState<DockerNetwork[]>([]);
    const [volumes, setVolumes] = useState<DockerVolume[]>([]);

    const [formData, setFormData] = useState<CreateContainerRequest>({
        name: '',
        image: '',
        ports: [],
        env: {},
        volumes: [],
        networks: [],
        restartPolicy: 'no'
    });

    useEffect(() => {
        const fetchData = async () => {
            const [imgs, nets, vols] = await Promise.all([
                DockerClient.listImages(),
                DockerClient.listNetworks(),
                DockerClient.listVolumes()
            ]);
            setImages(imgs);
            setNetworks(nets);
            setVolumes(vols);
        };
        fetchData();
    }, []);

    const handleCreate = async () => {
        setIsLoading(true);
        const result = await DockerClient.createContainer(formData);
        setIsLoading(false);
        if (result) {
            onCreated();
        } else {
            alert('Failed to create container');
        }
    };

    const nextStep = () => setStep(s => Math.min(5, s + 1));
    const prevStep = () => setStep(s => Math.max(1, s - 1));

    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <div className="space-y-6">
                        <WizardHeader title="Basic Info" icon={<Box size={24} />} description="Set the container name and base image" />
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-on-surface-variant mb-2 uppercase">Container Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-black/20 border border-outline/20 rounded-xl p-3 focus:border-primary outline-none"
                                    placeholder="my-cool-container"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-on-surface-variant mb-2 uppercase">Image</label>
                                <select
                                    value={formData.image}
                                    onChange={e => setFormData({ ...formData, image: e.target.value })}
                                    className="w-full bg-black/20 border border-outline/20 rounded-xl p-3 focus:border-primary outline-none"
                                >
                                    <option value="" disabled>Select an image</option>
                                    {images.map(img => (
                                        <option key={img.id} value={img.tags[0] || img.id}>{img.tags[0] || img.id.substring(0, 12)}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                );
            case 2:
                return (
                    <div className="space-y-6">
                        <WizardHeader title="Port Mappings" icon={<Globe size={24} />} description="Forward host ports to the container" />
                        <DynamicList
                            items={formData.ports || []}
                            onAdd={() => setFormData({ ...formData, ports: [...(formData.ports || []), { containerPort: 80, hostPort: 80, protocol: 'tcp' }] })}
                            onRemove={i => setFormData({ ...formData, ports: (formData.ports || []).filter((_, idx) => idx !== i) })}
                            renderItem={(item, i) => (
                                <div key={i} className="flex gap-4 items-center animate-in fade-in slide-in-from-left-2 transition-all">
                                    <input
                                        type="number"
                                        placeholder="Host"
                                        value={item.hostPort}
                                        onChange={e => {
                                            const newPorts = [...(formData.ports || [])];
                                            newPorts[i].hostPort = parseInt(e.target.value);
                                            setFormData({ ...formData, ports: newPorts });
                                        }}
                                        className="flex-1 bg-black/20 border border-outline/20 rounded-xl p-3 outline-none"
                                    />
                                    <span className="text-on-surface-variant">:</span>
                                    <input
                                        type="number"
                                        placeholder="Container"
                                        value={item.containerPort}
                                        onChange={e => {
                                            const newPorts = [...(formData.ports || [])];
                                            newPorts[i].containerPort = parseInt(e.target.value);
                                            setFormData({ ...formData, ports: newPorts });
                                        }}
                                        className="flex-1 bg-black/20 border border-outline/20 rounded-xl p-3 outline-none"
                                    />
                                </div>
                            )}
                        />
                    </div>
                );
            case 3:
                return (
                    <div className="space-y-6">
                        <WizardHeader title="Environment" icon={<Terminal size={24} />} description="Set environment variables" />
                        <DynamicMap
                            items={formData.env || {}}
                            onUpdate={newEnv => setFormData({ ...formData, env: newEnv })}
                        />
                    </div>
                );
            case 4:
                return (
                    <div className="space-y-6">
                        <WizardHeader title="Volumes" icon={<Settings2 size={24} />} description="Mount host paths or volumes" />
                        <DynamicList
                            items={formData.volumes || []}
                            onAdd={() => setFormData({ ...formData, volumes: [...(formData.volumes || []), { hostPath: '', containerPath: '', mode: 'rw' }] })}
                            onRemove={i => setFormData({ ...formData, volumes: (formData.volumes || []).filter((_, idx) => idx !== i) })}
                            renderItem={(item, i) => (
                                <div key={i} className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-left-2 transition-all">
                                    <input
                                        type="text"
                                        placeholder="Host Path / Volume"
                                        value={item.hostPath}
                                        onChange={e => {
                                            const newVols = [...(formData.volumes || [])];
                                            newVols[i].hostPath = e.target.value;
                                            setFormData({ ...formData, volumes: newVols });
                                        }}
                                        className="bg-black/20 border border-outline/20 rounded-xl p-3 outline-none"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Container Path"
                                        value={item.containerPath}
                                        onChange={e => {
                                            const newVols = [...(formData.volumes || [])];
                                            newVols[i].containerPath = e.target.value;
                                            setFormData({ ...formData, volumes: newVols });
                                        }}
                                        className="bg-black/20 border border-outline/20 rounded-xl p-3 outline-none"
                                    />
                                </div>
                            )}
                        />
                    </div>
                );
            case 5:
                return (
                    <div className="space-y-6">
                        <WizardHeader title="Networking" icon={<Shield size={24} />} description="Connect to Docker networks" />
                        <div className="grid grid-cols-2 gap-3">
                            {networks.map(net => (
                                <button
                                    key={net.id}
                                    onClick={() => {
                                        const current = formData.networks || [];
                                        if (current.includes(net.id)) {
                                            setFormData({ ...formData, networks: current.filter(id => id !== net.id) });
                                        } else {
                                            setFormData({ ...formData, networks: [...current, net.id] });
                                        }
                                    }}
                                    className={`p-4 rounded-xl border transition-all text-left ${formData.networks?.includes(net.id) ? 'bg-primary/20 border-primary text-primary' : 'bg-black/20 border-outline/10 text-on-surface-variant hover:border-outline/30'}`}
                                >
                                    <div className="font-bold">{net.name}</div>
                                    <div className="text-xs opacity-60 font-mono">{net.driver}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                );
        }
    };

    return (
        <Modal
            onClose={onClose}
            title="New Container"
            description={`Step ${step} of 5`}
            icon={<Box size={24} />}
            maxWidth="max-w-2xl"
            className="flex flex-col"
        >
            <div className="flex-1 overflow-y-auto min-h-[400px] mt-4">
                {renderStep()}
            </div>

            <div className="flex items-center justify-between mt-8 pt-6 border-t border-outline/10">
                <Button
                    variant="surface"
                    onClick={prevStep}
                    disabled={step === 1}
                >
                    Back
                </Button>
                <div className="flex gap-4">
                    {step < 5 ? (
                        <Button
                            onClick={nextStep}
                            disabled={step === 1 && !formData.image}
                        >
                            Next
                        </Button>
                    ) : (
                        <Button
                            variant="primary"
                            onClick={handleCreate}
                            loading={isLoading}
                            icon={<Plus size={20} />}
                            className="bg-green-500 shadow-green-500/20"
                        >
                            Create & Launch
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
}

function WizardHeader({ title, icon, description }: { title: string; icon: React.ReactNode; description: string }) {
    return (
        <div className="flex items-center gap-4 mb-5 p-4 bg-white/5 rounded-3xl border border-white/5">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                {icon}
            </div>
            <div>
                <h3 className="text-xl font-bold">{title}</h3>
                <p className="text-on-surface-variant text-sm">{description}</p>
            </div>
        </div>
    );
}

function DynamicList<T>({ items, onAdd, onRemove, renderItem }: { items: T[]; onAdd: () => void; onRemove: (i: number) => void; renderItem: (item: T, i: number) => React.ReactNode }) {
    return (
        <div className="space-y-4">
            {items.map((item, i) => (
                <div key={i} className="flex gap-4 items-center">
                    <div className="flex-1">{renderItem(item, i)}</div>
                    <button onClick={() => onRemove(i)} className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg">
                        <Trash size={20} />
                    </button>
                </div>
            ))}
            <button
                onClick={onAdd}
                className="w-full py-4 border-2 border-dashed border-outline/20 rounded-xl text-on-surface-variant hover:border-primary/50 hover:text-primary transition-all flex items-center justify-center gap-2"
            >
                <Plus size={20} /> Add Item
            </button>
        </div>
    );
}

function DynamicMap({ items, onUpdate }: { items: Record<string, string>; onUpdate: (m: Record<string, string>) => void }) {
    const entries = Object.entries(items);
    return (
        <div className="space-y-4">
            {entries.map(([k, v], i) => (
                <div key={i} className="flex gap-4 items-center animate-in fade-in slide-in-from-left-2">
                    <input
                        type="text"
                        placeholder="KEY"
                        value={k}
                        onChange={e => {
                            const newMap = { ...items };
                            delete newMap[k];
                            newMap[e.target.value] = v;
                            onUpdate(newMap);
                        }}
                        className="flex-1 bg-black/20 border border-outline/20 rounded-xl p-3 outline-none font-mono"
                    />
                    <span className="text-on-surface-variant">=</span>
                    <input
                        type="text"
                        placeholder="VALUE"
                        value={v}
                        onChange={e => {
                            const newMap = { ...items };
                            newMap[k] = e.target.value;
                            onUpdate(newMap);
                        }}
                        className="flex-1 bg-black/20 border border-outline/20 rounded-xl p-3 outline-none font-mono"
                    />
                    <button onClick={() => {
                        const newMap = { ...items };
                        delete newMap[k];
                        onUpdate(newMap);
                    }} className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg">
                        <Trash size={20} />
                    </button>
                </div>
            ))}
            <button
                onClick={() => onUpdate({ ...items, [`VAR_${entries.length + 1}`]: '' })}
                className="w-full py-4 border-2 border-dashed border-outline/20 rounded-xl text-on-surface-variant hover:border-primary/50 hover:text-primary transition-all flex items-center justify-center gap-2"
            >
                <Plus size={20} /> Add Environment Variable
            </button>
        </div>
    );
}
