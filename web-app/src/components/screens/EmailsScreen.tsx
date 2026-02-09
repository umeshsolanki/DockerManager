'use client';

import React, { useState, useEffect } from 'react';
import { Mail, Settings, RefreshCw, Inbox, Send, Archive, Trash, Star, Filter, Search, ChevronRight, MailOpen, AlertCircle, Save, Plus, ExternalLink, Shield } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { EmailFolder, EmailMessage, EmailClientConfig } from '@/lib/types';
import { toast } from 'sonner';

export default function EmailsScreen() {
    const [activeView, setActiveView] = useState<'client' | 'config'>('client');
    const [folders, setFolders] = useState<EmailFolder[]>([]);
    const [selectedFolder, setSelectedFolder] = useState<string>('INBOX');
    const [messages, setMessages] = useState<EmailMessage[]>([]);
    const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [config, setConfig] = useState<EmailClientConfig | null>(null);

    const fetchConfig = async () => {
        const data = await DockerClient.getEmailClientConfig();
        setConfig(data);
    };

    const fetchFolders = async () => {
        const data = await DockerClient.listEmailFolders();
        setFolders(data);
    };

    const fetchMessages = async (folder: string) => {
        setIsLoading(true);
        const data = await DockerClient.listEmailMessages(folder);
        setMessages(data);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchConfig();
        fetchFolders();
    }, []);

    useEffect(() => {
        if (activeView === 'client' && selectedFolder) {
            fetchMessages(selectedFolder);
        }
    }, [selectedFolder, activeView]);

    const handleRefresh = () => {
        fetchFolders();
        fetchMessages(selectedFolder);
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-bold">Mail Client</h1>
                    {isLoading && <RefreshCw className="animate-spin text-primary" size={20} />}
                </div>
                <div className="flex bg-surface border border-outline/10 rounded-xl p-1">
                    <button
                        onClick={() => setActiveView('client')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeView === 'client' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-on-surface-variant hover:text-on-surface'}`}
                    >
                        <Inbox size={16} /> Mailbox
                    </button>
                    <button
                        onClick={() => setActiveView('config')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeView === 'config' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-on-surface-variant hover:text-on-surface'}`}
                    >
                        <Settings size={16} /> Configuration
                    </button>
                </div>
            </div>

            {activeView === 'client' ? (
                <div className="flex flex-1 gap-4 overflow-hidden min-h-0">
                    {/* Folders Sidebar */}
                    <div className="w-64 bg-surface/50 border border-outline/10 rounded-2xl p-4 flex flex-col gap-2 overflow-y-auto">
                        <button
                            onClick={handleRefresh}
                            className="flex items-center justify-center gap-2 w-full py-2 bg-primary/10 text-primary rounded-xl text-sm font-bold mb-4 hover:bg-primary/20 transition-all"
                        >
                            <RefreshCw size={14} /> Refresh
                        </button>

                        {folders.map(folder => (
                            <button
                                key={folder.fullName}
                                onClick={() => setSelectedFolder(folder.fullName)}
                                className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all ${selectedFolder === folder.fullName ? 'bg-primary text-primary-foreground shadow-md' : 'hover:bg-white/5 text-on-surface-variant'}`}
                            >
                                <div className="flex items-center gap-3">
                                    {getFolderIcon(folder.name)}
                                    <span className="truncate">{folder.name}</span>
                                </div>
                                {folder.unreadCount > 0 && (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedFolder === folder.fullName ? 'bg-white text-primary' : 'bg-primary text-white'}`}>
                                        {folder.unreadCount}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Messages List */}
                    <div className="flex-1 bg-surface/50 border border-outline/10 rounded-2xl flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-outline/10 flex items-center justify-between">
                            <div className="relative flex-1 max-w-md">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search messages..."
                                    className="w-full bg-white/5 border border-outline/20 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-primary"
                                />
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                                <button className="p-2 hover:bg-white/5 rounded-lg text-on-surface-variant" title="Filter">
                                    <Filter size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full opacity-30 gap-4">
                                    <Mail size={48} />
                                    <p>No messages in this folder</p>
                                </div>
                            ) : (
                                messages.map(msg => (
                                    <button
                                        key={msg.id}
                                        onClick={() => setSelectedMessage(msg)}
                                        className={`w-full text-left p-4 border-b border-outline/5 hover:bg-white/5 transition-all flex flex-col gap-1 relative ${selectedMessage?.id === msg.id ? 'bg-primary/5' : ''}`}
                                    >
                                        {msg.unread && <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-primary rounded-full" />}
                                        <div className="flex justify-between items-start">
                                            <span className={`text-sm ${msg.unread ? 'font-bold' : 'text-on-surface-variant'}`}>{msg.from}</span>
                                            <span className="text-[10px] text-on-surface-variant">{msg.date}</span>
                                        </div>
                                        <h4 className={`text-sm truncate ${msg.unread ? 'font-bold' : ''}`}>{msg.subject}</h4>
                                        <p className="text-xs text-on-surface-variant truncate opacity-60">
                                            {msg.body || 'No preview available'}
                                        </p>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Message Content */}
                    <div className="w-[450px] bg-surface/50 border border-outline/10 rounded-2xl flex flex-col overflow-hidden">
                        {selectedMessage ? (
                            <div className="flex flex-col h-full">
                                <div className="p-6 border-b border-outline/10 bg-surface/30">
                                    <div className="flex justify-between items-start mb-4">
                                        <h2 className="text-xl font-bold leading-tight">{selectedMessage.subject}</h2>
                                        <div className="flex gap-1">
                                            <button className="p-2 hover:bg-white/5 rounded-lg text-on-surface-variant"><Archive size={18} /></button>
                                            <button className="p-2 hover:bg-red-500/10 text-red-500 rounded-lg"><Trash size={18} /></button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                                            {selectedMessage.from.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex flex-col overflow-hidden">
                                            <span className="text-sm font-bold truncate">{selectedMessage.from}</span>
                                            <span className="text-xs text-on-surface-variant truncate">To: {selectedMessage.to}</span>
                                        </div>
                                        <div className="ml-auto text-xs text-on-surface-variant">
                                            {selectedMessage.date}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 p-6 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap">
                                    {selectedMessage.body || (
                                        <div className="flex flex-col items-center justify-center py-20 opacity-30 gap-4 italic text-center">
                                            <MailOpen size={32} />
                                            <p>This is a preview. Fetching full body is not implemented in this version.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full opacity-20 gap-4">
                                <MailOpen size={64} />
                                <p>Select a message to read</p>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="max-w-4xl mx-auto w-full">
                    <ConfigView config={config} onSave={fetchConfig} />
                </div>
            )}
        </div>
    );
}

function ConfigView({ config, onSave }: { config: EmailClientConfig | null, onSave: () => void }) {
    const [imap, setImap] = useState(config?.imapConfig || { host: '', port: 993, username: '', password: '', useSsl: true, useTls: false });
    const [smtp, setSmtp] = useState(config?.smtpConfig || { host: '', port: 587, username: '', password: '', fromAddress: '', useTls: true, useSsl: false });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (config) {
            setImap(config.imapConfig);
            setSmtp(config.smtpConfig);
        }
    }, [config]);

    const handleSave = async () => {
        setIsSaving(true);
        const res = await DockerClient.updateEmailClientConfig({ imapConfig: imap as any, smtpConfig: smtp as any });
        if (res.success) {
            toast.success('Configuration saved');
            onSave();
        } else {
            toast.error(res.message);
        }
        setIsSaving(false);
    };

    return (
        <div className="flex flex-col gap-8 pb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* IMAP Setup */}
                <div className="bg-surface/50 border border-outline/10 rounded-2xl p-6 flex flex-col gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                            <Shield size={20} />
                        </div>
                        <h2 className="text-xl font-bold">IMAP (Incoming)</h2>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-on-surface-variant uppercase mb-2 block px-1">Host</label>
                            <input
                                type="text"
                                value={imap.host}
                                onChange={e => setImap({ ...imap, host: e.target.value })}
                                className="w-full bg-surface border border-outline/20 rounded-xl py-2 px-4 focus:outline-none focus:border-primary"
                                placeholder="imap.gmail.com"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-on-surface-variant uppercase mb-2 block px-1">Port</label>
                                <input
                                    type="number"
                                    value={imap.port}
                                    onChange={e => setImap({ ...imap, port: parseInt(e.target.value) })}
                                    className="w-full bg-surface border border-outline/20 rounded-xl py-2 px-4 focus:outline-none focus:border-primary"
                                />
                            </div>
                            <div className="flex items-end gap-4 pb-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={imap.useSsl} onChange={e => setImap({ ...imap, useSsl: e.target.checked })} className="rounded bg-surface border-outline/30 text-primary focus:ring-primary" />
                                    <span className="text-sm">SSL</span>
                                </label>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-on-surface-variant uppercase mb-2 block px-1">Username</label>
                            <input
                                type="text"
                                value={imap.username}
                                onChange={e => setImap({ ...imap, username: e.target.value })}
                                className="w-full bg-surface border border-outline/20 rounded-xl py-2 px-4 focus:outline-none focus:border-primary"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-on-surface-variant uppercase mb-2 block px-1">Password</label>
                            <input
                                type="password"
                                value={imap.password}
                                onChange={e => setImap({ ...imap, password: e.target.value })}
                                className="w-full bg-surface border border-outline/20 rounded-xl py-2 px-4 focus:outline-none focus:border-primary"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>
                </div>

                {/* SMTP Setup */}
                <div className="bg-surface/50 border border-outline/10 rounded-2xl p-6 flex flex-col gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                            <Send size={20} />
                        </div>
                        <h2 className="text-xl font-bold">SMTP (Outgoing)</h2>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-on-surface-variant uppercase mb-2 block px-1">Host</label>
                            <input
                                type="text"
                                value={smtp.host}
                                onChange={e => setSmtp({ ...smtp, host: e.target.value })}
                                className="w-full bg-surface border border-outline/20 rounded-xl py-2 px-4 focus:outline-none focus:border-primary"
                                placeholder="smtp.gmail.com"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-on-surface-variant uppercase mb-2 block px-1">Port</label>
                                <input
                                    type="number"
                                    value={smtp.port}
                                    onChange={e => setSmtp({ ...smtp, port: parseInt(e.target.value) })}
                                    className="w-full bg-surface border border-outline/20 rounded-xl py-2 px-4 focus:outline-none focus:border-primary"
                                />
                            </div>
                            <div className="flex items-end gap-4 pb-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={smtp.useTls} onChange={e => setSmtp({ ...smtp, useTls: e.target.checked })} className="rounded bg-surface border-outline/30 text-primary focus:ring-primary" />
                                    <span className="text-sm">TLS</span>
                                </label>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-on-surface-variant uppercase mb-2 block px-1">From Address</label>
                            <input
                                type="email"
                                value={smtp.fromAddress}
                                onChange={e => setSmtp({ ...smtp, fromAddress: e.target.value })}
                                className="w-full bg-surface border border-outline/20 rounded-xl py-2 px-4 focus:outline-none focus:border-primary"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-primary/5 border border-primary/10 rounded-2xl p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <AlertCircle className="text-primary" size={24} />
                    <p className="text-sm text-on-surface-variant max-w-xl">
                        Changes will be saved and used for all subsequent mail operations. Make sure your provider allows third-party app access.
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all"
                >
                    <Save size={18} /> {isSaving ? 'Saving...' : 'Save Configuration'}
                </button>
            </div>
        </div>
    );
}

function getFolderIcon(name: string) {
    const n = name.toLowerCase();
    if (n.includes('inbox')) return <Inbox size={18} />;
    if (n.includes('sent')) return <Send size={18} />;
    if (n.includes('draft')) return <Plus size={18} />;
    if (n.includes('trash') || n.includes('bin')) return <Trash size={18} />;
    if (n.includes('archive')) return <Archive size={18} />;
    if (n.includes('star')) return <Star size={18} />;
    if (n.includes('junk') || n.includes('spam')) return <AlertCircle size={18} />;
    return <ChevronRight size={18} />;
}
