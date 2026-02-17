import React from 'react';

interface StatCardProps {
    label: string;
    value: string;
    sub?: string;
    color?: 'primary' | 'orange' | 'indigo' | 'red' | 'green' | 'pink' | 'teal';
    icon: React.ReactNode;
    className?: string;
    onClick?: () => void;
}

const colorMap = {
    primary: 'bg-primary/10 text-primary border-primary/10',
    orange: 'bg-orange-500/10 text-orange-500 border-orange-500/10',
    indigo: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/10',
    red: 'bg-red-500/10 text-red-500 border-red-500/10',
    green: 'bg-green-500/10 text-green-500 border-green-500/10',
    pink: 'bg-pink-500/10 text-pink-500 border-pink-500/10',
    teal: 'bg-teal-500/10 text-teal-500 border-teal-500/10',
};

export function StatCard({ label, value, sub, color = 'primary', icon, className = '', onClick }: StatCardProps) {
    return (
        <div
            onClick={onClick}
            className={`bg-surface/30 border border-outline/10 p-5 rounded-[28px] flex flex-col gap-3 transition-all ${onClick ? 'cursor-pointer hover:bg-surface/50 active:scale-95' : ''} ${className}`}
        >
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border shadow-inner ${colorMap[color]}`}>
                {icon}
            </div>
            <div className="flex flex-col">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{label}</span>
                <span className="text-2xl font-black mt-0.5">{value}</span>
                {sub && <span className="text-[10px] font-medium text-on-surface-variant/40 mt-1">{sub}</span>}
            </div>
        </div>
    );
}
