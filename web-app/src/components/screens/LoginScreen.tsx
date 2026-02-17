'use client';

import React, { useState } from 'react';
import { DockerClient } from '@/lib/api';
import { AuthRequest } from '@/lib/types';

interface LoginScreenProps {
    onLoginSuccess: (token: string) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [requires2FA, setRequires2FA] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const request: AuthRequest = {
            username,
            password,
            otpCode: requires2FA ? otpCode : undefined,
        };

        try {
            const response = await DockerClient.login(request);
            if (response) {
                if (response.requires2FA) {
                    setRequires2FA(true);
                    setOtpCode(''); // Clear OTP field for new attempt
                } else if (response.token) {
                    DockerClient.setAuthToken(response.token);
                    onLoginSuccess(response.token);
                } else {
                    setError('Invalid response from server');
                }
            } else {
                setError('Invalid credentials or 2FA code');
            }
        } catch (err: any) {
            console.error('Login error:', err);
            setError(err?.message || 'An error occurred during login');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
            <div className="w-full max-w-md overflow-hidden rounded-3xl bg-surface/80 backdrop-blur-xl border border-outline/20 shadow-2xl">
                <div className="p-8 md:p-12">
                    <div className="mb-10 text-center">
                        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
                            <svg
                                className="h-9 w-9 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                />
                            </svg>
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-white/70">
                            UCpanel
                        </h1>
                        <p className="mt-2 text-sm text-on-surface-variant">
                            Security gateway for system administration
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {!requires2FA ? (
                            <>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant ml-1">
                                        System Username
                                    </label>
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="w-full rounded-2xl bg-surface border border-outline/20 px-5 py-4 text-foreground placeholder-on-surface-variant outline-none transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                                        placeholder="e.g. admin"
                                        required
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant ml-1">
                                        Administrator Password
                                    </label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full rounded-2xl bg-surface border border-outline/20 px-5 py-4 text-foreground placeholder-on-surface-variant outline-none transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                                        placeholder="Enter access password"
                                        required
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="rounded-2xl bg-blue-500/10 border border-blue-500/20 p-4 mb-2">
                                    <div className="flex gap-3">
                                        <svg className="h-5 w-5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <p className="text-sm text-blue-100/80 leading-relaxed">
                                            Two-factor authentication is enabled. Please enter the code from your authenticator app.
                                        </p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant ml-1">
                                        Verification Code
                                    </label>
                                    <input
                                        type="text"
                                        value={otpCode}
                                        onChange={(e) => setOtpCode(e.target.value)}
                                        className="w-full rounded-2xl bg-surface border border-outline/20 px-5 py-4 text-foreground placeholder-on-surface-variant outline-none transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/10 tracking-[0.5em] text-center text-xl font-mono"
                                        placeholder="000000"
                                        maxLength={6}
                                        required
                                        autoFocus
                                    />
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 animate-shake">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="relative w-full overflow-hidden rounded-2xl bg-primary py-4 font-semibold text-on-surface transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 group"
                        >
                            {loading ? (
                                <div className="flex items-center justify-center gap-2">
                                    <svg className="h-5 w-5 animate-spin text-white" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <span>Verifying...</span>
                                </div>
                            ) : (
                                <span className="flex items-center justify-center gap-2">
                                    {requires2FA ? 'Confirm Code' : 'Sign In'}
                                    <svg
                                        className="h-5 w-5 transition-transform group-hover:translate-x-1"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                    </svg>
                                </span>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 text-center">
                        <p className="text-xs text-on-surface-variant">
                            Protected Workspace &bull; v1.1.2
                        </p>
                    </div>
                </div>
            </div>

            <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.2s cubic-bezier(.36,.07,.19,.97) both;
        }
      `}</style>
        </div>
    );
};

export default LoginScreen;
