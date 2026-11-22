import React, { useEffect } from 'react';
import { Clock, Lock, ShieldCheck, Trash2, X } from 'lucide-react';

interface PrivacyTermsModalProps {
  open: boolean;
  onClose: () => void;
}

export const PrivacyTermsModal: React.FC<PrivacyTermsModalProps> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#111214]/65 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        data-testid="privacy-terms-modal"
        className="w-full max-w-2xl bg-white border border-[#E2E6F0] rounded-t-3xl sm:rounded-2xl p-5 sm:p-7 pb-safe shadow-2xl space-y-5 max-h-[92dvh] overflow-y-auto animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#EFEFF5]">
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2563EB]">
              Transparence &amp; Sécurité
            </span>
            <h2
              id="privacy-modal-title"
              className="font-display text-lg sm:text-xl font-bold text-[#111214] mt-0.5"
            >
              Confidentialité &amp; Conditions
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

        <div className="space-y-4 text-xs sm:text-sm text-[#4B4D54] leading-relaxed">
          <section className="rounded-2xl border border-[#DCE6FF] bg-[#F5F8FF] p-4 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-[#111214]">
              <Lock className="w-4 h-4 text-[#2563EB]" aria-hidden="true" />
              <h3>1. Chiffrement de bout en bout</h3>
            </div>
            <p>
              Lorsque la protection de bout en bout est activée, vos textes, images, vidéos et documents sont chiffrés directement depuis votre navigateur avant leur envoi.
            </p>
            <p>
              La clé d’accès est associée uniquement à votre QR code et à son lien complet : vos fichiers ne sont jamais lisibles sans eux.
            </p>
          </section>

          <section className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-4 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-[#92400E]">
              <ShieldCheck className="w-4 h-4 text-[#D97706]" aria-hidden="true" />
              <h3>2. Partage et accès sécurisés</h3>
            </div>
            <p className="text-[#78350F]">
              Toute personne qui scanne votre QR code ou dispose du lien complet peut consulter le contenu tant que celui-ci est actif. Partagez uniquement vos créations privées avec des destinataires de confiance.
            </p>
            <p className="text-[#78350F]">
              Si le lien ou le QR code d’origine est perdu, le contenu protégé ne peut pas être restauré ni déchiffré.
            </p>
          </section>

          <section className="rounded-2xl border border-[#E2E6F0] bg-[#FAF9F5] p-4 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-[#111214]">
              <Clock className="w-4 h-4 text-[#4F46E5]" aria-hidden="true" />
              <h3>3. Durée de conservation : 7 jours gratuits ou 1 à 12 mois</h3>
            </div>
            <p>
              Tout contenu hébergé avec l’offre gratuite reste accessible pendant <strong>7 jours</strong> à compter de sa création, avec date et heure prévues affichées dans votre espace <em>Conservation</em>.
            </p>
            <p>
              Les prolongations (1 à 12 mois) s’ajoutent directement à la durée en cours sans interruption d’accès ni modification de votre QR code.
            </p>
          </section>

          <section className="rounded-2xl border border-[#E2E6F0] bg-[#FAF9F5] p-4 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-[#111214]">
              <Trash2 className="w-4 h-4 text-[#B91C1C]" aria-hidden="true" />
              <h3>4. Suppression automatique et manuelle</h3>
            </div>
            <p>
              À l’échéance prévue ou dès que vous demandez une suppression définitive depuis votre espace, vos contenus et fichiers associés sont immédiatement effacés.
            </p>
          </section>
        </div>

        <div className="flex justify-end pt-2 border-t border-[#EFEFF5]">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-xs font-semibold text-white bg-[#111214] hover:bg-[#27292E] rounded-xl cursor-pointer"
          >
            Compris
          </button>
        </div>
      </div>
    </div>
  );
};
