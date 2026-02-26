'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    RefreshCw, RotateCcw, Power, Eraser, AlertTriangle, Globe2,
    CheckCircle2, XCircle, BarChart2, Layers, Search, Shield,
    Settings, Download, Wifi, WifiOff, Wrench
} from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DnsZone, DnsServiceStatus } from '@/lib/types';
import { TabsList, TabButton } from '@/components/ui/Tabs';
import DnsZonesTab from '@/components/dns/DnsZonesTab';
import DnsLookupTab from '@/components/dns/DnsLookupTab';
import DnsSecurityTab from '@/components/dns/DnsSecurityTab';
import DnsConfigTab from '@/components/dns/DnsConfigTab';
import DnsInstallTab from '@/components/dns/DnsInstallTab';
import DnsAnalyticsTab from '@/components/dns/DnsAnalyticsTab';
import { toast } from 'sonner';

type DnsTab = 'analytics' | 'zones' | 'lookup' | 'security' | 'config' | 'install';

const TABS: { id: DnsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'install', label: 'Setup', icon: <Download size={15} /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart2 size={15} /> },
    { id: 'zones', label: 'Zones', icon: <Layers size={15} /> },
    { id: 'lookup', label: 'Lookup', icon: <Search size={15} /> },
    { id: 'security', label: 'Security', icon: <Shield size={15} /> },
    { id: 'config', label: 'Config', icon: <Settings size={15} /> },
];

