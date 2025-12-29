'use client';

import React, { useEffect, useState } from 'react';
import { Battery, BatteryCharging, BatteryFull } from 'lucide-react';
import { DockerClient } from '@/lib/api';
import { BatteryStatus } from '@/lib/types';

export default function BatteryIndicator() {
    const [status, setStatus] = useState<BatteryStatus | null>(null);

    useEffect(() => {
        const fetchStatus = async () => {
            const data = await DockerClient.getBatteryStatus();
            setStatus(data);
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, 15 * 60 * 1000); // 15 minutes
        return () => clearInterval(interval);
    }, []);

    if (!status || status.percentage < 0) return null;

    return (
        <div className="flex flex-col items-center gap-1 py-4">
            {status.isCharging ? (
                <BatteryCharging size={20} className="text-green-500" />
            ) : status.percentage > 80 ? (
                <BatteryFull size={20} className="text-on-surface-variant" />
            ) : (
                <Battery size={20} className="text-on-surface-variant" />
            )}
            <span className="text-[10px] text-on-surface-variant font-medium">
                {status.percentage}%
            </span>
        </div>
    );
}
