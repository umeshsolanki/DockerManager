'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Download, Container, Terminal, CheckCircle, XCircle, Loader2, Trash2, Play, Info } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DnsInstallStatus, DnsInstallMethod, DnsInstallRequest } from '@/lib/types';
import { SectionCard, StatusBadge } from './DnsShared';
import { toast } from 'sonner';

function MethodCard({ selected, onSelect, icon, title, description, tag }: {
    selected: boolean;
    onSelect: () => void;
    icon: React.ReactNode;
    title: string;
    description: string;
    tag: string;
}) {
    return (
        <button onClick={onSelect} className={`text-left p-5 rounded-xl border-2 transition-all ${selected ? 'border-primary bg-primary/5' : 'border-outline/10 bg-surface-container hover:border-outline/30'}`}>
            <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-xl ${selected ? 'bg-primary/15 text-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    {icon}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{tag}</span>
                    </div>
                    <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{description}</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${selected ? 'border-primary bg-primary' : 'border-outline/30'}`}>
                    {selected && <CheckCircle size={12} className="text-on-primary" />}
                </div>
            </div>
        </button>
    );
}

function DockerOptions({ config, onChange }: {
    config: DnsInstallRequest;
    onChange: (c: DnsInstallRequest) => void;
}) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 p-4 rounded-xl bg-surface-container border border-outline/10">
            <Field label="Docker Image">
                <input value={config.dockerImage ?? ''} onChange={e => onChange({ ...config, dockerImage: e.target.value })} className="input-field" />
            </Field>
            <Field label="Container Name">
                <input value={config.containerName ?? ''} onChange={e => onChange({ ...config, containerName: e.target.value })} className="input-field" />
            </Field>
            <Field label="Host Port (DNS)">
                <input type="number" value={config.hostPort ?? 53} onChange={e => onChange({ ...config, hostPort: parseInt(e.target.value) || 53 })} className="input-field" />
            </Field>
            <Field label="Config Volume">
                <input value={config.configVolume ?? ''} onChange={e => onChange({ ...config, configVolume: e.target.value })} className="input-field" />
            </Field>
            <Field label="Data Volume" className="sm:col-span-2">
                <input value={config.dataVolume ?? ''} onChange={e => onChange({ ...config, dataVolume: e.target.value })} className="input-field" />
            </Field>
        </div>
    );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={className}>
            <label className="block text-xs text-on-surface-variant mb-1 font-medium">{label}</label>
            {children}
        </div>
    );
}

function InstalledView({ status, onRefresh }: { status: DnsInstallStatus; onRefresh: () => void }) {
    const [uninstalling, setUninstalling] = useState(false);

    const handleUninstall = async () => {
        if (!confirm('Are you sure you want to uninstall BIND9? This will stop the DNS service.')) return;
        setUninstalling(true);
        const r = await DockerClient.uninstallDns();
        setUninstalling(false);
        r.success ? toast.success(r.message) : toast.error(r.message);
        onRefresh();
    };

    return (
        <div className="space-y-5">
            <div className="rounded-xl border border-outline/10 bg-surface-container p-5">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2.5 rounded-xl bg-green-500/10">
                        <CheckCircle size={20} className="text-green-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold">BIND9 Installed</h3>
                        <p className="text-xs text-on-surface-variant">
                            via {status.method === 'DOCKER' ? 'Docker container' : 'system package (apt)'}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <InfoTile label="Status" value={status.running ? 'Running' : 'Stopped'} ok={status.running} />
                    <InfoTile label="Method" value={status.method === 'DOCKER' ? 'Docker' : 'APT'} />
                    {status.version && <InfoTile label="Version" value={status.version} />}
                    {status.dockerContainerId && <InfoTile label="Container" value={status.dockerContainerId.slice(0, 12)} />}
                </div>

                {status.dockerImage && (
                    <p className="text-xs text-on-surface-variant mb-4">
                        <span className="font-medium">Image:</span> {status.dockerImage}
                    </p>
                )}

                <div className="flex gap-2 pt-3 border-t border-outline/10">
                    <button onClick={onRefresh} className="btn-sm bg-primary/10 text-primary">
                        <Play size={13} /> Refresh Status
                    </button>
                    <button onClick={handleUninstall} disabled={uninstalling} className="btn-sm bg-red-500/10 text-red-400 disabled:opacity-50">
                        {uninstalling ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        {uninstalling ? 'Removing...' : 'Uninstall'}
                    </button>
                </div>
            </div>

            <SectionCard title="Next Steps">
                <ul className="space-y-2 text-sm text-on-surface-variant">
                    <li className="flex items-start gap-2"><CheckCircle size={14} className="text-green-400 shrink-0 mt-0.5" /> Switch to the <span className="font-semibold text-on-surface">Zones & Records</span> tab to create your first DNS zone</li>
                    <li className="flex items-start gap-2"><CheckCircle size={14} className="text-green-400 shrink-0 mt-0.5" /> Configure <span className="font-semibold text-on-surface">Global Forwarders</span> in the Config tab (e.g. 8.8.8.8)</li>
                    <li className="flex items-start gap-2"><CheckCircle size={14} className="text-green-400 shrink-0 mt-0.5" /> Set up <span className="font-semibold text-on-surface">DNSSEC &amp; TSIG</span> keys in the Security tab for secure transfers</li>
                </ul>
            </SectionCard>
        </div>
    );
}

function InfoTile({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
    return (
        <div className="rounded-lg bg-surface p-3">
            <div className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">{label}</div>
            <div className={`text-sm font-semibold ${ok === true ? 'text-green-400' : ok === false ? 'text-red-400' : ''}`}>{value}</div>
        </div>
    );
}

export default function DnsInstallTab() {
    const [status, setStatus] = useState<DnsInstallStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [installing, setInstalling] = useState(false);
    const [method, setMethod] = useState<DnsInstallMethod>('DOCKER');
    const [config, setConfig] = useState<DnsInstallRequest>({
        method: 'DOCKER',
        dockerImage: 'ubuntu/bind9:latest',
        containerName: 'bind9',
        hostPort: 53,
        dataVolume: '/opt/bind9/data',
        configVolume: '/opt/bind9/config',
    });

    const refresh = useCallback(async () => {
        setLoading(true);
        setStatus(await DockerClient.getDnsInstallStatus());
        setLoading(false);
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const handleInstall = async () => {
        setInstalling(true);
        const r = await DockerClient.installDns({ ...config, method });
        setInstalling(false);
        r.success ? toast.success(r.message) : toast.error(r.message);
        refresh();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 size={24} className="animate-spin text-primary" />
            </div>
        );
    }

    if (status?.installed) {
        return <InstalledView status={status} onRefresh={refresh} />;
    }

    return (
        <div className="space-y-5 max-w-2xl">
            <div className="rounded-xl border border-outline/10 bg-surface-container p-5">
                <div className="flex items-start gap-3 mb-1">
                    <div className="p-2.5 rounded-xl bg-primary/10">
                        <Download size={20} className="text-primary" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-base">Install BIND9</h3>
                        <p className="text-xs text-on-surface-variant mt-0.5">Choose a method to install BIND9 DNS server on your system</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <MethodCard
                    selected={method === 'DOCKER'}
                    onSelect={() => setMethod('DOCKER')}
                    icon={<Container size={20} />}
                    title="Docker Container"
                    description="Run BIND9 in an isolated Docker container. Easy to manage, upgrade, and remove. Recommended for most setups."
                    tag="Recommended"
                />
                <MethodCard
                    selected={method === 'APT'}
                    onSelect={() => setMethod('APT')}
                    icon={<Terminal size={20} />}
                    title="System Package (apt)"
                    description="Install directly via apt-get. Runs as a native system service. Best for bare-metal servers."
                    tag="Advanced"
                />
            </div>

            {method === 'DOCKER' && <DockerOptions config={config} onChange={setConfig} />}

            {method === 'APT' && (
                <div className="flex items-start gap-2 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-400">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    <div>
                        <span className="font-semibold">Requires root access.</span> This will run{' '}
                        <code className="px-1 py-0.5 rounded bg-surface-container text-on-surface-variant font-mono text-[10px]">apt-get install bind9</code>{' '}
                        and enable the service via systemd. Make sure port 53 is available.
                    </div>
                </div>
            )}

            <button onClick={handleInstall} disabled={installing} className="btn-primary disabled:opacity-50 w-full sm:w-auto">
                {installing ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                {installing ? 'Installing BIND9...' : `Install via ${method === 'DOCKER' ? 'Docker' : 'apt-get'}`}
            </button>
        </div>
    );
}
