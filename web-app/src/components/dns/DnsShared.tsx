'use client';

import React, { useState } from 'react';
import { CheckCircle, XCircle, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { CreateZoneRequest, DnsZoneType, DnsZoneRole } from '@/lib/types';
import { toast } from 'sonner';

export function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${ok ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
            {ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
            {label}
        </span>
    );
}

export function SectionCard({ title, children, actions, collapsible = false, defaultExpanded = true }: { title: string; children: React.ReactNode; actions?: React.ReactNode; collapsible?: boolean; defaultExpanded?: boolean }) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    return (
        <div className="rounded-xl border border-outline/10 bg-surface-container p-4">
            <div className={`flex items-center justify-between ${collapsible ? 'cursor-pointer select-none' : ''} ${(!collapsible || expanded) ? 'mb-3' : ''}`} onClick={() => collapsible && setExpanded(!expanded)}>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                    {collapsible && (expanded ? <ChevronDown size={14} className="text-on-surface-variant" /> : <ChevronRight size={14} className="text-on-surface-variant" />)}
                    {title}
                </h3>
                {actions && <div onClick={e => e.stopPropagation()}>{actions}</div>}
            </div>
            {(!collapsible || expanded) && children}
        </div>
    );
}

export function EmptyState({ message }: { message: string }) {
    return <div className="text-center py-8 text-on-surface-variant text-sm">{message}</div>;
}

export function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
    const [input, setInput] = useState('');

    const add = () => {
        const trimmed = input.trim();
        if (trimmed && !value.includes(trimmed)) {
            onChange([...value, trimmed]);
            setInput('');
        }
    };

    return (
        <div>
            <div className="flex gap-1.5 flex-wrap mb-2">
                {value.map((v, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">
                        {v}
                        <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="hover:text-red-400">&times;</button>
                    </span>
                ))}
            </div>
            <div className="flex gap-2">
                <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
                    placeholder={placeholder}
                    className="flex-1 bg-surface-container rounded-lg px-3 py-1.5 text-sm border border-outline/10 focus:border-primary focus:outline-none"
                />
                <button onClick={add} className="px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs hover:bg-primary/20 transition-colors">
                    <Plus size={14} />
                </button>
            </div>
        </div>
    );
}

export function CreateZoneModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [name, setName] = useState('');
    const [type, setType] = useState<DnsZoneType>('FORWARD');
    const [role, setRole] = useState<DnsZoneRole>('MASTER');
    const [primaryNs, setPrimaryNs] = useState('ns1.example.com.');
    const [adminEmail, setAdminEmail] = useState('admin.example.com.');
    const [masters, setMasters] = useState<string[]>([]);
    const [forwarders, setForwarders] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const [hasManualNs, setHasManualNs] = useState(false);
    const [hasManualEmail, setHasManualEmail] = useState(false);

    React.useEffect(() => {
        DockerClient.getGlobalSecurityConfig().then(config => {
            if (config.defaultNameServers && config.defaultNameServers.length > 0) {
                const ns = config.defaultNameServers[0];
                setPrimaryNs(ns.endsWith('.') ? ns : `${ns}.`);
            }
        }).catch(console.error);
    }, []);

    const handleNameChange = (val: string) => {
        setName(val);
        const domain = val.trim();
        if (domain) {
            if (!hasManualNs && primaryNs.includes('example.com')) {
                setPrimaryNs(`ns1.${domain}.`);
            }
            if (!hasManualEmail) {
                setAdminEmail(`admin.${domain}.`);
            }
        }
    };

    const handleSubmit = async () => {
        if (!name.trim()) return;
        setLoading(true);
        const req: CreateZoneRequest = {
            name: name.trim(),
            type,
            role,
            soa: { primaryNs, adminEmail },
            masterAddresses: masters,
            forwarders,
        };
        const result = await DockerClient.createDnsZone(req);
        setLoading(false);
        if (result && (result as any).id) {
            toast.success(`Zone "${name}" created`);
            onCreated();
            onClose();
        } else {
            toast.error((result as any)?.message || 'Failed to create zone');
        }
    };

    const showMasters = role === 'SLAVE' || role === 'STUB';
    const showForwarders = role === 'FORWARD_ONLY';
    const showSoa = role === 'MASTER';

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-xl border border-outline/10 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-semibold mb-4">Create DNS Zone</h3>
                <div className="space-y-3">
                    <Field label="Zone Name">
                        <input value={name} onChange={e => handleNameChange(e.target.value)} placeholder="example.com" className="input-field" />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Type">
                            <select value={type} onChange={e => setType(e.target.value as DnsZoneType)} className="input-field">
                                <option value="FORWARD">Forward</option>
                                <option value="REVERSE">Reverse</option>
                            </select>
                        </Field>
                        <Field label="Role">
                            <select value={role} onChange={e => setRole(e.target.value as DnsZoneRole)} className="input-field">
                                <option value="MASTER">Master</option>
                                <option value="SLAVE">Slave</option>
                                <option value="STUB">Stub</option>
                                <option value="FORWARD_ONLY">Forward Only</option>
                            </select>
                        </Field>
                    </div>
                    {showSoa && (
                        <>
                            <Field label="Primary NS">
                                <input
                                    value={primaryNs}
                                    onChange={e => { setPrimaryNs(e.target.value); setHasManualNs(true); }}
                                    className="input-field"
                                />
                            </Field>
                            <Field label="Admin Email (SOA format)">
                                <input
                                    value={adminEmail}
                                    onChange={e => { setAdminEmail(e.target.value); setHasManualEmail(true); }}
                                    className="input-field"
                                />
                            </Field>
                        </>
                    )}
                    {showMasters && (
                        <Field label="Master Addresses">
                            <TagInput value={masters} onChange={setMasters} placeholder="10.0.0.1" />
                        </Field>
                    )}
                    {showForwarders && (
                        <Field label="Forwarders">
                            <TagInput value={forwarders} onChange={setForwarders} placeholder="8.8.8.8" />
                        </Field>
                    )}
                </div>
                <div className="flex gap-2 mt-5 justify-end">
                    <button onClick={onClose} className="btn-secondary">Cancel</button>
                    <button onClick={handleSubmit} disabled={loading || !name.trim()} className="btn-primary disabled:opacity-50">
                        {loading ? 'Creating...' : 'Create Zone'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-xs text-on-surface-variant mb-1">{label}</label>
            {children}
        </div>
    );
}
