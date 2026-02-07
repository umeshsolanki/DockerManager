'use client';

import { LayoutDashboard, Database, Layers, Settings, Lock, Network, HardDrive, FileText, Shield, Globe, Box, Mail, LogOut, Activity, Zap } from 'lucide-react';

import { Screen } from '@/lib/types';
import BatteryIndicator from './BatteryIndicator';
import ThemeToggle from './ui/ThemeToggle';

interface Props {
    selectedScreen: Screen;
    onScreenChange: (screen: Screen) => void;
    onLogout: () => void;
}

export default function NavigationRail({ selectedScreen, onScreenChange, onLogout }: Props) {
    const items: { label: Screen; icon: React.ReactNode }[] = [
        { label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
        { label: 'Docker', icon: <Box size={20} /> },
        { label: 'Analytics', icon: <Activity size={20} /> },
        { label: 'Security', icon: <Lock size={20} /> },
        { label: 'Firewall', icon: <Shield size={20} /> },
        { label: 'Logs', icon: <FileText size={20} /> },
        { label: 'Proxy', icon: <Globe size={20} /> },
        { label: 'Emails', icon: <Mail size={20} /> },
        { label: 'Files', icon: <FileText size={20} /> },
        { label: 'DB', icon: <Database size={20} /> },
        { label: 'Kafka', icon: <Zap size={20} /> },
        { label: 'IP', icon: <Globe size={20} /> }, // Using Globe temporarily
    ];



    return (
        <div className="flex flex-col h-full w-20 bg-surface border-r border-outline/10 items-center py-4">
            <div className="mb-2 text-primary font-bold text-xl tracking-tight">UC</div>

            <BatteryIndicator />

            <div className="w-8 h-[1px] bg-outline/20 my-4" />

            <div className="flex flex-col gap-2 flex-1 overflow-y-auto w-full no-scrollbar">
                {items.map((item) => {
                    const isActive = selectedScreen === item.label ||
                        (item.label === 'Docker' && ['Containers', 'Compose', 'Images', 'Networks', 'Volumes', 'Secrets', 'Resources'].includes(selectedScreen));

                    return (
                        <button
                            key={item.label}
                            onClick={() => onScreenChange(item.label)}
                            className={`nav-rail-item py-2 ${isActive ? 'nav-rail-item-active' : 'text-on-surface-variant'}`}
                            title={item.label}
                        >
                            {item.icon}
                            <span className="text-[9px] mt-1 font-medium">{item.label}</span>
                        </button>
                    );
                })}

            </div>

            <div className="w-8 h-[1px] bg-outline/20 my-4" />

            <ThemeToggle />

            <button
                onClick={() => onScreenChange('Settings')}
                className={`nav-rail-item py-2 ${selectedScreen === 'Settings' ? 'nav-rail-item-active' : 'text-on-surface-variant'}`}
                title="Settings"
            >
                <Settings size={20} />
                <span className="text-[9px] mt-1 font-medium">Settings</span>
            </button>

            <button
                onClick={onLogout}
                className="nav-rail-item py-2 text-red-400 hover:text-red-300 transition-colors mt-2"
                title="Logout"
            >
                <LogOut size={20} />
                <span className="text-[9px] mt-1 font-medium text-on-surface-variant/60">Log Out</span>
            </button>
        </div>
    );
}
