import React, { useEffect, useState, useMemo } from 'react';
import { RefreshCw, Trash, HardDrive, Download, Info, CheckCircle2, Folder, FileText, ChevronLeft, ArrowUp, Loader2 } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DockerVolume, VolumeDetails, BackupResult, FileItem } from '@/lib/types';
import { SearchInput } from '../ui/SearchInput';
import { ActionIconButton, Button } from '../ui/Buttons';
import { Modal } from '../ui/Modal';
import { useActionTrigger } from '@/hooks/useActionTrigger';
import { Editor } from '@monaco-editor/react';

export default function VolumesScreen() {
    const [volumes, setVolumes] = useState<DockerVolume[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [inspectingVolume, setInspectingVolume] = useState<VolumeDetails | null>(null);
    const [browsingVolume, setBrowsingVolume] = useState<string | null>(null);
    const [backupResult, setBackupResult] = useState<BackupResult | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [forceDelete, setForceDelete] = useState(false);
    const [isBatchDeleting, setIsBatchDeleting] = useState(false);
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

    const handleRemove = async (name: string, force = forceDelete) => {
        if (!confirm(`Are you sure you want to remove volume "${name}"${force ? ' (FORCED)' : ''}?`)) return;
        await trigger(() => DockerClient.removeVolume(name, force), { onSuccess: () => fetchVolumes(false) });
    };

    const handleBatchRemove = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Are you sure you want to remove ${selectedIds.size} volumes${forceDelete ? ' (FORCED)' : ''}?`)) return;

        setIsBatchDeleting(true);
        try {
            await DockerClient.removeVolumes(Array.from(selectedIds), forceDelete);
            setSelectedIds(new Set());
            await fetchVolumes();
        } finally {
            setIsBatchDeleting(false);
        }
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredVolumes.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredVolumes.map(v => v.name)));
        }
    };

    const toggleSelect = (name: string) => {
        const next = new Set(selectedIds);
        if (next.has(name)) {
            next.delete(name);
        } else {
            next.add(name);
        }
        setSelectedIds(next);
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
        <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search volumes..."
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
            </div>

            {filteredVolumes.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-on-surface-variant italic opacity-50">
                    No volumes found
                </div>
            ) : (
                <div className="bg-surface/30 border border-outline/10 rounded-xl overflow-hidden transition-all">
                    <div className="bg-surface/50 p-2 px-3 flex items-center justify-between border-b border-outline/10">
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                checked={filteredVolumes.length > 0 && selectedIds.size === filteredVolumes.length}
                                onChange={toggleSelectAll}
                                className="w-4 h-4 rounded border-outline/30 bg-surface text-primary focus:ring-primary/20 cursor-pointer"
                            />
                            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Volumes ({filteredVolumes.length})</span>
                        </div>
                    </div>
                    <div className="divide-y divide-outline/5">
                        {filteredVolumes.map(volume => (
                            <div key={volume.name} className={`p-3 flex items-center justify-between hover:bg-white/[0.02] transition-all group ${selectedIds.has(volume.name) ? 'bg-primary/[0.03]' : ''}`}>
                                <div className="flex items-center gap-3 min-w-0">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(volume.name)}
                                        onChange={() => toggleSelect(volume.name)}
                                        className="w-4 h-4 rounded border-outline/30 bg-surface text-primary focus:ring-primary/20 cursor-pointer"
                                    />
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
                                        onClick={() => setBrowsingVolume(volume.name)}
                                        icon={<Folder />}
                                        color="yellow"
                                        title="Browse Files"
                                    />
                                    <ActionIconButton
                                        onClick={() => handleRemove(volume.name)}
                                        icon={<Trash />}
                                        color="red"
                                        title="Remove"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
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
            {browsingVolume && (
                <VolumeBrowserModal
                    volumeName={browsingVolume}
                    onClose={() => setBrowsingVolume(null)}
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
            className="flex flex-col"
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

function VolumeBrowserModal({ volumeName, onClose }: { volumeName: string; onClose: () => void }) {
    const [path, setPath] = useState('');
    const [files, setFiles] = useState<FileItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [viewingFile, setViewingFile] = useState<{ path: string, content: string, mode: 'head' | 'tail' } | null>(null);
    const [loadingFile, setLoadingFile] = useState<string | null>(null);

    const fetchFiles = async (currentPath: string) => {
        setIsLoading(true);
        try {
            const items = await DockerClient.listVolumeFiles(volumeName, currentPath);
            setFiles(items.sort((a, b) => {
                if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
                return a.isDirectory ? -1 : 1;
            }));
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchFiles(path);
    }, [path]);

    const handleUp = () => {
        if (!path) return;
        const parts = path.split('/');
        parts.pop();
        setPath(parts.join('/'));
    };

    const handleFileClick = async (file: FileItem) => {
        if (file.isDirectory) {
            setPath(file.path);
        } else {
            setLoadingFile(file.path);
            try {
                const content = await DockerClient.readVolumeFile(volumeName, file.path);
                setViewingFile({ path: file.path, content: content || '', mode: 'head' });
            } catch (e) {
                console.error(e);
            } finally {
                setLoadingFile(null);
            }
        }
    };

    return (
        <Modal
            onClose={onClose}
            title={viewingFile ? viewingFile.path : (path ? `/${path}` : '/')}
            description={`Browsing Volume: ${volumeName}`}
            icon={<Folder size={24} />}
            maxWidth="max-w-4xl"
            className="flex flex-col"
        >
            {viewingFile ? (
                <div className="flex-1 flex flex-col min-h-0 mt-4 -mx-6 -mb-6 relative">
                    <Editor
                        height="100%"
                        defaultLanguage={viewingFile.path.endsWith('.json') ? 'json' : viewingFile.path.endsWith('.yml') || viewingFile.path.endsWith('.yaml') ? 'yaml' : 'plaintext'}
                        theme="vs-dark"
                        value={viewingFile.content}
                        options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            fontSize: 13,
                            fontFamily: "'JetBrains Mono', monospace",
                            scrollBeyondLastLine: false,
                        }}
                    />
                </div>
            ) : (
                <div className="flex-1 flex flex-col min-h-0 mt-4">
                    <div className="flex items-center gap-2 mb-4">
                        <Button
                            variant="surface"
                            onClick={handleUp}
                            disabled={!path}
                            className="h-9 w-9 p-0 flex items-center justify-center shrink-0"
                        >
                            <ArrowUp size={16} />
                        </Button>
                        <div className="flex-1 bg-black/20 rounded-lg px-3 py-2 font-mono text-xs text-on-surface-variant truncate border border-outline/5">
                            /{path}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar -mx-2 px-2">
                        {isLoading ? (
                            <div className="flex justify-center p-10">
                                <Loader2 className="animate-spin text-primary" size={24} />
                            </div>
                        ) : files.length === 0 ? (
                            <div className="text-center py-10 text-on-surface-variant opacity-50 italic text-sm">
                                Empty directory
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {files.map((file) => (
                                    <button
                                        key={file.path}
                                        onClick={() => handleFileClick(file)}
                                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all text-left group"
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${file.isDirectory ? 'bg-primary/10 text-primary' : 'bg-surface-variant/20 text-on-surface-variant'}`}>
                                            {file.isDirectory ? <Folder size={16} /> : <FileText size={16} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold text-on-surface truncate">{file.name}</div>
                                            <div className="text-[10px] text-on-surface-variant font-mono">
                                                {file.isDirectory ? 'Directory' : formatBytes(file.size)} • {new Date(file.lastModified).toLocaleString()}
                                            </div>
                                        </div>
                                        {!file.isDirectory && (
                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                <div className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded">
                                                    {loadingFile === file.path ? 'LOADING...' : 'VIEW'}
                                                </div>
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Modal>
    );
}

function formatBytes(bytes: number, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
