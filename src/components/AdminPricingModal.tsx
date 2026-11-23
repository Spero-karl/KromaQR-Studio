import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  Save,
  X,
} from 'lucide-react';
import {
  claimAdminPasscode,
  fetchAdminStatus,
  fetchPricingInfo,
  loginAdminPasscode,
  saveAdminPricing,
  type AdminStatusResponse,
} from '../utils/dynamicApi';
import {
  DEFAULT_MONTHLY_PRICES_CENTS,
  formatPaidDurationLabel,
  PAID_PLAN_MONTHS,
} from '../utils/retentionPricing';

interface AdminPricingModalProps {
  open: boolean;
  onClose: () => void;
  onPricingSaved?: () => void;
}

export const AdminPricingModal: React.FC<AdminPricingModalProps> = ({
  open,
  onClose,
  onPricingSaved,
}) => {
  const [status, setStatus] = useState<AdminStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Month -> Euro string for crisp manual decimal entry (e.g., "2.90")
  const [euroInputs, setEuroInputs] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSavedNotice(null);
    setLoading(true);
    void Promise.all([fetchAdminStatus(), fetchPricingInfo()])
      .then(([st, pr]) => {
        setStatus(st);
        const nextInputs: Record<number, string> = {};
        for (const m of PAID_PLAN_MONTHS) {
          const cents = pr.pricing.monthsCents[m] ?? DEFAULT_MONTHLY_PRICES_CENTS[m];
          nextInputs[m] = (cents / 100).toFixed(2);
        }
        setEuroInputs(nextInputs);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Impossible de charger la console.')
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

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAuthLoading(true);
    try {
      const token = status?.needsInitialClaim
        ? await claimAdminPasscode(passcode)
        : await loginAdminPasscode(passcode);
      setAdminToken(token);
      setPasscode('');
      const refreshed = await fetchAdminStatus();
      setStatus(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentification impossible.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSavePrices = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    setError(null);
    setSavedNotice(null);

    const payloadCents: Record<number, number> = {};
    for (const m of PAID_PLAN_MONTHS) {
      const parsed = Number((euroInputs[m] || '0').replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed < 0.5) {
        setError(`Tarif invalide pour ${formatPaidDurationLabel(m)} (minimum 0,50 €).`);
        return;
      }
      payloadCents[m] = Math.round(parsed * 100);
    }

    setSaving(true);
    try {
      const updated = await saveAdminPricing(adminToken, payloadCents);
      const nextInputs: Record<number, string> = {};
      for (const m of PAID_PLAN_MONTHS) {
        nextInputs[m] = (updated.monthsCents[m] / 100).toFixed(2);
      }
      setEuroInputs(nextInputs);
      setSavedNotice('Tarifs mis à jour et enregistrés sur le serveur.');
      onPricingSaved?.();
    } catch (err) {
      if (err instanceof Error && /expirée|invalide/i.test(err.message)) {
        setAdminToken(null);
      }
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-pricing-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#111214]/65 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        data-testid="admin-pricing-modal"
        className="w-full max-w-2xl bg-white border border-[#E2E6F0] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-safe shadow-2xl space-y-5 max-h-[92dvh] overflow-y-auto animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#EFEFF5]">
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4F46E5]">
              Administration SparkQR
            </span>
            <h2
              id="admin-pricing-title"
              className="font-display text-lg sm:text-xl font-bold text-[#111214] mt-0.5"
            >
              Administration des tarifs
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
            <Loader2 className="w-4 h-4 animate-spin text-[#4F46E5]" aria-hidden="true" />
            <span>Vérification de l’état serveur…</span>
          </div>
        ) : (
          <>
            {!adminToken ? (
              <form onSubmit={(e) => void handleAuthSubmit(e)} className="space-y-3 rounded-2xl border border-[#E2E6F0] p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-[#111214]">
                  <KeyRound className="w-4 h-4 text-[#4F46E5]" aria-hidden="true" />
                  <span>
                    {status?.needsInitialClaim
                      ? 'Définir votre code secret administrateur (première ouverture)'
                      : 'Connexion administrateur'}
                  </span>
                </div>
                <p className="text-[11px] text-[#5C5E66] leading-relaxed">
                  {status?.needsInitialClaim
                    ? 'Aucun code n’est encore défini. Saisissez un code d’au moins 8 caractères pour verrouiller la gestion des tarifs.'
                    : 'Saisissez le code administrateur pour modifier la grille tarifaire (1 mois, 3 mois, 6 mois et 1 an).'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="password"
                    data-testid="admin-passcode-input"
                    required
                    minLength={status?.needsInitialClaim ? 8 : 1}
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Code secret (min. 8 car.)"
                    className="flex-1 min-w-[180px] px-3.5 py-2 text-xs bg-[#FAF9F5] border border-[#DCE2EE] rounded-xl focus:outline-none focus:border-[#4F46E5]"
                  />
                  <button
                    type="submit"
                    data-testid="admin-login-submit"
                    disabled={authLoading}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-xl cursor-pointer disabled:opacity-60"
                  >
                    <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{authLoading ? 'Validation…' : status?.needsInitialClaim ? 'Initialiser' : 'Déverrouiller'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={(e) => void handleSavePrices(e)} className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#111214]">
                    Tarifs des 4 formules (EUR TTC)
                  </span>
                  <span className="text-[11px] text-[#059669] font-semibold">
                    Session active (mémoire)
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {PAID_PLAN_MONTHS.map((m) => (
                    <div key={m} className="p-2.5 rounded-xl border border-[#E2E6F0] bg-[#FAF9F5]">
                      <label
                        htmlFor={`admin-price-${m}`}
                        className="block text-[11px] font-semibold text-[#5C5E66] mb-1"
                      >
                        {formatPaidDurationLabel(m)} (€)
                      </label>
                      <input
                        id={`admin-price-${m}`}
                        data-testid={`admin-price-input-${m}`}
                        type="number"
                        step="0.01"
                        min="0.50"
                        value={euroInputs[m] || ''}
                        onChange={(e) =>
                          setEuroInputs((prev) => ({ ...prev, [m]: e.target.value }))
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-[#DCE2EE] rounded-lg tabular-nums focus:outline-none focus:border-[#4F46E5]"
                      />
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EFEFF5]">
                  <button
                    type="submit"
                    data-testid="admin-save-pricing-btn"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-[#2563EB] to-[#4F46E5] hover:from-[#1D4ED8] hover:to-[#4338CA] rounded-xl cursor-pointer disabled:opacity-60"
                  >
                    <Save className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{saving ? 'Enregistrement…' : 'Enregistrer les tarifs'}</span>
                  </button>
                </div>
              </form>
            )}

            {savedNotice && (
              <p
                data-testid="admin-saved-notice"
                className="flex items-center gap-1.5 text-xs font-semibold text-[#059669]"
              >
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                <span>{savedNotice}</span>
              </p>
            )}

            {error && (
              <p role="alert" className="text-xs font-medium text-[#B91C1C]">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};
