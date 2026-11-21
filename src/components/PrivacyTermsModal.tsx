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
              <h3>1. Chiffrement de bout en bout (AES-256-GCM)</h3>
            </div>
            <p>
              Lorsque l’option E2EE est activée, vos textes, métadonnées, photos, vidéos, documents et pistes audio sont chiffrés directement dans votre navigateur via Web Crypto (AES-256-GCM) avant tout envoi vers le serveur. Les fichiers volumineux sont découpés et chiffrés par blocs de 2 Mo.
            </p>
            <p>
              La clé secrète de déchiffrement est placée uniquement dans le fragment de l’URL (<code className="font-mono text-xs bg-white px-1 rounded">#k=...</code>). Les navigateurs n’envoient pas le fragment URL dans les requêtes HTTP au serveur, et les en-têtes <code className="font-mono text-xs bg-white px-1 rounded">Referrer-Policy: no-referrer</code> limitent toute fuite vers des sites tiers.
            </p>
          </section>

          <section className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-4 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-[#92400E]">
              <ShieldCheck className="w-4 h-4 text-[#D97706]" aria-hidden="true" />
              <h3>2. Portée réelle et limite de sécurité du fragment URL</h3>
            </div>
            <p className="text-[#78350F]">
              Toute personne qui scanne votre QR code ou détient le lien complet contenant <code className="font-mono text-xs bg-white/80 px-1 rounded">#k=...</code> dispose techniquement de la clé nécessaire pour déchiffrer et consulter le contenu tant que la ressource est active. Partagez uniquement vos QR codes et liens chiffrés avec des destinataires de confiance.
            </p>
            <p className="text-[#78350F]">
              Si la clé du fragment est perdue ou tronquée, SparkQR ne peut pas récupérer ni déchiffrer vos fichiers : le serveur ne possède que des données chiffrées.
            </p>
          </section>

          <section className="rounded-2xl border border-[#E2E6F0] bg-[#FAF9F5] p-4 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-[#111214]">
              <Clock className="w-4 h-4 text-[#4F46E5]" aria-hidden="true" />
              <h3>3. Durée de conservation : 7 jours gratuits ou 1 à 12 mois</h3>
            </div>
            <p>
              Tout contenu hébergé créé avec l’offre gratuite bénéficie d’une conservation serveur de <strong>7 jours</strong> à compter de sa création, avec date et heure exactes de suppression affichées dans <em>Stockage et conservation</em>.
            </p>
            <p>
              Les extensions payantes (1 à 12 mois) sont cumulatives et ajoutent les mois sélectionnés à la date d’expiration en cours sans perte ni interruption des fichiers existants.
            </p>
          </section>

          <section className="rounded-2xl border border-[#E2E6F0] bg-[#FAF9F5] p-4 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-[#111214]">
              <Trash2 className="w-4 h-4 text-[#B91C1C]" aria-hidden="true" />
              <h3>4. Suppression automatique, manuelle et délais techniques</h3>
            </div>
            <p>
              À l’échéance ou sur suppression définitive manuelle, SparkQR supprime immédiatement les métadonnées locales et déclenche la suppression des objets associés dans le stockage S3 Dosya.dev. Un journal technique anonymisé conserve uniquement la référence courte, l’horodatage et les octets libérés (sans aucun contenu privé).
            </p>
            <p className="text-xs text-[#6E7078]">
              Remarque honnête : bien que l’objet actif soit supprimé immédiatement via l’API S3 de Dosya.dev (et re-tenté automatiquement en cas d’incident réseau), des caches réseau intermédiaires ou sauvegardes techniques propres à l’infrastructure de stockage peuvent nécessiter un délai de purge supplémentaire selon la politique du fournisseur.
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
