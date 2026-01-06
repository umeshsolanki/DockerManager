import React from 'react';

interface TabButtonProps {
    id: string;
    label: string;
    icon?: React.ReactNode;
    active: boolean;
    onClick: (id: string) => void;
    title?: string;
}

export function TabButton({ id, label, icon, active, onClick, title }: TabButtonProps) {
    return (
        <button
            onClick={() => onClick(id)}
            title={title}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black tracking-tight transition-all ${active
                ? 'bg-primary text-on-primary shadow-lg shadow-primary/20'
                : 'text-on-surface-variant hover:bg-white/5'
                }`}
        >
            {icon}
            {label}
        </button>
    );
}

interface TabsListProps {
    children: React.ReactNode;
    className?: string;
}

export function TabsList({ children, className = '' }: TabsListProps) {
    return (
        <div className={`flex bg-surface border border-outline/10 p-1 rounded-xl w-fit ${className}`}>
            {children}
        </div>
    );
}
