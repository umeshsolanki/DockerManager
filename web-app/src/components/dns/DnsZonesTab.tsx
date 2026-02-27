'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Power, Shield, FileText, Upload, Download, BookTemplate, Settings2, Search, Lock, Mail, ShieldCheck, CheckCircle2, RefreshCw, Globe, Zap } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import {
    DnsZone, DnsRecord, DnsRecordType, ZoneValidationResult, ZoneTemplate,
    UpdateZoneRequest, SoaRecord, PropagationCheckResult, IpPtrSuggestion, PullZoneRequest
} from '@/lib/types';
import { StatusBadge, EmptyState, CreateZoneModal, TagInput, SectionCard } from './DnsShared';
import { SpfWizard, DkimWizard, DmarcWizard, PropagationChecker, ReverseDnsWizard, SrvWizard, EmailHealthCheck, ReverseDnsDashboard, ChildNsWizard } from './DnsWizards';
import { toast } from 'sonner';

const RECORD_TYPES: DnsRecordType[] = [
    'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'SRV', 'PTR', 'CAA',
    'TLSA', 'SSHFP', 'HTTPS', 'NAPTR'
];

const HINTS: Record<string, string> = {
    A: '192.168.1.1', AAAA: '2001:db8::1', CNAME: 'alias.example.com.',
    MX: 'mail.example.com.', TXT: 'v=spf1 include:...', NS: 'ns1.example.com.',
    SOA: 'ns1.example.com. admin.example.com. 1 3600 600 604800 300',
    SRV: 'target.example.com.', PTR: 'host.example.com.', CAA: '0 issue "letsencrypt.org"',
    TLSA: '3 1 1 <hex>', SSHFP: '1 1 <hex>', HTTPS: '1 . alpn="h2"', NAPTR: '100 10 "u" "sip+E2U" "!^.*$!sip:user@example.com!" .'
};

const TTL_PRESETS = [
    { value: 60, label: '1 min' },
    { value: 300, label: '5 min' },
    { value: 1800, label: '30 min' },
    { value: 3600, label: '1 hr' },
    { value: 21600, label: '6 hr' },
    { value: 43200, label: '12 hr' },
    { value: 86400, label: '1 day' },
    { value: 604800, label: '7 days' }
];

