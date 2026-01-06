import React, { useEffect, useState, useMemo } from 'react';
import { RefreshCw, Trash, HardDrive, Download, Info, CheckCircle2 } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DockerVolume, VolumeDetails, BackupResult } from '@/lib/types';
import { SearchInput } from '../ui/SearchInput';
import { ActionIconButton, Button } from '../ui/Buttons';
import { Modal } from '../ui/Modal';
import { useActionTrigger } from '@/hooks/useActionTrigger';

export default function VolumesScreen() {
    const [volumes, setVolumes] = useState<DockerVolume[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [inspectingVolume, setInspectingVolume] = useState<VolumeDetails | null>(null);
    const [backupResult, setBackupResult] = useState<BackupResult | null>(null);
    const { trigger } = useActionTrigger();

    const fetchVolumes = async (showLoading = true) => {
        if (showLoading) setIsLoading(true);
        const data = await DockerClient.listVolumes();
        setVolumes(data);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchVolumes();
    }, []);

    const handleAction = async (action: () => Promise<any>) => {
        await trigger(action, { onSuccess: () => fetchVolumes(false) });
    };

    const handleInspect = async (name: string) => {
        setIsLoading(true);
        const details = await DockerClient.inspectVolume(name);
        setInspectingVolume(details);
        setIsLoading(false);
    };

    const handleBackup = async (name: string) => {
        await trigger(() => DockerClient.backupVolume(name), {
            onSuccess: (result: BackupResult) => {
                setBackupResult(result);
                return 'Backup completed';
            },
            successMessage: 'Backup process finished'
        });
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
                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search volumes..."
                />
                <ActionIconButton
                    onClick={() => fetchVolumes()}
                    icon={<RefreshCw />}
                    title="Refresh"
                />
                <ActionIconButton
                    onClick={() => handleAction(() => DockerClient.pruneVolumes())}
                    icon={<Trash />}
                    color="red"
                    title="Prune Unused Volumes"
                />
            </div>

            {filteredVolumes.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-on-surface-variant italic opacity-50">
                    No volumes found
                </div>
            ) : (
                <div className="bg-surface/30 border border-outline/10 rounded-xl overflow-hidden divide-y divide-outline/5 transition-all">
                    {filteredVolumes.map(volume => (
                        <div key={volume.name} className="p-3 flex items-center justify-between hover:bg-white/[0.02] transition-all group">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                                    <HardDrive size={16} className="text-secondary" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-sm font-bold truncate text-on-surface" title={volume.name}>
                                        {volume.name}
                                    </span>
                                    <div className="flex items-center gap-2 text-[10px] text-on-surface-variant font-mono">
                                        <span className="font-black uppercase text-[9px] bg-white/5 px-1.5 py-0.5 rounded tracking-tighter">{volume.driver}</span>
                                        <span className="opacity-30">•</span>
                                        <span className="truncate opacity-70">{volume.mountpoint}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-1 opacity-10 group-hover:opacity-100 transition-opacity">
                                <ActionIconButton
                                    onClick={() => handleInspect(volume.name)}
                                    icon={<Info />}
                                    color="blue"
                                    title="Inspect"
                                />
                                <ActionIconButton
                                    onClick={() => handleBackup(volume.name)}
                                    icon={<Download />}
                                    color="primary"
                                    title="Backup"
                                />
                                <ActionIconButton
                                    onClick={() => handleAction(() => DockerClient.removeVolume(volume.name))}
                                    icon={<Trash />}
                                    color="red"
                                    title="Remove"
                                />
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
        <Modal
            onClose={onClose}
            title={details.name}
            description="Volume Inspection"
            icon={<HardDrive size={24} />}
            maxWidth="max-w-2xl"
            className="max-h-[80vh] flex flex-col"
        >
            <div className="flex-1 overflow-y-auto mt-4 space-y-6 pr-2 custom-scrollbar">
                <div className="grid grid-cols-2 gap-4">
                    <VolumeDetailItem label="Driver" value={details.driver} />
                    <VolumeDetailItem label="Scope" value={details.scope} />
                    <VolumeDetailItem label="Created At" value={details.createdAt || 'N/A'} />
                </div>

                <div>
                    <div className="text-[10px] text-on-surface-variant uppercase font-black mb-2 opacity-50 tracking-widest">Mountpoint</div>
                    <div className="bg-black/20 rounded-2xl p-4 font-mono text-xs break-all border border-outline/5 text-secondary">
                        {details.mountpoint}
                    </div>
                </div>

                {Object.keys(details.labels).length > 0 && (
                    <div>
                        <div className="text-[10px] text-on-surface-variant uppercase font-black mb-2 opacity-50 tracking-widest">Labels</div>
                        <div className="bg-surface-variant/10 rounded-2xl p-4 border border-outline/5 space-y-3">
                            {Object.entries(details.labels).map(([k, v]) => (
                                <div key={k} className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold text-on-surface-variant uppercase leading-none">{k}</span>
                                    <span className="text-sm text-on-surface break-all">{v}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}

function VolumeDetailItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
            <div className="text-[10px] text-on-surface-variant uppercase font-black mb-1 opacity-50 tracking-widest">{label}</div>
            <div className="text-sm font-bold truncate" title={value}>{value}</div>
        </div>
    );
}

function BackupModal({ result, onClose }: { result: BackupResult; onClose: () => void }) {
    return (
        <Modal
            onClose={onClose}
            title={result.success ? 'Backup Successful' : 'Backup Failed'}
            icon={result.success ? <CheckCircle2 size={24} className="text-green-500" /> : <Info size={24} className="text-red-500" />}
            maxWidth="max-w-md"
        >
            <div className="flex flex-col items-center text-center mt-4">
                <p className="text-on-surface-variant mb-6 text-sm">{result.message}</p>
                {result.filePath && (
                    <div className="bg-black/40 rounded-2xl p-4 w-full font-mono text-[10px] text-left mb-8 break-all border border-outline/10 text-primary">
                        <div className="text-[8px] text-on-surface-variant uppercase font-black mb-2 opacity-40">Artifact Path</div>
                        {result.filePath}
                    </div>
                )}
                <Button variant="primary" onClick={onClose} className="w-full">
                    Complete
                </Button>
            </div>
        </Modal>
    );
}
