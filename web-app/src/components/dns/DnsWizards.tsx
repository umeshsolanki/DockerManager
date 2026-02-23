'use client';

import React, { useState, useEffect } from 'react';
import { Shield, Mail, Globe, ArrowRight, Check, Copy, RefreshCw, AlertCircle, Trash2, Search } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import {
    DnsZone, DnsRecord, SpfConfig, DmarcConfig, DkimKey,
    DkimKeyGenRequest, PropagationCheckResult, IpPtrSuggestion, DnsRecordType,
    SrvConfig, EmailHealthStatus
} from '@/lib/types';
import { toast } from 'sonner';
import { SectionCard, StatusBadge } from './DnsShared';

// --- SPF Wizard ---
export function SpfWizard({ zone, onAddRecord }: { zone: DnsZone; onAddRecord: (r: Partial<DnsRecord>) => void }) {
    const [config, setConfig] = useState<SpfConfig>({
        allowMx: true,
        allowA: true,
        ipAddresses: [],
        includeDomains: [],
        allMechanism: '~all'
    });
    const [preview, setPreview] = useState('');
    const [newIp, setNewIp] = useState('');
    const [newDomain, setNewDomain] = useState('');

    const presets = [
        { name: 'None', include: '' },
        { name: 'Google Workspace', include: '_spf.google.com' },
        { name: 'Microsoft 365', include: 'spf.protection.outlook.com' },
        { name: 'Mailgun', include: 'mailgun.org' },
        { name: 'SendGrid', include: 'sendgrid.net' },
    ];

    useEffect(() => {
        const updatePreview = async () => {
            const res = await DockerClient.buildSpfRecord(config);
            setPreview(res);
        };
        updatePreview();
    }, [config]);

    const handleAdd = () => {
        onAddRecord({
            name: '@',
            type: 'TXT',
            value: preview,
            ttl: 3600
        });
        toast.success('SPF record added to list');
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={config.allowMx} onChange={e => setConfig({ ...config, allowMx: e.target.checked })} />
                        Allow MX servers
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={config.allowA} onChange={e => setConfig({ ...config, allowA: e.target.checked })} />
                        Allow A/AAAA records
                    </label>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-on-surface-variant">Policy (~all is recommended)</label>
                    <select
                        value={config.allMechanism}
                        onChange={e => setConfig({ ...config, allMechanism: e.target.value })}
                        className="w-full bg-surface-container rounded px-2 py-1 text-sm border border-outline/10"
                    >
                        <option value="~all">Soft Fail (~all)</option>
                        <option value="-all">Hard Fail (-all)</option>
                        <option value="?all">Neutral (?all)</option>
                    </select>
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-1">
                    <Globe size={12} /> Service Presets
                </label>
                <div className="flex flex-wrap gap-2">
                    {presets.map(p => (
                        <button
                            key={p.name}
                            type="button"
                            onClick={() => {
                                if (!p.include) {
                                    setConfig({ ...config, includeDomains: [] });
                                } else if (!config.includeDomains.includes(p.include)) {
                                    setConfig({ ...config, includeDomains: [...config.includeDomains, p.include] });
                                }
                            }}
                            className={`px-2 py-1 text-[10px] rounded border transition-colors ${p.include && config.includeDomains.includes(p.include)
                                ? 'bg-primary/20 border-primary text-primary'
                                : 'bg-surface-container border-outline/10 text-on-surface-variant hover:border-primary/50'
                                }`}
                        >
                            {p.name}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="text-xs text-on-surface-variant">Additional IPs</label>
                    <div className="flex gap-1">
                        <input
                            value={newIp}
                            onChange={e => setNewIp(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newIp) { setConfig({ ...config, ipAddresses: [...config.ipAddresses, newIp] }); setNewIp(''); } } }}
                            placeholder="1.2.3.4"
                            className="flex-1 bg-surface-container rounded px-2 py-1 text-xs border border-outline/10"
                        />
                        <button onClick={() => { if (newIp) { setConfig({ ...config, ipAddresses: [...config.ipAddresses, newIp] }); setNewIp(''); } }} className="btn-secondary px-2 text-xs">Add</button>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                        {config.ipAddresses.map(ip => (
                            <span key={ip} className="px-1.5 py-0.5 bg-surface rounded text-[10px] border border-outline/5 flex items-center gap-1">
                                {ip}
                                <Trash2 size={10} className="cursor-pointer text-on-surface-variant hover:text-red-400" onClick={() => setConfig({ ...config, ipAddresses: config.ipAddresses.filter(i => i !== ip) })} />
                            </span>
                        ))}
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-on-surface-variant">Include Domains</label>
                    <div className="flex gap-1">
                        <input
                            value={newDomain}
                            onChange={e => setNewDomain(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newDomain) { setConfig({ ...config, includeDomains: [...config.includeDomains, newDomain] }); setNewDomain(''); } } }}
                            placeholder="example.com"
                            className="flex-1 bg-surface-container rounded px-2 py-1 text-xs border border-outline/10"
                        />
                        <button onClick={() => { if (newDomain) { setConfig({ ...config, includeDomains: [...config.includeDomains, newDomain] }); setNewDomain(''); } }} className="btn-secondary px-2 text-xs">Add</button>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                        {config.includeDomains.map(d => (
                            <span key={d} className="px-1.5 py-0.5 bg-surface rounded text-[10px] border border-outline/5 flex items-center gap-1">
                                {d}
                                <Trash2 size={10} className="cursor-pointer text-on-surface-variant hover:text-red-400" onClick={() => setConfig({ ...config, includeDomains: config.includeDomains.filter(i => i !== d) })} />
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            <div className="p-3 bg-surface-container rounded-lg border border-outline/5">
                <div className="text-xs text-on-surface-variant mb-1">Generated Record:</div>
                <div className="font-mono text-sm break-all text-primary">{preview}</div>
            </div>

            <button onClick={handleAdd} className="w-full btn-primary py-2 text-sm">
                Add SPF Record
            </button>
        </div>
    );
}

// --- DKIM Wizard ---
export function DkimWizard({ zone, onAddRecord }: { zone: DnsZone; onAddRecord: (r: Partial<DnsRecord>) => void }) {
    const [selector, setSelector] = useState('default');
    const [dkim, setDkim] = useState<DkimKey | null>(null);
    const [loading, setLoading] = useState(false);

    const generate = async () => {
        setLoading(true);
        const res = await DockerClient.generateDkimKey({ domain: zone.name, selector, keySize: 2048 });
        setDkim(res);
        setLoading(false);
    };

    const handleAdd = () => {
        if (!dkim) return;
        onAddRecord({
            name: `${selector}._domainkey`,
            type: 'TXT',
            value: dkim.dnsRecord,
            ttl: 3600
        });
        toast.success('DKIM record added to list');
    };

    return (
        <div className="space-y-4">
            <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                    <label className="text-xs text-on-surface-variant">Selector</label>
                    <input
                        value={selector}
                        onChange={e => setSelector(e.target.value)}
                        className="input-field py-1.5"
                        placeholder="e.g. default, mail"
                    />
                </div>
                <button onClick={generate} disabled={loading} className="btn-secondary py-1.5 px-4 mb-[2px]">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {dkim && (
                <div className="space-y-3">
                    <div className="p-3 bg-surface-container rounded-lg border border-outline/5 space-y-2">
                        <div className="text-xs text-on-surface-variant">Public Record Name: <span className="text-primary">{selector}._domainkey</span></div>
                        <div className="text-xs text-on-surface-variant break-all">Public Key: <span className="text-primary">{dkim.dnsRecord}</span></div>
                    </div>

                    <div className="p-3 bg-red-500/5 rounded-lg border border-red-500/10">
                        <div className="text-xs text-red-400 font-medium mb-1 flex items-center gap-1">
                            <AlertCircle size={12} /> Private Key (SAVE THIS!)
                        </div>
                        <textarea
                            readOnly
                            value={dkim.privateKey}
                            className="w-full bg-transparent text-[10px] font-mono h-20 border-none focus:outline-none text-red-300/70"
                        />
                    </div>

                    <button onClick={handleAdd} className="w-full btn-primary py-2 text-sm">
                        Add DKIM Record
                    </button>
                </div>
            )}
        </div>
    );
}

// --- DMARC Wizard ---
export function DmarcWizard({ zone, onAddRecord }: { zone: DnsZone; onAddRecord: (r: Partial<DnsRecord>) => void }) {
    const [config, setConfig] = useState<DmarcConfig>({
        policy: 'none',
        pct: 100,
        rua: '',
        ruf: '',
        aspf: 'r',
        adkim: 'r'
    });
    const [preview, setPreview] = useState('');

    useEffect(() => {
        const updatePreview = async () => {
            const res = await DockerClient.buildDmarcRecord(config);
            setPreview(res);
        };
        updatePreview();
    }, [config]);

    const handleAdd = () => {
        onAddRecord({
            name: '_dmarc',
            type: 'TXT',
            value: preview,
            ttl: 3600
        });
        toast.success('DMARC record added to list');
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="text-xs text-on-surface-variant">Policy</label>
                    <select
                        value={config.policy}
                        onChange={e => setConfig({ ...config, policy: e.target.value })}
                        className="w-full bg-surface-container rounded px-2 py-1 text-sm border border-outline/10"
                    >
                        <option value="none">None (Monitor Only)</option>
                        <option value="quarantine">Quarantine</option>
                        <option value="reject">Reject</option>
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-on-surface-variant">Reporting Email</label>
                    <input
                        value={config.rua}
                        onChange={e => setConfig({ ...config, rua: e.target.value })}
                        placeholder="admin@domain.com"
                        className="w-full bg-surface-container rounded px-2 py-1 text-sm border border-outline/10"
                    />
                </div>
            </div>

            <div className="p-3 bg-surface-container rounded-lg border border-outline/5">
                <div className="text-xs text-on-surface-variant mb-1">Generated Record:</div>
                <div className="font-mono text-sm break-all text-primary">{preview}</div>
            </div>

            <button onClick={handleAdd} className="w-full btn-primary py-2 text-sm">
                Add DMARC Record
            </button>
        </div>
    );
}

// --- Propagation Checker ---
export function PropagationChecker({ zone, record }: { zone: DnsZone; record: DnsRecord }) {
    const [result, setResult] = useState<PropagationCheckResult | null>(null);
    const [loading, setLoading] = useState(false);

    const runCheck = async () => {
        setLoading(true);
        const res = await DockerClient.checkPropagation(zone.id, record.name, record.type as DnsRecordType);
        setResult(res);
        setLoading(false);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-sm font-semibold">{record.name === '@' ? zone.name : `${record.name}.${zone.name}`}</div>
                    <div className="text-xs text-on-surface-variant">{record.type} • Expected: {record.value}</div>
                </div>
                <button onClick={runCheck} disabled={loading} className="btn-primary py-1 px-3 text-xs flex items-center gap-2">
                    {loading ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
                    Check Now
                </button>
            </div>

            {result && (
                <div className="grid grid-cols-2 gap-2">
                    {result.checks.map((chk, i) => (
                        <div key={i} className="p-2 bg-surface-container rounded-lg border border-outline/5 flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-xs font-medium">{chk.serverName}</span>
                                <span className="text-[10px] text-on-surface-variant">{chk.serverIp}</span>
                            </div>
                            {chk.matches ? (
                                <Check size={14} className="text-green-400" />
                            ) : (
                                <XCircle size={14} className="text-red-400" />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function XCircle({ size, className }: { size: number; className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />
        </svg>
    );
}

// --- Reverse DNS Wizard ---
export function ReverseDnsWizard({ onZoneSuggested }: { onZoneSuggested: (suggestion: IpPtrSuggestion) => void }) {
    const [ip, setIp] = useState('');
    const [suggestion, setSuggestion] = useState<IpPtrSuggestion | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSuggest = async () => {
        if (!ip) return;
        setLoading(true);
        const res = await DockerClient.suggestReverseZone(ip);
        setSuggestion(res);
        setLoading(false);
    };

    return (
        <div className="space-y-4">
            <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                    <label className="text-xs text-on-surface-variant">IP Address (v4 or v6)</label>
                    <input
                        value={ip}
                        onChange={e => setIp(e.target.value)}
                        className="input-field py-1.5"
                        placeholder="e.g. 1.2.3.4"
                    />
                </div>
                <button onClick={handleSuggest} disabled={loading} className="btn-primary py-1.5 px-4 mb-[2px]">
                    {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                </button>
            </div>

            {suggestion && (
                <div className="p-3 bg-surface-container rounded-lg border border-outline/5 space-y-3">
                    <div className="space-y-1">
                        <div className="text-xs text-on-surface-variant">Recommended Zone Name:</div>
                        <div className="font-mono text-sm text-primary">{suggestion.reverseZone}</div>
                    </div>
                    <div className="space-y-1">
                        <div className="text-xs text-on-surface-variant">PTR Record for {ip}:</div>
                        <div className="font-mono text-sm text-primary">{suggestion.ptrRecordName}</div>
                    </div>
                    <button onClick={() => onZoneSuggested(suggestion)} className="w-full btn-sm bg-primary/10 text-primary py-1.5">
                        Create Zone for this suggestion
                    </button>
                </div>
            )}
        </div>
    );
}

// --- SRV Wizard ---
export function SrvWizard({ zone, onAddRecord }: { zone: DnsZone; onAddRecord: (r: Partial<DnsRecord>) => void }) {
    const [config, setConfig] = useState<SrvConfig>({
        service: '_autodiscover',
        protocol: '_tcp',
        priority: 0,
        weight: 0,
        port: 443,
        target: `mail.${zone.name}`
    });
    const [preview, setPreview] = useState('');

    const presets = [
        { name: 'Autodiscover', service: '_autodiscover', protocol: '_tcp', port: 443, target: `mail.${zone.name}` },
        { name: 'IMAP (SSL)', service: '_imap', protocol: '_tcp', port: 993, target: `mail.${zone.name}` },
        { name: 'IMAP', service: '_imap', protocol: '_tcp', port: 143, target: `mail.${zone.name}` },
        { name: 'SMTP (SSL)', service: '_submission', protocol: '_tcp', port: 465, target: `mail.${zone.name}` },
        { name: 'SMTP', service: '_submission', protocol: '_tcp', port: 587, target: `mail.${zone.name}` },
    ];

    useEffect(() => {
        const updatePreview = async () => {
            const res = await DockerClient.buildSrvRecord(config);
            setPreview(res.record);
        };
        updatePreview();
    }, [config]);

    const handleAdd = () => {
        onAddRecord({
            name: `${config.service}.${config.protocol}`,
            type: 'SRV',
            value: preview,
            ttl: 3600
        });
        toast.success('SRV record added to list');
    };

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <label className="text-xs font-semibold text-on-surface-variant">Presets</label>
                <div className="flex flex-wrap gap-2">
                    {presets.map(p => (
                        <button
                            key={p.name}
                            onClick={() => setConfig({ ...config, ...p })}
                            className="px-2 py-1 text-[10px] rounded border bg-surface-container border-outline/10 text-on-surface-variant hover:border-primary/50"
                        >
                            {p.name}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="text-xs text-on-surface-variant">Service</label>
                    <input value={config.service} onChange={e => setConfig({ ...config, service: e.target.value })} className="input-field py-1 text-xs" />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-on-surface-variant">Protocol</label>
                    <select value={config.protocol} onChange={e => setConfig({ ...config, protocol: e.target.value })} className="w-full bg-surface-container rounded px-2 py-1 text-xs border border-outline/10">
                        <option value="_tcp">TCP</option>
                        <option value="_udp">UDP</option>
                        <option value="_tls">TLS</option>
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-on-surface-variant">Priority</label>
                    <input type="number" value={config.priority} onChange={e => setConfig({ ...config, priority: parseInt(e.target.value) || 0 })} className="input-field py-1 text-xs" />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-on-surface-variant">Weight</label>
                    <input type="number" value={config.weight} onChange={e => setConfig({ ...config, weight: parseInt(e.target.value) || 0 })} className="input-field py-1 text-xs" />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-on-surface-variant">Port</label>
                    <input type="number" value={config.port} onChange={e => setConfig({ ...config, port: parseInt(e.target.value) || 0 })} className="input-field py-1 text-xs" />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-on-surface-variant">Target Target</label>
                    <input value={config.target} onChange={e => setConfig({ ...config, target: e.target.value })} className="input-field py-1 text-xs" />
                </div>
            </div>

            <div className="p-3 bg-surface-container rounded-lg border border-outline/5">
                <div className="text-xs text-on-surface-variant mb-1 flex justify-between">
                    <span>Preview ({config.service}.{config.protocol}):</span>
                    <span className="text-primary">{preview}</span>
                </div>
            </div>

            <button onClick={handleAdd} className="w-full btn-primary py-2 text-sm">
                Add SRV Record
            </button>
        </div>
    );
}

// --- Email Health Check ---
export function EmailHealthCheck({ zoneId }: { zoneId: string }) {
    const [health, setHealth] = useState<EmailHealthStatus | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = async () => {
        setLoading(true);
        const res = await DockerClient.getEmailHealth(zoneId);
        setHealth(res);
        setLoading(false);
    };

    useEffect(() => { refresh(); }, [zoneId]);

    if (loading) return <div className="flex justify-center py-4"><RefreshCw size={16} className="animate-spin text-primary" /></div>;
    if (!health) return null;

    const items = [
        { name: 'MX Records', status: health.hasMx, icon: <Mail size={14} />, desc: 'Required for receiving emails' },
        { name: 'SPF Record', status: health.hasSpf, icon: <Shield size={14} />, desc: 'Anti-spam protection' },
        { name: 'DKIM Record', status: health.hasDkim, icon: <Shield size={14} />, desc: 'Email authentication' },
        { name: 'DMARC Record', status: health.hasDmarc, icon: <AlertCircle size={14} />, desc: 'Spoofing & reporting' },
    ];

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
                {items.map(item => (
                    <div key={item.name} className={`p-2 rounded-lg border flex items-center gap-3 transition-colors ${item.status ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                        <div className={item.status ? 'text-green-400' : 'text-red-400'}>{item.icon}</div>
                        <div>
                            <div className="text-[11px] font-bold leading-none">{item.name}</div>
                            <div className="text-[9px] text-on-surface-variant">{item.status ? 'Configured' : 'Missing'}</div>
                        </div>
                    </div>
                ))}
            </div>

            {health.issues.length > 0 && (
                <div className="p-2.5 bg-red-500/5 rounded-lg border border-red-500/10">
                    <div className="text-[10px] font-bold text-red-400 mb-1 flex items-center gap-1"><AlertCircle size={10} /> Identified Issues:</div>
                    <ul className="space-y-0.5">
                        {health.issues.map((issue: string, i: number) => (
                            <li key={i} className="text-[10px] text-red-300/80 pl-2 border-l border-red-500/20">{issue}</li>
                        ))}
                    </ul>
                </div>
            )}

            <button onClick={refresh} className="w-full flex justify-center py-1.5 text-[10px] text-on-surface-variant hover:text-primary transition-colors">
                <RefreshCw size={10} className="mr-1" /> Re-scan
            </button>
        </div>
    );
}

// --- Child Name Server Wizard ---
export function ChildNsWizard({ zone, onAddRecords }: { zone: DnsZone; onAddRecords: (rs: Partial<DnsRecord>[]) => void }) {
    const [subdomain, setSubdomain] = useState('ns1');
    const [ip, setIp] = useState('');
    const [ipv6, setIpv6] = useState('');

    const handleAdd = () => {
        if (!subdomain || !ip) return;

        const nsName = subdomain.replace(`.${zone.name}`, '').replace(/\.$/, '');
        const fullName = `${nsName}.${zone.name}.`;

        const records: Partial<DnsRecord>[] = [
            { name: nsName, type: 'A', value: ip, ttl: 86400 },
            { name: '@', type: 'NS', value: fullName, ttl: 86400 }
        ];

        if (ipv6) {
            records.push({ name: nsName, type: 'AAAA', value: ipv6, ttl: 86400 });
        }

        onAddRecords(records);
        toast.success(`Child Name Server ${fullName} added`);
        setIp(''); setIpv6('');
    };

    return (
        <div className="space-y-4">
            <p className="text-xs text-on-surface-variant leading-relaxed"> Register "Glue Records" to use this server as a name server for your domain. This is required if you want to use <span className="text-primary font-mono">{subdomain}.{zone.name}</span> as your DNS at your registrar.</p>
            <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                    <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Host Name</label>
                    <div className="flex items-center gap-1">
                        <input value={subdomain} onChange={e => setSubdomain(e.target.value)} className="input-field flex-1 text-sm font-mono" placeholder="ns1" />
                        <span className="text-xs text-on-surface-variant font-mono">.{zone.name}</span>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">IPv4 Address</label>
                        <input value={ip} onChange={e => setIp(e.target.value)} className="input-field py-2 text-sm font-mono" placeholder="1.2.3.4" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">IPv6 (Optional)</label>
                        <input value={ipv6} onChange={e => setIpv6(e.target.value)} className="input-field py-2 text-sm font-mono" placeholder="::1" />
                    </div>
                </div>
            </div>
            <button onClick={handleAdd} disabled={!subdomain || !ip} className="w-full btn-primary py-2.5 text-sm font-bold shadow-lg shadow-primary/20">
                Register Name Server
            </button>
        </div>
    );
}

// --- Reverse DNS Dashboard ---
export function ReverseDnsDashboard() {
    const [data, setData] = useState<ReverseDnsDashboardModel | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        DockerClient.getReverseDnsDashboard().then(res => {
            setData(res as any);
            setLoading(false);
        });
    }, []);

    if (loading) return <div className="flex justify-center py-8"><RefreshCw size={24} className="animate-spin text-primary" /></div>;
    if (!data) return null;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-surface-container rounded-lg border border-outline/5 text-center">
                    <div className="text-lg font-bold text-primary">{data.serverIps.length}</div>
                    <div className="text-[10px] text-on-surface-variant uppercase tracking-wider">Detected IPs</div>
                </div>
                <div className="p-3 bg-surface-container rounded-lg border border-outline/5 text-center">
                    <div className="text-lg font-bold text-primary">{data.managedReverseZones.length}</div>
                    <div className="text-[10px] text-on-surface-variant uppercase tracking-wider">Reverse Zones</div>
                </div>
                <div className="p-3 bg-surface-container rounded-lg border border-outline/5 text-center">
                    <div className="text-lg font-bold text-green-400">{data.ptrStatuses.filter(s => s.health === 'OK').length}</div>
                    <div className="text-[10px] text-on-surface-variant uppercase tracking-wider">Healthy PTRs</div>
                </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-outline/10">
                <table className="w-full text-left text-xs">
                    <thead className="bg-surface-container-high">
                        <tr>
                            <th className="px-3 py-2 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">IP Address</th>
                            <th className="px-3 py-2 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">PTR Value</th>
                            <th className="px-3 py-2 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-outline/5">
                        {data.ptrStatuses.map((s, i) => (
                            <tr key={i} className="hover:bg-surface-container-low transition-colors">
                                <td className="px-3 py-3 font-mono">{s.ip}</td>
                                <td className="px-3 py-3 font-mono text-primary">{s.ptrValue || '-'}</td>
                                <td className="px-3 py-3">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${s.health === 'OK' ? 'bg-green-500/10 text-green-400' :
                                        s.health === 'MISSING' ? 'bg-red-500/10 text-red-400' :
                                            'bg-yellow-500/10 text-yellow-400'
                                        }`}>
                                        {s.health}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// Workaround for type naming collision or missing export
interface ReverseDnsDashboardModel {
    serverIps: string[];
    managedReverseZones: string[];
    ptrStatuses: {
        ip: string;
        ptrValue: string | null;
        isManagedLocally: boolean;
        health: string;
    }[];
}
