'use client';

import React, { useState, useEffect } from 'react';
import { Link, Save, CheckCircle, Info, Database, Server, Terminal, RefreshCw, Settings2, Globe, XCircle, ShieldCheck, Key, LogOut, Maximize2, Minimize2 } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { SystemConfig, TwoFactorSetupResponse, StorageInfo } from '@/lib/types';
import dynamic from 'next/dynamic';
import packageJson from '../../../package.json';

import { Modal } from '../ui/Modal';

const WebShell = dynamic(() => import('../Terminal'), { ssr: false });

interface SettingsScreenProps {
    onLogout?: () => void;
}

export default function SettingsScreen({ onLogout }: SettingsScreenProps) {
    const [activeTab, setActiveTab] = useState<'terminal' | 'connection' | 'account' | 'system' | 'info'>('terminal');
    const [serverUrl, setServerUrl] = useState(DockerClient.getServerUrl());
    const [dockerSocket, setDockerSocket] = useState('');
    const [jamesUrl, setJamesUrl] = useState('');
    const [dockerBuildKit, setDockerBuildKit] = useState(true);
    const [dockerCliBuild, setDockerCliBuild] = useState(true);
    const [autoStorageRefresh, setAutoStorageRefresh] = useState(false);
    const [autoStorageRefreshInterval, setAutoStorageRefreshInterval] = useState(15);
    const [kafkaEnabled, setKafkaEnabled] = useState(false);
    const [kafkaBootstrap, setKafkaBootstrap] = useState('localhost:9092');
    const [kafkaAdminHost, setKafkaAdminHost] = useState('localhost:9092');
    const [kafkaTopic, setKafkaTopic] = useState('ip-blocking-requests');
    const [kafkaGroupId, setKafkaGroupId] = useState('docker-manager-jailer');
    const [message, setMessage] = useState('');
    const [config, setConfig] = useState<SystemConfig | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isShellOpen, setIsShellOpen] = useState(false);
    const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);

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
                setDockerBuildKit(data.dockerBuildKit);
                setDockerCliBuild(data.dockerCliBuild);
                setAutoStorageRefresh(data.autoStorageRefresh);
                setAutoStorageRefreshInterval(data.autoStorageRefreshIntervalMinutes);
                if (data.kafkaSettings) {
                    setKafkaEnabled(data.kafkaSettings.enabled);
                    setKafkaBootstrap(data.kafkaSettings.bootstrapServers);
                    setKafkaAdminHost(data.kafkaSettings.adminHost);
                    setKafkaTopic(data.kafkaSettings.topic);
                    setKafkaGroupId(data.kafkaSettings.groupId);
                }
            }

            // Also fetch IP ranges count
            const ipStats = await DockerClient.getIpRangeStats();
            setIpRangesCount(ipStats.totalRanges);

            // Fetch DB statuses
            const statuses = await DockerClient.getDatabaseStatus();
            setDbStatuses(statuses);

            // Fetch Storage Info
            const storage = await DockerClient.getStorageInfo();
            setStorageInfo(storage);
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
                jamesWebAdminUrl: jamesUrl,
                dockerBuildKit: dockerBuildKit,
                dockerCliBuild: dockerCliBuild,
                autoStorageRefresh: autoStorageRefresh,
                autoStorageRefreshIntervalMinutes: autoStorageRefreshInterval,
                kafkaSettings: {
                    enabled: kafkaEnabled,
                    bootstrapServers: kafkaBootstrap,
                    adminHost: kafkaAdminHost,
                    topic: kafkaTopic,
                    groupId: kafkaGroupId
                }
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
                <button
                    onClick={() => setActiveTab('kafka' as any)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-xs font-semibold transition-all whitespace-nowrap ${activeTab === 'kafka' as any
                        ? 'bg-primary text-primary-foreground shadow-md border-b-2 border-primary'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface/50'
                        }`}
                >
                    <RefreshCw size={16} />
                    <span>Kafka</span>
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

                        {/* Disk Usage & Available Storage */}
                        <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 shadow-lg backdrop-blur-sm lg:col-span-2">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500">
                                    <Maximize2 size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">Disk & Storage</h2>
                                    <p className="text-xs text-on-surface-variant mt-0.5">Physical storage and data root usage</p>
                                </div>
                                <div className="flex-1" />
                                <button
                                    onClick={async () => {
                                        const res = await DockerClient.refreshStorageInfo();
                                        if (res.status === 'success') {
                                            alert(res.message);
                                            // Optional: trigger a re-fetch of current data after a short delay
                                            setTimeout(async () => {
                                                const storage = await DockerClient.getStorageInfo();
                                                setStorageInfo(storage);
                                            }, 2000);
                                        } else {
                                            alert(res.message);
                                        }
                                    }}
                                    className="flex items-center gap-2 bg-on-surface/5 hover:bg-on-surface/10 text-on-surface px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all active:scale-95"
                                >
                                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                                    <span>Force Sync</span>
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <div className="p-4 bg-surface/80 rounded-xl border border-outline/5 relative overflow-hidden group">
                                    <div className="relative z-10">
                                        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Total Capacity</p>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-2xl font-black text-on-surface">
                                                {storageInfo ? (storageInfo.total / (1024 * 1024 * 1024)).toFixed(1) : '0.0'}
                                            </span>
                                            <span className="text-sm font-bold text-on-surface-variant">GB</span>
                                        </div>
                                    </div>
                                    <Server className="absolute -right-2 -bottom-2 text-on-surface/[0.03] rotate-12 transition-transform group-hover:scale-110" size={80} />
                                </div>

                                <div className="p-4 bg-surface/80 rounded-xl border border-outline/5 relative overflow-hidden group">
                                    <div className="relative z-10">
                                        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Available Space</p>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-2xl font-black text-green-500">
                                                {storageInfo ? (storageInfo.free / (1024 * 1024 * 1024)).toFixed(1) : '0.0'}
                                            </span>
                                            <span className="text-sm font-bold text-on-surface-variant">GB</span>
                                        </div>
                                    </div>
                                    <CheckCircle className="absolute -right-2 -bottom-2 text-green-500/[0.05] rotate-12 transition-transform group-hover:scale-110" size={80} />
                                </div>

                                <div className="p-4 bg-surface/80 rounded-xl border border-outline/5 relative overflow-hidden group">
                                    <div className="relative z-10">
                                        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Data Root (DU)</p>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-2xl font-black text-primary">
                                                {storageInfo ? (storageInfo.dataRootSize / (1024 * 1024)).toFixed(1) : '0.0'}
                                            </span>
                                            <span className="text-sm font-bold text-on-surface-variant">MB</span>
                                        </div>
                                    </div>
                                    <Database className="absolute -right-2 -bottom-2 text-primary/[0.05] rotate-12 transition-transform group-hover:scale-110" size={80} />
                                </div>
                            </div>

                            {storageInfo && (
                                <div className="space-y-4">
                                    {/* Usage Bar */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1">
                                            <span>Filesystem Usage</span>
                                            <span className={((storageInfo.used / storageInfo.total) * 100) > 90 ? 'text-red-500' : ''}>
                                                {((storageInfo.used / storageInfo.total) * 100).toFixed(1)}% Used
                                            </span>
                                        </div>
                                        <div className="h-2.5 w-full bg-surface-variant/20 rounded-full overflow-hidden border border-outline/5">
                                            <div
                                                className={`h-full transition-all duration-1000 ${((storageInfo.used / storageInfo.total) * 100) > 90 ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]' : 'bg-primary'
                                                    }`}
                                                style={{ width: `${(storageInfo.used / storageInfo.total) * 100}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Path Info */}
                                    <div className="flex items-center gap-2 p-3 bg-surface/40 rounded-xl border border-outline/5 font-mono text-[10px] text-on-surface-variant">
                                        <Info size={12} className="shrink-0" />
                                        <span className="truncate">Root Path: {storageInfo.dataRootPath}</span>
                                    </div>

                                    {/* System Disks List */}
                                    {storageInfo.partitions.length > 0 && (
                                        <div className="pt-4 border-t border-outline/10">
                                            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-3 px-1">Host Partitions</p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {storageInfo.partitions.map((p, idx) => (
                                                    <div key={idx} className="p-3 bg-black/20 rounded-xl border border-outline/5 hover:border-outline/20 transition-all group">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <Server size={12} className="text-secondary" />
                                                                <span className="text-xs font-bold font-mono text-on-surface group-hover:text-secondary transition-colors">{p.path}</span>
                                                            </div>
                                                            <span className={`text-[10px] font-bold ${p.usagePercentage > 90 ? 'text-red-500' : 'text-on-surface-variant'}`}>
                                                                {p.usagePercentage.toFixed(1)}%
                                                            </span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-surface-variant/20 rounded-full overflow-hidden mb-1.5">
                                                            <div
                                                                className={`h-full transition-all duration-700 ${p.usagePercentage > 90 ? 'bg-red-500' : 'bg-secondary'}`}
                                                                style={{ width: `${p.usagePercentage}%` }}
                                                            />
                                                        </div>
                                                        <div className="flex justify-between text-[9px] font-mono text-on-surface-variant/70">
                                                            <span>{(p.used / (1024 * 1024 * 1024)).toFixed(1)} GB Used</span>
                                                            <span>{(p.total / (1024 * 1024 * 1024)).toFixed(1)} GB Total</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Docker Usage Statistics */}
                                    {storageInfo.dockerUsage && (
                                        <div className="pt-4 border-t border-outline/10">
                                            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-3 px-1">Docker System Usage</p>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                                {[
                                                    { label: 'Images', size: storageInfo.dockerUsage.imagesSize, color: 'text-blue-400', bg: 'bg-blue-400/10' },
                                                    { label: 'Containers', size: storageInfo.dockerUsage.containersSize, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
                                                    { label: 'Volumes', size: storageInfo.dockerUsage.volumesSize, color: 'text-amber-400', bg: 'bg-amber-400/10' },
                                                    { label: 'Build Cache', size: storageInfo.dockerUsage.buildCacheSize, color: 'text-purple-400', bg: 'bg-purple-400/10' }
                                                ].map((item, idx) => (
                                                    <div key={idx} className={`p-3 rounded-xl border border-outline/5 ${item.bg} backdrop-blur-sm group hover:scale-[1.02] transition-transform`}>
                                                        <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">{item.label}</p>
                                                        <div className="flex items-baseline gap-1">
                                                            <span className={`text-sm font-black ${item.color}`}>
                                                                {(item.size / (1024 * 1024)).toFixed(1)}
                                                            </span>
                                                            <span className="text-[9px] font-bold text-on-surface-variant/60 uppercase">MB</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Docker Build Settings Card */}
                        <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 shadow-lg backdrop-blur-sm">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
                                    <Terminal size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">Docker Build Settings</h2>
                                    <p className="text-xs text-on-surface-variant mt-0.5">Control buildkit and CLI behavior</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 bg-surface/80 rounded-xl border border-outline/5 transition-all hover:bg-surface-variant/20">
                                    <div className="flex-1 pr-4">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="text-sm font-bold text-on-surface">BuildKit Enabled</p>
                                            <span className="text-[10px] font-bold bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded uppercase tracking-tighter">DOCKER_BUILDKIT</span>
                                        </div>
                                        <p className="text-xs text-on-surface-variant leading-relaxed">Modern build engine for better performance and security</p>
                                    </div>
                                    <button
                                        onClick={() => setDockerBuildKit(!dockerBuildKit)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 flex-shrink-0 ${dockerBuildKit ? 'bg-primary' : 'bg-surface border border-outline/30'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${dockerBuildKit ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>

                                <div className="flex items-center justify-between p-4 bg-surface/80 rounded-xl border border-outline/5 transition-all hover:bg-surface-variant/20">
                                    <div className="flex-1 pr-4">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="text-sm font-bold text-on-surface">CLI Build Enabled</p>
                                            <span className="text-[10px] font-bold bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded uppercase tracking-tighter">COMPOSE_DOCKER_CLI_BUILD</span>
                                        </div>
                                        <p className="text-xs text-on-surface-variant leading-relaxed">Use native Docker CLI for building compose projects</p>
                                    </div>
                                    <button
                                        onClick={() => setDockerCliBuild(!dockerCliBuild)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 flex-shrink-0 ${dockerCliBuild ? 'bg-primary' : 'bg-surface border border-outline/30'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${dockerCliBuild ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>

                                <button
                                    onClick={handleSaveSystem}
                                    disabled={saving || loading}
                                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition-all active:scale-[0.98] shadow-md shadow-primary/20 disabled:opacity-50 text-sm mt-2"
                                >
                                    {saving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                                    <span>Update Build Settings</span>
                                </button>
                            </div>
                        </div>

                        {/* Storage Sync Settings Card */}
                        <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 shadow-lg backdrop-blur-sm">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500">
                                    <RefreshCw size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">Storage Monitor</h2>
                                    <p className="text-xs text-on-surface-variant mt-0.5">Background synchronization tasks</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 bg-surface/80 rounded-xl border border-outline/5 transition-all hover:bg-surface-variant/20">
                                    <div className="flex-1 pr-4">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="text-sm font-bold text-on-surface">Automatic Background Sync</p>
                                            <span className="text-[10px] font-bold bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded uppercase tracking-tighter">{autoStorageRefreshInterval} MIN INTERVAL</span>
                                        </div>
                                        <p className="text-xs text-on-surface-variant leading-relaxed">Periodically update disk and docker size stats in background</p>
                                    </div>
                                    <button
                                        onClick={() => setAutoStorageRefresh(!autoStorageRefresh)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 flex-shrink-0 ${autoStorageRefresh ? 'bg-primary' : 'bg-surface border border-outline/30'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoStorageRefresh ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>

                                <div className="p-4 bg-surface/80 rounded-xl border border-outline/5">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-bold text-on-surface">Refresh Interval (Minutes)</label>
                                        <span className="text-xs font-mono text-primary font-bold">{autoStorageRefreshInterval}m</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="1"
                                        max="120"
                                        step="1"
                                        value={autoStorageRefreshInterval}
                                        onChange={(e) => setAutoStorageRefreshInterval(parseInt(e.target.value))}
                                        className="w-full h-1.5 bg-outline/20 rounded-lg appearance-none cursor-pointer accent-primary"
                                    />
                                    <div className="flex justify-between mt-2 text-[10px] text-on-surface-variant font-medium">
                                        <span>1 min</span>
                                        <span>60 min</span>
                                        <span>120 min</span>
                                    </div>
                                </div>

                                <button
                                    onClick={handleSaveSystem}
                                    disabled={saving || loading}
                                    className="w-full flex items-center justify-center gap-2 bg-on-surface text-surface font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 text-sm mt-2"
                                >
                                    {saving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                                    <span>Save Monitor Settings</span>
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

                {activeTab === 'kafka' as any && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Kafka Configuration */}
                        <div className="bg-surface/50 border border-outline/10 rounded-2xl p-5 shadow-lg backdrop-blur-sm">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
                                    <RefreshCw size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">Kafka Integration</h2>
                                    <p className="text-xs text-on-surface-variant mt-0.5">External IP blocking requests</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 bg-surface/80 rounded-xl border border-outline/5">
                                    <div className="flex-1 pr-4">
                                        <p className="text-sm font-bold text-on-surface">Enable Consumer</p>
                                        <p className="text-xs text-on-surface-variant leading-relaxed">Listen for IP blocking requests from other apps</p>
                                    </div>
                                    <button
                                        onClick={() => setKafkaEnabled(!kafkaEnabled)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 flex-shrink-0 ${kafkaEnabled ? 'bg-primary' : 'bg-surface border border-outline/30'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${kafkaEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-on-surface-variant px-1">Bootstrap Servers (Consumer)</label>
                                    <input
                                        type="text"
                                        value={kafkaBootstrap}
                                        onChange={(e) => setKafkaBootstrap(e.target.value)}
                                        placeholder="localhost:9092"
                                        className="w-full bg-surface border border-outline/20 rounded-xl py-2.5 px-3 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-on-surface-variant px-1">Admin/Controller Host</label>
                                    <input
                                        type="text"
                                        value={kafkaAdminHost}
                                        onChange={(e) => setKafkaAdminHost(e.target.value)}
                                        placeholder="localhost:9092"
                                        className="w-full bg-surface border border-outline/20 rounded-xl py-2.5 px-3 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-on-surface-variant px-1">Topic Name</label>
                                    <input
                                        type="text"
                                        value={kafkaTopic}
                                        onChange={(e) => setKafkaTopic(e.target.value)}
                                        placeholder="ip-blocking-requests"
                                        className="w-full bg-surface border border-outline/20 rounded-xl py-2.5 px-3 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-on-surface-variant px-1">Group ID</label>
                                    <input
                                        type="text"
                                        value={kafkaGroupId}
                                        onChange={(e) => setKafkaGroupId(e.target.value)}
                                        placeholder="docker-manager-jailer"
                                        className="w-full bg-surface border border-outline/20 rounded-xl py-2.5 px-3 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                                    />
                                </div>

                                <button
                                    onClick={handleSaveSystem}
                                    disabled={saving || loading}
                                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition-all active:scale-[0.98] shadow-md shadow-primary/20 disabled:opacity-50 text-sm mt-2"
                                >
                                    {saving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                                    <span>Save Kafka Settings</span>
                                </button>
                            </div>
                        </div>

                        <div className="bg-surface/50 border border-outline/10 rounded-2xl p-6 shadow-lg backdrop-blur-sm">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-primary/10 rounded-xl text-primary">
                                    <Info size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">Message Format</h2>
                                    <p className="text-xs text-on-surface-variant mt-0.5">JSON payload structure</p>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <p className="text-sm text-on-surface leading-relaxed">
                                    Your external apps should publish JSON messages to the specified topic in the following format:
                                </p>
                                <pre className="p-4 bg-black/30 rounded-xl border border-white/5 font-mono text-[11px] text-blue-300 overflow-x-auto">
                                    {`{
  "ip": "1.2.3.4",
  "durationMinutes": 30,
  "reason": "Suspicious login attempt"
}`}
                                </pre>
                                <div className="p-4 bg-surface/80 rounded-xl border border-outline/5">
                                    <p className="text-xs text-on-surface leading-relaxed italic">
                                        Note: Kafka consumer will auto-restart when settings are applied.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {isShellOpen && (
                <Modal
                    onClose={() => setIsShellOpen(false)}
                    title="Server Terminal"
                    description="Interactive shell session"
                    icon={<Terminal size={24} />}
                    maxWidth="max-w-6xl"
                    className="h-[80vh] flex flex-col"
                >
                    <div className="flex-1 bg-black rounded-2xl overflow-hidden mt-4 border border-outline/10 p-2">
                        <WebShell
                            url={`${DockerClient.getServerUrl()}/shell/server`}
                            onClose={() => setIsShellOpen(false)}
                        />
                    </div>
                </Modal>
            )}

            {/* IP Import Modal */}
            {showIpImportModal && (
                <Modal
                    onClose={() => setShowIpImportModal(false)}
                    title="Import IP Range Data"
                    description="CSV: cidr, country_code, country_name, provider, type"
                    icon={<Globe size={24} />}
                    maxWidth="max-w-2xl"
                    className="flex flex-col"
                >
                    <div className="flex-1 overflow-y-auto mt-4 pr-2 custom-scrollbar">
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

                        <div className="flex items-center gap-3 pb-2">
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
                </Modal>
            )}
        </div>
    );
}
