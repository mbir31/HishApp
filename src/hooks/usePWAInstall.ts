import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      if (localStorage.getItem('hisapp_pwa_installed') === 'true') return true;
    } catch {
      // ignore
    }
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });
  const [isIOS] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const userAgent = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(userAgent);
  });

  useEffect(() => {
    // Detect standalone mode (already installed). The persisted flag is OR-ed
    // in, not overwritten: iOS has no `appinstalled` event, so a doctor who
    // confirmed the manual "Add to Home Screen" flow must stay marked as
    // installed across reloads.
    const checkStandalone = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      let markedManually = false;
      try {
        markedManually = localStorage.getItem('hisapp_pwa_installed') === 'true';
      } catch {
        // ignore
      }
      setIsInstalled(isStandalone || markedManually);
    };

    checkStandalone();

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent browser's default mini-infobar on mobile
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async (): Promise<'accepted' | 'dismissed' | 'unsupported'> => {
    if (!deferredPrompt) {
      return 'unsupported';
    }
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        return 'accepted';
      }
      return 'dismissed';
    } catch {
      return 'unsupported';
    }
  };

  const markInstalled = () => {
    setIsInstalled(true);
    try {
      localStorage.setItem('hisapp_pwa_installed', 'true');
    } catch {
      // ignore
    }
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
    markInstalled,
  };
}
