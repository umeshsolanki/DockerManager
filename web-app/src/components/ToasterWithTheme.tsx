'use client';

import { Toaster } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';
import { useEffect, useState } from 'react';

export default function ToasterWithTheme() {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Use system theme until mounted to prevent hydration mismatch
  if (!mounted) {
    return (
      <Toaster 
        richColors 
        theme="system"
        position="bottom-right"
      />
    );
  }
  
  return (
    <Toaster 
      richColors 
      theme={theme === 'dark' ? 'dark' : 'light'}
      position="bottom-right"
    />
  );
}

