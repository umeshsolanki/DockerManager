'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, RotateCcw, Power, Eraser, AlertTriangle } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DnsZone, DnsServiceStatus } from '@/lib/types';
import { StatusBadge } from '@/components/dns/DnsShared';
import { TabsList, TabButton } from '@/components/ui/Tabs';
import DnsZonesTab from '@/components/dns/DnsZonesTab';
import DnsLookupTab from '@/components/dns/DnsLookupTab';
import DnsSecurityTab from '@/components/dns/DnsSecurityTab';
import DnsConfigTab from '@/components/dns/DnsConfigTab';
import DnsInstallTab from '@/components/dns/DnsInstallTab';
import { toast } from 'sonner';

type DnsTab = 'zones' | 'lookup' | 'security' | 'config' | 'install';

export default function DnsScreen() {
    const [tab, setTab] = useState<DnsTab>('install');
    const [status, setStatus] = useState<DnsServiceStatus | null>(null);
    const [zones, setZones] = useState<DnsZone[]>([]);
    const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        setLoading(true);
        const [s, z] = await Promise.all([DockerClient.getDnsStatus(), DockerClient.listDnsZones()]);
        setStatus(s);
        setZones(z);
        if (!selectedZoneId && z.length > 0) setSelectedZoneId(z[0].id);
        setLoading(false);
    }, [selectedZoneId]);

    useEffect(() => { refresh(); }, []);

    const action = async (fn: () => Promise<any>, label: string) => {
        const r = await fn();
        r.success ? toast.success(r.message || label) : toast.error(r.message || 'Failed');
        refresh();
    };

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">DNS Management</h1>
                    <p className="text-sm text-on-surface-variant mt-0.5">BIND9 zones, records, DNSSEC, and diagnostics</p>
                </div>
                <button onClick={refresh} className="btn-sm bg-surface-container">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            {status && (
                <div className="flex items-center gap-3 flex-wrap p-4 rounded-xl bg-surface-container border border-outline/10">
                    <StatusBadge ok={status.running} label={status.running ? 'Running' : 'Stopped'} />
                    <StatusBadge ok={status.configValid} label={status.configValid ? 'Config OK' : 'Config Error'} />
                    {status.version && <span className="text-xs text-on-surface-variant">{status.version}</span>}
                    <span className="text-xs text-on-surface-variant">{status.zoneCount} zones</span>
                    <div className="flex-1" />
                    <div className="flex gap-2">
                        <button onClick={() => action(() => DockerClient.dnsFlushCache(), 'Cache flushed')} className="btn-sm bg-purple-500/10 text-purple-400"><Eraser size={13} /> Flush Cache</button>
                        <button onClick={() => action(() => DockerClient.dnsReload(), 'Reloaded')} className="btn-sm bg-blue-500/10 text-blue-400"><RotateCcw size={13} /> Reload</button>
                        <button onClick={() => action(() => DockerClient.dnsRestart(), 'Restarted')} className="btn-sm bg-amber-500/10 text-amber-400"><Power size={13} /> Restart</button>
                    </div>
                    {!status.configValid && status.configOutput && (
                        <div className="w-full mt-2 rounded-lg bg-red-500/10 p-3 text-xs font-mono text-red-400 flex items-start gap-2">
                            <AlertTriangle size={14} className="shrink-0 mt-0.5" /><span>{status.configOutput}</span>
                        </div>
                    )}
                </div>
            )}

            <TabsList>
                <TabButton id="install" label="Install" active={tab === 'install'} onClick={() => setTab('install')} />
                <TabButton id="zones" label="Zones & Records" active={tab === 'zones'} onClick={() => setTab('zones')} />
                <TabButton id="lookup" label="Lookup" active={tab === 'lookup'} onClick={() => setTab('lookup')} />
                <TabButton id="security" label="Security" active={tab === 'security'} onClick={() => setTab('security')} />
                <TabButton id="config" label="Config & Stats" active={tab === 'config'} onClick={() => setTab('config')} />
            </TabsList>

            {tab === 'install' && <DnsInstallTab />}
            {tab === 'zones' && <DnsZonesTab zones={zones} selectedZoneId={selectedZoneId} onSelectZone={setSelectedZoneId} onRefresh={refresh} />}
            {tab === 'lookup' && <DnsLookupTab />}
            {tab === 'security' && <DnsSecurityTab zones={zones} />}
            {tab === 'config' && <DnsConfigTab />}
        </div>
    );
}
