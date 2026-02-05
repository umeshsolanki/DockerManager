'use client';

import React, { useState, useEffect } from 'react';
import {
    Zap, RefreshCw, Plus, Trash2, Search,
    MessageSquare, List, Info, AlertTriangle,
    Eye, ChevronRight, Clock, Hash, Copy, Check
} from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { KafkaTopicInfo, KafkaMessage, KafkaRule, KafkaProcessedEvent } from '@/lib/types';
import { Modal } from '../ui/Modal';

export default function KafkaScreen() {
    const [topics, setTopics] = useState<KafkaTopicInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
    const [messages, setMessages] = useState<KafkaMessage[]>([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);

    // Create topic form state
    const [newTopicName, setNewTopicName] = useState('');
    const [newTopicPartitions, setNewTopicPartitions] = useState(1);
    const [newTopicReplication, setNewTopicReplication] = useState(1);
    const [isCreating, setIsCreating] = useState(false);

    // Rules & Events state
    const [activeTab, setActiveTab] = useState<'topics' | 'rules' | 'events'>('topics');
    const [rules, setRules] = useState<KafkaRule[]>([]);
    const [events, setEvents] = useState<KafkaProcessedEvent[]>([]);
    const [loadingRules, setLoadingRules] = useState(false);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [showRuleModal, setShowRuleModal] = useState(false);
    const [editingRule, setEditingRule] = useState<KafkaRule | null>(null);

    // Filtering & Processing state
    const [topicSearchQuery, setTopicSearchQuery] = useState('');
    const [messageSearchQuery, setMessageSearchQuery] = useState('');
    const [partitionFilter, setPartitionFilter] = useState<number | null>(null);
    const [autoFormatJson, setAutoFormatJson] = useState(true);

    const fetchTopics = async () => {
        setLoading(true);
        try {
            const data = await DockerClient.listKafkaTopics();
            setTopics(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchMessages = async (topic: string) => {
        setLoadingMessages(true);
        try {
            const data = await DockerClient.getKafkaMessages(topic);
            setMessages(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingMessages(false);
        }
    };

    const fetchRules = async () => {
        setLoadingRules(true);
        try {
            const data = await DockerClient.getKafkaRules();
            setRules(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingRules(false);
        }
    };

    const fetchEvents = async () => {
        setLoadingEvents(true);
        try {
            const data = await DockerClient.getKafkaEvents();
            setEvents(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingEvents(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'topics') fetchTopics();
        if (activeTab === 'rules') fetchRules();
        if (activeTab === 'events') fetchEvents();
    }, [activeTab]);

    const handleCreateTopic = async () => {
        if (!newTopicName) return;
        setIsCreating(true);
        try {
            const result = await DockerClient.createKafkaTopic({
                name: newTopicName,
                partitions: newTopicPartitions,
                replicationFactor: newTopicReplication
            });
            if (result.success) {
                setShowCreateModal(false);
                setNewTopicName('');
                setNewTopicPartitions(1);
                setNewTopicReplication(1);
                fetchTopics();
            } else {
                alert(result.message || 'Failed to create topic');
            }
        } catch (e) {
            console.error(e);
            alert('Error creating topic');
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteTopic = async (name: string) => {
        if (!confirm(`Are you sure you want to delete topic "${name}"? This action cannot be undone.`)) return;
        try {
            const result = await DockerClient.deleteKafkaTopic(name);
            if (result.success) {
                if (selectedTopic === name) setSelectedTopic(null);
                fetchTopics();
            } else {
                alert(result.message || 'Failed to delete topic');
            }
        } catch (e) {
            console.error(e);
            alert('Error deleting topic');
        }
    };

    const formatMessageValue = (value: string) => {
        if (!autoFormatJson) return value;
        try {
            const parsed = JSON.parse(value);
            return JSON.stringify(parsed, null, 2);
        } catch (e) {
            return value;
        }
    };

    const filteredTopics = topics.filter(t =>
        t.name.toLowerCase().includes(topicSearchQuery.toLowerCase())
    );

    const filteredMessages = messages.filter(msg => {
        const matchesFilter = partitionFilter === null || msg.partition === partitionFilter;
        const matchesSearch = messageSearchQuery === '' ||
            msg.value.toLowerCase().includes(messageSearchQuery.toLowerCase()) ||
            (msg.key?.toLowerCase().includes(messageSearchQuery.toLowerCase()) || false);
        return matchesFilter && matchesSearch;
    });

    const uniquePartitions = Array.from(new Set(messages.map(m => m.partition))).sort((a, b) => a - b);

    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

    const handleCopy = (text: string, index: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    return (
        <div className="flex flex-col h-full overflow-hidden pb-4">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-xl text-primary">
                        <Zap size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">Kafka Management</h1>
                        <p className="text-xs text-on-surface-variant">View and manage topics, partitions, and data</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex bg-surface-variant/30 p-1 rounded-xl mr-4 border border-outline/10">
                        <button
                            onClick={() => setActiveTab('topics')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'topics' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
                        >
                            Topics
                        </button>
                        <button
                            onClick={() => setActiveTab('rules')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'rules' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
                        >
                            Rules
                        </button>
                        <button
                            onClick={() => setActiveTab('events')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'events' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
                        >
                            Events
                        </button>
                    </div>
                    {activeTab === 'topics' && (
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-all font-semibold text-sm shadow-lg shadow-primary/20"
                        >
                            <Plus size={18} />
                            <span>Create Topic</span>
                        </button>
                    )}
                    {activeTab === 'rules' && (
                        <button
                            onClick={() => {
                                setEditingRule({ id: Math.random().toString(36).substr(2, 9), name: '', topic: 'ip-blocking-requests', condition: '', transformations: {}, storeInDb: true, enabled: true });
                                setShowRuleModal(true);
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-all font-semibold text-sm shadow-lg shadow-primary/20"
                        >
                            <Plus size={18} />
                            <span>Add Rule</span>
                        </button>
                    )}
                    <button
                        onClick={() => {
                            if (activeTab === 'topics') fetchTopics();
                            if (activeTab === 'rules') fetchRules();
                            if (activeTab === 'events') fetchEvents();
                        }}
                        className="p-2 hover:bg-surface rounded-xl transition-all text-on-surface-variant hover:text-primary border border-outline/10"
                        title="Refresh"
                    >
                        <RefreshCw size={20} className={loading || loadingRules || loadingEvents ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {activeTab === 'topics' && (
                <div className="flex-1 flex gap-4 overflow-hidden">
                    {/* Topics List */}
                    <div className="w-80 bg-surface/50 border border-outline/10 rounded-2xl flex flex-col overflow-hidden backdrop-blur-sm">
                        <div className="p-4 border-b border-outline/10 bg-surface/50">
                            <div className="flex items-center gap-2 mb-3">
                                <List size={16} className="text-primary" />
                                <h2 className="text-sm font-bold uppercase tracking-wider">Topics</h2>
                            </div>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={14} />
                                <input
                                    type="text"
                                    placeholder="Search topics..."
                                    value={topicSearchQuery}
                                    onChange={(e) => setTopicSearchQuery(e.target.value)}
                                    className="w-full bg-surface border border-outline/20 rounded-lg py-1.5 pl-9 pr-3 text-xs focus:outline-none focus:border-primary transition-all"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <div key={i} className="h-12 bg-surface animate-pulse rounded-lg" />
                                ))
                            ) : filteredTopics.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <AlertTriangle size={32} className="text-on-surface-variant/30 mb-2" />
                                    <p className="text-xs text-on-surface-variant italic">No matches found</p>
                                </div>
                            ) : (
                                filteredTopics.map((topic) => (
                                    <button
                                        key={topic.name}
                                        onClick={() => {
                                            setSelectedTopic(topic.name);
                                            fetchMessages(topic.name);
                                        }}
                                        className={`w-full flex items-center justify-between p-3 rounded-xl transition-all group ${selectedTopic === topic.name
                                            ? 'bg-primary text-primary-foreground shadow-md'
                                            : 'hover:bg-surface text-on-surface'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <Hash size={14} className={selectedTopic === topic.name ? 'text-primary-foreground/60' : 'text-primary/60'} />
                                            <span className="text-sm font-semibold truncate">{topic.name}</span>
                                        </div>
                                        <ChevronRight size={14} className={`transition-transform ${selectedTopic === topic.name ? 'translate-x-0' : '-translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0'}`} />
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Topic Details & Messages */}
                    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                        {!selectedTopic ? (
                            <div className="flex-1 flex flex-col items-center justify-center bg-surface/30 border border-outline/10 border-dashed rounded-2xl text-on-surface-variant">
                                <div className="p-6 bg-primary/5 rounded-full mb-4">
                                    <Zap size={48} className="opacity-20 text-primary" />
                                </div>
                                <h3 className="text-lg font-bold">Select a topic</h3>
                                <p className="text-sm max-w-xs text-center mt-2">
                                    Choose a Kafka topic from the sidebar to view its partitions, configuration, and recent messages.
                                </p>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col overflow-hidden bg-surface/50 border border-outline/10 rounded-2xl backdrop-blur-sm">
                                {/* Header */}
                                <div className="p-4 border-b border-outline/10 flex items-center justify-between bg-surface/50">
                                    <div className="flex items-center gap-4">
                                        <h2 className="text-xl font-bold">{selectedTopic}</h2>
                                        <div className="flex items-center gap-2">
                                            <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-lg text-[10px] font-bold uppercase border border-primary/20">
                                                {topics.find(t => t.name === selectedTopic)?.partitions} Partitions
                                            </span>
                                            <span className="px-2 py-0.5 bg-secondary/10 text-secondary rounded-lg text-[10px] font-bold uppercase border border-secondary/20">
                                                {topics.find(t => t.name === selectedTopic)?.replicationFactor}x Repl
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => fetchMessages(selectedTopic)}
                                            className="p-2 hover:bg-surface rounded-xl transition-all text-on-surface-variant hover:text-primary border border-outline/10"
                                            title="Reload messages"
                                        >
                                            <RefreshCw size={18} className={loadingMessages ? 'animate-spin' : ''} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteTopic(selectedTopic)}
                                            className="p-2 hover:bg-red-500/10 rounded-xl transition-all text-on-surface-variant hover:text-red-500 border border-outline/10 hover:border-red-500/20"
                                            title="Delete Topic"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>

                                {/* Messages List */}
                                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                                    <div className="flex items-center gap-2 mb-4">
                                        <MessageSquare size={16} className="text-primary" />
                                        <h3 className="text-sm font-bold uppercase tracking-wider">Recent Messages</h3>

                                        <div className="flex-1 px-4">
                                            <div className="relative">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={14} />
                                                <input
                                                    type="text"
                                                    placeholder="Filter messages..."
                                                    value={messageSearchQuery}
                                                    onChange={(e) => setMessageSearchQuery(e.target.value)}
                                                    className="w-full bg-surface/50 border border-outline/10 rounded-xl py-1.5 pl-9 pr-3 text-xs focus:outline-none focus:border-primary transition-all"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setAutoFormatJson(!autoFormatJson)}
                                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border transition-all ${autoFormatJson ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-surface border-outline/10 text-on-surface-variant'}`}
                                            >
                                                JSON Auto-Format
                                            </button>

                                            {uniquePartitions.length > 1 && (
                                                <div className="flex items-center gap-1 bg-surface/50 border border-outline/10 rounded-lg p-1">
                                                    <button
                                                        onClick={() => setPartitionFilter(null)}
                                                        className={`px-2 py-1 rounded text-[10px] font-bold ${partitionFilter === null ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/10 text-on-surface-variant'}`}
                                                    >
                                                        ALL P
                                                    </button>
                                                    {uniquePartitions.map(p => (
                                                        <button
                                                            key={p}
                                                            onClick={() => setPartitionFilter(p)}
                                                            className={`px-2 py-1 rounded text-[10px] font-bold ${partitionFilter === p ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/10 text-on-surface-variant'}`}
                                                        >
                                                            P{p}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {loadingMessages ? (
                                        <div className="space-y-3">
                                            {Array(3).fill(0).map((_, i) => (
                                                <div key={i} className="h-24 bg-surface animate-pulse rounded-2xl" />
                                            ))}
                                        </div>
                                    ) : filteredMessages.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-24 text-center border border-outline/10 border-dashed rounded-2xl bg-surface/20">
                                            <Search size={48} className="text-on-surface-variant/20 mb-4" />
                                            <p className="text-sm font-medium">No messages matching your filters</p>
                                            <p className="text-xs text-on-surface-variant mt-1">Try changing your search query or partition filter.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {filteredMessages.map((msg, i) => (
                                                <div key={i} className="bg-surface/80 border border-outline/10 rounded-2xl overflow-hidden shadow-sm hover:border-primary/30 transition-all group">
                                                    <div className="px-4 py-2 bg-surface flex items-center justify-between text-[11px] font-medium text-on-surface-variant">
                                                        <div className="flex items-center gap-3">
                                                            <span className="flex items-center gap-1"><Hash size={12} /> P{msg.partition}</span>
                                                            <span className="flex items-center gap-1"><ChevronRight size={12} /> Offset {msg.offset}</span>
                                                        </div>
                                                        <span className="flex items-center gap-1 font-mono">
                                                            <Clock size={12} /> {new Date(msg.timestamp).toLocaleString()}
                                                        </span>
                                                    </div>
                                                    <div className="p-4 flex gap-4">
                                                        {msg.key && (
                                                            <div className="w-1/4 shrink-0 overflow-hidden">
                                                                <p className="text-[10px] font-bold text-primary uppercase tracking-tight mb-1">Key</p>
                                                                <code className="text-[11px] font-mono block p-2 bg-on-surface/5 rounded-lg border border-outline/5 truncate" title={msg.key}>
                                                                    {msg.key}
                                                                </code>
                                                            </div>
                                                        )}
                                                        <div className="flex-1 min-w-0 flex flex-col">
                                                            <div className="flex items-center justify-between mb-1">
                                                                <p className="text-[10px] font-bold text-primary uppercase tracking-tight">Payload</p>
                                                                <button
                                                                    onClick={() => handleCopy(msg.value, i)}
                                                                    className="p-1 hover:bg-primary/10 rounded transition-all text-on-surface-variant hover:text-primary"
                                                                    title="Copy payload"
                                                                >
                                                                    {copiedIndex === i ? <Check size={12} /> : <Copy size={12} />}
                                                                </button>
                                                            </div>
                                                            <pre className="text-[11px] font-mono bg-on-surface/5 p-3 rounded-lg border border-outline/5 overflow-x-auto custom-scrollbar leading-relaxed whitespace-pre-wrap flex-1">
                                                                {formatMessageValue(msg.value)}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'rules' && (
                <div className="flex-1 overflow-y-auto space-y-4 pt-2">
                    {loadingRules ? (
                        <div className="flex items-center justify-center py-20">
                            <RefreshCw className="animate-spin text-primary" size={32} />
                        </div>
                    ) : rules.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center border border-outline/10 border-dashed rounded-2xl bg-surface/20">
                            <Plus size={48} className="text-on-surface-variant/20 mb-4" />
                            <p className="text-sm font-medium">No Kafka rules defined</p>
                            <p className="text-xs text-on-surface-variant mt-1">Rules allow you to transform or filter messages before processing.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {rules.map(rule => (
                                <div key={rule.id} className="bg-surface/50 border border-outline/10 rounded-2xl p-4 flex flex-col gap-3 group relative hover:border-primary/50 transition-all backdrop-blur-sm shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-bold text-sm tracking-tight">{rule.name}</h3>
                                        <div className={`w-2 h-2 rounded-full ${rule.enabled ? 'bg-green-500 box-glow-green' : 'bg-on-surface-variant/30'}`} />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider opacity-60">Topic</p>
                                        <p className="font-mono text-[11px] bg-primary/5 text-primary px-2 py-1 rounded-lg border border-primary/10 inline-block">{rule.topic}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider opacity-60">Condition</p>
                                        <p className="font-mono text-[11px] bg-on-surface/5 px-2 py-1 rounded-lg border border-outline/10">{rule.condition}</p>
                                    </div>
                                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-outline/5">
                                        <button
                                            onClick={() => { setEditingRule(rule); setShowRuleModal(true); }}
                                            className="text-xs font-bold text-primary hover:opacity-80 transition-all flex items-center gap-1"
                                        >
                                            <Eye size={12} />
                                            <span>Edit</span>
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (confirm('Delete rule?')) {
                                                    const newRules = rules.filter(r => r.id !== rule.id);
                                                    await DockerClient.updateKafkaRules(newRules);
                                                    fetchRules();
                                                }
                                            }}
                                            className="ml-auto text-xs font-bold text-red-500 hover:opacity-80 transition-all flex items-center gap-1"
                                        >
                                            <Trash2 size={12} />
                                            <span>Delete</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'events' && (
                <div className="flex-1 overflow-y-auto space-y-4 pt-2">
                    {loadingEvents ? (
                        <div className="flex items-center justify-center py-20">
                            <RefreshCw className="animate-spin text-primary" size={32} />
                        </div>
                    ) : events.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center border border-outline/10 border-dashed rounded-2xl bg-surface/20">
                            <List size={48} className="text-on-surface-variant/20 mb-4" />
                            <p className="text-sm font-medium">No processed events found</p>
                            <p className="text-xs text-on-surface-variant mt-1">Events are recorded when rules are applied or system topics are processed.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {events.map(event => (
                                <div key={event.id} className="bg-surface/50 border border-outline/10 rounded-2xl overflow-hidden hover:border-primary/30 transition-all backdrop-blur-sm shadow-sm">
                                    <div className="px-4 py-2.5 bg-surface flex items-center justify-between text-[11px] font-medium text-on-surface-variant border-b border-outline/10">
                                        <div className="flex items-center gap-3">
                                            <span className="font-bold text-primary uppercase tracking-wider bg-primary/10 px-2 py-0.5 rounded-lg border border-primary/10">{event.originalTopic}</span>
                                            <span className="flex items-center gap-1 opacity-60"><Clock size={12} /> {new Date(event.timestamp).toLocaleString()}</span>
                                        </div>
                                        {event.appliedRules.length > 0 && (
                                            <div className="flex gap-1.5">
                                                {event.appliedRules.map((rid, idx) => (
                                                    <span key={idx} className="px-2 py-0.5 bg-green-500/10 text-green-500 rounded-lg text-[10px] font-bold border border-green-500/20 flex items-center gap-1">
                                                        <Check size={10} /> Rule Applied
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest opacity-60">Original Payload</p>
                                            <pre className="text-[11px] font-mono bg-on-surface/5 p-3 rounded-xl max-h-48 overflow-auto border border-outline/5 custom-scrollbar leading-relaxed shadow-inner">{event.originalValue}</pre>
                                        </div>
                                        <div className="space-y-1.5">
                                            <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Processed Result</p>
                                            <pre className="text-[11px] font-mono bg-primary/5 p-3 rounded-xl border border-primary/20 max-h-48 overflow-auto text-primary custom-scrollbar leading-relaxed shadow-inner">{event.processedValue}</pre>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Create Topic Modal */}
            {showCreateModal && (
                <Modal
                    onClose={() => setShowCreateModal(false)}
                    title="Create New Kafka Topic"
                    description="Configure topic name and basic partitioning"
                    icon={<Zap size={24} />}
                >
                    <div className="space-y-6 pt-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider px-1">Topic Name</label>
                            <input
                                type="text"
                                value={newTopicName}
                                onChange={(e) => setNewTopicName(e.target.value)}
                                placeholder="my-awesome-topic"
                                className="w-full bg-surface border border-outline/20 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-medium"
                                autoFocus
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider px-1">Partitions</label>
                                <input
                                    type="number"
                                    value={newTopicPartitions}
                                    onChange={(e) => setNewTopicPartitions(parseInt(e.target.value))}
                                    min={1}
                                    max={100}
                                    className="w-full bg-surface border border-outline/20 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:border-primary transition-all font-mono"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider px-1">Repl. Factor</label>
                                <input
                                    type="number"
                                    value={newTopicReplication}
                                    onChange={(e) => setNewTopicReplication(parseInt(e.target.value))}
                                    min={1}
                                    max={3}
                                    className="w-full bg-surface border border-outline/20 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:border-primary transition-all font-mono"
                                />
                            </div>
                        </div>

                        <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex items-start gap-3">
                            <Info size={18} className="text-primary shrink-0 mt-0.5" />
                            <p className="text-[11px] leading-relaxed text-on-surface-variant">
                                Replication factor cannot exceed the number of brokers in your cluster. For local setups, 1 is the typical value.
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleCreateTopic}
                                disabled={isCreating || !newTopicName}
                                className="flex-1 bg-primary text-primary-foreground py-3.5 rounded-2xl font-bold text-sm hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-[0.98] disabled:opacity-50"
                            >
                                {isCreating ? <RefreshCw className="animate-spin" size={18} /> : <Plus size={18} />}
                                <span>Create Topic</span>
                            </button>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="px-6 py-3.5 bg-surface border border-outline/20 text-on-surface rounded-2xl font-bold text-sm hover:bg-surface-variant transition-all"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Rule Modal */}
            {showRuleModal && editingRule && (
                <Modal
                    onClose={() => setShowRuleModal(false)}
                    title={editingRule.id ? 'Edit Kafka Rule' : 'New Kafka Rule'}
                    icon={<Zap size={24} />}
                >
                    <div className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-on-surface-variant uppercase">Rule Name</label>
                            <input
                                type="text"
                                value={editingRule.name}
                                onChange={e => setEditingRule({ ...editingRule, name: e.target.value })}
                                placeholder="e.g. Block Specific IP"
                                className="w-full bg-surface border border-outline/20 rounded-xl py-2.5 px-3 text-sm focus:border-primary outline-none focus:ring-4 focus:ring-primary/10 transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-on-surface-variant uppercase">Topic</label>
                            <select
                                value={editingRule.topic}
                                onChange={e => setEditingRule({ ...editingRule, topic: e.target.value })}
                                className="w-full bg-surface border border-outline/20 rounded-xl py-2.5 px-3 text-sm focus:border-primary outline-none transition-all"
                            >
                                <option value="ip-blocking-requests">ip-blocking-requests</option>
                                {topics.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-on-surface-variant uppercase">Condition (e.g. ip==&apos;1.2.3.4&apos;)</label>
                            <input
                                type="text"
                                value={editingRule.condition}
                                onChange={e => setEditingRule({ ...editingRule, condition: e.target.value })}
                                placeholder="field == 'value'"
                                className="w-full bg-surface border border-outline/20 rounded-xl py-2.5 px-3 text-sm font-mono focus:border-primary outline-none transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-on-surface-variant uppercase">Transformations (JSON)</label>
                            <textarea
                                value={JSON.stringify(editingRule.transformations, null, 2)}
                                onChange={e => {
                                    try {
                                        setEditingRule({ ...editingRule, transformations: JSON.parse(e.target.value) });
                                    } catch (err) { /* ignore invalid json while typing */ }
                                }}
                                className="w-full bg-surface border border-outline/20 rounded-xl py-2.5 px-3 text-[11px] font-mono focus:border-primary outline-none h-24 custom-scrollbar transition-all"
                            />
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-surface rounded-xl border border-outline/10">
                            <input
                                type="checkbox"
                                checked={editingRule.enabled}
                                onChange={e => setEditingRule({ ...editingRule, enabled: e.target.checked })}
                                id="rule-enabled"
                                className="w-4 h-4 accent-primary"
                            />
                            <label htmlFor="rule-enabled" className="text-xs font-bold">Rule Enabled</label>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={async () => {
                                    const newRules = rules.some(r => r.id === editingRule.id)
                                        ? rules.map(r => r.id === editingRule.id ? editingRule : r)
                                        : [...rules, editingRule];
                                    await DockerClient.updateKafkaRules(newRules);
                                    setShowRuleModal(false);
                                    fetchRules();
                                }}
                                className="flex-1 bg-primary text-primary-foreground py-3 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 active:scale-[0.98] transition-all"
                            >
                                Save Rule
                            </button>
                            <button
                                onClick={() => setShowRuleModal(false)}
                                className="px-6 py-3 border border-outline/20 rounded-xl text-xs font-bold hover:bg-surface transition-all"
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
