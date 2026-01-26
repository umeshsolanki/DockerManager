import React, { ReactNode, useState } from 'react';
import { XCircle, Maximize2, Minimize2 } from 'lucide-react';

interface ModalProps {
    onClose: () => void;
    title: string;
    description?: string;
    icon?: ReactNode;
    children: ReactNode;
    maxWidth?: string;
    className?: string;
    headerActions?: ReactNode;
}

export function Modal({
    onClose,
    title,
    description,
    icon,
    children,
    maxWidth = 'max-w-md',
    className = '',
    headerActions
}: ModalProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    // Expansion logic: maximized dimensions should override specific class heights/widths
    const currentWidth = isExpanded ? 'max-w-[98vw] !w-[98vw]' : maxWidth;
    const currentHeight = isExpanded ? 'h-[98vh] !max-h-none' : '';
    const currentPadding = isExpanded ? 'p-4 sm:p-6' : 'p-5 sm:p-7';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`bg-surface border border-outline/20 rounded-2xl sm:rounded-[32px] w-full shadow-2xl relative transition-all duration-300 flex flex-col min-h-[150px] max-h-[92vh] overflow-hidden ${className} ${currentWidth} ${currentHeight} ${currentPadding}`}>
                <div className="absolute top-6 right-6 flex items-center gap-2">
                    {headerActions}
                    <div className="w-px h-6 bg-outline/10 mx-1" />
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-1 text-on-surface-variant/40 hover:text-primary transition-colors"
                        title={isExpanded ? "Restore Size" : "Maximize"}
                    >
                        {isExpanded ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1 text-on-surface-variant/40 hover:text-red-500 transition-colors"
                        title="Close"
                    >
                        <XCircle size={24} />
                    </button>
                </div>

                <div className="flex items-center gap-3 mb-2 pr-16 text-left">
                    {icon && (
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            {icon}
                        </div>
                    )}
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold truncate">{title}</h2>
                        {description && (
                            <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-widest truncate">
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
