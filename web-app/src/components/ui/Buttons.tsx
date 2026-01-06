import React, { ReactNode } from 'react';

interface ActionIconButtonProps {
    onClick: () => void;
    icon: ReactNode;
    color?: 'primary' | 'red' | 'green' | 'blue' | 'yellow' | 'gray';
    title?: string;
    disabled?: boolean;
    className?: string;
}

const colorMap = {
    primary: 'hover:bg-primary/10 text-primary',
    red: 'hover:bg-red-500/10 text-red-500',
    green: 'hover:bg-green-500/10 text-green-500',
    blue: 'hover:bg-blue-500/10 text-blue-400',
    yellow: 'hover:bg-yellow-500/10 text-yellow-500',
    gray: 'hover:bg-white/5 text-on-surface-variant',
};

export function ActionIconButton({
    onClick,
    icon,
    color = 'gray',
    title,
    disabled = false,
    className = ''
}: ActionIconButtonProps) {
    return (
        <button
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            disabled={disabled}
            className={`p-1.5 rounded-lg transition-colors ${colorMap[color]} ${disabled ? 'opacity-20 cursor-not-allowed' : ''} ${className}`}
            title={title}
        >
            {React.isValidElement(icon) ? React.cloneElement(icon as any, { size: 14 }) : icon}
        </button>
    );
}

interface PrimaryButtonProps {
    onClick?: () => void;
    children: ReactNode;
    icon?: ReactNode;
    type?: 'button' | 'submit';
    loading?: boolean;
    disabled?: boolean;
    className?: string;
    variant?: 'primary' | 'danger' | 'surface';
}

export function Button({
    onClick,
    children,
    icon,
    type = 'button',
    loading = false,
    disabled = false,
    className = '',
    variant = 'primary'
}: PrimaryButtonProps) {
    const variants = {
        primary: 'bg-primary text-on-primary shadow-primary/20',
        danger: 'bg-red-500 text-white shadow-red-500/20',
        surface: 'bg-surface border border-outline/20 text-on-surface hover:bg-white/5',
    };

    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled || loading}
            className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all whitespace-nowrap text-sm shadow-lg active:scale-[0.98] ${variants[variant]} ${disabled || loading ? 'opacity-50 cursor-not-allowed scale-100' : 'hover:opacity-90'} ${className}`}
        >
            {loading ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : icon}
            {children}
        </button>
    );
}
