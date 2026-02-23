'use client';

import React, { useState, useEffect } from 'react';
import { Globe, Plus, Activity, Lock, FileKey, ShieldCheck, Network, Pencil, Trash2, FolderCode, Server, SquareSlash, Construction } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { ProxyHost, PathRoute, SSLCertificate, DnsConfig, CustomPage } from '@/lib/types';
import { toast } from 'sonner';
import Editor from '@monaco-editor/react';
import { Modal } from '../ui/Modal';

export function ProxyHostModal({ onClose, onAdded, initialHost }: { onClose: () => void, onAdded: () => void, initialHost?: ProxyHost }) {
    const [domain, setDomain] = useState(initialHost?.domain || '');
    const [target, setTarget] = useState(initialHost?.target || 'http://');
    const [websocketEnabled, setWebsocketEnabled] = useState(initialHost?.websocketEnabled || false);
    const [hstsEnabled, setHstsEnabled] = useState(initialHost?.hstsEnabled || false);
    const [isWildcard, setIsWildcard] = useState(initialHost?.isWildcard || false);
    const [sslEnabled, setSslEnabled] = useState(initialHost?.ssl || false);
    const [selectedCert, setSelectedCert] = useState<string>(initialHost?.customSslPath || '');
    const [sslChallengeType, setSslChallengeType] = useState<'http' | 'dns'>(initialHost?.sslChallengeType || 'http');
    const [dnsProvider, setDnsProvider] = useState(initialHost?.dnsProvider || 'cloudflare');
    const [dnsApiToken, setDnsApiToken] = useState(initialHost?.dnsApiToken || '');
    const [dnsAuthUrl, setDnsAuthUrl] = useState(initialHost?.dnsAuthUrl || '');
    const [dnsCleanupUrl, setDnsCleanupUrl] = useState(initialHost?.dnsCleanupUrl || '');
    const [dnsHost, setDnsHost] = useState(initialHost?.dnsHost || '');
    const [dnsManualMode, setDnsManualMode] = useState<'api' | 'script' | 'default'>(
        initialHost?.dnsHost ? 'default' : initialHost?.dnsAuthScript ? 'script' : initialHost?.dnsAuthUrl ? 'api' : 'default'
    );
    const [dnsAuthScript, setDnsAuthScript] = useState(initialHost?.dnsAuthScript || '#!/bin/sh\n# Use $CERTBOT_DOMAIN and $CERTBOT_VALIDATION\n');
    const [dnsCleanupScript, setDnsCleanupScript] = useState(initialHost?.dnsCleanupScript || '#!/bin/sh\n');
    const [certs, setCerts] = useState<SSLCertificate[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [allowedIps, setAllowedIps] = useState<string[]>(initialHost?.allowedIps || []);
    const [newIp, setNewIp] = useState('');
    const [paths, setPaths] = useState<PathRoute[]>(initialHost?.paths || []);
    const [isPathModalOpen, setIsPathModalOpen] = useState(false);
    const [editingPath, setEditingPath] = useState<PathRoute | null>(null);

    // Rate Limiting State
    const [rateLimitEnabled, setRateLimitEnabled] = useState(initialHost?.rateLimit?.enabled || false);
    const [rateLimitRate, setRateLimitRate] = useState(initialHost?.rateLimit?.rate?.toString() || '10');
    const [rateLimitPeriod, setRateLimitPeriod] = useState<'s' | 'm'>(initialHost?.rateLimit?.period || 's');
    const [rateLimitBurst, setRateLimitBurst] = useState(initialHost?.rateLimit?.burst?.toString() || '20');
    const [rateLimitNodelay, setRateLimitNodelay] = useState(initialHost?.rateLimit?.nodelay ?? true);
    const [isStatic, setIsStatic] = useState(initialHost?.isStatic || false);
    const [silentDrop, setSilentDrop] = useState(initialHost?.silentDrop || false);

    // DNS Config Dropdown
    const [dnsConfigId, setDnsConfigId] = useState(initialHost?.dnsConfigId || '');
    const [savedDnsConfigs, setSavedDnsConfigs] = useState<DnsConfig[]>([]);

    // Under Construction State
    const [underConstruction, setUnderConstruction] = useState(initialHost?.underConstruction || false);
    const [underConstructionPageId, setUnderConstructionPageId] = useState(initialHost?.underConstructionPageId || '');
    const [customPages, setCustomPages] = useState<CustomPage[]>([]);

    useEffect(() => {
        DockerClient.listProxyCertificates().then(setCerts);
        DockerClient.listDnsConfigs().then(setSavedDnsConfigs);
        DockerClient.listCustomPages().then(setCustomPages);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const hostData: ProxyHost = {
            id: initialHost?.id || '',
            domain,
            target,
            enabled: initialHost?.enabled ?? true,
            ssl: sslEnabled,
            websocketEnabled,
            hstsEnabled: sslEnabled ? hstsEnabled : false,
            isWildcard: sslEnabled ? isWildcard : false,
            dnsConfigId: (sslEnabled && sslChallengeType === 'dns' && dnsConfigId) ? dnsConfigId : undefined,
            customSslPath: (sslEnabled && selectedCert) ? selectedCert : undefined,
            allowedIps,
            paths: paths.length > 0 ? paths : undefined,
            createdAt: initialHost?.createdAt || Date.now(),
            sslChallengeType: isWildcard ? 'dns' : sslChallengeType,
            dnsProvider: sslChallengeType === 'dns' ? dnsProvider : undefined,
            dnsApiToken: sslChallengeType === 'dns' ? dnsApiToken : undefined,
            dnsHost: (sslChallengeType === 'dns' && dnsProvider === 'manual' && dnsManualMode === 'default') ? dnsHost : undefined,
            dnsAuthUrl: (sslChallengeType === 'dns' && dnsProvider === 'manual' && dnsManualMode === 'api') ? dnsAuthUrl : undefined,
            dnsCleanupUrl: (sslChallengeType === 'dns' && dnsProvider === 'manual' && dnsManualMode === 'api') ? dnsCleanupUrl : undefined,
            dnsAuthScript: (sslChallengeType === 'dns' && dnsProvider === 'manual' && dnsManualMode === 'script' && dnsAuthScript.trim() !== '#!/bin/sh\n# Use $CERTBOT_DOMAIN and $CERTBOT_VALIDATION\n') ? dnsAuthScript : undefined,
            dnsCleanupScript: (sslChallengeType === 'dns' && dnsProvider === 'manual' && dnsManualMode === 'script' && dnsCleanupScript.trim() !== '#!/bin/sh\n') ? dnsCleanupScript : undefined,
            rateLimit: rateLimitEnabled ? {
                enabled: true,
                rate: parseInt(rateLimitRate) || 10,
                period: rateLimitPeriod,
                burst: parseInt(rateLimitBurst) || 20,
                nodelay: rateLimitNodelay
            } : undefined,
            isStatic,
            silentDrop,
            underConstruction,
            underConstructionPageId: underConstructionPageId || undefined
        };

        const result = initialHost
            ? await DockerClient.updateProxyHost(hostData)
            : await DockerClient.createProxyHost(hostData);

        if (result.success) {
            toast.success(result.message || (initialHost ? 'Proxy host updated' : 'Proxy host created'));
            onAdded();
        } else {
            toast.error(result.message || (initialHost ? 'Failed to update proxy host' : 'Failed to create proxy host'));
            if (!initialHost && result.message?.includes("SSL")) onAdded(); // Allow save if SSL partially failed
        }
        setIsSubmitting(false);
    };

    return (
        <Modal
            onClose={onClose}
            title={initialHost ? 'Edit Proxy Host' : 'Add Proxy Host'}
            description="Configure Routing & Security"
            icon={<Globe size={24} />}
            maxWidth="max-w-lg"
            className="flex flex-col"
        >
            <form onSubmit={handleSubmit} className="mt-4 flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto px-1 custom-scrollbar space-y-6">
                    {/* Host Type Selector */}
                    <div className="flex bg-black/20 p-1.5 rounded-2xl border border-outline/10">
                        <button
                            type="button"
                            onClick={() => setIsStatic(false)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${!isStatic ? 'bg-primary text-on-primary shadow-lg' : 'text-on-surface-variant hover:text-on-surface'}`}
                        >
                            <Server size={14} />
                            Proxy (Forward)
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsStatic(true)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${isStatic ? 'bg-primary text-on-primary shadow-lg' : 'text-on-surface-variant hover:text-on-surface'}`}
                        >
                            <FolderCode size={14} />
                            Static (Files)
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Domain Name</label>
                            <input
                                required
                                type="text"
                                placeholder="e.g. app.example.com"
                                value={domain}
                                onChange={(e) => setDomain(e.target.value)}
                                className="w-full bg-white/5 border border-outline/20 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-all font-bold placeholder:font-normal"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                                {isStatic ? 'Static Directory Path' : 'Target URL'}
                            </label>
                            <input
                                required
                                type="text"
                                placeholder={isStatic ? "/var/www/html/site" : "e.g. http://localhost:8080"}
                                value={target}
                                onChange={(e) => setTarget(e.target.value)}
                                className="w-full bg-white/5 border border-outline/20 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-all font-mono font-bold placeholder:font-normal"
                            />
                        </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-outline/5">
                        <h3 className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Security & Protocol</h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* WebSocket Toggle */}
                            <label className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-outline/10 cursor-pointer hover:border-primary/30 transition-all group">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${websocketEnabled ? 'bg-primary/20 text-primary' : 'bg-white/5 text-on-surface-variant'}`}>
                                    <Activity size={18} className={websocketEnabled ? 'animate-pulse' : ''} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-on-surface">Websockets</div>
                                    <div className="text-[10px] text-on-surface-variant font-medium">Full duplex proxying</div>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={websocketEnabled}
                                    onChange={(e) => setWebsocketEnabled(e.target.checked)}
                                    className="w-5 h-5 rounded-lg border-outline/20 bg-white/5 checked:bg-primary accent-primary"
                                />
                            </label>

                            {/* SSL Toggle */}
                            <label className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-outline/10 cursor-pointer hover:border-green-500/30 transition-all group">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${sslEnabled ? 'bg-green-500/20 text-green-500' : 'bg-white/5 text-on-surface-variant'}`}>
                                    <Lock size={18} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-on-surface">SSL (HTTPS)</div>
                                    <div className="text-[10px] text-on-surface-variant font-medium">Secure traffic only</div>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={sslEnabled}
                                    onChange={(e) => setSslEnabled(e.target.checked)}
                                    className="w-5 h-5 rounded-lg border-outline/20 bg-white/5 checked:bg-green-500 accent-green-500"
                                />
                            </label>

                            {/* Silent Drop Toggle */}
                            <label className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-outline/10 cursor-pointer hover:border-red-500/30 transition-all group sm:col-span-2 md:col-span-1">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${silentDrop ? 'bg-red-500/20 text-red-500' : 'bg-white/5 text-on-surface-variant'}`}>
                                    <SquareSlash size={18} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-on-surface">Silent Drop</div>
                                    <div className="text-[10px] text-on-surface-variant font-medium">Return 444 (No Response) on 403</div>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={silentDrop}
                                    onChange={(e) => setSilentDrop(e.target.checked)}
                                    className="w-5 h-5 rounded-lg border-outline/20 bg-white/5 checked:bg-red-500 accent-red-500"
                                />
                            </label>

                            {/* Under Construction Toggle */}
                            <label className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-outline/10 cursor-pointer hover:border-amber-500/30 transition-all group">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${underConstruction ? 'bg-amber-500/20 text-amber-500' : 'bg-white/5 text-on-surface-variant'}`}>
                                    <Construction size={18} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-on-surface">Construction Mode</div>
                                    <div className="text-[10px] text-on-surface-variant font-medium">Show maintenance page</div>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={underConstruction}
                                    onChange={(e) => setUnderConstruction(e.target.checked)}
                                    className="w-5 h-5 rounded-lg border-outline/20 bg-white/5 checked:bg-amber-500 accent-amber-500"
                                />
                            </label>
                        </div>

                        {/* Under Construction Options */}
                        {underConstruction && (
                            <div className="p-5 rounded-3xl bg-amber-500/5 border border-amber-500/10 space-y-4 animate-in slide-in-from-top-4 duration-300">
                                <div className="space-y-1.5">
                                    <label className="block text-[10px] font-black text-amber-500 uppercase tracking-widest ml-1">Select Maintenance Page</label>
                                    <select
                                        required
                                        value={underConstructionPageId}
                                        onChange={(e) => setUnderConstructionPageId(e.target.value)}
                                        className="w-full bg-white/5 border border-amber-500/20 rounded-2xl px-4 py-3 appearance-none focus:outline-none focus:border-amber-500 text-sm font-bold"
                                    >
                                        <option value="">Select a page...</option>
                                        {customPages.map(page => (
                                            <option key={page.id} value={page.id}>
                                                {page.title}
                                            </option>
                                        ))}
                                    </select>
                                    {customPages.length === 0 && (
                                        <p className="text-[10px] text-amber-500/60 mt-1 italic">
                                            No custom pages found. Create one in Proxy Settings.
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* SSL Options - Only visible when SSL is enabled */}
                        {sslEnabled && (
                            <div className="p-5 rounded-3xl bg-green-500/5 border border-green-500/10 space-y-5 animate-in slide-in-from-top-4 duration-300">
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-green-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                                        <FileKey size={12} /> SSL Certificate Source
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={selectedCert}
                                            onChange={(e) => setSelectedCert(e.target.value)}
                                            className="w-full bg-white/5 border border-green-500/20 rounded-2xl px-4 py-3 appearance-none focus:outline-none focus:border-green-500 text-sm font-bold"
                                        >
                                            <option value="">Auto-generate (Let's Encrypt)</option>
                                            {certs.map(cert => (
                                                <option key={cert.id} value={`${cert.certPath}|${cert.keyPath}`}>
                                                    {cert.domain} ({cert.id})
                                                </option>
                                            ))}
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                                            <Plus size={14} className="rotate-45" />
                                        </div>
                                    </div>
                                </div>

                                {!selectedCert && (
                                    <div className="space-y-4 animate-in fade-in duration-300">
                                        <div className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black uppercase text-on-surface">Challenge Type</span>
                                                <span className="text-[9px] text-on-surface-variant font-medium">Use DNS for Wildcards</span>
                                            </div>
                                            <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                                                <button
                                                    type="button"
                                                    onClick={() => setSslChallengeType('http')}
                                                    className={`px-3 py-1 text-[10px] font-black uppercase rounded-lg transition-all ${sslChallengeType === 'http' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}
                                                >
                                                    HTTP-01
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setSslChallengeType('dns')}
                                                    className={`px-3 py-1 text-[10px] font-black uppercase rounded-lg transition-all ${sslChallengeType === 'dns' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}
                                                >
                                                    DNS-01
                                                </button>
                                            </div>
                                        </div>

                                        {/* Wildcard SSL Toggle */}
                                        <div className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black uppercase text-on-surface">Wildcard Certificate</span>
                                                <span className="text-[9px] text-on-surface-variant font-medium">*.{domain || 'domain.com'}</span>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={isWildcard}
                                                    onChange={(e) => {
                                                        setIsWildcard(e.target.checked);
                                                        if (e.target.checked) {
                                                            setSslChallengeType('dns'); // Wildcard requires DNS-01
                                                        }
                                                    }}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                                            </label>
                                        </div>

                                        {isWildcard && (
                                            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                                                <p className="text-[10px] text-amber-200 font-medium leading-relaxed flex items-center gap-2">
                                                    <span className="text-amber-400">⚠️</span>
                                                    Wildcard certificates require DNS-01 challenge. Configure your DNS provider below.
                                                </p>
                                            </div>
                                        )}
                                        {sslChallengeType === 'dns' && (
                                            <div className="space-y-4 pt-1 animate-in slide-in-from-top-2">
                                                {savedDnsConfigs.length > 0 && (
                                                    <div className="space-y-1.5">
                                                        <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Use Saved Config</label>
                                                        <select
                                                            value={dnsConfigId}
                                                            onChange={(e) => setDnsConfigId(e.target.value)}
                                                            className="w-full bg-black/20 border border-outline/20 rounded-2xl px-4 py-2.5 text-sm font-bold focus:outline-none"
                                                        >
                                                            <option value="">Configure Inline...</option>
                                                            {savedDnsConfigs.map(config => (
                                                                <option key={config.id} value={config.id}>
                                                                    {config.name} ({config.provider})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                )}

                                                {!dnsConfigId && (
                                                    <>
                                                        <div className="space-y-1.5">
                                                            <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">DNS Provider</label>
                                                            <select
                                                                value={dnsProvider}
                                                                onChange={(e) => setDnsProvider(e.target.value)}
                                                                className="w-full bg-black/20 border border-outline/20 rounded-2xl px-4 py-2.5 text-sm font-bold focus:outline-none"
                                                            >
                                                                <option value="cloudflare">Cloudflare</option>
                                                                <option value="digitalocean">DigitalOcean</option>
                                                                <option value="manual">Manual (DNS TXT)</option>
                                                            </select>
                                                        </div>
                                                        {dnsProvider === 'manual' ? (
                                                            <div className="space-y-4 animate-in slide-in-from-top-2">
                                                                <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setDnsManualMode('default')}
                                                                        className={`flex-1 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${dnsManualMode === 'default' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant'}`}
                                                                    >
                                                                        Default
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setDnsManualMode('api')}
                                                                        className={`flex-1 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${dnsManualMode === 'api' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant'}`}
                                                                    >
                                                                        Custom Hook
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setDnsManualMode('script')}
                                                                        className={`flex-1 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${dnsManualMode === 'script' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant'}`}
                                                                    >
                                                                        Script
                                                                    </button>
                                                                </div>

                                                                {dnsManualMode === 'default' && (
                                                                    <div className="space-y-4 animate-in slide-in-from-top-2">
                                                                        <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl mb-2">
                                                                            <p className="text-[10px] text-primary/80 font-medium leading-relaxed">
                                                                                Uses default GET templates for
                                                                                <code className="bg-black/40 px-1 rounded mx-1">/add</code> and
                                                                                <code className="bg-black/40 px-1 rounded mx-1">/delete</code>.
                                                                            </p>
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">DNS API Host</label>
                                                                            <input
                                                                                type="text"
                                                                                placeholder="e.g. https://dns.example.com"
                                                                                value={dnsHost}
                                                                                onChange={(e) => setDnsHost(e.target.value)}
                                                                                className="w-full bg-black/20 border border-outline/20 rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">API Token</label>
                                                                            <input
                                                                                type="password"
                                                                                placeholder="Your API Token"
                                                                                value={dnsApiToken}
                                                                                onChange={(e) => setDnsApiToken(e.target.value)}
                                                                                className="w-full bg-black/20 border border-outline/20 rounded-2xl px-4 py-2.5 text-sm font-mono focus:outline-none"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {dnsManualMode === 'api' ? (
                                                                    <>
                                                                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-2">
                                                                            <p className="text-[10px] text-amber-200 font-medium leading-relaxed">
                                                                                An HTTP POST will be sent with JSON:
                                                                                <code className="bg-black/40 px-1 rounded ml-1">{"{domain, validation, token}"}</code>
                                                                            </p>
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Auth Hook URL (POST)</label>
                                                                            <input
                                                                                type="text"
                                                                                placeholder="https://api.example.com/dns/auth"
                                                                                value={dnsAuthUrl}
                                                                                onChange={(e) => setDnsAuthUrl(e.target.value)}
                                                                                className="w-full bg-black/20 border border-outline/20 rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Cleanup Hook URL (POST)</label>
                                                                            <input
                                                                                type="text"
                                                                                placeholder="https://api.example.com/dns/cleanup"
                                                                                value={dnsCleanupUrl}
                                                                                onChange={(e) => setDnsCleanupUrl(e.target.value)}
                                                                                className="w-full bg-black/20 border border-outline/20 rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">API Token (Optional)</label>
                                                                            <input
                                                                                type="password"
                                                                                placeholder="Secret token for your API"
                                                                                value={dnsApiToken}
                                                                                onChange={(e) => setDnsApiToken(e.target.value)}
                                                                                className="w-full bg-black/20 border border-outline/20 rounded-2xl px-4 py-2.5 text-sm font-mono focus:outline-none"
                                                                            />
                                                                        </div>
                                                                    </>
                                                                ) : dnsManualMode === 'script' ? (
                                                                    <div className="space-y-4 animate-in slide-in-from-top-2">
                                                                        <div className="space-y-1.5">
                                                                            <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1 flex justify-between">
                                                                                <span>Auth Script (sh)</span>
                                                                                <span className="text-primary tracking-normal lowercase opacity-60">Uses $CERTBOT_DOMAIN, $CERTBOT_VALIDATION</span>
                                                                            </label>
                                                                            <div className="rounded-xl overflow-hidden border border-white/10 bg-black/40">
                                                                                <Editor
                                                                                    height="150px"
                                                                                    language="shell"
                                                                                    theme="vs-dark"
                                                                                    value={dnsAuthScript}
                                                                                    onChange={(v) => setDnsAuthScript(v || '')}
                                                                                    options={{
                                                                                        minimap: { enabled: false },
                                                                                        lineNumbers: 'on',
                                                                                        scrollBeyondLastLine: false,
                                                                                        fontSize: 10,
                                                                                        fontFamily: 'monospace'
                                                                                    }}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Cleanup Script (Optional)</label>
                                                                            <div className="rounded-xl overflow-hidden border border-white/10 bg-black/40">
                                                                                <Editor
                                                                                    height="100px"
                                                                                    language="shell"
                                                                                    theme="vs-dark"
                                                                                    value={dnsCleanupScript}
                                                                                    onChange={(v) => setDnsCleanupScript(v || '')}
                                                                                    options={{
                                                                                        minimap: { enabled: false },
                                                                                        lineNumbers: 'on',
                                                                                        scrollBeyondLastLine: false,
                                                                                        fontSize: 10,
                                                                                        fontFamily: 'monospace'
                                                                                    }}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-1.5 animate-in slide-in-from-top-2">
                                                                <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">API Token / Secret</label>
                                                                <input
                                                                    type="password"
                                                                    placeholder={dnsProvider === 'cloudflare' ? 'Cloudflare API Token' : 'DigitalOcean Personal Access Token'}
                                                                    value={dnsApiToken}
                                                                    onChange={(e) => setDnsApiToken(e.target.value)}
                                                                    className="w-full bg-black/20 border border-outline/20 rounded-2xl px-4 py-2.5 text-sm font-mono focus:outline-none"
                                                                />
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        )}

                                        <label className="flex items-center gap-3 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                checked={hstsEnabled}
                                                onChange={(e) => setHstsEnabled(e.target.checked)}
                                                className="w-4 h-4 rounded-md border-outline/20 bg-white/5 checked:bg-purple-500 accent-purple-500"
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold flex items-center gap-2">
                                                    Enable HSTS
                                                    <span className="text-[9px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">Strict Security</span>
                                                </span>
                                                <span className="text-[10px] text-on-surface-variant/60">Enforce HTTPS on browsers</span>
                                            </div>
                                        </label>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Rate Limiting */}
                        <div className="pt-4 border-t border-outline/10">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <ShieldCheck size={16} className={rateLimitEnabled ? 'text-primary' : 'text-on-surface-variant/40'} />
                                    <label className="block text-[11px] font-black text-on-surface-variant uppercase tracking-widest">Rate Limiting</label>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={rateLimitEnabled}
                                        onChange={(e) => setRateLimitEnabled(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                                </label>
                            </div>

                            {rateLimitEnabled && (
                                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 space-y-4 animate-in slide-in-from-top-2 duration-200">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="block text-[9px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Rate</label>
                                            <div className="flex gap-1">
                                                <input
                                                    type="number"
                                                    value={rateLimitRate}
                                                    onChange={(e) => setRateLimitRate(e.target.value)}
                                                    className="w-full bg-black/20 border border-outline/20 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-primary"
                                                    placeholder="10"
                                                />
                                                <select
                                                    value={rateLimitPeriod}
                                                    onChange={(e) => setRateLimitPeriod(e.target.value as 's' | 'm')}
                                                    className="bg-black/20 border border-outline/20 rounded-xl px-2 py-2 text-[10px] font-bold focus:outline-none"
                                                >
                                                    <option value="s">r/s</option>
                                                    <option value="m">r/m</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="block text-[9px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Burst</label>
                                            <input
                                                type="number"
                                                value={rateLimitBurst}
                                                onChange={(e) => setRateLimitBurst(e.target.value)}
                                                className="w-full bg-black/20 border border-outline/20 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-primary"
                                                placeholder="20"
                                            />
                                        </div>
                                    </div>
                                    <label className="flex items-center gap-3 cursor-pointer group select-none">
                                        <input
                                            type="checkbox"
                                            checked={rateLimitNodelay}
                                            onChange={(e) => setRateLimitNodelay(e.target.checked)}
                                            className="w-4 h-4 rounded-md border-outline/20 bg-white/5 checked:bg-primary accent-primary"
                                        />
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-bold">No Delay</span>
                                            <span className="text-[9px] text-on-surface-variant/60 font-medium">Process requests immediately within burst</span>
                                        </div>
                                    </label>
                                </div>
                            )}
                        </div>

                        {/* IP Restrictions */}
                        <div className="pt-2 border-t border-outline/10">
                            <label className="block text-xs font-bold text-on-surface-variant uppercase mb-2 ml-1">IP Restrictions</label>
                            <div className="flex gap-2 mb-2">
                                <input
                                    type="text"
                                    placeholder="IP or CIDR (e.g. 1.2.3.4)"
                                    value={newIp}
                                    onChange={(e) => setNewIp(e.target.value)}
                                    className="flex-1 bg-white/5 border border-outline/20 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            if (newIp.trim()) {
                                                setAllowedIps([...allowedIps, newIp.trim()]);
                                                setNewIp('');
                                            }
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (newIp.trim()) {
                                            setAllowedIps([...allowedIps, newIp.trim()]);
                                            setNewIp('');
                                        }
                                    }}
                                    className="bg-primary/20 text-primary p-2 rounded-xl hover:bg-primary/30 transition-all"
                                >
                                    <Plus size={16} />
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto no-scrollbar p-1">
                                {allowedIps.map(ip => (
                                    <div key={ip} className="flex items-center gap-2 bg-surface border border-outline/20 px-2 py-1 rounded-lg text-[10px] font-mono group">
                                        <span>{ip}</span>
                                        <button
                                            type="button"
                                            onClick={() => setAllowedIps(allowedIps.filter(i => i !== ip))}
                                            className="text-on-surface-variant hover:text-red-500 transition-colors"
                                        >
                                            <Plus size={10} className="rotate-45" />
                                        </button>
                                    </div>
                                ))}
                                {allowedIps.length === 0 && (
                                    <span className="text-[10px] text-on-surface-variant italic">No restrictions (Public)</span>
                                )}
                            </div>
                        </div>

                        {/* Path Routes */}
                        <div className="pt-2 border-t border-outline/10">
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-xs font-bold text-on-surface-variant uppercase ml-1">Path Routes</label>
                                <button
                                    type="button"
                                    onClick={() => setIsPathModalOpen(true)}
                                    className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                                >
                                    <Plus size={12} />
                                    Add Path
                                </button>
                            </div>
                            {paths.length > 0 ? (
                                <div className="space-y-2 max-h-32 overflow-y-auto no-scrollbar">
                                    {paths.map(path => (
                                        <div key={path.id} className={`flex items-center justify-between bg-surface/40 border rounded-lg p-2 group ${path.enabled !== false ? 'border-outline/10' : 'border-red-500/20 opacity-60'}`}>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {path.name && (
                                                        <>
                                                            <span className="text-xs font-bold text-on-surface">{path.name}</span>
                                                            <span className="text-[10px] text-on-surface-variant">•</span>
                                                        </>
                                                    )}
                                                    <span className="text-xs font-mono font-bold text-primary">{path.path}</span>
                                                    <span className="text-[10px] text-on-surface-variant">→</span>
                                                    <span className="text-[10px] font-mono truncate text-on-surface-variant">{path.target}</span>
                                                    {path.enabled === false && <span className="text-[8px] bg-red-500/10 text-red-500 px-1 py-0.5 rounded font-bold uppercase">DISABLED</span>}
                                                    {path.stripPrefix && <span className="text-[8px] bg-orange-500/10 text-orange-500 px-1 py-0.5 rounded font-bold uppercase">STRIP</span>}
                                                    {path.websocketEnabled && <span className="text-[8px] bg-blue-500/10 text-blue-500 px-1 py-0.5 rounded font-bold uppercase">WS</span>}
                                                    {path.order !== undefined && path.order !== 0 && <span className="text-[8px] bg-purple-500/10 text-purple-500 px-1 py-0.5 rounded font-bold uppercase">ORDER: {path.order}</span>}
                                                </div>
                                            </div>
                                            <div className="flex gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditingPath(path);
                                                        setIsPathModalOpen(true);
                                                    }}
                                                    className="p-1 text-on-surface-variant hover:text-blue-500 transition-colors"
                                                    title="Edit"
                                                >
                                                    <Pencil size={12} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setPaths(paths.filter(p => p.id !== path.id))}
                                                    className="p-1 text-on-surface-variant hover:text-red-500 transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <span className="text-[10px] text-on-surface-variant italic">No custom paths (default route: / → {target})</span>
                            )}
                        </div>

                    </div>

                </div>


                <div className="flex gap-2 pt-4 border-t border-outline/5 flex-shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-outline/20 hover:bg-white/5 text-sm font-bold transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 bg-primary text-on-primary px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all"
                    >
                        {initialHost ? 'Save Changes' : 'Create Host'}
                    </button>
                </div>
            </form>

            {/* Path Route Modal - rendered inside ProxyHostModal */}
            {
                isPathModalOpen && (
                    <PathRouteModal
                        hostId={initialHost?.id || ''}
                        initialPath={editingPath || undefined}
                        onClose={() => {
                            setIsPathModalOpen(false);
                            setEditingPath(null);
                        }}
                        onSave={(path) => {
                            if (editingPath) {
                                setPaths(paths.map(p => p.id === path.id ? path : p));
                            } else {
                                setPaths([...paths, path]);
                            }
                            setIsPathModalOpen(false);
                            setEditingPath(null);
                        }}
                    />
                )
            }
        </Modal >
    );
}

function PathRouteModal({
    onClose,
    onSave,
    initialPath,
    hostId
}: {
    onClose: () => void,
    onSave: (path: PathRoute) => void,
    initialPath?: PathRoute,
    hostId: string
}) {
    const [path, setPath] = useState(initialPath?.path || '/');
    const [target, setTarget] = useState(initialPath?.target || 'http://');
    const [websocketEnabled, setWebsocketEnabled] = useState(initialPath?.websocketEnabled || false);
    const [stripPrefix, setStripPrefix] = useState(initialPath?.stripPrefix || false);
    const [allowedIps, setAllowedIps] = useState<string[]>(initialPath?.allowedIps || []);
    const [newIp, setNewIp] = useState('');
    const [customConfig, setCustomConfig] = useState(initialPath?.customConfig || '');
    const [enabled, setEnabled] = useState(initialPath?.enabled !== undefined ? initialPath.enabled : true);
    const [name, setName] = useState(initialPath?.name || '');
    const [order, setOrder] = useState(initialPath?.order?.toString() || '0');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Rate Limiting State
    const [rateLimitEnabled, setRateLimitEnabled] = useState(initialPath?.rateLimit?.enabled || false);
    const [rateLimitRate, setRateLimitRate] = useState(initialPath?.rateLimit?.rate?.toString() || '10');
    const [rateLimitPeriod, setRateLimitPeriod] = useState<'s' | 'm'>(initialPath?.rateLimit?.period || 's');
    const [rateLimitBurst, setRateLimitBurst] = useState(initialPath?.rateLimit?.burst?.toString() || '20');
    const [rateLimitNodelay, setRateLimitNodelay] = useState(initialPath?.rateLimit?.nodelay ?? true);
    const [isStatic, setIsStatic] = useState(initialPath?.isStatic || false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const pathData: PathRoute = {
            id: initialPath?.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            path: path.startsWith('/') ? path : `/${path}`,
            target,
            websocketEnabled,
            stripPrefix,
            allowedIps: allowedIps.length > 0 ? allowedIps : undefined,
            customConfig: customConfig.trim() || undefined,
            enabled,
            name: name.trim() || undefined,
            order: parseInt(order) || 0,
            rateLimit: rateLimitEnabled ? {
                enabled: true,
                rate: parseInt(rateLimitRate) || 10,
                period: rateLimitPeriod,
                burst: parseInt(rateLimitBurst) || 20,
                nodelay: rateLimitNodelay
            } : undefined,
            isStatic
        };

        await onSave(pathData);
        setIsSubmitting(false);
    };



    return (
        <Modal
            onClose={onClose}
            title={initialPath ? 'Edit Path Route' : 'Add Path Route'}
            description="Fine-grained routing rules"
            icon={<Network size={24} />}
            maxWidth="max-w-xl"
            className="flex flex-col"
        >
            <div className="flex-1 overflow-y-auto mt-4 px-1 custom-scrollbar">
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Path Type Selector */}
                    <div className="flex bg-black/20 p-1 rounded-xl border border-outline/10">
                        <button
                            type="button"
                            onClick={() => setIsStatic(false)}
                            className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${!isStatic ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}
                        >
                            Proxy
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsStatic(true)}
                            className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${isStatic ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}
                        >
                            Static
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Path Prefix</label>
                            <input
                                required
                                type="text"
                                placeholder="e.g. /api"
                                value={path}
                                onChange={(e) => setPath(e.target.value)}
                                className="w-full bg-white/5 border border-outline/20 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-all font-bold placeholder:font-normal"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                                {isStatic ? 'Static Directory' : 'Target Address'}
                            </label>
                            <input
                                required
                                type="text"
                                placeholder={isStatic ? "/var/www/html/dist" : "e.g. http://127.0.0.1:3000"}
                                value={target}
                                onChange={(e) => setTarget(e.target.value)}
                                className="w-full bg-white/5 border border-outline/20 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-all font-mono font-bold placeholder:font-normal"
                            />
                        </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 rounded-2xl bg-white/5 border border-outline/10 cursor-pointer hover:border-primary/30 transition-all group">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${stripPrefix ? 'bg-primary/20 text-primary' : 'bg-white/5 text-on-surface-variant'}`}>
                            <Activity size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-on-surface">Strip Prefix</div>
                            <div className="text-[10px] text-on-surface-variant font-medium">Remove path from target request</div>
                        </div>
                        <input
                            type="checkbox"
                            checked={stripPrefix}
                            onChange={(e) => setStripPrefix(e.target.checked)}
                            className="w-5 h-5 rounded-lg border-outline/20 bg-white/5 checked:bg-primary accent-primary"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Custom Nginx Config</label>
                        <textarea
                            value={customConfig}
                            onChange={(e) => setCustomConfig(e.target.value)}
                            placeholder="# e.g. proxy_set_header X-Custom yes;"
                            className="w-full bg-[#1e1e1e] border border-outline/20 rounded-2xl px-4 py-4 text-xs font-mono focus:outline-none focus:border-primary h-32 resize-none shadow-inner"
                        />
                    </div>

                    <div className="flex gap-3 pt-6 sticky bottom-0 bg-surface sm:bg-transparent -mx-6 px-6 sm:mx-0 sm:px-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-4 rounded-[22px] border border-outline/20 hover:bg-white/5 text-xs font-black uppercase tracking-widest transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 bg-primary text-on-primary py-4 rounded-[22px] font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20 disabled:opacity-50 active:scale-95 transition-all"
                        >
                            {initialPath ? 'Confirm Update' : 'Initialize Path'}
                        </button>
                    </div>
                </form>
            </div>
        </Modal>
    );

}
