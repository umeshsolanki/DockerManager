'use client';

import React, { useState, useEffect } from 'react';
import { Mail, Shield, Plus, Trash, Key, Globe, User, RefreshCw } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { EmailDomain, EmailUser } from '@/lib/types';
import { toast } from 'sonner';

export default function EmailsScreen() {
    const [activeTab, setActiveTab] = useState<'Domains' | 'Users'>('Domains');
    const [isLoading, setIsLoading] = useState(false);
    const [domains, setDomains] = useState<EmailDomain[]>([]);
    const [users, setUsers] = useState<EmailUser[]>([]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            if (activeTab === 'Domains') {
                const data = await DockerClient.listEmailDomains();
                setDomains(data);
            } else {
                const data = await DockerClient.listEmailUsers();
                setUsers(data);
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
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-bold">Email Management</h1>
                    {isLoading && <RefreshCw className="animate-spin text-primary" size={24} />}
                </div>
                <div className="flex bg-surface border border-outline/10 rounded-xl p-1">
                    <button
                        onClick={() => setActiveTab('Domains')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'Domains' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-on-surface-variant hover:text-on-surface'}`}
                    >
                        Domains
                    </button>
                    <button
                        onClick={() => setActiveTab('Users')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'Users' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-on-surface-variant hover:text-on-surface'}`}
                    >
                        Users
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden">
                {activeTab === 'Domains' ? (
                    <DomainsList domains={domains} onRefresh={fetchData} />
                ) : (
                    <UsersList users={users} onRefresh={fetchData} />
                )
                }
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
                {domains.map(domain => (
                    <div key={domain.name} className="bg-surface/50 border border-outline/10 rounded-xl p-4 flex items-center justify-between hover:bg-surface transition-colors">
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
                                <span className="text-xs text-on-surface-variant uppercase tracking-wider font-bold">Account Active</span>
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
