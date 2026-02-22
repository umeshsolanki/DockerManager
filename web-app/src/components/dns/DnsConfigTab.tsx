'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Save, Plus, Trash2 } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DnsForwarderConfig, ZoneTemplate } from '@/lib/types';
import { SectionCard, EmptyState, TagInput } from './DnsShared';
import { toast } from 'sonner';

function ForwardersSection() {
    const [config, setConfig] = useState<DnsForwarderConfig>({ forwarders: [], forwardOnly: false });
    const [saving, setSaving] = useState(false);

    useEffect(() => { DockerClient.getDnsForwarders().then(setConfig); }, []);

    const handleSave = async () => {
        setSaving(true);
        const r = await DockerClient.updateDnsForwarders(config);
        setSaving(false);
        (r as any)?.success !== false ? toast.success('Forwarders updated') : toast.error('Failed');
    };

    return (
        <SectionCard title="Global Forwarders">
            <div className="space-y-3">
                <TagInput value={config.forwarders} onChange={f => setConfig({ ...config, forwarders: f })} placeholder="8.8.8.8" />
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={config.forwardOnly} onChange={e => setConfig({ ...config, forwardOnly: e.target.checked })} className="rounded" />
                    Forward only (no recursive resolution fallback)
                </label>
                <button onClick={handleSave} disabled={saving} className="btn-sm bg-primary text-on-primary disabled:opacity-50"><Save size={13} /> {saving ? 'Saving...' : 'Save'}</button>
            </div>
        </SectionCard>
    );
}

function TemplatesSection() {
    const [templates, setTemplates] = useState<ZoneTemplate[]>([]);
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');

    const refresh = useCallback(async () => setTemplates(await DockerClient.listDnsTemplates()), []);
    useEffect(() => { refresh(); }, [refresh]);

    const handleCreate = async () => {
        if (!name.trim()) return;
        await DockerClient.createDnsTemplate({ name: name.trim(), description: desc, records: [] });
        setName(''); setDesc('');
        toast.success('Template created');
        refresh();
    };

    const handleDelete = async (id: string) => {
        if (await DockerClient.deleteDnsTemplate(id)) { toast.success('Deleted'); refresh(); }
    };

    return (
        <SectionCard title="Zone Templates" actions={<span className="text-[10px] text-on-surface-variant">{templates.length} templates</span>}>
            <div className="space-y-2">
                {templates.map(t => (
                    <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg bg-surface">
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{t.name}</div>
                            <div className="text-[10px] text-on-surface-variant">{t.description || 'No description'} &middot; {t.records.length} records</div>
                        </div>
                        <button onClick={() => handleDelete(t.id)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={14} /></button>
                    </div>
                ))}
                {templates.length === 0 && <p className="text-xs text-on-surface-variant">No custom templates</p>}
                <div className="border-t border-outline/10 pt-3 flex gap-2 flex-wrap">
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="Template name" className="input-field flex-1 min-w-[150px]" />
                    <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description" className="input-field flex-1 min-w-[150px]" />
                    <button onClick={handleCreate} disabled={!name.trim()} className="btn-sm bg-primary/10 text-primary disabled:opacity-50"><Plus size={13} /> Create</button>
                </div>
            </div>
        </SectionCard>
    );
}

// StatsSection removed and moved to DnsAnalyticsTab.tsx

// StatMini removed and moved to DnsAnalyticsTab.tsx


export default function DnsConfigTab() {
    return (
        <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <ForwardersSection />
                <TemplatesSection />
            </div>
        </div>
    );
}
