'use client';

import React, { useState, useEffect } from 'react';
import { Mail, Shield, Plus, Trash, Key, Globe, User, RefreshCw, Inbox, Server, Play, Square, RotateCw, Save, Activity, FileText, Undo, AlertCircle, ShieldCheck, Terminal, CheckCircle2, XCircle, Wrench } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { EmailDomain, EmailUser, EmailMailbox, JamesContainerStatus, EmailTestResult } from '@/lib/types';
import { toast } from 'sonner';
import Editor from '@monaco-editor/react';

export default function EmailsScreen() {
    const [activeTab, setActiveTab] = useState<'Domains' | 'Users' | 'Mailboxes' | 'Aliases' | 'Manage' | 'Config' | 'Test'>('Domains');
    const [isLoading, setIsLoading] = useState(false);
    const [domains, setDomains] = useState<EmailDomain[]>([]);
    const [users, setUsers] = useState<EmailUser[]>([]);
    const [groups, setGroups] = useState<import('@/lib/types').EmailGroup[]>([]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            if (activeTab === 'Domains') {
                const data = await DockerClient.listEmailDomains();
                setDomains(data);
            } else if (activeTab === 'Users') {
                const data = await DockerClient.listEmailUsers();
                setUsers(data);
            } else if (activeTab === 'Aliases') {
                const data = await DockerClient.listEmailGroups();
                setGroups(data);
            }
        } catch (e) {
            console.error(e);
            toast.error('Failed to fetch email data');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    return (
        <div className="flex flex-col">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-bold">Email Management</h1>
                    {isLoading && <RefreshCw className="animate-spin text-primary" size={24} />}
                </div>
                <div className="flex bg-surface border border-outline/10 rounded-xl p-1 overflow-x-auto">
                    <button onClick={() => setActiveTab('Domains')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'Domains' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-on-surface-variant hover:text-on-surface'}`}>Domains</button>
                    <button onClick={() => setActiveTab('Users')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'Users' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-on-surface-variant hover:text-on-surface'}`}>Users</button>
                    <button onClick={() => setActiveTab('Aliases')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'Aliases' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-on-surface-variant hover:text-on-surface'}`}>Aliases</button>
                    <button onClick={() => setActiveTab('Mailboxes')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'Mailboxes' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-on-surface-variant hover:text-on-surface'}`}>Mailboxes</button>
                    <button onClick={() => setActiveTab('Manage')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'Manage' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-on-surface-variant hover:text-on-surface'}`}>Server</button>
                    <button onClick={() => setActiveTab('Config')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'Config' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-on-surface-variant hover:text-on-surface'}`}>Config</button>
                    <button onClick={() => setActiveTab('Test')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'Test' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-on-surface-variant hover:text-on-surface'}`}>Test</button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden">
                {activeTab === 'Domains' && <DomainsList domains={domains} onRefresh={fetchData} />}
                {activeTab === 'Users' && <UsersList users={users} onRefresh={fetchData} />}
                {activeTab === 'Aliases' && <AliasesList groups={groups} onRefresh={fetchData} />}
                {activeTab === 'Mailboxes' && <MailboxesList />}
                {activeTab === 'Manage' && <ManageJames />}
                {activeTab === 'Config' && <JamesConfigFiles />}
                {activeTab === 'Test' && <EmailTester users={users} />}
            </div>
        </div>
    );
}

function AliasesList({ groups, onRefresh }: { groups: import('@/lib/types').EmailGroup[], onRefresh: () => void }) {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newGroupAddress, setNewGroupAddress] = useState('');
    const [newMemberAddress, setNewMemberAddress] = useState('');

    const handleCreate = async () => {
        if (!newGroupAddress || !newMemberAddress) return;
        const res = await DockerClient.createEmailGroup(newGroupAddress, newMemberAddress);
        if (res.success) {
            toast.success('Alias created');
            setIsCreateOpen(false);
            setNewGroupAddress('');
            setNewMemberAddress('');
            onRefresh();
        } else {
            toast.error(res.message || 'Failed to create alias');
        }
    };

    const handleAddMember = async (groupAddr: string) => {
        const member = prompt("Enter member email address to add:");
        if (!member) return;
        const res = await DockerClient.addEmailGroupMember(groupAddr, member);
        if (res.success) {
            toast.success("Member added");
            onRefresh();
        } else {
            toast.error(res.message);
        }
    };

    const handleRemoveMember = async (groupAddr: string, memberAddr: string) => {
        if (!confirm(`Remove ${memberAddr} from ${groupAddr}?`)) return;
        const res = await DockerClient.removeEmailGroupMember(groupAddr, memberAddr);
        if (res.success) {
            toast.success("Member removed");
            onRefresh();
        } else {
            toast.error(res.message);
        }
    };

    return (
        <div className="flex flex-col h-full gap-4">
            <div className="flex justify-between items-center bg-surface p-4 rounded-xl border border-outline/10">
                <div>
                    <h2 className="text-xl font-bold">Email Aliases</h2>
                    <p className="text-sm text-on-surface-variant">Forward emails from a group address to multiple users.</p>
                </div>
                <button onClick={() => setIsCreateOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/80 text-white rounded-lg font-bold transition-all shadow-lg shadow-primary/20">
                    <Plus size={18} /> New Alias
                </button>
            </div>

            {isCreateOpen && (
                <div className="bg-surface border border-outline/10 rounded-xl p-4 animate-in fade-in slide-in-from-top-2">
                    <h3 className="text-lg font-bold mb-4">Create New Alias Group</h3>
                    <div className="flex gap-4 items-end">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Group Email</label>
                            <div className="relative">
                                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                                <input
                                    type="email"
                                    placeholder="sales@domain.com"
                                    value={newGroupAddress}
                                    onChange={e => setNewGroupAddress(e.target.value)}
                                    className="w-full bg-white/5 border border-outline/20 rounded-xl py-2 pl-10 pr-4 focus:outline-none focus:border-primary transition-all"
                                />
                            </div>
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">First Member (Target)</label>
                            <div className="relative">
                                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                                <input
                                    type="email"
                                    placeholder="user@domain.com"
                                    value={newMemberAddress}
                                    onChange={e => setNewMemberAddress(e.target.value)}
                                    className="w-full bg-white/5 border border-outline/20 rounded-xl py-2 pl-10 pr-4 focus:outline-none focus:border-primary transition-all"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleCreate} disabled={!newGroupAddress || !newMemberAddress} className="px-6 py-2 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all">Create</button>
                            <button onClick={() => setIsCreateOpen(false)} className="px-4 py-2 border border-outline/20 rounded-xl font-bold hover:bg-white/5 transition-all">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pb-20">
                {groups.map(group => (
                    <div key={group.address} className="bg-surface border border-outline/10 rounded-xl p-4 flex flex-col gap-3 group hover:border-primary/30 transition-all">
                        <div className="flex items-center justify-between pb-3 border-b border-outline/10">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                    <Globe size={20} />
                                </div>
                                <div className="truncate">
                                    <h3 className="font-bold text-lg truncate" title={group.address}>{group.address}</h3>
                                    <span className="text-xs text-on-surface-variant">{group.members.length} members</span>
                                </div>
                            </div>
                            <button onClick={() => handleAddMember(group.address)} className="p-2 hover:bg-primary/10 text-primary rounded-lg transition-all" title="Add Member">
                                <Plus size={18} />
                            </button>
                        </div>
                        <div className="flex flex-col gap-2 max-h-[150px] overflow-y-auto custom-scrollbar">
                            {group.members.map(member => (
                                <div key={member} className="flex items-center justify-between text-sm bg-white/5 rounded-lg px-3 py-2">
                                    <span className="truncate flex-1" title={member}>{member}</span>
                                    <button onClick={() => handleRemoveMember(group.address, member)} className="text-on-surface-variant hover:text-red-500 transition-colors ml-2">
                                        <Trash size={14} />
                                    </button>
                                </div>
                            ))}
                            {group.members.length === 0 && (
                                <div className="text-center py-4 text-xs text-on-surface-variant italic">No members (Group inactive)</div>
                            )}
                        </div>
                    </div>
                ))}
                {groups.length === 0 && !isCreateOpen && (
                    <div className="col-span-full flex flex-col items-center justify-center py-20 opacity-50">
                        <Globe size={48} className="mb-4 opacity-20" />
                        <p>No aliases found</p>
                    </div>
                )}
            </div>
        </div>
    )
}

function ManageJames() {
    const [status, setStatus] = useState<JamesContainerStatus | null>(null);
    const [composeConfig, setComposeConfig] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const fetchStatus = async () => {
        setIsLoading(true);
        const s = await DockerClient.getJamesStatus();
        setStatus(s);
        const c = await DockerClient.getJamesComposeConfig();
        setComposeConfig(c);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 10000);
        return () => clearInterval(interval);
    }, []);

    const handleAction = async (action: 'start' | 'stop' | 'restart' | 'install' | 'regenerate') => {
        let res;
        setIsLoading(true);
        if (action === 'install') res = await DockerClient.ensureJamesConfig();
        else if (action === 'regenerate') res = await DockerClient.ensureJamesConfig();
        else if (action === 'start') res = await DockerClient.startJames();
        else if (action === 'stop') res = await DockerClient.stopJames();
        else if (action === 'restart') res = await DockerClient.restartJames();

        if (res?.success) {
            if (action === 'regenerate') {
                toast.success('Configuration regenerated successfully');
            } else {
                toast.success(`James ${action}ed successfully`);
            }
            fetchStatus();
        } else {
            toast.error(res?.message || 'Action failed');
            setIsLoading(false);
        }
    };

    const handleSaveConfig = async () => {
        setIsSaving(true);
        const res = await DockerClient.updateJamesComposeConfig(composeConfig);
        if (res.success) {
            toast.success('Config saved');
        } else {
            toast.error(res.message);
        }
        setIsSaving(false);
    };

    if (isLoading && !status && !composeConfig) {
        return <div className="flex items-center justify-center h-full"><RefreshCw className="animate-spin text-primary" size={32} /></div>;
    }

    const isInstalled = status?.exists;
    const isRunning = status?.running;

    return (
        <div className="max-w-4xl mx-auto flex flex-col gap-6 p-4">
            {/* Status Card */}
            <div className={`p-6 rounded-2xl border ${isRunning ? 'bg-green-500/5 border-green-500/20' : 'bg-surface border-outline/10'} transition-all`}>
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isRunning ? 'bg-green-500/20 text-green-500' : 'bg-surface text-on-surface-variant'}`}>
                            <Server size={24} />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-xl font-bold">James Mail Server</h2>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                                <span className="text-sm font-mono text-on-surface-variant">{status?.status || 'Unknown'}</span>
                            </div>
                        </div>
                    </div>
                    {isInstalled ? (
                        <div className="flex gap-2">
                            {!isRunning ? (
                                <button onClick={() => handleAction('start')} disabled={isLoading} className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold transition-all">
                                    <Play size={18} fill="currentColor" /> Start
                                </button>
                            ) : (
                                <button onClick={() => handleAction('stop')} disabled={isLoading} className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl font-bold transition-all">
                                    <Square size={18} fill="currentColor" /> Stop
                                </button>
                            )}
                            <button onClick={() => handleAction('restart')} disabled={isLoading} className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl font-bold transition-all">
                                <RotateCw size={18} /> Restart
                            </button>
                            <button
                                onClick={() => handleAction('regenerate')}
                                disabled={isLoading}
                                className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 rounded-xl font-bold transition-all"
                                title="Regenerate configuration files and SSL certificates"
                            >
                                <Wrench size={18} /> Regenerate Config
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => handleAction('install')} disabled={isLoading} className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/80 text-white rounded-xl font-bold transition-all shadow-lg shadow-primary/20">
                            <Plus size={20} /> Install Server
                        </button>
                    )}
                </div>

                {status?.uptime && (
                    <div className="flex gap-8 border-t border-outline/10 pt-4 mt-4">
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Uptime</span>
                            <span className="font-mono text-sm">{status.uptime}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Container ID</span>
                            <span className="font-mono text-sm">{status.containerId?.substring(0, 12)}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Config Editor */}
            {isInstalled && (
                <div className="flex flex-col gap-4 bg-surface/30 border border-outline/10 rounded-2xl p-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                            <Activity size={20} className="text-primary" />
                            Configuration (docker-compose.yml)
                        </h3>
                        <button onClick={handleSaveConfig} disabled={isSaving} className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-white/10 border border-outline/20 rounded-lg text-sm font-bold transition-all">
                            <Save size={16} /> {isSaving ? 'Saving...' : 'Save Config'}
                        </button>
                    </div>
                    <p className="text-sm text-on-surface-variant">
                        Edit the internal docker-compose.yml for James. You can add the Postgres service here if needed.
                        Default configuration uses embedded Derby database.
                    </p>
                    <textarea
                        value={composeConfig}
                        onChange={(e) => setComposeConfig(e.target.value)}
                        className="w-full h-[400px] bg-black/50 border border-outline/20 rounded-xl p-4 font-mono text-sm text-on-surface focus:outline-none focus:border-primary resize-y"
                        spellCheck={false}
                    />
                </div>
            )}
        </div>
    );
}

function JamesConfigFiles() {
    const [files, setFiles] = useState<string[]>([]);
    const [selectedFile, setSelectedFile] = useState<string>('');
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchFiles = async () => {
            const list = await DockerClient.listJamesConfigFiles();
            setFiles(list);
            if (list.length > 0 && !selectedFile) {
                handleSelectFile(list[0]);
            }
        };
        fetchFiles();
    }, []);

    const handleSelectFile = async (name: string) => {
        setSelectedFile(name);
        setIsLoading(true);
        try {
            const data = await DockerClient.getJamesConfigContent(name);
            setContent(data);
        } catch (e) {
            toast.error('Failed to load file');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!selectedFile) return;
        setIsSaving(true);
        const res = await DockerClient.updateJamesConfigContent(selectedFile, content);
        if (res.success) {
            toast.success('File saved successfully');
        } else {
            toast.error(res.message || 'Failed to save file');
        }
        setIsSaving(false);
    };

    const handleReset = async () => {
        if (!selectedFile) return;
        if (!confirm(`Reset ${selectedFile} to default? Current changes will be lost.`)) return;

        setIsLoading(true);
        try {
            const data = await DockerClient.getDefaultJamesConfigContent(selectedFile);
            if (data) {
                setContent(data);
                toast.success('Reset to default template');
            } else {
                toast.error('No default template found for this file');
            }
        } catch (e) {
            toast.error('Failed to load default template');
        } finally {
            setIsLoading(false);
        }
    };

    const getLanguage = (filename: string) => {
        if (filename.endsWith('.xml')) return 'xml';
        if (filename.endsWith('.properties')) return 'ini';
        return 'text';
    };

    return (
        <div className="flex flex-col h-full gap-4">
            <div className="flex flex-col md:flex-row gap-4 h-full overflow-hidden">
                {/* File List */}
                <div className="w-full md:w-64 flex flex-col gap-2 bg-surface/30 border border-outline/10 rounded-2xl p-4 overflow-y-auto">
                    <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider px-2 mb-2">Config Files</h3>
                    {files.map(file => (
                        <button
                            key={file}
                            onClick={() => handleSelectFile(file)}
                            className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all text-left ${selectedFile === file ? 'bg-primary/20 text-primary border border-primary/30' : 'hover:bg-surface border border-transparent'}`}
                        >
                            <FileText size={16} className={selectedFile === file ? 'text-primary' : 'text-on-surface-variant'} />
                            <span className="truncate">{file}</span>
                        </button>
                    ))}
                    {files.length === 0 && (
                        <div className="text-center py-10 text-on-surface-variant text-xs italic">
                            No files found
                        </div>
                    )}
                </div>

                {/* Editor Container */}
                <div className="flex-1 flex flex-col gap-4 bg-surface/30 border border-outline/10 rounded-2xl overflow-hidden min-h-0">
                    <div className="flex items-center justify-between p-4 border-b border-outline/10 bg-surface/50">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                <FileText size={18} />
                            </div>
                            <div>
                                <h3 className="font-bold">{selectedFile || 'Select a file'}</h3>
                                <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-widest">
                                    {getLanguage(selectedFile || '')} editor
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleReset}
                                disabled={!selectedFile || isLoading}
                                className="flex items-center gap-2 px-3 py-1.5 bg-surface hover:bg-white/10 border border-outline/20 rounded-lg text-xs font-bold transition-all text-on-surface-variant"
                                title="Reset to default template"
                            >
                                <Undo size={14} /> Reset
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!selectedFile || isSaving || isLoading}
                                className="flex items-center gap-2 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold transition-all shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95"
                            >
                                <Save size={14} /> {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 relative min-h-0">
                        {isLoading ? (
                            <div className="absolute inset-0 flex items-center justify-center z-10 bg-surface/50">
                                <RefreshCw className="animate-spin text-primary" size={32} />
                            </div>
                        ) : null}

                        {!selectedFile ? (
                            <div className="h-full flex flex-col items-center justify-center text-on-surface-variant opacity-50">
                                <FileText size={48} className="mb-4" />
                                <p>Select a configuration file on the left to edit</p>
                            </div>
                        ) : (
                            <Editor
                                height="100%"
                                language={getLanguage(selectedFile)}
                                theme="vs-dark"
                                value={content}
                                onChange={(val) => setContent(val || '')}
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 14,
                                    lineNumbers: 'on',
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                    tabSize: 4,
                                    padding: { top: 16 }
                                }}
                            />
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3 bg-primary/5 border border-primary/10 p-4 rounded-2xl">
                <AlertCircle className="text-primary shrink-0" size={20} />
                <p className="text-sm text-on-surface-variant">
                    <span className="font-bold text-primary">Note:</span> Configuration changes require a
                    <span className="font-bold mx-1">Server Restart</span> to take effect. You can restart the server from the
                    <span className="font-bold ml-1 italic">Server</span> tab.
                </p>
            </div>
        </div>
    );
}

function DomainsList({ domains, onRefresh }: { domains: EmailDomain[], onRefresh: () => void }) {
    const [newDomain, setNewDomain] = useState('');

    const handleAdd = async () => {
        if (!newDomain) return;
        const res = await DockerClient.createEmailDomain(newDomain);
        if (res.success) {
            toast.success('Domain added successfully');
            setNewDomain('');
            onRefresh();
        } else {
            toast.error(res.message);
        }
    };

    const handleDelete = async (name: string) => {
        if (!confirm(`Are you sure you want to delete domain ${name}?`)) return;
        const res = await DockerClient.deleteEmailDomain(name);
        if (res.success) {
            toast.success('Domain deleted');
            onRefresh();
        } else {
            toast.error(res.message);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex gap-4">
                <div className="relative flex-1">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
                    <input
                        type="text"
                        placeholder="e.g. example.com"
                        value={newDomain}
                        onChange={(e) => setNewDomain(e.target.value)}
                        className="w-full bg-surface border border-outline/20 rounded-xl py-2 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
                <button
                    onClick={handleAdd}
                    className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl font-semibold hover:opacity-90 transition-opacity"
                >
                    <Plus size={18} />
                    Add Domain
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {domains.map((domain, index) => (
                    <div key={domain.name || `domain-${index}`} className="bg-surface/50 border border-outline/10 rounded-xl p-4 flex items-center justify-between hover:bg-surface transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                <Globe size={20} />
                            </div>
                            <span className="font-medium">{domain.name}</span>
                        </div>
                        <button
                            onClick={() => handleDelete(domain.name)}
                            className="p-2 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"
                        >
                            <Trash size={18} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

function UsersList({ users, onRefresh }: { users: EmailUser[], onRefresh: () => void }) {
    const [newUser, setNewUser] = useState('');
    const [newPass, setNewPass] = useState('');

    const handleAdd = async () => {
        if (!newUser || !newPass) return;
        const res = await DockerClient.createEmailUser(newUser, { password: newPass });
        if (res.success) {
            toast.success('User created');
            setNewUser('');
            setNewPass('');
            onRefresh();
        } else {
            toast.error(res.message);
        }
    };

    const handleDelete = async (address: string) => {
        if (!confirm(`Delete user ${address}?`)) return;
        const res = await DockerClient.deleteEmailUser(address);
        if (res.success) {
            toast.success('User deleted');
            onRefresh();
        } else {
            toast.error(res.message);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-surface/30 p-4 rounded-xl border border-outline/10">
                <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
                    <input
                        type="email"
                        placeholder="Email address"
                        value={newUser}
                        onChange={(e) => setNewUser(e.target.value)}
                        className="w-full bg-surface border border-outline/20 rounded-xl py-2 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
                <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
                    <input
                        type="password"
                        placeholder="Password"
                        value={newPass}
                        onChange={(e) => setNewPass(e.target.value)}
                        className="w-full bg-surface border border-outline/20 rounded-xl py-2 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
                <button
                    onClick={handleAdd}
                    className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl font-semibold hover:opacity-90 transition-opacity"
                >
                    <Plus size={18} />
                    Create User
                </button>
            </div>

            <div className="flex flex-col gap-3">
                {users.map(user => (
                    <div key={user.userAddress} className="bg-surface/50 border border-outline/10 rounded-xl p-4 flex items-center justify-between hover:bg-surface transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                <Mail size={20} />
                            </div>
                            <div className="flex flex-col">
                                <span className="font-medium">{user.userAddress}</span>
                                <span className="text-xs text-on-surface-variant">
                                    {user.userAddress.includes('@') ? user.userAddress.split('@')[1] : 'Account'} • Active
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    const pass = prompt('Enter new password for ' + user.userAddress);
                                    if (pass) {
                                        DockerClient.updateEmailUserPassword(user.userAddress, { password: pass })
                                            .then(res => res.success ? toast.success('Password updated') : toast.error(res.message));
                                    }
                                }}
                                className="p-2 hover:bg-primary/10 text-primary rounded-lg transition-colors"
                                title="Update Password"
                            >
                                <Key size={18} />
                            </button>
                            <button
                                onClick={() => handleDelete(user.userAddress)}
                                className="p-2 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"
                                title="Delete User"
                            >
                                <Trash size={18} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function MailboxesList() {
    const [users, setUsers] = useState<EmailUser[]>([]);
    const [selectedUser, setSelectedUser] = useState<string>('');
    const [mailboxes, setMailboxes] = useState<EmailMailbox[]>([]);
    const [newMailbox, setNewMailbox] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        DockerClient.listEmailUsers().then(setUsers);
    }, []);

    useEffect(() => {
        if (selectedUser) {
            fetchMailboxes();
        } else {
            setMailboxes([]);
        }
    }, [selectedUser]);

    const fetchMailboxes = async () => {
        setIsLoading(true);
        try {
            const data = await DockerClient.listEmailMailboxes(selectedUser);
            setMailboxes(data);
        } catch (e) {
            toast.error('Failed to fetch mailboxes');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAdd = async () => {
        if (!selectedUser || !newMailbox) return;
        const res = await DockerClient.createEmailMailbox(selectedUser, newMailbox);
        if (res.success) {
            toast.success('Mailbox created');
            setNewMailbox('');
            fetchMailboxes();
        } else {
            toast.error(res.message);
        }
    };

    const handleDelete = async (mailboxName: string) => {
        if (!confirm(`Delete mailbox ${mailboxName} for ${selectedUser}?`)) return;
        const res = await DockerClient.deleteEmailMailbox(selectedUser, mailboxName);
        if (res.success) {
            toast.success('Mailbox deleted');
            fetchMailboxes();
        } else {
            toast.error(res.message);
        }
    };

    return (
        <div className="flex flex-col gap-6 h-full">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 text-on-surface">
                    <label className="text-sm font-medium opacity-80 px-1">Select User</label>
                    <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
                        <select
                            value={selectedUser}
                            onChange={(e) => setSelectedUser(e.target.value)}
                            className="w-full bg-surface border border-outline/20 rounded-xl py-2 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary appearance-none transition-colors"
                        >
                            <option value="">Choose a user...</option>
                            {users.map(u => (
                                <option key={u.userAddress} value={u.userAddress} className="bg-surface text-on-surface">{u.userAddress}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="space-y-2 text-on-surface">
                    <label className="text-sm font-medium opacity-80 px-1">Create New Mailbox</label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Plus className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
                            <input
                                type="text"
                                placeholder="e.g. Sent, Drafts, Custom..."
                                value={newMailbox}
                                onChange={(e) => setNewMailbox(e.target.value)}
                                disabled={!selectedUser}
                                className="w-full bg-surface border border-outline/20 rounded-xl py-2 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary disabled:opacity-50 transition-colors"
                            />
                        </div>
                        <button
                            onClick={handleAdd}
                            disabled={!selectedUser || !newMailbox}
                            className="bg-primary text-primary-foreground px-4 py-2 rounded-xl font-semibold hover:opacity-90 disabled:opacity-50 transition-all active:scale-95 whitespace-nowrap"
                        >
                            Create
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {!selectedUser ? (
                    <div className="h-full flex flex-col items-center justify-center text-on-surface-variant opacity-50">
                        <Inbox size={48} className="mb-4" />
                        <p>Select a user to manage their mailboxes</p>
                    </div>
                ) : isLoading ? (
                    <div className="h-full flex items-center justify-center">
                        <RefreshCw className="animate-spin text-primary" size={32} />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
                        {mailboxes.length === 0 ? (
                            <div className="col-span-full py-10 text-center text-on-surface-variant border-2 border-dashed border-outline/10 rounded-2xl">
                                No mailboxes found for this user.
                            </div>
                        ) : (
                            mailboxes.map(mailbox => (
                                <div key={mailbox.name} className="bg-surface/50 border border-outline/10 rounded-xl p-4 flex items-center justify-between group hover:bg-surface hover:border-primary/20 transition-all shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary">
                                            <Inbox size={20} />
                                        </div>
                                        <span className="font-medium">{mailbox.name}</span>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(mailbox.name)}
                                        className="p-2 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-red-500 rounded-lg transition-all"
                                    >
                                        <Trash size={18} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function EmailTester({ users }: { users: EmailUser[] }) {
    const [selectedUser, setSelectedUser] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<EmailTestResult | null>(null);

    const handleTest = async () => {
        if (!selectedUser || !password) {
            toast.error('Please select a user and enter the password');
            return;
        }

        setIsLoading(true);
        setResult(null);
        try {
            const res = await DockerClient.testJamesEmail({
                userAddress: selectedUser,
                password: password,
                testType: 'smtp'
            });
            setResult(res);
            if (res.success) {
                toast.success('Test passed!');
            } else {
                toast.error('Test failed');
            }
        } catch (e) {
            toast.error('An error occurred during testing');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto flex flex-col gap-6 p-4 overflow-y-auto h-full pb-20">
            <div className="bg-surface border border-outline/10 rounded-2xl p-6 shadow-sm">
                <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                    <ShieldCheck className="text-primary" size={24} />
                    Email Connection Tester
                </h2>
                <p className="text-sm text-on-surface-variant mb-6">
                    Verify SMTP connectivity and authentication for your email accounts.
                    This will attempt to connect to the local mail server and send a self-test message.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="space-y-2">
                        <label className="text-sm font-medium px-1">Email Account</label>
                        <select
                            value={selectedUser}
                            onChange={(e) => setSelectedUser(e.target.value)}
                            className="w-full bg-white/5 border border-outline/20 rounded-xl py-2.5 px-4 text-on-surface focus:outline-none focus:border-primary transition-all appearance-none"
                        >
                            <option value="" className="bg-surface">Select a user...</option>
                            {users.map(u => (
                                <option key={u.userAddress} value={u.userAddress} className="bg-surface">{u.userAddress}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium px-1">Password</label>
                        <input
                            type="password"
                            placeholder="Account password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-white/5 border border-outline/20 rounded-xl py-2.5 px-4 text-on-surface focus:outline-none focus:border-primary transition-all"
                        />
                    </div>
                </div>

                <button
                    onClick={handleTest}
                    disabled={isLoading || !selectedUser || !password}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-xl font-bold hover:bg-primary/90 transition-all disabled:opacity-50 shadow-lg shadow-primary/20"
                >
                    {isLoading ? <RefreshCw className="animate-spin" size={20} /> : <Play size={20} fill="currentColor" />}
                    {isLoading ? 'Running Tests...' : 'Start Connection Test'}
                </button>
            </div>

            {result && (
                <div className={`border rounded-2xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500 ${result.success ? 'border-green-500/30' : 'border-red-500/30'}`}>
                    <div className={`${result.success ? 'bg-green-500/10' : 'bg-red-500/10'} p-4 flex items-center justify-between`}>
                        <div className="flex items-center gap-3">
                            {result.success ? <CheckCircle2 className="text-green-500" size={24} /> : <XCircle className="text-red-500" size={24} />}
                            <h3 className={`font-bold ${result.success ? 'text-green-500' : 'text-red-500'}`}>
                                Test {result.success ? 'Passed' : 'Failed'}
                            </h3>
                        </div>
                        <span className="text-xs font-mono opacity-50">{new Date().toLocaleTimeString()}</span>
                    </div>

                    <div className="bg-black/40 p-6 space-y-4">
                        <div className="flex items-center gap-2 text-on-surface-variant mb-2">
                            <Terminal size={16} />
                            <span className="text-xs font-bold uppercase tracking-widest">Test Execution Logs</span>
                        </div>
                        <div className="font-mono text-sm space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                            {result.logs.map((log, i) => (
                                <div key={i} className={`flex gap-3 ${log.toLowerCase().includes('error') ? 'text-red-400' : 'text-green-400/80'}`}>
                                    <span className="opacity-30 shrink-0">[{i + 1}]</span>
                                    <span>{log}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="p-4 bg-surface flex justify-center">
                        <p className="text-sm text-on-surface-variant italic">
                            {result.message}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
