import React, { useEffect } from 'react';
import { DEFAULT_EXPERIENCE } from '../data/presets';
import type { PostScanExperience, QrConfig, QrSourceState } from '../types/qr';
import { extractKeyFromHash } from '../utils/e2eeCrypto';
import { SparkMediaReader } from './SparkMediaReader';

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

  const keyFromPayload = extractKeyFromHash(payload) || source.e2eeKeyFragment || null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="target-preview-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#090B12]/72 backdrop-blur-sm p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        data-testid="scan-showcase-backdrop"
        className="relative w-full max-w-3xl max-h-[92dvh] overflow-y-auto rounded-2xl sm:rounded-3xl shadow-[0_32px_90px_rgba(9,11,18,0.52)] animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <SparkMediaReader
          source={source}
          config={config}
          payload={payload}
          experience={experience}
          dynamicSlug={dynamicSlug}
          dynamicHasPin={dynamicHasPin}
          isEncrypted={Boolean(source.e2eeEnabled && keyFromPayload)}
          e2eeKey={keyFromPayload}
          standalone={false}
          onClose={onClose}
        />
      </div>
    </div>
  );
};
