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
        className="w-full sm:max-w-lg bg-white border border-[#E2E8F0] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-[0_28px_80px_rgba(15,23,42,0.28)] max-h-[90dvh] overflow-y-auto pb-safe space-y-5 animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#2563EB] via-[#7C3AED] to-[#EC4899] text-white flex items-center justify-center shrink-0 shadow-[0_6px_16px_rgba(124,58,237,0.28)]">
              <UserCheck className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="workspace-modal-title"
                className="font-display text-lg font-bold text-[#111214]"
              >
                Mon espace personnel
              </h2>
              <p className="text-xs text-[#5C5E66]">
                Vos codes QR et médias restent isolés dans votre espace privé.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#5C5E66] hover:text-[#111214] hover:bg-[#F1F5F9] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Active Space Code Banner */}
        <div className="rounded-2xl p-4 bg-gradient-to-br from-[#EFF6FF] via-[#F5F3FF] to-[#FDF2F8] border border-[#DDD6FE] space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#4338CA]">
              Code d’accès de cet espace
            </span>
            <button
              type="button"
              onClick={() => void handleCopyCode()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-white text-[#1E293B] border border-[#C7D2FE] hover:bg-[#EEF2FF] transition-colors cursor-pointer min-h-[36px]"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#059669]" aria-hidden="true" />
                  <span>Copié</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#4F46E5]" aria-hidden="true" />
                  <span>Copier le code</span>
                </>
              )}
            </button>
          </div>
          <p
            data-testid="workspace-access-code"
            className="font-mono text-lg font-bold tracking-wider text-[#1E1B4B] select-all"
          >
            {workspace.accessCode}
          </p>
          <p className="text-[11px] text-[#475569] leading-relaxed">
            Conservez ce code pour retrouver cet espace depuis un iPhone, une tablette ou un autre ordinateur.
          </p>
        </div>

        {/* Rename Active Workspace */}
        <form onSubmit={(e) => void handleRenameSubmit(e)} className="space-y-2">
          <label
            htmlFor="workspace-name-input"
            className="block text-xs font-semibold text-[#1E293B]"
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
              className="flex-1 min-w-0 px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl focus:outline-none focus:border-[#4F46E5]"
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

        <div className="border-t border-[#E2E8F0] pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Open Existing Workspace via Code */}
          <form onSubmit={(e) => void handleJoinSubmit(e)} className="space-y-2">
            <label
              htmlFor="join-workspace-code"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E293B]"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#0D9488]" aria-hidden="true" />
              <span>Ouvrir un autre espace</span>
            </label>
            <input
              id="join-workspace-code"
              data-testid="join-workspace-input"
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Code SPK-XXXX-XXXX"
              className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl uppercase focus:outline-none focus:border-[#0D9488]"
            />
            <button
              type="submit"
              data-testid="join-workspace-btn"
              disabled={busyAction !== null || !joinCode.trim()}
              className="w-full px-3.5 py-2.5 text-xs font-semibold text-[#0F766E] bg-[#F0FDFA] hover:bg-[#CCFBF1] border border-[#99F6E4] rounded-xl transition-colors cursor-pointer disabled:opacity-50 min-h-[44px]"
            >
              {busyAction === 'join' ? 'Ouverture...' : 'Rejoindre cet espace'}
            </button>
          </form>

          {/* Create Brand New Isolated Workspace */}
          <form onSubmit={(e) => void handleCreateSubmit(e)} className="space-y-2">
            <label
              htmlFor="new-workspace-name"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E293B]"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#DB2777]" aria-hidden="true" />
              <span>Nouvel utilisateur / espace</span>
            </label>
            <input
              id="new-workspace-name"
              data-testid="new-workspace-input"
              type="text"
              value={newSpaceName}
              onChange={(e) => setNewSpaceName(e.target.value)}
              placeholder="Prénom ou nom du projet..."
              className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl focus:outline-none focus:border-[#DB2777]"
            />
            <button
              type="submit"
              data-testid="create-workspace-btn"
              disabled={busyAction !== null}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-[#7C3AED] to-[#DB2777] hover:from-[#6D28D9] hover:to-[#BE185D] rounded-xl transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{busyAction === 'create' ? 'Création...' : 'Créer un nouvel espace'}</span>
            </button>
          </form>
        </div>

        {statusMsg && (
          <p role="status" className="text-xs font-semibold text-[#059669] bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl px-3.5 py-2.5">
            {statusMsg}
          </p>
        )}

        {errorMsg && (
          <p role="alert" className="text-xs font-semibold text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-3.5 py-2.5">
            {errorMsg}
          </p>
        )}
      </div>
    </div>
  );
};
