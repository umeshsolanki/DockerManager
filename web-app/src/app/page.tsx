'use client';

import React, { useState } from 'react';
import NavigationRail from '@/components/NavigationRail';
import { Screen } from '@/lib/types';
import ContainersScreen from '@/components/screens/ContainersScreen';
import ImagesScreen from '@/components/screens/ImagesScreen';
import ComposeScreen from '@/components/screens/ComposeScreen';
import SettingsScreen from '@/components/screens/SettingsScreen';
import SecretsScreen from '@/components/screens/SecretsScreen';

export default function Home() {
  const [selectedScreen, setSelectedScreen] = useState<Screen>('Containers');

  const renderScreen = () => {
    switch (selectedScreen) {
      case 'Containers': return <ContainersScreen />;
      case 'Images': return <ImagesScreen />;
      case 'Compose': return <ComposeScreen />;
      case 'Secrets': return <SecretsScreen />;
      case 'Settings': return <SettingsScreen />;
      default: return <ContainersScreen />;
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <NavigationRail
        selectedScreen={selectedScreen}
        onScreenChange={setSelectedScreen}
      />
      <main className="flex-1 overflow-y-auto px-8 py-10 md:px-16 lg:px-24">
        {renderScreen()}
      </main>
    </div>
  );
}
