'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Search, RefreshCw, Folder, Play, Square, Plus, Edit2, X, Save, FileCode, Wand2, Archive, Upload, Layers, Trash2, Server, Activity, CheckCircle, XCircle, AlertCircle, RotateCw, Power, Hammer } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { ComposeFile, SaveComposeRequest, DockerStack, StackService, StackTask, DeployStackRequest } from '@/lib/types';
import Editor from '@monaco-editor/react';
import { toast } from 'sonner';

export default function ComposeScreen() {
    const [composeFiles, setComposeFiles] = useState<ComposeFile[]>([]);
    const [stacks, setStacks] = useState<DockerStack[]>([]);
    const [selectedStack, setSelectedStack] = useState<DockerStack | null>(null);
    const [stackServices, setStackServices] = useState<StackService[]>([]);
    const [stackTasks, setStackTasks] = useState<StackTask[]>([]);
    const [stackStatuses, setStackStatuses] = useState<Record<string, string>>({});
    const [composeStatuses, setComposeStatuses] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingFile, setEditingFile] = useState<ComposeFile | null>(null);
    const [editingFileName, setEditingFileName] = useState<string>('docker-compose.yml');
    const [editorContent, setEditorContent] = useState('');
    const [projectName, setProjectName] = useState('');
    const [activeTab, setActiveTab] = useState<'editor' | 'wizard'>('editor');
    const [viewMode, setViewMode] = useState<'compose' | 'stacks'>('compose');
    const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
    const [deployStackName, setDeployStackName] = useState('');
    const [deployComposeFile, setDeployComposeFile] = useState('');

    const fetchComposeFiles = async () => {
        setIsLoading(true);
        const data = await DockerClient.listComposeFiles();
        setComposeFiles(data);

        // Fetch statuses for all compose files
        const statusMap: Record<string, string> = {};
        for (const file of data) {
            try {
                const statusResult = await DockerClient.checkComposeStatus(file.path);
                statusMap[file.path] = statusResult.status || file.status || 'unknown';
            } catch (e) {
                statusMap[file.path] = file.status || 'unknown';
            }
        }
        setComposeStatuses(statusMap);
        setIsLoading(false);
    };

    const fetchStacks = async () => {
        setIsLoading(true);
        const data = await DockerClient.listStacks();
        setStacks(data);

        // Fetch statuses for all stacks
        const statusMap: Record<string, string> = {};
        for (const stack of data) {
            try {
                const statusResult = await DockerClient.checkStackStatus(stack.name);
                statusMap[stack.name] = statusResult.status || 'unknown';
            } catch (e) {
                statusMap[stack.name] = 'unknown';
            }
        }
        setStackStatuses(statusMap);
        setIsLoading(false);
    };

    const fetchStackDetails = async (stackName: string) => {
        const [services, tasks] = await Promise.all([
            DockerClient.listStackServices(stackName),
            DockerClient.listStackTasks(stackName)
        ]);
        setStackServices(services);
        setStackTasks(tasks);
    };

    useEffect(() => {
        if (viewMode === 'compose') {
            fetchComposeFiles();
        } else {
            fetchStacks();
        }
    }, [viewMode]);

    useEffect(() => {
        if (selectedStack) {
            fetchStackDetails(selectedStack.name);
            // Refresh stack status when selected
            DockerClient.checkStackStatus(selectedStack.name).then(result => {
                setStackStatuses(prev => ({ ...prev, [selectedStack.name]: result.status }));
            }).catch(() => { });
        }
    }, [selectedStack]);

    // Auto-refresh statuses periodically
    useEffect(() => {
        const interval = setInterval(() => {
            if (viewMode === 'compose') {
                composeFiles.forEach(async (file) => {
                    try {
                        const statusResult = await DockerClient.checkComposeStatus(file.path);
                        setComposeStatuses(prev => ({ ...prev, [file.path]: statusResult.status }));
                    } catch (e) {
                        // Ignore errors
                    }
                });
            } else {
                stacks.forEach(async (stack) => {
                    try {
                        const statusResult = await DockerClient.checkStackStatus(stack.name);
                        setStackStatuses(prev => ({ ...prev, [stack.name]: statusResult.status }));
                    } catch (e) {
                        // Ignore errors
                    }
                });
            }
        }, 10000); // Refresh every 10 seconds

        return () => clearInterval(interval);
    }, [viewMode, composeFiles, stacks]);

    const handleAction = async (action: () => Promise<any>) => {
        setIsLoading(true);
        const promise = action();

        toast.promise(promise, {
            loading: 'Executing command...',
            success: (result) => {
                if (result && typeof result === 'object' && 'success' in result) {
                    if (!result.success) {
                        return `Error: ${result.message}`;
                    }
                }
                return 'Command executed successfully';
            },
            error: 'Failed to execute command'
        });

        await promise;
        if (viewMode === 'compose') {
            await fetchComposeFiles();
        } else {
            await fetchStacks();
        }
        setIsLoading(false);
    };

    const handleCreate = () => {
        setEditingFile(null);
        setEditingFileName('docker-compose.yml');
        setProjectName('');
        setEditorContent('services:\n  app:\n    image: nginx:latest\n    ports:\n      - "80:80"');
        setIsEditorOpen(true);
        setActiveTab('editor');
    };

    const handleEdit = async (file: ComposeFile, fileName: string = 'docker-compose.yml') => {
        setIsLoading(true);
        let content = '';
        if (fileName === 'docker-compose.yml') {
            content = await DockerClient.getComposeFileContent(file.path);
        } else {
            content = await DockerClient.getProjectFileContent(file.name, fileName);
        }

        setEditingFile(file);
        setEditingFileName(fileName);
        setProjectName(file.name);
        setEditorContent(content);
        setIsEditorOpen(true);
        setActiveTab('editor');
        setIsLoading(false);
    };

    const handleBackup = async (file: ComposeFile) => {
        setIsLoading(true);
        const result = await DockerClient.backupCompose(file.name);
        setIsLoading(false);
        if (result?.success) {
            toast.success(`Backup created: ${result.fileName}`, {
                description: `Location: ${result.filePath}`,
                duration: 5000
            });
        } else {
            toast.error('Failed to create backup', {
                description: result?.message || 'Unknown error'
            });
        }
    };

    const handleBackupAll = async () => {
        setIsLoading(true);
        const result = await DockerClient.backupAllCompose();
        setIsLoading(false);
        if (result?.success) {
            toast.success(`Full backup created: ${result.fileName}`, {
                description: `Location: ${result.filePath}`,
                duration: 5000
            });
        } else {
            toast.error('Failed to create full backup', {
                description: result?.message || 'Unknown error'
            });
        }
    };

    const handleRestoreFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            setEditorContent(content);
        };
        reader.readAsText(file);
    };

    const handleSave = async () => {
        if (!projectName) {
            toast.error('Project name is required');
            return;
        }
        setIsLoading(true);

        let success = false;
        if (editingFileName === 'docker-compose.yml') {
            success = await DockerClient.saveComposeFile({
                name: projectName,
                content: editorContent
            });
        } else {
            success = await DockerClient.saveProjectFile({
                projectName: projectName,
                fileName: editingFileName,
                content: editorContent
            });
        }

        if (success) {
            toast.success(`${editingFileName} saved successfully`);
            setIsEditorOpen(false);
            await fetchComposeFiles();
        } else {
            toast.error(`Failed to save ${editingFileName}`);
        }
        setIsLoading(false);
    };

    const filteredFiles = useMemo(() => {
        return composeFiles.filter(f =>
            f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            f.path.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [composeFiles, searchQuery]);

    const filteredStacks = useMemo(() => {
        return stacks.filter(s =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [stacks, searchQuery]);

    const handleDeployStack = async () => {
        if (!deployStackName || !deployComposeFile) {
            toast.error('Stack name and compose file are required');
            return;
        }
        setIsLoading(true);
        try {
            const result = await DockerClient.deployStack({
                stackName: deployStackName,
                composeFile: deployComposeFile
            });
            if (result.success) {
                toast.success(`Stack "${deployStackName}" deployed successfully`);
                setIsDeployModalOpen(false);
                setDeployStackName('');
                setDeployComposeFile('');
                await fetchStacks();
            } else {
                toast.error(result.message || 'Failed to deploy stack');
            }
        } catch (e) {
            toast.error('Failed to deploy stack');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRemoveStack = async (stackName: string) => {
        if (!confirm(`Are you sure you want to remove stack "${stackName}"?`)) {
            return;
        }
        setIsLoading(true);
        try {
            const result = await DockerClient.removeStack(stackName);
            if (result.success) {
                toast.success(`Stack "${stackName}" removed successfully`);
                await fetchStacks();
                if (selectedStack?.name === stackName) {
                    setSelectedStack(null);
                }
            } else {
                toast.error(result.message || 'Failed to remove stack');
            }
        } catch (e) {
            toast.error('Failed to remove stack');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full relative">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl sm:text-3xl font-bold">Compose & Stacks</h1>
                    {isLoading && <RefreshCw className="animate-spin text-primary" size={24} />}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {viewMode === 'compose' && (
                        <>
                            <button
                                onClick={handleBackupAll}
                                className="flex items-center gap-2 bg-surface border border-outline/20 text-on-surface px-4 py-2 rounded-xl hover:bg-white/5 transition-colors text-sm font-bold shadow-sm"
                            >
                                <Archive size={18} />
                                Backup All
                            </button>
                            <button
                                onClick={handleCreate}
                                className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors text-sm font-bold shadow-lg shadow-primary/20"
                            >
                                <Plus size={20} />
                                New Project
                            </button>
                        </>
                    )}
                    {viewMode === 'stacks' && (
                        <button
                            onClick={() => setIsDeployModalOpen(true)}
                            className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors text-sm font-bold shadow-lg shadow-primary/20"
                        >
                            <Plus size={20} />
                            Deploy Stack
                        </button>
                    )}
                </div>
            </div>

            {/* View Mode Tabs */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div className="flex gap-1 bg-surface-variant/30 p-1 rounded-2xl w-fit shrink-0">
                    <button
                        onClick={() => setViewMode('compose')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${viewMode === 'compose'
                            ? 'bg-primary text-on-primary shadow-md'
                            : 'hover:bg-primary/10 text-on-surface-variant'
                            }`}
                    >
                        <FileCode size={18} />
                        <span>Compose</span>
                    </button>
                    <button
                        onClick={() => setViewMode('stacks')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${viewMode === 'stacks'
                            ? 'bg-primary text-on-primary shadow-md'
                            : 'hover:bg-primary/10 text-on-surface-variant'
                            }`}
                    >
                        <Layers size={18} />
                        <span>Stacks</span>
                    </button>
                </div>
                {viewMode === 'stacks' && (
                    <div className="flex items-center gap-4">
                        {(() => {
                            const runningStacks = stacks.filter(s => {
                                const status = stackStatuses[s.name] || 'unknown';
                                return status === 'active';
                            });
                            const totalServices = stacks.reduce((sum, s) => sum + s.services, 0);
                            const runningServicesInSelected = selectedStack ? stackServices.filter(s => {
                                const replicas = s.replicas.split('/');
                                return replicas.length === 2 && parseInt(replicas[0]) > 0;
                            }).length : 0;
                            return (
                                <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                                    <div className="flex items-center gap-2 bg-green-500/10 text-green-500 px-3 py-1.5 rounded-lg border border-green-500/20">
                                        <CheckCircle size={16} />
                                        <span className="font-bold whitespace-nowrap">{runningStacks.length} Running Stack{runningStacks.length !== 1 ? 's' : ''}</span>
                                    </div>
                                    <div className="flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-lg border border-primary/20">
                                        <Server size={16} />
                                        <span className="font-bold whitespace-nowrap">{totalServices} Total Service{totalServices !== 1 ? 's' : ''}</span>
                                    </div>
                                    {selectedStack && stackServices.length > 0 && (
                                        <div className="flex items-center gap-2 bg-blue-500/10 text-blue-500 px-3 py-1.5 rounded-lg border border-blue-500/20">
                                            <Activity size={16} />
                                            <span className="font-bold whitespace-nowrap">
                                                {runningServicesInSelected}/{stackServices.length} Running
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-5">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
                    <input
                        type="text"
                        placeholder="Search compose projects..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-surface border border-outline/20 rounded-xl py-2 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
                <button
                    onClick={fetchComposeFiles}
                    className="p-2.5 bg-surface border border-outline/20 rounded-xl hover:bg-white/5 transition-colors self-end sm:self-auto"
                    title="Refresh"
                >
                    <RefreshCw size={18} />
                </button>
            </div>

            {viewMode === 'compose' ? (
                filteredFiles.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-on-surface-variant">
                        No compose files found
                    </div>
                ) : (
                    <div className="bg-surface/30 border border-outline/10 rounded-xl overflow-hidden divide-y divide-outline/5">
                        {filteredFiles.map(file => (
                            <div key={file.path} className="p-3 flex flex-col md:flex-row md:items-center justify-between hover:bg-white/[0.02] transition-colors group gap-4">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                        <Folder size={16} className="text-primary" />
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold truncate text-on-surface shrink-0 max-w-[150px] sm:max-w-none" title={file.name}>
                                                {file.name}
                                            </span>
                                            {(() => {
                                                const status = composeStatuses[file.path] || file.status || 'unknown';
                                                const statusConfigMap = {
                                                    active: { icon: <CheckCircle size={10} />, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Running' },
                                                    stopped: { icon: <Square size={10} />, color: 'text-orange-500', bg: 'bg-orange-500/10', label: 'Stopped' },
                                                    partial: { icon: <AlertCircle size={10} />, color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Partial' },
                                                    inactive: { icon: <XCircle size={10} />, color: 'text-gray-500', bg: 'bg-gray-500/10', label: 'Inactive' },
                                                    unknown: { icon: <AlertCircle size={10} />, color: 'text-on-surface-variant', bg: 'bg-surface-variant/10', label: 'Unknown' }
                                                };
                                                const statusConfig = statusConfigMap[status as keyof typeof statusConfigMap] || statusConfigMap.unknown;
                                                return (
                                                    <span className={`text-[8px] sm:text-[9px] ${statusConfig.bg} ${statusConfig.color} px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1 shrink-0`}>
                                                        {statusConfig.icon}
                                                        {statusConfig.label}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant font-mono truncate">
                                            <span className="truncate">{file.path}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => handleBackup(file)}
                                        className="p-1.5 hover:bg-white/10 text-on-surface-variant hover:text-primary rounded-lg transition-colors"
                                        title="Backup"
                                    >
                                        <Archive size={14} />
                                    </button>
                                    <button
                                        onClick={() => handleEdit(file)}
                                        className="p-1.5 hover:bg-primary/10 text-primary rounded-lg transition-colors"
                                        title="Edit Compose"
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                    <button
                                        onClick={() => handleEdit(file, 'Dockerfile')}
                                        className="p-1.5 hover:bg-cyan-500/10 text-cyan-500 rounded-lg transition-colors"
                                        title="Edit Dockerfile"
                                    >
                                        <FileCode size={14} />
                                    </button>
                                    <div className="w-px h-6 bg-outline/10 mx-1" />
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handleAction(() => DockerClient.composeUp(file.path))}
                                            className="p-1.5 hover:bg-green-500/10 text-green-500 rounded-lg transition-colors"
                                            title="Start as Compose"
                                        >
                                            <Play size={16} fill="currentColor" />
                                        </button>
                                        <button
                                            onClick={() => handleAction(() => DockerClient.composeBuild(file.path))}
                                            className="p-1.5 hover:bg-amber-500/10 text-amber-500 rounded-lg transition-colors"
                                            title="Build Images"
                                        >
                                            <Hammer size={16} />
                                        </button>
                                        <button
                                            onClick={() => {
                                                const stackName = prompt('Enter stack name:', file.name);
                                                if (stackName) {
                                                    handleAction(() => DockerClient.deployStack({
                                                        stackName: stackName.trim(),
                                                        composeFile: file.path
                                                    }));
                                                }
                                            }}
                                            className="p-1.5 hover:bg-indigo-500/10 text-indigo-500 rounded-lg transition-colors"
                                            title="Deploy as Stack"
                                        >
                                            <Layers size={14} />
                                        </button>
                                        <button
                                            onClick={async () => {
                                                const stackName = prompt('Enter stack name for migration:', file.name);
                                                if (!stackName) return;

                                                if (!confirm(`Migrate "${file.name}" from Compose to Stack "${stackName}"?\n\nThis will:\n1. Stop the current compose project\n2. Deploy it as a Docker stack`)) {
                                                    return;
                                                }

                                                setIsLoading(true);
                                                try {
                                                    const result = await DockerClient.migrateComposeToStack({
                                                        composeFile: file.path,
                                                        stackName: stackName.trim()
                                                    });
                                                    if (result.success) {
                                                        toast.success(result.message || 'Successfully migrated to stack');
                                                        await fetchComposeFiles();
                                                        await fetchStacks();
                                                    } else {
                                                        toast.error(result.message || 'Failed to migrate');
                                                    }
                                                } catch (e) {
                                                    toast.error('Failed to migrate compose to stack');
                                                } finally {
                                                    setIsLoading(false);
                                                }
                                            }}
                                            className="p-1.5 hover:bg-purple-500/10 text-purple-500 rounded-lg transition-colors"
                                            title="Migrate to Stack"
                                        >
                                            <Activity size={14} />
                                        </button>
                                    </div>
                                    <div className="w-px h-6 bg-outline/10 mx-1" />
                                    <button
                                        onClick={() => handleAction(() => DockerClient.composeDown(file.path))}
                                        className="p-1.5 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"
                                        title="Stop Compose"
                                    >
                                        <Square size={14} fill="currentColor" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            ) : (
                <div className="flex flex-col lg:flex-row gap-6 h-full pb-10 sm:pb-0 overflow-visible">
                    {/* Stacks List */}
                    <div className="lg:w-1/2 flex flex-col bg-surface/30 border border-outline/10 rounded-xl overflow-hidden min-h-[400px]">
                        {filteredStacks.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center text-on-surface-variant p-8">
                                No stacks found
                            </div>
                        ) : (
                            <div className="divide-y divide-outline/5">
                                {filteredStacks.map(stack => (
                                    <div
                                        key={stack.name}
                                        onClick={() => setSelectedStack(stack)}
                                        className={`p-4 cursor-pointer transition-colors ${selectedStack?.name === stack.name
                                            ? 'bg-primary/10 border-l-4 border-primary'
                                            : 'hover:bg-white/[0.02]'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                                                    <Layers size={18} className="text-indigo-500" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <div className="font-bold text-on-surface">{stack.name}</div>
                                                        {(() => {
                                                            const status = stackStatuses[stack.name] || 'unknown';
                                                            const statusConfigMap = {
                                                                active: { icon: <CheckCircle size={12} />, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Running' },
                                                                stopped: { icon: <Square size={12} />, color: 'text-orange-500', bg: 'bg-orange-500/10', label: 'Stopped' },
                                                                'not found': { icon: <XCircle size={12} />, color: 'text-gray-500', bg: 'bg-gray-500/10', label: 'Not Found' },
                                                                unknown: { icon: <AlertCircle size={12} />, color: 'text-on-surface-variant', bg: 'bg-surface-variant/10', label: 'Unknown' }
                                                            };
                                                            const statusConfig = statusConfigMap[status as keyof typeof statusConfigMap] || statusConfigMap.unknown;
                                                            return (
                                                                <span className={`text-[9px] ${statusConfig.bg} ${statusConfig.color} px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1`}>
                                                                    {statusConfig.icon}
                                                                    {statusConfig.label}
                                                                </span>
                                                            );
                                                        })()}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                                                        <span>{stack.services} service{stack.services !== 1 ? 's' : ''}</span>
                                                        {(() => {
                                                            const status = stackStatuses[stack.name] || 'unknown';
                                                            if (status === 'active') {
                                                                return (
                                                                    <span className="text-green-500 font-bold">
                                                                        • Running
                                                                    </span>
                                                                );
                                                            }
                                                            return null;
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const composeFile = prompt('Enter compose file path:', '');
                                                        if (composeFile) {
                                                            handleAction(() => DockerClient.startStack({
                                                                stackName: stack.name,
                                                                composeFile: composeFile.trim()
                                                            }));
                                                        }
                                                    }}
                                                    className="p-2 hover:bg-green-500/10 text-green-500 rounded-lg transition-colors"
                                                    title="Start Stack"
                                                >
                                                    <Play size={16} fill="currentColor" />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleAction(() => DockerClient.stopStack(stack.name));
                                                    }}
                                                    className="p-2 hover:bg-orange-500/10 text-orange-500 rounded-lg transition-colors"
                                                    title="Stop Stack"
                                                >
                                                    <Square size={16} fill="currentColor" />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const composeFile = prompt('Enter compose file path:', '');
                                                        if (composeFile) {
                                                            handleAction(() => DockerClient.restartStack({
                                                                stackName: stack.name,
                                                                composeFile: composeFile.trim()
                                                            }));
                                                        }
                                                    }}
                                                    className="p-2 hover:bg-blue-500/10 text-blue-500 rounded-lg transition-colors"
                                                    title="Restart Stack"
                                                >
                                                    <RotateCw size={16} />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const composeFile = prompt('Enter compose file path:', '');
                                                        if (composeFile) {
                                                            handleAction(() => DockerClient.updateStack({
                                                                stackName: stack.name,
                                                                composeFile: composeFile.trim()
                                                            }));
                                                        }
                                                    }}
                                                    className="p-2 hover:bg-purple-500/10 text-purple-500 rounded-lg transition-colors"
                                                    title="Update Stack"
                                                >
                                                    <Power size={16} />
                                                </button>
                                                <div className="w-px h-6 bg-outline/10 mx-1" />
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRemoveStack(stack.name);
                                                    }}
                                                    className="p-2 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"
                                                    title="Remove Stack"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Stack Details */}
                    {selectedStack && (
                        <div className="lg:w-1/2 flex flex-col bg-surface/30 border border-outline/10 rounded-xl p-4 sm:p-6 overflow-y-auto min-h-[400px]">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold">{selectedStack.name}</h2>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={async () => {
                                            const composeFile = prompt('Enter compose file path:', '');
                                            if (composeFile) {
                                                setIsLoading(true);
                                                try {
                                                    const result = await DockerClient.startStack({
                                                        stackName: selectedStack.name,
                                                        composeFile: composeFile.trim()
                                                    });
                                                    if (result.success) {
                                                        toast.success(`Stack "${selectedStack.name}" started successfully`);
                                                        await fetchStacks();
                                                        await fetchStackDetails(selectedStack.name);
                                                    } else {
                                                        toast.error(result.message || 'Failed to start stack');
                                                    }
                                                } catch (e) {
                                                    toast.error('Failed to start stack');
                                                } finally {
                                                    setIsLoading(false);
                                                }
                                            }
                                        }}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 text-green-500 border border-green-500/20 rounded-lg hover:bg-green-500/20 transition-colors text-sm font-bold"
                                        title="Start Stack"
                                    >
                                        <Play size={14} fill="currentColor" />
                                        Start
                                    </button>
                                    <button
                                        onClick={async () => {
                                            setIsLoading(true);
                                            try {
                                                const result = await DockerClient.stopStack(selectedStack.name);
                                                if (result.success) {
                                                    toast.success(`Stack "${selectedStack.name}" stopped successfully`);
                                                    await fetchStacks();
                                                    await fetchStackDetails(selectedStack.name);
                                                } else {
                                                    toast.error(result.message || 'Failed to stop stack');
                                                }
                                            } catch (e) {
                                                toast.error('Failed to stop stack');
                                            } finally {
                                                setIsLoading(false);
                                            }
                                        }}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 text-orange-500 border border-orange-500/20 rounded-lg hover:bg-orange-500/20 transition-colors text-sm font-bold"
                                        title="Stop Stack"
                                    >
                                        <Square size={14} fill="currentColor" />
                                        Stop
                                    </button>
                                    <button
                                        onClick={async () => {
                                            const composeFile = prompt('Enter compose file path:', '');
                                            if (composeFile) {
                                                setIsLoading(true);
                                                try {
                                                    const result = await DockerClient.restartStack({
                                                        stackName: selectedStack.name,
                                                        composeFile: composeFile.trim()
                                                    });
                                                    if (result.success) {
                                                        toast.success(`Stack "${selectedStack.name}" restarted successfully`);
                                                        await fetchStacks();
                                                        await fetchStackDetails(selectedStack.name);
                                                    } else {
                                                        toast.error(result.message || 'Failed to restart stack');
                                                    }
                                                } catch (e) {
                                                    toast.error('Failed to restart stack');
                                                } finally {
                                                    setIsLoading(false);
                                                }
                                            }
                                        }}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-colors text-sm font-bold"
                                        title="Restart Stack"
                                    >
                                        <RotateCw size={14} />
                                        Restart
                                    </button>
                                    <button
                                        onClick={async () => {
                                            const composeFile = prompt('Enter compose file path:', '');
                                            if (composeFile) {
                                                setIsLoading(true);
                                                try {
                                                    const result = await DockerClient.updateStack({
                                                        stackName: selectedStack.name,
                                                        composeFile: composeFile.trim()
                                                    });
                                                    if (result.success) {
                                                        toast.success(`Stack "${selectedStack.name}" updated successfully`);
                                                        await fetchStacks();
                                                        await fetchStackDetails(selectedStack.name);
                                                    } else {
                                                        toast.error(result.message || 'Failed to update stack');
                                                    }
                                                } catch (e) {
                                                    toast.error('Failed to update stack');
                                                } finally {
                                                    setIsLoading(false);
                                                }
                                            }
                                        }}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 text-purple-500 border border-purple-500/20 rounded-lg hover:bg-purple-500/20 transition-colors text-sm font-bold"
                                        title="Update Stack"
                                    >
                                        <Power size={14} />
                                        Update
                                    </button>
                                    <button
                                        onClick={() => setSelectedStack(null)}
                                        className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            {/* Services */}
                            <div className="mb-6">
                                <h3 className="text-sm font-bold text-on-surface-variant uppercase mb-3 flex items-center gap-2">
                                    <Server size={16} />
                                    Services ({stackServices.length})
                                    {(() => {
                                        const runningCount = stackServices.filter(s => {
                                            const replicas = s.replicas.split('/');
                                            return replicas.length === 2 && parseInt(replicas[0]) > 0;
                                        }).length;
                                        return runningCount > 0 && (
                                            <span className="text-green-500 font-normal normal-case ml-2">
                                                ({runningCount} running)
                                            </span>
                                        );
                                    })()}
                                </h3>
                                {stackServices.length === 0 ? (
                                    <div className="text-sm text-on-surface-variant">No services</div>
                                ) : (
                                    <div className="space-y-2">
                                        {stackServices.map(service => {
                                            const replicas = service.replicas.split('/');
                                            const running = replicas.length === 2 ? parseInt(replicas[0]) : 0;
                                            const desired = replicas.length === 2 ? parseInt(replicas[1]) : 0;
                                            const isRunning = running > 0;
                                            const isHealthy = running === desired && desired > 0;

                                            return (
                                                <div key={service.id} className={`bg-black/20 border rounded-lg p-3 ${isHealthy ? 'border-green-500/30' : isRunning ? 'border-yellow-500/30' : 'border-outline/10'
                                                    }`}>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-on-surface">{service.name}</span>
                                                            {isRunning && (
                                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${isHealthy
                                                                    ? 'bg-green-500/20 text-green-500'
                                                                    : 'bg-yellow-500/20 text-yellow-500'
                                                                    }`}>
                                                                    {isHealthy ? '✓ Healthy' : '⚠ Partial'}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-xs px-2 py-1 rounded font-bold ${isRunning
                                                                ? 'bg-green-500/20 text-green-500'
                                                                : 'bg-gray-500/20 text-gray-500'
                                                                }`}>
                                                                {service.replicas}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="text-xs text-on-surface-variant space-y-1">
                                                        <div>Image: <span className="font-mono">{service.image}</span></div>
                                                        <div>Mode: {service.mode}</div>
                                                        {service.ports && <div>Ports: {service.ports}</div>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Tasks */}
                            <div>
                                <h3 className="text-sm font-bold text-on-surface-variant uppercase mb-3 flex items-center gap-2">
                                    <Activity size={16} />
                                    Tasks ({stackTasks.length})
                                    {(() => {
                                        const runningTasks = stackTasks.filter(t => t.currentState === 'Running').length;
                                        return runningTasks > 0 && (
                                            <span className="text-green-500 font-normal normal-case ml-2">
                                                ({runningTasks} running)
                                            </span>
                                        );
                                    })()}
                                </h3>
                                {stackTasks.length === 0 ? (
                                    <div className="text-sm text-on-surface-variant">No tasks</div>
                                ) : (
                                    <div className="space-y-2">
                                        {stackTasks.map(task => (
                                            <div key={task.id} className="bg-black/20 border border-outline/10 rounded-lg p-3">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="font-bold text-on-surface text-sm">{task.name}</span>
                                                    <span className={`text-xs px-2 py-1 rounded ${task.currentState === 'Running'
                                                        ? 'bg-green-500/10 text-green-500'
                                                        : task.currentState === 'Failed'
                                                            ? 'bg-red-500/10 text-red-500'
                                                            : 'bg-orange-500/10 text-orange-500'
                                                        }`}>
                                                        {task.currentState}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-on-surface-variant space-y-1">
                                                    <div>Node: {task.node}</div>
                                                    <div>Desired: {task.desiredState}</div>
                                                    {task.error && (
                                                        <div className="text-red-500">Error: {task.error}</div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Editor Modal */}
            {isEditorOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-surface border border-outline/20 rounded-3xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                        <div className="p-6 border-b border-outline/10 flex items-center justify-between bg-surface/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                    <FileCode size={24} />
                                </div>
                                <h2 className="text-xl font-bold">
                                    {editingFile ? `Edit ${editingFile.name} / ${editingFileName}` : 'Create New Compose Project'}
                                </h2>
                            </div>
                            <button onClick={() => setIsEditorOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-hidden flex flex-col">
                            <div className="p-4 bg-surface/30 border-b border-outline/10 flex items-center gap-4">
                                <div className="flex-1 flex gap-3 items-end">
                                    <div className="flex-1">
                                        <label className="text-[10px] text-on-surface-variant uppercase font-bold mb-1 block">Project Name</label>
                                        <input
                                            type="text"
                                            value={projectName}
                                            onChange={(e) => setProjectName(e.target.value)}
                                            placeholder="e.g. my-app"
                                            disabled={!!editingFile}
                                            className="w-full bg-black/20 border border-outline/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
                                        />
                                    </div>
                                    <div className="relative">
                                        <input
                                            type="file"
                                            id="restore-file"
                                            className="hidden"
                                            accept=".yml,.yaml"
                                            onChange={handleRestoreFromFile}
                                        />
                                        <label
                                            htmlFor="restore-file"
                                            className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-outline/20 rounded-lg text-xs font-bold hover:bg-white/10 cursor-pointer transition-colors whitespace-nowrap"
                                        >
                                            <Upload size={14} />
                                            Restore YAML
                                        </label>
                                    </div>
                                </div>
                                <div className="flex items-center bg-black/20 rounded-xl p-1 border border-outline/10">
                                    <button
                                        onClick={() => setActiveTab('editor')}
                                        className={`px-4 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold transition-all ${activeTab === 'editor' ? 'bg-primary text-on-primary shadow-lg' : 'text-on-surface-variant hover:text-on-surface'}`}
                                    >
                                        <FileCode size={16} />
                                        YAML
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('wizard')}
                                        className={`px-4 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold transition-all ${activeTab === 'wizard' ? 'bg-primary text-on-primary shadow-lg' : 'text-on-surface-variant hover:text-on-surface'}`}
                                    >
                                        <Wand2 size={16} />
                                        Wizard
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-auto bg-[#1e1e1e]">
                                {activeTab === 'editor' ? (
                                    <Editor
                                        height="100%"
                                        defaultLanguage="yaml"
                                        theme="vs-dark"
                                        value={editorContent}
                                        onChange={(value) => setEditorContent(value || '')}
                                        options={{
                                            minimap: { enabled: false },
                                            fontSize: 14,
                                            lineNumbers: 'on',
                                            roundedSelection: true,
                                            scrollBeyondLastLine: false,
                                            readOnly: false,
                                            automaticLayout: true,
                                            padding: { top: 16 }
                                        }}
                                    />
                                ) : (
                                    <div className="p-4">
                                        <ComposeWizard onGenerate={(yml) => {
                                            setEditorContent(yml);
                                            setActiveTab('editor');
                                        }} />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-4 sm:p-6 border-t border-outline/10 bg-surface/50 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
                            <div className="flex flex-wrap gap-2">
                                {projectName && (
                                    <>
                                        <button
                                            onClick={async () => {
                                                const filePath = editingFile?.path || `${composeFiles.find(f => f.name === projectName)?.path || ''}`;
                                                if (!filePath && !editingFile) {
                                                    // Save first if new project
                                                    await handleSave();
                                                    const savedFile = composeFiles.find(f => f.name === projectName);
                                                    if (savedFile) {
                                                        setIsEditorOpen(false);
                                                        setIsLoading(true);
                                                        try {
                                                            const result = await DockerClient.composeUp(savedFile.path);
                                                            if (result?.success) {
                                                                toast.success('Started as Compose');
                                                            } else {
                                                                toast.error(result?.message || 'Failed to start');
                                                            }
                                                        } catch (e) {
                                                            toast.error('Failed to start compose');
                                                        } finally {
                                                            setIsLoading(false);
                                                        }
                                                    }
                                                } else {
                                                    setIsEditorOpen(false);
                                                    setIsLoading(true);
                                                    try {
                                                        const result = await DockerClient.composeUp(filePath);
                                                        if (result?.success) {
                                                            toast.success('Started as Compose');
                                                        } else {
                                                            toast.error(result?.message || 'Failed to start');
                                                        }
                                                    } catch (e) {
                                                        toast.error('Failed to start compose');
                                                    } finally {
                                                        setIsLoading(false);
                                                    }
                                                }
                                            }}
                                            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-green-500/10 text-green-500 border border-green-500/20 rounded-xl hover:bg-green-500/20 transition-colors text-xs sm:text-sm font-bold flex items-center gap-2"
                                        >
                                            <Play size={14} fill="currentColor" />
                                            Start Compose
                                        </button>
                                        <button
                                            onClick={async () => {
                                                const stackName = prompt('Enter stack name:', projectName || editingFile?.name);
                                                if (!stackName) return;

                                                const filePath = editingFile?.path || `${composeFiles.find(f => f.name === projectName)?.path || ''}`;
                                                if (!filePath && !editingFile) {
                                                    // Save first if new project
                                                    await handleSave();
                                                    const savedFile = composeFiles.find(f => f.name === projectName);
                                                    if (savedFile) {
                                                        setIsEditorOpen(false);
                                                        setIsLoading(true);
                                                        try {
                                                            const result = await DockerClient.deployStack({
                                                                stackName: stackName.trim(),
                                                                composeFile: savedFile.path
                                                            });
                                                            if (result.success) {
                                                                toast.success(`Deployed as Stack: ${stackName}`);
                                                                await fetchStacks();
                                                            } else {
                                                                toast.error(result.message || 'Failed to deploy stack');
                                                            }
                                                        } catch (e) {
                                                            toast.error('Failed to deploy stack');
                                                        } finally {
                                                            setIsLoading(false);
                                                        }
                                                    }
                                                } else {
                                                    setIsEditorOpen(false);
                                                    setIsLoading(true);
                                                    try {
                                                        const result = await DockerClient.deployStack({
                                                            stackName: stackName.trim(),
                                                            composeFile: filePath
                                                        });
                                                        if (result.success) {
                                                            toast.success(`Deployed as Stack: ${stackName}`);
                                                            await fetchStacks();
                                                        } else {
                                                            toast.error(result.message || 'Failed to deploy stack');
                                                        }
                                                    } catch (e) {
                                                        toast.error('Failed to deploy stack');
                                                    } finally {
                                                        setIsLoading(false);
                                                    }
                                                }
                                            }}
                                            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 rounded-xl hover:bg-indigo-500/20 transition-colors text-xs sm:text-sm font-bold flex items-center gap-2"
                                        >
                                            <Layers size={14} />
                                            Deploy Stack
                                        </button>
                                    </>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setIsEditorOpen(false)}
                                    className="flex-1 sm:flex-none px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl hover:bg-white/5 transition-colors text-xs sm:text-sm font-bold border border-outline/20"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="flex-1 sm:flex-none px-4 sm:px-6 py-2 sm:py-2.5 bg-primary text-on-primary rounded-xl hover:bg-primary/90 transition-all text-xs sm:text-sm font-bold flex items-center gap-2 shadow-lg shadow-primary/20"
                                >
                                    <Save size={18} />
                                    {editingFile ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Deploy Stack Modal */}
            {isDeployModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-surface border border-outline/20 rounded-2xl w-full max-w-md shadow-2xl p-6">
                        <h2 className="text-lg font-bold mb-4">Deploy Docker Stack</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1 ml-1">
                                    Stack Name
                                </label>
                                <input
                                    type="text"
                                    value={deployStackName}
                                    onChange={(e) => setDeployStackName(e.target.value)}
                                    placeholder="e.g. my-stack"
                                    className="w-full bg-white/5 border border-outline/20 rounded-xl px-4 py-2 focus:outline-none focus:border-primary"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1 ml-1">
                                    Compose File Path
                                </label>
                                <input
                                    type="text"
                                    value={deployComposeFile}
                                    onChange={(e) => setDeployComposeFile(e.target.value)}
                                    placeholder="/path/to/docker-compose.yml"
                                    className="w-full bg-white/5 border border-outline/20 rounded-xl px-4 py-2 focus:outline-none focus:border-primary font-mono text-sm"
                                />
                                <p className="text-[10px] text-on-surface-variant mt-1 ml-1">
                                    Absolute path to your docker-compose.yml file
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2 mt-6">
                            <button
                                onClick={() => {
                                    setIsDeployModalOpen(false);
                                    setDeployStackName('');
                                    setDeployComposeFile('');
                                }}
                                className="flex-1 px-4 py-2 rounded-xl border border-outline/20 hover:bg-white/5 text-sm font-bold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeployStack}
                                disabled={isLoading || !deployStackName || !deployComposeFile}
                                className="flex-1 bg-primary text-on-primary px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 disabled:opacity-50"
                            >
                                {isLoading ? 'Deploying...' : 'Deploy Stack'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ComposeWizard({ onGenerate }: { onGenerate: (yml: string) => void }) {
    const [serviceName, setServiceName] = useState('web');
    const [image, setImage] = useState('nginx:latest');
    const [port, setPort] = useState('80:80');

    const generate = () => {
        const yml = `services:
  ${serviceName}:
    image: ${image}
    ports:
      - "${port}"
    restart: always`;
        onGenerate(yml);
    };

    return (
        <div className="max-w-md mx-auto space-y-6 py-8">
            <div className="space-y-4">
                <div>
                    <label className="text-[10px] text-on-surface-variant uppercase font-bold mb-1.5 block">Service Name</label>
                    <input
                        type="text"
                        value={serviceName}
                        onChange={(e) => setServiceName(e.target.value)}
                        className="w-full bg-black/20 border border-outline/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
                <div>
                    <label className="text-[10px] text-on-surface-variant uppercase font-bold mb-1.5 block">Docker Image</label>
                    <input
                        type="text"
                        value={image}
                        onChange={(e) => setImage(e.target.value)}
                        className="w-full bg-black/20 border border-outline/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
                <div>
                    <label className="text-[10px] text-on-surface-variant uppercase font-bold mb-1.5 block">Port Mapping (Host:Container)</label>
                    <input
                        type="text"
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                        className="w-full bg-black/20 border border-outline/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
            </div>
            <button
                onClick={generate}
                className="w-full py-4 bg-primary/10 text-primary border border-primary/20 rounded-xl hover:bg-primary hover:text-on-primary transition-all font-bold flex items-center justify-center gap-3 group"
            >
                <Wand2 size={24} className="group-hover:rotate-12 transition-transform" />
                Generate YAML
            </button>
        </div>
    );
}
