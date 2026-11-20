import React, { useEffect } from 'react';
import { DEFAULT_EXPERIENCE } from '../data/presets';
import type { PostScanExperience, QrConfig, QrSourceState } from '../types/qr';
import { KromaMediaReader } from './KromaMediaReader';

interface TargetPreviewModalProps {
  open: boolean;
  onClose: () => void;
  source: QrSourceState;
  config: QrConfig;
  payload: string;
  experience?: PostScanExperience;
  dynamicSlug?: string | null;
  dynamicHasPin?: boolean;
}

export const TargetPreviewModal: React.FC<TargetPreviewModalProps> = ({
  open,
  onClose,
  source,
  config,
  payload,
  experience = DEFAULT_EXPERIENCE,
  dynamicSlug = null,
  dynamicHasPin = false,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const lightboxOpen = Boolean(document.querySelector('[data-testid="reader-image-lightbox"]'));
        if (!lightboxOpen) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="target-preview-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#111214]/70 backdrop-blur-xs p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        data-testid="scan-showcase-backdrop"
        className="relative w-full max-w-4xl max-h-[93vh] overflow-y-auto rounded-3xl shadow-[0_32px_90px_rgba(0,0,0,0.42)]"
        onClick={(e) => e.stopPropagation()}
      >
        <KromaMediaReader
          source={source}
          config={config}
          payload={payload}
          experience={experience}
          dynamicSlug={dynamicSlug}
          dynamicHasPin={dynamicHasPin}
          standalone={false}
          onClose={onClose}
        />
      </div>
    </div>
  );
};
