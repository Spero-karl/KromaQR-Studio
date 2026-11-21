import React, { useEffect, useState } from 'react';
import { Download, FileCode2, FileText, Image as ImageIcon, X } from 'lucide-react';
import type { ExportOptions } from '../types/qr';

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  onExport: (options: ExportOptions) => Promise<void>;
}

const RESOLUTIONS: Array<{ width: ExportOptions['width']; label: string; hint: string }> = [
  { width: 600, label: '600 px', hint: 'Web / Mobile' },
  { width: 1200, label: '1200 px', hint: 'HD Standard' },
  { width: 2400, label: '2400 px', hint: 'Impression Pro' },
];

export const ExportModal: React.FC<ExportModalProps> = ({
  open,
  onClose,
  title,
  onExport,
}) => {
  const [options, setOptions] = useState<ExportOptions>({
    format: 'png',
    scope: 'card',
    width: 1200,
    transparentBackground: false,
  });
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleRun = async () => {
    setError(null);
    setExporting(true);
    try {
      await onExport(options);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’exportation.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        data-testid="pro-export-modal"
        className="w-full max-w-md bg-white border border-[#E2E6F0] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-safe shadow-2xl space-y-5 max-h-[92dvh] overflow-y-auto animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="export-modal-title" className="font-display text-lg font-bold text-[#111214]">
              Exportation professionnelle
            </h2>
            <p className="text-xs text-[#6E7078] mt-0.5 truncate">
              {title || 'SparkQR'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fenêtre d’exportation"
            className="p-1.5 text-[#5C5E66] hover:text-[#111214] rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format */}
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-[#111214]">Format de fichier</span>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'png', label: 'PNG HD', icon: ImageIcon },
                { id: 'svg', label: 'SVG Vect.', icon: FileCode2 },
                { id: 'pdf', label: 'PDF A4', icon: FileText },
              ] as const
            ).map((fmt) => {
              const Icon = fmt.icon;
              const active = options.format === fmt.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  data-testid={`export-fmt-${fmt.id}`}
                  onClick={() => setOptions({ ...options, format: fmt.id })}
                  className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'border-[#1D4ED8] bg-[#EFF4FF] text-[#1D4ED8]'
                      : 'border-[#E6E4DC] bg-[#FAF9F5] text-[#2C2E33] hover:bg-white'
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  <span>{fmt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scope */}
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-[#111214]">Zone exportée</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="export-scope-card"
              onClick={() => setOptions({ ...options, scope: 'card' })}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                options.scope === 'card'
                  ? 'border-[#1D4ED8] bg-[#EFF4FF] text-[#1D4ED8]'
                  : 'border-[#E6E4DC] bg-[#FAF9F5] text-[#2C2E33]'
              }`}
            >
              Carte QR complète
            </button>
            <button
              type="button"
              data-testid="export-scope-qr"
              onClick={() => setOptions({ ...options, scope: 'qr-only' })}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                options.scope === 'qr-only'
                  ? 'border-[#1D4ED8] bg-[#EFF4FF] text-[#1D4ED8]'
                  : 'border-[#E6E4DC] bg-[#FAF9F5] text-[#2C2E33]'
              }`}
            >
              QR seul (sans cadre)
            </button>
          </div>
        </div>

        {/* Resolution (PNG / PDF) */}
        {options.format !== 'svg' && (
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-[#111214]">Résolution</span>
            <div className="grid grid-cols-3 gap-2">
              {RESOLUTIONS.map((res) => {
                const active = options.width === res.width;
                return (
                  <button
                    key={res.width}
                    type="button"
                    data-testid={`export-width-${res.width}`}
                    onClick={() => setOptions({ ...options, width: res.width })}
                    className={`py-2 px-2 rounded-xl border text-center transition-colors cursor-pointer ${
                      active
                        ? 'border-[#1D4ED8] bg-[#EFF4FF] text-[#1D4ED8]'
                        : 'border-[#E6E4DC] bg-[#FAF9F5] text-[#2C2E33]'
                    }`}
                  >
                    <span className="block text-xs font-bold tabular-nums">{res.label}</span>
                    <span className="block text-[10px] opacity-75">{res.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Transparent background */}
        <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#FAF9F5] border border-[#E6E4DC] cursor-pointer">
          <input
            type="checkbox"
            data-testid="export-transparent-toggle"
            checked={options.transparentBackground}
            onChange={(e) =>
              setOptions({ ...options, transparentBackground: e.target.checked })
            }
            className="w-4 h-4 mt-0.5 accent-[#1D4ED8]"
          />
          <div>
            <span className="block text-xs font-semibold text-[#111214]">
              Fond transparent
            </span>
            <span className="block text-[11px] text-[#5C5E66]">
              Idéal sur affiche claire ou maquette vectorielle. Vérifiez le contraste si fond sombre.
            </span>
          </div>
        </label>

        {error && (
          <p role="alert" className="text-xs font-medium text-[#B91C1C]">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EFECE4]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[#5C5E66] hover:text-[#111214] rounded-xl cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            data-testid="execute-pro-export-btn"
            disabled={exporting}
            onClick={() => void handleRun()}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-xl transition-colors cursor-pointer disabled:opacity-60"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>{exporting ? 'Préparation...' : 'Télécharger'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
