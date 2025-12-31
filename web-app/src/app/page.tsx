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

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedScreen, setSelectedScreen] = useState<Screen>('Dashboard');

  // Initialize from URL on mount
  useEffect(() => {
    const screenParam = searchParams.get('screen') as Screen;
    const validScreens: Screen[] = ['Dashboard', 'Containers', 'Images', 'Compose', 'Networks', 'Volumes', 'Secrets', 'Logs', 'Firewall', 'Proxy', 'Settings'];
    if (screenParam && validScreens.includes(screenParam)) {
      setSelectedScreen(screenParam);
    }
  }, [searchParams]);

  // Update document title dynamically
  useEffect(() => {
    document.title = `${selectedScreen} | Docker Manager`;
  }, [selectedScreen]);

  const handleScreenChange = (screen: Screen) => {
    setSelectedScreen(screen);
    // Update URL without refreshing the page
    const params = new URLSearchParams(searchParams.toString());
    params.set('screen', screen);
    router.push(`?${params.toString()}`);
  };

  const renderScreen = () => {
    switch (selectedScreen) {
      case 'Dashboard': return <DashboardScreen />;
      case 'Containers': return <ContainersScreen />;
      case 'Images': return <ImagesScreen />;
      case 'Compose': return <ComposeScreen />;
      case 'Networks': return <NetworksScreen />;
      case 'Volumes': return <VolumesScreen />;
      case 'Secrets': return <SecretsScreen />;
      case 'Logs': return <LogsScreen />;
      case 'Firewall': return <FirewallScreen />;
      case 'Proxy': return <ProxyScreen />;
      case 'Settings': return <SettingsScreen />;
      default: return <DashboardScreen />;
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <NavigationRail
        selectedScreen={selectedScreen}
        onScreenChange={handleScreenChange}
      />
      <main className="flex-1 overflow-y-auto px-6 py-6 md:px-10 lg:px-16">
        {renderScreen()}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-background">Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}

