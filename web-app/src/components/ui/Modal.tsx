import React, { ReactNode } from 'react';
import { XCircle } from 'lucide-react';

interface ModalProps {
    onClose: () => void;
    title: string;
    description?: string;
    icon?: ReactNode;
    children: ReactNode;
    maxWidth?: string;
    className?: string;
}

export function Modal({
    onClose,
    title,
    description,
    icon,
    children,
    maxWidth = 'max-w-md',
    className = ''
}: ModalProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`bg-surface border border-outline/20 rounded-[32px] w-full ${maxWidth} shadow-2xl p-8 relative ${className}`}>
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-1 text-on-surface-variant/40 hover:text-on-surface transition-colors"
                >
                    <XCircle size={24} />
                </button>

                <div className="flex items-center gap-3 mb-6">
                    {icon && (
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                            {icon}
                        </div>
                    )}
                    <div>
                        <h2 className="text-xl font-bold">{title}</h2>
                        {description && (
                            <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-widest">
                                {description}
                            </p>
                        )}
                    </div>
                </div>

                {children}
            </div>
        </div>
    );
}
