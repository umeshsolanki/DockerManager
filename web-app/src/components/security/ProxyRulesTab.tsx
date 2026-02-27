'use client';

import React, { useState, useMemo } from 'react';
import {
    Shield, ShieldCheck, Trash2, Plus, Search, Globe, Activity,
    Terminal, History, Zap, ChevronDown, Copy, GripVertical,
    AlertTriangle, Filter, Eye, EyeOff, Hash, Layers
} from 'lucide-react';
import { SystemConfig, ProxyJailRule, ProxyJailRuleType, ProxyJailRuleTarget } from '@/lib/types';
import { DockerClient } from '@/lib/api';
import { Modal } from '../ui/Modal';
import { toast } from 'sonner';

interface ProxyRulesTabProps {
    proxyConfig: SystemConfig | null;
    setProxyConfig: React.Dispatch<React.SetStateAction<SystemConfig | null>>;
    updateProxySecurity: (updated: Partial<SystemConfig>) => Promise<void>;
}

const RULE_TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string; hint: string }> = {
    USER_AGENT: { label: 'User Agent', icon: History, color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/30', hint: 'Regex matched against the request User-Agent header' },
    PATH: { label: 'Path', icon: Activity, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', hint: 'Regex matched against the request URL path' },
    HOST_HEADER: { label: 'Host', icon: Globe, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', hint: 'Regex matched against the Host header (e.g. domain.com)' },
    METHOD: { label: 'Method', icon: Terminal, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', hint: 'Exact match on HTTP method (GET, POST, DELETE, etc.)' },
    STATUS_CODE: { label: 'Status Code', icon: Hash, color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/30', hint: 'Regex matched against the response status code' },
    COMPOSITE: { label: 'Composite', icon: Layers, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', hint: 'Path regex + status code pattern combined' },
};

function getRuleMeta(type: string) {
    return RULE_TYPE_META[type] ?? RULE_TYPE_META.PATH;
}

export default function ProxyRulesTab({ proxyConfig, setProxyConfig, updateProxySecurity }: ProxyRulesTabProps) {
    const [rulesSubTab, setRulesSubTab] = useState<'active' | 'defaults'>('active');
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [editingRule, setEditingRule] = useState<ProxyJailRule | null>(null);

    const rules = useMemo(() => {
        const src = rulesSubTab === 'active' ? proxyConfig?.proxyJailRules : proxyConfig?.recommendedProxyJailRules;
        if (!src) return [];
        return src.filter(r => {
            if (filterType && r.type !== filterType) return false;
            if (search) {
                const q = search.toLowerCase();
                return r.pattern.toLowerCase().includes(q)
                    || r.description?.toLowerCase().includes(q)
                    || r.type.toLowerCase().includes(q)
                    || r.statusCodePattern?.toLowerCase().includes(q);
            }
            return true;
        });
    }, [proxyConfig, rulesSubTab, search, filterType]);

    const allRules = rulesSubTab === 'active' ? proxyConfig?.proxyJailRules : proxyConfig?.recommendedProxyJailRules;

    const typeCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        (allRules ?? []).forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1; });
        return counts;
    }, [allRules]);

    const field = rulesSubTab === 'active' ? 'proxyJailRules' : 'recommendedProxyJailRules';

    const removeRule = (id: string) => {
        const current = (proxyConfig as any)?.[field] || [];
        setProxyConfig(prev => prev ? { ...prev, [field]: current.filter((x: ProxyJailRule) => x.id !== id) } : null);
    };

    const duplicateRule = (rule: ProxyJailRule) => {
        const copy: ProxyJailRule = { ...rule, id: Math.random().toString(36).substr(2, 9), description: (rule.description || rule.pattern) + ' (copy)' };
        const current = (proxyConfig as any)?.[field] || [];
        setProxyConfig(prev => prev ? { ...prev, [field]: [...current, copy] } : null);
        toast.success('Rule duplicated');
    };

    const saveRule = (rule: ProxyJailRule) => {
        const current: ProxyJailRule[] = (proxyConfig as any)?.[field] || [];
        if (editingRule) {
            const updated = current.map(r => r.id === rule.id ? rule : r);
            setProxyConfig(prev => prev ? { ...prev, [field]: updated } : null);
            setEditingRule(null);
            toast.success('Rule updated');
        } else {
            setProxyConfig(prev => prev ? { ...prev, [field]: [...current, rule] } : null);
            setShowAddModal(false);
            toast.success('Rule added');
        }
    };

    const applyChanges = () => {
        const payload = rulesSubTab === 'active'
            ? { proxyJailRules: proxyConfig?.proxyJailRules }
            : { recommendedProxyJailRules: proxyConfig?.recommendedProxyJailRules };
        updateProxySecurity(payload as Partial<SystemConfig>);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header Card */}
            <div className="bg-surface/30 border border-outline/10 rounded-2xl p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/10">
                            <ShieldCheck size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold">Proxy Armor Rules</h3>
                            <p className="text-xs text-on-surface-variant/60 mt-0.5">Pattern-based request analysis and auto-jailing</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${showSettings ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-white/5 border-white/5 text-on-surface-variant hover:bg-white/10'}`}
                        >
                            <Zap size={14} /> Thresholds
                            <ChevronDown size={12} className={`transition-transform ${showSettings ? 'rotate-180' : ''}`} />
                        </button>
                        <div className="h-8 w-px bg-outline/10" />
                        <span className="text-xs text-on-surface-variant/50">Armor</span>
                        <button
                            onClick={() => updateProxySecurity({ proxyJailEnabled: !proxyConfig?.proxyJailEnabled })}
                            className={`w-12 h-6 rounded-full transition-all relative ${proxyConfig?.proxyJailEnabled ? 'bg-primary shadow-[0_0_15px_rgba(var(--md-sys-color-primary-rgb),0.4)]' : 'bg-white/10'}`}
                        >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${proxyConfig?.proxyJailEnabled ? 'right-1' : 'left-1'}`} />
                        </button>
                    </div>
                </div>

                {/* Thresholds Panel */}
                {showSettings && (
                    <div className="mt-6 pt-6 border-t border-outline/10 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <ThresholdInput
                                label="Client Error Sensitivity"
                                sublabel="4xx violations before jail"
                                value={proxyConfig?.proxyJailThresholdNon200 ?? 20}
                                onChange={v => setProxyConfig(prev => prev ? { ...prev, proxyJailThresholdNon200: v } : null)}
                                onBlur={v => updateProxySecurity({ proxyJailThresholdNon200: v })}
                            />
                            <ThresholdInput
                                label="Danger Threshold"
                                sublabel="403 hits before jail"
                                value={proxyConfig?.proxyJailThresholdDanger ?? 1}
                                onChange={v => setProxyConfig(prev => prev ? { ...prev, proxyJailThresholdDanger: v } : null)}
                                onBlur={v => updateProxySecurity({ proxyJailThresholdDanger: v })}
                                color="red"
                            />
                            <ThresholdInput
                                label="Burst Threshold"
                                sublabel="429 hits before jail"
                                value={proxyConfig?.proxyJailThresholdBurst ?? 5}
                                onChange={v => setProxyConfig(prev => prev ? { ...prev, proxyJailThresholdBurst: v } : null)}
                                onBlur={v => updateProxySecurity({ proxyJailThresholdBurst: v })}
                                color="orange"
                            />
                            <ThresholdInput
                                label="Analysis Window"
                                sublabel="Window duration (minutes)"
                                value={proxyConfig?.proxyJailWindowMinutes ?? 1}
                                onChange={v => setProxyConfig(prev => prev ? { ...prev, proxyJailWindowMinutes: v } : null)}
                                onBlur={v => updateProxySecurity({ proxyJailWindowMinutes: v })}
                                color="blue"
                            />
                        </div>

                        <div className="flex items-center justify-between mt-4 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                            <div className="flex items-center gap-3">
                                <AlertTriangle size={16} className="text-on-surface-variant/50" />
                                <div>
                                    <span className="text-xs font-bold block">Mirror Traffic (Danger Proxy)</span>
                                    <span className="text-[10px] text-on-surface-variant/40">Forward suspicious traffic to a honeypot</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {proxyConfig?.dangerProxyEnabled && (
                                    <input
                                        value={proxyConfig?.dangerProxyHost ?? ''}
                                        onChange={e => setProxyConfig(prev => prev ? { ...prev, dangerProxyHost: e.target.value } : null)}
                                        onBlur={e => updateProxySecurity({ dangerProxyHost: e.target.value })}
                                        placeholder="host:port"
                                        className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono w-40 focus:outline-none focus:border-primary/50"
                                    />
                                )}
                                <button
                                    onClick={() => updateProxySecurity({ dangerProxyEnabled: !proxyConfig?.dangerProxyEnabled })}
                                    className={`w-10 h-5 rounded-full transition-all relative ${proxyConfig?.dangerProxyEnabled ? 'bg-primary' : 'bg-white/10'}`}
                                >
                                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${proxyConfig?.dangerProxyEnabled ? 'right-0.5' : 'left-0.5'}`} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Toolbar */}
            <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
                <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                    <button
                        onClick={() => setRulesSubTab('active')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${rulesSubTab === 'active' ? 'bg-primary text-on-primary shadow-lg' : 'text-on-surface-variant hover:text-on-surface'}`}
                    >
                        Active ({proxyConfig?.proxyJailRules?.length || 0})
                    </button>
                    <button
                        onClick={() => setRulesSubTab('defaults')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${rulesSubTab === 'defaults' ? 'bg-secondary text-on-secondary shadow-lg' : 'text-on-surface-variant hover:text-on-surface'}`}
                    >
                        Defaults ({proxyConfig?.recommendedProxyJailRules?.length || 0})
                    </button>
                </div>

                <div className="relative flex-1 min-w-0 w-full md:w-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40" size={14} />
                    <input
                        type="text"
                        placeholder="Search rules..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full bg-white/5 border border-white/5 rounded-xl py-2 pl-9 pr-4 text-xs focus:outline-none focus:border-primary/30 transition-colors"
                    />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Type filter pills */}
                    <button
                        onClick={() => setFilterType(null)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${!filterType ? 'bg-white/10 border-white/20 text-on-surface' : 'border-transparent text-on-surface-variant/50 hover:text-on-surface-variant'}`}
                    >
                        All
                    </button>
                    {Object.entries(RULE_TYPE_META).map(([type, meta]) => {
                        const count = typeCounts[type] || 0;
                        if (count === 0 && filterType !== type) return null;
                        return (
                            <button
                                key={type}
                                onClick={() => setFilterType(filterType === type ? null : type)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${filterType === type ? `${meta.bg} ${meta.border} ${meta.color}` : 'border-transparent text-on-surface-variant/50 hover:text-on-surface-variant'}`}
                            >
                                <meta.icon size={10} />
                                {meta.label}
                                <span className="opacity-60">{count}</span>
                            </button>
                        );
                    })}

                    <div className="h-6 w-px bg-outline/10 mx-1" />

                    {rulesSubTab === 'active' && (!proxyConfig?.proxyJailRules || proxyConfig.proxyJailRules.length === 0) && (
                        <button
                            onClick={async () => {
                                const recommended = await DockerClient.getRecommendedProxyRules();
                                setProxyConfig(prev => prev ? { ...prev, proxyJailRules: recommended } : null);
                                toast.info(`Loaded ${recommended.length} recommended rules — click Apply to save`);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary/10 text-secondary hover:bg-secondary/20 rounded-lg text-[10px] font-bold border border-secondary/20"
                        >
                            <Plus size={10} /> Load Recommended
                        </button>
                    )}

                    <button
                        onClick={() => { setEditingRule(null); setShowAddModal(true); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary rounded-lg text-[10px] font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                        <Plus size={12} /> Add Rule
                    </button>
                </div>
            </div>

            {/* Rules List */}
            <div className="space-y-2">
                {rules.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
                        <Shield size={48} className="text-on-surface-variant/10 mb-4" />
                        <p className="text-sm font-bold text-on-surface-variant/60">
                            {search || filterType ? 'No rules match your filter' : 'No rules defined'}
                        </p>
                        {!search && !filterType && (
                            <p className="text-xs text-on-surface-variant/30 mt-1">Add rules to protect against malicious traffic patterns</p>
                        )}
                    </div>
                ) : (
                    rules.map(rule => (
                        <RuleCard
                            key={rule.id}
                            rule={rule}
                            accent={rulesSubTab}
                            onDelete={() => removeRule(rule.id)}
                            onDuplicate={() => duplicateRule(rule)}
                            onEdit={() => { setEditingRule(rule); setShowAddModal(true); }}
                        />
                    ))
                )}
            </div>

            {/* Apply Button */}
            {(allRules?.length || 0) > 0 && (
                <button
                    onClick={applyChanges}
                    className={`w-full ${rulesSubTab === 'active' ? 'bg-primary text-on-primary shadow-primary/20' : 'bg-secondary text-on-secondary shadow-secondary/20'} py-3 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg hover:scale-[1.005] active:scale-[0.995] transition-all`}
                >
                    Apply {rulesSubTab === 'active' ? 'Active' : 'Default'} Changes
                </button>
            )}

            {/* Add / Edit Modal */}
            {showAddModal && (
                <RuleFormModal
                    rule={editingRule}
                    onClose={() => { setShowAddModal(false); setEditingRule(null); }}
                    onSave={saveRule}
                />
            )}
        </div>
    );
}

function RuleCard({ rule, accent, onDelete, onDuplicate, onEdit }: {
    rule: ProxyJailRule;
    accent: 'active' | 'defaults';
    onDelete: () => void;
    onDuplicate: () => void;
    onEdit: () => void;
}) {
    const meta = getRuleMeta(rule.type);
    const Icon = meta.icon;
    const threshold = rule.threshold ?? 1;

    return (
        <div className={`group relative bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden transition-all hover:border-white/10 hover:bg-white/[0.05]`}>
            {/* Colored left accent */}
            <div className={`absolute inset-y-0 left-0 w-1 ${meta.bg} opacity-60 group-hover:opacity-100 transition-opacity`} />

            <div className="flex items-center gap-4 px-5 py-3.5">
                {/* Icon */}
                <div className={`w-9 h-9 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
                    <Icon size={16} className={meta.color} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[9px] font-black uppercase tracking-widest ${meta.color} ${meta.bg} px-2 py-0.5 rounded`}>
                            {meta.label}
                        </span>
                        {rule.description && (
                            <span className={`text-xs font-medium ${accent === 'active' ? 'text-on-surface/80' : 'text-on-surface/60'} truncate max-w-xs`}>
                                {rule.description}
                            </span>
                        )}
                        {threshold > 1 && (
                            <span className="text-[9px] font-bold bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded">
                                {threshold}x threshold
                            </span>
                        )}
                        {rule.matchEmpty && (
                            <span className="text-[9px] font-bold bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded">
                                matches empty
                            </span>
                        )}
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${rule.target === ProxyJailRuleTarget.NGINX ? 'bg-indigo-500/15 text-indigo-400' :
                                rule.target === ProxyJailRuleTarget.INTERNAL ? 'bg-pink-500/15 text-pink-400' :
                                    'bg-violet-500/15 text-violet-400'
                            }`}>
                            {rule.target || ProxyJailRuleTarget.BOTH}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <code className="text-xs font-mono text-on-surface/70 truncate">
                            {rule.pattern}
                        </code>
                        {rule.type === 'COMPOSITE' && rule.statusCodePattern && (
                            <>
                                <span className="text-on-surface-variant/20">+</span>
                                <code className="text-xs font-mono text-teal-400/80 shrink-0">
                                    status /{rule.statusCodePattern}/
                                </code>
                            </>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                        onClick={onEdit}
                        className="p-1.5 text-on-surface-variant/60 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                        title="Edit rule"
                    >
                        <Eye size={14} />
                    </button>
                    <button
                        onClick={onDuplicate}
                        className="p-1.5 text-on-surface-variant/60 hover:text-secondary hover:bg-secondary/10 rounded-lg transition-all"
                        title="Duplicate rule"
                    >
                        <Copy size={14} />
                    </button>
                    <button
                        onClick={onDelete}
                        className="p-1.5 text-on-surface-variant/60 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                        title="Delete rule"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}

function ThresholdInput({ label, sublabel, value, onChange, onBlur, color = 'primary' }: {
    label: string;
    sublabel: string;
    value: number;
    onChange: (v: number) => void;
    onBlur: (v: number) => void;
    color?: string;
}) {
    const colorMap: Record<string, string> = {
        primary: 'focus:border-primary/50',
        red: 'focus:border-red-500/50',
        orange: 'focus:border-orange-500/50',
        blue: 'focus:border-blue-500/50',
    };
    const labelColor: Record<string, string> = {
        primary: 'text-on-surface-variant',
        red: 'text-red-400',
        orange: 'text-orange-400',
        blue: 'text-blue-400',
    };

    return (
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <label className={`text-[10px] font-bold uppercase tracking-tight block mb-0.5 ${labelColor[color] || labelColor.primary}`}>
                {label}
            </label>
            <span className="text-[9px] text-on-surface-variant/40 block mb-2">{sublabel}</span>
            <input
                type="number"
                min={1}
                value={value}
                onChange={e => onChange(parseInt(e.target.value) || 1)}
                onBlur={e => onBlur(parseInt(e.target.value) || 1)}
                className={`w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm font-mono font-bold focus:outline-none ${colorMap[color] || colorMap.primary}`}
            />
        </div>
    );
}

// ---------------------------------------------------------------------------
// PCRE-aware regex validator
// Strategy: nginx uses PCRE (with JIT). JS uses a different engine.
// We strip known PCRE-only constructs before testing with new RegExp() so
// that valid PCRE patterns aren't incorrectly rejected.  If the pattern only
// fails because of PCRE-only syntax we emit a soft warning, not a hard error.
// ---------------------------------------------------------------------------
type PatternCheckResult =
    | { ok: true; warning?: string }
    | { ok: false; error: string };

const PCRE_ONLY_PATTERNS: [RegExp, string][] = [
    // Possessive quantifiers: a++ a*+ a?+
    [/\w[*+?]\+/g, 'possessive quantifiers (e.g. a++)'],
    // Atomic groups: (?>…)
    [/\(\?>/g, 'atomic groups (?>…)'],
    // Named capture PCRE style: (?P<name>…) or (?P=name)
    [/\(\?P[<=]/g, 'PCRE named captures (?P<…>)'],
    // Reset match start: \K
    [/\\K/g, '\\K (reset match start)'],
    // PCRE verbs: (*UTF8) (*ANYCRLF) (*SKIP) (*FAIL) (*MARK:…) etc.
    [/\(\*[A-Z_:]+\)/g, 'PCRE verb (*…)'],
    // Conditional patterns: (?(COND)yes|no)
    [/\(\?\(/g, 'conditional patterns (?(…)…)'],
    // Relative back-references: (?-1) (?+1)
    [/\(\?[-+]\d+\)/g, 'relative back-references'],
    // Extended comment mode (?#…)
    [/\(\?#[^)]*\)/g, 'inline comments (?#…)'],
    // Variable-length lookbehind — PCRE2 only, JS doesn't support these generally
    [/\(\?<[!=][^)]{2,}\)/g, 'variable-length lookbehind'],
];

function validatePcrePattern(raw: string): PatternCheckResult {
    if (!raw.trim()) return { ok: false, error: 'Pattern is required' };

    const pcreFeaturesFound: string[] = [];
    let scrubbed = raw;

    for (const [re, label] of PCRE_ONLY_PATTERNS) {
        if (re.test(scrubbed)) {
            pcreFeaturesFound.push(label);
            scrubbed = scrubbed.replace(re, '');
        }
        // reset lastIndex for global regexes
        re.lastIndex = 0;
    }

    // Basic structural checks (engine-independent)
    let depth = 0;
    for (let i = 0; i < raw.length; i++) {
        if (raw[i] === '\\') { i++; continue; }
        if (raw[i] === '(') depth++;
        if (raw[i] === ')') depth--;
        if (depth < 0) return { ok: false, error: 'Unmatched closing parenthesis )' };
    }
    if (depth > 0) return { ok: false, error: `${depth} unclosed parenthesi${depth > 1 ? 'es' : 's'} (` };

    // Test scrubbed pattern with JS engine
    try {
        new RegExp(scrubbed);
    } catch (err) {
        if (pcreFeaturesFound.length) {
            // Failed only because PCRE constructs were removed during scrubbing —
            // the original pattern may still be valid nginx PCRE.
            return {
                ok: true,
                warning: `Contains PCRE-only syntax not validated by browser: ${pcreFeaturesFound.join(', ')}. Ensure it is correct before saving.`,
            };
        }
        return { ok: false, error: 'Invalid regex: ' + (err as Error).message };
    }

    if (pcreFeaturesFound.length) {
        return {
            ok: true,
            warning: `Uses PCRE-specific syntax (${pcreFeaturesFound.join(', ')}) — valid for nginx but not testable in browser.`,
        };
    }

    return { ok: true };
}

function RuleFormModal({ rule, onClose, onSave }: {
    rule: ProxyJailRule | null;
    onClose: () => void;
    onSave: (rule: ProxyJailRule) => void;
}) {
    const isEdit = !!rule;
    const [type, setType] = useState<ProxyJailRuleType>(rule?.type ?? ProxyJailRuleType.PATH);
    const [pattern, setPattern] = useState(rule?.pattern ?? '');
    const [description, setDescription] = useState(rule?.description ?? '');
    const [threshold, setThreshold] = useState(rule?.threshold ?? 1);
    const [statusCodePattern, setStatusCodePattern] = useState(rule?.statusCodePattern ?? '');
    const [matchEmpty, setMatchEmpty] = useState(rule?.matchEmpty ?? false);
    const [target, setTarget] = useState<ProxyJailRuleTarget>(rule?.target ?? ProxyJailRuleTarget.BOTH);
    const [error, setError] = useState('');
    const [warning, setWarning] = useState('');
    const [validating, setValidating] = useState(false);

    const meta = getRuleMeta(type);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setWarning('');

        if (!pattern.trim() && !matchEmpty) { setError('Pattern is required'); return; }

        const isRegexType = type === ProxyJailRuleType.USER_AGENT
            || type === ProxyJailRuleType.PATH
            || type === ProxyJailRuleType.HOST_HEADER
            || type === ProxyJailRuleType.COMPOSITE
            || type === ProxyJailRuleType.STATUS_CODE;

        if (isRegexType) {
            setValidating(true);
            try {
                const result = await DockerClient.validateRegex(pattern.trim());
                if (result.valid === 'false') {
                    setError(result.error || 'Invalid pattern');
                    return;
                }
            } catch {
                // Server unreachable — fall back to the browser-side PCRE validator
                const fallback = validatePcrePattern(pattern);
                if (!fallback.ok) { setError(fallback.error); return; }
                if (fallback.warning) setWarning(fallback.warning);
            } finally {
                setValidating(false);
            }
        }

        if (type === ProxyJailRuleType.COMPOSITE && statusCodePattern.trim()) {
            setValidating(true);
            try {
                const result = await DockerClient.validateRegex(statusCodePattern.trim());
                if (result.valid === 'false') {
                    setError('Status code pattern — ' + (result.error || 'Invalid pattern'));
                    return;
                }
            } catch {
                const fallback = validatePcrePattern(statusCodePattern);
                if (!fallback.ok) { setError('Status code pattern — ' + fallback.error); return; }
            } finally {
                setValidating(false);
            }
        }

        onSave({
            id: rule?.id ?? Math.random().toString(36).substr(2, 9),
            type,
            pattern: pattern.trim(),
            description: description.trim() || undefined,
            matchEmpty,
            threshold: threshold > 1 ? threshold : undefined,
            statusCodePattern: (type === ProxyJailRuleType.COMPOSITE || type === ProxyJailRuleType.STATUS_CODE) && statusCodePattern.trim()
                ? statusCodePattern.trim()
                : undefined,
            target,
        });
    };

    return (
        <Modal
            onClose={onClose}
            title={isEdit ? 'Edit Rule' : 'Add Armor Rule'}
            description={isEdit ? 'Modify pattern and behavior' : 'Define a new traffic pattern to monitor'}
            icon={<Shield size={24} />}
            maxWidth="max-w-lg"
        >
            <form onSubmit={handleSubmit} className="mt-4 space-y-5 overflow-y-auto flex-1">
                {/* Type selector */}
                <div>
                    <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-widest block mb-2">Rule Type</label>
                    <div className="grid grid-cols-5 gap-1.5">
                        {Object.entries(RULE_TYPE_META).map(([key, m]) => {
                            const TypeIcon = m.icon;
                            const selected = type === key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setType(key as ProxyJailRuleType)}
                                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${selected ? `${m.bg} ${m.border} ${m.color}` : 'border-white/5 text-on-surface-variant/50 hover:border-white/10 hover:bg-white/[0.03]'}`}
                                >
                                    <TypeIcon size={16} />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">{m.label}</span>
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-[10px] text-on-surface-variant/40 mt-2 pl-1">{meta.hint}</p>
                </div>

                {/* Target selector */}
                <div>
                    <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-widest block mb-2">Enforcement Target</label>
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { id: ProxyJailRuleTarget.INTERNAL, label: 'App (Internal)', desc: 'Mirror & Analyze', icon: Shield },
                            { id: ProxyJailRuleTarget.NGINX, label: 'Nginx (Edge)', desc: 'Instant Block', icon: Globe },
                            { id: ProxyJailRuleTarget.BOTH, label: 'Both', desc: 'Edge + Analysis', icon: Layers },
                        ].map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setTarget(t.id)}
                                className={`flex flex-col items-start gap-1 p-3 rounded-xl border transition-all ${target === t.id ? 'bg-primary/10 border-primary/30 ring-1 ring-primary/30' : 'bg-white/5 border-white/5 text-on-surface-variant/50 hover:bg-white/10'}`}
                            >
                                <div className="flex items-center gap-2">
                                    <t.icon size={12} className={target === t.id ? 'text-primary' : ''} />
                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${target === t.id ? 'text-on-surface' : ''}`}>{t.label}</span>
                                </div>
                                <span className="text-[9px] opacity-40">{t.desc}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Pattern */}
                <div>
                    <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-widest block mb-1.5">
                        {type === ProxyJailRuleType.METHOD ? 'HTTP Method' : type === ProxyJailRuleType.STATUS_CODE ? 'Status Code Pattern' : 'Pattern (Regex)'}
                    </label>
                    <input
                        autoFocus
                        value={pattern}
                        onChange={e => setPattern(e.target.value)}
                        placeholder={
                            type === ProxyJailRuleType.USER_AGENT ? 'e.g. ^sqlmap/.*' :
                                type === ProxyJailRuleType.PATH ? 'e.g. /wp-admin|/xmlrpc\\.php' :
                                    type === ProxyJailRuleType.HOST_HEADER ? 'e.g. ^(www\\.)?malicious\\.com$' :
                                        type === ProxyJailRuleType.METHOD ? 'e.g. DELETE' :
                                            type === ProxyJailRuleType.STATUS_CODE ? 'e.g. 5\\d\\d' :
                                                'e.g. /api/.*'
                        }
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-primary/50"
                    />
                    {(type === ProxyJailRuleType.USER_AGENT || type === ProxyJailRuleType.HOST_HEADER) && (
                        <div className="flex items-center gap-2 mt-2 ml-1">
                            <input
                                type="checkbox"
                                id="matchEmpty"
                                checked={matchEmpty}
                                onChange={e => setMatchEmpty(e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-white/10 bg-black/40 text-primary focus:ring-0 focus:ring-offset-0"
                            />
                            <label htmlFor="matchEmpty" className="text-[11px] font-bold text-on-surface-variant cursor-pointer select-none">
                                Match if empty or missing
                            </label>
                        </div>
                    )}
                </div>

                {/* Status Code Pattern - for COMPOSITE */}
                {(type === ProxyJailRuleType.COMPOSITE) && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                        <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-widest block mb-1.5">
                            Status Code Pattern
                        </label>
                        <input
                            value={statusCodePattern}
                            onChange={e => setStatusCodePattern(e.target.value)}
                            placeholder="e.g. 404|403|5\\d\\d"
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-teal-500/50"
                        />
                    </div>
                )}

                {/* Threshold + Description side by side */}
                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-widest block mb-1.5">Threshold</label>
                        <input
                            type="number"
                            min={1}
                            value={threshold}
                            onChange={e => setThreshold(parseInt(e.target.value) || 1)}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-amber-500/50"
                        />
                        <span className="text-[9px] text-on-surface-variant/30 mt-1 block pl-1">1 = instant jail</span>
                    </div>
                    <div className="col-span-2">
                        <label className="text-[10px] font-bold uppercase text-on-surface-variant tracking-widest block mb-1.5">Description</label>
                        <input
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="e.g. Block SQL injection tools"
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50"
                        />
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium animate-in fade-in duration-200">
                        <AlertTriangle size={14} />
                        {error}
                    </div>
                )}

                {/* PCRE warning — pattern is valid PCRE but can't be verified in browser */}
                {warning && !error && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium animate-in fade-in duration-200">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <span>{warning}</span>
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-outline/20 hover:bg-white/5 transition-all text-sm font-bold"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={validating}
                        className="flex-1 bg-primary text-on-primary px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2"
                    >
                        {validating && (
                            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                        )}
                        {validating ? 'Validating…' : isEdit ? 'Save Changes' : 'Add Rule'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
