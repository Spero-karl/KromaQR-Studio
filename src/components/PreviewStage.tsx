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
  QrCode,
  ScanLine,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import type { PostScanExperience, QrConfig, QrSourceState, ScannabilityReport } from '../types/qr';
import { verifySvgQrScannable } from '../utils/exportQr';
import { relativeLuminance } from '../utils/qrLogic';
import { encodeSparkQrSharePackage } from '../utils/sharedQrPackage';
import { QrCanvasRenderer } from './QrCanvasRenderer';

interface PreviewStageProps {
  isGenerated: boolean;
  canGenerate?: boolean;
  isGenerating?: boolean;
  payload: string;
  config: QrConfig;
  source: QrSourceState;
  experience?: PostScanExperience;
  report: ScannabilityReport;
  svgRef: React.RefObject<SVGSVGElement | null>;
  onGenerate?: () => void;
  onDownloadPng: () => Promise<void>;
  onDownloadSvg: () => Promise<void>;
  onCopyPng: () => Promise<void>;
  onOpenTargetPreview: () => void;
  onSaveToHistory: () => void;
  onClearGenerated: () => void;
  onToggleLaser?: () => void;
  justSaved: boolean;
  dynamicSlug?: string | null;
  dynamicHasPin?: boolean;
  onOpenProExport?: () => void;
}

