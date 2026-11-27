import React, { useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Ban,
  Eye,
  EyeOff,
  Italic,
  Layers,
  Palette,
  Plus,
  Redo2,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Sticker,
  Trash2,
  Type,
  Underline,
  Undo2,
  Upload,
} from 'lucide-react';
import {
  COLOR_PALETTES,
  DEFAULT_LAYERS,
  EMOJI_STICKER_CATALOG,
  FILTER_CATALOG,
  FONT_CATALOG,
  FRAME_CATALOG,
  LEGENDARY_THEME_PRESETS,
  MASTER_THEME_PRESETS,
  PREMIUM_THEME_PRESETS,
  STUDIO_THEME_PRESETS,
  TEXTURE_CATALOG,
  THEME_PRESETS,
  UNIQUE_LOGOS,
} from '../data/presets';
import type {
  QrCardTexture,
  QrConfig,
  QrCornerPlacement,
  QrErrorCorrection,
  QrEyeShape,
  QrFontId,
  QrGradientType,
  QrLayerId,
  QrLogoKnockout,
  QrModuleShape,
  QrStickerKind,
  QrTextAlign,
  QrTextOverlay,
} from '../types/qr';
import { moveLayer, toggleLayer } from '../utils/historyReducer';
import { resolveEncodedTextStyle } from '../utils/textStyle';

export type CustomizeCategoryTab =
  | 'models'
  | 'appearance'
  | 'typography'
  | 'elements'
  | 'finishing';

interface CustomizePanelProps {
  config: QrConfig;
  onChange: (next: QrConfig) => void;
  onReset: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  activeTab?: CustomizeCategoryTab;
  onTabChange?: (tab: CustomizeCategoryTab) => void;
}

const CATEGORY_TABS: Array<{
  id: CustomizeCategoryTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'models', label: 'Modèles', icon: Sparkles },
  { id: 'appearance', label: 'Couleurs & Formes', icon: Palette },
  { id: 'typography', label: 'Typographie', icon: Type },
  { id: 'elements', label: 'Logo & Coins', icon: Sticker },
  { id: 'finishing', label: 'Réglages', icon: SlidersHorizontal },
];

const MODULE_SHAPES: Array<{ id: QrModuleShape; label: string }> = [
  { id: 'capsule', label: 'Capsules' },
  { id: 'liquid', label: 'Liquide' },
  { id: 'dots', label: 'Perles' },
  { id: 'mosaic', label: 'Mosaïque' },
  { id: 'starburst', label: 'Étoiles' },
  { id: 'rounded', label: 'Doux' },
  { id: 'square', label: 'Carré' },
];

const EYE_SHAPES: Array<{ id: QrEyeShape; label: string }> = [
  { id: 'frame', label: 'Viseur' },
  { id: 'orbite', label: 'Orbite' },
  { id: 'shield', label: 'Blason' },
  { id: 'leaf', label: 'Feuille' },
  { id: 'circle', label: 'Cercle' },
  { id: 'rounded', label: 'Doux' },
  { id: 'square', label: 'Carré' },
];

const KNOCKOUT_SHAPES: Array<{ id: QrLogoKnockout; label: string }> = [
  { id: 'squircle', label: 'Squircle' },
  { id: 'circle', label: 'Cercle' },
  { id: 'diamond', label: 'Losange' },
  { id: 'none', label: 'Sans fond' },
];

const CORNER_PLACEMENTS: Array<{ id: QrCornerPlacement; label: string }> = [
  { id: 'none', label: 'Aucun' },
  { id: 'all-4', label: '4 coins' },
  { id: 'top-2', label: 'Haut' },
  { id: 'bottom-2', label: 'Bas' },
  { id: 'diagonal', label: 'Diagonale' },
  { id: 'bottom-right', label: 'Bas-droite' },
];

type StickerFilterCategory = 'all' | 'noel' | 'fete' | 'universel';

const STICKER_FILTER_TABS: Array<{ id: StickerFilterCategory; label: string }> = [
  { id: 'all', label: 'Tout' },
  { id: 'noel', label: 'Noël & Hiver' },
  { id: 'fete', label: 'Fête' },
  { id: 'universel', label: 'Universel' },
];

function mapLogoCategoryToFilter(category: string): Exclude<StickerFilterCategory, 'all'> {
  if (category === 'Noël & Hiver') return 'noel';
  if (category === 'Fête') return 'fete';
  return 'universel';
}

function ModuleGlyph({ shape }: { shape: QrModuleShape }) {
  if (shape === 'capsule') {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
        <rect x="2" y="3" width="13" height="5" rx="2.5" fill="currentColor" />
        <circle cx="19.5" cy="5.5" r="2.5" fill="currentColor" />
        <circle cx="4.5" cy="12" r="2.5" fill="currentColor" />
        <rect x="9" y="9.5" width="13" height="5" rx="2.5" fill="currentColor" />
        <rect x="2" y="16" width="11" height="5" rx="2.5" fill="currentColor" />
        <circle cx="18" cy="18.5" r="2.5" fill="currentColor" />
      </svg>
    );
  }
  if (shape === 'liquid') {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
        <path
          d="M4 3 H12 A3 3 0 0 1 15 6 V11 H20 A2 2 0 0 1 22 13 V19 A3 3 0 0 1 19 22 H11 A3 3 0 0 1 8 19 V14 H4 A2 2 0 0 1 2 12 V5 A2 2 0 0 1 4 3 Z"
          fill="currentColor"
        />
      </svg>
    );
  }
  if (shape === 'dots') {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
        <circle cx="5" cy="5" r="2.4" fill="currentColor" />
        <circle cx="12" cy="5" r="2.4" fill="currentColor" />
        <circle cx="19" cy="5" r="2.4" fill="currentColor" />
        <circle cx="5" cy="12" r="2.4" fill="currentColor" />
        <circle cx="19" cy="12" r="2.4" fill="currentColor" />
        <circle cx="12" cy="19" r="2.4" fill="currentColor" />
        <circle cx="19" cy="19" r="2.4" fill="currentColor" />
      </svg>
    );
  }
  if (shape === 'mosaic') {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
        <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1" fill="currentColor" />
        <rect x="10" y="3.5" width="4" height="4" rx="1.5" fill="currentColor" opacity="0.8" />
        <rect x="16" y="2.5" width="5.5" height="5.5" rx="1" fill="currentColor" />
        <rect x="3.5" y="10" width="4" height="4" rx="1.5" fill="currentColor" />
        <rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1" fill="currentColor" />
        <rect x="16" y="16" width="5.5" height="5.5" rx="1" fill="currentColor" />
        <rect x="2.5" y="16" width="5.5" height="5.5" rx="2" fill="currentColor" />
      </svg>
    );
  }
  if (shape === 'starburst') {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
        <path
          d="M7 2 L8.3 5.7 L12 7 L8.3 8.3 L7 12 L5.7 8.3 L2 7 L5.7 5.7 Z M17 2 L18.3 5.7 L22 7 L18.3 8.3 L17 12 L15.7 8.3 L12 7 L15.7 5.7 Z M12 12 L13.4 15.6 L17 17 L13.4 18.4 L12 22 L10.6 18.4 L7 17 L10.6 15.6 Z"
          fill="currentColor"
        />
      </svg>
    );
  }
  if (shape === 'rounded') {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
        <rect x="2.5" y="2.5" width="5" height="5" rx="1.5" fill="currentColor" />
        <rect x="9.5" y="2.5" width="5" height="5" rx="1.5" fill="currentColor" />
        <rect x="16.5" y="9.5" width="5" height="5" rx="1.5" fill="currentColor" />
        <rect x="9.5" y="9.5" width="5" height="5" rx="1.5" fill="currentColor" />
        <rect x="2.5" y="16.5" width="5" height="5" rx="1.5" fill="currentColor" />
        <rect x="16.5" y="16.5" width="5" height="5" rx="1.5" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
      <rect x="2.5" y="2.5" width="5.5" height="5.5" fill="currentColor" />
      <rect x="9.5" y="2.5" width="5.5" height="5.5" fill="currentColor" />
      <rect x="16.5" y="9.5" width="5.5" height="5.5" fill="currentColor" />
      <rect x="9.5" y="9.5" width="5.5" height="5.5" fill="currentColor" />
      <rect x="2.5" y="16.5" width="5.5" height="5.5" fill="currentColor" />
      <rect x="16.5" y="16.5" width="5.5" height="5.5" fill="currentColor" />
    </svg>
  );
}

function EyeGlyph({ shape }: { shape: QrEyeShape }) {
  if (shape === 'frame') {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
        <path
          d="M3 8 V4.5 Q3 3 4.5 3 H8 M16 3 H19.5 Q21 3 21 4.5 V8 M21 16 V19.5 Q21 21 19.5 21 H16 M8 21 H4.5 Q3 21 3 19.5 V16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <rect x="8.5" y="8.5" width="7" height="7" rx="2" fill="currentColor" />
      </svg>
    );
  }
  if (shape === 'orbite') {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.45" />
        <circle cx="12" cy="12" r="3.2" fill="currentColor" />
      </svg>
    );
  }
  if (shape === 'shield') {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
        <path
          d="M7 3 H17 L21 7 V17 L17 21 H7 L3 17 V7 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        />
        <path d="M9.5 8.5 H14.5 L15.5 9.5 V14.5 L14.5 15.5 H9.5 L8.5 14.5 V9.5 Z" fill="currentColor" />
      </svg>
    );
  }
  if (shape === 'leaf') {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
        <path
          d="M9 3 H21 V15 A6 6 0 0 1 15 21 H3 V9 A6 6 0 0 1 9 3 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        />
        <path d="M11 8.5 H15.5 V13 A2.5 2.5 0 0 1 13 15.5 H8.5 V11 A2.5 2.5 0 0 1 11 8.5 Z" fill="currentColor" />
      </svg>
    );
  }
  if (shape === 'circle') {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <circle cx="12" cy="12" r="4" fill="currentColor" />
      </svg>
    );
  }
  if (shape === 'rounded') {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2.3" />
        <rect x="8.5" y="8.5" width="7" height="7" rx="2" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.3" />
      <rect x="8.5" y="8.5" width="7" height="7" fill="currentColor" />
    </svg>
  );
}

