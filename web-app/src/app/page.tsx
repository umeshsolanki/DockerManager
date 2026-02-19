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
import DockerScreen from '@/components/screens/DockerScreen';
import EmailsScreen from '@/components/screens/EmailsScreen';
import AnalyticsScreen from '@/components/screens/AnalyticsScreen';
import SecurityScreen from '@/components/screens/SecurityScreen';
import LoginScreen from '@/components/screens/LoginScreen';
import FileManagerScreen from '@/components/screens/FileManagerScreen';
import DatabaseScreen from '@/components/screens/DatabaseScreen';
import KafkaScreen from '@/components/screens/KafkaScreen';
import { DockerClient } from '@/lib/api';

const VALID_SCREENS: Screen[] = ['Dashboard', 'Docker', 'Containers', 'Images', 'Compose', 'Networks', 'Resources', 'Volumes', 'Secrets', 'Logs', 'Firewall', 'Proxy', 'Emails', 'Files', 'Settings', 'Security', 'Analytics', 'DB', 'Kafka', 'IP'];

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 1. Initial Screen State (Stable for SSR)
  const [selectedScreen, setSelectedScreen] = useState<Screen>('Dashboard');

  // 2. Initial Auth State (Stable for SSR)
  // We keep it null initially on both server and client to ensure matching first render.
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const [authToken, setAuthToken] = useState<string | null>(null);

  // 3. Hydration and Initial State Sync
  useEffect(() => {
    // Sync Screen from URL
    const s = searchParams.get('screen') as Screen;
    if (s && VALID_SCREENS.includes(s)) {
      setSelectedScreen(s);
    }

    // Sync Auth Status
    const token = DockerClient.getAuthToken();
    if (token) {
      setAuthToken(token);
      checkAuthStatus();
    } else {
      // Short delay to allow hydration to settle if needed, but usually immediate is fine
      setIsAuthenticated(false);
    }
  }, []);

  // 4. Listen for external URL changes (e.g., back button)
  useEffect(() => {
    const screenParam = searchParams.get('screen') as Screen;
    if (screenParam && VALID_SCREENS.includes(screenParam) && screenParam !== selectedScreen) {
      setSelectedScreen(screenParam);
    }
  }, [searchParams, selectedScreen]);

  const checkAuthStatus = async () => {
    try {
      const valid = await DockerClient.checkAuth();
      setIsAuthenticated(valid);
      if (!valid) {
        DockerClient.setAuthToken(null);
        setAuthToken(null);
      }
    } catch (e) {
      setIsAuthenticated(false);
    }
  };

  // Update document title dynamically
  useEffect(() => {
    document.title = `${selectedScreen} | UCpanel`;
  }, [selectedScreen]);

  const handleScreenChange = (screen: Screen) => {
    if (screen === selectedScreen) return;
    setSelectedScreen(screen);
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
    // Force a full refresh to clear all residual state and redirect to login
    window.location.href = '/';
  };

  if (isAuthenticated === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-sm font-medium tracking-wide text-on-surface-variant">Securing Session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const renderScreen = () => {
    switch (selectedScreen) {
      case 'Dashboard': return <DashboardScreen />;
      case 'Docker': {
        const tab = searchParams.get('tab') as any;
        return <DockerScreen initialTab={tab || 'Containers'} />;
      }
      case 'Containers':
      case 'Compose':
      case 'Images':
      case 'Networks':
      case 'Volumes':
      case 'Secrets':
      case 'Resources': {
        const initialTab = (selectedScreen === 'Resources' ? 'Images' : selectedScreen) as any;
        return <DockerScreen initialTab={initialTab} />;
      }
      case 'Logs': return <LogsScreen />;
      case 'Firewall': return <FirewallScreen />;
      case 'Proxy': return <ProxyScreen />;
      case 'Emails': return <EmailsScreen />;
      case 'Settings': return <SettingsScreen onLogout={handleLogout} />;
      case 'Security': return <SecurityScreen />;
      case 'Analytics': return <AnalyticsScreen />;
      case 'Files': return <FileManagerScreen />;
      case 'DB': return <DatabaseScreen />;
      case 'Kafka': return <KafkaScreen />;
      case 'IP': return <FirewallScreen initialTab="reputation" />;
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