export const PreviewStage: React.FC<PreviewStageProps> = ({
  isGenerated,
  canGenerate = false,
  isGenerating = false,
  payload,
  config,
  source,
  experience,
  report,
  svgRef,
  onGenerate,
  onDownloadPng,
  onDownloadSvg,
  onCopyPng,
  onOpenTargetPreview,
  onSaveToHistory,
  onClearGenerated,
  onToggleLaser,
  justSaved,
  dynamicSlug,
  dynamicHasPin,
  onOpenProExport,
}) => {
  const [copied, setCopied] = useState(false);
  const [sharedPackageCopied, setSharedPackageCopied] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [localLaserEnabled, setLocalLaserEnabled] = useState(true);
  const [scanLockActive, setScanLockActive] = useState(false);
  const [decodeStatus, setDecodeStatus] = useState<'idle' | 'verified' | 'mismatch'>('idle');
  const [decodedPayload, setDecodedPayload] = useState<string>('');

  const laserEnabled = onToggleLaser ? config.laserEnabled !== false : localLaserEnabled;
  const handleLaserButtonClick = () => {
    if (onToggleLaser) {
      onToggleLaser();
    } else {
      setLocalLaserEnabled((v) => !v);
    }
  };

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
    }, 320);
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
    <aside className="lg:sticky lg:top-20">
      <div className="bg-white dark:bg-[#131722] border border-[#E2E6F0] dark:border-[#242B3D] rounded-2xl overflow-hidden shadow-[0_8px_28px_rgba(15,23,42,0.05)] dark:shadow-none">
        <div
          aria-hidden="true"
          className="h-0.5 w-full bg-gradient-to-r from-[#2563EB] via-[#4F46E5] to-[#0EA5E9]"
        />
        <div className="p-5 sm:p-6">
          {/* Header: Step 4 + Minimalist Status */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#EFEFF5] dark:border-[#22283A]">
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4F46E5] dark:text-[#818CF8]">
                Étape 4 · Aperçu
              </span>
              <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight text-[#111214] dark:text-[#F1F5F9] mt-0.5">
                Aperçu et exportation
              </h2>
            </div>

          {isGenerated ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                aria-pressed={laserEnabled}
                data-testid="preview-laser-toggle"
                onClick={handleLaserButtonClick}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  laserEnabled
                    ? 'border-[#1D4ED8]/30 bg-[#F4F7FF] text-[#1D4ED8] dark:border-[#60A5FA]/40 dark:bg-[#1E293B] dark:text-[#93C5FD]'
                    : 'border-[#E6E4DC] bg-[#FAF9F5] text-[#5C5E66] hover:text-[#111214] dark:border-[#283145] dark:bg-[#1A202E] dark:text-[#94A3B8] dark:hover:text-white'
                }`}
              >
                <ScanLine className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Laser</span>
              </button>

              <button
                type="button"
                data-testid="preview-test-btn"
                onClick={triggerSimulatedScan}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#111214] dark:text-[#F1F5F9] bg-[#F4F2EC] dark:bg-[#1E2536] hover:bg-[#EAE7DF] dark:hover:bg-[#283147] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Tester</span>
              </button>

              <button
                type="button"
                onClick={onClearGenerated}
                title="Masquer le code QR par confidentialité"
                aria-label="Masquer le code QR"
                className="p-1.5 text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-white bg-[#FAF9F5] dark:bg-[#1A202E] border border-[#E6E4DC] dark:border-[#283145] rounded-xl transition-colors cursor-pointer"
              >
                <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#5C5E66] dark:text-[#94A3B8]">
              <Lock className="w-3.5 h-3.5 text-[#1D4ED8] dark:text-[#60A5FA]" aria-hidden="true" />
              <span>Confidentiel</span>
            </span>
          )}
        </div>

        {/* Enlarged Gallery Pedestal */}
        <div
          className={`mt-4 rounded-2xl border p-6 sm:p-8 flex flex-col items-center justify-center relative transition-colors duration-200 min-h-[420px] sm:min-h-[460px] ${
            isGenerated && isDarkCard
              ? 'studio-grid-dark border-[#1F2433]'
              : 'studio-grid-mat border-[#E4E1D7] dark:border-[#252D40]'
          }`}
        >
          {!isGenerated ? (
            <div
              data-testid="qr-confidential-placeholder"
              className="w-full max-w-[320px] rounded-2xl bg-white/95 dark:bg-[#161B29] border border-[#E6E4DC] dark:border-[#283145] p-6 sm:p-7 text-center space-y-4 shadow-[0_12px_32px_rgba(17,18,20,0.06)] dark:shadow-none"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#F4F7FF] dark:bg-[#1E293B] text-[#1D4ED8] dark:text-[#60A5FA] flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" aria-hidden="true" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display text-base font-bold text-[#111214] dark:text-[#F1F5F9]">
                  Aperçu confidentiel
                </h3>
                <p className="text-xs text-[#5C5E66] dark:text-[#94A3B8] leading-relaxed">
                  Votre QR code reste masqué jusqu’à votre validation finale pour préserver votre confidentialité.
                </p>
              </div>
              {onGenerate && (
                <button
                  type="button"
                  disabled={!canGenerate || isGenerating}
                  onClick={onGenerate}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-[#2563EB] to-[#4F46E5] hover:from-[#1D4ED8] hover:to-[#4338CA] shadow-[0_6px_16px_rgba(37,99,235,0.2)] rounded-xl transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <QrCode className="w-4 h-4" aria-hidden="true" />
                  <span>
                    {isGenerating
                      ? 'Génération…'
                      : canGenerate
                      ? 'Générer mon QR code'
                      : 'Sélectionnez un contenu'}
                  </span>
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="relative w-full max-w-[320px] sm:max-w-[356px] animate-qr-reveal">
                {/* 4 Optical Reticles */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-3 z-10"
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
                  aria-label="Tester et ouvrir la page après scan"
                  className="group relative block w-full text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] cursor-pointer"
                >
                  <div
                    className={`w-full transition-transform duration-200 group-hover:scale-[1.01] ${
                      isDarkCard
                        ? 'drop-shadow-[0_22px_42px_rgba(0,0,0,0.55)]'
                        : 'drop-shadow-[0_18px_36px_rgba(17,18,20,0.12)]'
                    }`}
                  >
                    <QrCanvasRenderer
                      payload={payload}
                      config={config}
                      source={source}
                      svgRef={svgRef}
                    />
                  </div>

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

              {/* Clean Single-line Verification & Contrast Readout (no pill clutter) */}
              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
                <span className={`inline-flex items-center gap-1.5 font-semibold ${statusColors}`}>
                  {report.status === 'optimal' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>{report.label}</span>
                </span>
                <span className={isDarkCard ? 'text-[#8C95A8]' : 'text-[#6E7078] dark:text-[#94A3B8]'} aria-hidden="true">
                  ·
                </span>
                <span
                  className={`font-mono tabular-nums ${
                    isDarkCard ? 'text-[#94A3B8]' : 'text-[#5C5E66] dark:text-[#94A3B8]'
                  }`}
                >
                  {report.contrastRatio}:1 · {report.effectiveErrorCorrection}
                </span>
                {decodeStatus === 'verified' && (
                  <>
                    <span className={isDarkCard ? 'text-[#8C95A8]' : 'text-[#6E7078] dark:text-[#94A3B8]'} aria-hidden="true">
                      ·
                    </span>
                    <span
                      data-testid="qr-decode-verified"
                      data-decoded-payload={decodedPayload}
                      className="inline-flex items-center gap-1 font-semibold text-[#15803D] dark:text-[#4ADE80]"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Décodage vérifié</span>
                    </span>
                  </>
                )}
                {decodeStatus === 'mismatch' && (
                  <span
                    data-testid="qr-decode-warning"
                    className="inline-flex items-center gap-1 font-semibold text-[#B45309] dark:text-[#FBBF24]"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Contraste insuffisant</span>
                  </span>
                )}
              </div>

              {dynamicSlug && (
                <div
                  data-testid="dynamic-slug-indicator"
                  className={`mt-1.5 text-[11px] font-semibold text-center ${
                    isDarkCard ? 'text-[#93C5FD]' : 'text-[#4F46E5] dark:text-[#818CF8]'
                  }`}
                >
                  <span>QR dynamique actif</span>
                  {dynamicHasPin && <span> · Protégé par code PIN</span>}
                </div>
              )}
            </>
          )}
        </div>

        {exportError && (
          <p role="alert" className="mt-3 text-xs font-medium text-[#B91C1C] dark:text-[#F87171]">
            {exportError}
          </p>
        )}

        {/* Export Dock */}
        <div className="mt-4 space-y-2.5">
          <button
            type="button"
            disabled={!isGenerated}
            onClick={handlePng}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-[#2563EB] to-[#4F46E5] hover:from-[#1D4ED8] hover:to-[#4338CA] shadow-[0_6px_18px_rgba(37,99,235,0.22)] hover:-translate-y-0.5 active:scale-[0.985] rounded-xl transition-all duration-200 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>Télécharger PNG HD</span>
          </button>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              disabled={!isGenerated}
              onClick={handleSvg}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#111214] dark:text-[#E2E8F0] bg-[#F4F2EC] dark:bg-[#1E2536] hover:bg-[#EAE7DF] dark:hover:bg-[#283147] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileCode2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>SVG</span>
            </button>

            <button
              type="button"
              disabled={!isGenerated}
              onClick={handleCopy}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#111214] dark:text-[#E2E8F0] bg-[#F4F2EC] dark:bg-[#1E2536] hover:bg-[#EAE7DF] dark:hover:bg-[#283147] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#15803D] dark:text-[#4ADE80]" aria-hidden="true" />
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
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[42px] text-xs font-semibold text-[#111214] dark:text-[#E2E8F0] border border-[#DFDDD4] dark:border-[#2A3348] hover:bg-[#FAF9F5] dark:hover:bg-[#1E2536] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {justSaved ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#15803D] dark:text-[#4ADE80]" aria-hidden="true" />
                  <span>Sauvé</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Sauver</span>
                </>
              )}
            </button>

            <button
              type="button"
              data-testid="copy-share-package-btn"
              disabled={!isGenerated}
              onClick={async () => {
                if (!isGenerated) return;
                try {
                  const code = encodeSparkQrSharePackage({
                    name: config.titleText || 'Code QR SparkQR',
                    payload,
                    source,
                    config: { ...config, laserEnabled },
                    experience,
                  });
                  await navigator.clipboard.writeText(code);
                  setSharedPackageCopied(true);
                  setTimeout(() => setSharedPackageCopied(false), 2200);
                } catch {
                  setExportError('Impossible de copier le code de partage SparkQR.');
                }
              }}
              title="Copier le code SparkQR complet (design et faisceau laser inclus)"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[42px] text-xs font-semibold text-[#4F46E5] dark:text-[#A5B4FC] bg-[#EEF2FF] dark:bg-[#1E2440] hover:bg-[#E0E7FF] dark:hover:bg-[#273054] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sharedPackageCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#15803D] dark:text-[#4ADE80]" aria-hidden="true" />
                  <span>Partagé</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Partager</span>
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
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 min-h-[42px] text-xs font-medium text-[#4B4D54] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-white bg-[#F8F9FC] dark:bg-[#181E2D] hover:bg-[#EFF4FF] dark:hover:bg-[#212A3F] border border-[#E2E6F0] dark:border-[#263044] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#4F46E5] dark:text-[#818CF8]" aria-hidden="true" />
              <span>Export Pro · PDF A4 · 2400px · Fond transparent</span>
            </button>
          )}
        </div>
        </div>
      </div>
    </aside>
  );
};