export const CustomizePanel: React.FC<CustomizePanelProps> = ({
  config,
  onChange,
  onReset,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  activeTab: controlledTab,
  onTabChange,
}) => {
  const [internalTab, setInternalTab] = useState<CustomizeCategoryTab>('models');
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = (tab: CustomizeCategoryTab) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  // Focused sub-menus inside each top-level menu to keep screens crisp and uncluttered
  const [appearanceSubMenu, setAppearanceSubMenu] = useState<'colors' | 'shapes' | 'frame'>('colors');
  const [typographySubMenu, setTypographySubMenu] = useState<'message' | 'card'>('message');
  const [elementsSubMenu, setElementsSubMenu] = useState<'center' | 'corners'>('center');

  const [centerStickerMode, setCenterStickerMode] = useState<'vector' | 'emoji'>(
    config.centerEmoji && !config.logoId && !config.customLogoDataUrl ? 'emoji' : 'vector'
  );
  const [stickerCategory, setStickerCategory] = useState<StickerFilterCategory>('all');
  const [collectionTab, setCollectionTab] = useState<'all' | 'studio' | 'premium' | 'master' | 'legendary'>('all');
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [resetNotice, setResetNotice] = useState(false);
  const customLogoInputRef = useRef<HTMLInputElement>(null);

  const handleConfirmEditorReset = () => {
    onReset();
    setConfirmResetOpen(false);
    setResetNotice(true);
    window.setTimeout(() => setResetNotice(false), 3200);
  };

  const update = (patch: Partial<QrConfig>) => {
    onChange({ ...config, ...patch });
  };

  const handleCustomLogoFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        update({
          customLogoDataUrl: reader.result,
          logoId: null,
          centerEmoji: null,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const fontKeys = Object.keys(FONT_CATALOG) as QrFontId[];
  const visibleThemes =
    collectionTab === 'all'
      ? THEME_PRESETS
      : THEME_PRESETS.filter((t) => t.collection === collectionTab);
  const filteredLogos =
    stickerCategory === 'all'
      ? UNIQUE_LOGOS
      : UNIQUE_LOGOS.filter((l) => mapLogoCategoryToFilter(l.category) === stickerCategory);
  const filteredEmojis =
    stickerCategory === 'all'
      ? EMOJI_STICKER_CATALOG
      : EMOJI_STICKER_CATALOG.filter((e) => e.category === stickerCategory);
  const activeLayers =
    config.layers && config.layers.length > 0 ? config.layers : DEFAULT_LAYERS;

  const resolvedMsgStyle = resolveEncodedTextStyle(config, '#111214');

  const handleAddExtraText = () => {
    const nextItem: QrTextOverlay = {
      id: `txt-${Date.now().toString(36)}`,
      text: 'Mention VIP',
      xPercent: 50,
      yPercent: 85,
      fontId: config.fontId,
      fontSize: 13,
      color: config.cardTextColor,
      rotation: 0,
    };
    update({ extraTexts: [...(config.extraTexts || []), nextItem] });
  };

  const handleUpdateExtraText = (id: string, patch: Partial<QrTextOverlay>) => {
    update({
      extraTexts: (config.extraTexts || []).map((t) =>
        t.id === id ? { ...t, ...patch } : t
      ),
    });
  };

  const handleRemoveExtraText = (id: string) => {
    update({
      extraTexts: (config.extraTexts || []).filter((t) => t.id !== id),
    });
  };

  const handleMoveLayer = (layerId: QrLayerId, direction: 'up' | 'down') => {
    update({ layers: moveLayer(activeLayers, layerId, direction) });
  };

  const handleToggleLayer = (layerId: QrLayerId) => {
    update({ layers: toggleLayer(activeLayers, layerId) });
  };

  return (
    <section
      aria-labelledby="customize-heading"
      data-testid="customize-stacked-bars"
      className="lux-surface bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] rounded-2xl overflow-hidden shadow-[0_2px_10px_rgba(15,23,42,0.03)] dark:shadow-none transition-colors relative"
    >
      {/* Header + History Controls */}
      <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-[#EFEFF5] dark:border-[#242C3D] bg-[#FAFBFE] dark:bg-[#161D2B] flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4F46E5] dark:text-[#818CF8]">
            Étape 2 · Design
          </span>
          <h2
            id="customize-heading"
            className="font-display text-lg sm:text-xl font-bold tracking-tight text-[#111214] dark:text-[#F1F5F9] mt-0.5"
          >
            Design du QR code
          </h2>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onUndo && (
            <button
              type="button"
              data-testid="undo-btn"
              disabled={!canUndo}
              onClick={onUndo}
              title="Annuler la dernière modification (Ctrl+Z)"
              aria-label="Annuler"
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] text-xs font-medium text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-[#F1F5F9] bg-white dark:bg-[#0F172A] border border-[#E2E6F0] dark:border-[#2A3347] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
            >
              <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Annuler</span>
            </button>
          )}
          {onRedo && (
            <button
              type="button"
              data-testid="redo-btn"
              disabled={!canRedo}
              onClick={onRedo}
              title="Rétablir la modification (Ctrl+Shift+Z)"
              aria-label="Rétablir"
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] text-xs font-medium text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-[#F1F5F9] bg-white dark:bg-[#0F172A] border border-[#E2E6F0] dark:border-[#2A3347] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
            >
              <Redo2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Rétablir</span>
            </button>
          )}
          <button
            type="button"
            data-testid="reset-style-btn"
            onClick={() => setConfirmResetOpen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] text-xs font-semibold text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-[#F1F5F9] bg-white dark:bg-[#0F172A] border border-[#E2E6F0] dark:border-[#2A3347] hover:border-[#CBD5E1] dark:hover:border-[#475569] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Réinitialiser l&apos;éditeur</span>
          </button>
        </div>
      </div>

      {confirmResetOpen && (
        <div
          data-testid="reset-editor-confirm-bar"
          className="px-5 sm:px-6 py-3 bg-[#FFFBEB] dark:bg-[#291F09] border-b border-[#FDE68A] dark:border-[#78350F] flex flex-wrap items-center justify-between gap-2.5 text-xs"
        >
          <span className="font-medium text-[#78350F] dark:text-[#FDE68A]">
            Réinitialiser uniquement le style visuel (couleurs, formes, logo, texte décoratif) ? Votre contenu, vos fichiers et vos QR enregistrés seront conservés.
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="cancel-reset-editor-btn"
              onClick={() => setConfirmResetOpen(false)}
              className="px-3 py-1.5 text-xs font-semibold text-[#5C5E66] dark:text-[#CBD5E1] bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#2A3347] hover:text-[#111214] dark:hover:text-white rounded-lg cursor-pointer whitespace-nowrap shrink-0"
            >
              Annuler
            </button>
            <button
              type="button"
              data-testid="confirm-reset-editor-btn"
              onClick={handleConfirmEditorReset}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#111214] dark:bg-[#2563EB] hover:bg-[#27292E] dark:hover:bg-[#1D4ED8] rounded-lg cursor-pointer whitespace-nowrap shrink-0"
            >
              Confirmer la réinitialisation
            </button>
          </div>
        </div>
      )}

      {resetNotice && !confirmResetOpen && (
        <div
          data-testid="reset-editor-notice"
          className="px-5 sm:px-6 py-2 bg-[#F0FDF4] dark:bg-[#0B291A] border-b border-[#BBF7D0] dark:border-[#14532D] text-xs font-semibold text-[#15803D] dark:text-[#6EE7B7]"
        >
          Éditeur visuel réinitialisé. Votre contenu QR reste intact.
        </div>
      )}

      {/* 5 Clean Ordered Menus */}
      <div className="px-4 sm:px-6 pt-2 bg-[#F8F9FC] dark:bg-[#0F1522] border-b border-[#ECEAF4] dark:border-[#242C3D] flex items-center gap-1 overflow-x-auto no-scrollbar">
        {CATEGORY_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`customize-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] text-xs sm:text-sm font-semibold border-b-2 transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'border-[#2563EB] dark:border-[#60A5FA] text-[#111214] dark:text-[#F8FAFC]'
                  : 'border-transparent text-[#6E7078] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-[#F1F5F9]'
              }`}
            >
              <Icon
                className={`w-3.5 h-3.5 ${
                  active ? 'text-[#2563EB] dark:text-[#60A5FA]' : 'text-[#848791] dark:text-[#64748B]'
                }`}
                aria-hidden="true"
              />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Focused Category Body */}
      <div className="p-5 sm:p-6 space-y-5">
        {/* MENU 1 : MODÈLES */}
        {activeTab === 'models' && (
          <div className="space-y-5 animate-[fadeIn_160ms_ease-out]" data-testid="bar-themes">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex flex-wrap p-1 bg-[#F3F4F8] dark:bg-[#0F1522] border border-[#E6E8F0] dark:border-[#242C3D] rounded-xl gap-1">
                {(
                  [
                    { id: 'all', label: `Toutes · ${THEME_PRESETS.length}` },
                    { id: 'studio', label: `Studio · ${STUDIO_THEME_PRESETS.length}` },
                    { id: 'premium', label: `Ultra Premium · ${PREMIUM_THEME_PRESETS.length}` },
                    { id: 'master', label: `Master · ${MASTER_THEME_PRESETS.length}` },
                    { id: 'legendary', label: `Légendaire · ${LEGENDARY_THEME_PRESETS.length}` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    data-testid={`collection-tab-${tab.id}`}
                    onClick={() => setCollectionTab(tab.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                      collectionTab === tab.id
                        ? 'bg-white dark:bg-[#1E293B] text-[#111214] dark:text-[#F8FAFC] shadow-xs'
                        : 'text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-[#F1F5F9]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              className={`grid grid-cols-1 sm:grid-cols-2 gap-2.5 ${
                collectionTab === 'all' ? 'max-h-[430px] overflow-y-auto pr-1' : ''
              }`}
            >
              {visibleThemes.map((theme) => {
                const isSelected = config.themeId === theme.id;
                const [bgSwatch, fgSwatch, accentSwatch] = theme.swatches;
                const isMaster = theme.collection === 'master';
                const isLegendary = theme.collection === 'legendary';
                const isPremium = theme.collection === 'premium';
                const isBlackFriday = theme.id.includes('black-friday');
                const hasGradient = theme.patch.gradientType && theme.patch.gradientType !== 'solid';
                const eyeFill = theme.patch.eyeColor || accentSwatch || fgSwatch;
                const gradId = `swatch-grad-${theme.id}`;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    data-testid={`theme-preset-${theme.id}`}
                    onClick={() =>
                      update({
                        ...theme.patch,
                        ...(config.cornerStickerPlacement === 'none'
                          ? {
                              cornerStickerColor:
                                theme.patch.logoColor ||
                                theme.patch.eyeColor ||
                                config.cornerStickerColor,
                            }
                          : {}),
                      })
                    }
                    className={`group lux-preset-card flex items-center gap-3 p-3 rounded-xl border text-left cursor-pointer ${
                      isSelected && isBlackFriday
                        ? 'lux-preset-blackfriday border-[#FACC15] ring-2 ring-[#FACC15]/35 bg-gradient-to-br from-[#16120B] via-[#0B0A09] to-[#1F170A] text-white shadow-[0_10px_28px_rgba(234,179,8,0.28)]'
                        : isSelected
                        ? 'border-[#2563EB] dark:border-[#60A5FA] bg-[#F4F8FF] dark:bg-[#1E293B] shadow-[0_6px_18px_rgba(37,99,235,0.16)]'
                        : isBlackFriday
                        ? 'lux-preset-blackfriday border-[#EAB308]/70 dark:border-[#FACC15]/60 bg-gradient-to-br from-[#12100C] via-[#0B0A09] to-[#1A140B] text-white hover:border-[#FACC15]'
                        : isLegendary
                        ? 'border-[#A855F7]/50 dark:border-[#C084FC]/45 bg-[#FCF8FF] dark:bg-[#191126] hover:border-[#9333EA] dark:hover:border-[#E879F9]'
                        : isMaster
                        ? 'border-[#D4AF37]/60 dark:border-[#D4AF37]/45 bg-[#FFFDF8] dark:bg-[#191610] hover:border-[#B45309] dark:hover:border-[#FBBF24]'
                        : isPremium
                        ? 'border-[#CBD5E1] dark:border-[#334155] bg-[#FAFBFD] dark:bg-[#151A2C] hover:border-[#6366F1]'
                        : 'border-[#E2E6F0] dark:border-[#242C3D] bg-[#FAFBFD] dark:bg-[#161D2B] hover:border-[#CBD5E1] dark:hover:border-[#3B4760]'
                    }`}
                  >
                    <svg
                      viewBox="0 0 36 36"
                      aria-hidden="true"
                      className="w-10 h-10 rounded-lg shrink-0 border border-black/15 dark:border-white/15 transition-transform duration-200 group-hover:scale-105"
                    >
                      {hasGradient && (
                        <defs>
                          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor={fgSwatch} />
                            <stop offset="100%" stopColor={accentSwatch} />
                          </linearGradient>
                        </defs>
                      )}
                      <rect x="0" y="0" width="36" height="36" rx="7" fill={bgSwatch} />
                      <rect
                        x="1.5"
                        y="1.5"
                        width="33"
                        height="33"
                        rx="5.5"
                        fill="none"
                        stroke={accentSwatch}
                        strokeOpacity="0.45"
                        strokeWidth="1"
                      />
                      {/* Top-left finder */}
                      <rect x="5" y="5" width="9" height="9" rx="2" fill="none" stroke={eyeFill} strokeWidth="1.8" />
                      <rect x="7.8" y="7.8" width="3.4" height="3.4" rx="0.8" fill={eyeFill} />
                      {/* Top-right finder */}
                      <rect x="22" y="5" width="9" height="9" rx="2" fill="none" stroke={eyeFill} strokeWidth="1.8" />
                      <rect x="24.8" y="7.8" width="3.4" height="3.4" rx="0.8" fill={eyeFill} />
                      {/* Bottom-left finder */}
                      <rect x="5" y="22" width="9" height="9" rx="2" fill="none" stroke={eyeFill} strokeWidth="1.8" />
                      <rect x="7.8" y="24.8" width="3.4" height="3.4" rx="0.8" fill={eyeFill} />
                      {/* Matrix dots */}
                      <g fill={hasGradient ? `url(#${gradId})` : fgSwatch}>
                        <circle cx="18" cy="7" r="1.4" />
                        <circle cx="18" cy="11.5" r="1.4" />
                        <circle cx="7" cy="18" r="1.4" />
                        <circle cx="12" cy="18" r="1.4" />
                        <rect x="16.2" y="16.2" width="3.6" height="3.6" rx="1" fill={accentSwatch} />
                        <circle cx="24" cy="18" r="1.4" />
                        <circle cx="29" cy="18" r="1.4" />
                        <circle cx="18" cy="24" r="1.4" />
                        <circle cx="23.5" cy="23.5" r="1.4" />
                        <circle cx="29" cy="23.5" r="1.4" />
                        <circle cx="18" cy="29" r="1.4" />
                        <circle cx="25" cy="29" r="1.4" />
                        <circle cx="29" cy="29" r="1.4" />
                      </g>
                    </svg>
                    <div className="min-w-0 relative z-10">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`font-display text-xs font-bold truncate ${
                            isBlackFriday
                              ? 'text-[#FEF3C7]'
                              : 'text-[#111214] dark:text-[#F1F5F9]'
                          }`}
                        >
                          {theme.name}
                        </span>
                        {theme.editionBadge ? (
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wider shrink-0 ${
                              isBlackFriday
                                ? 'text-[#FACC15]'
                                : isLegendary
                                ? 'text-[#9333EA] dark:text-[#E879F9]'
                                : 'text-[#B45309] dark:text-[#FBBF24]'
                            }`}
                          >
                            {theme.editionBadge}
                          </span>
                        ) : isMaster ? (
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#B45309] dark:text-[#FBBF24] shrink-0">
                            Master
                          </span>
                        ) : null}
                      </div>
                      <span
                        className={`block text-[11px] line-clamp-2 leading-snug mt-0.5 ${
                          isBlackFriday
                            ? 'text-[#D6D3C9]'
                            : 'text-[#6E7078] dark:text-[#94A3B8]'
                        }`}
                      >
                        {theme.tagline}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-4 border-t border-[#F1EFE9] dark:border-[#242C3D] space-y-2.5">
              <span className="block text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
                Harmonies chromatiques rapides
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {COLOR_PALETTES.map((pal) => {
                  const isSelected =
                    config.foregroundColor.toLowerCase() === pal.fg.toLowerCase() &&
                    config.qrBackgroundColor.toLowerCase() === pal.bg.toLowerCase();
                  return (
                    <button
                      key={pal.id}
                      type="button"
                      onClick={() =>
                        update({
                          themeId: 'custom',
                          foregroundColor: pal.fg,
                          foregroundSecondaryColor: pal.fg2,
                          eyeColor: pal.eye,
                          useCustomEyeColor: true,
                          qrBackgroundColor: pal.bg,
                          cardBackgroundColor: pal.card,
                          cardTextColor: pal.text,
                          logoColor: pal.eye,
                          ...(config.cornerStickerPlacement === 'none'
                            ? { cornerStickerColor: pal.eye }
                            : {}),
                        })
                      }
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                        isSelected
                          ? 'border-[#2563EB] dark:border-[#60A5FA] bg-[#EFF6FF] dark:bg-[#1E293B] text-[#2563EB] dark:text-[#93C5FD]'
                          : 'border-[#E2E6F0] dark:border-[#242C3D] bg-[#FAFBFD] dark:bg-[#161D2B] text-[#2C2E33] dark:text-[#CBD5E1] hover:bg-white dark:hover:bg-[#1B2435]'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="w-3.5 h-3.5 rounded-full border border-black/15 dark:border-white/20 shrink-0"
                        style={{
                          background: `linear-gradient(135deg, ${pal.fg} 50%, ${pal.eye} 50%)`,
                        }}
                      />
                      <span>{pal.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* MENU 2 : COULEURS & FORMES (with 3 focused sub-menus) */}
        {activeTab === 'appearance' && (
          <div className="space-y-5 animate-[fadeIn_160ms_ease-out]" data-testid="bar-colors-filters">
            <div className="inline-flex flex-wrap p-1 bg-[#F3F4F8] dark:bg-[#0F1522] border border-[#E6E8F0] dark:border-[#242C3D] rounded-xl gap-1">
              {(
                [
                  { id: 'colors', label: 'Couleurs' },
                  { id: 'shapes', label: 'Motifs QR' },
                  { id: 'frame', label: 'Cadre & Effets' },
                ] as const
              ).map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  data-testid={`appearance-sub-${sub.id}`}
                  onClick={() => setAppearanceSubMenu(sub.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    appearanceSubMenu === sub.id
                      ? 'bg-white dark:bg-[#1E293B] text-[#111214] dark:text-[#F8FAFC] shadow-2xs'
                      : 'text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-[#F1F5F9]'
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            {appearanceSubMenu === 'colors' && (
              <div className="space-y-4 animate-[fadeIn_140ms_ease-out]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
                    Type de coloration
                  </span>
                  <div className="inline-flex p-0.5 bg-[#F3F4F8] dark:bg-[#0F1522] border border-[#E6E8F0] dark:border-[#242C3D] rounded-lg gap-0.5">
                    {(
                      [
                        { id: 'solid', label: 'Unie' },
                        { id: 'linear', label: 'Linéaire' },
                        { id: 'radial', label: 'Radial' },
                      ] as Array<{ id: QrGradientType; label: string }>
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => update({ gradientType: m.id, themeId: 'custom' })}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          config.gradientType === m.id
                            ? 'bg-white dark:bg-[#1E293B] text-[#111214] dark:text-[#F8FAFC] shadow-2xs'
                            : 'text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-[#F1F5F9]'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#FAFBFD] dark:bg-[#161D2B] border border-[#E2E6F0] dark:border-[#242C3D] cursor-pointer">
                    <span className="text-xs font-medium text-[#3F4148] dark:text-[#CBD5E1]">Modules</span>
                    <input
                      id="fg-color-1"
                      type="color"
                      aria-label="Couleur principale des modules"
                      value={config.foregroundColor}
                      onChange={(e) => update({ foregroundColor: e.target.value, themeId: 'custom' })}
                      className="w-5 h-5 rounded border border-black/15 bg-white cursor-pointer p-0"
                    />
                  </label>

                  {config.gradientType !== 'solid' && (
                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#FAFBFD] dark:bg-[#161D2B] border border-[#E2E6F0] dark:border-[#242C3D] cursor-pointer">
                      <span className="text-xs font-medium text-[#3F4148] dark:text-[#CBD5E1]">Dégradé</span>
                      <input
                        id="fg-color-2"
                        type="color"
                        aria-label="Couleur secondaire du dégradé"
                        value={config.foregroundSecondaryColor}
                        onChange={(e) =>
                          update({ foregroundSecondaryColor: e.target.value, themeId: 'custom' })
                        }
                        className="w-5 h-5 rounded border border-black/15 bg-white cursor-pointer p-0"
                      />
                    </label>
                  )}

                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#FAFBFD] dark:bg-[#161D2B] border border-[#E2E6F0] dark:border-[#242C3D] cursor-pointer">
                    <span className="text-xs font-medium text-[#3F4148] dark:text-[#CBD5E1]">Fond QR</span>
                    <input
                      id="qr-bg-color"
                      type="color"
                      aria-label="Couleur de fond du QR"
                      value={config.qrBackgroundColor}
                      onChange={(e) => update({ qrBackgroundColor: e.target.value, themeId: 'custom' })}
                      className="w-5 h-5 rounded border border-black/15 bg-white cursor-pointer p-0"
                    />
                  </label>

                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#FAFBFD] dark:bg-[#161D2B] border border-[#E2E6F0] dark:border-[#242C3D] cursor-pointer">
                    <span className="text-xs font-medium text-[#3F4148] dark:text-[#CBD5E1]">Carte</span>
                    <input
                      id="card-bg-color"
                      type="color"
                      aria-label="Couleur de la carte"
                      value={config.cardBackgroundColor}
                      onChange={(e) => update({ cardBackgroundColor: e.target.value, themeId: 'custom' })}
                      className="w-5 h-5 rounded border border-black/15 bg-white cursor-pointer p-0"
                    />
                  </label>

                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#FAFBFD] dark:bg-[#161D2B] border border-[#E2E6F0] dark:border-[#242C3D] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.useCustomEyeColor}
                      onChange={(e) =>
                        update({ useCustomEyeColor: e.target.checked, themeId: 'custom' })
                      }
                      className="w-3.5 h-3.5 rounded accent-[#2563EB]"
                    />
                    <span className="text-xs font-medium text-[#3F4148] dark:text-[#CBD5E1]">Repères</span>
                    {config.useCustomEyeColor && (
                      <input
                        type="color"
                        aria-label="Couleur des repères d’angle"
                        value={config.eyeColor}
                        onChange={(e) => update({ eyeColor: e.target.value, themeId: 'custom' })}
                        className="w-5 h-5 rounded border border-black/15 bg-white cursor-pointer p-0"
                      />
                    )}
                  </label>
                </div>
              </div>
            )}

            {appearanceSubMenu === 'shapes' && (
              <div className="space-y-4 animate-[fadeIn_140ms_ease-out]" data-testid="bar-geometry">
                <div className="space-y-2">
                  <span className="block text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
                    Forme des points (modules)
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {MODULE_SHAPES.map((item) => {
                      const active = config.moduleShape === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => update({ moduleShape: item.id, themeId: 'custom' })}
                          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            active
                              ? 'border-[#2563EB] dark:border-[#60A5FA] bg-[#EFF6FF] dark:bg-[#1E293B] text-[#2563EB] dark:text-[#93C5FD]'
                              : 'border-[#E2E6F0] dark:border-[#242C3D] bg-[#FAFBFD] dark:bg-[#161D2B] text-[#2C2E33] dark:text-[#CBD5E1] hover:bg-white dark:hover:bg-[#1B2435]'
                          }`}
                        >
                          <ModuleGlyph shape={item.id} />
                          <span className="text-xs font-semibold">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-3 border-t border-[#F1EFE9] dark:border-[#242C3D] space-y-2">
                  <span className="block text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
                    Forme des 3 grands repères
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {EYE_SHAPES.map((item) => {
                      const active = config.eyeShape === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => update({ eyeShape: item.id, themeId: 'custom' })}
                          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            active
                              ? 'border-[#2563EB] dark:border-[#60A5FA] bg-[#EFF6FF] dark:bg-[#1E293B] text-[#2563EB] dark:text-[#93C5FD]'
                              : 'border-[#E2E6F0] dark:border-[#242C3D] bg-[#FAFBFD] dark:bg-[#161D2B] text-[#2C2E33] dark:text-[#CBD5E1] hover:bg-white dark:hover:bg-[#1B2435]'
                          }`}
                        >
                          <EyeGlyph shape={item.id} />
                          <span className="text-xs font-semibold">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {appearanceSubMenu === 'frame' && (
              <div className="space-y-4 animate-[fadeIn_140ms_ease-out]">
                <div className="space-y-2">
                  <span className="block text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
                    Cadre de présentation
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {FRAME_CATALOG.map((fr) => {
                      const active = config.frameStyle === fr.id;
                      return (
                        <button
                          key={fr.id}
                          type="button"
                          data-testid={`frame-btn-${fr.id}`}
                          onClick={() => update({ frameStyle: fr.id, themeId: 'custom' })}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            active
                              ? 'border-[#2563EB] dark:border-[#60A5FA] bg-[#EFF6FF] dark:bg-[#1E293B] text-[#2563EB] dark:text-[#93C5FD]'
                              : 'border-[#E2E6F0] dark:border-[#242C3D] bg-[#FAFBFD] dark:bg-[#161D2B] text-[#3F4148] dark:text-[#CBD5E1] hover:bg-white dark:hover:bg-[#1B2435]'
                          }`}
                        >
                          {fr.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-3 border-t border-[#F1EFE9] dark:border-[#242C3D] space-y-2.5">
                  <span className="block text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
                    Matière &amp; bordure
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {TEXTURE_CATALOG.map((tex) => {
                      const active = config.cardTexture === tex.id;
                      return (
                        <button
                          key={tex.id}
                          type="button"
                          onClick={() =>
                            update({ cardTexture: tex.id as QrCardTexture, themeId: 'custom' })
                          }
                          className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            active
                              ? 'border-[#2563EB] dark:border-[#60A5FA] bg-[#EFF6FF] dark:bg-[#1E293B] text-[#2563EB] dark:text-[#93C5FD]'
                              : 'border-[#E2E6F0] dark:border-[#242C3D] bg-[#FAFBFD] dark:bg-[#161D2B] text-[#3F4148] dark:text-[#CBD5E1] hover:bg-white dark:hover:bg-[#1B2435]'
                          }`}
                        >
                          {tex.label}
                        </button>
                      );
                    })}

                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E2E6F0] dark:border-[#242C3D] bg-[#FAFBFD] dark:bg-[#161D2B] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(config.metallicSheen)}
                        onChange={(e) =>
                          update({ metallicSheen: e.target.checked, themeId: 'custom' })
                        }
                        className="w-3.5 h-3.5 accent-[#2563EB]"
                      />
                      <span className="text-xs font-medium text-[#3F4148] dark:text-[#CBD5E1]">Reflet métal</span>
                    </label>

                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#E2E6F0] dark:border-[#242C3D] bg-[#FAFBFD] dark:bg-[#161D2B]">
                      <label htmlFor="card-border-width" className="text-xs font-medium text-[#4B4D54] dark:text-[#CBD5E1]">
                        Bordure
                      </label>
                      <input
                        id="card-border-width"
                        type="range"
                        min={0}
                        max={6}
                        step={0.5}
                        value={config.borderWidth ?? 0}
                        onChange={(e) => update({ borderWidth: Number(e.target.value) })}
                        className="w-16"
                      />
                      <span className="text-xs font-mono text-[#5C5E66] dark:text-[#94A3B8] tabular-nums">
                        {config.borderWidth ?? 0}px
                      </span>
                      <input
                        type="color"
                        aria-label="Couleur de bordure"
                        value={config.borderColor || '#D4AF37'}
                        onChange={(e) => update({ borderColor: e.target.value })}
                        className="w-4 h-4 rounded border border-black/15 cursor-pointer p-0"
                      />
                    </div>
                  </div>
                </div>

                {(config.frameStyle === 'vip-gold' ||
                  config.frameStyle === 'limited' ||
                  config.frameStyle === 'smoked-glass') && (
                  <div className="flex items-center gap-3">
                    <label
                      htmlFor="edition-label-input"
                      className="text-xs font-medium text-[#5C5E66] dark:text-[#94A3B8] shrink-0"
                    >
                      Gravure prestige
                    </label>
                    <input
                      id="edition-label-input"
                      type="text"
                      maxLength={32}
                      value={config.editionLabel || ''}
                      onChange={(e) => update({ editionLabel: e.target.value })}
                      placeholder="ÉDITION LIMITÉE · N° 01"
                      className="flex-1 max-w-xs px-3 py-1.5 text-xs bg-[#FAFBFD] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] text-[#111214] dark:text-[#F1F5F9] rounded-xl"
                    />
                  </div>
                )}

                <div className="pt-3 border-t border-[#F1EFE9] dark:border-[#242C3D] space-y-2">
                  <span className="block text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
                    Filtre artistique
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {FILTER_CATALOG.map((flt) => {
                      const active = config.filter === flt.id;
                      return (
                        <button
                          key={flt.id}
                          type="button"
                          onClick={() => update({ filter: flt.id, themeId: 'custom' })}
                          className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            active
                              ? 'border-[#2563EB] dark:border-[#60A5FA] bg-[#EFF6FF] dark:bg-[#1E293B] text-[#2563EB] dark:text-[#93C5FD]'
                              : 'border-[#E2E6F0] dark:border-[#242C3D] bg-[#FAFBFD] dark:bg-[#161D2B] text-[#3F4148] dark:text-[#CBD5E1] hover:bg-white dark:hover:bg-[#1B2435]'
                          }`}
                        >
                          {flt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MENU 3 : TYPOGRAPHIE (2 clean sub-menus) */}
        {activeTab === 'typography' && (
          <div className="space-y-5 animate-[fadeIn_160ms_ease-out]" data-testid="bar-typography">
            <div className="inline-flex flex-wrap p-1 bg-[#F3F4F8] dark:bg-[#0F1522] border border-[#E6E8F0] dark:border-[#242C3D] rounded-xl gap-1">
              <button
                type="button"
                data-testid="typo-sub-message"
                onClick={() => setTypographySubMenu('message')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  typographySubMenu === 'message'
                    ? 'bg-white dark:bg-[#1E293B] text-[#111214] dark:text-[#F8FAFC] shadow-2xs'
                    : 'text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-[#F1F5F9]'
                }`}
              >
                Message après scan
              </button>
              <button
                type="button"
                data-testid="typo-sub-card"
                onClick={() => setTypographySubMenu('card')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  typographySubMenu === 'card'
                    ? 'bg-white dark:bg-[#1E293B] text-[#111214] dark:text-[#F8FAFC] shadow-2xs'
                    : 'text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-[#F1F5F9]'
                }`}
              >
                Titre de la carte QR
              </button>
            </div>

            {typographySubMenu === 'message' ? (
              <div className="space-y-4 animate-[fadeIn_140ms_ease-out]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-[#6E7078] dark:text-[#94A3B8]">
                    Police, taille, graisse, couleur et alignement affichés à l’identique après scan.
                  </span>
                  <span className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                    {FONT_CATALOG[resolvedMsgStyle.fontId]?.label} · {FONT_CATALOG[resolvedMsgStyle.fontId]?.styleTag}
                  </span>
                </div>

                {/* Font Catalog Grid */}
                <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
                  {fontKeys.map((fontKey) => {
                    const f = FONT_CATALOG[fontKey];
                    const active = resolvedMsgStyle.fontId === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        data-testid={`font-btn-${f.id}`}
                        onClick={() =>
                          update({
                            fontId: f.id,
                            messageFontId: f.id,
                            themeId: 'custom',
                          })
                        }
                        className={`flex flex-col items-center justify-center px-3.5 py-2.5 rounded-xl border transition-colors shrink-0 min-w-[100px] cursor-pointer ${
                          active
                            ? 'border-[#2563EB] dark:border-[#60A5FA] bg-[#F4F8FF] dark:bg-[#1E293B]'
                            : 'border-[#E2E6F0] dark:border-[#242C3D] bg-[#FAFBFD] dark:bg-[#161D2B] hover:bg-white dark:hover:bg-[#1B2435]'
                        }`}
                      >
                        <span
                          className="text-xl leading-tight text-[#111214] dark:text-[#F1F5F9] whitespace-nowrap"
                          style={{ fontFamily: f.cssFamily }}
                        >
                          Aa Bb
                        </span>
                        <span className="text-[11px] font-semibold text-[#2C2E33] dark:text-[#CBD5E1] whitespace-nowrap mt-1">
                          {f.label}
                        </span>
                        <span className="text-[10px] text-[#6E7078] dark:text-[#94A3B8] whitespace-nowrap">
                          {f.styleTag}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Message Formatting Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex p-0.5 bg-[#F3F4F8] dark:bg-[#0F1522] border border-[#E6E8F0] dark:border-[#242C3D] rounded-xl gap-0.5">
                    {(
                      [
                        { id: 'left', icon: AlignLeft, label: 'Aligner à gauche' },
                        { id: 'center', icon: AlignCenter, label: 'Centrer' },
                        { id: 'right', icon: AlignRight, label: 'Aligner à droite' },
                      ] as Array<{
                        id: QrTextAlign;
                        icon: React.ComponentType<{ className?: string }>;
                        label: string;
                      }>
                    ).map((al) => {
                      const Icon = al.icon;
                      return (
                        <button
                          key={al.id}
                          type="button"
                          data-testid={`msg-align-${al.id}`}
                          aria-label={al.label}
                          onClick={() => update({ messageAlign: al.id, textAlign: al.id })}
                          className={`p-2 rounded-lg transition-colors cursor-pointer ${
                            resolvedMsgStyle.textAlign === al.id
                              ? 'bg-white dark:bg-[#1E293B] text-[#111214] dark:text-[#F8FAFC] shadow-2xs'
                              : 'text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-[#F1F5F9]'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>

                  <div className="inline-flex p-0.5 bg-[#F3F4F8] dark:bg-[#0F1522] border border-[#E6E8F0] dark:border-[#242C3D] rounded-xl gap-0.5">
                    {([
                      { w: 400, label: 'Normale' },
                      { w: 500, label: 'Moyenne' },
                      { w: 600, label: 'Semi' },
                      { w: 700, label: 'Gras' },
                    ] as const).map(({ w, label }) => (
                      <button
                        key={w}
                        type="button"
                        data-testid={`msg-weight-${w}`}
                        aria-label={`Épaisseur ${label}`}
                        onClick={() => update({ messageWeight: w, titleWeight: w })}
                        className={`px-2.5 py-1.5 text-xs rounded-lg transition-colors cursor-pointer ${
                          resolvedMsgStyle.fontWeight === w
                            ? 'bg-white dark:bg-[#1E293B] text-[#111214] dark:text-[#F8FAFC] shadow-2xs font-bold'
                            : 'text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-[#F1F5F9] font-medium'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    data-testid="msg-italic-btn"
                    aria-pressed={resolvedMsgStyle.fontStyle === 'italic'}
                    aria-label="Style italique"
                    onClick={() => {
                      const next = resolvedMsgStyle.fontStyle !== 'italic';
                      update({ messageItalic: next, titleItalic: next });
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                      resolvedMsgStyle.fontStyle === 'italic'
                        ? 'border-[#2563EB] dark:border-[#60A5FA] bg-[#EFF6FF] dark:bg-[#1E293B] text-[#2563EB] dark:text-[#93C5FD]'
                        : 'border-[#E2E6F0] dark:border-[#242C3D] bg-[#FAFBFD] dark:bg-[#161D2B] text-[#4B4D54] dark:text-[#CBD5E1]'
                    }`}
                  >
                    <Italic className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Italique</span>
                  </button>

                  <button
                    type="button"
                    data-testid="msg-underline-btn"
                    aria-pressed={resolvedMsgStyle.textDecoration === 'underline'}
                    aria-label="Souligné"
                    onClick={() =>
                      update({
                        messageTextDecoration:
                          resolvedMsgStyle.textDecoration === 'underline' ? 'none' : 'underline',
                      })
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                      resolvedMsgStyle.textDecoration === 'underline'
                        ? 'border-[#2563EB] dark:border-[#60A5FA] bg-[#EFF6FF] dark:bg-[#1E293B] text-[#2563EB] dark:text-[#93C5FD]'
                        : 'border-[#E2E6F0] dark:border-[#242C3D] bg-[#FAFBFD] dark:bg-[#161D2B] text-[#4B4D54] dark:text-[#CBD5E1]'
                    }`}
                  >
                    <Underline className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Souligné</span>
                  </button>

                  <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#E2E6F0] dark:border-[#242C3D] bg-[#FAFBFD] dark:bg-[#161D2B] cursor-pointer">
                    <span className="text-xs font-medium text-[#4B4D54] dark:text-[#CBD5E1]">Couleur texte</span>
                    <input
                      id="message-text-color"
                      data-testid="msg-color-input"
                      type="color"
                      aria-label="Couleur du texte du message"
                      value={config.messageColor || '#111214'}
                      onChange={(e) => update({ messageColor: e.target.value })}
                      className="w-5 h-5 rounded border border-black/15 bg-white cursor-pointer p-0"
                    />
                  </label>
                  {config.messageColor && (
                    <button
                      type="button"
                      onClick={() => update({ messageColor: '' })}
                      className="text-xs font-medium text-[#6E7078] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-white cursor-pointer"
                    >
                      Auto
                    </button>
                  )}
                </div>

                {/* Message Size + Letter Spacing */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="message-size-range" className="text-xs font-medium text-[#4B4D54] dark:text-[#CBD5E1]">
                        Taille du texte
                      </label>
                      <span className="text-xs font-mono text-[#111214] dark:text-[#F1F5F9] font-semibold tabular-nums">
                        {resolvedMsgStyle.fontSizePx}px
                      </span>
                    </div>
                    <input
                      id="message-size-range"
                      data-testid="msg-size-range"
                      type="range"
                      min={14}
                      max={40}
                      value={resolvedMsgStyle.fontSizePx}
                      onChange={(e) => update({ messageFontSize: Number(e.target.value) })}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="message-spacing-range" className="text-xs font-medium text-[#4B4D54] dark:text-[#CBD5E1]">
                        Espacement des lettres
                      </label>
                      <span className="text-xs font-mono text-[#111214] dark:text-[#F1F5F9] font-semibold tabular-nums">
                        {resolvedMsgStyle.letterSpacing}
                      </span>
                    </div>
                    <input
                      id="message-spacing-range"
                      data-testid="msg-spacing-range"
                      type="range"
                      min={-0.03}
                      max={0.18}
                      step={0.01}
                      value={config.messageLetterSpacing ?? 0}
                      onChange={(e) => update({ messageLetterSpacing: Number(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 animate-[fadeIn_140ms_ease-out]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-[#6E7078] dark:text-[#94A3B8]">
                    Titre affiché sur la carte et lors du scan · Légende affichée autour du QR code.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-pressed={config.titleUppercase}
                      aria-label="Majuscules sur le titre"
                      onClick={() => update({ titleUppercase: !config.titleUppercase })}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                        config.titleUppercase
                          ? 'border-[#2563EB] dark:border-[#60A5FA] bg-[#EFF6FF] dark:bg-[#1E293B] text-[#2563EB] dark:text-[#93C5FD]'
                          : 'border-[#E2E6F0] dark:border-[#242C3D] bg-[#FAFBFD] dark:bg-[#161D2B] text-[#4B4D54] dark:text-[#CBD5E1]'
                      }`}
                    >
                      AA
                    </button>
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#E2E6F0] dark:border-[#242C3D] bg-[#FAFBFD] dark:bg-[#161D2B] cursor-pointer">
                      <span className="text-xs font-medium text-[#4B4D54] dark:text-[#CBD5E1]">Encre carte</span>
                      <input
                        id="card-text-color"
                        type="color"
                        aria-label="Couleur du texte de carte"
                        value={config.cardTextColor}
                        onChange={(e) => update({ cardTextColor: e.target.value })}
                        className="w-5 h-5 rounded border border-black/15 bg-white cursor-pointer p-0"
                      />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 bg-[#FAFBFD] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] rounded-xl px-3.5 py-2">
                    <label
                      htmlFor="frame-title"
                      className="text-xs font-medium text-[#6E7078] dark:text-[#94A3B8] whitespace-nowrap shrink-0"
                    >
                      Titre
                    </label>
                    <input
                      id="frame-title"
                      type="text"
                      maxLength={34}
                      value={config.titleText}
                      onChange={(e) => update({ titleText: e.target.value })}
                      placeholder="Mon Code QR"
                      className="w-full text-xs bg-transparent text-[#111214] dark:text-[#F1F5F9] focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2 bg-[#FAFBFD] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] rounded-xl px-3.5 py-2">
                    <label
                      htmlFor="frame-subtitle"
                      className="text-xs font-medium text-[#6E7078] dark:text-[#94A3B8] whitespace-nowrap shrink-0"
                    >
                      Légende
                    </label>
                    <input
                      id="frame-subtitle"
                      type="text"
                      maxLength={42}
                      value={config.subtitleText}
                      onChange={(e) => update({ subtitleText: e.target.value })}
                      placeholder="Scannez pour découvrir"
                      className="w-full text-xs bg-transparent text-[#111214] dark:text-[#F1F5F9] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                  <div>
                    <label
                      htmlFor="subtitle-font-select"
                      className="block text-xs font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1.5"
                    >
                      Police légende
                    </label>
                    <select
                      id="subtitle-font-select"
                      value={config.subtitleFontId}
                      onChange={(e) => update({ subtitleFontId: e.target.value as QrFontId })}
                      className="w-full px-3 py-2 text-xs bg-[#FAFBFD] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] text-[#111214] dark:text-[#F1F5F9] rounded-xl"
                    >
                      {fontKeys.map((k) => (
                        <option key={k} value={k}>
                          {FONT_CATALOG[k].label} ({FONT_CATALOG[k].styleTag})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="title-size-range" className="text-xs font-medium text-[#4B4D54] dark:text-[#CBD5E1]">
                        Taille titre
                      </label>
                      <span className="text-xs font-mono text-[#5C5E66] dark:text-[#94A3B8] tabular-nums">
                        {config.titleSize}px
                      </span>
                    </div>
                    <input
                      id="title-size-range"
                      type="range"
                      min={14}
                      max={30}
                      value={config.titleSize}
                      onChange={(e) => update({ titleSize: Number(e.target.value) })}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="subtitle-size-range" className="text-xs font-medium text-[#4B4D54] dark:text-[#CBD5E1]">
                        Taille légende
                      </label>
                      <span className="text-xs font-mono text-[#5C5E66] dark:text-[#94A3B8] tabular-nums">
                        {config.subtitleSize}px
                      </span>
                    </div>
                    <input
                      id="subtitle-size-range"
                      type="range"
                      min={10}
                      max={20}
                      value={config.subtitleSize}
                      onChange={(e) => update({ subtitleSize: Number(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MENU 4 : LOGO & COINS (2 clean sub-menus) */}
        {activeTab === 'elements' && (
          <div className="space-y-5 animate-[fadeIn_160ms_ease-out]" data-testid="bar-stickers">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex flex-wrap p-1 bg-[#F3F4F8] dark:bg-[#0F1522] border border-[#E6E8F0] dark:border-[#242C3D] rounded-xl gap-1">
                <button
                  type="button"
                  data-testid="elements-sub-center"
                  onClick={() => setElementsSubMenu('center')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    elementsSubMenu === 'center'
                      ? 'bg-white dark:bg-[#1E293B] text-[#111214] dark:text-[#F8FAFC] shadow-2xs'
                      : 'text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-[#F1F5F9]'
                  }`}
                >
                  Emblème central
                </button>
                <button
                  type="button"
                  data-testid="elements-sub-corners"
                  onClick={() => setElementsSubMenu('corners')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    elementsSubMenu === 'corners'
                      ? 'bg-white dark:bg-[#1E293B] text-[#111214] dark:text-[#F8FAFC] shadow-2xs'
                      : 'text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-[#F1F5F9]'
                  }`}
                >
                  Stickers de coin
                </button>
              </div>

              <div className="inline-flex flex-wrap p-1 bg-[#F3F4F8] dark:bg-[#0F1522] border border-[#E6E8F0] dark:border-[#242C3D] rounded-xl gap-1">
                {STICKER_FILTER_TABS.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    data-testid={`sticker-cat-${cat.id}`}
                    onClick={() => setStickerCategory(cat.id)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                      stickerCategory === cat.id
                        ? 'bg-white dark:bg-[#1E293B] text-[#111214] dark:text-[#F8FAFC] shadow-2xs'
                        : 'text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-[#F1F5F9]'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {elementsSubMenu === 'center' ? (
              <div className="space-y-4 animate-[fadeIn_140ms_ease-out]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex p-0.5 bg-[#F3F4F8] dark:bg-[#0F1522] border border-[#E6E8F0] dark:border-[#242C3D] rounded-lg gap-0.5">
                    <button
                      type="button"
                      onClick={() => setCenterStickerMode('vector')}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                        centerStickerMode === 'vector'
                          ? 'bg-white dark:bg-[#1E293B] text-[#111214] dark:text-[#F8FAFC] shadow-2xs'
                          : 'text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-[#F1F5F9]'
                      }`}
                    >
                      Vectoriels
                    </button>
                    <button
                      type="button"
                      onClick={() => setCenterStickerMode('emoji')}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                        centerStickerMode === 'emoji'
                          ? 'bg-white dark:bg-[#1E293B] text-[#111214] dark:text-[#F8FAFC] shadow-2xs'
                          : 'text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-[#F1F5F9]'
                      }`}
                    >
                      Emoji
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      ref={customLogoInputRef}
                      type="file"
                      accept="image/*"
                      aria-label="Importer un logo personnalisé"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleCustomLogoFile(file);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => customLogoInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#111214] dark:text-[#F1F5F9] bg-[#F3F4F8] dark:bg-[#161D2B] border border-[#E2E6F0] dark:border-[#242C3D] hover:bg-[#EAECEF] dark:hover:bg-[#1E293B] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Importer logo</span>
                    </button>
                    {(config.logoId || config.customLogoDataUrl || config.centerEmoji) && (
                      <button
                        type="button"
                        onClick={() =>
                          update({ logoId: null, customLogoDataUrl: null, centerEmoji: null })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#B91C1C] dark:text-[#FCA5A5] bg-[#FEF2F2] dark:bg-[#2A1215] hover:bg-[#FEE2E2] dark:hover:bg-[#3B171B] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Ban className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Aucun</span>
                      </button>
                    )}
                  </div>
                </div>

                {centerStickerMode === 'vector' ? (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {filteredLogos.map((logo) => {
                      const active = !config.customLogoDataUrl && config.logoId === logo.id;
                      return (
                        <button
                          key={logo.id}
                          type="button"
                          onClick={() =>
                            update({
                              logoId: logo.id,
                              centerEmoji: null,
                              customLogoDataUrl: null,
                            })
                          }
                          className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border transition-colors shrink-0 min-w-[74px] cursor-pointer ${
                            active
                              ? 'border-[#2563EB] dark:border-[#60A5FA] bg-[#EFF6FF] dark:bg-[#1E293B] text-[#2563EB] dark:text-[#93C5FD]'
                              : 'border-[#E2E6F0] dark:border-[#242C3D] bg-[#FAFBFD] dark:bg-[#161D2B] text-[#111214] dark:text-[#E2E8F0] hover:bg-white dark:hover:bg-[#1B2435]'
                          }`}
                        >
                          <svg viewBox={logo.viewBox} className="w-5 h-5" aria-hidden="true">
                            {logo.circles?.map((c, idx) => (
                              <circle
                                key={idx}
                                cx={c.cx}
                                cy={c.cy}
                                r={c.r}
                                fill={c.fill ? 'currentColor' : 'none'}
                                stroke={c.stroke ? 'currentColor' : 'none'}
                                strokeWidth={c.strokeWidth || 0}
                              />
                            ))}
                            {logo.paths.map((p, idx) => (
                              <path
                                key={idx}
                                d={p.d}
                                fill={p.fill ? 'currentColor' : 'none'}
                                stroke={p.stroke ? 'currentColor' : 'none'}
                                strokeWidth={p.strokeWidth || 0}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            ))}
                            {logo.id === 'monogram' && (
                              <text
                                x="24"
                                y="24"
                                dy="0.35em"
                                textAnchor="middle"
                                fill="currentColor"
                                style={{ fontSize: '14px', fontWeight: 700 }}
                              >
                                {(config.monogramText || 'SQ').slice(0, 3).toUpperCase()}
                              </text>
                            )}
                          </svg>
                          <span className="text-[11px] font-medium text-[#2C2E33] dark:text-[#CBD5E1] whitespace-nowrap">
                            {logo.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {filteredEmojis.map((item) => {
                      const active =
                        !config.customLogoDataUrl &&
                        !config.logoId &&
                        config.centerEmoji === item.emoji;
                      return (
                        <button
                          key={`center-${item.label}`}
                          type="button"
                          aria-label={`Sticker centre ${item.label}`}
                          onClick={() =>
                            update({
                              centerEmoji: item.emoji,
                              logoId: null,
                              customLogoDataUrl: null,
                            })
                          }
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-colors cursor-pointer ${
                            active
                              ? 'border-[#2563EB] dark:border-[#60A5FA] bg-[#EFF6FF] dark:bg-[#1E293B]'
                              : 'border-[#E2E6F0] dark:border-[#242C3D] bg-[#FAFBFD] dark:bg-[#161D2B] hover:bg-white dark:hover:bg-[#1B2435]'
                          }`}
                        >
                          <span className="text-base leading-none" aria-hidden="true">
                            {item.emoji}
                          </span>
                          <span className="text-xs font-medium text-[#4B4D54] dark:text-[#CBD5E1]">
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                    <input
                      id="custom-center-emoji"
                      type="text"
                      maxLength={4}
                      aria-label="Emoji libre centre"
                      value={config.centerEmoji || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        update({
                          centerEmoji: val || null,
                          logoId: val ? null : config.logoId,
                          customLogoDataUrl: val ? null : config.customLogoDataUrl,
                        });
                      }}
                      placeholder="Libre…"
                      className="w-18 px-2.5 py-1.5 text-center text-xs bg-[#FAFBFD] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] text-[#111214] dark:text-[#F1F5F9] rounded-xl"
                    />
                  </div>
                )}

                {centerStickerMode === 'vector' &&
                  config.logoId === 'monogram' &&
                  !config.customLogoDataUrl && (
                    <div className="flex items-center gap-2.5">
                      <label htmlFor="monogram-input" className="text-xs font-medium text-[#3F4148] dark:text-[#CBD5E1]">
                        Initiales :
                      </label>
                      <input
                        id="monogram-input"
                        type="text"
                        maxLength={3}
                        value={config.monogramText}
                        onChange={(e) => update({ monogramText: e.target.value })}
                        placeholder="SQ"
                        className="w-20 px-2.5 py-1 text-xs font-bold uppercase bg-[#FAFBFD] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] text-[#111214] dark:text-[#F1F5F9] rounded-lg"
                      />
                    </div>
                  )}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <div className="inline-flex items-center gap-1">
                    {KNOCKOUT_SHAPES.map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => update({ logoKnockout: k.id })}
                        className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          config.logoKnockout === k.id
                            ? 'border-[#2563EB] dark:border-[#60A5FA] bg-[#EFF6FF] dark:bg-[#1E293B] text-[#2563EB] dark:text-[#93C5FD]'
                            : 'border-[#E2E6F0] dark:border-[#242C3D] bg-[#FAFBFD] dark:bg-[#161D2B] text-[#4B4D54] dark:text-[#CBD5E1]'
                        }`}
                      >
                        {k.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 flex-1 min-w-[150px] max-w-[240px]">
                    <label htmlFor="logo-size-range" className="text-xs font-medium text-[#4B4D54] dark:text-[#CBD5E1] whitespace-nowrap">
                      Taille
                    </label>
                    <input
                      id="logo-size-range"
                      type="range"
                      min={14}
                      max={25}
                      value={Math.round(config.logoSize * 100)}
                      onChange={(e) => update({ logoSize: Number(e.target.value) / 100 })}
                      className="flex-1"
                    />
                    <span className="text-xs font-mono text-[#5C5E66] dark:text-[#94A3B8] tabular-nums">
                      {Math.round(config.logoSize * 100)}%
                    </span>
                  </div>

                  {!config.customLogoDataUrl && !config.centerEmoji && (
                    <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
                      <span className="text-xs font-medium text-[#5C5E66] dark:text-[#94A3B8]">Couleur</span>
                      <input
                        id="logo-color-picker"
                        type="color"
                        aria-label="Teinte de l’emblème"
                        value={config.logoColor}
                        onChange={(e) => update({ logoColor: e.target.value })}
                        className="w-7 h-6 rounded border border-black/15 bg-white cursor-pointer p-0"
                      />
                    </label>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4 animate-[fadeIn_140ms_ease-out]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {CORNER_PLACEMENTS.map((p) => {
                      const active = config.cornerStickerPlacement === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => update({ cornerStickerPlacement: p.id })}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            active
                              ? 'border-[#2563EB] dark:border-[#60A5FA] bg-[#EFF6FF] dark:bg-[#1E293B] text-[#2563EB] dark:text-[#93C5FD]'
                              : 'border-[#E2E6F0] dark:border-[#242C3D] bg-[#FAFBFD] dark:bg-[#161D2B] text-[#4B4D54] dark:text-[#CBD5E1] hover:bg-white dark:hover:bg-[#1B2435]'
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>

                  {config.cornerStickerPlacement !== 'none' && (
                    <div className="inline-flex p-0.5 bg-[#F3F4F8] dark:bg-[#0F1522] border border-[#E6E8F0] dark:border-[#242C3D] rounded-lg gap-0.5">
                      {(
                        [
                          { id: 'vector', label: 'Vectoriels' },
                          { id: 'emoji', label: 'Emoji' },
                        ] as Array<{ id: QrStickerKind; label: string }>
                      ).map((kind) => (
                        <button
                          key={kind.id}
                          type="button"
                          onClick={() => update({ cornerStickerKind: kind.id })}
                          className={`px-2.5 py-0.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                            config.cornerStickerKind === kind.id
                              ? 'bg-white dark:bg-[#1E293B] text-[#111214] dark:text-[#F8FAFC] shadow-2xs'
                              : 'text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-[#F1F5F9]'
                          }`}
                        >
                          {kind.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {config.cornerStickerPlacement === 'none' ? (
                  <p className="text-xs text-[#6E7078] dark:text-[#94A3B8] bg-[#FAFBFD] dark:bg-[#161D2B] border border-dashed border-[#DCE2EE] dark:border-[#2A3347] rounded-xl px-4 py-3">
                    Choisissez un placement ci-dessus (4 coins, Haut, Bas…) pour ajouter des ornements autour de votre QR code.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {config.cornerStickerKind === 'emoji' ? (
                      <>
                        {filteredEmojis.map((item) => {
                          const active = config.cornerStickerEmoji === item.emoji;
                          return (
                            <button
                              key={`corner-${item.label}`}
                              type="button"
                              aria-label={`Sticker coin ${item.label}`}
                              onClick={() => update({ cornerStickerEmoji: item.emoji })}
                              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                active
                                  ? 'border-[#2563EB] dark:border-[#60A5FA] bg-[#EFF6FF] dark:bg-[#1E293B]'
                                  : 'border-[#E2E6F0] dark:border-[#242C3D] bg-[#FAFBFD] dark:bg-[#161D2B] hover:bg-white dark:hover:bg-[#1B2435]'
                              }`}
                            >
                              <span className="text-base leading-none" aria-hidden="true">
                                {item.emoji}
                              </span>
                            </button>
                          );
                        })}
                        <input
                          id="custom-corner-emoji"
                          type="text"
                          maxLength={4}
                          aria-label="Autre emoji coin"
                          value={config.cornerStickerEmoji}
                          onChange={(e) => update({ cornerStickerEmoji: e.target.value })}
                          placeholder="✨"
                          className="w-12 px-1.5 py-1 text-center text-sm bg-[#FAFBFD] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] text-[#111214] dark:text-[#F1F5F9] rounded-lg"
                        />
                      </>
                    ) : (
                      <>
                        {filteredLogos.map((logo) => {
                          const active = config.cornerStickerVectorId === logo.id;
                          return (
                            <button
                              key={`corner-vec-${logo.id}`}
                              type="button"
                              aria-label={`Icône coin ${logo.name}`}
                              onClick={() => update({ cornerStickerVectorId: logo.id })}
                              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                active
                                  ? 'border-[#2563EB] dark:border-[#60A5FA] bg-[#EFF6FF] dark:bg-[#1E293B] text-[#2563EB] dark:text-[#93C5FD]'
                                  : 'border-[#E2E6F0] dark:border-[#242C3D] bg-[#FAFBFD] dark:bg-[#161D2B] text-[#111214] dark:text-[#E2E8F0] hover:bg-white dark:hover:bg-[#1B2435]'
                              }`}
                            >
                              <svg viewBox={logo.viewBox} className="w-4 h-4" aria-hidden="true">
                                {logo.circles?.map((c, idx) => (
                                  <circle
                                    key={idx}
                                    cx={c.cx}
                                    cy={c.cy}
                                    r={c.r}
                                    fill={c.fill ? 'currentColor' : 'none'}
                                    stroke={c.stroke ? 'currentColor' : 'none'}
                                    strokeWidth={c.strokeWidth || 0}
                                  />
                                ))}
                                {logo.paths.map((p, idx) => (
                                  <path
                                    key={idx}
                                    d={p.d}
                                    fill={p.fill ? 'currentColor' : 'none'}
                                    stroke={p.stroke ? 'currentColor' : 'none'}
                                    strokeWidth={p.strokeWidth || 0}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                ))}
                              </svg>
                            </button>
                          );
                        })}
                        <input
                          id="corner-sticker-color"
                          type="color"
                          aria-label="Couleur des stickers de coin"
                          value={config.cornerStickerColor}
                          onChange={(e) => update({ cornerStickerColor: e.target.value })}
                          className="w-7 h-7 rounded border border-black/15 bg-white cursor-pointer p-0"
                        />
                      </>
                    )}

                    <div className="flex items-center gap-2 ml-auto min-w-[140px]">
                      <label htmlFor="corner-sticker-scale" className="text-xs font-medium text-[#4B4D54] dark:text-[#CBD5E1] whitespace-nowrap">
                        Échelle
                      </label>
                      <input
                        id="corner-sticker-scale"
                        type="range"
                        min={75}
                        max={135}
                        value={Math.round((config.cornerStickerScale || 1) * 100)}
                        onChange={(e) =>
                          update({ cornerStickerScale: Number(e.target.value) / 100 })
                        }
                        className="flex-1"
                      />
                      <span className="text-xs font-mono text-[#5C5E66] dark:text-[#94A3B8] tabular-nums">
                        {Math.round((config.cornerStickerScale || 1) * 100)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* MENU 5 : RÉGLAGES (Format, Positionnement, Textes superposés, Calques) */}
        {activeTab === 'finishing' && (
          <div className="space-y-6 animate-[fadeIn_160ms_ease-out]" data-testid="bar-finishing">
            {/* Format & Scannability */}
            <div className="space-y-3">
              <span className="block text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
                Format &amp; tolérance de lecture
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="card-radius" className="text-xs font-medium text-[#4B4D54] dark:text-[#CBD5E1]">
                      Arrondi de carte
                    </label>
                    <span className="text-xs font-mono text-[#5C5E66] dark:text-[#94A3B8] tabular-nums">
                      {config.cornerRadius}px
                    </span>
                  </div>
                  <input
                    id="card-radius"
                    type="range"
                    min={0}
                    max={32}
                    value={config.cornerRadius}
                    onChange={(e) => update({ cornerRadius: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="qr-margin" className="text-xs font-medium text-[#4B4D54] dark:text-[#CBD5E1]">
                      Marge QR
                    </label>
                    <span className="text-xs font-mono text-[#5C5E66] dark:text-[#94A3B8] tabular-nums">
                      {config.margin}
                    </span>
                  </div>
                  <input
                    id="qr-margin"
                    type="range"
                    min={1}
                    max={4}
                    step={1}
                    value={config.margin}
                    onChange={(e) => update({ margin: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>

                <div>
                  <label htmlFor="qr-ec" className="block text-xs font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1.5">
                    Correction d’erreur
                  </label>
                  <select
                    id="qr-ec"
                    value={config.errorCorrection}
                    onChange={(e) =>
                      update({ errorCorrection: e.target.value as QrErrorCorrection })
                    }
                    className="w-full px-3 py-2 text-xs bg-[#FAFBFD] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] text-[#111214] dark:text-[#F1F5F9] rounded-xl"
                  >
                    <option value="L">L — 7 % (Compact)</option>
                    <option value="M">M — 15 % (Standard)</option>
                    <option value="Q">Q — 25 % (Fiable)</option>
                    <option value="H">H — 30 % (Haute tolérance)</option>
                  </select>
                </div>
              </div>

              <label className="mt-3 flex items-center justify-between gap-3 p-3 rounded-xl bg-[#FAFBFD] dark:bg-[#161D2B] border border-[#E2E6F0] dark:border-[#242C3D] cursor-pointer">
                <div className="min-w-0">
                  <span className="block text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
                    Faisceau laser lumineux (aperçu &amp; partage)
                  </span>
                  <span className="block text-[11px] text-[#6E7078] dark:text-[#94A3B8]">
                    Anime un balayage lumineux sur l’aperçu et lors de l’ouverture dans « Mes QR ».
                  </span>
                </div>
                <input
                  type="checkbox"
                  data-testid="config-laser-toggle"
                  checked={config.laserEnabled !== false}
                  onChange={(e) => update({ laserEnabled: e.target.checked })}
                  className="w-4 h-4 rounded accent-[#4F46E5] shrink-0"
                />
              </label>

              <label className="mt-2.5 flex items-center justify-between gap-3 p-3 rounded-xl bg-[#FAFBFD] dark:bg-[#161D2B] border border-[#E2E6F0] dark:border-[#242C3D] cursor-pointer">
                <div className="min-w-0">
                  <span className="block text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
                    Radiation d’ondes d’énergie (halo radial)
                  </span>
                  <span className="block text-[11px] text-[#6E7078] dark:text-[#94A3B8]">
                    Diffuse des vagues d’énergie concentriques autour du QR code à la couleur du modèle.
                  </span>
                </div>
                <input
                  type="checkbox"
                  data-testid="config-energy-wave-toggle"
                  checked={Boolean(config.energyWaveEnabled)}
                  onChange={(e) => update({ energyWaveEnabled: e.target.checked })}
                  className="w-4 h-4 rounded accent-[#2563EB] shrink-0"
                />
              </label>
            </div>

            {/* Fine Positioning */}
            <div className="pt-4 border-t border-[#F1EFE9] dark:border-[#242C3D] space-y-3" data-testid="bar-advanced-editor">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
                  Positionnement fin
                </span>
                <button
                  type="button"
                  onClick={() =>
                    update({
                      logoOffsetX: 0,
                      logoOffsetY: 0,
                      logoRotation: 0,
                      titleOffsetY: 0,
                      cornerStickerOffset: 0,
                      cornerStickerRotation: 0,
                    })
                  }
                  className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
                >
                  Recentrer
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="flex items-center gap-2">
                  <label htmlFor="logo-offset-x" className="text-xs text-[#4B4D54] dark:text-[#CBD5E1] w-20 shrink-0">
                    Logo X
                  </label>
                  <input
                    id="logo-offset-x"
                    type="range"
                    min={-14}
                    max={14}
                    value={config.logoOffsetX ?? 0}
                    onChange={(e) => update({ logoOffsetX: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="text-xs font-mono text-[#5C5E66] dark:text-[#94A3B8] tabular-nums w-9 text-right">
                    {config.logoOffsetX ?? 0}px
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="logo-offset-y" className="text-xs text-[#4B4D54] dark:text-[#CBD5E1] w-20 shrink-0">
                    Logo Y
                  </label>
                  <input
                    id="logo-offset-y"
                    type="range"
                    min={-14}
                    max={14}
                    value={config.logoOffsetY ?? 0}
                    onChange={(e) => update({ logoOffsetY: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="text-xs font-mono text-[#5C5E66] dark:text-[#94A3B8] tabular-nums w-9 text-right">
                    {config.logoOffsetY ?? 0}px
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="logo-rotation" className="text-xs text-[#4B4D54] dark:text-[#CBD5E1] w-20 shrink-0">
                    Rotation
                  </label>
                  <input
                    id="logo-rotation"
                    type="range"
                    min={-45}
                    max={45}
                    value={config.logoRotation ?? 0}
                    onChange={(e) => update({ logoRotation: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="text-xs font-mono text-[#5C5E66] dark:text-[#94A3B8] tabular-nums w-9 text-right">
                    {config.logoRotation ?? 0}°
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="title-offset-y" className="text-xs text-[#4B4D54] dark:text-[#CBD5E1] w-20 shrink-0">
                    Titre Y
                  </label>
                  <input
                    id="title-offset-y"
                    type="range"
                    min={-14}
                    max={14}
                    value={config.titleOffsetY ?? 0}
                    onChange={(e) => update({ titleOffsetY: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="text-xs font-mono text-[#5C5E66] dark:text-[#94A3B8] tabular-nums w-9 text-right">
                    {config.titleOffsetY ?? 0}px
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="corner-offset" className="text-xs text-[#4B4D54] dark:text-[#CBD5E1] w-20 shrink-0">
                    Coins X/Y
                  </label>
                  <input
                    id="corner-offset"
                    type="range"
                    min={-12}
                    max={12}
                    value={config.cornerStickerOffset ?? 0}
                    onChange={(e) => update({ cornerStickerOffset: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="text-xs font-mono text-[#5C5E66] dark:text-[#94A3B8] tabular-nums w-9 text-right">
                    {config.cornerStickerOffset ?? 0}px
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="corner-rotation" className="text-xs text-[#4B4D54] dark:text-[#CBD5E1] w-20 shrink-0">
                    Rot. coins
                  </label>
                  <input
                    id="corner-rotation"
                    type="range"
                    min={-45}
                    max={45}
                    value={config.cornerStickerRotation ?? 0}
                    onChange={(e) => update({ cornerStickerRotation: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="text-xs font-mono text-[#5C5E66] dark:text-[#94A3B8] tabular-nums w-9 text-right">
                    {config.cornerStickerRotation ?? 0}°
                  </span>
                </div>
              </div>
            </div>

            {/* Extra Text Overlays */}
            <div className="pt-4 border-t border-[#F1EFE9] dark:border-[#242C3D] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
                  Textes superposés ({(config.extraTexts || []).length})
                </span>
                <button
                  type="button"
                  data-testid="add-extra-text-btn"
                  onClick={handleAddExtraText}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#2563EB] dark:text-[#93C5FD] bg-[#EFF6FF] dark:bg-[#1E293B] hover:bg-[#DBEAFE] dark:hover:bg-[#283548] rounded-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Ajouter</span>
                </button>
              </div>

              {(config.extraTexts || []).map((overlay) => (
                <div
                  key={overlay.id}
                  className="p-3 rounded-xl bg-[#FAFBFD] dark:bg-[#161D2B] border border-[#E2E6F0] dark:border-[#242C3D] space-y-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={overlay.text}
                      maxLength={40}
                      onChange={(e) =>
                        handleUpdateExtraText(overlay.id, { text: e.target.value })
                      }
                      className="flex-1 min-w-[140px] px-2.5 py-1 text-xs bg-white dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] text-[#111214] dark:text-[#F1F5F9] rounded-lg"
                    />
                    <select
                      value={overlay.fontId}
                      onChange={(e) =>
                        handleUpdateExtraText(overlay.id, {
                          fontId: e.target.value as QrFontId,
                        })
                      }
                      className="px-2 py-1 text-xs bg-white dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3347] text-[#111214] dark:text-[#F1F5F9] rounded-lg"
                    >
                      {fontKeys.map((k) => (
                        <option key={k} value={k}>
                          {FONT_CATALOG[k].label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="color"
                      value={overlay.color}
                      aria-label="Couleur texte libre"
                      onChange={(e) =>
                        handleUpdateExtraText(overlay.id, { color: e.target.value })
                      }
                      className="w-6 h-6 rounded border border-black/15 cursor-pointer p-0"
                    />
                    <button
                      type="button"
                      aria-label="Supprimer ce texte libre"
                      onClick={() => handleRemoveExtraText(overlay.id)}
                      className="p-1 text-[#6E7078] dark:text-[#94A3B8] hover:text-[#B91C1C] dark:hover:text-[#F87171] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-[#5C5E66] dark:text-[#94A3B8]">
                    <label className="flex items-center gap-1.5">
                      <span>X</span>
                      <input
                        type="range"
                        min={12}
                        max={88}
                        value={overlay.xPercent}
                        onChange={(e) =>
                          handleUpdateExtraText(overlay.id, {
                            xPercent: Number(e.target.value),
                          })
                        }
                        className="flex-1"
                      />
                    </label>
                    <label className="flex items-center gap-1.5">
                      <span>Y</span>
                      <input
                        type="range"
                        min={8}
                        max={94}
                        value={overlay.yPercent}
                        onChange={(e) =>
                          handleUpdateExtraText(overlay.id, {
                            yPercent: Number(e.target.value),
                          })
                        }
                        className="flex-1"
                      />
                    </label>
                    <label className="flex items-center gap-1.5">
                      <span>Taille</span>
                      <input
                        type="range"
                        min={10}
                        max={26}
                        value={overlay.fontSize}
                        onChange={(e) =>
                          handleUpdateExtraText(overlay.id, {
                            fontSize: Number(e.target.value),
                          })
                        }
                        className="flex-1"
                      />
                    </label>
                    <label className="flex items-center gap-1.5">
                      <span>Rot.</span>
                      <input
                        type="range"
                        min={-30}
                        max={30}
                        value={overlay.rotation}
                        onChange={(e) =>
                          handleUpdateExtraText(overlay.id, {
                            rotation: Number(e.target.value),
                          })
                        }
                        className="flex-1"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            {/* Layers Control */}
            <div className="pt-4 border-t border-[#F1EFE9] dark:border-[#242C3D] space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
                <Layers className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA]" aria-hidden="true" />
                <span>Calques</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {activeLayers.map((layer, index) => (
                  <div
                    key={layer.id}
                    data-testid={`layer-row-${layer.id}`}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border ${
                      layer.visible
                        ? 'bg-[#FAFBFD] dark:bg-[#161D2B] border-[#E2E6F0] dark:border-[#242C3D]'
                        : 'bg-[#F3F4F8] dark:bg-[#0F1522] border-[#E2E6F0] dark:border-[#242C3D] opacity-60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleLayer(layer.id)}
                      aria-label={
                        layer.visible
                          ? `Masquer le calque ${layer.label}`
                          : `Afficher le calque ${layer.label}`
                      }
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#111214] dark:text-[#F1F5F9] min-w-0 cursor-pointer"
                    >
                      {layer.visible ? (
                        <Eye className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA] shrink-0" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-[#6E7078] dark:text-[#64748B] shrink-0" />
                      )}
                      <span className="truncate">{layer.label}</span>
                    </button>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        disabled={index === 0}
                        aria-label={`Descendre ${layer.label}`}
                        onClick={() => handleMoveLayer(layer.id, 'down')}
                        className="p-1 text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-white disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        disabled={index === activeLayers.length - 1}
                        aria-label={`Monter ${layer.label}`}
                        onClick={() => handleMoveLayer(layer.id, 'up')}
                        className="p-1 text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-white disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
