'use client';

import { LayoutDashboard, Database, Layers, Settings, Lock, Network, HardDrive } from 'lucide-react';
import { Screen } from '@/lib/types';
import BatteryIndicator from './BatteryIndicator';

interface Props {
    selectedScreen: Screen;
    onScreenChange: (screen: Screen) => void;
}

export default function NavigationRail({ selectedScreen, onScreenChange }: Props) {
    const items: { label: Screen; icon: React.ReactNode }[] = [
        { label: 'Containers', icon: <LayoutDashboard size={24} /> },
        { label: 'Images', icon: <Database size={24} /> },
        { label: 'Compose', icon: <Layers size={24} /> },
        { label: 'Networks', icon: <Network size={24} /> },
        { label: 'Volumes', icon: <HardDrive size={24} /> },
        { label: 'Secrets', icon: <Lock size={24} /> },
    ];

    return (
        <div className="flex flex-col h-full w-20 bg-surface border-r border-white/5 items-center py-6">
            <div className="mb-4 text-primary font-bold text-xl">DM</div>

            <BatteryIndicator />

            <div className="w-8 h-[1px] bg-white/10 mb-6" />

            <div className="flex flex-col gap-4 flex-1">
                {items.map((item) => (
                    <button
                        key={item.label}
                        onClick={() => onScreenChange(item.label)}
                        className={`nav-rail-item ${selectedScreen === item.label ? 'nav-rail-item-active' : 'text-on-surface-variant'}`}
                        title={item.label}
                    >
                        {item.icon}
                        <span className="text-[10px] mt-1">{item.label}</span>
                    </button>
                ))}
            </div>

            <button
                onClick={() => onScreenChange('Settings')}
                className={`nav-rail-item ${selectedScreen === 'Settings' ? 'nav-rail-item-active' : 'text-on-surface-variant'}`}
                title="Settings"
            >
                <Settings size={24} />
                <span className="text-[10px] mt-1">Settings</span>
            </button>
        </div>
    );
}
