'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Search, RefreshCw, Folder, Play, Square, Plus, Edit2, X, Save, FileCode, Wand2 } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { ComposeFile, SaveComposeRequest } from '@/lib/types';

export default function ComposeScreen() {
    const [composeFiles, setComposeFiles] = useState<ComposeFile[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingFile, setEditingFile] = useState<ComposeFile | null>(null);
    const [editorContent, setEditorContent] = useState('');
    const [projectName, setProjectName] = useState('');
    const [activeTab, setActiveTab] = useState<'editor' | 'wizard'>('editor');

    const fetchComposeFiles = async () => {
        setIsLoading(true);
        const data = await DockerClient.listComposeFiles();
        setComposeFiles(data);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchComposeFiles();
    }, []);

    const handleAction = async (action: () => Promise<void>) => {
        setIsLoading(true);
        await action();
        await fetchComposeFiles();
    };

    const handleCreate = () => {
        setEditingFile(null);
        setProjectName('');
        setEditorContent('version: "3.8"\n\nservices:\n  app:\n    image: nginx:latest\n    ports:\n      - "80:80"');
        setIsEditorOpen(true);
        setActiveTab('editor');
    };

    const handleEdit = async (file: ComposeFile) => {
        setIsLoading(true);
        const content = await DockerClient.getComposeFileContent(file.path);
        setEditingFile(file);
        setProjectName(file.name);
        setEditorContent(content);
        setIsEditorOpen(true);
        setActiveTab('editor');
        setIsLoading(false);
    };

    const handleSave = async () => {
        if (!projectName) {
            alert('Project name is required');
            return;
        }
        setIsLoading(true);
        const success = await DockerClient.saveComposeFile({
            name: projectName,
            content: editorContent
        });
        if (success) {
            setIsEditorOpen(false);
            await fetchComposeFiles();
        } else {
            alert('Failed to save compose file');
        }
        setIsLoading(false);
    };

    const filteredFiles = useMemo(() => {
        return composeFiles.filter(f =>
            f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            f.path.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [composeFiles, searchQuery]);

    return (
        <div className="flex flex-col h-full relative">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <h1 className="text-4xl font-bold">Compose</h1>
                    {isLoading && <RefreshCw className="animate-spin text-primary" size={24} />}
                </div>
                <button
                    onClick={handleCreate}
                    className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors font-medium"
                >
                    <Plus size={20} />
                    Create New
                </button>
            </div>

            <div className="flex items-center gap-4 mb-8">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
                    <input
                        type="text"
                        placeholder="Search compose projects..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-surface border border-outline/20 rounded-xl py-3 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
                <button
                    onClick={fetchComposeFiles}
                    className="p-3 bg-surface border border-outline/20 rounded-xl hover:bg-white/5 transition-colors"
                    title="Refresh"
                >
                    <RefreshCw size={20} />
                </button>
            </div>

            {filteredFiles.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-on-surface-variant">
                    No compose files found
                </div>
            ) : (
                <div className="flex flex-col gap-3 overflow-y-auto pb-8">
                    {filteredFiles.map(file => (
                        <ComposeFileCard
                            key={file.path}
                            file={file}
                            onAction={handleAction}
                            onEdit={() => handleEdit(file)}
                        />
                    ))}
                </div>
            )}

            {/* Editor Modal */}
            {isEditorOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-surface border border-outline/20 rounded-3xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-outline/10 flex items-center justify-between bg-surface/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                    <FileCode size={24} />
                                </div>
                                <h2 className="text-xl font-semibold">
                                    {editingFile ? `Edit ${editingFile.name}` : 'Create New Compose Project'}
                                </h2>
                            </div>
                            <button onClick={() => setIsEditorOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-hidden flex flex-col">
                            <div className="p-4 bg-surface/30 border-b border-outline/10 flex items-center gap-4">
                                <div className="flex-1">
                                    <label className="text-xs text-on-surface-variant uppercase font-bold mb-1 block">Project Name</label>
                                    <input
                                        type="text"
                                        value={projectName}
                                        onChange={(e) => setProjectName(e.target.value)}
                                        placeholder="e.g. my-app"
                                        disabled={!!editingFile}
                                        className="w-full bg-black/20 border border-outline/20 rounded-lg px-3 py-2 text-on-surface focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
                                    />
                                </div>
                                <div className="flex items-center bg-black/20 rounded-xl p-1 border border-outline/10">
                                    <button
                                        onClick={() => setActiveTab('editor')}
                                        className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${activeTab === 'editor' ? 'bg-primary text-on-primary shadow-lg' : 'text-on-surface-variant hover:text-on-surface'}`}
                                    >
                                        <FileCode size={18} />
                                        YAML
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('wizard')}
                                        className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${activeTab === 'wizard' ? 'bg-primary text-on-primary shadow-lg' : 'text-on-surface-variant hover:text-on-surface'}`}
                                    >
                                        <Wand2 size={18} />
                                        Wizard
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-auto p-4">
                                {activeTab === 'editor' ? (
                                    <textarea
                                        value={editorContent}
                                        onChange={(e) => setEditorContent(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Tab') {
                                                e.preventDefault();
                                                const start = e.currentTarget.selectionStart;
                                                const end = e.currentTarget.selectionEnd;
                                                const value = e.currentTarget.value;
                                                const newValue = value.substring(0, start) + "  " + value.substring(end);
                                                setEditorContent(newValue);
                                                setTimeout(() => {
                                                    const target = e.target as HTMLTextAreaElement;
                                                    target.selectionStart = target.selectionEnd = start + 2;
                                                }, 0);
                                            }
                                        }}
                                        className="w-full h-full bg-black/40 border border-outline/10 rounded-xl p-4 font-mono text-sm resize-none focus:outline-none focus:border-primary/50"
                                        spellCheck={false}
                                    />
                                ) : (
                                    <ComposeWizard onGenerate={(yml) => {
                                        setEditorContent(yml);
                                        setActiveTab('editor');
                                    }} />
                                )}
                            </div>
                        </div>

                        <div className="p-6 border-t border-outline/10 bg-surface/50 flex justify-end gap-3">
                            <button
                                onClick={() => setIsEditorOpen(false)}
                                className="px-6 py-2.5 rounded-xl hover:bg-white/5 transition-colors font-medium border border-outline/20"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-6 py-2.5 bg-primary text-on-primary rounded-xl hover:bg-primary/90 transition-all font-medium flex items-center gap-2 shadow-lg shadow-primary/20"
                            >
                                <Save size={20} />
                                {editingFile ? 'Update' : 'Create'} Project
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ComposeFileCard({ file, onAction, onEdit }: {
    file: ComposeFile;
    onAction: (action: () => Promise<void>) => Promise<void>;
    onEdit: () => void;
}) {
    return (
        <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 flex items-center justify-between hover:bg-surface transition-colors group">
            <div className="flex items-center gap-4 flex-1 overflow-hidden">
                <div className="flex flex-col overflow-hidden">
                    <span className="text-lg font-medium text-on-surface truncate">{file.name}</span>
                    <div className="flex items-center gap-1.5 text-on-surface-variant">
                        <Folder size={14} />
                        <span className="text-xs truncate">{file.path}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={onEdit}
                    className="p-2 hover:bg-primary/10 text-primary rounded-lg transition-colors"
                    title="Edit"
                >
                    <Edit2 size={20} />
                </button>
                <div className="w-px h-6 bg-outline/10 mx-1" />
                <button
                    onClick={() => onAction(() => DockerClient.composeUp(file.path))}
                    className="p-2 hover:bg-green-500/10 text-green-500 rounded-lg transition-colors"
                    title="Up"
                >
                    <Play size={22} fill="currentColor" />
                </button>
                <button
                    onClick={() => onAction(() => DockerClient.composeDown(file.path))}
                    className="p-2 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"
                    title="Down"
                >
                    <Square size={20} fill="currentColor" />
                </button>
            </div>
        </div>
    );
}

function ComposeWizard({ onGenerate }: { onGenerate: (yml: string) => void }) {
    const [serviceName, setServiceName] = useState('web');
    const [image, setImage] = useState('nginx:latest');
    const [port, setPort] = useState('80:80');

    const generate = () => {
        const yml = `version: "3.8"

services:
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
                    <label className="text-sm font-medium mb-1.5 block">Service Name</label>
                    <input
                        type="text"
                        value={serviceName}
                        onChange={(e) => setServiceName(e.target.value)}
                        className="w-full bg-black/20 border border-outline/20 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
                <div>
                    <label className="text-sm font-medium mb-1.5 block">Docker Image</label>
                    <input
                        type="text"
                        value={image}
                        onChange={(e) => setImage(e.target.value)}
                        className="w-full bg-black/20 border border-outline/20 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
                <div>
                    <label className="text-sm font-medium mb-1.5 block">Port Mapping (Host:Container)</label>
                    <input
                        type="text"
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                        className="w-full bg-black/20 border border-outline/20 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
            </div>
            <button
                onClick={generate}
                className="w-full py-4 bg-primary/10 text-primary border border-primary/20 rounded-2xl hover:bg-primary hover:text-on-primary transition-all font-bold flex items-center justify-center gap-3 group"
            >
                <Wand2 size={24} className="group-hover:rotate-12 transition-transform" />
                Generate YAML
            </button>
        </div>
    );
}
