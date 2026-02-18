'use client';

import React, { useState, useEffect } from 'react';
import { Link, Save, CheckCircle, Info, Database, Server, Terminal, RefreshCw, Settings2, Globe, ShieldAlert, Key, LogOut, Maximize2, ShieldCheck, HardDrive } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { SystemConfig, TwoFactorSetupResponse, StorageInfo } from '@/lib/types';
import dynamic from 'next/dynamic';
import packageJson from '../../../package.json';

import { Modal } from '../ui/Modal';

const WebShell = dynamic(() => import('../Terminal'), { ssr: false });

// --- Reusable Components ---

const SettingsCard = ({ title, subtitle, icon: Icon, iconColor = "primary", children, className = "" }: any) => {
    const colorClasses: any = {
        primary: "bg-gradient-to-br from-primary/20 to-primary/5 text-primary border-primary/20",
        secondary: "bg-gradient-to-br from-secondary/20 to-secondary/5 text-secondary border-secondary/20",
        "red-500": "bg-gradient-to-br from-red-500/20 to-red-500/5 text-red-500 border-red-500/20",
        "blue-500": "bg-gradient-to-br from-blue-500/20 to-blue-500/5 text-blue-500 border-blue-500/20",
        "amber-500": "bg-gradient-to-br from-amber-500/20 to-amber-500/5 text-amber-500 border-amber-500/20",
        "green-500": "bg-gradient-to-br from-green-500/20 to-green-500/5 text-green-500 border-green-500/20",
        "purple-500": "bg-gradient-to-br from-purple-500/20 to-purple-500/5 text-purple-500 border-purple-500/20"
    };

    return (
        <div className={`bg-white/[0.02] border border-white/5 rounded-3xl p-6 backdrop-blur-xl shadow-2xl hover:shadow-primary/5 transition-all duration-300 ${className}`}>
            <div className="flex items-center gap-4 mb-6">
                {Icon && (
                    <div className={`p-4 rounded-2xl border ${colorClasses[iconColor] || colorClasses.primary} shadow-lg`}>
                        <Icon size={24} strokeWidth={2.5} />
                    </div>
                )}
                <div>
                    <h2 className="text-xl font-black text-on-surface tracking-tight">{title}</h2>
                    {subtitle && <p className="text-xs text-on-surface-variant/60 mt-1 font-medium">{subtitle}</p>}
                </div>
            </div>
            <div className="space-y-5">
                {children}
            </div>
        </div>
    );
};

const SettingsInput = ({ label, value, onChange, placeholder, type = "text", note, disabled = false, className = "" }: any) => (
    <div className={`space-y-2 ${className}`}>
        {label && <label className="text-xs font-bold text-on-surface-variant/70 px-1 uppercase tracking-wider">{label}</label>}
        <div className="relative group">
            <input
                type={type}
                value={value ?? ''}
                onChange={(e) => onChange(type === 'number' ? (parseInt(e.target.value) || 0) : e.target.value)}
                placeholder={placeholder}
                disabled={disabled}
                className="w-full bg-black/20 border border-white/10 rounded-2xl py-3 px-4 text-sm font-medium focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 focus:bg-black/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-white/30"
            />
        </div>
        {note && <p className="text-[10px] text-on-surface-variant/50 px-2 italic font-medium">{note}</p>}
    </div>
);

const SettingsToggle = ({ label, description, checked, onChange, color = "bg-primary" }: any) => (
    <div className={`flex items-center justify-between p-5 bg-white/[0.02] rounded-2xl border border-white/5 transition-all hover:border-white/10 hover:bg-white/[0.04] group`}>
        <div className="flex-1 pr-4">
            <p className="text-sm font-bold text-on-surface">{label}</p>
            {description && <p className="text-xs text-on-surface-variant/60 mt-1.5 leading-relaxed font-medium">{description}</p>}
        </div>
        <button
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all focus:outline-none ring-2 ring-offset-2 ring-offset-transparent ring-transparent flex-shrink-0 shadow-lg ${checked ? `${color} shadow-primary/30` : 'bg-white/10'} group-hover:scale-105`}
        >
            <span className={`${checked ? 'translate-x-6' : 'translate-x-1'} inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform`} />
        </button>
    </div>
);

const TabButton = ({ id, label, icon: Icon, active, onClick }: any) => (
    <button
        onClick={() => onClick(id)}
        className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl text-xs font-black transition-all whitespace-nowrap uppercase tracking-wider ${active
            ? 'bg-primary text-primary-foreground shadow-xl shadow-primary/30 scale-105'
            : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-white/5 hover:scale-102'
            }`}
    >
        <Icon size={16} strokeWidth={2.5} />
        <span>{label}</span>
    </button>
);

