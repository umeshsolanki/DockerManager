'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Search, RefreshCw, Trash2, Play, Square, Trash, Info, X, XCircle, Plus, Globe, Shield, Terminal, Settings2, Box } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DockerContainer, ContainerDetails, CreateContainerRequest, DockerNetwork, DockerVolume, DockerImage } from '@/lib/types';
import dynamic from 'next/dynamic';

const WebShell = dynamic(() => import('../Terminal'), { ssr: false });

export default function ContainersScreen() {
    const [containers, setContainers] = useState<DockerContainer[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [inspectingContainer, setInspectingContainer] = useState<ContainerDetails | null>(null);
    const [shellContainerId, setShellContainerId] = useState<string | null>(null);
    const [isWizardOpen, setIsWizardOpen] = useState(false);

    const fetchContainers = async () => {
        setIsLoading(true);
        const data = await DockerClient.listContainers();
        setContainers(data);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchContainers();
    }, []);

    const handleAction = async (action: () => Promise<any>) => {
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
        <div className="flex flex-col h-full relative">
            <div className="flex items-center gap-4 mb-5">
                <h1 className="text-3xl font-bold">Containers</h1>
                {isLoading && <RefreshCw className="animate-spin text-primary" size={24} />}
            </div>

            <div className="flex items-center gap-4 mb-5">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
                    <input
                        type="text"
                        placeholder="Search containers..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-surface border border-outline/20 rounded-xl py-2 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
                <button
                    onClick={() => setIsWizardOpen(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-xl font-bold hover:opacity-90 transition-opacity whitespace-nowrap text-sm"
                >
                    <Plus size={18} />
                    New Container
                </button>
                <button
                    onClick={fetchContainers}
                    className="p-2.5 bg-surface border border-outline/20 rounded-xl hover:bg-white/5 transition-colors"
                    title="Refresh"
                >
                    <RefreshCw size={18} />
                </button>
                <button
                    onClick={() => handleAction(() => DockerClient.pruneContainers())}
                    className="p-2.5 bg-surface border border-outline/20 rounded-xl hover:bg-red-500/10 text-red-400 transition-colors"
                    title="Prune"
                >
                    <Trash2 size={18} />
                </button>
            </div>

            {filteredContainers.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-on-surface-variant">
                    No containers found
                </div>
            ) : (
                <div className="bg-surface/30 border border-outline/10 rounded-xl overflow-hidden divide-y divide-outline/5">
                    {filteredContainers.map(container => {
                        const isRunning = container.state.toLowerCase().includes('running');
                        return (
                            <div key={container.id} className="p-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors group">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${isRunning ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.3)]' : 'bg-gray-500/50'}`} />
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
                                            <span className={isRunning ? 'text-green-500/80' : 'text-on-surface-variant/70'}>
                                                {container.status}
                                            </span>
                                            <span className="opacity-30">•</span>
                                            <span className="truncate">{container.id.substring(0, 12)}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 opacity-10 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => handleInspect(container.id)}
                                        className="p-1.5 hover:bg-blue-500/10 text-blue-400 rounded-lg transition-colors"
                                        title="Inspect"
                                    >
                                        <Info size={14} />
                                    </button>
                                    {isRunning ? (
                                        <button
                                            onClick={() => handleAction(() => DockerClient.stopContainer(container.id))}
                                            className="p-1.5 hover:bg-red-500/10 text-red-400 rounded-lg transition-colors"
                                            title="Stop"
                                        >
                                            <Square size={14} fill="currentColor" />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleAction(() => DockerClient.startContainer(container.id))}
                                            className="p-1.5 hover:bg-green-500/10 text-green-500 rounded-lg transition-colors"
                                            title="Start"
                                        >
                                            <Play size={14} fill="currentColor" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleShell(container.id)}
                                        disabled={!isRunning}
                                        className={`p-1.5 rounded-lg transition-colors ${!isRunning ? 'opacity-20 cursor-not-allowed' : 'hover:bg-primary/10 text-primary'}`}
                                        title="Terminal Shell"
                                    >
                                        <Terminal size={14} />
                                    </button>
                                    <button
                                        onClick={() => handleAction(() => DockerClient.removeContainer(container.id))}
                                        disabled={isRunning}
                                        className={`p-1.5 rounded-lg transition-colors ${isRunning ? 'opacity-20 cursor-not-allowed' : 'hover:bg-red-500/10 text-red-500'}`}
                                        title="Remove"
                                    >
                                        <Trash size={14} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="bg-surface border border-outline/20 rounded-3xl w-full max-w-5xl h-[80vh] overflow-hidden flex flex-col shadow-2xl">
                <div className="p-6 border-b border-outline/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Terminal size={24} className="text-primary" />
                        <h2 className="text-2xl font-bold">Container Shell: {containerId.substring(0, 12)}</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <XCircle size={24} />
                    </button>
                </div>
                <div className="flex-1 p-4 bg-black">
                    <WebShell url={`${DockerClient.getServerUrl()}/shell/container/${containerId}`} onClose={onClose} />
                </div>
            </div>
        </div>
    );
}

function InspectModal({ details, onClose }: { details: ContainerDetails; onClose: () => void }) {
    const [activeTab, setActiveTab] = React.useState<'details' | 'logs'>('details');
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

                {/* Tab Navigation */}
                <div className="flex border-b border-outline/10">
                    <button
                        onClick={() => setActiveTab('details')}
                        className={`flex-1 px-6 py-3 font-medium transition-colors ${activeTab === 'details'
                            ? 'text-primary border-b-2 border-primary'
                            : 'text-on-surface-variant hover:text-on-surface'
                            }`}
                    >
                        Details
                    </button>
                    <button
                        onClick={() => setActiveTab('logs')}
                        className={`flex-1 px-6 py-3 font-medium transition-colors ${activeTab === 'logs'
                            ? 'text-primary border-b-2 border-primary'
                            : 'text-on-surface-variant hover:text-on-surface'
                            }`}
                    >
                        Logs
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {activeTab === 'details' ? (
                        <div className="space-y-8">
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
                    ) : (
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
                    )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-surface border border-outline/20 rounded-[2.5rem] w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl scale-in-center">
                <div className="p-8 pb-4 flex items-center justify-between">
                    <div>
                        <div className="text-sm font-bold text-primary uppercase tracking-widest mb-1">Step {step} of 5</div>
                        <h2 className="text-3xl font-bold">New Container</h2>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-full transition-colors">
                        <X size={32} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 pt-4 min-h-[400px]">
                    {renderStep()}
                </div>

                <div className="p-8 bg-black/20 flex items-center justify-between border-t border-outline/10">
                    <button
                        onClick={prevStep}
                        disabled={step === 1}
                        className={`px-8 py-3 rounded-xl font-bold transition-all ${step === 1 ? 'opacity-20 cursor-not-allowed' : 'hover:bg-white/10'}`}
                    >
                        Back
                    </button>
                    <div className="flex gap-4">
                        {step < 5 ? (
                            <button
                                onClick={nextStep}
                                disabled={step === 1 && !formData.image}
                                className={`px-10 py-3 bg-primary text-on-primary rounded-xl font-bold hover:opacity-90 transition-all ${step === 1 && !formData.image ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                Next
                            </button>
                        ) : (
                            <button
                                onClick={handleCreate}
                                disabled={isLoading}
                                className="px-10 py-3 bg-green-500 text-white rounded-xl font-bold hover:opacity-90 transition-all flex items-center gap-2"
                            >
                                {isLoading ? <RefreshCw className="animate-spin" size={20} /> : <Plus size={20} />}
                                Create & Launch
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
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
