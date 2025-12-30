'use client';

import React, { useState } from 'react';
import { Link, Save, CheckCircle } from 'lucide-react';
import { DockerClient } from '@/lib/api';

export default function SettingsScreen() {
    const [serverUrl, setServerUrl] = useState(DockerClient.getServerUrl());
    const [message, setMessage] = useState('');

    const handleSave = () => {
        DockerClient.setServerUrl(serverUrl);
        setMessage('Settings saved successfully!');
        setTimeout(() => setMessage(''), 3000);
    };

    return (
        <div className="flex flex-col h-full">
            <h1 className="text-3xl font-bold mb-5">Settings</h1>

            <div className="max-w-2xl bg-surface/50 border border-outline/10 rounded-3xl p-8 shadow-xl">
                <h2 className="text-xl font-semibold text-primary mb-6">Server Configuration</h2>

                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-on-surface/80 px-1">Server URL</label>
                        <div className="relative">
                            <Link className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
                            <input
                                type="text"
                                value={serverUrl}
                                onChange={(e) => setServerUrl(e.target.value)}
                                placeholder="e.g., http://192.168.1.100:8080"
                                className="w-full bg-surface border border-outline/20 rounded-xl py-4 pl-12 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors text-lg"
                            />
                        </div>
                        <p className="text-xs text-on-surface-variant px-1 mt-2">
                            Specify the Docker Manager server address. If left blank, the app will try to auto-detect the host.
                        </p>
                    </div>

                    <div className="flex items-center justify-between pt-4">
                        <div className="flex items-center gap-2 text-green-500 animate-in fade-in duration-300">
                            {message && (
                                <>
                                    <CheckCircle size={18} />
                                    <span className="text-sm font-medium">{message}</span>
                                </>
                            )}
                        </div>
                        <button
                            onClick={handleSave}
                            className="flex items-center gap-2 bg-primary text-primary-foreground font-bold px-8 py-4 rounded-xl hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-primary/20"
                        >
                            <Save size={20} />
                            <span>Save Changes</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