// --- Main Component ---

interface SettingsScreenProps {
    onLogout?: () => void;
}

export default function SettingsScreen({ onLogout }: SettingsScreenProps) {
    const [activeTab, setActiveTab] = useState<'terminal' | 'global' | 'security' | 'logs' | 'system' | 'account' | 'kafka' | 'info'>('terminal');
    const [serverUrl, setServerUrl] = useState(DockerClient.getServerUrl());
    const [message, setMessage] = useState('');
    const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null); // Original config
    const [form, setForm] = useState<SystemConfig | null>(null); // Editable config
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isShellOpen, setIsShellOpen] = useState(false);
    const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
    const [dbStatuses, setDbStatuses] = useState<any[]>([]);

    // Auth & 2FA state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [verifyPassword, setVerifyPassword] = useState('');
    const [updatingPassword, setUpdatingPassword] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [updatingUsername, setUpdatingUsername] = useState(false);
    const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetupResponse | null>(null);
    const [verificationCode, setVerificationCode] = useState('');
    const [configuring2FA, setConfiguring2FA] = useState(false);

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const data = await DockerClient.getSystemConfig();
            setSystemConfig(data);
            if (data) {
                // Initialize form with defaults where needed to avoid controlled/uncontrolled warnings
                setForm({
                    ...data,
                    clickhouseSettings: data.clickhouseSettings || {
                        enabled: false,
                        host: 'localhost',
                        port: 8123,
                        database: 'default',
                        user: 'default',
                        password: '',
                        batchSize: 5000,
                        flushIntervalMs: 5000
                    },
                    kafkaSettings: data.kafkaSettings || {
                        enabled: false,
                        bootstrapServers: 'localhost:9092',
                        adminHost: 'localhost:9092',
                        topic: 'ip-blocking-requests',
                        reputationTopic: 'ip-reputation-events',
                        groupId: 'docker-manager-jailer'
                    }
                });
            }

            const statuses = await DockerClient.getDatabaseStatus();
            setDbStatuses(statuses);

            const storage = await DockerClient.getStorageInfo();
            setStorageInfo(storage);
        } catch (e) {
            console.error(e);
            showMessage('Failed to load configuration');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConfig();
    }, []);

    const showMessage = (msg: string) => {
        setMessage(msg);
        setTimeout(() => setMessage(''), 3000);
    };

    const handleSaveServer = () => {
        DockerClient.setServerUrl(serverUrl);
        showMessage('Server URL saved successfully!');
        fetchConfig();
    };

    const updateForm = (key: keyof SystemConfig, value: any) => {
        if (!form) return;
        setForm(prev => ({ ...prev!, [key]: value }));
    };

    const updateNestedForm = (parent: 'clickhouseSettings' | 'kafkaSettings', key: string, value: any) => {
        if (!form) return;
        setForm(prev => ({
            ...prev!,
            [parent]: {
                ...(prev![parent] as any),
                [key]: value
            }
        }));
    };

    const handleSaveSystem = async () => {
        if (!form) return;
        setSaving(true);
        try {
            const result = await DockerClient.updateSystemConfig(form);
            if (result.success) {
                showMessage('System settings updated successfully!');
                fetchConfig();
            } else {
                showMessage('Failed to update system settings');
            }
        } catch (e) {
            console.error(e);
            showMessage('Error saving system settings');
        } finally {
            setSaving(false);
        }
    };

    // ... Auth handlers ...
    const handleUpdatePassword = async () => {
        if (newPassword !== verifyPassword) return showMessage('Passwords do not match');
        setUpdatingPassword(true);
        try {
            const result = await DockerClient.updatePassword({ currentPassword, newPassword });
            if (result.success) {
                showMessage('Password updated! Logging out...');
                setTimeout(() => onLogout?.(), 2000);
            } else {
                showMessage(result.message || 'Failed to update password');
            }
        } catch { showMessage('Error updating password'); } finally { setUpdatingPassword(false); }
    };

    const handleUpdateUsername = async () => {
        const trimmed = newUsername.trim();
        if (!trimmed) return showMessage('Username cannot be empty');
        setUpdatingUsername(true);
        try {
            const result = await DockerClient.updateUsername({ currentPassword, newUsername: trimmed });
            if (result.success) {
                showMessage('Username updated! Logging out...');
                setTimeout(() => onLogout?.(), 2000);
            } else {
                showMessage(result.message || 'Failed to update username');
                setCurrentPassword('');
            }
        } catch { showMessage('Error updating username'); } finally { setUpdatingUsername(false); }
    };

    const handleSetup2FA = async () => {
        try {
            const response = await DockerClient.setup2FA();
            setTwoFactorSetup(response);
        } catch { showMessage('Failed to initiate 2FA setup'); }
    };

    const handleEnable2FA = async () => {
        if (!twoFactorSetup) return;
        setConfiguring2FA(true);
        try {
            const result = await DockerClient.enable2FA({ secret: twoFactorSetup.secret, code: verificationCode });
            if (result.success) {
                showMessage('2FA enabled successfully!');
                setTwoFactorSetup(null);
                setVerificationCode('');
                fetchConfig();
            } else {
                showMessage(result.message || 'Invalid verification code');
            }
        } catch { showMessage('Error enabling 2FA'); } finally { setConfiguring2FA(false); }
    };

    const handleDisable2FA = async () => {
        const password = prompt("Please enter your current administrator password to disable 2FA:");
        if (!password) return;
        try {
            const result = await DockerClient.disable2FA(password);
            if (result.success) {
                showMessage('Two-factor authentication disabled.');
                fetchConfig();
            } else {
                showMessage(result.message || 'Failed to disable 2FA');
            }
        } catch { showMessage('Error disabling 2FA'); }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02] backdrop-blur-xl">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/5 rounded-2xl border border-primary/20">
                        <Settings2 size={28} className="text-primary" strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black tracking-tight">Settings</h1>
                        <p className="text-sm text-on-surface-variant/60 font-medium mt-0.5">System configuration and preferences</p>
                    </div>
                    {loading && <RefreshCw className="animate-spin text-primary ml-2" size={22} strokeWidth={2.5} />}
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchConfig}
                        className="p-3 hover:bg-white/5 rounded-2xl transition-all text-on-surface-variant hover:text-primary border border-white/5 hover:border-primary/30 shadow-lg hover:shadow-primary/20"
                        disabled={loading}
                        title="Refresh settings"
                    >
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} strokeWidth={2.5} />
                    </button>
                    {onLogout && (
                        <button
                            onClick={onLogout}
                            className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-2xl transition-all text-sm font-bold border border-red-500/20 shadow-lg hover:shadow-red-500/20 uppercase tracking-wider"
                        >
                            <LogOut size={16} strokeWidth={2.5} /> <span>Logout</span>
                        </button>
                    )}
                </div>
            </div>

            {message && (
                <div className="fixed top-6 right-6 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-2.5 bg-primary text-primary-foreground px-5 py-3 rounded-2xl shadow-2xl shadow-primary/50 font-bold text-sm border border-primary/20">
                        <CheckCircle size={20} strokeWidth={2.5} /> <span>{message}</span>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-2 px-6 pt-4 pb-2 overflow-x-auto scrollbar-thin">
                <TabButton id="terminal" label="Terminal" icon={Terminal} active={activeTab === 'terminal'} onClick={setActiveTab} />
                <TabButton id="global" label="Global" icon={Globe} active={activeTab === 'global'} onClick={setActiveTab} />
                <TabButton id="logs" label="Logs & Data" icon={Database} active={activeTab === 'logs'} onClick={setActiveTab} />
                <TabButton id="system" label="System" icon={Settings2} active={activeTab === 'system'} onClick={setActiveTab} />
                <TabButton id="account" label="Account" icon={Key} active={activeTab === 'account'} onClick={setActiveTab} />
                <TabButton id="kafka" label="Kafka" icon={RefreshCw} active={activeTab === 'kafka'} onClick={setActiveTab} />
                <TabButton id="info" label="Info" icon={Info} active={activeTab === 'info'} onClick={setActiveTab} />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {activeTab === 'terminal' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <SettingsCard title="Server Terminal" subtitle="Interactive web terminal" icon={Terminal}>
                            <div className="p-4 bg-surface/80 rounded-xl border border-outline/5">
                                <p className="text-sm text-on-surface leading-relaxed">External shell session to the host server.</p>
                            </div>
                            <div className="flex justify-center">
                                <button onClick={() => setIsShellOpen(true)} className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 shadow-lg text-sm">
                                    <Terminal size={18} /> <span>Launch Terminal</span>
                                </button>
                            </div>
                        </SettingsCard>
                    </div>
                )}

                {activeTab === 'global' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <SettingsCard title="Client Connection" subtitle="Manager server URL" icon={Server}>
                            <SettingsInput label="Server URL" value={serverUrl} onChange={setServerUrl} placeholder="http://core-server:9091" />
                            <div className="flex gap-3 pt-2">
                                <button onClick={handleSaveServer} className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 shadow-md text-sm">
                                    <Save size={16} /> <span>Save</span>
                                </button>
                                <button onClick={() => { setServerUrl("http://192.168.1.3:9091"); handleSaveServer(); }} className="flex-1 bg-surface border border-outline/20 text-on-surface font-semibold px-4 py-2.5 rounded-xl hover:bg-surface-variant text-sm">Reset</button>
                            </div>
                        </SettingsCard>

                        {form && (
                            <SettingsCard title="System Settings" subtitle="Core Docker configuration" icon={Settings2} iconColor="secondary">
                                <SettingsInput label="Docker Socket" value={form.dockerSocket} onChange={(v: string) => updateForm('dockerSocket', v)} />
                                <SettingsInput label="James Admin URL" value={form.jamesWebAdminUrl} onChange={(v: string) => updateForm('jamesWebAdminUrl', v)} />
                                <button onClick={handleSaveSystem} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-secondary text-secondary-foreground font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 shadow-md disabled:opacity-50 text-sm mt-2">
                                    {saving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />} <span>Apply Settings</span>
                                </button>
                            </SettingsCard>
                        )}
                    </div>
                )}


                {activeTab === 'logs' && form && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <SettingsCard title="ClickHouse Analytics" subtitle="High-performance warehousing" icon={Database} iconColor="blue-500">
                            <SettingsToggle label="Enable ClickHouse" description="Offload logs to ClickHouse" checked={form.clickhouseSettings.enabled} onChange={(v: boolean) => updateNestedForm('clickhouseSettings', 'enabled', v)} />
                            {form.clickhouseSettings.enabled && (
                                <div className="grid grid-cols-2 gap-4">
                                    <SettingsInput label="Host" value={form.clickhouseSettings.host} onChange={(v: string) => updateNestedForm('clickhouseSettings', 'host', v)} />
                                    <SettingsInput label="Port" value={form.clickhouseSettings.port} onChange={(v: number) => updateNestedForm('clickhouseSettings', 'port', v)} type="number" />
                                    <SettingsInput label="Database" value={form.clickhouseSettings.database} onChange={(v: string) => updateNestedForm('clickhouseSettings', 'database', v)} />
                                    <SettingsInput label="User" value={form.clickhouseSettings.user} onChange={(v: string) => updateNestedForm('clickhouseSettings', 'user', v)} />
                                    <SettingsInput label="Password" value={form.clickhouseSettings.password} onChange={(v: string) => updateNestedForm('clickhouseSettings', 'password', v)} type="password" />
                                    <SettingsInput label="Batch Size" value={form.clickhouseSettings.batchSize} onChange={(v: number) => updateNestedForm('clickhouseSettings', 'batchSize', v)} type="number" />
                                </div>
                            )}
                            <button onClick={handleSaveSystem} className="w-full mt-2 bg-primary text-primary-foreground py-2.5 rounded-xl font-semibold text-sm">Update ClickHouse</button>
                        </SettingsCard>
                    </div>
                )}

                {activeTab === 'system' && form && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Storage Info */}
                        <SettingsCard title="Storage & Build" subtitle="Disk usage and buildkit" icon={HardDrive} iconColor="amber-500">
                            <SettingsToggle label="BuildKit" description="Modern Docker build engine" checked={form.dockerBuildKit} onChange={(v: boolean) => updateForm('dockerBuildKit', v)} />
                            <SettingsToggle label="CLI Build" description="Use Docker CLI for compose" checked={form.dockerCliBuild} onChange={(v: boolean) => updateForm('dockerCliBuild', v)} />
                            <div className='h-px bg-outline/10 my-2' />
                            {storageInfo && (
                                <div className="space-y-3">
                                    <div className="flex justify-between text-xs font-bold uppercase text-on-surface-variant">
                                        <span>Use: {((storageInfo.used / storageInfo.total) * 100).toFixed(1)}%</span>
                                        <span>Free: {(storageInfo.free / 1024 / 1024 / 1024).toFixed(1)} GB</span>
                                    </div>
                                    <div className="h-2 w-full bg-surface-variant/20 rounded-full overflow-hidden">
                                        <div className="h-full bg-amber-500" style={{ width: `${(storageInfo.used / storageInfo.total) * 100}%` }} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-[10px] text-on-surface-variant">
                                        {storageInfo.dockerUsage && Object.entries(storageInfo.dockerUsage).map(([k, v]) => (
                                            <div key={k} className="p-2 bg-surface rounded border border-outline/5">{k}: {(Number(v) / 1024 / 1024).toFixed(1)} MB</div>
                                        ))}
                                    </div>
                                    <button onClick={async () => {
                                        try {
                                            await DockerClient.refreshStorageInfo();
                                            fetchConfig();
                                            showMessage('Storage info refreshed');
                                        } catch { showMessage('Failed to refresh storage'); }
                                    }} className="w-full flex items-center justify-center gap-2 bg-surface hover:bg-surface-variant border border-outline/10 py-1.5 rounded-lg text-xs font-semibold mt-2 transition-colors">
                                        <RefreshCw size={12} /> <span>Refresh Disk Usage</span>
                                    </button>
                                </div>
                            )}
                            <button onClick={handleSaveSystem} className="w-full mt-2 bg-primary text-primary-foreground py-2.5 rounded-xl font-semibold text-sm">Update Build Settings</button>
                        </SettingsCard>
                    </div>
                )}

                {activeTab === 'kafka' && form && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <SettingsCard title="Kafka Integration" subtitle="Event streaming" icon={RefreshCw} iconColor="blue-500">
                            <SettingsToggle label="Enable Consumer" description="Listen for blocking requests" checked={form.kafkaSettings.enabled} onChange={(v: boolean) => updateNestedForm('kafkaSettings', 'enabled', v)} />
                            <SettingsInput label="Bootstrap Servers" value={form.kafkaSettings.bootstrapServers} onChange={(v: string) => updateNestedForm('kafkaSettings', 'bootstrapServers', v)} />
                            <SettingsInput label="Admin Host" value={form.kafkaSettings.adminHost} onChange={(v: string) => updateNestedForm('kafkaSettings', 'adminHost', v)} />
                            <SettingsInput label="Topic" value={form.kafkaSettings.topic} onChange={(v: string) => updateNestedForm('kafkaSettings', 'topic', v)} />
                            <SettingsInput label="Reputation Topic" value={form.kafkaSettings.reputationTopic} onChange={(v: string) => updateNestedForm('kafkaSettings', 'reputationTopic', v)} />
                            <button onClick={handleSaveSystem} className="w-full mt-2 bg-primary text-primary-foreground py-2.5 rounded-xl font-semibold text-sm">Save Kafka Settings</button>
                        </SettingsCard>
                        <SettingsCard title="Message Format" subtitle="JSON payload structure" icon={Info}>
                            <p className="text-sm text-on-surface leading-relaxed mb-2"><strong>Block Request:</strong> Publish to Topic Name</p>
                            <pre className="p-4 bg-black/30 rounded-xl border border-white/5 font-mono text-[11px] text-blue-300 overflow-x-auto mb-4">
                                {`{
  "ip": "1.2.3.4",
  "durationMinutes": 30,
  "reason": "Suspicious activity"
}`}
                            </pre>
                            <p className="text-sm text-on-surface leading-relaxed mb-2"><strong>Reputation Event:</strong> Emitted on Reputation Topic</p>
                            <pre className="p-4 bg-black/30 rounded-xl border border-white/5 font-mono text-[11px] text-green-300 overflow-x-auto">
                                {`{
  "type": "BLOCK",
  "ip": "1.2.3.4",
  "timestamp": 1675862400000,
  "country": "US",
  "reason": "Path traversal",
  "tags": ["scanner"],
  "dangerTags": ["high-risk"]
}`}
                            </pre>
                        </SettingsCard>
                    </div>
                )}

                {activeTab === 'account' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <SettingsCard title="Account Security" subtitle="Credentials management" icon={Key} iconColor="red-500">
                            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2">Change Password</h3>
                            <input type="password" placeholder="Current Password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="w-full bg-surface border border-outline/20 rounded-xl px-3 py-2 text-sm mb-2" />
                            <input type="password" placeholder="New Password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full bg-surface border border-outline/20 rounded-xl px-3 py-2 text-sm mb-2" />
                            <input type="password" placeholder="Verify Password" value={verifyPassword} onChange={e => setVerifyPassword(e.target.value)} className="w-full bg-surface border border-outline/20 rounded-xl px-3 py-2 text-sm mb-2" />
                            <button onClick={handleUpdatePassword} disabled={updatingPassword} className="w-full bg-primary text-primary-foreground py-2 rounded-xl text-sm font-bold">Update Password</button>

                            <div className="h-px bg-outline/10 my-4" />

                            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2">Change Username</h3>
                            <input type="text" placeholder="New Username" value={newUsername} onChange={e => setNewUsername(e.target.value)} className="w-full bg-surface border border-outline/20 rounded-xl px-3 py-2 text-sm mb-2" />
                            <button onClick={handleUpdateUsername} disabled={updatingUsername} className="w-full bg-surface border border-outline/20 py-2 rounded-xl text-sm font-bold">Update Username</button>
                        </SettingsCard>

                        <SettingsCard title="Two-Factor Authentication" subtitle="TOTP Security" icon={ShieldCheck} iconColor="blue-500">
                            {systemConfig?.twoFactorEnabled ? (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-green-500 font-bold bg-green-500/10 p-3 rounded-xl"><CheckCircle size={16} /> 2FA Active</div>
                                    <button onClick={handleDisable2FA} className="w-full bg-red-500/10 text-red-500 py-2 rounded-xl text-sm font-bold">Disable 2FA</button>
                                </div>
                            ) : (
                                !twoFactorSetup ? (
                                    <button onClick={handleSetup2FA} className="w-full bg-blue-500 text-white py-2 rounded-xl text-sm font-bold">Setup 2FA</button>
                                ) : (
                                    <div className="space-y-4 text-center">
                                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(twoFactorSetup.qrUri)}`} className="mx-auto rounded-xl" />
                                        <p className="text-xs font-mono bg-surface p-2 rounded">{twoFactorSetup.secret}</p>
                                        <div className="flex gap-2">
                                            <input value={verificationCode} onChange={e => setVerificationCode(e.target.value)} placeholder="000000" className="flex-1 bg-surface border border-outline/20 rounded-xl px-3 py-2 text-center font-mono tracking-widest" maxLength={6} />
                                            <button onClick={handleEnable2FA} disabled={configuring2FA} className="bg-primary text-white px-4 rounded-xl text-sm font-bold">Enable</button>
                                        </div>
                                    </div>
                                )
                            )}
                        </SettingsCard>
                    </div>
                )}

                {activeTab === 'info' && (
                    <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <SettingsCard title="About" icon={Info}>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-surface/50 rounded-xl">Client Version: <span className="font-mono font-bold">{packageJson.version}</span></div>
                                <div className="p-4 bg-surface/50 rounded-xl">Server Version: <span className="font-mono font-bold">{systemConfig ? systemConfig.appVersion : '...'}</span></div>
                            </div>
                        </SettingsCard>
                    </div>
                )}
            </div>

            {isShellOpen && (
                <Modal onClose={() => setIsShellOpen(false)} title="Server Terminal" icon={<Terminal size={24} />} className="h-[80vh] flex flex-col" maxWidth="max-w-6xl">
                    <div className="flex-1 bg-black rounded-2xl overflow-hidden mt-4 border border-outline/10 p-2">
                        <WebShell url={`${DockerClient.getServerUrl()}/shell/server`} onClose={() => setIsShellOpen(false)} />
                    </div>
                </Modal>
            )}
        </div>
    );
}
