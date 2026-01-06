import React from 'react';
import { Search } from 'lucide-react';

interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

export function SearchInput({ value, onChange, placeholder = "Search...", className = "" }: SearchInputProps) {
    return (
        <div className={`relative flex-1 ${className}`}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
            <input
                type="text"
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-surface border border-outline/20 rounded-xl py-2.5 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary transition-colors"
            />
        </div>
    );
}
