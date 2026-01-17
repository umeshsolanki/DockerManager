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
import { Button } from '../ui/Buttons';

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
        <div className="flex flex-col h-full gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white">File Manager</h1>
                    <p className="text-gray-400 mt-1">Manage, upload and download files on the server</p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all font-medium"
                    >
                        <Upload className="text-lg" />
                        <span>Upload</span>
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleUpload}
                        className="hidden"
                        multiple
                    />

                    <button
                        onClick={handleMkdir}
                        className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg transition-all font-medium border border-white/10"
                    >
                        <Plus className="text-lg" />
                        <span>New Folder</span>
                    </button>

                    <button
                        onClick={loadFiles}
                        className="p-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition-all border border-white/10"
                        title="Refresh"
                    >
                        <RefreshCcw className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Path & Search Bar */}
            <div className="flex items-center gap-4 bg-white/5 p-2 rounded-xl border border-white/10 backdrop-blur-sm">
                <div className="flex items-center gap-1 flex-1 px-2 overflow-x-auto whitespace-nowrap scrollbar-hide">
                    <button
                        onClick={() => setCurrentPath('')}
                        className="p-1.5 hover:bg-white/10 rounded text-blue-400 font-medium"
                    >
                        root
                    </button>
                    {currentPath.split('/').filter(p => p.length > 0).map((part, idx, arr) => (
                        <React.Fragment key={idx}>
                            <span className="text-gray-600">/</span>
                            <button
                                onClick={() => setCurrentPath(arr.slice(0, idx + 1).join('/'))}
                                className="p-1.5 hover:bg-white/10 rounded text-blue-400 font-medium"
                            >
                                {part}
                            </button>
                        </React.Fragment>
                    ))}
                    {currentPath && (
                        <button
                            onClick={handleBackClick}
                            className="ml-2 p-1.5 hover:bg-white/10 rounded text-gray-400"
                            title="Go Back"
                        >
                            <ArrowLeft />
                        </button>
                    )}
                </div>
                <div className="relative w-64 md:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search files..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                    />
                </div>
            </div>

            {/* File List */}
            <div className="flex-1 bg-white/5 rounded-2xl border border-white/11 overflow-y-auto backdrop-blur-md custom-scrollbar">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white/5 text-gray-400 text-xs font-semibold uppercase tracking-wider">
                                <th className="px-6 py-4 w-12">
                                    <input type="checkbox" className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-600 focus:ring-offset-gray-900" />
                                </th>
                                <th className="px-6 py-4">Name</th>
                                <th className="px-4 py-4 w-24">Size</th>
                                <th className="px-4 py-4 w-40">Modified</th>
                                <th className="px-6 py-4 w-24 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mb-4"></div>
                                        <p>Scanning files...</p>
                                    </td>
                                </tr>
                            ) : filteredFiles.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center text-gray-500">
                                        <div className="flex flex-col items-center">
                                            <Folder className="text-5xl mb-4 opacity-20" />
                                            <p className="text-lg font-medium text-gray-400">Empty directory</p>
                                            <p className="text-sm">No files or folders found here.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredFiles.map((file) => (
                                <tr
                                    key={file.path}
                                    className="group hover:bg-white/5 transition-colors cursor-default"
                                    onDoubleClick={() => file.isDirectory && handleFolderClick(file.path)}
                                >
                                    <td className="px-6 py-4">
                                        <input type="checkbox" className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-600 focus:ring-offset-gray-900" />
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            {file.isDirectory ? (
                                                <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
                                                    <Folder className="text-xl" />
                                                </div>
                                            ) : (
                                                <div className="p-2 bg-white/10 text-gray-300 rounded-lg">
                                                    <File className="text-xl" />
                                                </div>
                                            )}
                                            <div className="flex flex-col">
                                                <button
                                                    onClick={() => file.isDirectory && handleFolderClick(file.path)}
                                                    className={`hover:text-blue-400 transition-colors text-sm font-medium ${file.isDirectory ? 'text-blue-200' : 'text-gray-200'}`}
                                                >
                                                    {file.name}
                                                </button>
                                                <span className="text-[10px] text-gray-500 uppercase tracking-tight">{file.isDirectory ? 'Directory' : file.extension || 'File'}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-xs text-gray-400 tabular-nums">
                                        {formatSize(file.size)}
                                    </td>
                                    <td className="px-4 py-4 text-xs text-gray-400 italic">
                                        {new Date(file.lastModified).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {!file.isDirectory && (
                                                <button
                                                    onClick={() => handleView(file.path)}
                                                    className="p-2 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-all"
                                                    title="View"
                                                >
                                                    {loadingFile === file.path ? <Loader2 className="animate-spin" size={20} /> : <Eye />}
                                                </button>
                                            )}
                                            {!file.isDirectory && (
                                                <a
                                                    href={DockerClient.downloadFileUrl(file.path)}
                                                    className="p-2 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-all"
                                                    title="Download"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    <Download />
                                                </a>
                                            )}

                                            {file.isDirectory ? (
                                                <button
                                                    onClick={() => handleZip(file.path)}
                                                    className="p-2 hover:bg-amber-500/20 text-amber-400 rounded-lg transition-all"
                                                    title="Zip Archive"
                                                >
                                                    <Archive />
                                                </button>
                                            ) : (
                                                file.extension === 'zip' && (
                                                    <button
                                                        onClick={() => handleUnzip(file.path)}
                                                        className="p-2 hover:bg-amber-500/20 text-amber-400 rounded-lg transition-all"
                                                        title="Unzip Archive"
                                                    >
                                                        <ExternalLink />
                                                    </button>
                                                )
                                            )}

                                            <button
                                                onClick={() => handleDelete(file.path)}
                                                className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-all"
                                                title="Delete"
                                            >
                                                <Trash2 />
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
