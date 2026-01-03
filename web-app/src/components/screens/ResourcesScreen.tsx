'use client';

import React, { useState } from 'react';
import { Database, Network, HardDrive, Lock } from 'lucide-react';
import ImagesScreen from './ImagesScreen';
import NetworksScreen from './NetworksScreen';
import VolumesScreen from './VolumesScreen';
import SecretsScreen from './SecretsScreen';

import { useRouter, useSearchParams } from 'next/navigation';

type ResourceType = 'Images' | 'Networks' | 'Volumes' | 'Secrets';

interface Props {
    initialTab?: ResourceType;
}

export default function ResourcesScreen({ initialTab = 'Images' }: Props) {
    const [activeTab, setActiveTab] = useState<ResourceType>(initialTab);
    const router = useRouter();
    const searchParams = useSearchParams();

    // Sync state with prop if it changes externally (e.g. via URL)
    React.useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

    const handleTabChange = (tab: ResourceType) => {
        setActiveTab(tab);
        const params = new URLSearchParams(searchParams.toString());
        params.set('screen', tab);
        router.push(`?${params.toString()}`);
    };




    const tabs: { id: ResourceType; label: string; icon: React.ElementType }[] = [
        { id: 'Images', label: 'Images', icon: Database },
        { id: 'Networks', label: 'Networks', icon: Network },
        { id: 'Volumes', label: 'Volumes', icon: HardDrive },
        { id: 'Secrets', label: 'Secrets', icon: Lock },
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'Images': return <ImagesScreen />;
            case 'Networks': return <NetworksScreen />;
            case 'Volumes': return <VolumesScreen />;
            case 'Secrets': return <SecretsScreen />;
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-6 mb-8 border-b border-white/5 pb-0">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}

                            className={`flex items-center gap-2 px-1 py-4 border-b-2 transition-all duration-200 ${activeTab === tab.id
                                ? 'border-primary text-primary'
                                : 'border-transparent text-on-surface-variant hover:text-on-surface'
                                }`}
                        >
                            <Icon size={18} />
                            <span className="font-medium text-sm">{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            <div className="flex-1 overflow-hidden">
                {renderContent()}
            </div>
        </div>
    );
}
