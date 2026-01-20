'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    File, Folder, Download, Upload, Trash2,
    ArrowLeft, Plus, Archive, ExternalLink,
    Search, RefreshCcw, Eye, EyeOff, Loader2, LayoutList, Grid2X2
} from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { FileItem } from '@/lib/types';
import { Editor } from '@monaco-editor/react';
import { Modal } from '../ui/Modal';
import { ActionIconButton, Button } from '../ui/Buttons';

export default function FileManagerScreen() {
    const [currentPath, setCurrentPath] = useState('');
    const [files, setFiles] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [sortConfig, setSortConfig] = useState<{ key: keyof FileItem, direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
    const [showHidden, setShowHidden] = useState(false);
    const [hasHydrated, setHasHydrated] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
    const [viewingFile, setViewingFile] = useState<{ path: string, content: string, mode: 'head' | 'tail' } | null>(null);
    const [loadingFile, setLoadingFile] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Persist View Settings
    useEffect(() => {
        const savedViewMode = localStorage.getItem('fm_viewMode') as 'list' | 'grid';
        const savedSort = localStorage.getItem('fm_sortConfig');
        const savedShowHidden = localStorage.getItem('fm_showHidden');
        if (savedViewMode) setViewMode(savedViewMode);
        if (savedSort) setSortConfig(JSON.parse(savedSort));
        if (savedShowHidden) setShowHidden(savedShowHidden === 'true');
        setHasHydrated(true);
    }, []);

    useEffect(() => {
        if (!hasHydrated) return;
        localStorage.setItem('fm_viewMode', viewMode);
        localStorage.setItem('fm_sortConfig', JSON.stringify(sortConfig));
        localStorage.setItem('fm_showHidden', String(showHidden));
    }, [viewMode, sortConfig, showHidden, hasHydrated]);

    const loadFiles = async () => {
        setLoading(true);
        const data = await DockerClient.listFiles(currentPath);
        // Sort: Directories first, then alphabetical
        const sorted = data.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });
        setFiles(sorted);
        setLoading(false);
    };

    useEffect(() => {
        loadFiles();
        setSelectedFiles(new Set());
    }, [currentPath]);

    const handleFolderClick = (path: string) => {
        setCurrentPath(path);
    };

    const handleBackClick = () => {
        const parts = currentPath.split('/').filter(p => p.length > 0);
        parts.pop();
        setCurrentPath(parts.join('/'));
    };

    const handleDelete = async (path: string) => {
        if (confirm('Are you sure you want to delete this file/folder?')) {
            const success = await DockerClient.deleteFile(path);
            if (success) loadFiles();
        }
    };

    const handleMkdir = async () => {
        const name = prompt('Enter directory name:');
        if (name) {
            const success = await DockerClient.createDirectory(currentPath ? `${currentPath}/${name}` : name);
            if (success) loadFiles();
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const uploadedFiles = e.target.files;
        if (uploadedFiles && uploadedFiles.length > 0) {
            setLoading(true);
            for (let i = 0; i < uploadedFiles.length; i++) {
                await DockerClient.uploadFile(currentPath, uploadedFiles[i]);
            }
            loadFiles();
        }
    };

    const handleZip = async (path: string) => {
        const target = prompt('Enter zip filename (without .zip):', 'archive');
        if (target) {
            const success = await DockerClient.zipFile(path, target);
            if (success) loadFiles();
        }
    };

    const handleUnzip = async (path: string) => {
        const target = prompt('Enter extraction path (blank for current):', '.');
        if (target !== null) {
            const success = await DockerClient.unzipFile(path, target === '.' ? currentPath : target);
            if (success) loadFiles();
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '---';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const handleView = async (path: string, mode: 'head' | 'tail' = 'head') => {
        setLoadingFile(path);
        try {
            const content = await DockerClient.getFileContent(path, mode);
            setViewingFile({ path, content, mode });
        } catch (e) {
            console.error(e);
            alert('Failed to read file');
        } finally {
            setLoadingFile(null);
        }
    };

    const handleSwitchMode = async (mode: 'head' | 'tail') => {
        if (!viewingFile) return;
        setLoadingFile(viewingFile.path);
        try {
            const content = await DockerClient.getFileContent(viewingFile.path, mode);
            setViewingFile({ ...viewingFile, content, mode });
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingFile(null);
        }
    };

    const handleToggleSelectAll = () => {
        if (selectedFiles.size === sortedAndFilteredFiles.length && sortedAndFilteredFiles.length > 0) {
            setSelectedFiles(new Set());
        } else {
            setSelectedFiles(new Set(sortedAndFilteredFiles.map(f => f.path)));
        }
    };

    const handleBulkDelete = async () => {
        if (selectedFiles.size === 0) return;
        if (confirm(`Are you sure you want to delete ${selectedFiles.size} items?`)) {
            setLoading(true);
            const paths = Array.from(selectedFiles);
            let successCount = 0;
            for (const path of paths) {
                const success = await DockerClient.deleteFile(path);
                if (success) successCount++;
            }
            if (successCount > 0) {
                loadFiles();
                setSelectedFiles(new Set());
            }
            setLoading(false);
        }
    };

    const handleBulkZip = async () => {
        if (selectedFiles.size === 0) return;
        const target = prompt('Enter name for the zip archive (without .zip):', 'archive');
        if (!target) return;

        setLoading(true);
        const paths = Array.from(selectedFiles);
        const success = await DockerClient.zipBulk(paths, target);
        if (success) {
            loadFiles();
            setSelectedFiles(new Set());
        }
        setLoading(false);
    };

    const handleSort = (key: keyof FileItem) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const sortedAndFilteredFiles = React.useMemo(() => {
        let result = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

        if (!showHidden) {
            result = result.filter(f => !f.name.startsWith('.'));
        }

        result.sort((a, b) => {
            // Directories always first
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;

            const valA = a[sortConfig.key];
            const valB = b[sortConfig.key];

            if (valA === undefined || valB === undefined) return 0;

            let comparison = 0;
            if (typeof valA === 'string' && typeof valB === 'string') {
                comparison = valA.localeCompare(valB);
            } else if (typeof valA === 'number' && typeof valB === 'number') {
                comparison = valA - valB;
            }

            return sortConfig.direction === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [files, searchQuery, sortConfig]);

    const SortIcon = ({ column }: { column: keyof FileItem }) => {
        if (sortConfig.key !== column) return <div className="w-3 h-3 opacity-0 group-hover:opacity-20 flex items-center justify-center"><RefreshCcw size={10} /></div>;
        return <span className="ml-1 text-primary">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    return (
        <div className="flex flex-col h-full gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Toolbar & Breadcrumbs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface p-3 rounded-xl border border-outline/10 min-h-[3.5rem] shrink-0">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {/* Dedicated Back Button */}
                    <button
                        onClick={handleBackClick}
                        disabled={!currentPath}
                        className={`p-2 rounded-lg transition-all shrink-0 ${!currentPath ? 'opacity-20 cursor-not-allowed text-on-surface-variant' : 'hover:bg-white/10 text-primary'}`}
                        title="Go Up"
                    >
                        <ArrowLeft size={18} strokeWidth={2.5} />
                    </button>

                    <div className="w-px h-6 bg-outline/10 mx-1 hidden sm:block" />

                    {/* Breadcrumb Path */}
                    <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto whitespace-nowrap scrollbar-hide px-1 py-1">
                        <button
                            onClick={() => setCurrentPath('')}
                            className={`p-1.5 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shrink-0 ${!currentPath ? 'bg-primary text-on-primary shadow-sm' : 'hover:bg-white/10 text-on-surface-variant'}`}
                        >
                            root
                        </button>
                        {currentPath.split('/').filter(p => p).map((part, idx, arr) => (
                            <div key={idx} className="flex items-center shrink-0">
                                <span className="text-outline/30 mx-0.5 sm:mx-1">/</span>
                                <button
                                    onClick={() => setCurrentPath(arr.slice(0, idx + 1).join('/'))}
                                    className={`p-1.5 px-2.5 sm:px-3 hover:bg-white/10 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 sm:gap-2 ${idx === arr.length - 1 ? 'text-primary' : 'text-on-surface'}`}
                                >
                                    <Folder size={14} className="opacity-40" />
                                    <span className="max-w-[80px] sm:max-w-[150px] truncate">{part}</span>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Actions & Search */}
                <div className="flex items-center gap-2 shrink-0 sm:border-l sm:border-outline/10 sm:pl-4">
                    <div className="relative flex-1 sm:w-48 sm:focus-within:w-64 transition-all">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant w-3.5 h-3.5" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 bg-black/20 border border-outline/10 rounded-lg text-xs text-on-surface focus:outline-none focus:border-primary/50 transition-all font-medium placeholder:text-outline/30"
                        />
                    </div>

                    <div className="flex items-center bg-black/20 rounded-lg p-1 border border-outline/10 mr-2">
                        <button
                            onClick={() => setShowHidden(!showHidden)}
                            className={`p-1 px-2 rounded-md transition-all mr-1 ${showHidden ? 'bg-amber-500/20 text-amber-500' : 'hover:bg-white/5 text-on-surface-variant'}`}
                            title={showHidden ? "Hide Hidden Files" : "Show Hidden Files"}
                        >
                            {showHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <div className="w-px h-4 bg-outline/10 mr-1" />
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-1 px-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-primary text-on-primary shadow-sm' : 'hover:bg-white/5 text-on-surface-variant'}`}
                        >
                            <LayoutList size={14} />
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-1 px-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-primary text-on-primary shadow-sm' : 'hover:bg-white/5 text-on-surface-variant'}`}
                        >
                            <Grid2X2 size={14} />
                        </button>
                    </div>

                    <div className="flex items-center gap-1">
                        <ActionIconButton
                            onClick={() => fileInputRef.current?.click()}
                            icon={<Upload size={14} />}
                            className="bg-blue-500/10 text-blue-500 border border-blue-500/20"
                            title="Upload"
                        />
                        <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" multiple />

                        <ActionIconButton
                            onClick={handleMkdir}
                            icon={<Plus size={14} />}
                            className="bg-green-500/10 text-green-500 border border-green-500/20"
                            title="New Folder"
                        />

                        <ActionIconButton
                            onClick={loadFiles}
                            icon={<RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />}
                            className="bg-white/5 border border-outline/10"
                            title="Refresh"
                        />

                        {selectedFiles.size > 0 && (
                            <>
                                <ActionIconButton
                                    onClick={handleBulkZip}
                                    icon={<Archive size={14} />}
                                    className="bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-in zoom-in-95"
                                    title={`Zip ${selectedFiles.size} selected`}
                                />
                                <ActionIconButton
                                    onClick={handleBulkDelete}
                                    icon={<Trash2 size={14} />}
                                    className="bg-red-500/10 text-red-500 border border-red-500/20 animate-in zoom-in-95"
                                    title={`Delete ${selectedFiles.size} selected`}
                                />
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* File List / Grid */}
            <div className="flex-1 bg-surface border border-outline/10 rounded-xl overflow-hidden flex flex-col">
                {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-on-surface-variant">
                        <Loader2 className="animate-spin text-primary" size={32} />
                        <p className="text-sm font-medium opacity-50">Scanning directory...</p>
                    </div>
                ) : sortedAndFilteredFiles.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-50 p-10 text-center">
                        <Folder className="text-6xl mb-4 opacity-20 text-on-surface-variant" />
                        <p className="text-lg font-medium text-on-surface-variant">Empty directory</p>
                        <p className="text-xs mt-1 text-on-surface-variant">No files found in this location</p>
                    </div>
                ) : viewMode === 'list' ? (
                    <div className="overflow-auto flex-1">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-surface-variant/50 border-b border-outline/10 text-on-surface-variant text-[10px] font-bold uppercase tracking-wider sticky top-0 z-10">
                                    <th className="px-4 py-3 w-10 text-center">
                                        <input
                                            type="checkbox"
                                            checked={sortedAndFilteredFiles.length > 0 && selectedFiles.size === sortedAndFilteredFiles.length}
                                            onChange={handleToggleSelectAll}
                                            className="rounded border-outline/20 bg-black/20 text-primary focus:ring-primary focus:ring-offset-0"
                                        />
                                    </th>
                                    <th className="px-3 py-3 cursor-pointer group hover:text-on-surface transition-colors" onClick={() => handleSort('name')}>
                                        <div className="flex items-center">Name <SortIcon column="name" /></div>
                                    </th>
                                    <th className="px-3 py-3 w-28 cursor-pointer group hover:text-on-surface transition-colors" onClick={() => handleSort('size')}>
                                        <div className="flex items-center">Size <SortIcon column="size" /></div>
                                    </th>
                                    <th className="px-3 py-3 w-40 cursor-pointer group hover:text-on-surface transition-colors" onClick={() => handleSort('lastModified')}>
                                        <div className="flex items-center">Modified <SortIcon column="lastModified" /></div>
                                    </th>
                                    <th className="px-4 py-3 w-32 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-outline/5">
                                {sortedAndFilteredFiles.map((file) => (
                                    <tr
                                        key={file.path}
                                        className={`group hover:bg-white/[0.02] transition-colors cursor-default ${selectedFiles.has(file.path) ? 'bg-primary/5' : ''}`}
                                        onDoubleClick={() => file.isDirectory && handleFolderClick(file.path)}
                                    >
                                        <td className="px-4 py-2 text-center">
                                            <input
                                                type="checkbox"
                                                checked={selectedFiles.has(file.path)}
                                                onChange={(e) => {
                                                    const newSet = new Set(selectedFiles);
                                                    if (e.target.checked) newSet.add(file.path);
                                                    else newSet.delete(file.path);
                                                    setSelectedFiles(newSet);
                                                }}
                                                className="rounded border-outline/20 bg-black/20 text-primary focus:ring-primary focus:ring-offset-0 align-middle"
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${file.isDirectory ? 'bg-primary/10 text-primary' : 'bg-surface-variant/20 text-on-surface-variant'}`}>
                                                    {file.isDirectory ? <Folder size={16} /> : <File size={16} />}
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <button
                                                        onClick={() => file.isDirectory && handleFolderClick(file.path)}
                                                        className={`text-left text-sm font-bold truncate hover:underline underline-offset-2 ${file.isDirectory ? 'text-primary' : 'text-on-surface'}`}
                                                    >
                                                        {file.name}
                                                    </button>
                                                    <span className="text-[9px] font-bold text-on-surface-variant/50 uppercase tracking-wider">{file.isDirectory ? 'DIR' : (file.extension || 'FILE')}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 text-xs font-mono text-on-surface-variant tabular-nums opacity-70">
                                            {formatSize(file.size)}
                                        </td>
                                        <td className="px-3 py-2 text-xs font-mono text-on-surface-variant opacity-70">
                                            {new Date(file.lastModified).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {!file.isDirectory && (
                                                    <button
                                                        onClick={() => handleView(file.path)}
                                                        className="p-1.5 hover:bg-emerald-500/10 text-emerald-500 rounded-md transition-all"
                                                        title="View Content"
                                                    >
                                                        {loadingFile === file.path ? <Loader2 className="animate-spin" size={16} /> : <Eye size={16} />}
                                                    </button>
                                                )}

                                                {!file.isDirectory && (
                                                    <a
                                                        href={DockerClient.downloadFileUrl(file.path)}
                                                        className="p-1.5 hover:bg-blue-500/10 text-blue-500 rounded-md transition-all"
                                                        title="Download"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        <Download size={16} />
                                                    </a>
                                                )}

                                                {file.isDirectory ? (
                                                    <button
                                                        onClick={() => handleZip(file.path)}
                                                        className="p-1.5 hover:bg-amber-500/10 text-amber-500 rounded-md transition-all"
                                                        title="Zip Archive"
                                                    >
                                                        <Archive size={16} />
                                                    </button>
                                                ) : (
                                                    file.extension === 'zip' && (
                                                        <button
                                                            onClick={() => handleUnzip(file.path)}
                                                            className="p-1.5 hover:bg-amber-500/10 text-amber-500 rounded-md transition-all"
                                                            title="Unzip"
                                                        >
                                                            <ExternalLink size={16} />
                                                        </button>
                                                    )
                                                )}

                                                <button
                                                    onClick={() => handleDelete(file.path)}
                                                    className="p-1.5 hover:bg-red-500/10 text-red-500 rounded-md transition-all"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="overflow-auto flex-1 p-3">
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12 gap-2 content-start">
                            {sortedAndFilteredFiles.map((file) => (
                                <div
                                    key={file.path}
                                    onClick={(e) => {
                                        if (e.ctrlKey || e.metaKey) {
                                            const newSet = new Set(selectedFiles);
                                            if (newSet.has(file.path)) newSet.delete(file.path);
                                            else newSet.add(file.path);
                                            setSelectedFiles(newSet);
                                        } else if (file.isDirectory) {
                                            handleFolderClick(file.path);
                                        }
                                    }}
                                    className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all group relative cursor-pointer ${selectedFiles.has(file.path) ? 'bg-primary/10 border-primary' : 'bg-black/10 border-outline/10 hover:bg-white/5 hover:border-outline/20'}`}
                                >
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-1.5 transition-transform group-hover:scale-105 ${file.isDirectory ? 'bg-primary/10 text-primary' : 'bg-surface-variant/20 text-on-surface-variant'}`}>
                                        {file.isDirectory ? <Folder size={20} /> : <File size={20} />}
                                    </div>
                                    <span className="text-[10px] font-bold text-center truncate w-full px-1 leading-tight" title={file.name}>
                                        {file.name}
                                    </span>
                                    <span className="text-[8px] text-on-surface-variant opacity-60 mt-0.5">
                                        {file.isDirectory ? 'Dir' : formatSize(file.size)}
                                    </span>

                                    {/* Quick Actions Overlay */}
                                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(file.path); }}
                                            className="p-1 bg-red-500/80 text-white rounded-md hover:bg-red-600 backdrop-blur-sm"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    </div>
                                    {selectedFiles.has(file.path) && (
                                        <div className="absolute top-1 left-1 w-3 h-3 bg-primary text-on-primary rounded-full flex items-center justify-center">
                                            <RefreshCcw size={8} strokeWidth={4} />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            {viewingFile && (
                <Modal
                    onClose={() => setViewingFile(null)}
                    title={viewingFile.path}
                    description="File Viewer"
                    icon={<Eye size={24} />}
                    maxWidth="max-w-4xl"
                    className="h-[80vh] flex flex-col"
                >
                    <div className="flex-1 flex flex-col min-h-0 mt-4 -mx-6 -mb-6 relative">
                        <div className="absolute top-0 right-0 p-4 z-10 flex gap-2">
                            <div className="bg-black/50 backdrop-blur rounded-lg p-1 flex gap-1 mr-2 border border-white/10">
                                <button
                                    onClick={() => handleSwitchMode('head')}
                                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${viewingFile.mode === 'head' ? 'bg-blue-600 text-white' : 'hover:bg-white/10 text-gray-400'}`}
                                >
                                    HEAD
                                </button>
                                <button
                                    onClick={() => handleSwitchMode('tail')}
                                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${viewingFile.mode === 'tail' ? 'bg-blue-600 text-white' : 'hover:bg-white/10 text-gray-400'}`}
                                >
                                    TAIL
                                </button>
                            </div>
                            <Button
                                variant="primary"
                                className="bg-black/50 backdrop-blur"
                                onClick={() => setViewingFile(null)}
                            >
                                Close Viewer
                            </Button>
                        </div>
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
                </Modal>
            )}
        </div>
    );
}
