'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Power, Shield, FileText, Upload, BookTemplate, Settings2, Search, Lock, Mail, ShieldCheck, CheckCircle2, RefreshCw, Globe } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import {
    DnsZone, DnsRecord, DnsRecordType, ZoneValidationResult, ZoneTemplate,
    UpdateZoneRequest, SoaRecord, PropagationCheckResult, IpPtrSuggestion
} from '@/lib/types';
import { StatusBadge, EmptyState, CreateZoneModal, TagInput, SectionCard } from './DnsShared';
import { SpfWizard, DkimWizard, DmarcWizard, PropagationChecker, ReverseDnsWizard, SrvWizard, EmailHealthCheck, ReverseDnsDashboard } from './DnsWizards';
import { toast } from 'sonner';

const RECORD_TYPES: DnsRecordType[] = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'PTR', 'CAA'];

const HINTS: Record<string, string> = {
    A: '192.168.1.1', AAAA: '2001:db8::1', CNAME: 'alias.example.com.',
    MX: 'mail.example.com.', TXT: 'v=spf1 include:...', NS: 'ns1.example.com.',
    SRV: 'target.example.com.', PTR: 'host.example.com.', CAA: '0 issue "letsencrypt.org"',
};

function RecordRow({ record, onUpdate, onDelete, onCheck }: {
    record: DnsRecord;
    onUpdate: (r: DnsRecord) => void;
    onDelete: () => void;
    onCheck: () => void;
}) {
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
            <td className="px-3 py-2 w-20">
                {record.type !== 'SOA' && (
                    <button onClick={onCheck} title="Check Propagation" className="text-primary hover:text-primary-high transition-colors p-1">
                        <Search size={14} />
                    </button>
                )}
            </td>
            <td className="px-3 py-2 w-10">
                <button onClick={onDelete} className="text-red-400 hover:text-red-300 transition-colors p-1"><Trash2 size={14} /></button>
            </td>
        </tr>
    );
}

