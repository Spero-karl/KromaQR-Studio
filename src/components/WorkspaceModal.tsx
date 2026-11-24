import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  KeyRound,
  Plus,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import type { WorkspaceInfo } from '../types/qr';

interface WorkspaceModalProps {
  open: boolean;
  workspace: WorkspaceInfo | null;
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
  onCreateNew: (name?: string) => Promise<void>;
  onJoinByCode: (code: string) => Promise<void>;
}

export const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
  open,
  workspace,
  onClose,
  onRename,
  onCreateNew,
  onJoinByCode,
}) => {
  const [nameInput, setNameInput] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [newSpaceName, setNewSpaceName] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [busyAction, setBusyAction] = useState<'rename' | 'create' | 'join' | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open && workspace) {
      setNameInput(workspace.name);
      setStatusMsg(null);
      setErrorMsg(null);
    }
  }, [open, workspace]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !workspace) return null;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(workspace.accessCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Clipboard blocked fallback ignored
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    setBusyAction('rename');
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await onRename(nameInput.trim());
      setStatusMsg('Nom de votre espace mis à jour.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur lors du renommage.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction('create');
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await onCreateNew(newSpaceName.trim() || undefined);
      setNewSpaceName('');
      setStatusMsg('Nouvel espace personnel prêt.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Impossible de créer cet espace.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setBusyAction('join');
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await onJoinByCode(joinCode.trim());
      setJoinCode('');
      setStatusMsg('Espace personnel chargé avec succès.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Code espace introuvable.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0F172A]/60 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        data-testid="workspace-modal"
        className="w-full sm:max-w-lg bg-white dark:bg-[#131926] border border-[#E2E8F0] dark:border-[#242C3D] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-[0_28px_80px_rgba(15,23,42,0.32)] max-h-[90dvh] overflow-y-auto pb-safe space-y-5 animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#4F46E5] text-white flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="workspace-modal-title"
                className="font-display text-lg font-bold text-[#111214] dark:text-[#F1F5F9]"
              >
                Mon espace personnel
              </h2>
              <p className="text-xs text-[#5C5E66] dark:text-[#94A3B8]">
                Vos codes QR et médias restent isolés dans votre espace privé.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-white hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Active Space Code Banner */}
        <div className="rounded-xl p-4 bg-[#EEF2FF]/70 dark:bg-[#1E293B]/80 border border-[#C7D2FE] dark:border-[#334155] space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#4338CA] dark:text-[#A5B4FC]">
              Code d’accès de cet espace
            </span>
            <button
              type="button"
              onClick={() => void handleCopyCode()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-white dark:bg-[#0F172A] text-[#1E293B] dark:text-[#E2E8F0] border border-[#C7D2FE] dark:border-[#334155] hover:bg-[#EEF2FF] dark:hover:bg-[#1E293B] transition-colors cursor-pointer min-h-[36px] whitespace-nowrap shrink-0"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#059669]" aria-hidden="true" />
                  <span>Copié</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#4F46E5] dark:text-[#818CF8]" aria-hidden="true" />
                  <span>Copier le code</span>
                </>
              )}
            </button>
          </div>
          <p
            data-testid="workspace-access-code"
            className="font-mono text-lg font-bold tracking-wider text-[#1E1B4B] dark:text-[#F1F5F9] select-all"
          >
            {workspace.accessCode}
          </p>
          <p className="text-[11px] text-[#475569] dark:text-[#94A3B8] leading-relaxed">
            Conservez ce code pour retrouver votre espace à tout moment.
          </p>
        </div>

        {/* Rename Active Workspace */}
        <form onSubmit={(e) => void handleRenameSubmit(e)} className="space-y-2">
          <label
            htmlFor="workspace-name-input"
            className="block text-xs font-semibold text-[#1E293B] dark:text-[#E2E8F0]"
          >
            Nom de votre espace
          </label>
          <div className="flex gap-2">
            <input
              id="workspace-name-input"
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={48}
              placeholder="Ex. : Atelier Léa"
              className="flex-1 min-w-0 px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#CBD5E1] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#4F46E5]"
            />
            <button
              type="submit"
              disabled={busyAction !== null || !nameInput.trim()}
              className="px-4 py-2.5 text-xs font-semibold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 min-h-[44px]"
            >
              {busyAction === 'rename' ? '...' : 'Renommer'}
            </button>
          </div>
        </form>

        <div className="border-t border-[#E2E8F0] dark:border-[#242C3D] pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Open Existing Workspace via Code */}
          <form onSubmit={(e) => void handleJoinSubmit(e)} className="space-y-2">
            <label
              htmlFor="join-workspace-code"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E293B] dark:text-[#E2E8F0]"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#0D9488] dark:text-[#2DD4BF]" aria-hidden="true" />
              <span>Ouvrir un autre espace</span>
            </label>
            <input
              id="join-workspace-code"
              data-testid="join-workspace-input"
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Code SPK-XXXX-XXXX"
              className="w-full px-3 py-2 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#CBD5E1] dark:border-[#2A3346] rounded-xl uppercase focus:outline-none focus:border-[#0D9488]"
            />
            <button
              type="submit"
              data-testid="join-workspace-btn"
              disabled={busyAction !== null || !joinCode.trim()}
              className="w-full px-3.5 py-2.5 text-xs font-semibold text-[#0F766E] dark:text-[#5EEAD4] bg-[#F0FDFA] dark:bg-[#0F2928] hover:bg-[#CCFBF1] dark:hover:bg-[#134E4A] border border-[#99F6E4] dark:border-[#115E59] rounded-xl transition-colors cursor-pointer disabled:opacity-50 min-h-[44px] whitespace-nowrap"
            >
              {busyAction === 'join' ? 'Ouverture...' : 'Rejoindre cet espace'}
            </button>
          </form>

          {/* Create Brand New Isolated Workspace */}
          <form onSubmit={(e) => void handleCreateSubmit(e)} className="space-y-2">
            <label
              htmlFor="new-workspace-name"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E293B] dark:text-[#E2E8F0]"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#7C3AED] dark:text-[#A78BFA]" aria-hidden="true" />
              <span>Nouvel utilisateur / espace</span>
            </label>
            <input
              id="new-workspace-name"
              data-testid="new-workspace-input"
              type="text"
              value={newSpaceName}
              onChange={(e) => setNewSpaceName(e.target.value)}
              placeholder="Prénom ou nom du projet..."
              className="w-full px-3 py-2 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#CBD5E1] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#7C3AED]"
            />
            <button
              type="submit"
              data-testid="create-workspace-btn"
              disabled={busyAction !== null}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-xl transition-colors cursor-pointer disabled:opacity-50 min-h-[44px] whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{busyAction === 'create' ? 'Création...' : 'Créer un nouvel espace'}</span>
            </button>
          </form>
        </div>

        {statusMsg && (
          <p role="status" className="text-xs font-semibold text-[#059669] dark:text-[#34D399] bg-[#ECFDF5] dark:bg-[#064E3B]/40 border border-[#A7F3D0] dark:border-[#065F46] rounded-xl px-3.5 py-2.5">
            {statusMsg}
          </p>
        )}

        {errorMsg && (
          <p role="alert" className="text-xs font-semibold text-[#B91C1C] dark:text-[#F87171] bg-[#FEF2F2] dark:bg-[#7F1D1D]/30 border border-[#FECACA] dark:border-[#991B1B] rounded-xl px-3.5 py-2.5">
            {errorMsg}
          </p>
        )}
      </div>
    </div>
  );
};
