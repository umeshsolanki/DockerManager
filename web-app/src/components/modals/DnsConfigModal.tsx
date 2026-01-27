import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DnsConfig } from '@/lib/types';
import { toast } from 'sonner';

export function DnsConfigModal({ onClose, onSaved, initialConfig }: { onClose: () => void, onSaved: () => void, initialConfig?: DnsConfig }) {
    const [name, setName] = useState(initialConfig?.name || '');
    const [provider, setProvider] = useState(initialConfig?.provider || 'cloudflare');
    const [apiToken, setApiToken] = useState(initialConfig?.apiToken || '');
    const [dnsHost, setDnsHost] = useState(initialConfig?.dnsHost || '');
    const [authUrl, setAuthUrl] = useState(initialConfig?.authUrl || '');
    const [cleanupUrl, setCleanupUrl] = useState(initialConfig?.cleanupUrl || '');
    const [authScript, setAuthScript] = useState(initialConfig?.authScript || '#!/bin/sh\n# Use $CERTBOT_DOMAIN and $CERTBOT_VALIDATION\n');
    const [cleanupScript, setCleanupScript] = useState(initialConfig?.cleanupScript || '#!/bin/sh\n');
    const [manualMode, setManualMode] = useState<'api' | 'script' | 'default'>(
        initialConfig?.dnsHost ? 'default' : initialConfig?.authScript ? 'script' : 'api'
    );
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const configData: Partial<DnsConfig> = {
            id: initialConfig?.id || '',
            name,
            provider,
            apiToken: provider !== 'manual' ? apiToken : (manualMode === 'default' ? apiToken : undefined),
            dnsHost: provider === 'manual' && manualMode === 'default' ? dnsHost : undefined,
            authUrl: provider === 'manual' && manualMode === 'api' ? authUrl : undefined,
            cleanupUrl: provider === 'manual' && manualMode === 'api' ? cleanupUrl : undefined,
            authScript: provider === 'manual' && manualMode === 'script' ? authScript : undefined,
            cleanupScript: provider === 'manual' && manualMode === 'script' ? cleanupScript : undefined,
            createdAt: initialConfig?.createdAt || Date.now()
        };

        const result = initialConfig
            ? await DockerClient.updateDnsConfig(configData as DnsConfig)
            : await DockerClient.createDnsConfig(configData);

        if (result.success) {
            toast.success(result.message || (initialConfig ? 'DNS config updated' : 'DNS config created'));
            onSaved();
        } else {
            toast.error(result.message || 'Failed to save DNS config');
        }
        setIsSubmitting(false);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-gradient-to-br from-surface to-surface-variant rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl border border-outline/10 overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="flex justify-between items-center px-5 py-4 border-b border-outline/10 bg-surface/50 backdrop-blur-sm">
                    <div>
                        <h3 className="text-base font-bold">{initialConfig ? 'Edit DNS Config' : 'New DNS Config'}</h3>
                        <p className="text-[11px] text-on-surface-variant mt-0.5">Configure DNS challenge for SSL</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-all active:scale-90">
                        <Plus size={18} className="rotate-45" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-on-surface-variant">Config Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g., Cloudflare Production"
                            required
                            className="w-full bg-white/5 border border-outline/10 rounded-xl px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-on-surface-variant">Provider</label>
                        <select
                            value={provider}
                            onChange={e => setProvider(e.target.value)}
                            className="w-full bg-white/5 border border-outline/10 rounded-xl px-4 py-3 text-sm focus:border-primary focus:outline-none"
                        >
                            <option value="cloudflare">Cloudflare</option>
                            <option value="digitalocean">DigitalOcean</option>
                            <option value="manual">Manual / Custom</option>
                        </select>
                    </div>

                    {provider !== 'manual' && (
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-on-surface-variant">API Token</label>
                            <input
                                type="password"
                                value={apiToken}
                                onChange={e => setApiToken(e.target.value)}
                                placeholder="Enter your API token"
                                className="w-full bg-white/5 border border-outline/10 rounded-xl px-4 py-3 text-sm focus:border-primary focus:outline-none font-mono"
                            />
                        </div>
                    )}

                    {provider === 'manual' && (
                        <div className="space-y-4 p-3 bg-white/5 rounded-2xl border border-white/5">
                            <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                                {[
                                    { id: 'default', label: 'Default API' },
                                    { id: 'api', label: 'HTTP Hook' },
                                    { id: 'script', label: 'Script' }
                                ].map(mode => (
                                    <button
                                        key={mode.id}
                                        type="button"
                                        onClick={() => setManualMode(mode.id as any)}
                                        className={`flex-1 px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${manualMode === mode.id ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
                                            }`}
                                    >
                                        {mode.label}
                                    </button>
                                ))}
                            </div>

                            {manualMode === 'default' && (
                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase text-on-surface-variant">DNS API Host</label>
                                        <input
                                            type="text"
                                            value={dnsHost}
                                            onChange={e => setDnsHost(e.target.value)}
                                            placeholder="e.g., dns.example.com"
                                            className="w-full bg-white/5 border border-outline/10 rounded-xl px-4 py-3 text-sm focus:border-primary focus:outline-none font-mono"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase text-on-surface-variant">API Token</label>
                                        <input
                                            type="password"
                                            value={apiToken}
                                            onChange={e => setApiToken(e.target.value)}
                                            placeholder="Enter your API token"
                                            className="w-full bg-white/5 border border-outline/10 rounded-xl px-4 py-3 text-sm focus:border-primary focus:outline-none font-mono"
                                        />
                                    </div>
                                </div>
                            )}

                            {manualMode === 'api' && (
                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase text-on-surface-variant">Auth URL</label>
                                        <input
                                            type="text"
                                            value={authUrl}
                                            onChange={e => setAuthUrl(e.target.value)}
                                            placeholder="https://api.example.com/add-record"
                                            className="w-full bg-white/5 border border-outline/10 rounded-xl px-4 py-3 text-sm focus:border-primary focus:outline-none font-mono"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase text-on-surface-variant">Cleanup URL (Optional)</label>
                                        <input
                                            type="text"
                                            value={cleanupUrl}
                                            onChange={e => setCleanupUrl(e.target.value)}
                                            placeholder="https://api.example.com/remove-record"
                                            className="w-full bg-white/5 border border-outline/10 rounded-xl px-4 py-3 text-sm focus:border-primary focus:outline-none font-mono"
                                        />
                                    </div>
                                </div>
                            )}

                            {manualMode === 'script' && (
                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase text-on-surface-variant">Auth Script</label>
                                        <textarea
                                            value={authScript}
                                            onChange={e => setAuthScript(e.target.value)}
                                            rows={4}
                                            className="w-full bg-white/5 border border-outline/10 rounded-xl px-4 py-3 text-sm focus:border-primary focus:outline-none font-mono text-[11px]"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase text-on-surface-variant">Cleanup Script (Optional)</label>
                                        <textarea
                                            value={cleanupScript}
                                            onChange={e => setCleanupScript(e.target.value)}
                                            rows={3}
                                            className="w-full bg-white/5 border border-outline/10 rounded-xl px-4 py-3 text-sm focus:border-primary focus:outline-none font-mono text-[11px]"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </form>

                <div className="flex gap-3 p-4 border-t border-outline/10 bg-surface/30">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 border border-outline/10 px-6 py-2 rounded-xl font-bold text-sm hover:bg-white/5 transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !name}
                        className="flex-1 bg-primary text-on-primary px-6 py-2 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 disabled:opacity-50 hover:brightness-110 active:scale-[0.98] transition-all"
                    >
                        {isSubmitting ? 'Saving...' : (initialConfig ? 'Update' : 'Create')}
                    </button>
                </div>
            </div>
        </div>
    );
}
