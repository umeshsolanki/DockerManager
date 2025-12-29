'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Search, RefreshCw, Folder, Play, Square } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { ComposeFile } from '@/lib/types';

export default function ComposeScreen() {
    const [composeFiles, setComposeFiles] = useState<ComposeFile[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

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

    const filteredFiles = useMemo(() => {
        return composeFiles.filter(f =>
            f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            f.path.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [composeFiles, searchQuery]);

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-4 mb-8">
                <h1 className="text-4xl font-bold">Compose</h1>
                {isLoading && <RefreshCw className="animate-spin text-primary" size={24} />}
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
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function ComposeFileCard({ file, onAction }: {
    file: ComposeFile;
    onAction: (action: () => Promise<void>) => Promise<void>;
}) {
    return (
        <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 flex items-center justify-between hover:bg-surface transition-colors">
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
