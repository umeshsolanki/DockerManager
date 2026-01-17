'use client';

import React, { useState, useEffect } from 'react';
import { Link, Save, CheckCircle, Info, Database, Server, Terminal, RefreshCw, Settings2, Globe, XCircle, ShieldCheck, Key, LogOut, Maximize2, Minimize2 } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { SystemConfig, TwoFactorSetupResponse } from '@/lib/types';
import dynamic from 'next/dynamic';
import packageJson from '../../../package.json';

const WebShell = dynamic(() => import('../Terminal'), { ssr: false });

interface SettingsScreenProps {
    onLogout?: () => void;
}

export default function SettingsScreen({ onLogout }: SettingsScreenProps) {
    const [activeTab, setActiveTab] = useState<'terminal' | 'connection' | 'account' | 'system' | 'info'>('terminal');
    const [serverUrl, setServerUrl] = useState(DockerClient.getServerUrl());
    const [dockerSocket, setDockerSocket] = useState('');
    const [jamesUrl, setJamesUrl] = useState('');
    const [message, setMessage] = useState('');
    const [config, setConfig] = useState<SystemConfig | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isShellOpen, setIsShellOpen] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

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

    // IP Geolocation state
    const [ipRangesCount, setIpRangesCount] = useState(0);
    const [showIpImportModal, setShowIpImportModal] = useState(false);
    const [ipCsv, setIpCsv] = useState('');
    const [importingIpRanges, setImportingIpRanges] = useState(false);
    const [dbStatuses, setDbStatuses] = useState<any[]>([]);

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const data = await DockerClient.getSystemConfig();
            setConfig(data);
            if (data) {
                setDockerSocket(data.dockerSocket);
                setJamesUrl(data.jamesWebAdminUrl);
            }

            // Also fetch IP ranges count
            const ipStats = await DockerClient.getIpRangeStats();
            setIpRangesCount(ipStats.totalRanges);

            // Fetch DB statuses
            const statuses = await DockerClient.getDatabaseStatus();
            setDbStatuses(statuses);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConfig();
    }, []);

    const handleSaveServer = () => {
        DockerClient.setServerUrl(serverUrl);
        setMessage('Server URL saved successfully!');
        setTimeout(() => setMessage(''), 3000);
        fetchConfig();
    };

    const handleSaveSystem = async () => {
        setSaving(true);
        try {
            const result = await DockerClient.updateSystemConfig({
                dockerSocket: dockerSocket,
                jamesWebAdminUrl: jamesUrl
            });
            if (result.success) {
                setMessage('System settings updated successfully!');
                fetchConfig();
            } else {
                setMessage('Failed to update system settings');
            }
        } catch (e) {
            console.error(e);
            setMessage('Error saving system settings');
        } finally {
            setSaving(false);
            setTimeout(() => setMessage(''), 3000);
        }
    };

    const handleUpdatePassword = async () => {
        if (newPassword !== verifyPassword) {
            setMessage('Passwords do not match');
            setTimeout(() => setMessage(''), 3000);
            return;
        }

        setUpdatingPassword(true);
        try {
            const result = await DockerClient.updatePassword({
                currentPassword,
                newPassword
            });
            if (result.success) {
                setMessage('Password updated successfully! Logging out...');
                setTimeout(() => onLogout?.(), 2000);
            } else {
                setMessage(result.message || 'Failed to update password');
                setTimeout(() => setMessage(''), 3000);
            }
        } catch (e) {
            setMessage('Error updating password');
            setTimeout(() => setMessage(''), 3000);
        } finally {
            setUpdatingPassword(false);
        }
    };

    const handleUpdateUsername = async () => {
        const trimmed = newUsername.trim();
        if (!trimmed) {
            setMessage('Username cannot be empty');
            return;
        }

        setUpdatingUsername(true);
        try {
            const result = await DockerClient.updateUsername({
                currentPassword,
                newUsername: trimmed
            });
            if (result.success) {
                setMessage('Username updated successfully! Logging out...');
                setTimeout(() => onLogout?.(), 2000);
            } else {
                setMessage(result.message || 'Failed to update username');
                setCurrentPassword(''); // Clear for retry
                setTimeout(() => setMessage(''), 3000);
            }
        } catch (e) {
            setMessage('Error updating username');
            setTimeout(() => setMessage(''), 3000);
        } finally {
            setUpdatingUsername(false);
        }
    };

    const handleSetup2FA = async () => {
        try {
            const response = await DockerClient.setup2FA();
            setTwoFactorSetup(response);
        } catch (e) {
            setMessage('Failed to initiate 2FA setup');
            setTimeout(() => setMessage(''), 3000);
        }
    };

    const handleEnable2FA = async () => {
        if (!twoFactorSetup) return;
        setConfiguring2FA(true);
        try {
            const result = await DockerClient.enable2FA({
                secret: twoFactorSetup.secret,
                code: verificationCode
            });
            if (result.success) {
                setMessage('2FA enabled successfully!');
                setTwoFactorSetup(null);
                setVerificationCode('');
                fetchConfig();
            } else {
                setMessage(result.message || 'Invalid verification code');
            }
        } catch (e) {
            setMessage('Error enabling 2FA');
        } finally {
            setConfiguring2FA(false);
            setTimeout(() => setMessage(''), 3000);
        }
    };

    const handleDisable2FA = async () => {
        const password = prompt("Please enter your current administrator password to disable 2FA:");
        if (!password) return;

        try {
            const result = await DockerClient.disable2FA(password);
            if (result.success) {
                setMessage('Two-factor authentication disabled.');
                fetchConfig();
            } else {
                setMessage(result.message || 'Failed to disable 2FA');
            }
        } catch (e) {
            setMessage('Error disabling 2FA');
        } finally {
            setTimeout(() => setMessage(''), 3000);
        }
    };

    const handleUseDefault = () => {
        const DEFAULT_URL = "http://192.168.1.3:9091";
        setServerUrl(DEFAULT_URL);
        DockerClient.setServerUrl(DEFAULT_URL);
        setMessage('Reset to default server URL');
        setTimeout(() => setMessage(''), 3000);
        fetchConfig();
    };

    const toggleFullscreen = () => {
        if (!isFullscreen) {
            const modal = document.getElementById('terminal-modal');
            if (modal?.requestFullscreen) {
                modal.requestFullscreen().then(() => setIsFullscreen(true));
            } else if ((modal as any)?.webkitRequestFullscreen) {
                (modal as any).webkitRequestFullscreen();
                setIsFullscreen(true);
            } else if ((modal as any)?.mozRequestFullScreen) {
                (modal as any).mozRequestFullScreen();
                setIsFullscreen(true);
            } else if ((modal as any)?.msRequestFullscreen) {
                (modal as any).msRequestFullscreen();
                setIsFullscreen(true);
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().then(() => setIsFullscreen(false));
            } else if ((document as any).webkitExitFullscreen) {
                (document as any).webkitExitFullscreen();
                setIsFullscreen(false);
            } else if ((document as any).mozCancelFullScreen) {
                (document as any).mozCancelFullScreen();
                setIsFullscreen(false);
            } else if ((document as any).msExitFullscreen) {
                (document as any).msExitFullscreen();
                setIsFullscreen(false);
            }
        }
    };

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement || !!(document as any).webkitFullscreenElement || !!(document as any).mozFullScreenElement || !!(document as any).msFullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
            document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
        };
    }, []);

    return (
        <div className="flex flex-col h-full overflow-y-auto pb-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold">Settings</h1>
                    {loading && <RefreshCw className="animate-spin text-primary" size={20} />}
                </div>
                <div className="flex items-center gap-2">
                    {onLogout && (
                        <button
                            onClick={onLogout}
                            className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl transition-all text-xs font-semibold border border-red-500/20"
                        >
                            <LogOut size={14} />
                            <span>Log Out</span>
                        </button>
                    )}
                    <button
                        onClick={fetchConfig}
                        className="p-2 hover:bg-surface rounded-xl transition-all text-on-surface-variant hover:text-primary border border-outline/10 hover:border-primary/20"
                        disabled={loading}
                        title="Refresh settings"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {message && (
                <div className="fixed top-6 right-6 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl shadow-lg font-semibold text-sm">
                        <CheckCircle size={18} />
                        <span>{message}</span>
                    </div>
                </div>
            )}

            {/* Tabs Navigation */}
            <div className="flex items-center gap-2 mb-4 border-b border-outline/10 pb-2 overflow-x-auto">
                <button
                    onClick={() => setActiveTab('terminal')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-xs font-semibold transition-all whitespace-nowrap ${activeTab === 'terminal'
                        ? 'bg-primary text-primary-foreground shadow-md border-b-2 border-primary'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface/50'
                        }`}
                >
                    <Terminal size={16} />
                    <span>Terminal</span>
                </button>
                <button
                    onClick={() => setActiveTab('connection')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-xs font-semibold transition-all whitespace-nowrap ${activeTab === 'connection'
                        ? 'bg-primary text-primary-foreground shadow-md border-b-2 border-primary'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface/50'
                        }`}
                >
                    <Server size={16} />
                    <span>Connection</span>
                </button>
                <button
                    onClick={() => setActiveTab('account')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-xs font-semibold transition-all whitespace-nowrap ${activeTab === 'account'
                        ? 'bg-primary text-primary-foreground shadow-md border-b-2 border-primary'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface/50'
                        }`}
                >
                    <Key size={16} />
                    <span>Account</span>
                </button>
                <button
                    onClick={() => setActiveTab('system')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-xs font-semibold transition-all whitespace-nowrap ${activeTab === 'system'
                        ? 'bg-primary text-primary-foreground shadow-md border-b-2 border-primary'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface/50'
                        }`}
                >
                    <Settings2 size={16} />
                    <span>System</span>
                </button>
                <button
                    onClick={() => setActiveTab('info')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-xs font-semibold transition-all whitespace-nowrap ${activeTab === 'info'
                        ? 'bg-primary text-primary-foreground shadow-md border-b-2 border-primary'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface/50'
                        }`}
                >
                    <Info size={16} />
                    <span>Info</span>
                </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto">
                {activeTab === 'terminal' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="bg-surface/50 border border-outline/10 rounded-2xl p-6 shadow-lg backdrop-blur-sm">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-primary/10 rounded-xl text-primary">
                                    <Terminal size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">Server Terminal</h2>
                                    <p className="text-xs text-on-surface-variant mt-0.5">Interactive web terminal for host management</p>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className="p-4 bg-surface/80 rounded-xl border border-outline/5">
                                    <p className="text-sm text-on-surface leading-relaxed">
                                        Launch an interactive terminal session to execute commands, manage files, and monitor system resources directly from your browser.
                                    </p>
                                </div>
                                <div className="flex justify-center">
                                    <button
                                        onClick={() => setIsShellOpen(true)}
                                        className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition-all active:scale-[0.98] shadow-lg shadow-primary/20 text-sm"
                                    >
                                        <Terminal size={18} />
                                        <span>Launch Terminal</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'connection' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Client Configuration */}
                        <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 shadow-lg backdrop-blur-sm">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-primary/10 rounded-xl text-primary">
                                    <Server size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">Client Connection</h2>
                                    <p className="text-xs text-on-surface-variant mt-0.5">Manager server URL</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-on-surface-variant px-1">Server URL</label>
                                    <div className="relative">
                                        <Link className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
                                        <input
                                            type="text"
                                            value={serverUrl}
                                            onChange={(e) => setServerUrl(e.target.value)}
                                            placeholder="http://192.168.1.100:9091"
                                            className="w-full bg-surface border border-outline/20 rounded-xl py-2.5 pl-11 pr-3 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={handleSaveServer}
                                        className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition-all active:scale-[0.98] shadow-md shadow-primary/20 text-sm"
                                    >
                                        <Save size={16} />
                                        <span>Save</span>
                                    </button>
                                    <button
                                        onClick={handleUseDefault}
                                        className="flex-1 flex items-center justify-center gap-2 bg-surface border border-outline/20 text-on-surface font-semibold px-4 py-2.5 rounded-xl hover:bg-surface-variant transition-all active:scale-[0.98] text-sm"
                                    >
                                        <span>Reset</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* System Configuration (Server-side) */}
                        <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 shadow-lg backdrop-blur-sm">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-secondary/10 rounded-xl text-secondary">
                                    <Settings2 size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">System Settings</h2>
                                    <p className="text-xs text-on-surface-variant mt-0.5">Server configuration</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-on-surface-variant px-1">Docker Socket</label>
                                    <div className="relative">
                                        <Database className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
                                        <input
                                            type="text"
                                            value={dockerSocket}
                                            onChange={(e) => setDockerSocket(e.target.value)}
                                            placeholder="/var/run/docker.sock"
                                            className="w-full bg-surface border border-outline/20 rounded-xl py-2.5 pl-11 pr-3 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-on-surface-variant px-1">James Admin URL</label>
                                    <div className="relative">
                                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
                                        <input
                                            type="text"
                                            value={jamesUrl}
                                            onChange={(e) => setJamesUrl(e.target.value)}
                                            placeholder="http://localhost:8001"
                                            className="w-full bg-surface border border-outline/20 rounded-xl py-2.5 pl-11 pr-3 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                                        />
                                    </div>
                                </div>

                                <button
                                    onClick={handleSaveSystem}
                                    disabled={saving || loading}
                                    className="w-full flex items-center justify-center gap-2 bg-secondary text-secondary-foreground font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition-all active:scale-[0.98] shadow-md shadow-secondary/20 disabled:opacity-50 text-sm mt-2"
                                >
                                    {saving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                                    <span>Apply Settings</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'account' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Authentication Management */}
                        <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 shadow-lg backdrop-blur-sm">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-red-500/10 rounded-xl text-red-500">
                                    <Key size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">Account Security</h2>
                                    <p className="text-xs text-on-surface-variant mt-0.5">Password & username</p>
                                </div>
                            </div>

                            <div className="space-y-5">
                                {/* Password Section */}
                                <div className="space-y-3">
                                    <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Change Password</h3>
                                    <div className="space-y-3">
                                        <input
                                            type="password"
                                            placeholder="Current Password"
                                            value={currentPassword}
                                            onChange={(e) => setCurrentPassword(e.target.value)}
                                            className="w-full bg-surface border border-outline/20 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                                        />
                                        <input
                                            type="password"
                                            placeholder="New Password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            className="w-full bg-surface border border-outline/20 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                                        />
                                        <input
                                            type="password"
                                            placeholder="Verify New Password"
                                            value={verifyPassword}
                                            onChange={(e) => setVerifyPassword(e.target.value)}
                                            className="w-full bg-surface border border-outline/20 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                                        />
                                        <button
                                            onClick={handleUpdatePassword}
                                            disabled={updatingPassword || !newPassword || !currentPassword}
                                            className="w-full bg-primary text-primary-foreground py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50 shadow-lg shadow-primary/20 active:scale-[0.98]"
                                        >
                                            {updatingPassword ? 'Updating...' : 'Update Password'}
                                        </button>
                                    </div>
                                </div>

                                <div className="h-px bg-outline/10" />

                                {/* Username Section */}
                                <div className="space-y-3">
                                    <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Change Username</h3>
                                    <div className="p-3 bg-blue-500/5 rounded-xl border border-blue-500/10">
                                        <p className="text-xs text-blue-300 font-medium">
                                            Current Username: <span className="text-white font-bold uppercase ml-1">{config?.username || 'admin'}</span>
                                        </p>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="New Username"
                                        value={newUsername}
                                        onChange={(e) => setNewUsername(e.target.value)}
                                        className="w-full bg-surface border border-outline/20 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                                    />
                                    <button
                                        onClick={handleUpdateUsername}
                                        disabled={updatingUsername || !newUsername || !currentPassword}
                                        className="w-full bg-surface border border-outline/30 text-on-surface py-2.5 rounded-xl font-semibold text-sm hover:bg-white/5 transition-all disabled:opacity-50 active:scale-[0.98]"
                                    >
                                        {updatingUsername ? 'Updating...' : 'Update Username'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* 2FA Configuration */}
                        <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 shadow-lg backdrop-blur-sm">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
                                    <ShieldCheck size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">Two-Factor Authentication</h2>
                                    <p className="text-xs text-on-surface-variant mt-0.5">Extra security layer</p>
                                </div>
                            </div>

                            {config?.twoFactorEnabled ? (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 p-4 bg-green-500/10 rounded-xl border border-green-500/20">
                                        <ShieldCheck size={18} className="text-green-500" />
                                        <span className="text-xs font-semibold text-green-500 uppercase tracking-wider">Active & Secure</span>
                                    </div>
                                    <p className="text-sm text-on-surface-variant leading-relaxed">
                                        Your account is protected with two-factor authentication. You will be prompted for a security code when logging in from remote locations.
                                    </p>
                                    <button
                                        onClick={handleDisable2FA}
                                        className="w-full bg-red-500/10 text-red-500 py-2.5 rounded-xl font-semibold text-sm hover:bg-red-500/20 transition-all border border-red-500/20 active:scale-[0.98]"
                                    >
                                        Disable 2FA
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {!twoFactorSetup ? (
                                        <div className="space-y-4">
                                            <p className="text-sm text-on-surface-variant leading-relaxed">
                                                Add an extra layer of security by enabling TOTP-based two-factor authentication. Use an authenticator app like Google Authenticator or Authy.
                                            </p>
                                            <button
                                                onClick={handleSetup2FA}
                                                className="w-full bg-blue-500 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-600 transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98]"
                                            >
                                                Configure 2FA
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                            <p className="text-xs font-semibold text-center text-on-surface-variant uppercase tracking-wider">Setup Verification</p>
                                            <div className="bg-white p-4 rounded-2xl mx-auto w-fit shadow-xl shadow-black/20">
                                                <img
                                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(twoFactorSetup.qrUri)}`}
                                                    alt="2FA QR Code"
                                                    className="w-40 h-40"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between px-1">
                                                    <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Manual Secret</label>
                                                    <span className="text-[10px] text-blue-400 font-semibold uppercase">Base32</span>
                                                </div>
                                                <code className="block bg-surface p-3 rounded-xl text-xs break-all font-mono border border-outline/10 text-primary/80">
                                                    {twoFactorSetup.secret}
                                                </code>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        placeholder="000 000"
                                                        value={verificationCode}
                                                        onChange={(e) => setVerificationCode(e.target.value)}
                                                        className="flex-1 bg-surface border border-outline/20 rounded-xl py-2.5 px-3 text-sm font-mono text-center tracking-[0.3em] font-bold focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                                        maxLength={6}
                                                    />
                                                    <button
                                                        onClick={handleEnable2FA}
                                                        disabled={configuring2FA || verificationCode.length !== 6}
                                                        className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition-all"
                                                    >
                                                        Enable
                                                    </button>
                                                </div>
                                                <p className="text-xs text-on-surface-variant/60 text-center italic">
                                                    Tip: Ensure your phone&apos;s time is synchronized with the network.
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => setTwoFactorSetup(null)}
                                                className="w-full text-xs text-on-surface-variant hover:text-red-400 transition-colors uppercase font-semibold tracking-wider pt-1"
                                            >
                                                Cancel Setup
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'system' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Environment Information */}
                        <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 shadow-lg backdrop-blur-sm">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-500">
                                    <Info size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">Environment</h2>
                                    <p className="text-xs text-on-surface-variant mt-0.5">System configuration</p>
                                </div>
                            </div>

                            {config ? (
                                <div className="grid grid-cols-1 gap-3">
                                    <div className="p-4 bg-surface/80 rounded-xl border border-outline/5 overflow-hidden">
                                        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Docker Binary</p>
                                        <p className="text-on-surface font-mono text-sm truncate" title={config.dockerCommand}>{config.dockerCommand}</p>
                                    </div>
                                    <div className="p-4 bg-surface/80 rounded-xl border border-outline/5 overflow-hidden">
                                        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Docker Compose</p>
                                        <p className="text-on-surface font-mono text-sm truncate" title={config.dockerComposeCommand}>{config.dockerComposeCommand}</p>
                                    </div>
                                    <div className="p-4 bg-surface/80 rounded-xl border border-outline/5 overflow-hidden">
                                        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Data Root</p>
                                        <p className="text-on-surface font-mono text-sm truncate" title={config.dataRoot}>{config.dataRoot}</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-8 text-center">
                                    <p className="text-sm text-on-surface-variant italic">No server information available.</p>
                                </div>
                            )}
                        </div>

                        {/* Storage Configuration */}
                        <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 shadow-lg backdrop-blur-sm">
                            <div className="flex items-center gap-3 mb-4">
                                <div className={`p-3 rounded-xl ${config?.storageBackend === 'database' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-primary/10 text-primary'}`}>
                                    <Database size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">Storage Configuration</h2>
                                    <p className="text-xs text-on-surface-variant mt-0.5">Manage application data storage</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-surface/80 rounded-xl border border-outline/5 mb-4">
                                <div>
                                    <p className="text-sm font-semibold text-on-surface">Storage Backend</p>
                                    <p className="text-xs text-on-surface-variant mt-1">Primary source for settings and configurations</p>
                                </div>
                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${config?.storageBackend === 'database' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-primary/10 text-primary border-primary/20'}`}>
                                    <Database size={14} />
                                    <span className="text-xs font-bold uppercase tracking-wider">
                                        {config?.storageBackend === 'database' ? 'PostgreSQL Database' : 'Local File JSON'}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                {config?.storageBackend === 'database' ? (
                                    <button
                                        className="flex items-center justify-center gap-2 bg-red-500/10 text-red-500 border border-red-500/20 py-2.5 rounded-xl font-semibold text-sm hover:bg-red-500/20 transition-all active:scale-[0.98]"
                                        onClick={async () => {
                                            if (confirm("Are you sure you want to disconnect from Database and switch back to File storage?")) {
                                                setLoading(true);
                                                try {
                                                    const res = await DockerClient.switchToPostgresFileStorage();
                                                    if (res.success) {
                                                        setMessage('Switched to file storage successfully');
                                                        fetchConfig();
                                                    } else {
                                                        alert(res.message || 'Failed to switch storage');
                                                    }
                                                } catch (e) {
                                                    console.error(e);
                                                } finally {
                                                    setLoading(false);
                                                }
                                            }
                                        }}
                                    >
                                        <RefreshCw size={16} />
                                        <span>Switch to File</span>
                                    </button>
                                ) : (
                                    <button
                                        className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] ${dbStatuses.find(s => s.type === 'postgres' && s.isInstalled)
                                                ? 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-lg shadow-indigo-500/20'
                                                : 'bg-surface text-on-surface border border-outline/20 opacity-50 cursor-not-allowed'
                                            }`}
                                        disabled={!dbStatuses.find(s => s.type === 'postgres' && s.isInstalled)}
                                        onClick={async () => {
                                            if (confirm("Switch to Database storage? This will use the existing PostgreSQL installation.")) {
                                                setLoading(true);
                                                try {
                                                    const res = await DockerClient.switchToPostgresDbStorage();
                                                    if (res.success) {
                                                        setMessage('Switched to database storage successfully');
                                                        fetchConfig();
                                                    } else {
                                                        alert(res.message || 'Failed to switch storage. Ensure you have a valid database config.');
                                                    }
                                                } catch (e) {
                                                    console.error(e);
                                                } finally {
                                                    setLoading(false);
                                                }
                                            }
                                        }}
                                        title={dbStatuses.find(s => s.type === 'postgres' && s.isInstalled) ? "Switch back to using PostgreSQL for settings" : "Use the DB management screen to install/enable database"}
                                    >
                                        <Database size={16} />
                                        <span>Switch to DB</span>
                                    </button>
                                )}
                                <button
                                    className="flex items-center justify-center gap-2 bg-surface text-on-surface border border-outline/20 py-2.5 rounded-xl font-semibold text-sm hover:bg-surface-variant transition-all active:scale-[0.98]"
                                    onClick={fetchConfig}
                                >
                                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                                    <span>Sync Settings</span>
                                </button>
                            </div>
                        </div>

                        {/* IP Geolocation Card */}
                        <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 shadow-lg backdrop-blur-sm mt-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-secondary/10 rounded-xl text-secondary">
                                    <Globe size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">IP Geolocation Data</h2>
                                    <p className="text-xs text-on-surface-variant mt-0.5">Identify visitor country and ISP</p>
                                </div>
                            </div>

                            <div className="p-4 bg-surface/80 rounded-xl border border-outline/5 flex items-center justify-between mb-4">
                                <div>
                                    <p className="text-sm font-semibold text-on-surface">Imported Ranges</p>
                                    <p className="text-xs text-on-surface-variant mt-1">Total identified IP blocks in database</p>
                                </div>
                                <div className="bg-secondary/10 px-3 py-1.5 rounded-lg border border-secondary/20">
                                    <span className="text-sm font-bold text-secondary">
                                        {ipRangesCount.toLocaleString()}
                                    </span>
                                </div>
                            </div>

                            <button
                                className="w-full flex items-center justify-center gap-2 bg-on-surface text-surface py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 transition-all active:scale-[0.98] mb-4"
                                onClick={() => setShowIpImportModal(true)}
                            >
                                <Save size={16} />
                                <span>Paste & Import CSV</span>
                            </button>

                            <div className="pt-4 border-t border-outline/5">
                                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">Auto-Fetch Public Cloud Ranges</p>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { id: 'cloudflare', name: 'Cloudflare', color: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
                                        { id: 'aws', name: 'AWS', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
                                        { id: 'google', name: 'Google', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
                                        { id: 'digitalocean', name: 'DO', color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' }
                                    ].map((provider) => (
                                        <button
                                            key={provider.id}
                                            disabled={importingIpRanges}
                                            onClick={async () => {
                                                setImportingIpRanges(true);
                                                try {
                                                    const res = await DockerClient.fetchIpRanges(provider.id as any) as any;
                                                    if (res.status === 'success') {
                                                        alert(`Successfully fetched ${res.imported} ranges from ${provider.name}!`);
                                                        fetchConfig();
                                                    } else {
                                                        alert(res.error || `Failed to fetch ${provider.name} ranges`);
                                                    }
                                                } catch (e) {
                                                    console.error(e);
                                                    alert(`Error fetching ${provider.name} ranges`);
                                                } finally {
                                                    setImportingIpRanges(false);
                                                }
                                            }}
                                            className={`flex items-center justify-center py-2 px-1 rounded-lg border text-[10px] font-bold transition-all active:scale-95 disabled:opacity-50 ${provider.color}`}
                                        >
                                            {provider.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-4 mt-4 border-t border-outline/5">
                                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">Fetch from Custom CSV URL</p>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="https://example.com/ips.csv"
                                        className="flex-1 bg-surface border border-outline/10 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-secondary transition-all"
                                        id="custom-ip-url"
                                    />
                                    <button
                                        onClick={async () => {
                                            const url = (document.getElementById('custom-ip-url') as HTMLInputElement).value;
                                            if (!url) return alert('Please enter a URL');
                                            setImportingIpRanges(true);
                                            try {
                                                const res = await DockerClient.fetchIpRanges('custom', url) as any;
                                                if (res.status === 'success') {
                                                    alert(`Successfully fetched ${res.imported} ranges!`);
                                                    fetchConfig();
                                                } else {
                                                    alert(res.error || 'Failed to fetch custom ranges');
                                                }
                                            } catch (e) {
                                                console.error(e);
                                                alert('Error fetching custom ranges');
                                            } finally {
                                                setImportingIpRanges(false);
                                            }
                                        }}
                                        disabled={importingIpRanges}
                                        className="bg-secondary text-on-secondary px-3 py-1.5 rounded-lg text-xs font-bold hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        Fetch
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'info' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Version Info */}
                        <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 shadow-lg backdrop-blur-sm">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-purple-500/10 rounded-xl text-purple-500">
                                    <Info size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">Application Version</h2>
                                    <p className="text-xs text-on-surface-variant mt-0.5">Client & server versions</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 bg-surface/80 rounded-xl border border-outline/5 flex items-center justify-between">
                                    <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Client</p>
                                    <p className="text-sm font-mono font-bold text-on-surface">v{packageJson.version}</p>
                                </div>
                                <div className="p-4 bg-surface/80 rounded-xl border border-outline/5 flex items-center justify-between">
                                    <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Server</p>
                                    <p className="text-sm font-mono font-bold text-on-surface">{config ? `v${config.appVersion}` : 'Checking...'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {isShellOpen && (
                <div
                    id="terminal-modal"
                    className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md transition-all ${isFullscreen ? 'p-0' : 'p-4'
                        }`}
                >
                    <div className={`bg-surface border border-outline/20 overflow-hidden flex flex-col shadow-2xl animate-in zoom-in duration-300 ${isFullscreen
                        ? 'w-full h-full rounded-none'
                        : 'rounded-3xl w-full max-w-6xl h-[90vh]'
                        }`}>
                        <div className="p-5 border-b border-outline/10 flex items-center justify-between bg-surface/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-xl text-primary">
                                    <Terminal size={20} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold">Server Terminal</h2>
                                    <p className="text-xs text-on-surface-variant mt-0.5">Interactive shell session</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={toggleFullscreen}
                                    className="p-2 hover:bg-white/10 rounded-xl transition-all active:scale-95"
                                    title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                                >
                                    {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                                </button>
                                <button
                                    onClick={() => {
                                        setIsShellOpen(false);
                                        setIsFullscreen(false);
                                        if (document.fullscreenElement) {
                                            document.exitFullscreen();
                                        }
                                    }}
                                    className="p-2 hover:bg-white/10 rounded-xl transition-all active:scale-95"
                                    title="Close terminal"
                                >
                                    <XCircle size={20} />
                                </button>
                            </div>
                        </div>
                        <div className={`flex-1 bg-black ${isFullscreen ? 'p-2' : 'p-4'}`}>
                            <WebShell url={`${DockerClient.getServerUrl()}/shell/server`} onClose={() => {
                                setIsShellOpen(false);
                                setIsFullscreen(false);
                                if (document.fullscreenElement) {
                                    document.exitFullscreen();
                                }
                            }} />
                        </div>
                    </div>
                </div>
            )}

            {/* IP Import Modal */}
            {showIpImportModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm">
                    <div className="bg-surface border border-outline/10 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                        <div className="p-6 border-b border-outline/10 flex items-center justify-between bg-on-surface/[0.02]">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-secondary/10 rounded-xl text-secondary">
                                    <Globe size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg">Import IP Range Data</h3>
                                    <p className="text-xs text-on-surface-variant">CSV: cidr, country_code, country_name, provider, type</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowIpImportModal(false)}
                                className="p-2 hover:bg-white/5 rounded-full transition-colors"
                            >
                                <XCircle size={24} className="text-on-surface-variant" />
                            </button>
                        </div>

                        <div className="p-6">
                            <div className="mb-4">
                                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                                    CSV Content (One range per line)
                                </label>
                                <textarea
                                    className="w-full h-80 bg-on-surface/5 border border-outline/10 rounded-2xl p-4 text-sm font-mono focus:outline-none focus:border-secondary/50 focus:bg-on-surface/[0.08] transition-all resize-none"
                                    placeholder="8.8.8.0/24, US, United States, Google, hosting&#10;1.1.1.0/24, AU, Australia, Cloudflare, hosting"
                                    value={ipCsv}
                                    onChange={(e) => setIpCsv(e.target.value)}
                                />
                            </div>

                            <div className="flex items-center gap-3 bg-secondary/5 p-4 rounded-2xl border border-secondary/10 mb-6 text-on-surface-variant">
                                <Info size={20} className="text-secondary shrink-0" />
                                <p className="text-xs leading-relaxed">
                                    IPv4 and IPv6 CIDR notations are supported. The system will skip empty or invalid lines. Large imports may take a moment.
                                </p>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    className="flex-1 bg-on-surface text-surface py-3.5 rounded-2xl font-bold text-sm hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    disabled={importingIpRanges || !ipCsv.trim()}
                                    onClick={async () => {
                                        setImportingIpRanges(true);
                                        try {
                                            const res = await DockerClient.importIpRanges(ipCsv) as any;
                                            if (res.status === 'success') {
                                                alert(`Successfully imported ${res.imported} ranges!`);
                                                setShowIpImportModal(false);
                                                setIpCsv('');
                                                fetchConfig();
                                            } else {
                                                alert(res.error || 'Failed to import ranges');
                                            }
                                        } catch (e) {
                                            console.error(e);
                                            alert('An error occurred during import');
                                        } finally {
                                            setImportingIpRanges(false);
                                        }
                                    }}
                                >
                                    {importingIpRanges ? (
                                        <RefreshCw size={18} className="animate-spin" />
                                    ) : (
                                        <Save size={18} />
                                    )}
                                    <span>{importingIpRanges ? 'Importing...' : 'Confirm Import'}</span>
                                </button>
                                <button
                                    className="px-6 py-3.5 bg-on-surface/5 text-on-surface rounded-2xl font-bold text-sm hover:bg-on-surface/10 transition-all"
                                    onClick={() => setShowIpImportModal(false)}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

