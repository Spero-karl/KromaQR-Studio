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
  Plus,
  Redo2,
  RotateCcw,
  Sparkles,
  Trash2,
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

interface CustomizePanelProps {
  config: QrConfig;
  onChange: (next: QrConfig) => void;
  onReset: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

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
}) => {
  const [centerStickerMode, setCenterStickerMode] = useState<'vector' | 'emoji'>(
    config.centerEmoji && !config.logoId && !config.customLogoDataUrl ? 'emoji' : 'vector'
  );
  const [collectionTab, setCollectionTab] = useState<'all' | 'studio' | 'prestige'>('all');
  const customLogoInputRef = useRef<HTMLInputElement>(null);

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
  const activeLayers =
    config.layers && config.layers.length > 0 ? config.layers : DEFAULT_LAYERS;

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
      className="bg-white border border-[#E2E0D8] rounded-2xl overflow-hidden"
    >
      {/* Top Studio Bar Header */}
      <div className="px-4 sm:px-5 py-3.5 bg-[#FAF9F5] border-b border-[#EFECE4] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="customize-heading"
            className="font-display text-sm sm:text-base font-bold tracking-tight text-[#111214]"
          >
            2. Studio de personnalisation
          </h2>
          <p className="text-[11px] text-[#6E7078]">
            Barres superposées — collections Studio &amp; Prestige, transformations et calques.
          </p>
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
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#5C5E66] hover:text-[#111214] bg-white border border-[#E2E0D8] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#5C5E66] hover:text-[#111214] bg-white border border-[#E2E0D8] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Redo2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Rétablir</span>
            </button>
          )}
          <button
            type="button"
            data-testid="reset-style-btn"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#5C5E66] hover:text-[#111214] bg-white border border-[#E2E0D8] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Réinitialiser</span>
          </button>
        </div>
      </div>

      {/* Stacked Horizontal Studio Bars */}
      <div className="divide-y divide-[#EFECE4]">
        {/* BARRE 1 : THÈMES & PALETTES */}
        <div className="px-4 sm:px-5 py-4 space-y-3" data-testid="bar-themes">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <h3 className="font-display text-xs font-bold text-[#111214]">
                Collections &amp; Harmonies
              </h3>
              <div className="inline-flex p-0.5 bg-[#F2F1EB] rounded-lg gap-0.5">
                {(
                  [
                    { id: 'all', label: `Toutes · ${THEME_PRESETS.length}` },
                    { id: 'studio', label: 'Studio · 8' },
                    { id: 'prestige', label: 'Atelier Prestige · 5' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    data-testid={`collection-tab-${tab.id}`}
                    onClick={() => setCollectionTab(tab.id)}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      collectionTab === tab.id
                        ? 'bg-white text-[#111214] shadow-2xs'
                        : 'text-[#5C5E66] hover:text-[#111214]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
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
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isSelected
                        ? 'border-[#1D4ED8] bg-[#EFF4FF] text-[#1D4ED8]'
                        : 'border-[#E6E4DC] bg-[#FAF9F5] text-[#2C2E33] hover:bg-white'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="w-3 h-3 rounded-full border border-black/15 shrink-0"
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

          <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
            {visibleThemes.map((theme) => {
              const isSelected = config.themeId === theme.id;
              const [bgSwatch, fgSwatch, accentSwatch] = theme.swatches;
              const isPrestige = theme.collection === 'prestige';
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
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all text-left shrink-0 cursor-pointer ${
                    isSelected
                      ? 'border-[#1D4ED8] bg-[#F4F7FF]'
                      : isPrestige
                      ? 'border-[#D6C596] bg-[#FCFBF7] hover:border-[#B89B54] hover:bg-white'
                      : 'border-[#E6E4DC] bg-[#FAF9F5] hover:border-[#C5C2B8] hover:bg-white'
                  }`}
                >
                  <div
                    aria-hidden="true"
                    className="w-8 h-9 rounded-md border border-black/10 shrink-0 p-1 grid grid-cols-2 gap-0.5"
                    style={{ backgroundColor: bgSwatch }}
                  >
                    <span className="rounded-[2px]" style={{ backgroundColor: accentSwatch }} />
                    <span className="rounded-full" style={{ backgroundColor: fgSwatch }} />
                    <span className="rounded-full" style={{ backgroundColor: fgSwatch }} />
                    <span className="rounded-[2px]" style={{ backgroundColor: accentSwatch }} />
                  </div>
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[#111214] whitespace-nowrap">
                      <span>{theme.name}</span>
                      {isPrestige && (
                        <Sparkles className="w-3 h-3 text-[#B45309] shrink-0" aria-hidden="true" />
                      )}
                    </span>
                    <span className="block text-[10px] text-[#5C5E66] whitespace-nowrap max-w-[165px] truncate">
                      {theme.tagline}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* BARRE 2 : TEXTES, POLICES CURSIVES & TAILLES */}
        <div className="px-4 sm:px-5 py-4 space-y-3.5" data-testid="bar-typography">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-xs font-bold text-[#111214]">
              Textes, Polices Scripts & Tailles
            </h3>

            {/* Style quick toolbar: Alignment + Weight + Italic + Uppercase + Text Color */}
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="inline-flex p-0.5 bg-[#F2F1EB] rounded-lg gap-0.5">
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
                      aria-label={al.label}
                      onClick={() => update({ textAlign: al.id })}
                      className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                        config.textAlign === al.id
                          ? 'bg-white text-[#111214] shadow-2xs'
                          : 'text-[#5C5E66] hover:text-[#111214]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>

              <div className="inline-flex p-0.5 bg-[#F2F1EB] rounded-lg gap-0.5">
                {([500, 600, 700] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    aria-label={`Épaisseur ${w}`}
                    onClick={() => update({ titleWeight: w })}
                    className={`px-2 py-1 text-[10px] font-mono rounded-md transition-colors cursor-pointer ${
                      config.titleWeight === w
                        ? 'bg-white text-[#111214] shadow-2xs font-bold'
                        : 'text-[#5C5E66] hover:text-[#111214]'
                    }`}
                  >
                    {w === 500 ? 'Fin' : w === 600 ? 'Semi' : 'Gras'}
                  </button>
                ))}
              </div>

              <button
                type="button"
                aria-pressed={config.titleItalic}
                aria-label="Style italique"
                onClick={() => update({ titleItalic: !config.titleItalic })}
                className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                  config.titleItalic
                    ? 'border-[#1D4ED8] bg-[#EFF4FF] text-[#1D4ED8]'
                    : 'border-[#E6E4DC] bg-[#FAF9F5] text-[#4B4D54]'
                }`}
              >
                <Italic className="w-3 h-3" aria-hidden="true" />
                <span>Italique</span>
              </button>

              <button
                type="button"
                aria-pressed={config.titleUppercase}
                aria-label="Majuscules"
                onClick={() => update({ titleUppercase: !config.titleUppercase })}
                className={`px-2 py-1 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                  config.titleUppercase
                    ? 'border-[#1D4ED8] bg-[#EFF4FF] text-[#1D4ED8]'
                    : 'border-[#E6E4DC] bg-[#FAF9F5] text-[#4B4D54]'
                }`}
              >
                AA
              </button>

              <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[#E6E4DC] bg-[#FAF9F5] cursor-pointer">
                <span className="text-[10px] font-semibold text-[#4B4D54]">Encre</span>
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

          {/* Horizontal Row: Title & Subtitle inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="flex items-center gap-2 bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl px-3 py-1.5">
              <label
                htmlFor="frame-title"
                className="text-[11px] font-semibold text-[#6E7078] whitespace-nowrap shrink-0"
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
                className="w-full text-xs bg-transparent text-[#111214] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl px-3 py-1.5">
              <label
                htmlFor="frame-subtitle"
                className="text-[11px] font-semibold text-[#6E7078] whitespace-nowrap shrink-0"
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
                className="w-full text-xs bg-transparent text-[#111214] focus:outline-none"
              />
            </div>
          </div>

          {/* Horizontal Font Strip (Cursive/Scripts + Display/Serif/Mono) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-[#5C5E66]">
                Police principale (cursives, calligraphie & éditoriales)
              </span>
              <span className="text-[11px] font-semibold text-[#1D4ED8]">
                {FONT_CATALOG[config.fontId]?.label} · {FONT_CATALOG[config.fontId]?.styleTag}
              </span>
            </div>
            <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
              {fontKeys.map((fontKey) => {
                const f = FONT_CATALOG[fontKey];
                const active = config.fontId === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    data-testid={`font-btn-${f.id}`}
                    onClick={() => update({ fontId: f.id, themeId: 'custom' })}
                    className={`flex flex-col items-center justify-center px-3 py-2 rounded-xl border transition-colors shrink-0 min-w-[92px] cursor-pointer ${
                      active
                        ? 'border-[#1D4ED8] bg-[#EFF4FF]'
                        : 'border-[#E6E4DC] bg-[#FAF9F5] hover:bg-white'
                    }`}
                  >
                    <span
                      className="text-lg leading-tight text-[#111214] whitespace-nowrap"
                      style={{ fontFamily: f.cssFamily }}
                    >
                      Aa Bb
                    </span>
                    <span className="text-[10px] font-semibold text-[#2C2E33] whitespace-nowrap mt-0.5">
                      {f.label}
                    </span>
                    <span className="text-[9px] text-[#6E7078] whitespace-nowrap">
                      {f.styleTag}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Horizontal Row: Subtitle Font + 3 Size Sliders (Title, Subtitle, Encoded Text) */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1 items-center">
            <div>
              <label
                htmlFor="subtitle-font-select"
                className="block text-[11px] font-medium text-[#4B4D54] mb-1"
              >
                Police légende
              </label>
              <select
                id="subtitle-font-select"
                value={config.subtitleFontId}
                onChange={(e) => update({ subtitleFontId: e.target.value as QrFontId })}
                className="w-full px-2.5 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-lg"
              >
                {fontKeys.map((k) => (
                  <option key={k} value={k}>
                    {FONT_CATALOG[k].label} ({FONT_CATALOG[k].styleTag})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="title-size-range" className="text-[11px] font-medium text-[#4B4D54]">
                  Taille titre
                </label>
                <span className="text-[11px] font-mono text-[#5C5E66] tabular-nums">
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
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="subtitle-size-range" className="text-[11px] font-medium text-[#4B4D54]">
                  Taille légende
                </label>
                <span className="text-[11px] font-mono text-[#5C5E66] tabular-nums">
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

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="message-size-range" className="text-[11px] font-medium text-[#4B4D54]">
                  Taille message
                </label>
                <span className="text-[11px] font-mono text-[#5C5E66] tabular-nums">
                  {config.messageFontSize}px
                </span>
              </div>
              <input
                id="message-size-range"
                type="range"
                min={14}
                max={28}
                value={config.messageFontSize}
                onChange={(e) => update({ messageFontSize: Number(e.target.value) })}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* BARRE 3 : MODULES & REPÈRES D'ANGLE */}
        <div className="px-4 sm:px-5 py-4 space-y-3" data-testid="bar-geometry">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <h3 className="font-display text-xs font-bold text-[#111214] sm:w-28 shrink-0">
              Modules
            </h3>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 flex-1">
              {MODULE_SHAPES.map((item) => {
                const active = config.moduleShape === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => update({ moduleShape: item.id, themeId: 'custom' })}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'border-[#1D4ED8] bg-[#EFF4FF] text-[#1D4ED8]'
                        : 'border-[#E6E4DC] bg-[#FAF9F5] text-[#2C2E33] hover:bg-white'
                    }`}
                  >
                    <ModuleGlyph shape={item.id} />
                    <span className="text-[11px] font-semibold">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <h3 className="font-display text-xs font-bold text-[#111214] sm:w-28 shrink-0">
              Repères d’angle
            </h3>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 flex-1">
              {EYE_SHAPES.map((item) => {
                const active = config.eyeShape === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => update({ eyeShape: item.id, themeId: 'custom' })}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'border-[#1D4ED8] bg-[#EFF4FF] text-[#1D4ED8]'
                        : 'border-[#E6E4DC] bg-[#FAF9F5] text-[#2C2E33] hover:bg-white'
                    }`}
                  >
                    <EyeGlyph shape={item.id} />
                    <span className="text-[11px] font-semibold">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* BARRE 4 : COULEURS, DÉGRADÉS, CADRE & FILTRES */}
        <div className="px-4 sm:px-5 py-4 space-y-3" data-testid="bar-colors-filters">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-xs font-bold text-[#111214]">
              Couleurs & Dégradés
            </h3>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex p-0.5 bg-[#F2F1EB] rounded-lg gap-0.5">
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
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      config.gradientType === m.id
                        ? 'bg-white text-[#111214] shadow-2xs'
                        : 'text-[#5C5E66] hover:text-[#111214]'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FAF9F5] border border-[#E6E4DC] cursor-pointer">
                <span className="text-[11px] font-semibold text-[#3F4148]">Modules</span>
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
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FAF9F5] border border-[#E6E4DC] cursor-pointer">
                  <span className="text-[11px] font-semibold text-[#3F4148]">Dégradé</span>
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

              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FAF9F5] border border-[#E6E4DC] cursor-pointer">
                <span className="text-[11px] font-semibold text-[#3F4148]">Fond QR</span>
                <input
                  id="qr-bg-color"
                  type="color"
                  aria-label="Couleur de fond du QR"
                  value={config.qrBackgroundColor}
                  onChange={(e) => update({ qrBackgroundColor: e.target.value, themeId: 'custom' })}
                  className="w-5 h-5 rounded border border-black/15 bg-white cursor-pointer p-0"
                />
              </label>

              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FAF9F5] border border-[#E6E4DC] cursor-pointer">
                <span className="text-[11px] font-semibold text-[#3F4148]">Carte</span>
                <input
                  id="card-bg-color"
                  type="color"
                  aria-label="Couleur de la carte"
                  value={config.cardBackgroundColor}
                  onChange={(e) => update({ cardBackgroundColor: e.target.value, themeId: 'custom' })}
                  className="w-5 h-5 rounded border border-black/15 bg-white cursor-pointer p-0"
                />
              </label>

              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FAF9F5] border border-[#E6E4DC] cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.useCustomEyeColor}
                  onChange={(e) =>
                    update({ useCustomEyeColor: e.target.checked, themeId: 'custom' })
                  }
                  className="w-3.5 h-3.5 rounded accent-[#1D4ED8]"
                />
                <span className="text-[11px] font-semibold text-[#3F4148]">Repères</span>
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

          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <span className="text-[11px] font-semibold text-[#5C5E66] sm:w-28 shrink-0">
              Cadre carte
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 flex-1">
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
                        ? 'border-[#1D4ED8] bg-[#EFF4FF] text-[#1D4ED8]'
                        : 'border-[#E6E4DC] bg-[#FAF9F5] text-[#3F4148] hover:bg-white'
                    }`}
                  >
                    {fr.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Textures, Metallic Sheen, Border & VIP Edition label */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <span className="text-[11px] font-semibold text-[#5C5E66] sm:w-28 shrink-0">
              Matière &amp; Reflet
            </span>
            <div className="flex flex-wrap items-center gap-1.5 flex-1">
              {TEXTURE_CATALOG.map((tex) => {
                const active = config.cardTexture === tex.id;
                return (
                  <button
                    key={tex.id}
                    type="button"
                    onClick={() =>
                      update({ cardTexture: tex.id as QrCardTexture, themeId: 'custom' })
                    }
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'border-[#1D4ED8] bg-[#EFF4FF] text-[#1D4ED8]'
                        : 'border-[#E6E4DC] bg-[#FAF9F5] text-[#3F4148] hover:bg-white'
                    }`}
                  >
                    {tex.label}
                  </button>
                );
              })}

              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-[#E6E4DC] bg-[#FAF9F5] cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(config.metallicSheen)}
                  onChange={(e) =>
                    update({ metallicSheen: e.target.checked, themeId: 'custom' })
                  }
                  className="w-3.5 h-3.5 accent-[#1D4ED8]"
                />
                <span className="text-[11px] font-semibold text-[#3F4148]">Reflet métal</span>
              </label>

              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-xl border border-[#E6E4DC] bg-[#FAF9F5]">
                <label htmlFor="card-border-width" className="text-[11px] font-medium text-[#4B4D54]">
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
                <span className="text-[10px] font-mono text-[#5C5E66] tabular-nums">
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
            <div className="flex items-center gap-2.5">
              <label
                htmlFor="edition-label-input"
                className="text-[11px] font-semibold text-[#5C5E66] sm:w-28 shrink-0"
              >
                Gravure VIP
              </label>
              <input
                id="edition-label-input"
                type="text"
                maxLength={32}
                value={config.editionLabel || ''}
                onChange={(e) => update({ editionLabel: e.target.value })}
                placeholder="ÉDITION LIMITÉE · N° 01"
                className="flex-1 max-w-xs px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
              />
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <span className="text-[11px] font-semibold text-[#5C5E66] sm:w-28 shrink-0">
              Filtre artistique
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 flex-1">
              {FILTER_CATALOG.map((flt) => {
                const active = config.filter === flt.id;
                return (
                  <button
                    key={flt.id}
                    type="button"
                    onClick={() => update({ filter: flt.id, themeId: 'custom' })}
                    className={`px-3 py-1.5 text-[11px] font-semibold rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'border-[#1D4ED8] bg-[#EFF4FF] text-[#1D4ED8]'
                        : 'border-[#E6E4DC] bg-[#FAF9F5] text-[#3F4148] hover:bg-white'
                    }`}
                  >
                    {flt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* BARRE 5 : STICKERS CENTRE & COINS + FINITIONS */}
        <div className="px-4 sm:px-5 py-4 space-y-3.5" data-testid="bar-stickers">
          {/* Center Stickers Row */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <h3 className="font-display text-xs font-bold text-[#111214]">
                  Stickers & Icônes au centre
                </h3>
                <div className="inline-flex p-0.5 bg-[#F2F1EB] rounded-lg gap-0.5">
                  <button
                    type="button"
                    onClick={() => setCenterStickerMode('vector')}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                      centerStickerMode === 'vector'
                        ? 'bg-white text-[#111214] shadow-2xs'
                        : 'text-[#5C5E66] hover:text-[#111214]'
                    }`}
                  >
                    Vectoriels
                  </button>
                  <button
                    type="button"
                    onClick={() => setCenterStickerMode('emoji')}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                      centerStickerMode === 'emoji'
                        ? 'bg-white text-[#111214] shadow-2xs'
                        : 'text-[#5C5E66] hover:text-[#111214]'
                    }`}
                  >
                    Stickers Emoji
                  </button>
                </div>
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
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-[#111214] bg-[#F2F1EB] hover:bg-[#E5E3DA] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Upload className="w-3 h-3" aria-hidden="true" />
                  <span>Importer</span>
                </button>
                {(config.logoId || config.customLogoDataUrl || config.centerEmoji) && (
                  <button
                    type="button"
                    onClick={() =>
                      update({ logoId: null, customLogoDataUrl: null, centerEmoji: null })
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#B91C1C] bg-[#FEF2F2] hover:bg-[#FEE2E2] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Ban className="w-3 h-3" aria-hidden="true" />
                    <span>Aucun</span>
                  </button>
                )}
              </div>
            </div>

            {centerStickerMode === 'vector' ? (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {UNIQUE_LOGOS.map((logo) => {
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
                      className={`flex flex-col items-center gap-1 px-2.5 py-1.5 rounded-xl border transition-colors shrink-0 min-w-[68px] cursor-pointer ${
                        active
                          ? 'border-[#1D4ED8] bg-[#EFF4FF]'
                          : 'border-[#E6E4DC] bg-[#FAF9F5] hover:bg-white'
                      }`}
                    >
                      <svg viewBox={logo.viewBox} className="w-5 h-5" aria-hidden="true">
                        {logo.circles?.map((c, idx) => (
                          <circle
                            key={idx}
                            cx={c.cx}
                            cy={c.cy}
                            r={c.r}
                            fill={c.fill ? (active ? '#1D4ED8' : '#111214') : 'none'}
                            stroke={c.stroke ? (active ? '#1D4ED8' : '#111214') : 'none'}
                            strokeWidth={c.strokeWidth || 0}
                          />
                        ))}
                        {logo.paths.map((p, idx) => (
                          <path
                            key={idx}
                            d={p.d}
                            fill={p.fill ? (active ? '#1D4ED8' : '#111214') : 'none'}
                            stroke={p.stroke ? (active ? '#1D4ED8' : '#111214') : 'none'}
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
                            fill={active ? '#1D4ED8' : '#111214'}
                            style={{ fontSize: '14px', fontWeight: 700 }}
                          >
                            {(config.monogramText || 'KQ').slice(0, 3).toUpperCase()}
                          </text>
                        )}
                      </svg>
                      <span className="text-[10px] font-medium text-[#2C2E33] whitespace-nowrap">
                        {logo.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {EMOJI_STICKER_CATALOG.map((item) => {
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
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-colors cursor-pointer ${
                        active
                          ? 'border-[#1D4ED8] bg-[#EFF4FF]'
                          : 'border-[#E6E4DC] bg-[#FAF9F5] hover:bg-white'
                      }`}
                    >
                      <span className="text-base leading-none" aria-hidden="true">
                        {item.emoji}
                      </span>
                      <span className="text-[10px] font-medium text-[#4B4D54]">
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
                  className="w-16 px-2 py-1.5 text-center text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                />
              </div>
            )}

            {centerStickerMode === 'vector' &&
              config.logoId === 'monogram' &&
              !config.customLogoDataUrl && (
                <div className="flex items-center gap-2.5 pt-1">
                  <label htmlFor="monogram-input" className="text-xs font-medium text-[#3F4148]">
                    Initiales :
                  </label>
                  <input
                    id="monogram-input"
                    type="text"
                    maxLength={3}
                    value={config.monogramText}
                    onChange={(e) => update({ monogramText: e.target.value })}
                    placeholder="KQ"
                    className="w-20 px-2.5 py-1 text-xs font-bold uppercase bg-[#FAF9F5] border border-[#DBD8CE] rounded-lg"
                  />
                </div>
              )}

            {/* Center Knockout, Size, Color */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <div className="inline-flex items-center gap-1">
                {KNOCKOUT_SHAPES.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => update({ logoKnockout: k.id })}
                    className={`px-2 py-1 text-[11px] font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      config.logoKnockout === k.id
                        ? 'border-[#1D4ED8] bg-[#EFF4FF] text-[#1D4ED8]'
                        : 'border-[#E6E4DC] bg-[#FAF9F5] text-[#4B4D54]'
                    }`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 flex-1 min-w-[140px] max-w-[220px]">
                <label htmlFor="logo-size-range" className="text-[11px] font-medium text-[#4B4D54] whitespace-nowrap">
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
                <span className="text-[11px] font-mono text-[#5C5E66] tabular-nums">
                  {Math.round(config.logoSize * 100)}%
                </span>
              </div>

              {!config.customLogoDataUrl && !config.centerEmoji && (
                <label className="inline-flex items-center gap-1.5 cursor-pointer shrink-0">
                  <span className="text-[11px] font-medium text-[#5C5E66]">Couleur</span>
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

          {/* Corner Stickers Row */}
          <div className="pt-3 border-t border-[#EFECE4] space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-xs font-bold text-[#111214]">
                Stickers sur les coins
              </h3>

              <div className="flex flex-wrap items-center gap-1.5">
                {CORNER_PLACEMENTS.map((p) => {
                  const active = config.cornerStickerPlacement === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => update({ cornerStickerPlacement: p.id })}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'border-[#1D4ED8] bg-[#EFF4FF] text-[#1D4ED8]'
                          : 'border-[#E6E4DC] bg-[#FAF9F5] text-[#4B4D54] hover:bg-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}

                {config.cornerStickerPlacement !== 'none' && (
                  <div className="inline-flex p-0.5 bg-[#F2F1EB] rounded-lg gap-0.5 ml-1">
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
                        className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                          config.cornerStickerKind === kind.id
                            ? 'bg-white text-[#111214] shadow-2xs'
                            : 'text-[#5C5E66] hover:text-[#111214]'
                        }`}
                      >
                        {kind.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {config.cornerStickerPlacement !== 'none' && (
              <div className="flex flex-wrap items-center gap-2">
                {config.cornerStickerKind === 'emoji' ? (
                  <>
                    {EMOJI_STICKER_CATALOG.map((item) => {
                      const active = config.cornerStickerEmoji === item.emoji;
                      return (
                        <button
                          key={`corner-${item.label}`}
                          type="button"
                          aria-label={`Sticker coin ${item.label}`}
                          onClick={() => update({ cornerStickerEmoji: item.emoji })}
                          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                            active
                              ? 'border-[#1D4ED8] bg-[#EFF4FF]'
                              : 'border-[#E6E4DC] bg-[#FAF9F5] hover:bg-white'
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
                      className="w-12 px-1.5 py-1 text-center text-sm bg-[#FAF9F5] border border-[#DBD8CE] rounded-lg"
                    />
                  </>
                ) : (
                  <>
                    {UNIQUE_LOGOS.map((logo) => {
                      const active = config.cornerStickerVectorId === logo.id;
                      return (
                        <button
                          key={`corner-vec-${logo.id}`}
                          type="button"
                          aria-label={`Icône coin ${logo.name}`}
                          onClick={() => update({ cornerStickerVectorId: logo.id })}
                          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                            active
                              ? 'border-[#1D4ED8] bg-[#EFF4FF]'
                              : 'border-[#E6E4DC] bg-[#FAF9F5] hover:bg-white'
                          }`}
                        >
                          <svg viewBox={logo.viewBox} className="w-4 h-4" aria-hidden="true">
                            {logo.circles?.map((c, idx) => (
                              <circle
                                key={idx}
                                cx={c.cx}
                                cy={c.cy}
                                r={c.r}
                                fill={c.fill ? (active ? '#1D4ED8' : '#111214') : 'none'}
                                stroke={c.stroke ? (active ? '#1D4ED8' : '#111214') : 'none'}
                                strokeWidth={c.strokeWidth || 0}
                              />
                            ))}
                            {logo.paths.map((p, idx) => (
                              <path
                                key={idx}
                                d={p.d}
                                fill={p.fill ? (active ? '#1D4ED8' : '#111214') : 'none'}
                                stroke={p.stroke ? (active ? '#1D4ED8' : '#111214') : 'none'}
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
                                fill={active ? '#1D4ED8' : '#111214'}
                                style={{ fontSize: '14px', fontWeight: 700 }}
                              >
                                {(config.monogramText || 'KQ').slice(0, 3).toUpperCase()}
                              </text>
                            )}
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
                  <label htmlFor="corner-sticker-scale" className="text-[11px] font-medium text-[#4B4D54] whitespace-nowrap">
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
                  <span className="text-[11px] font-mono text-[#5C5E66] tabular-nums">
                    {Math.round((config.cornerStickerScale || 1) * 100)}%
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Technical Finishing Bar */}
          <div className="pt-3 border-t border-[#EFECE4] grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
            <div className="flex items-center gap-2.5">
              <label htmlFor="card-radius" className="text-[11px] font-medium text-[#4B4D54] whitespace-nowrap">
                Arrondi
              </label>
              <input
                id="card-radius"
                type="range"
                min={0}
                max={32}
                value={config.cornerRadius}
                onChange={(e) => update({ cornerRadius: Number(e.target.value) })}
                className="flex-1"
              />
              <span className="text-[11px] font-mono text-[#5C5E66] tabular-nums w-9 text-right">
                {config.cornerRadius}px
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <label htmlFor="qr-margin" className="text-[11px] font-medium text-[#4B4D54] whitespace-nowrap">
                Marge QR
              </label>
              <input
                id="qr-margin"
                type="range"
                min={1}
                max={4}
                step={1}
                value={config.margin}
                onChange={(e) => update({ margin: Number(e.target.value) })}
                className="flex-1"
              />
              <span className="text-[11px] font-mono text-[#5C5E66] tabular-nums w-4 text-right">
                {config.margin}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="qr-ec" className="text-[11px] font-medium text-[#4B4D54] whitespace-nowrap">
                Correction
              </label>
              <select
                id="qr-ec"
                value={config.errorCorrection}
                onChange={(e) =>
                  update({ errorCorrection: e.target.value as QrErrorCorrection })
                }
                className="flex-1 px-2.5 py-1 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-lg"
              >
                <option value="L">L — 7 %</option>
                <option value="M">M — 15 %</option>
                <option value="Q">Q — 25 %</option>
                <option value="H">H — 30 %</option>
              </select>
            </div>
          </div>
        </div>

        {/* BARRE 6 : ÉDITEUR GRAPHIQUE AVANCÉ — TRANSFORMATIONS, TEXTES LIBRES & CALQUES */}
        <div className="px-4 sm:px-5 py-4 space-y-4" data-testid="bar-advanced-editor">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-xs font-bold text-[#111214]">
              Éditeur avancé · Positionnement, Textes libres &amp; Calques
            </h3>
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
              className="text-[11px] font-semibold text-[#1D4ED8] hover:underline cursor-pointer"
            >
              Recentrer les éléments
            </button>
          </div>

          {/* Position & Rotation Sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="logo-offset-x" className="text-[11px] font-medium text-[#4B4D54] w-20 shrink-0">
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
              <span className="text-[11px] font-mono text-[#5C5E66] tabular-nums w-9 text-right">
                {config.logoOffsetX ?? 0}px
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="logo-offset-y" className="text-[11px] font-medium text-[#4B4D54] w-20 shrink-0">
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
              <span className="text-[11px] font-mono text-[#5C5E66] tabular-nums w-9 text-right">
                {config.logoOffsetY ?? 0}px
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="logo-rotation" className="text-[11px] font-medium text-[#4B4D54] w-20 shrink-0">
                Rotation logo
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
              <span className="text-[11px] font-mono text-[#5C5E66] tabular-nums w-9 text-right">
                {config.logoRotation ?? 0}°
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="title-offset-y" className="text-[11px] font-medium text-[#4B4D54] w-20 shrink-0">
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
              <span className="text-[11px] font-mono text-[#5C5E66] tabular-nums w-9 text-right">
                {config.titleOffsetY ?? 0}px
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="corner-offset" className="text-[11px] font-medium text-[#4B4D54] w-20 shrink-0">
                Décal. coins
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
              <span className="text-[11px] font-mono text-[#5C5E66] tabular-nums w-9 text-right">
                {config.cornerStickerOffset ?? 0}px
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="corner-rotation" className="text-[11px] font-medium text-[#4B4D54] w-20 shrink-0">
                Rotat. coins
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
              <span className="text-[11px] font-mono text-[#5C5E66] tabular-nums w-9 text-right">
                {config.cornerStickerRotation ?? 0}°
              </span>
            </div>
          </div>

          {/* Extra Free Text Overlays */}
          <div className="pt-3 border-t border-[#EFECE4] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#111214]">
                Textes libres positionnés ({(config.extraTexts || []).length})
              </span>
              <button
                type="button"
                data-testid="add-extra-text-btn"
                onClick={handleAddExtraText}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#1D4ED8] bg-[#EFF4FF] hover:bg-[#E0EAFF] rounded-lg cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Ajouter un texte</span>
              </button>
            </div>

            {(config.extraTexts || []).map((overlay) => (
              <div
                key={overlay.id}
                className="p-2.5 rounded-xl bg-[#FAF9F5] border border-[#E6E4DC] space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={overlay.text}
                    maxLength={40}
                    onChange={(e) =>
                      handleUpdateExtraText(overlay.id, { text: e.target.value })
                    }
                    className="flex-1 min-w-[140px] px-2.5 py-1 text-xs bg-white border border-[#DBD8CE] rounded-lg"
                  />
                  <select
                    value={overlay.fontId}
                    onChange={(e) =>
                      handleUpdateExtraText(overlay.id, {
                        fontId: e.target.value as QrFontId,
                      })
                    }
                    className="px-2 py-1 text-[11px] bg-white border border-[#DBD8CE] rounded-lg"
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
                    className="p-1 text-[#6E7078] hover:text-[#B91C1C] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-[#5C5E66]">
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
          <div className="pt-3 border-t border-[#EFECE4] space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#111214]">
              <Layers className="w-3.5 h-3.5 text-[#1D4ED8]" aria-hidden="true" />
              <span>Contrôle des calques (ordre d’empilement)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {activeLayers.map((layer, index) => (
                <div
                  key={layer.id}
                  data-testid={`layer-row-${layer.id}`}
                  className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border ${
                    layer.visible
                      ? 'bg-[#FAF9F5] border-[#E6E4DC]'
                      : 'bg-[#F3F2EE] border-[#E6E4DC] opacity-60'
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
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#111214] min-w-0 cursor-pointer"
                  >
                    {layer.visible ? (
                      <Eye className="w-3.5 h-3.5 text-[#1D4ED8] shrink-0" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-[#6E7078] shrink-0" />
                    )}
                    <span className="truncate">{layer.label}</span>
                  </button>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      disabled={index === 0}
                      aria-label={`Descendre ${layer.label}`}
                      onClick={() => handleMoveLayer(layer.id, 'down')}
                      className="p-1 text-[#5C5E66] hover:text-[#111214] disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={index === activeLayers.length - 1}
                      aria-label={`Monter ${layer.label}`}
                      onClick={() => handleMoveLayer(layer.id, 'up')}
                      className="p-1 text-[#5C5E66] hover:text-[#111214] disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
