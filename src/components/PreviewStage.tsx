import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  EyeOff,
  FileCode2,
  Lock,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import type { QrConfig, QrSourceState, ScannabilityReport } from '../types/qr';
import { verifySvgQrScannable } from '../utils/exportQr';
import { relativeLuminance } from '../utils/qrLogic';
import { QrCanvasRenderer } from './QrCanvasRenderer';

interface PreviewStageProps {
  isGenerated: boolean;
  payload: string;
  config: QrConfig;
  source: QrSourceState;
  report: ScannabilityReport;
  svgRef: React.RefObject<SVGSVGElement | null>;
  onDownloadPng: () => Promise<void>;
  onDownloadSvg: () => Promise<void>;
  onCopyPng: () => Promise<void>;
  onOpenTargetPreview: () => void;
  onSaveToHistory: () => void;
  onClearGenerated: () => void;
  justSaved: boolean;
  dynamicSlug?: string | null;
  dynamicHasPin?: boolean;
  onOpenProExport?: () => void;
}

export const PreviewStage: React.FC<PreviewStageProps> = ({
  isGenerated,
  payload,
  config,
  source,
  report,
  svgRef,
  onDownloadPng,
  onDownloadSvg,
  onCopyPng,
  onOpenTargetPreview,
  onSaveToHistory,
  onClearGenerated,
  justSaved,
  dynamicSlug,
  dynamicHasPin,
  onOpenProExport,
}) => {
  const [copied, setCopied] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [laserEnabled, setLaserEnabled] = useState(true);
  const [scanLockActive, setScanLockActive] = useState(false);
  const [decodeStatus, setDecodeStatus] = useState<'idle' | 'verified' | 'mismatch'>('idle');
  const [decodedPayload, setDecodedPayload] = useState<string>('');

  const isDarkCard = relativeLuminance(config.cardBackgroundColor) < 0.22;

  const laserColor = config.useCustomEyeColor
    ? config.eyeColor
    : config.gradientType !== 'solid'
    ? config.foregroundSecondaryColor
    : '#1D4ED8';

  useEffect(() => {
    setDecodeStatus('idle');
    setDecodedPayload('');
    if (!isGenerated || !payload) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const svgEl = svgRef.current;
      if (!svgEl) return;
      void verifySvgQrScannable(svgEl, payload).then((res) => {
        if (!cancelled) {
          setDecodeStatus(res.matches ? 'verified' : 'mismatch');
          setDecodedPayload(res.decoded ?? '');
        }
      });
    }, 160);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isGenerated, payload, config, source, svgRef]);

  const triggerSimulatedScan = () => {
    if (!isGenerated) return;
    setScanLockActive(true);
    setTimeout(() => {
      setScanLockActive(false);
      onOpenTargetPreview();
    }, 340);
  };

  const handleCopy = async () => {
    if (!isGenerated) return;
    setExportError(null);
    try {
      await onCopyPng();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Impossible de copier l’image.'
      );
    }
  };

  const handlePng = async () => {
    if (!isGenerated) return;
    setExportError(null);
    try {
      await onDownloadPng();
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Échec de l’export PNG.'
      );
    }
  };

  const handleSvg = async () => {
    if (!isGenerated) return;
    setExportError(null);
    try {
      await onDownloadSvg();
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Échec de l’export SVG.'
      );
    }
  };

  const statusColors =
    report.status === 'optimal'
      ? 'text-[#15803D]'
      : report.status === 'acceptable'
      ? 'text-[#B45309]'
      : 'text-[#B91C1C]';

  return (
    <aside className="lg:sticky lg:top-6">
      <div className="bg-white border border-[#E2E0D8] rounded-2xl p-4 sm:p-5">
        {/* Stage Header: Status + Laser + Scan Preview */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5">
          {isGenerated ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusColors}`}>
                {report.status === 'optimal' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>{report.label}</span>
              </span>
              <span className="text-[11px] font-mono text-[#6E7078] tabular-nums">
                {report.contrastRatio}:1 · {report.effectiveErrorCorrection}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#4B4D54]">
              <Lock className="w-3.5 h-3.5 text-[#1D4ED8]" aria-hidden="true" />
              <span>Confidentialité active</span>
            </div>
          )}

          {isGenerated && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                aria-pressed={laserEnabled}
                onClick={() => setLaserEnabled((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  laserEnabled
                    ? 'border-[#1D4ED8]/30 bg-[#EFF4FF] text-[#1D4ED8]'
                    : 'border-[#E2E0D8] bg-[#FAF9F5] text-[#5C5E66] hover:text-[#111214]'
                }`}
              >
                <ScanLine className="w-3 h-3" aria-hidden="true" />
                <span>{laserEnabled ? 'Laser actif' : 'Laser'}</span>
              </button>

              <button
                type="button"
                onClick={triggerSimulatedScan}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#111214] bg-[#F2F1EB] hover:bg-[#E5E3DA] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
                <span>Simuler le scan</span>
              </button>

              <button
                type="button"
                onClick={onClearGenerated}
                title="Masquer le code QR par confidentialité"
                aria-label="Masquer le code QR"
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-[#5C5E66] hover:text-[#111214] bg-[#FAF9F5] border border-[#E2E0D8] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <EyeOff className="w-3 h-3" aria-hidden="true" />
                <span className="hidden sm:inline">Masquer</span>
              </button>
            </div>
          )}
        </div>

        {/* Adaptive Pedestal: Confidential Locked View vs Generated QR */}
        <div
          className={`rounded-2xl border p-5 sm:p-7 flex flex-col items-center justify-center relative transition-colors duration-300 min-h-[380px] ${
            isGenerated && isDarkCard
              ? 'studio-grid-dark border-[#1F2433]'
              : 'studio-grid-mat border-[#DDDAD0]'
          }`}
        >
          {!isGenerated ? (
            <div
              data-testid="qr-confidential-placeholder"
              className="w-full max-w-[296px] rounded-2xl bg-white/95 border border-[#E2E0D8] p-6 text-center space-y-3 shadow-xs"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#EFF4FF] text-[#1D4ED8] flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" aria-hidden="true" />
              </div>
              <h3 className="font-display text-base font-bold text-[#111214]">
                Code QR masqué
              </h3>
              <p className="text-xs text-[#5C5E66] leading-relaxed">
                Par sécurité et confidentialité, aucun code QR n’est généré ni affiché tant que vous n’avez pas choisi votre contenu et cliqué sur{' '}
                <strong className="text-[#111214]">Générer le code QR</strong>.
              </p>
              <div className="pt-2 border-t border-[#EFECE4] text-[11px] text-[#6E7078] space-y-1">
                <p>1. Choisissez quoi encoder à gauche</p>
                <p>2. Réglez polices, tailles et style</p>
                <p>3. Cliquez sur « Générer le code QR »</p>
              </div>
            </div>
          ) : (
            <>
              <div className="relative w-full max-w-[296px] sm:max-w-[316px]">
                {/* 4 Optical Viewfinder Corner Reticles */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-2.5 z-10"
                >
                  <span
                    className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 rounded-tl-md transition-colors duration-200"
                    style={{
                      borderColor:
                        laserEnabled || scanLockActive
                          ? laserColor
                          : isDarkCard
                          ? '#3A4154'
                          : '#C4C1B6',
                    }}
                  />
                  <span
                    className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 rounded-tr-md transition-colors duration-200"
                    style={{
                      borderColor:
                        laserEnabled || scanLockActive
                          ? laserColor
                          : isDarkCard
                          ? '#3A4154'
                          : '#C4C1B6',
                    }}
                  />
                  <span
                    className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 rounded-bl-md transition-colors duration-200"
                    style={{
                      borderColor:
                        laserEnabled || scanLockActive
                          ? laserColor
                          : isDarkCard
                          ? '#3A4154'
                          : '#C4C1B6',
                    }}
                  />
                  <span
                    className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 rounded-br-md transition-colors duration-200"
                    style={{
                      borderColor:
                        laserEnabled || scanLockActive
                          ? laserColor
                          : isDarkCard
                          ? '#3A4154'
                          : '#C4C1B6',
                    }}
                  />
                </div>

                {/* Interactive QR Card Wrapper */}
                <button
                  type="button"
                  onClick={triggerSimulatedScan}
                  aria-label="Scanner et ouvrir l’aperçu du contenu encodé"
                  className="group relative block w-full text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] cursor-pointer"
                >
                  <div
                    className={`w-full transition-transform duration-200 group-hover:scale-[1.01] ${
                      isDarkCard
                        ? 'drop-shadow-[0_18px_36px_rgba(0,0,0,0.55)]'
                        : 'drop-shadow-[0_16px_32px_rgba(17,18,20,0.12)]'
                    }`}
                  >
                    <QrCanvasRenderer
                      payload={payload}
                      config={config}
                      source={source}
                      svgRef={svgRef}
                    />
                  </div>

                  {/* Luminous Laser Sweep Overlay */}
                  {laserEnabled && (
                    <div
                      data-testid="qr-laser-overlay"
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl z-20"
                    >
                      <div className="qr-laser-beam relative w-full h-full">
                        <div
                          className="absolute bottom-0.5 left-0 right-0 h-16"
                          style={{
                            background: `linear-gradient(to top, ${laserColor}33 0%, ${laserColor}0D 55%, transparent 100%)`,
                          }}
                        />
                        <div
                          className="absolute bottom-0 left-0 right-0 h-[2.5px]"
                          style={{
                            background: `linear-gradient(90deg, transparent 0%, ${laserColor} 16%, #FFFFFF 50%, ${laserColor} 84%, transparent 100%)`,
                            boxShadow: `0 0 12px 2px ${laserColor}, 0 0 24px 4px ${laserColor}66`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Lock-on flash on scan trigger */}
                  {scanLockActive && (
                    <div
                      aria-hidden="true"
                      className="qr-laser-lock-flash pointer-events-none absolute inset-0 rounded-2xl z-30 border-2"
                      style={{
                        borderColor: laserColor,
                        backgroundColor: `${laserColor}1F`,
                      }}
                    />
                  )}
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] font-medium">
                <span className={isDarkCard ? 'text-[#8C95A8]' : 'text-[#6A6960]'}>
                  Cliquez sur la carte pour simuler le scan
                </span>
                {decodeStatus === 'verified' && (
                  <span
                    data-testid="qr-decode-verified"
                    data-decoded-payload={decodedPayload}
                    className="inline-flex items-center gap-1 font-semibold text-[#15803D]"
                  >
                    <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                    <span>Contenu décodé vérifié</span>
                  </span>
                )}
                {decodeStatus === 'mismatch' && (
                  <span
                    data-testid="qr-decode-warning"
                    className="inline-flex items-center gap-1 font-semibold text-[#B45309]"
                  >
                    <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                    <span>Augmentez le contraste ou réduisez le logo</span>
                  </span>
                )}
              </div>

              {dynamicSlug && (
                <div
                  data-testid="dynamic-slug-indicator"
                  className={`mt-2 text-[11px] font-mono text-center ${
                    isDarkCard ? 'text-[#94A3B8]' : 'text-[#5C5E66]'
                  }`}
                >
                  <span>QR Dynamique · /d/{dynamicSlug}</span>
                  {dynamicHasPin && <span> · Protégé par PIN</span>}
                </div>
              )}
            </>
          )}
        </div>

        {exportError && (
          <p role="alert" className="mt-3 text-xs font-medium text-[#B91C1C]">
            {exportError}
          </p>
        )}

        {/* Export & Save Dock (strictly gated on isGenerated) */}
        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled={!isGenerated}
            onClick={handlePng}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>Télécharger PNG HD</span>
          </button>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={!isGenerated}
              onClick={handleSvg}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-[#111214] bg-[#F2F1EB] hover:bg-[#E5E3DA] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileCode2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>SVG</span>
            </button>

            <button
              type="button"
              disabled={!isGenerated}
              onClick={handleCopy}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-[#111214] bg-[#F2F1EB] hover:bg-[#E5E3DA] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#15803D]" aria-hidden="true" />
                  <span>Copié</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Copier</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={!isGenerated}
              onClick={onSaveToHistory}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-[#111214] border border-[#DBD8CE] hover:bg-[#FAF9F5] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {justSaved ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#15803D]" aria-hidden="true" />
                  <span>Sauvé</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Galerie</span>
                </>
              )}
            </button>
          </div>

          {onOpenProExport && (
            <button
              type="button"
              data-testid="open-pro-export-btn"
              disabled={!isGenerated}
              onClick={onOpenProExport}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-[#111214] bg-[#FAF9F5] hover:bg-[#F2F1EB] border border-[#DBD8CE] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#1D4ED8]" aria-hidden="true" />
              <span>Export Pro · PDF A4 · 2400px · Fond transparent</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
