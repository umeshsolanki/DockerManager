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
import LoginScreen from '@/components/screens/LoginScreen';
import { DockerClient } from '@/lib/api';

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedScreen, setSelectedScreen] = useState<Screen>('Dashboard');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Initialize from URL and check auth on mount
  useEffect(() => {
    const screenParam = searchParams.get('screen') as Screen;
    const validScreens: Screen[] = ['Dashboard', 'Containers', 'Images', 'Compose', 'Networks', 'Resources', 'Volumes', 'Secrets', 'Logs', 'Firewall', 'Proxy', 'Emails', 'Settings'];

    if (screenParam && validScreens.includes(screenParam)) {
      setSelectedScreen(screenParam);
    }

    const token = DockerClient.getAuthToken();
    if (token) {
      setAuthToken(token);
      checkAuthStatus();
    } else {
      setIsAuthenticated(false);
    }
  }, []);

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
    setSelectedScreen(screen);
    // Update URL without refreshing the page
    const params = new URLSearchParams(searchParams.toString());
    params.set('screen', screen);
    router.push(`?${params.toString()}`);
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
    return <div className="flex h-screen items-center justify-center bg-background text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
        <p className="text-sm font-medium tracking-wide text-gray-400">Securing Session...</p>
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
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-background text-white">Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}

