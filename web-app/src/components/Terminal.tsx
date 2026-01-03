'use client';

import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
    url: string;
    onClose?: () => void;
}

export default function WebShell({ url, onClose }: TerminalProps) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerm | null>(null);
    const socketRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        if (!terminalRef.current) return;

        const term = new XTerm({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            theme: {
                background: '#1a1a1a',
                foreground: '#ffffff',
                cursor: '#ffffff',
                selectionBackground: 'rgba(255, 255, 255, 0.3)'
            },
            convertEol: true
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        fitAddon.fit();

        const wsUrl = url.replace('http', 'ws');
        const socket = new WebSocket(wsUrl);
        socket.binaryType = 'arraybuffer';

        socket.onopen = () => {
            term.write('\r\nConnected to shell...\r\n');
        };

        socket.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                term.write(new Uint8Array(event.data));
            } else {
                term.write(event.data);
            }
        };

        socket.onclose = () => {
            term.write('\r\nDisconnected.\r\n');
            if (onClose) setTimeout(onClose, 2000);
        };

        socket.onerror = (error) => {
            term.write('\r\nError connecting to shell.\r\n');
            console.error(error);
        };

        term.onData((data) => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(data);
            }
        });

        xtermRef.current = term;
        socketRef.current = socket;

        const handleResize = () => {
            fitAddon.fit();
            if (socket.readyState === WebSocket.OPEN) {
                const { cols, rows } = term;
                socket.send(JSON.stringify({ type: 'resize', cols, rows }));
            }
        };
        window.addEventListener('resize', handleResize);

        // Initial resize
        const timer = setTimeout(handleResize, 100);

        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(timer);
            socket.close();
            term.dispose();
        };
    }, [url]);

    return (
        <div className="w-full h-full bg-[#1a1a1a] p-2 rounded-xl border border-outline/10 overflow-hidden">
            <div ref={terminalRef} className="w-full h-full" />
        </div>
    );
}
