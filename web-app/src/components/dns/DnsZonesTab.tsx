'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Power, Shield, FileText, Upload, BookTemplate } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DnsZone, DnsRecord, DnsRecordType, ZoneValidationResult, ZoneTemplate } from '@/lib/types';
import { StatusBadge, EmptyState, CreateZoneModal, TagInput, SectionCard } from './DnsShared';
import { toast } from 'sonner';

const RECORD_TYPES: DnsRecordType[] = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'PTR', 'CAA'];

const HINTS: Record<string, string> = {
    A: '192.168.1.1', AAAA: '2001:db8::1', CNAME: 'alias.example.com.',
    MX: 'mail.example.com.', TXT: 'v=spf1 include:...', NS: 'ns1.example.com.',
    SRV: 'target.example.com.', PTR: 'host.example.com.', CAA: '0 issue "letsencrypt.org"',
};

function RecordRow({ record, onUpdate, onDelete }: { record: DnsRecord; onUpdate: (r: DnsRecord) => void; onDelete: () => void }) {
    return (
        <tr className="border-b border-outline/5 hover:bg-surface-container/50 transition-colors">
            <td className="px-3 py-2">
                <input value={record.name} onChange={e => onUpdate({ ...record, name: e.target.value })} className="w-full bg-transparent border-b border-outline/10 focus:border-primary px-1 py-0.5 text-sm focus:outline-none" placeholder="@" />
            </td>
            <td className="px-3 py-2">
                <select value={record.type} onChange={e => onUpdate({ ...record, type: e.target.value as DnsRecordType })} className="bg-surface-container rounded px-2 py-1 text-xs border border-outline/10 focus:outline-none">
                    {RECORD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
            </td>
            <td className="px-3 py-2">
                <input value={record.value} onChange={e => onUpdate({ ...record, value: e.target.value })} placeholder={HINTS[record.type] || ''} className="w-full bg-transparent border-b border-outline/10 focus:border-primary px-1 py-0.5 text-sm focus:outline-none" />
            </td>
            <td className="px-3 py-2 w-20">
                <input type="number" value={record.ttl} onChange={e => onUpdate({ ...record, ttl: parseInt(e.target.value) || 3600 })} className="w-full bg-transparent border-b border-outline/10 focus:border-primary px-1 py-0.5 text-sm focus:outline-none text-center" />
            </td>
            {(record.type === 'MX' || record.type === 'SRV') && (
                <td className="px-3 py-2 w-16">
                    <input type="number" value={record.priority ?? 10} onChange={e => onUpdate({ ...record, priority: parseInt(e.target.value) || 0 })} className="w-full bg-transparent border-b border-outline/10 focus:border-primary px-1 py-0.5 text-sm focus:outline-none text-center" />
                </td>
            )}
            <td className="px-3 py-2 w-10">
                <button onClick={onDelete} className="text-red-400 hover:text-red-300 transition-colors p-1"><Trash2 size={14} /></button>
            </td>
        </tr>
    );
}

function ZoneDetail({ zone, onRefresh }: { zone: DnsZone; onRefresh: () => void }) {
    const [records, setRecords] = useState<DnsRecord[]>(zone.records);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showFile, setShowFile] = useState(false);
    const [fileContent, setFileContent] = useState('');
    const [validation, setValidation] = useState<ZoneValidationResult | null>(null);
    const [showImport, setShowImport] = useState(false);
    const [importText, setImportText] = useState('');
    const [templates, setTemplates] = useState<ZoneTemplate[]>([]);
    const [showTemplates, setShowTemplates] = useState(false);

    useEffect(() => {
        setRecords(zone.records);
        setDirty(false);
        setShowFile(false);
        setValidation(null);
    }, [zone.id, zone.records]);

    const saveRecords = async () => {
        setSaving(true);
        const result = await DockerClient.updateDnsRecords(zone.id, records);
        setSaving(false);
        if ((result as any)?.success !== false) { toast.success('Records saved'); setDirty(false); onRefresh(); }
        else toast.error('Failed to save records');
    };

    const handleValidate = async () => {
        const r = await DockerClient.validateDnsZone(zone.id);
        setValidation(r);
        r.valid ? toast.success('Zone is valid') : toast.error('Validation failed');
    };

    const handleShowFile = async () => {
        if (showFile) { setShowFile(false); return; }
        setFileContent(await DockerClient.getDnsZoneFile(zone.id));
        setShowFile(true);
    };

    const handleImport = async () => {
        const r = await DockerClient.importDnsZoneFile({ zoneId: zone.id, content: importText, format: 'bind' });
        if (r.success) { toast.success(`Imported ${r.imported} records`); setShowImport(false); setImportText(''); onRefresh(); }
        else toast.error(r.errors.join(', ') || 'Import failed');
    };

    const handleApplyTemplate = async (templateId: string) => {
        const r = await DockerClient.applyDnsTemplate(zone.id, templateId);
        if ((r as any)?.success !== false) { toast.success('Template applied'); setShowTemplates(false); onRefresh(); }
        else toast.error('Failed to apply template');
    };

    const loadTemplates = async () => {
        setTemplates(await DockerClient.listDnsTemplates());
        setShowTemplates(true);
    };

    const hasPriority = records.some(r => r.type === 'MX' || r.type === 'SRV');

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold flex-1">{zone.name}</h3>
                <span className="text-xs text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">{zone.role}</span>
                <StatusBadge ok={zone.enabled} label={zone.enabled ? 'Enabled' : 'Disabled'} />
                {zone.dnssecEnabled && <StatusBadge ok={true} label="DNSSEC" />}
                <span className="text-xs text-on-surface-variant">Serial: {zone.soa.serial}</span>
            </div>

            <div className="flex gap-2 flex-wrap">
                <button onClick={() => { setRecords(r => [...r, { id: '', name: '@', type: 'A', value: '', ttl: 3600 }]); setDirty(true); }} className="btn-sm bg-primary/10 text-primary"><Plus size={14} /> Add Record</button>
                {dirty && <button onClick={saveRecords} disabled={saving} className="btn-sm bg-primary text-on-primary disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>}
                <button onClick={handleValidate} className="btn-sm bg-surface-container"><Shield size={14} /> Validate</button>
                <button onClick={handleShowFile} className="btn-sm bg-surface-container"><FileText size={14} /> {showFile ? 'Hide' : 'View'} File</button>
                <button onClick={() => setShowImport(!showImport)} className="btn-sm bg-surface-container"><Upload size={14} /> Import</button>
                <button onClick={loadTemplates} className="btn-sm bg-surface-container"><BookTemplate size={14} /> Templates</button>
            </div>

            {validation && (
                <div className={`rounded-lg p-3 text-xs font-mono ${validation.valid ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{validation.output}</div>
            )}

            {showImport && (
                <SectionCard title="Import Records (BIND format)">
                    <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={5} className="w-full bg-surface rounded-lg p-3 text-xs font-mono border border-outline/10 focus:outline-none focus:border-primary" placeholder={"www  3600  IN  A  1.2.3.4\nmail 3600  IN  MX 10 mail.example.com."} />
                    <button onClick={handleImport} disabled={!importText.trim()} className="btn-sm bg-primary text-on-primary mt-2 disabled:opacity-50">Import</button>
                </SectionCard>
            )}

            {showTemplates && templates.length > 0 && (
                <SectionCard title="Apply Template">
                    <div className="space-y-2">
                        {templates.map(t => (
                            <div key={t.id} className="flex items-center justify-between p-2 rounded-lg bg-surface hover:bg-surface-container-high transition-colors">
                                <div>
                                    <div className="text-sm font-medium">{t.name}</div>
                                    <div className="text-[10px] text-on-surface-variant">{t.description} &middot; {t.records.length} records</div>
                                </div>
                                <button onClick={() => handleApplyTemplate(t.id)} className="btn-sm bg-primary/10 text-primary">Apply</button>
                            </div>
                        ))}
                    </div>
                </SectionCard>
            )}

            {records.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-outline/10">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-surface-container text-on-surface-variant text-xs">
                                <th className="px-3 py-2 text-left font-medium">Name</th>
                                <th className="px-3 py-2 text-left font-medium">Type</th>
                                <th className="px-3 py-2 text-left font-medium">Value</th>
                                <th className="px-3 py-2 text-center font-medium">TTL</th>
                                {hasPriority && <th className="px-3 py-2 text-center font-medium">Pri</th>}
                                <th className="px-3 py-2 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {records.map((r, i) => (
                                <RecordRow key={r.id || i} record={r}
                                    onUpdate={u => { const next = [...records]; next[i] = u; setRecords(next); setDirty(true); }}
                                    onDelete={() => { setRecords(records.filter((_, j) => j !== i)); setDirty(true); }} />
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <EmptyState message='No records yet. Click "Add Record" to get started.' />
            )}

            {showFile && (
                <SectionCard title="Zone File">
                    <pre className="text-xs font-mono text-on-surface whitespace-pre-wrap overflow-x-auto max-h-60">{fileContent || 'No content'}</pre>
                </SectionCard>
            )}
        </div>
    );
}

export default function DnsZonesTab({ zones, selectedZoneId, onSelectZone, onRefresh }: {
    zones: DnsZone[];
    selectedZoneId: string | null;
    onSelectZone: (id: string | null) => void;
    onRefresh: () => void;
}) {
    const [showCreate, setShowCreate] = useState(false);
    const selectedZone = zones.find(z => z.id === selectedZoneId) || null;

    const handleToggle = async (id: string) => { await DockerClient.toggleDnsZone(id); onRefresh(); };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Delete zone "${name}"?`)) return;
        if (await DockerClient.deleteDnsZone(id)) {
            toast.success(`Zone "${name}" deleted`);
            if (selectedZoneId === id) onSelectZone(null);
            onRefresh();
        } else toast.error('Failed to delete zone');
    };

    return (
        <div className="flex gap-6 items-start">
            <div className="w-72 shrink-0 space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Zones</h2>
                    <button onClick={() => setShowCreate(true)} className="btn-sm bg-primary/10 text-primary"><Plus size={13} /> New</button>
                </div>
                {zones.length === 0 && <EmptyState message="No zones configured" />}
                <div className="space-y-1">
                    {zones.map(z => (
                        <div key={z.id} className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${selectedZoneId === z.id ? 'bg-primary/10 border border-primary/20' : 'bg-surface-container hover:bg-surface-container-high border border-transparent'}`} onClick={() => onSelectZone(z.id)}>
                            <div className={`w-2 h-2 rounded-full shrink-0 ${z.enabled ? 'bg-green-400' : 'bg-gray-500'}`} />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{z.name}</div>
                                <div className="text-[10px] text-on-surface-variant">{z.records.length} rec &middot; {z.role.toLowerCase()}</div>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={e => { e.stopPropagation(); handleToggle(z.id); }} className="p-1 rounded hover:bg-surface-container-high"><Power size={12} className={z.enabled ? 'text-green-400' : 'text-gray-500'} /></button>
                                <button onClick={e => { e.stopPropagation(); handleDelete(z.id, z.name); }} className="p-1 rounded hover:bg-red-500/10 text-red-400"><Trash2 size={12} /></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex-1 min-w-0 bg-surface-container rounded-2xl border border-outline/10 p-5">
                {selectedZone ? <ZoneDetail zone={selectedZone} onRefresh={onRefresh} /> : <EmptyState message={zones.length > 0 ? 'Select a zone' : 'Create your first DNS zone'} />}
            </div>
            {showCreate && <CreateZoneModal onClose={() => setShowCreate(false)} onCreated={onRefresh} />}
        </div>
    );
}
