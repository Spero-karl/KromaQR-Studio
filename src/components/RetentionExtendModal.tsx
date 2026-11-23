import React, { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Loader2, ShieldCheck, X } from 'lucide-react';
import { extendRetentionPlan, fetchPricingInfo, type PricingApiResponse } from '../utils/dynamicApi';
import {
  addMonthsToIso,
  DEFAULT_MONTHLY_PRICES_CENTS,
  formatExactFrenchDateTime,
  formatPaidDurationLabel,
  formatPriceEur,
  PAID_PLAN_MONTHS,
  type PaidPlanMonths,
} from '../utils/retentionPricing';

interface RetentionExtendModalProps {
  open: boolean;
  onClose: () => void;
  targetKind: 'media' | 'collection' | 'dynamic' | 'workspace';
  targetId: string;
  targetTitle: string;
  currentExpiresAt?: string | null;
  onExtended?: (result: {
    months: number;
    updatedCount: number;
    newExpiresAt: string;
  }) => void;
}

export const RetentionExtendModal: React.FC<RetentionExtendModalProps> = ({
  open,
  onClose,
  targetKind,
  targetId,
  targetTitle,
  currentExpiresAt,
  onExtended,
}) => {
  const [selectedMonths, setSelectedMonths] = useState<PaidPlanMonths>(3);
  const [pricingInfo, setPricingInfo] = useState<PricingApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoading(true);
    void fetchPricingInfo()
      .then((res) => setPricingInfo(res))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Impossible de charger les durées.')
      )
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const pricesMap = pricingInfo?.pricing.monthsCents || DEFAULT_MONTHLY_PRICES_CENTS;
  const selectedPriceCents =
    pricesMap[selectedMonths] ?? DEFAULT_MONTHLY_PRICES_CENTS[selectedMonths];
  const selectedLabel = formatPaidDurationLabel(selectedMonths);
  const projectedExpiryIso = addMonthsToIso(currentExpiresAt, selectedMonths);

  const handleConfirmExtension = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await extendRetentionPlan({
        months: selectedMonths,
        targetKind,
        targetId,
      });
      onExtended?.({
        months: res.months,
        updatedCount: res.updatedCount,
        newExpiresAt: res.newExpiresAt,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Impossible d’appliquer la prolongation.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="extend-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#111214]/65 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        data-testid="retention-extend-modal"
        className="w-full max-w-xl bg-white border border-[#E2E6F0] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-safe shadow-2xl space-y-5 max-h-[92dvh] overflow-y-auto animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#EFEFF5]">
          <div className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2563EB]">
              Prolongation de conservation
            </span>
            <h2
              id="extend-modal-title"
              className="font-display text-lg sm:text-xl font-bold text-[#111214] mt-0.5 truncate"
            >
              {targetTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="p-2 text-[#5C5E66] hover:text-[#111214] rounded-xl cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-10 flex items-center justify-center gap-2 text-xs text-[#5C5E66]">
            <Loader2 className="w-4 h-4 animate-spin text-[#2563EB]" aria-hidden="true" />
            <span>Chargement des formules…</span>
          </div>
        ) : (
          <>
            <div>
              <p className="text-xs font-semibold text-[#111214] mb-2.5">
                Choisissez la formule supplémentaire
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {PAID_PLAN_MONTHS.map((m) => {
                  const active = selectedMonths === m;
                  const cents = pricesMap[m] ?? DEFAULT_MONTHLY_PRICES_CENTS[m];
                  return (
                    <button
                      key={m}
                      type="button"
                      data-testid={`extend-month-${m}`}
                      onClick={() => setSelectedMonths(m)}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                        active
                          ? 'border-[#2563EB] bg-[#EFF4FF] shadow-[0_6px_16px_rgba(37,99,235,0.14)]'
                          : 'border-[#E2E6F0] bg-[#FAF9F5] hover:bg-white'
                      }`}
                    >
                      <span className="block text-xs font-bold text-[#111214]">
                        {formatPaidDurationLabel(m)}
                      </span>
                      <span className="block text-sm font-bold text-[#2563EB] tabular-nums mt-1">
                        {formatPriceEur(cents)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-[#DCE6FF] bg-[#F5F8FF] p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#111214]">
                  <CalendarClock className="w-4 h-4 text-[#2563EB]" aria-hidden="true" />
                  <span>Nouvelle date de suppression prévue</span>
                </span>
                <span
                  data-testid="extend-projected-date"
                  className="font-bold text-[#1D4ED8] tabular-nums"
                >
                  {formatExactFrenchDateTime(projectedExpiryIso)}
                </span>
              </div>
              {currentExpiresAt && (
                <p className="text-[11px] text-[#475569] tabular-nums">
                  Échéance actuelle : {formatExactFrenchDateTime(currentExpiresAt)}
                </p>
              )}
              <p className="text-[11px] text-[#475569] leading-relaxed">
                Cumulatif sans perte de données : la nouvelle durée s’ajoute à l’échéance active sans interrompre l’accès à vos fichiers ni au QR code existant.
              </p>
            </div>

            {error && (
              <p role="alert" className="text-xs font-medium text-[#B91C1C]">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#EFEFF5]">
              <div className="inline-flex items-center gap-1.5 text-[11px] text-[#5C5E66]">
                <ShieldCheck className="w-3.5 h-3.5 text-[#059669]" aria-hidden="true" />
                <span>Mise à jour immédiate de la conservation</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 text-xs font-semibold text-[#5C5E66] hover:text-[#111214] rounded-xl cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  data-testid="confirm-extend-btn"
                  disabled={submitting}
                  onClick={() => void handleConfirmExtension()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-[#2563EB] to-[#4F46E5] hover:from-[#1D4ED8] hover:to-[#4338CA] rounded-xl cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  <span>
                    {submitting
                      ? 'Application…'
                      : `Prolonger (+${selectedLabel} · ${formatPriceEur(selectedPriceCents)})`}
                  </span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

