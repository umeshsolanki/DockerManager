'use client';

import { LayoutDashboard, Database, Layers, Settings, Lock, Network, HardDrive, FileText } from 'lucide-react';
import { Screen } from '@/lib/types';
import BatteryIndicator from './BatteryIndicator';

interface Props {
    selectedScreen: Screen;
    onScreenChange: (screen: Screen) => void;
}

export default function NavigationRail({ selectedScreen, onScreenChange }: Props) {
    const items: { label: Screen; icon: React.ReactNode }[] = [
        { label: 'Containers', icon: <LayoutDashboard size={20} /> },
        { label: 'Images', icon: <Database size={20} /> },
        { label: 'Compose', icon: <Layers size={20} /> },
        { label: 'Networks', icon: <Network size={20} /> },
        { label: 'Volumes', icon: <HardDrive size={20} /> },
        { label: 'Secrets', icon: <Lock size={20} /> },
        { label: 'Logs', icon: <FileText size={20} /> },
    ];

    return (
        <div className="flex flex-col h-full w-20 bg-surface border-r border-white/5 items-center py-4">
            <div className="mb-2 text-primary font-bold text-xl">DM</div>

            <BatteryIndicator />

            <div className="w-8 h-[1px] bg-white/10 my-4" />

            <div className="flex flex-col gap-2 flex-1 overflow-y-auto w-full no-scrollbar">
                {items.map((item) => (
                    <button
                        key={item.label}
                        onClick={() => onScreenChange(item.label)}
                        className={`nav-rail-item py-2 ${selectedScreen === item.label ? 'nav-rail-item-active' : 'text-on-surface-variant'}`}
                        title={item.label}
                    >
                        {item.icon}
                        <span className="text-[9px] mt-1 font-medium">{item.label}</span>
                    </button>
                ))}
            </div>

            <div className="w-8 h-[1px] bg-white/10 my-4" />

            <button
                onClick={() => onScreenChange('Settings')}
                className={`nav-rail-item py-2 ${selectedScreen === 'Settings' ? 'nav-rail-item-active' : 'text-on-surface-variant'}`}
                title="Settings"
            >
                <Settings size={20} />
                <span className="text-[9px] mt-1 font-medium">Settings</span>
            </button>
        </div>
    );
}