function RecordRow({ record, hasPriority, onUpdate, onDelete, onCheck }: {
    record: DnsRecord;
    hasPriority: boolean;
    onUpdate: (r: DnsRecord) => void;
    onDelete: () => void;
    onCheck: () => void;
}) {
    const typeColor = (t: string) => {
        if (['A', 'AAAA'].includes(t)) return 'text-blue-400';
        if (['MX', 'TXT'].includes(t)) return 'text-emerald-400';
        if (['CNAME', 'PTR'].includes(t)) return 'text-amber-400';
        return 'text-primary';
    };

    return (
        <tr className="hover:bg-white/[0.03] transition-colors group">
            <td className="px-2 py-3">
                <input value={record.name} onChange={e => onUpdate({ ...record, name: e.target.value })} className="w-full bg-transparent border-b-2 border-transparent hover:border-outline/10 focus:border-primary px-1 py-1.5 text-sm font-mono font-bold text-on-surface focus:outline-none transition-colors" placeholder="@" />
            </td>
            <td className="px-2 py-3 w-32">
                <div className="relative">
                    <select value={record.type} onChange={e => onUpdate({ ...record, type: e.target.value as DnsRecordType })} className={`w-full bg-surface-container hover:bg-surface-container-high rounded-xl pl-3 pr-8 py-1.5 text-xs font-black border border-outline/10 focus:border-primary focus:outline-none appearance-none transition-colors cursor-pointer ${typeColor(record.type)}`}>
                        {RECORD_TYPES.map(t => <option key={t} value={t} className="text-on-surface">{t}</option>)}
                    </select>
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50"><Settings2 size={12} /></div>
                </div>
            </td>
            <td className="px-2 py-3">
                <input value={record.value} onChange={e => onUpdate({ ...record, value: e.target.value })} placeholder={HINTS[record.type] || ''} className="w-full bg-transparent border-b-2 border-transparent hover:border-outline/10 focus:border-primary px-1 py-1.5 text-sm font-mono focus:outline-none transition-colors" />
            </td>
            <td className="px-2 py-3 w-32">
                <select
                    value={record.ttl}
                    onChange={e => onUpdate({ ...record, ttl: parseInt(e.target.value) || 3600 })}
                    className="w-full bg-surface-container hover:bg-surface-container-high rounded-xl px-2 py-1.5 text-xs font-bold text-on-surface-variant border border-outline/10 focus:border-primary focus:outline-none transition-colors cursor-pointer text-center"
                >
                    {!TTL_PRESETS.some(p => p.value === record.ttl) && (
                        <option value={record.ttl}>{record.ttl}s (Custom)</option>
                    )}
                    {TTL_PRESETS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                </select>
            </td>
            {hasPriority && (
                <td className="px-2 py-3 w-24">
                    {(record.type === 'MX' || record.type === 'SRV') ? (
                        <input type="number" value={record.priority ?? 10} onChange={e => onUpdate({ ...record, priority: parseInt(e.target.value) || 0 })} className="w-full bg-surface-container hover:bg-surface-container-high rounded-xl border border-outline/10 focus:border-primary px-2 py-1.5 text-xs font-bold font-mono focus:outline-none transition-colors text-center" />
                    ) : null}
                </td>
            )}
            <td className="px-2 py-3 text-right">
                {record.type !== 'SOA' && (
                    <button onClick={onCheck} title="Check Global Propagation" className="p-2 rounded-lg bg-surface hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-colors opacity-0 group-hover:opacity-100 shadow-sm border border-outline/5 hover:border-primary/20">
                        <Globe size={14} />
                    </button>
                )}
            </td>
            <td className="px-2 py-3 text-right">
                <button onClick={onDelete} title="Delete Record" className="p-2 rounded-lg bg-surface hover:bg-red-500/10 text-on-surface-variant hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shadow-sm border border-outline/5 hover:border-red-500/20">
                    <Trash2 size={14} />
                </button>
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
                        <input type="number" value={soa.retry} onChange={e => setSoa({ ...soa, retry: parseInt(e.target.value) || 600 })} className="input-field" />
                    </div>
                    <div>
                        <label className="block text-xs text-on-surface-variant mb-1">Expire (s)</label>
                        <input type="number" value={soa.expire} onChange={e => setSoa({ ...soa, expire: parseInt(e.target.value) || 604800 })} className="input-field" />
                    </div>
                    <div>
                        <label className="block text-xs text-on-surface-variant mb-1">Minimum TTL (s)</label>
                        <input type="number" value={soa.minimumTtl} onChange={e => setSoa({ ...soa, minimumTtl: parseInt(e.target.value) || 300 })} className="input-field" />
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
    const [showPull, setShowPull] = useState(false);
    const [pullMasterIp, setPullMasterIp] = useState('');
    const [pullReplace, setPullReplace] = useState(false);
    const [templates, setTemplates] = useState<ZoneTemplate[]>([]);
    const [showTemplates, setShowTemplates] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [searchRecord, setSearchRecord] = useState('');
    const [showWizards, setShowWizards] = useState(false);
    const [activeWizard, setActiveWizard] = useState<'spf' | 'dkim' | 'dmarc' | 'srv' | 'propagation' | 'reverse' | 'child-ns' | null>(null);
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

    const handlePull = async () => {
        setSaving(true);
        const r = await DockerClient.pullDnsZone({ zoneId: zone.id, masterServer: pullMasterIp, replace: pullReplace });
        setSaving(false);
        if (r.success) {
            toast.success(`Successfully pulled ${r.imported} records from ${pullMasterIp}`);
            setShowPull(false);
            setPullMasterIp('');
            onRefresh();
        }
        else toast.error(r.errors.join(', ') || 'Pull failed');
    };

    const handleApplyTemplate = async (templateId: string) => {
        const r = await DockerClient.applyDnsTemplate(zone.id, templateId);
        if ((r as any)?.success !== false) { toast.success('Template applied'); setShowTemplates(false); onRefresh(); }
        else toast.error('Failed to apply template');
    };

    const handleGenerateReverse = async () => {
        if (!confirm('This will automatically create reverse zones and PTR records based on your A/AAAA records. Continue?')) return;
        const r = await DockerClient.generateDnsReverseZones(zone.id);
        if (r.success) {
            toast.success(r.message);
            onRefresh();
            setShowWizards(false);
        } else {
            toast.error(r.message);
        }
    };

    const loadTemplates = async () => {
        setTemplates(await DockerClient.listDnsTemplates());
        setShowTemplates(true);
    };

    const hasPriority = records.some(r => r.type === 'MX' || r.type === 'SRV');

    return (
        <div className="flex flex-col h-full space-y-4">
            {/* Header Area */}
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-outline/10">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold text-on-surface">{zone.name}</h3>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full">{zone.role}</span>
                        <StatusBadge ok={zone.enabled} label={zone.enabled ? 'Enabled' : 'Disabled'} />
                        {zone.dnssecEnabled && <StatusBadge ok={true} label="DNSSEC" />}
                    </div>
                </div>

                {/* Secondary Actions Row (Compact) */}
                <div className="flex items-center gap-2">
                    <button onClick={handleValidate} className="btn-sm bg-surface-container hover:bg-surface-container-high text-on-surface" title="Validate Zone"><Shield size={14} /> Validate</button>
                    <button onClick={handleShowFile} className="btn-sm bg-surface-container hover:bg-surface-container-high text-on-surface" title="View Zone File"><FileText size={14} /> Format</button>
                    <button onClick={() => setShowSettings(!showSettings)} className={`btn-sm ${showSettings ? 'bg-primary/20 text-primary' : 'bg-surface-container hover:bg-surface-container-high text-on-surface'}`} title="Zone Settings"><Settings2 size={14} /> Settings</button>

                    {/* More Tools Dropdown */}
                    <div className="relative isolate z-50">
                        <button onClick={() => setShowWizards(!showWizards)} className={`btn-sm ${showWizards || (activeWizard && activeWizard !== 'propagation') ? 'bg-primary/20 text-primary' : 'bg-surface-container hover:bg-surface-container-high text-on-surface'}`}>
                            <ShieldCheck size={14} /> Tools
                        </button>
                        {showWizards && (
                            <div className="absolute top-full mt-2 right-0 w-56 bg-surface rounded-xl border border-outline/10 shadow-xl py-1.5 flex flex-col popup-menu">
                                <span className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">Wizards & Tools</span>
                                <button onClick={() => { setActiveWizard('spf'); setShowWizards(false); }} className="px-3 py-2 text-xs text-left hover:bg-surface-container transition-colors flex items-center gap-2"><Mail size={14} className="text-primary" /> SPF Wizard</button>
                                <button onClick={() => { setActiveWizard('srv'); setShowWizards(false); }} className="px-3 py-2 text-xs text-left hover:bg-surface-container transition-colors flex items-center gap-2"><Globe size={14} className="text-amber-400" /> SRV Auto-config</button>
                                <button onClick={() => { setActiveWizard('dkim'); setShowWizards(false); }} className="px-3 py-2 text-xs text-left hover:bg-surface-container transition-colors flex items-center gap-2"><Lock size={14} className="text-emerald-400" /> DKIM Producer</button>
                                <button onClick={() => { setActiveWizard('dmarc'); setShowWizards(false); }} className="px-3 py-2 text-xs text-left hover:bg-surface-container transition-colors flex items-center gap-2"><Shield size={14} className="text-blue-400" /> DMARC Setup</button>
                                <button onClick={() => { setActiveWizard('reverse'); setShowWizards(false); }} className="px-3 py-2 text-xs text-left hover:bg-surface-container transition-colors flex items-center gap-2"><RefreshCw size={14} className="text-purple-400" /> Reverse DNS Helper</button>
                                <button onClick={() => { setActiveWizard('child-ns'); setShowWizards(false); }} className="px-3 py-2 text-xs text-left hover:bg-surface-container transition-colors flex items-center gap-2"><ShieldCheck size={14} className="text-secondary" /> Child Name Servers</button>
                                <button onClick={handleGenerateReverse} className="px-3 py-2 text-xs text-left hover:bg-surface-container transition-colors flex items-center gap-2"><Zap size={14} className="text-yellow-400" /> Auto-Generate Reverses</button>
                                <div className="h-px bg-outline/10 my-1"></div>
                                <button onClick={() => { setShowPull(!showPull); setShowWizards(false); }} className="px-3 py-2 text-xs text-left hover:bg-surface-container transition-colors flex items-center gap-2"><Download size={14} className="text-on-surface-variant" /> Pull Records via AXFR</button>
                                <button onClick={() => { setShowImport(!showImport); setShowWizards(false); }} className="px-3 py-2 text-xs text-left hover:bg-surface-container transition-colors flex items-center gap-2"><Upload size={14} className="text-on-surface-variant" /> Import BIND File</button>
                                <button onClick={() => { loadTemplates(); setShowWizards(false); }} className="px-3 py-2 text-xs text-left hover:bg-surface-container transition-colors flex items-center gap-2"><BookTemplate size={14} className="text-on-surface-variant" /> Apply Template</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Middle Section (Conditionally Visible Widgets) */}
            <div className="empty:hidden space-y-4">
                {activeWizard && (
                    <SectionCard
                        title={
                            activeWizard === 'spf' ? 'SPF Wizard' :
                                activeWizard === 'srv' ? 'SRV Auto-config' :
                                    activeWizard === 'dkim' ? 'DKIM Producer' :
                                        activeWizard === 'dmarc' ? 'DMARC Setup' :
                                            activeWizard === 'propagation' ? 'Propagation Check' :
                                                activeWizard === 'child-ns' ? 'Child Name Servers (Glue)' :
                                                    'Reverse DNS Helper'
                        }
                        actions={<button onClick={() => { setActiveWizard(null); setPropRecord(null); }} className="text-on-surface-variant hover:text-on-surface p-2 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors"><Trash2 size={16} /></button>}
                    >
                        {/* Wizards */}
                        <div className="bg-surface rounded-xl p-4 border border-outline/5 shadow-sm">
                            {activeWizard === 'spf' && <SpfWizard zone={zone} onAddRecord={r => { setRecords([{ ...r, id: `new-${Date.now()}` } as DnsRecord, ...records]); setDirty(true); }} />}
                            {activeWizard === 'srv' && <SrvWizard zone={zone} onAddRecord={r => { setRecords([{ ...r, id: `new-${Date.now()}` } as DnsRecord, ...records]); setDirty(true); }} />}
                            {activeWizard === 'dkim' && <DkimWizard zone={zone} onAddRecord={r => { setRecords([{ ...r, id: `new-${Date.now()}` } as DnsRecord, ...records]); setDirty(true); }} />}
                            {activeWizard === 'dmarc' && <DmarcWizard zone={zone} onAddRecord={r => { setRecords([{ ...r, id: `new-${Date.now()}` } as DnsRecord, ...records]); setDirty(true); }} />}
                            {activeWizard === 'child-ns' && <ChildNsWizard zone={zone} onAddRecords={rs => {
                                const newRecs = rs.map(r => ({ ...r, id: `new-${Math.random().toString(36).substr(2, 9)}` } as DnsRecord));
                                setRecords([...newRecs, ...records]);
                                setDirty(true);
                            }} />}
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
                        </div>
                    </SectionCard>
                )}

                {showSettings && <ZoneSettings zone={zone} onRefresh={onRefresh} />}

                {showImport && (
                    <SectionCard title="Import Records (BIND format)">
                        <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={5} className="w-full bg-surface rounded-lg p-3 text-xs font-mono border border-outline/10 focus:outline-none focus:border-primary" placeholder={"www  3600  IN  A  1.2.3.4\nmail 3600  IN  MX 10 mail.example.com."} />
                        <button onClick={handleImport} disabled={!importText.trim()} className="btn-sm bg-primary text-on-primary mt-2 disabled:opacity-50">Import</button>
                    </SectionCard>
                )}

                {showTemplates && templates.length > 0 && (
                    <SectionCard title="Apply Template">
                        <div className="grid grid-cols-2 gap-3 mt-2">
                            {templates.map(t => (
                                <div key={t.id} className="flex flex-col p-4 rounded-xl bg-surface border border-outline/5 hover:border-primary/30 transition-colors shadow-sm cursor-pointer group" onClick={() => handleApplyTemplate(t.id)}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">{t.name}</div>
                                        <div className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{t.records.length} records</div>
                                    </div>
                                    <div className="text-xs text-on-surface-variant flex-1">{t.description}</div>
                                </div>
                            ))}
                        </div>
                    </SectionCard>
                )}

                {showPull && (
                    <SectionCard title="Pull Records (AXFR Transfer)">
                        <div className="space-y-3">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1">Master Server IP/Hostname</label>
                                <input value={pullMasterIp} onChange={e => setPullMasterIp(e.target.value)} className="w-[100%] bg-surface-container-high rounded-xl border border-outline/10 px-4 py-2 text-sm focus:border-primary focus:outline-none transition-colors" placeholder="e.g. 1.2.3.4" />
                            </div>
                            <div className="flex items-center gap-3 bg-surface-container/50 p-3 rounded-xl border border-outline/5">
                                <input type="checkbox" checked={pullReplace} onChange={e => setPullReplace(e.target.checked)} id="pull-replace" className="rounded w-4 h-4 text-primary bg-surface border-outline/20" />
                                <label htmlFor="pull-replace" className="text-xs font-bold text-on-surface cursor-pointer">Replace existing records</label>
                            </div>
                            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-500 font-medium leading-normal">
                                <b>Requirement:</b> The master server must allow AXFR zone transfers for this server's IP address.
                            </div>
                            <button onClick={handlePull} disabled={!pullMasterIp.trim() || saving} className="btn-sm bg-primary text-on-primary w-full disabled:opacity-50 flex items-center justify-center gap-2 font-bold py-2.5">
                                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                                Pull Records
                            </button>
                        </div>
                    </SectionCard>
                )}

                {validation && (
                    <div className={`rounded-xl p-4 text-xs font-mono border ${validation.valid ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                        {validation.output}
                    </div>
                )}
            </div>

            {/* Primary Working Area (Records Table) */}
            <div className="flex-1 flex flex-col min-h-0 bg-surface rounded-2xl border border-outline/10 shadow-sm overflow-hidden flex flex-col">
                {/* Table Toolbars */}
                <div className="flex flex-col gap-3 p-4 border-b border-outline/10 bg-surface/50 backdrop-blur-sm sticky top-0 z-10">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <h4 className="text-base font-bold text-on-surface">DNS Records</h4>
                            <span className="text-xs font-bold bg-surface-container-high px-2 py-0.5 rounded-lg text-on-surface-variant">{records.length} total</span>
                        </div>

                        <div className="flex items-center gap-2">
                            <button onClick={() => { setRecords([{ id: `new-${Math.random().toString(36).substring(2, 9)}`, name: '@', type: 'A', value: '', ttl: 3600 }, ...records]); setDirty(true); }} className="btn-sm bg-primary text-on-primary shadow-sm shadow-primary/20 hover:shadow-md hover:shadow-primary/30 transition-all font-bold">
                                <Plus size={16} className="mr-1" /> Add Record
                            </button>
                            {dirty && (
                                <button onClick={saveRecords} disabled={saving} className="btn-sm bg-amber-500 text-on-primary shadow-sm shadow-amber-500/20 hover:shadow-md hover:shadow-amber-500/30 transition-all font-bold disabled:opacity-50">
                                    <CheckCircle2 size={16} className="mr-1" /> {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
                            <input
                                value={searchRecord}
                                onChange={e => setSearchRecord(e.target.value)}
                                placeholder="Search records by name, type, or value..."
                                className="w-full bg-surface-container hover:bg-surface-container-high pl-10 pr-4 py-2 rounded-xl text-sm font-medium border border-transparent focus:border-primary focus:bg-surface focus:outline-none transition-all shadow-inner"
                            />
                        </div>

                        {/* Quick Switches */}
                        <div className="flex items-center gap-4 bg-surface-container px-4 py-2 rounded-xl border border-transparent">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-high rounded-xl border border-outline/10">
                                <span className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant/50">Queries</span>
                                <select
                                    value={zone.allowQuery.includes('any') ? 'any' : zone.allowQuery.includes('none') ? 'none' : 'default'}
                                    onChange={async (e) => {
                                        let newAllowQuery: string[] = [];
                                        if (e.target.value === 'any') newAllowQuery = ['any'];
                                        else if (e.target.value === 'none') newAllowQuery = ['none'];
                                        else newAllowQuery = []; // Inherit Global

                                        const r = await DockerClient.updateDnsZoneOptions(zone.id, { allowQuery: newAllowQuery });
                                        if (r) {
                                            toast.success(e.target.value === 'none' ? 'Queries disabled for this zone' : 'Query settings updated');
                                            onRefresh();
                                        } else toast.error('Failed to update');
                                    }}
                                    className="bg-transparent text-xs font-bold text-on-surface outline-none cursor-pointer"
                                >
                                    <option value="any">🌍 Public (Any)</option>
                                    <option value="default">🔒 Private (Default)</option>
                                    <option value="none">🚫 Disabled (None)</option>
                                </select>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors">
                                <span className={zone.allowTransfer.includes('any') ? 'text-primary' : ''}>Public Transfer</span>
                                <input
                                    type="checkbox"
                                    checked={zone.allowTransfer.includes('any')}
                                    onChange={async (e) => {
                                        const isChecking = e.target.checked;
                                        if (isChecking && !confirm('Security Warning: Enabling Public Zone Transfer allows anyone to download the entire list of DNS records for this zone. Are you sure you want to proceed?')) {
                                            return;
                                        }
                                        const newAllowTransfer = isChecking ? ['any'] : [];
                                        const r = await DockerClient.updateDnsZoneOptions(zone.id, { allowTransfer: newAllowTransfer });
                                        if (r) { toast.success('Transfer settings updated'); onRefresh(); } else toast.error('Failed to update');
                                    }}
                                    className="rounded bg-surface-container-high border-outline/20 text-primary w-4 h-4 focus:ring-primary focus:ring-offset-0 transition-all"
                                />
                            </label>
                        </div>
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

                {/* {zone.type === 'FORWARD' && (
                    <SectionCard title="Email Health Check">
                        <EmailHealthCheck zoneId={zone.id} />
                    </SectionCard>
                )} */}

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

                <div className="overflow-y-auto flex-1 min-h-0">
                    {records.length > 0 ? (
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_rgba(255,255,255,0.05)]">
                                <tr className="text-on-surface-variant text-xs uppercase tracking-wider">
                                    <th className="px-2 py-3 text-left font-bold w-[20%]">Name</th>
                                    <th className="px-2 py-3 text-left font-bold w-32">Type</th>
                                    <th className="px-2 py-3 text-left font-bold w-2/5">Value</th>
                                    <th className="px-2 py-3 text-center font-bold w-32">TTL</th>
                                    {hasPriority && <th className="px-2 py-3 text-center font-bold w-24">Pri</th>}
                                    <th className="px-1 py-3 w-10 text-right"></th>
                                    <th className="px-1 py-3 w-10 text-right"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {records.filter(r =>
                                    r.name.toLowerCase().includes(searchRecord.toLowerCase()) ||
                                    r.type.toLowerCase().includes(searchRecord.toLowerCase()) ||
                                    r.value.toLowerCase().includes(searchRecord.toLowerCase())
                                ).map((r, i) => (
                                    <RecordRow key={r.id || i} record={r} hasPriority={hasPriority}
                                        onUpdate={u => { setRecords(records.map(orig => orig === r ? u : orig)); setDirty(true); }}
                                        onDelete={() => { setRecords(records.filter(orig => orig !== r)); setDirty(true); }}
                                        onCheck={() => { setPropRecord(r); setActiveWizard('propagation'); }} />
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="py-20">
                            <EmptyState message='No records yet. Click "Add Record" to start managing this zone.' />
                        </div>
                    )}
                </div>
            </div>

            {showFile && (
                <div className="fixed inset-0 bg-surface/80 backdrop-blur-md z-[100] flex items-center justify-center p-6">
                    <div className="bg-surface-container rounded-3xl border border-outline/10 shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-outline/10 flex items-center justify-between bg-surface/50">
                            <div>
                                <h3 className="text-xl font-bold flex items-center gap-2"><FileText className="text-primary" /> Zone File (BIND)</h3>
                                <div className="text-sm text-on-surface-variant mt-1">Raw output of {zone.name}</div>
                            </div>
                            <button onClick={() => setShowFile(false)} className="p-2 rounded-xl hover:bg-surface transition-colors text-on-surface"><Trash2 size={24} className="rotate-45 relative top-[2px]" /> X</button>
                        </div>
                        <div className="flex-1 overflow-auto p-0 bg-black/50">
                            <pre className="text-sm font-mono text-green-400/90 whitespace-pre p-6 leading-relaxed selection:bg-primary/30">{fileContent || 'No content'}</pre>
                        </div>
                    </div>
                </div>
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
            <div className="w-72 shrink-0 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-outline/10">
                    <h2 className="text-sm font-black uppercase tracking-widest text-on-surface-variant">DNS Zones</h2>
                    <div className="flex gap-1.5">
                        <button onClick={async () => {
                            if (confirm('Create standard default zones?')) {
                                await DockerClient.createDefaultDnsZones();
                                onRefresh();
                                toast.success('Default zones created');
                            }
                        }} className="p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors" title="Create Default Zones">
                            <RefreshCw size={14} />
                        </button>
                        <button onClick={() => setShowReverseDashboard(true)} className="p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-purple-400 transition-colors" title="Reverse DNS Dashboard"><Globe size={14} /></button>
                        <button onClick={() => setShowCreate(true)} className="btn-sm bg-primary/10 hover:bg-primary/20 text-primary px-3 transition-colors"><Plus size={14} /> New</button>
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
                <div className="space-y-1.5 py-1 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
                    {filteredZones.map(z => (
                        <div key={z.id} className={`group flex flex-col gap-2 px-4 py-3 rounded-2xl cursor-pointer transition-all duration-200 border ${selectedZoneId === z.id ? 'bg-primary/10 border-primary/20 shadow-sm shadow-primary/5' : 'bg-surface hover:bg-surface-container border-outline/5 hover:border-outline/10'}`} onClick={() => onSelectZone(z.id)}>
                            <div className="flex justify-between items-start gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className={`w-2 h-2 rounded-full shrink-0 shadow-sm ${z.enabled ? 'bg-green-400 shadow-green-400/50 animate-pulse' : 'bg-on-surface-variant/30'}`} />
                                    <div className={`text-sm font-bold truncate leading-none ${selectedZoneId === z.id ? 'text-primary' : 'text-on-surface'}`}>{z.name}</div>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 bg-surface-container/80 backdrop-blur-md rounded-lg p-0.5 border border-outline/5">
                                    <button onClick={e => { e.stopPropagation(); handleToggle(z.id); }} title={z.enabled ? "Disable Zone" : "Enable Zone"} className="p-1.5 rounded-md hover:bg-surface-container-high text-on-surface-variant transition-colors"><Power size={12} className={z.enabled ? 'text-green-400' : ''} /></button>
                                    <button onClick={e => { e.stopPropagation(); handleDelete(z.id, z.name); }} title="Delete Zone" className="p-1.5 rounded-md hover:bg-red-500/10 text-on-surface-variant hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pl-4.5">
                                <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-full tracking-wider ${z.type === 'FORWARD' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'}`}>
                                    {z.type}
                                </span>
                                <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-full tracking-wider ${z.role === 'MASTER' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
                                    {z.role}
                                </span>
                                <span className="text-[10px] text-on-surface-variant font-bold bg-surface-container-high px-2 py-0.5 rounded-full border border-outline/5">
                                    {z.records.length} recs
                                </span>
                                {z.dnssecEnabled && (
                                    <span title="DNSSEC Enabled" className="text-green-400 flex items-center ml-auto bg-green-500/10 p-1 rounded-full border border-green-500/20">
                                        <ShieldCheck size={12} />
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex-1 min-w-0 bg-surface-container rounded-2xl border border-outline/10 p-5 flex flex-col h-[calc(100vh-8rem)]">
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
