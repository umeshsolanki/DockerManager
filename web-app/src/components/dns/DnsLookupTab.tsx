'use client';

import React, { useState } from 'react';
import { Search, Clock, Server } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { DnsLookupResult } from '@/lib/types';
import { SectionCard } from './DnsShared';

const COMMON_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'SRV', 'PTR', 'CAA', 'ANY'];

export default function DnsLookupTab() {
    const [query, setQuery] = useState('');
    const [type, setType] = useState('A');
    const [server, setServer] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<DnsLookupResult | null>(null);
    const [history, setHistory] = useState<DnsLookupResult[]>([]);

    const handleLookup = async () => {
        if (!query.trim()) return;
        setLoading(true);
        const r = await DockerClient.dnsLookup({ query: query.trim(), type, server: server.trim() || undefined });
        setResult(r);
        if (r.success) setHistory(h => [r, ...h].slice(0, 20));
        setLoading(false);
    };

    return (
        <div className="space-y-5">
            <SectionCard title="DNS Lookup">
                <div className="flex gap-3 flex-wrap">
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleLookup()}
                        placeholder="example.com"
                        className="flex-1 min-w-[200px] input-field"
                    />
                    <select value={type} onChange={e => setType(e.target.value)} className="input-field w-24">
                        {COMMON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                        value={server}
                        onChange={e => setServer(e.target.value)}
                        placeholder="DNS server (optional)"
                        className="input-field w-48"
                    />
                    <button onClick={handleLookup} disabled={loading || !query.trim()} className="btn-primary disabled:opacity-50 flex items-center gap-1.5">
                        <Search size={14} /> {loading ? 'Looking up...' : 'Lookup'}
                    </button>
                </div>
            </SectionCard>

            {result && (
                <SectionCard title={`Results for ${result.query} (${result.type})`} actions={
                    <span className={`text-xs px-2 py-0.5 rounded-full ${result.status === 'NOERROR' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                        {result.status || (result.success ? 'OK' : 'FAILED')}
                    </span>
                }>
                    {result.answers.length > 0 ? (
                        <div className="overflow-x-auto rounded-lg border border-outline/10">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-surface text-on-surface-variant text-xs">
                                        <th className="px-3 py-2 text-left font-medium">Name</th>
                                        <th className="px-3 py-2 text-center font-medium">TTL</th>
                                        <th className="px-3 py-2 text-left font-medium">Type</th>
                                        <th className="px-3 py-2 text-left font-medium">Value</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.answers.map((a, i) => (
                                        <tr key={i} className="border-t border-outline/5">
                                            <td className="px-3 py-1.5 text-xs font-mono">{a.name}</td>
                                            <td className="px-3 py-1.5 text-xs text-center">{a.ttl}</td>
                                            <td className="px-3 py-1.5"><span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{a.type}</span></td>
                                            <td className="px-3 py-1.5 text-xs font-mono">{a.value}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-sm text-on-surface-variant">No records found</p>
                    )}
                    <div className="flex gap-4 mt-3 text-[10px] text-on-surface-variant">
                        {result.queryTime && <span className="flex items-center gap-1"><Clock size={10} /> {result.queryTime}</span>}
                        {result.server && <span className="flex items-center gap-1"><Server size={10} /> {result.server}</span>}
                    </div>
                </SectionCard>
            )}

            {result?.rawOutput && (
                <SectionCard title="Raw Output">
                    <pre className="text-xs font-mono text-on-surface-variant whitespace-pre-wrap max-h-48 overflow-y-auto">{result.rawOutput}</pre>
                </SectionCard>
            )}

            {history.length > 1 && (
                <SectionCard title="Recent Lookups">
                    <div className="space-y-1">
                        {history.slice(1).map((h, i) => (
                            <button key={i} onClick={() => { setQuery(h.query); setType(h.type); setResult(h); }} className="w-full text-left flex items-center gap-3 p-2 rounded-lg hover:bg-surface transition-colors text-xs">
                                <span className="font-mono flex-1 truncate">{h.query}</span>
                                <span className="bg-surface-container px-1.5 py-0.5 rounded text-on-surface-variant">{h.type}</span>
                                <span className="text-on-surface-variant">{h.answers.length} answers</span>
                            </button>
                        ))}
                    </div>
                </SectionCard>
            )}
        </div>
    );
}
