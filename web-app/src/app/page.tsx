'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import NavigationRail from '@/components/NavigationRail';
import { Screen } from '@/lib/types';
import ContainersScreen from '@/components/screens/ContainersScreen';
import ImagesScreen from '@/components/screens/ImagesScreen';
import ComposeScreen from '@/components/screens/ComposeScreen';
import SettingsScreen from '@/components/screens/SettingsScreen';
import SecretsScreen from '@/components/screens/SecretsScreen';
import NetworksScreen from '@/components/screens/NetworksScreen';
import VolumesScreen from '@/components/screens/VolumesScreen';
import LogsScreen from '@/components/screens/LogsScreen';
import FirewallScreen from '@/components/screens/FirewallScreen';
import ProxyScreen from '@/components/screens/ProxyScreen';
import DashboardScreen from '@/components/screens/DashboardScreen';
import ResourcesScreen from '@/components/screens/ResourcesScreen';
import EmailsScreen from '@/components/screens/EmailsScreen';
import AnalyticsScreen from '@/components/screens/AnalyticsScreen';
import SecurityScreen from '@/components/screens/SecurityScreen';
import LoginScreen from '@/components/screens/LoginScreen';
import FileManagerScreen from '@/components/screens/FileManagerScreen';
import DatabaseScreen from '@/components/screens/DatabaseScreen';
import { DockerClient } from '@/lib/api';

const VALID_SCREENS: Screen[] = ['Dashboard', 'Containers', 'Images', 'Compose', 'Networks', 'Resources', 'Volumes', 'Secrets', 'Logs', 'Firewall', 'Proxy', 'Emails', 'Files', 'Settings', 'Security', 'Analytics', 'DB'];

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 1. Sync screen from URL on initial mount synchronously
  const [selectedScreen, setSelectedScreen] = useState<Screen>(() => {
    if (typeof window === 'undefined') return 'Dashboard';
    const s = new URLSearchParams(window.location.search).get('screen') as Screen;
    return (s && VALID_SCREENS.includes(s)) ? s : 'Dashboard';
  });

  // 2. Immediate Auth State Check
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(() => {
    if (typeof window === 'undefined') return null;
    return DockerClient.getAuthToken() ? null : false;
  });

  const [authToken, setAuthToken] = useState<string | null>(null);

  useEffect(() => {
    const token = DockerClient.getAuthToken();
    if (token) {
      setAuthToken(token);
      checkAuthStatus();
    } else {
      setIsAuthenticated(false);
    }
  }, []);

  // 3. Listen for external URL changes (e.g., back button)
  useEffect(() => {
    const screenParam = searchParams.get('screen') as Screen;
    if (screenParam && VALID_SCREENS.includes(screenParam) && screenParam !== selectedScreen) {
      setSelectedScreen(screenParam);
    }
  }, [searchParams, selectedScreen]);

  const checkAuthStatus = async () => {
    const valid = await DockerClient.checkAuth();
    setIsAuthenticated(valid);
    if (!valid) {
      DockerClient.setAuthToken(null);
      setAuthToken(null);
    }
  };

  // Update document title dynamically
  useEffect(() => {
    document.title = `${selectedScreen} | UCpanel`;
  }, [selectedScreen]);

  const handleScreenChange = (screen: Screen) => {
    if (screen === selectedScreen) return;

    // Immediate state update for zero-latency
    setSelectedScreen(screen);

    // Update URL
    const params = new URLSearchParams(searchParams.toString());
    params.set('screen', screen);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const handleLoginSuccess = (token: string) => {
    setAuthToken(token);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    DockerClient.setAuthToken(null);
    setAuthToken(null);
    setIsAuthenticated(false);
  };

  if (isAuthenticated === null) {
    return <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        <p className="text-sm font-medium tracking-wide text-on-surface-variant">Securing Session...</p>
      </div>
    </div>;
  }

  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const renderScreen = () => {
    switch (selectedScreen) {
      case 'Dashboard': return <DashboardScreen />;
      case 'Containers': return <ContainersScreen />;
      case 'Compose': return <ComposeScreen />;
      case 'Images':
      case 'Networks':
      case 'Volumes':
      case 'Secrets':
      case 'Resources': return <ResourcesScreen initialTab={(selectedScreen === 'Resources' ? 'Images' : selectedScreen) as any} />;
      case 'Logs': return <LogsScreen />;
      case 'Firewall': return <FirewallScreen />;
      case 'Proxy': return <ProxyScreen />;
      case 'Emails': return <EmailsScreen />;
      case 'Settings': return <SettingsScreen onLogout={handleLogout} />;
      case 'Security': return <SecurityScreen />;
      case 'Analytics': return <AnalyticsScreen />;
      case 'Files': return <FileManagerScreen />;
      case 'DB': return <DatabaseScreen />;
      default: return <DashboardScreen />;
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <NavigationRail
        selectedScreen={selectedScreen}
        onScreenChange={handleScreenChange}
        onLogout={handleLogout}
      />
      <main className="flex-1 overflow-y-auto px-6 py-6 md:px-10 lg:px-16">
        {renderScreen()}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex h-screen bg-background" />}>
      <HomeContent />
    </Suspense>
  );
}