export default function DnsScreen() {
    const [tab, setTab] = useState<DnsTab>('install');
    const [status, setStatus] = useState<DnsServiceStatus | null>(null);
    const [zones, setZones] = useState<DnsZone[]>([]);
    const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        const [s, z] = await Promise.all([DockerClient.getDnsStatus(), DockerClient.listDnsZones()]);
        setStatus(s);
        setZones(z);
        if (!selectedZoneId && z.length > 0) setSelectedZoneId(z[0].id);
        setLoading(false);
    }, [selectedZoneId]);

    useEffect(() => { refresh(); }, []);

    const action = async (key: string, fn: () => Promise<any>, label: string) => {
        setActionLoading(key);
        const r = await fn();
        r.success ? toast.success(r.message || label) : toast.error(r.message || 'Failed');
        setActionLoading(null);
        refresh();
    };

    const running = status?.running ?? false;
    const configOk = status?.configValid ?? true;

    return (
        <div className="flex flex-col gap-6 pb-10">
            {/* ── Hero Header ── */}
            <header className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
                            <Globe2 size={26} className="text-primary" />
                        </div>
                        {/* live indicator dot */}
                        <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-background ${running ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-2">DNS</h1>
                        <p className="text-on-surface-variant/60 text-sm mt-0.5">
                            BIND9 zones, records, DNSSEC &amp; diagnostics
                        </p>
                    </div>
                </div>
                <button
                    onClick={refresh}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-outline/10 text-on-surface-variant hover:bg-white/5 transition-all text-sm font-medium"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </header>

            {/* ── Status Strip ── */}
            {status && (
                <div className={`rounded-2xl border p-4 transition-all ${running && configOk
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : 'bg-red-500/5 border-red-500/20'
                    }`}>
                    <div className="flex items-center gap-3 flex-wrap">
                        {/* Running badge */}
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${running ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                            }`}>
                            {running ? <Wifi size={12} /> : <WifiOff size={12} />}
                            {running ? 'Running' : 'Stopped'}
                        </span>

                        {/* Config badge */}
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${configOk ? 'bg-blue-500/15 text-blue-400' : 'bg-amber-500/15 text-amber-400'
                            }`}>
                            {configOk ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                            {configOk ? 'Config Valid' : 'Config Error'}
                        </span>

                        {/* Info chips */}
                        {status.version && (
                            <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/5 text-on-surface-variant border border-outline/10">
                                {status.version}
                            </span>
                        )}
                        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/5 text-on-surface-variant border border-outline/10">
                            {status.zoneCount} configured
                        </span>

                        {running && status.loadedZoneCount > 0 && (
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${status.loadedZoneCount >= status.zoneCount
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : 'bg-red-500/15 text-red-400 border border-red-500/20 shadow-lg shadow-red-500/5'
                                }`}>
                                {status.loadedZoneCount >= status.zoneCount ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                                {status.loadedZoneCount} loaded
                            </span>
                        )}

                        <div className="flex-1" />

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <ActionButton
                                icon={<Wrench size={13} />}
                                label="Fix Zones"
                                color="amber"
                                loading={actionLoading === 'fix'}
                                onClick={() => action('fix', () => DockerClient.dnsRegenerateZoneFiles(), 'Zone files regenerated')}
                                title="Regenerate all zone files (fixes missing NS records)"
                            />
                            <ActionButton
                                icon={<Eraser size={13} />}
                                label="Flush Cache"
                                color="purple"
                                loading={actionLoading === 'flush'}
                                onClick={() => action('flush', () => DockerClient.dnsFlushCache(), 'Cache flushed')}
                            />
                            <ActionButton
                                icon={<RotateCcw size={13} />}
                                label="Reload"
                                color="blue"
                                loading={actionLoading === 'reload'}
                                onClick={() => action('reload', () => DockerClient.dnsReload(), 'Reloaded')}
                            />
                            <ActionButton
                                icon={<Power size={13} />}
                                label="Restart"
                                color="red"
                                loading={actionLoading === 'restart'}
                                onClick={() => action('restart', () => DockerClient.dnsRestart(), 'Restarted')}
                            />
                        </div>
                    </div>

                    {/* Config error panel */}
                    {!configOk && status.configOutput && (
                        <div className="mt-3 rounded-xl bg-red-500/10 border border-red-500/20 p-3 flex items-start gap-2">
                            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-400" />
                            <pre className="text-xs font-mono text-red-300 whitespace-pre-wrap leading-relaxed">{status.configOutput}</pre>
                        </div>
                    )}
                </div>
            )}

            {/* ── Tab Navigation ── */}
            <div className="flex items-center gap-1 bg-surface/40 border border-outline/10 rounded-2xl p-1.5 backdrop-blur-sm">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all flex-1 justify-center ${tab === t.id
                            ? 'bg-primary text-on-primary shadow-lg shadow-primary/20'
                            : 'text-on-surface-variant hover:text-on-surface hover:bg-white/5'
                            }`}
                    >
                        {t.icon}
                        <span className="hidden sm:inline">{t.label}</span>
                    </button>
                ))}
            </div>

            {/* ── Tab Content ── */}
            <div>
                {tab === 'install' && <DnsInstallTab />}
                {tab === 'analytics' && <DnsAnalyticsTab />}
                {tab === 'zones' && <DnsZonesTab zones={zones} selectedZoneId={selectedZoneId} onSelectZone={setSelectedZoneId} onRefresh={refresh} />}
                {tab === 'lookup' && <DnsLookupTab />}
                {tab === 'security' && <DnsSecurityTab zones={zones} onRefresh={refresh} />}
                {tab === 'config' && <DnsConfigTab />}
            </div>
        </div>
    );
}

/* ── Reusable Action Button ── */
type ActionColor = 'purple' | 'blue' | 'red' | 'amber';
const colorMap: Record<ActionColor, string> = {
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20',
};

function ActionButton({ icon, label, color, loading, onClick, title }: {
    icon: React.ReactNode;
    label: string;
    color: ActionColor;
    loading: boolean;
    onClick: () => void;
    title?: string;
}) {
    return (
        <button
            onClick={onClick}
            disabled={loading}
            title={title}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all disabled:opacity-50 ${colorMap[color]}`}
        >
            {loading ? <RefreshCw size={13} className="animate-spin" /> : icon}
            {label}
        </button>
    );
}
