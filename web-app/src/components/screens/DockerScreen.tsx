'use client';

import React, { useState } from 'react';
import { Box, Layers, Database, Network, HardDrive, Lock } from 'lucide-react';
import ContainersScreen from './ContainersScreen';
import ComposeScreen from './ComposeScreen';
import ImagesScreen from './ImagesScreen';
import NetworksScreen from './NetworksScreen';
import VolumesScreen from './VolumesScreen';
import SecretsScreen from './SecretsScreen';

import { useRouter, useSearchParams } from 'next/navigation';

export type DockerTab = 'Containers' | 'Compose' | 'Images' | 'Networks' | 'Volumes' | 'Secrets';

interface Props {
    initialTab?: DockerTab;
}

export default function DockerScreen({ initialTab = 'Containers' }: Props) {
    const [activeTab, setActiveTab] = useState<DockerTab>(initialTab);
    const router = useRouter();
    const searchParams = useSearchParams();

    // Sync state with prop if it changes externally
    React.useEffect(() => {
        if (initialTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);

    const handleTabChange = (tab: DockerTab) => {
        setActiveTab(tab);
        const params = new URLSearchParams(searchParams.toString());
        params.set('screen', 'Docker');
        params.set('tab', tab);
        router.push(`?${params.toString()}`);
    };

    const tabs: { id: DockerTab; label: string; icon: React.ElementType }[] = [
        { id: 'Containers', label: 'Containers', icon: Box },
        { id: 'Compose', label: 'Compose', icon: Layers },
        { id: 'Images', label: 'Images', icon: Database },
        { id: 'Networks', label: 'Networks', icon: Network },
        { id: 'Volumes', label: 'Volumes', icon: HardDrive },
        { id: 'Secrets', label: 'Secrets', icon: Lock },
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'Containers': return <ContainersScreen />;
            case 'Compose': return <ComposeScreen />;
            case 'Images': return <ImagesScreen />;
            case 'Networks': return <NetworksScreen />;
            case 'Volumes': return <VolumesScreen />;
            case 'Secrets': return <SecretsScreen />;
            default: return <ContainersScreen />;
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 mb-10 bg-surface-variant/5 p-1.5 rounded-2xl self-start overflow-x-auto no-scrollbar max-w-full backdrop-blur-sm border border-outline/5">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl transition-all duration-300 shrink-0 font-bold text-xs tracking-wide ${isActive
                                ? 'bg-primary text-on-primary shadow-lg shadow-primary/20 scale-105'
                                : 'text-on-surface-variant hover:text-on-surface hover:bg-white/5 active:scale-95'
                                }`}
                        >
                            <Icon size={16} />
                            <span>{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {renderContent()}
            </div>
        </div>
    );
}
