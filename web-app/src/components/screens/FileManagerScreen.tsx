'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    File, Folder, Download, Upload, Trash2,
    ArrowLeft, Plus, Archive, ExternalLink,
    MoreVertical, Search, RefreshCcw, Scissors, Eye, Loader2
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
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
    const [viewingFile, setViewingFile] = useState<{ path: string, content: string, mode: 'head' | 'tail' } | null>(null);
    const [loadingFile, setLoadingFile] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="flex flex-col h-full gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Toolbar & Breadcrumbs */}
            <div className="flex items-center justify-between gap-4 bg-surface p-2 rounded-xl border border-outline/10 h-14 shrink-0">
                {/* Breadcrumb Path */}
                <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto whitespace-nowrap scrollbar-hide px-2">
                    <button
                        onClick={() => setCurrentPath('')}
                        className={`p-1.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${!currentPath ? 'bg-primary text-on-primary' : 'hover:bg-white/10 text-on-surface-variant'}`}
                    >
                        root
                    </button>
                    {currentPath.split('/').filter(p => p).map((part, idx, arr) => (
                        <div key={idx} className="flex items-center">
                            <span className="text-outline/20 mx-1">/</span>
                            <button
                                onClick={() => setCurrentPath(arr.slice(0, idx + 1).join('/'))}
                                className="p-1.5 px-3 hover:bg-white/10 rounded-lg text-sm font-medium text-on-surface transition-all flex items-center gap-2"
                            >
                                <Folder size={14} className="opacity-50" />
                                {part}
                            </button>
                        </div>
                    ))}
                </div>

                {/* Actions & Search */}
                <div className="flex items-center gap-2 shrink-0 px-2 border-l border-outline/10 pl-4">
                    <div className="relative w-48 focus-within:w-64 transition-all mr-2">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant w-3.5 h-3.5" />
                        <input
                            type="text"
                            placeholder="Search files..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 bg-black/20 border border-outline/10 rounded-lg text-xs text-on-surface focus:outline-none focus:border-primary/50 transition-all font-medium placeholder:text-outline/30"
                        />
                    </div>

                    <ActionIconButton
                        onClick={() => fileInputRef.current?.click()}
                        icon={<Upload size={16} />}
                        title="Upload"
                        color="blue"
                    />
                    <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" multiple />

                    <ActionIconButton
                        onClick={handleMkdir}
                        icon={<Plus size={16} />}
                        title="New Folder"
                        color="green"
                    />

                    <ActionIconButton
                        onClick={loadFiles}
                        icon={<RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />}
                        title="Refresh"
                    />
                </div>
            </div>

            {/* File List */}
            <div className="flex-1 bg-surface border border-outline/10 rounded-xl overflow-hidden flex flex-col">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-surface-variant/50 border-b border-outline/10 text-on-surface-variant text-[10px] font-bold uppercase tracking-wider">
                                <th className="px-4 py-3 w-10 text-center">
                                    <input type="checkbox" className="rounded border-outline/20 bg-black/20 text-primary focus:ring-primary focus:ring-offset-0" />
                                </th>
                                <th className="px-3 py-3">Name</th>
                                <th className="px-3 py-3 w-28">Size</th>
                                <th className="px-3 py-3 w-40">Modified</th>
                                <th className="px-4 py-3 w-32 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-outline/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center text-on-surface-variant">
                                        <div className="flex flex-col items-center gap-4">
                                            <Loader2 className="animate-spin text-primary" size={32} />
                                            <p className="text-sm font-medium opacity-50">Scanning directory...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredFiles.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-32 text-center text-on-surface-variant">
                                        <div className="flex flex-col items-center opacity-50">
                                            <Folder className="text-6xl mb-4 opacity-20" />
                                            <p className="text-lg font-medium">Empty directory</p>
                                            <p className="text-xs mt-1">No files found in this location</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredFiles.map((file) => (
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
