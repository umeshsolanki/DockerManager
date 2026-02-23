'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Key, ShieldCheck, Lock, Globe, ServerCrash } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DnsAcl, TsigKey, DnsZone, DnssecStatus, TsigAlgorithm, GlobalSecurityConfig } from '@/lib/types';
import { SectionCard, EmptyState, StatusBadge, TagInput } from './DnsShared';
import { toast } from 'sonner';

function GlobalSecuritySection() {
    const [config, setConfig] = useState<GlobalSecurityConfig | null>(null);
    const [saving, setSaving] = useState(false);

    const refresh = useCallback(async () => setConfig(await DockerClient.getGlobalSecurityConfig()), []);
    useEffect(() => { refresh(); }, [refresh]);

    const handleSave = async () => {
        if (!config) return;
        setSaving(true);
        const r = await DockerClient.updateGlobalSecurityConfig(config);
        setSaving(false);
        r.success ? toast.success('Security settings saved') : toast.error(r.message || 'Failed to save');
        refresh();
    };

    if (!config) return null;

    return (
        <SectionCard title="Global Security & Query Control" actions={<Globe size={14} className="text-on-surface-variant" />}>
            <div className="space-y-4">

                {/* Recursion Control */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Allow Recursion</label>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={config.recursionEnabled} onChange={e => setConfig({ ...config, recursionEnabled: e.target.checked })} />
                            <div className="w-9 h-5 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-surface after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                    </div>
                    <p className="text-xs text-on-surface-variant">WARNING: Enabling recursion without restricting access can turn your server into an open resolver, vulnerable to DNS amplification attacks.</p>

                    {config.recursionEnabled && (
                        <div>
                            <label className="block text-xs font-medium mb-1">Allowed IPs / ACLs</label>
                            <TagInput value={config.allowRecursion} onChange={v => setConfig({ ...config, allowRecursion: v })} placeholder="e.g. 192.168.1.0/24, localnets" />
                        </div>
                    )}
                </div>

                <div className="border-t border-outline/10 pt-3"></div>

                {/* Rate Limiting */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-medium flex items-center gap-1"><ServerCrash size={14} className="text-amber-400" /> Response Rate Limiting (RRL)</label>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={config.rateLimitEnabled} onChange={e => setConfig({ ...config, rateLimitEnabled: e.target.checked })} />
                            <div className="w-9 h-5 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-surface after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                    </div>
                    <p className="text-xs text-on-surface-variant">Mitigates DNS amplification attacks by limiting duplicate responses.</p>

                    {config.rateLimitEnabled && (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium mb-1">Responses strictly per second</label>
                                <input type="number" min="1" value={config.rateLimitResponsesPerSecond} onChange={e => setConfig({ ...config, rateLimitResponsesPerSecond: parseInt(e.target.value) || 10 })} className="input-field" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1">Window (seconds)</label>
                                <input type="number" min="1" value={config.rateLimitWindow} onChange={e => setConfig({ ...config, rateLimitWindow: parseInt(e.target.value) || 5 })} className="input-field" />
                            </div>
                        </div>
                    )}
                </div>

                <div className="border-t border-outline/10 pt-3"></div>

                {/* Default Name Servers */}
                <div className="space-y-2">
                    <label className="text-sm font-medium">Default Name Servers</label>
                    <p className="text-xs text-on-surface-variant">Recommended name servers that will be automatically added to all new master zones.</p>
                    <TagInput
                        value={config.defaultNameServers}
                        onChange={v => setConfig({ ...config, defaultNameServers: v })}
                        placeholder="e.g. ns1.yourdomain.com"
                    />
                </div>

                <div className="pt-2">
                    <button onClick={handleSave} disabled={saving} className="btn-primary w-full disabled:opacity-50">
                        {saving ? 'Saving...' : 'Apply Security Settings'}
                    </button>
                </div>
            </div>
        </SectionCard>
    );
}

function AclSection() {
    const [acls, setAcls] = useState<DnsAcl[]>([]);
    const [name, setName] = useState('');
    const [entries, setEntries] = useState<string[]>([]);
    const [comment, setComment] = useState('');

    const refresh = useCallback(async () => setAcls(await DockerClient.listDnsAcls()), []);
    useEffect(() => { refresh(); }, [refresh]);

    const handleCreate = async () => {
        if (!name.trim()) return;
        await DockerClient.createDnsAcl({ name: name.trim(), entries, comment });
        setName(''); setEntries([]); setComment('');
        toast.success('ACL created');
        refresh();
    };

    const handleDelete = async (id: string) => {
        if (await DockerClient.deleteDnsAcl(id)) { toast.success('ACL deleted'); refresh(); }
    };

    return (
        <SectionCard title="Access Control Lists" actions={<span className="text-[10px] text-on-surface-variant">{acls.length} ACLs</span>}>
            <div className="space-y-3">
                {acls.map(a => (
                    <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg bg-surface">
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{a.name}</div>
                            {a.comment && <div className="text-[10px] text-on-surface-variant">{a.comment}</div>}
                            <div className="flex gap-1 flex-wrap mt-1">
                                {a.entries.map((e, i) => <span key={i} className="text-[10px] bg-surface-container px-1.5 py-0.5 rounded font-mono">{e}</span>)}
                            </div>
                        </div>
                        <button onClick={() => handleDelete(a.id)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={14} /></button>
                    </div>
                ))}
                {acls.length === 0 && <p className="text-xs text-on-surface-variant">No ACLs defined</p>}
                <div className="border-t border-outline/10 pt-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <input value={name} onChange={e => setName(e.target.value)} placeholder="ACL name" className="input-field" />
                        <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Comment (optional)" className="input-field" />
                    </div>
                    <TagInput value={entries} onChange={setEntries} placeholder="192.168.0.0/24 or any/none/localhost" />
                    <button onClick={handleCreate} disabled={!name.trim()} className="btn-sm bg-primary/10 text-primary disabled:opacity-50"><Plus size={13} /> Add ACL</button>
                </div>
            </div>
        </SectionCard>
    );
}

function TsigSection() {
    const [keys, setKeys] = useState<TsigKey[]>([]);
    const [name, setName] = useState('');
    const [algorithm, setAlgorithm] = useState<TsigAlgorithm>('HMAC_SHA256');

    const refresh = useCallback(async () => setKeys(await DockerClient.listTsigKeys()), []);
    useEffect(() => { refresh(); }, [refresh]);

    const handleCreate = async () => {
        if (!name.trim()) return;
        const r = await DockerClient.createTsigKey({ name: name.trim(), algorithm });
        if (r && (r as any).id) { toast.success('TSIG key created'); setName(''); refresh(); }
        else toast.error('Failed to create key');
    };

    const handleDelete = async (id: string) => {
        if (await DockerClient.deleteTsigKey(id)) { toast.success('Key deleted'); refresh(); }
    };

    return (
        <SectionCard title="TSIG Keys" actions={<Key size={14} className="text-on-surface-variant" />}>
            <div className="space-y-3">
                {keys.map(k => (
                    <div key={k.id} className="flex items-center gap-3 p-3 rounded-lg bg-surface">
                        <Lock size={14} className="text-amber-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{k.name}</div>
                            <div className="text-[10px] text-on-surface-variant font-mono">{k.algorithm.replace('_', '-').toLowerCase()} &middot; {k.secret}</div>
                        </div>
                        <button onClick={() => handleDelete(k.id)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={14} /></button>
                    </div>
                ))}
                {keys.length === 0 && <p className="text-xs text-on-surface-variant">No TSIG keys</p>}
                <div className="border-t border-outline/10 pt-3 flex gap-2 flex-wrap">
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="Key name" className="input-field flex-1 min-w-[150px]" />
                    <select value={algorithm} onChange={e => setAlgorithm(e.target.value as TsigAlgorithm)} className="input-field w-40">
                        <option value="HMAC_SHA256">HMAC-SHA256</option>
                        <option value="HMAC_SHA512">HMAC-SHA512</option>
                        <option value="HMAC_SHA1">HMAC-SHA1</option>
                    </select>
                    <button onClick={handleCreate} disabled={!name.trim()} className="btn-sm bg-primary/10 text-primary disabled:opacity-50"><Plus size={13} /> Generate</button>
                </div>
            </div>
        </SectionCard>
    );
}

function DnssecSection({ zones }: { zones: DnsZone[] }) {
    const masterZones = zones.filter(z => z.role === 'MASTER');
    const [selectedId, setSelectedId] = useState<string | null>(masterZones[0]?.id ?? null);
    const [status, setStatus] = useState<DnssecStatus | null>(null);
    const [loading, setLoading] = useState(false);

    const refreshStatus = useCallback(async () => {
        if (!selectedId) return;
        setStatus(await DockerClient.getDnssecStatus(selectedId));
    }, [selectedId]);

    useEffect(() => { refreshStatus(); }, [refreshStatus]);

    const handleToggle = async () => {
        if (!selectedId) return;
        setLoading(true);
        const r = status?.enabled
            ? await DockerClient.disableDnssec(selectedId)
            : await DockerClient.enableDnssec(selectedId);
        setLoading(false);
        r.success ? toast.success(r.message) : toast.error(r.message);
        refreshStatus();
    };

    return (
        <SectionCard title="DNSSEC" actions={<ShieldCheck size={14} className="text-on-surface-variant" />}>
            {masterZones.length === 0 ? (
                <p className="text-xs text-on-surface-variant">No master zones available for DNSSEC</p>
            ) : (
                <div className="space-y-3">
                    <select value={selectedId ?? ''} onChange={e => setSelectedId(e.target.value)} className="input-field">
                        {masterZones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                    </select>
                    {status && (
                        <div className="space-y-2">
                            <div className="flex gap-2">
                                <StatusBadge ok={status.enabled} label={status.enabled ? 'Enabled' : 'Disabled'} />
                                {status.signed && <StatusBadge ok={true} label="Signed" />}
                            </div>
                            {status.kskKeyTag && <p className="text-[10px] text-on-surface-variant font-mono">KSK: {status.kskKeyTag}</p>}
                            {status.zskKeyTag && <p className="text-[10px] text-on-surface-variant font-mono">ZSK: {status.zskKeyTag}</p>}
                            {status.dsRecords.length > 0 && (
                                <div>
                                    <p className="text-xs font-medium mb-1">DS Records (add to registrar)</p>
                                    {status.dsRecords.map((ds, i) => <pre key={i} className="text-[10px] font-mono bg-surface p-2 rounded mb-1 break-all">{ds}</pre>)}
                                </div>
                            )}
                            <div className="flex gap-2">
                                <button onClick={handleToggle} disabled={loading} className={`btn-sm flex-1 justify-center ${status.enabled ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'} disabled:opacity-50`}>
                                    {loading ? 'Processing...' : status.enabled ? 'Disable DNSSEC' : 'Enable DNSSEC'}
                                </button>
                                {status.enabled && (
                                    <button
                                        onClick={async () => {
                                            setLoading(true);
                                            const r = await DockerClient.signDnsZone(selectedId!);
                                            setLoading(false);
                                            r.success ? toast.success(r.message) : toast.error(r.message);
                                            refreshStatus();
                                        }}
                                        disabled={loading}
                                        className="btn-sm bg-primary/10 text-primary disabled:opacity-50"
                                        title="Manually re-sign the zone with the current keys"
                                    >
                                        Resign Zone
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </SectionCard>
    );
}

export default function DnsSecurityTab({ zones }: { zones: DnsZone[] }) {
    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <GlobalSecuritySection />
            <DnssecSection zones={zones} />
            <TsigSection />
            <AclSection />
        </div>
    );
}

