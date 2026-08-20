'use client';
import React, { useEffect, useState } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const getDeferred = () => (window as unknown as { deferredPwaPrompt?: BeforeInstallPromptEvent }).deferredPwaPrompt;

export default function PwaInstallButton() {
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone) {
      setInstalled(true);
      return;
    }
    if (getDeferred()) setCanPrompt(true);
    const onInstallable = () => setCanPrompt(true);
    const onInstalled = () => setInstalled(true);
    window.addEventListener('pwa-installable', onInstallable);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('pwa-installable', onInstallable);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  const handleClick = async () => {
    const deferred = getDeferred();
    if (deferred) {
      deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
      (window as unknown as { deferredPwaPrompt?: BeforeInstallPromptEvent }).deferredPwaPrompt = undefined;
      setCanPrompt(false);
    } else {
      setShowHelp(true);
    }
  };

  return (
    <div className="relative">
      <button onClick={handleClick} title="Install WabaPanel as an app"
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-full transition-colors">
        <Download className="w-4 h-4" />
        <span className="hidden sm:inline">Install App</span>
      </button>
      {showHelp && !canPrompt && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-xl ring-1 ring-gray-100 dark:ring-gray-700 z-50 p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5"><Smartphone className="w-4 h-4" /> Install App</h4>
            <button onClick={() => setShowHelp(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1.5 list-disc pl-4">
            <li><b>iPhone / iPad (Safari):</b> Tap the Share button, then &quot;Add to Home Screen&quot;.</li>
            <li><b>Android (Chrome):</b> Tap the ⋮ menu, then &quot;Install app&quot; or &quot;Add to Home screen&quot;.</li>
            <li><b>Desktop (Chrome / Edge):</b> Click the install icon in the address bar.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
