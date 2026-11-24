import React, { useState } from 'react';
import { Download, Share, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        aria-label="Installer SparkQR"
        title="Installer SparkQR"
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] text-xs font-semibold text-[#1D4ED8] dark:text-[#93C5FD] bg-[#EFF4FF] dark:bg-[#1E293B] hover:bg-[#DBEAFE] dark:hover:bg-[#334155] border border-[#BFDBFE] dark:border-[#334155] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">Installer</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          aria-label="Installer SparkQR"
          title="Installer SparkQR"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] text-xs font-semibold text-[#1D4ED8] dark:text-[#93C5FD] bg-[#EFF4FF] dark:bg-[#1E293B] hover:bg-[#DBEAFE] dark:hover:bg-[#334155] border border-[#BFDBFE] dark:border-[#334155] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">Installer</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#111214]/60 backdrop-blur-xs p-0 sm:p-4"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="w-full max-w-sm bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] rounded-t-3xl sm:rounded-2xl p-5 pb-safe shadow-2xl space-y-4 animate-modal-enter"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 id="ios-install-title" className="font-display text-base font-bold text-[#111214] dark:text-[#F1F5F9]">
                  Ajouter SparkQR
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Fermer"
                  className="p-1.5 text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2.5 text-xs text-[#4B4D54] dark:text-[#CBD5E1] leading-relaxed">
                <li className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-[#EFF4FF] dark:bg-[#1E293B] text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
                    <Share className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <span>
                    1. Touchez le bouton <strong>Partager</strong> dans la barre de Safari.
                  </span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-[#EFF4FF] dark:bg-[#1E293B] text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
                    <PlusSquare className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <span>
                    2. Sélectionnez <strong>Sur l’écran d’accueil</strong>.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 text-xs font-semibold text-white bg-[#111214] dark:bg-[#2563EB] hover:bg-[#27292E] dark:hover:bg-[#1D4ED8] rounded-xl cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