function ZoneSettings({ zone, onRefresh }: { zone: DnsZone; onRefresh: () => void }) {
    const [allowTransfer, setAllowTransfer] = useState(zone.allowTransfer);
    const [allowUpdate, setAllowUpdate] = useState(zone.allowUpdate);
    const [allowQuery, setAllowQuery] = useState(zone.allowQuery);
    const [alsoNotify, setAlsoNotify] = useState(zone.alsoNotify);
    const [masterAddresses, setMasterAddresses] = useState(zone.masterAddresses);
    const [forwarders, setForwarders] = useState(zone.forwarders);
    const [soa, setSoa] = useState(zone.soa);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setAllowTransfer(zone.allowTransfer);
        setAllowUpdate(zone.allowUpdate);
        setAllowQuery(zone.allowQuery);
        setAlsoNotify(zone.alsoNotify);
        setMasterAddresses(zone.masterAddresses);
        setForwarders(zone.forwarders);
        setSoa(zone.soa);
    }, [zone.id]);

    const handleSave = async () => {
        setSaving(true);
        const req: UpdateZoneRequest = {
            soa: JSON.stringify(soa) !== JSON.stringify(zone.soa) ? soa : undefined,
            allowTransfer,
            allowUpdate,
            allowQuery,
            alsoNotify,
            masterAddresses,
            forwarders,
        };
        const r = await DockerClient.updateDnsZone(zone.id, req) as { success: boolean; message?: string };
        setSaving(false);
        if (r.success) { toast.success('Zone settings saved'); onRefresh(); }
        else toast.error(r.message || 'Failed to update zone');
    };

    return (
        <div className="space-y-4">
            <SectionCard title="SOA Record">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs text-on-surface-variant mb-1">Primary NS</label>
                        <input value={soa.primaryNs} onChange={e => setSoa({ ...soa, primaryNs: e.target.value })} className="input-field" />
                    </div>
                    <div>
                        <label className="block text-xs text-on-surface-variant mb-1">Admin Email</label>
                        <input value={soa.adminEmail} onChange={e => setSoa({ ...soa, adminEmail: e.target.value })} className="input-field" />
                    </div>
                    <div>
                        <label className="block text-xs text-on-surface-variant mb-1">Refresh (s)</label>
                        <input type="number" value={soa.refresh} onChange={e => setSoa({ ...soa, refresh: parseInt(e.target.value) || 3600 })} className="input-field" />
                    </div>
                    <div>
                        <label className="block text-xs text-on-surface-variant mb-1">Retry (s)</label>
                        <input type="number" value={soa.retry} onChange={e => setSoa({ ...soa, retry: parseInt(e.target.value) || 900 })} className="input-field" />
                    </div>
                    <div>
                        <label className="block text-xs text-on-surface-variant mb-1">Expire (s)</label>
                        <input type="number" value={soa.expire} onChange={e => setSoa({ ...soa, expire: parseInt(e.target.value) || 1209600 })} className="input-field" />
                    </div>
                    <div>
                        <label className="block text-xs text-on-surface-variant mb-1">Minimum TTL (s)</label>
                        <input type="number" value={soa.minimumTtl} onChange={e => setSoa({ ...soa, minimumTtl: parseInt(e.target.value) || 86400 })} className="input-field" />
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="Zone Protection">
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs text-on-surface-variant mb-1">Allow Transfer <span className="opacity-50">(IPs/ACLs allowed to AXFR)</span></label>
                        <TagInput value={allowTransfer} onChange={setAllowTransfer} placeholder="e.g. 10.0.0.2 or key tsig-key" />
                    </div>
                    <div>
                        <label className="block text-xs text-on-surface-variant mb-1">Allow Update <span className="opacity-50">(IPs/keys for dynamic updates)</span></label>
                        <TagInput value={allowUpdate} onChange={setAllowUpdate} placeholder="e.g. key dhcp-key or 192.168.1.0/24" />
                    </div>
                    <div>
                        <label className="block text-xs text-on-surface-variant mb-1">Allow Query <span className="opacity-50">(restrict who can query this zone)</span></label>
                        <TagInput value={allowQuery} onChange={setAllowQuery} placeholder="e.g. any or 10.0.0.0/8" />
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="Transfer & Notification">
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs text-on-surface-variant mb-1">Also Notify <span className="opacity-50">(send NOTIFY to these servers)</span></label>
                        <TagInput value={alsoNotify} onChange={setAlsoNotify} placeholder="e.g. 10.0.0.3" />
                    </div>
                    <div>
                        <label className="block text-xs text-on-surface-variant mb-1">Master Addresses <span className="opacity-50">(for slave/stub zones)</span></label>
                        <TagInput value={masterAddresses} onChange={setMasterAddresses} placeholder="e.g. 10.0.0.1" />
                    </div>
                    <div>
                        <label className="block text-xs text-on-surface-variant mb-1">Forwarders <span className="opacity-50">(zone-specific forwarders)</span></label>
                        <TagInput value={forwarders} onChange={setForwarders} placeholder="e.g. 8.8.8.8" />
                    </div>
                </div>
            </SectionCard>

            <button onClick={handleSave} disabled={saving} className="btn-primary w-full disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Zone Settings'}
            </button>
        </div>
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
    const [showSettings, setShowSettings] = useState(false);
    const [searchRecord, setSearchRecord] = useState('');
    const [showWizards, setShowWizards] = useState(false);
    const [activeWizard, setActiveWizard] = useState<'spf' | 'dkim' | 'dmarc' | 'srv' | 'propagation' | 'reverse' | null>(null);
    const [propRecord, setPropRecord] = useState<DnsRecord | null>(null);

    useEffect(() => {
        setRecords(zone.records);
        setDirty(false);
        setShowFile(false);
        setShowSettings(false);
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

            <div className="flex gap-2 flex-wrap p-3 rounded-lg bg-surface border border-outline/10 text-xs items-center text-on-surface-variant">
                <span className="font-medium mr-2">Quick Settings:</span>
                <label className="flex items-center gap-2 cursor-pointer hover:text-on-surface transition-colors">
                    <input
                        type="checkbox"
                        checked={zone.allowQuery.includes('any')}
                        onChange={async (e) => {
                            const newAllowQuery = e.target.checked ? ['any'] : [];
                            const r = await DockerClient.updateDnsZoneOptions(zone.id, { allowQuery: newAllowQuery });
                            if (r) { toast.success('Options updated'); onRefresh(); } else toast.error('Failed to update');
                        }}
                        className="rounded bg-surface border-outline/20 text-primary w-3.5 h-3.5 focus:ring-primary focus:ring-offset-0"
                    />
                    Allow Query (Any)
                </label>
                <span className="text-outline/20 mx-1">|</span>
                <label className="flex items-center gap-2 cursor-pointer hover:text-on-surface transition-colors">
                    <input
                        type="checkbox"
                        checked={zone.allowTransfer.includes('any')}
                        onChange={async (e) => {
                            const newAllowTransfer = e.target.checked ? ['any'] : [];
                            const r = await DockerClient.updateDnsZoneOptions(zone.id, { allowTransfer: newAllowTransfer });
                            if (r) { toast.success('Options updated'); onRefresh(); } else toast.error('Failed to update');
                        }}
                        className="rounded bg-surface border-outline/20 text-primary w-3.5 h-3.5 focus:ring-primary focus:ring-offset-0"
                    />
                    Allow Transfer (Any)
                </label>
            </div>

            <div className="flex gap-2 flex-wrap">
                <button onClick={() => { setRecords(r => [...r, { id: '', name: '@', type: 'A', value: '', ttl: 3600 }]); setDirty(true); }} className="btn-sm bg-primary/10 text-primary"><Plus size={14} /> Add Record</button>
                {dirty && <button onClick={saveRecords} disabled={saving} className="btn-sm bg-primary text-on-primary disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>}
                <button onClick={handleValidate} className="btn-sm bg-surface-container"><Shield size={14} /> Validate</button>
                <button onClick={handleShowFile} className="btn-sm bg-surface-container"><FileText size={14} /> {showFile ? 'Hide' : 'View'} File</button>
                <button onClick={() => setShowImport(!showImport)} className="btn-sm bg-surface-container"><Upload size={14} /> Import</button>
                <button onClick={loadTemplates} className="btn-sm bg-surface-container"><BookTemplate size={14} /> Templates</button>
                <button onClick={() => setShowSettings(!showSettings)} className={`btn-sm ${showSettings ? 'bg-primary/20 text-primary' : 'bg-surface-container'}`}><Settings2 size={14} /> Zone Settings</button>
                <div className="relative">
                    <button onClick={() => setShowWizards(!showWizards)} className={`btn-sm ${showWizards || (activeWizard && activeWizard !== 'propagation') ? 'bg-primary/20 text-primary' : 'bg-surface-container'}`}>
                        <ShieldCheck size={14} /> Hosting Tools
                    </button>
                    {showWizards && (
                        <div className="absolute top-full mt-1 right-0 w-48 bg-surface rounded-xl border border-outline/10 shadow-xl z-20 py-1 flex flex-col">
                            <button onClick={() => { setActiveWizard('spf'); setShowWizards(false); }} className="px-3 py-2 text-xs text-left hover:bg-surface-container transition-colors flex items-center gap-2"><Mail size={12} /> SPF Wizard</button>
                            <button onClick={() => { setActiveWizard('srv'); setShowWizards(false); }} className="px-3 py-2 text-xs text-left hover:bg-surface-container transition-colors flex items-center gap-2"><Globe size={12} /> SRV Auto-config</button>
                            <button onClick={() => { setActiveWizard('dkim'); setShowWizards(false); }} className="px-3 py-2 text-xs text-left hover:bg-surface-container transition-colors flex items-center gap-2"><Lock size={12} /> DKIM Producer</button>
                            <button onClick={() => { setActiveWizard('dmarc'); setShowWizards(false); }} className="px-3 py-2 text-xs text-left hover:bg-surface-container transition-colors flex items-center gap-2"><Shield size={12} /> DMARC Setup</button>
                            <button onClick={() => { setActiveWizard('reverse'); setShowWizards(false); }} className="px-3 py-2 text-xs text-left hover:bg-surface-container transition-colors flex items-center gap-2"><RefreshCw size={12} /> Reverse DNS Helper</button>
                        </div>
                    )}
                </div>
            </div>

            {activeWizard && (
                <SectionCard
                    title={
                        activeWizard === 'spf' ? 'SPF Wizard' :
                            activeWizard === 'srv' ? 'SRV Auto-config' :
                                activeWizard === 'dkim' ? 'DKIM Producer' :
                                    activeWizard === 'dmarc' ? 'DMARC Setup' :
                                        activeWizard === 'propagation' ? 'Propagation Check' :
                                            'Reverse DNS Helper'
                    }
                    actions={<button onClick={() => { setActiveWizard(null); setPropRecord(null); }} className="text-on-surface-variant hover:text-on-surface">Close</button>}
                >
                    {activeWizard === 'spf' && <SpfWizard zone={zone} onAddRecord={r => { setRecords([...records, { ...r, id: `new-${Date.now()}` } as DnsRecord]); setDirty(true); }} />}
                    {activeWizard === 'srv' && <SrvWizard zone={zone} onAddRecord={r => { setRecords([...records, { ...r, id: `new-${Date.now()}` } as DnsRecord]); setDirty(true); }} />}
                    {activeWizard === 'dkim' && <DkimWizard zone={zone} onAddRecord={r => { setRecords([...records, { ...r, id: `new-${Date.now()}` } as DnsRecord]); setDirty(true); }} />}
                    {activeWizard === 'dmarc' && <DmarcWizard zone={zone} onAddRecord={r => { setRecords([...records, { ...r, id: `new-${Date.now()}` } as DnsRecord]); setDirty(true); }} />}
                    {activeWizard === 'propagation' && propRecord && <PropagationChecker zone={zone} record={propRecord} />}
                    {activeWizard === 'reverse' && <ReverseDnsWizard onZoneSuggested={(s: IpPtrSuggestion) => {
                        DockerClient.createDnsZone({ name: s.reverseZone, type: 'REVERSE', role: 'MASTER' }).then(r => {
                            if (r) {
                                toast.success(`Created reverse zone ${s.reverseZone}`);
                                DockerClient.addDnsRecord(r.id, { id: '', name: s.ptrRecordName, type: 'PTR', value: 'localhost.', ttl: 86400 } as DnsRecord);
                                onRefresh();
                                setActiveWizard(null);
                            }
                        });
                    }} />}
                </SectionCard>
            )}

            {zone.type === 'FORWARD' && (
                <SectionCard title="Email Health Check">
                    <EmailHealthCheck zoneId={zone.id} />
                </SectionCard>
            )}

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

            {showSettings && <ZoneSettings zone={zone} onRefresh={onRefresh} />}

            <div className="flex items-center gap-2 mb-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
                    <input
                        value={searchRecord}
                        onChange={e => setSearchRecord(e.target.value)}
                        placeholder="Search records by name, type, or value..."
                        className="w-full bg-surface pl-9 pr-3 py-1.5 rounded-lg text-sm border border-outline/10 focus:border-primary focus:outline-none transition-colors"
                    />
                </div>
            </div>

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
                                <th className="px-3 py-2 w-20">Tools</th>
                                <th className="px-3 py-2 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {records.filter(r =>
                                r.name.toLowerCase().includes(searchRecord.toLowerCase()) ||
                                r.type.toLowerCase().includes(searchRecord.toLowerCase()) ||
                                r.value.toLowerCase().includes(searchRecord.toLowerCase())
                            ).map((r, i) => (
                                <RecordRow key={r.id || i} record={r}
                                    onUpdate={u => { const next = [...records]; next[i] = u; setRecords(next); setDirty(true); }}
                                    onDelete={() => { setRecords(records.filter((_, j) => j !== i)); setDirty(true); }}
                                    onCheck={() => { setPropRecord(r); setActiveWizard('propagation'); }} />
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
    const [searchZone, setSearchZone] = useState('');
    const [showReverseDashboard, setShowReverseDashboard] = useState(false);
    const selectedZone = zones.find(z => z.id === selectedZoneId) || null;

    const filteredZones = useMemo(() => {
        if (!searchZone.trim()) return zones;
        const q = searchZone.toLowerCase();
        return zones.filter(z => z.name.toLowerCase().includes(q) || z.role.toLowerCase().includes(q));
    }, [zones, searchZone]);

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
                    <div className="flex gap-1">
                        <button onClick={async () => {
                            if (confirm('Create standard default zones?')) {
                                await DockerClient.createDefaultDnsZones();
                                onRefresh();
                                toast.success('Default zones created');
                            }
                        }} className="p-1.5 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors" title="Create Default Zones">
                            <RefreshCw size={13} />
                        </button>
                        <button onClick={() => setShowCreate(true)} className="btn-sm bg-primary/10 text-primary"><Plus size={13} /> New</button>
                        <button onClick={() => setShowReverseDashboard(true)} className="btn-sm bg-surface-container" title="Reverse DNS Dashboard"><RefreshCw size={13} /></button>
                    </div>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
                    <input
                        value={searchZone}
                        onChange={e => setSearchZone(e.target.value)}
                        placeholder="Search zones..."
                        className="w-full bg-surface-container-high pl-9 pr-3 py-1.5 rounded-lg text-sm border border-outline/10 focus:border-primary focus:outline-none transition-colors"
                    />
                </div>

                {filteredZones.length === 0 && <EmptyState message={searchZone ? "No matching zones" : "No zones configured"} />}
                <div className="space-y-1">
                    {filteredZones.map(z => (
                        <div key={z.id} className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${selectedZoneId === z.id ? 'bg-primary/10 border border-primary/20' : 'bg-surface-container hover:bg-surface-container-high border border-transparent'}`} onClick={() => onSelectZone(z.id)}>
                            <div className={`w-2 h-2 rounded-full shrink-0 ${z.enabled ? 'bg-green-400' : 'bg-gray-500'}`} />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{z.name}</div>
                                <div className="text-[10px] text-on-surface-variant">
                                    {z.records.length} rec &middot; {z.role.toLowerCase()}
                                    {z.allowTransfer.length > 0 && ' · xfr'}
                                    {z.allowUpdate.length > 0 && ' · dyn'}
                                </div>
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
            {showReverseDashboard && (
                <div className="fixed inset-0 bg-surface/80 backdrop-blur-md z-[100] flex items-center justify-center p-6">
                    <div className="bg-surface-container rounded-3xl border border-outline/10 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-outline/10 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold">Reverse DNS Dashboard</h2>
                                <p className="text-xs text-on-surface-variant">Global overview of server IPs and PTR records</p>
                            </div>
                            <button onClick={() => setShowReverseDashboard(false)} className="p-2 rounded-xl hover:bg-surface-container-high transition-colors">
                                <Plus size={24} className="rotate-45" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">
                            <ReverseDnsDashboard />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
