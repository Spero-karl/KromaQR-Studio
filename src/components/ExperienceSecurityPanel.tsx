import React, { useEffect, useRef, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  FileText,
  ImagePlus,
  Lock,
  Moon,
  Music,
  Plus,
  Shield,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
import {
  DEMO_IMAGE_PATH,
  DEMO_IMAGE_PATH_ALT,
  DEMO_VIDEO_PATH,
  DEMO_VIDEO_PATH_ALT,
  POST_SCAN_TEMPLATES,
  PROJECT_CATEGORIES,
} from '../data/presets';
import type {
  DynamicSecurityConfig,
  PostScanExperience,
  PostScanMediaItem,
  PostScanTemplate,
  ProjectCategory,
} from '../types/qr';
import { workspaceHeaders } from '../utils/dynamicApi';
import {
  encryptFileForUpload,
  generateE2eeKeyBase64Url,
} from '../utils/e2eeCrypto';
import { isInternalMediaPath } from '../utils/publicUrl';

interface ExperienceSecurityPanelProps {
  experience: PostScanExperience;
  onChangeExperience: (next: PostScanExperience) => void;
  dynamicSecurity: DynamicSecurityConfig;
  onChangeSecurity: (next: DynamicSecurityConfig) => void;
  projectCategory: ProjectCategory;
  onChangeCategory: (next: ProjectCategory) => void;
  e2eeEnabled?: boolean;
  e2eeKey?: string;
  onEnsureE2eeKey?: () => string;
  onMediaUploaded?: () => void;
}

const MOOD_OPTIONS: Array<{
  id: PostScanExperience['accentMood'];
  label: string;
}> = [
  { id: 'auto', label: 'Automatique (thème)' },
  { id: 'gold-velvet', label: 'Velours Or 24K' },
  { id: 'midnight-neon', label: 'Nuit Néon' },
  { id: 'cinema-35', label: 'Cinéma 35mm' },
  { id: 'botanical', label: 'Botanique Clair' },
];

export const ExperienceSecurityPanel: React.FC<ExperienceSecurityPanelProps> = ({
  experience,
  onChangeExperience,
  dynamicSecurity,
  onChangeSecurity,
  projectCategory,
  onChangeCategory,
  e2eeEnabled = true,
  e2eeKey,
  onEnsureE2eeKey,
  onMediaUploaded,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'experience' | 'security'>('experience');
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const galleryFileRef = useRef<HTMLInputElement>(null);
  const localThumbsRef = useRef<Record<string, string>>({});
  const [localThumbs, setLocalThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    const map = localThumbsRef.current;
    return () => {
      Object.values(map).forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const updateExp = (patch: Partial<PostScanExperience>) => {
    onChangeExperience({ ...experience, ...patch });
  };

  const updateSec = (patch: Partial<DynamicSecurityConfig>) => {
    onChangeSecurity({ ...dynamicSecurity, ...patch });
  };

  const handleGalleryUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setGalleryError(null);
    setUploadingGallery(true);
    try {
      const added: PostScanMediaItem[] = [];
      let activeKey = e2eeKey || '';
      if (e2eeEnabled && !activeKey) {
        activeKey = onEnsureE2eeKey ? onEnsureE2eeKey() : generateE2eeKeyBase64Url();
      }

      for (const file of Array.from(files).slice(0, 6)) {
        const mediaKind: PostScanMediaItem['type'] = file.type.startsWith('video/')
          ? 'video'
          : file.type.startsWith('audio/')
          ? 'audio'
          : file.type.startsWith('image/')
          ? 'image'
          : 'document';

        const fd = new FormData();
        let origName = file.name;
        let origMime = file.type;
        let origSize = file.size;

        if (e2eeEnabled && activeKey) {
          const { encryptedFile, meta } = await encryptFileForUpload(file, activeKey);
          origName = meta.originalName;
          origMime = meta.originalMimeType;
          origSize = meta.originalSize;
          fd.append('file', encryptedFile);
          fd.append('isEncrypted', 'true');
          fd.append('mediaType', mediaKind);
          fd.append('originalSize', String(origSize));
        } else {
          fd.append('file', file);
          fd.append('mediaType', mediaKind);
        }

        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: workspaceHeaders(),
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Échec du téléversement.');
        }

        const uploadedUrl = data.fileUrl || data.url;
        if (e2eeEnabled && uploadedUrl && (mediaKind === 'image' || mediaKind === 'video')) {
          localThumbsRef.current[uploadedUrl] = URL.createObjectURL(file);
          setLocalThumbs({ ...localThumbsRef.current });
        }

        added.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: mediaKind,
          url: uploadedUrl,
          caption: '',
          mimeType: origMime || undefined,
          isEncrypted: e2eeEnabled,
          originalSize: origSize,
        });
      }
      updateExp({ galleryItems: [...experience.galleryItems, ...added] });
      onMediaUploaded?.();
    } catch (err) {
      setGalleryError(err instanceof Error ? err.message : 'Erreur d’importation.');
    } finally {
      setUploadingGallery(false);
    }
  };

  const activeTemplateMeta = POST_SCAN_TEMPLATES.find((t) => t.id === experience.template);
  const currentReaderTheme: 'light' | 'dark' =
    experience.readerThemeMode === 'dark' ? 'dark' : 'light';

  return (
    <section
      aria-labelledby="exp-sec-heading"
      data-testid="experience-security-panel"
      className="bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] rounded-2xl overflow-hidden shadow-[0_2px_10px_rgba(15,23,42,0.03)] transition-colors"
    >
      <div className="px-5 sm:px-6 py-4 bg-[#F8FAFC] dark:bg-[#0F172A] border-b border-[#E2E6F0] dark:border-[#242C3D] flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0D9488] dark:text-[#2DD4BF]">
            Étape 3 · Après scan
          </span>
          <h2
            id="exp-sec-heading"
            className="font-display text-sm sm:text-base font-bold tracking-tight text-[#111214] dark:text-[#F1F5F9] mt-0.5"
          >
            Affichage après scan &amp; Sécurité
          </h2>
          <p className="text-xs text-[#6E7078] dark:text-[#94A3B8] truncate mt-0.5">
            {activeTemplateMeta?.label || 'Aperçu direct'}
            {' · '}
            Mode {currentReaderTheme === 'dark' ? 'Sombre' : 'Clair'}
            {' · '}
            {dynamicSecurity.enabled
              ? `QR dynamique${dynamicSecurity.pinCode || dynamicSecurity.hasPin ? ' · Code PIN' : ''}`
              : 'QR statique'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Quick Clair / Sombre Post-Scan Mode Switcher */}
          <div
            role="group"
            aria-label="Mode d'affichage après scan"
            className="inline-flex p-0.5 bg-[#EEF2F6] dark:bg-[#1E293B] rounded-xl border border-[#DCE2EE] dark:border-[#334155]"
          >
            <button
              type="button"
              data-testid="post-scan-mode-light"
              aria-pressed={currentReaderTheme === 'light'}
              onClick={() => updateExp({ readerThemeMode: 'light' })}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 whitespace-nowrap cursor-pointer ${
                currentReaderTheme === 'light'
                  ? 'bg-white text-[#111214] shadow-2xs'
                  : 'text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-white'
              }`}
            >
              <Sun className="w-3.5 h-3.5 text-[#D97706]" aria-hidden="true" />
              <span>Clair</span>
            </button>
            <button
              type="button"
              data-testid="post-scan-mode-dark"
              aria-pressed={currentReaderTheme === 'dark'}
              onClick={() => updateExp({ readerThemeMode: 'dark' })}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 whitespace-nowrap cursor-pointer ${
                currentReaderTheme === 'dark'
                  ? 'bg-[#111318] text-white shadow-2xs'
                  : 'text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-white'
              }`}
            >
              <Moon className="w-3.5 h-3.5 text-[#60A5FA]" aria-hidden="true" />
              <span>Sombre</span>
            </button>
          </div>

          <button
            type="button"
            data-testid="toggle-exp-sec-btn"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#111214] dark:text-[#F1F5F9] bg-white dark:bg-[#131926] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] border border-[#DCE2EE] dark:border-[#334155] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA]" aria-hidden="true" />
            <span>{expanded ? 'Masquer' : 'Personnaliser'}</span>
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-4 sm:p-5 space-y-4">
          {/* Clean Horizontal Tab + Category Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#EFEFF5] dark:border-[#242C3D]">
            <div className="inline-flex p-0.5 bg-[#F1F5F9] dark:bg-[#0F172A] rounded-xl gap-0.5 border border-[#E2E6F0] dark:border-[#242C3D]">
              <button
                type="button"
                data-testid="tab-post-scan"
                onClick={() => setActiveTab('experience')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'experience'
                    ? 'bg-white dark:bg-[#1E293B] text-[#111214] dark:text-white shadow-2xs'
                    : 'text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Expérience après scan</span>
              </button>
              <button
                type="button"
                data-testid="tab-dynamic-security"
                onClick={() => setActiveTab('security')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'security'
                    ? 'bg-white dark:bg-[#1E293B] text-[#111214] dark:text-white shadow-2xs'
                    : 'text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-white'
                }`}
              >
                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>QR Dynamique &amp; PIN</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="project-category-select" className="text-[11px] font-medium text-[#5C5E66] dark:text-[#94A3B8]">
                Classement
              </label>
              <select
                id="project-category-select"
                value={projectCategory}
                onChange={(e) => onChangeCategory(e.target.value as ProjectCategory)}
                className="px-2.5 py-1 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-lg"
              >
                {PROJECT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {activeTab === 'experience' ? (
            <div className="space-y-4 animate-[fadeIn_160ms_ease-out]">
              {/* Post-Scan Light/Dark Appearance Setting */}
              <div className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E6F0] dark:border-[#242C3D] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#111214] dark:text-[#F1F5F9]">
                    Apparence de la page après scan
                  </span>
                  <span className="text-[11px] text-[#6E7078] dark:text-[#94A3B8]">
                    Mode affiché automatiquement au visiteur
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    data-testid="post-scan-card-light"
                    onClick={() => updateExp({ readerThemeMode: 'light' })}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
                      currentReaderTheme === 'light'
                        ? 'border-[#2563EB] bg-white dark:bg-[#1E293B]'
                        : 'border-[#E2E6F0] dark:border-[#242C3D] bg-white/70 dark:bg-[#131926] hover:bg-white dark:hover:bg-[#1E293B]'
                    }`}
                  >
                    <span className="w-9 h-9 rounded-lg bg-[#FFFBEB] text-[#D97706] flex items-center justify-center shrink-0">
                      <Sun className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <span className="block text-xs font-bold text-[#111214] dark:text-[#F1F5F9]">
                        Mode Clair (par défaut)
                      </span>
                      <span className="block text-[11px] text-[#6E7078] dark:text-[#94A3B8] truncate">
                        Papier éditorial lumineux et épuré
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    data-testid="post-scan-card-dark"
                    onClick={() => updateExp({ readerThemeMode: 'dark' })}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
                      currentReaderTheme === 'dark'
                        ? 'border-[#2563EB] bg-[#111318] text-white'
                        : 'border-[#E2E6F0] dark:border-[#242C3D] bg-white/70 dark:bg-[#131926] hover:bg-white dark:hover:bg-[#1E293B] text-[#111214] dark:text-[#F1F5F9]'
                    }`}
                  >
                    <span className="w-9 h-9 rounded-lg bg-[#1E293B] text-[#60A5FA] flex items-center justify-center shrink-0">
                      <Moon className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <span className="block text-xs font-bold">
                        Mode Sombre
                      </span>
                      <span
                        className={`block text-[11px] truncate ${
                          currentReaderTheme === 'dark' ? 'text-[#94A3B8]' : 'text-[#6E7078] dark:text-[#94A3B8]'
                        }`}
                      >
                        Écrin nocturne élégant et contrasté
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Post-Scan Templates */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {POST_SCAN_TEMPLATES.map((tpl) => {
                  const active = experience.template === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      data-testid={`tpl-${tpl.id}`}
                      onClick={() => updateExp({ template: tpl.id as PostScanTemplate })}
                      className={`px-3 py-2 rounded-xl border text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-[#2563EB] bg-[#EFF4FF] dark:bg-[#1E293B] text-[#1D4ED8] dark:text-[#93C5FD]'
                          : 'border-[#E2E6F0] dark:border-[#242C3D] bg-[#F8FAFC] dark:bg-[#0F172A] text-[#2C2E33] dark:text-[#CBD5E1] hover:bg-white dark:hover:bg-[#1E293B]'
                      }`}
                    >
                      <span className="block text-xs font-bold truncate">{tpl.label}</span>
                      <span className="block text-[10px] opacity-75 truncate mt-0.5">
                        {tpl.hint}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Common headline, mood, description */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label htmlFor="exp-headline" className="block text-[11px] font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1">
                    Titre de la page cible
                  </label>
                  <input
                    id="exp-headline"
                    type="text"
                    value={experience.headline}
                    onChange={(e) => updateExp({ headline: e.target.value })}
                    placeholder="Titre principal après scan"
                    className="w-full px-3 py-1.5 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl"
                  />
                </div>

                <div>
                  <label htmlFor="exp-mood" className="block text-[11px] font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1">
                    Ambiance visuelle
                  </label>
                  <select
                    id="exp-mood"
                    value={experience.accentMood}
                    onChange={(e) =>
                      updateExp({
                        accentMood: e.target.value as PostScanExperience['accentMood'],
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl"
                  >
                    {MOOD_OPTIONS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="exp-cta" className="block text-[11px] font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1">
                    Bouton d’action (optionnel)
                  </label>
                  <input
                    id="exp-cta"
                    type="text"
                    value={experience.ctaLabel}
                    onChange={(e) => updateExp({ ctaLabel: e.target.value })}
                    placeholder="Ex. : Confirmer ma venue"
                    className="w-full px-3 py-1.5 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="exp-desc" className="block text-[11px] font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1">
                  Description / Texte d’accompagnement
                </label>
                <textarea
                  id="exp-desc"
                  rows={2}
                  value={experience.description}
                  onChange={(e) => updateExp({ description: e.target.value })}
                  placeholder="Présentation, programme ou légende affichée lors du scan..."
                  className="w-full px-3 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl"
                />
              </div>

              {/* Template-specific fields */}
              {experience.template === 'event-invite' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t border-[#EFECE4]">
                  <div>
                    <label className="block text-[11px] font-medium text-[#4B4D54] mb-1">Date</label>
                    <input
                      type="text"
                      value={experience.eventDate}
                      onChange={(e) => updateExp({ eventDate: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#4B4D54] mb-1">Heure</label>
                    <input
                      type="text"
                      value={experience.eventTime}
                      onChange={(e) => updateExp({ eventTime: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#4B4D54] mb-1">Lieu</label>
                    <input
                      type="text"
                      value={experience.eventLocation}
                      onChange={(e) => updateExp({ eventLocation: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#4B4D54] mb-1">Dress code / Accès</label>
                    <input
                      type="text"
                      value={experience.eventDressCode}
                      onChange={(e) => updateExp({ eventDressCode: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                    />
                  </div>
                </div>
              )}

              {experience.template === 'business-card' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-[#EFECE4]">
                  <input
                    type="text"
                    aria-label="Nom complet"
                    value={experience.personName}
                    onChange={(e) => updateExp({ personName: e.target.value })}
                    placeholder="Nom complet"
                    className="px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                  />
                  <input
                    type="text"
                    aria-label="Fonction"
                    value={experience.personRole}
                    onChange={(e) => updateExp({ personRole: e.target.value })}
                    placeholder="Fonction"
                    className="px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                  />
                  <input
                    type="text"
                    aria-label="Entreprise"
                    value={experience.companyName}
                    onChange={(e) => updateExp({ companyName: e.target.value })}
                    placeholder="Entreprise / Studio"
                    className="px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                  />
                  <input
                    type="email"
                    aria-label="Email professionnel"
                    value={experience.contactEmail}
                    onChange={(e) => updateExp({ contactEmail: e.target.value })}
                    placeholder="Email"
                    className="px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                  />
                  <input
                    type="text"
                    aria-label="Téléphone"
                    value={experience.contactPhone}
                    onChange={(e) => updateExp({ contactPhone: e.target.value })}
                    placeholder="Téléphone"
                    className="px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                  />
                  <input
                    type="text"
                    aria-label="Site web"
                    value={experience.websiteUrl}
                    onChange={(e) => updateExp({ websiteUrl: e.target.value })}
                    placeholder="https://..."
                    className="px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                  />
                </div>
              )}

              {experience.template === 'postcard' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-[#EFECE4]">
                  <div>
                    <label className="block text-[11px] font-medium text-[#4B4D54] mb-1">Expéditeur</label>
                    <input
                      type="text"
                      value={experience.postcardFrom}
                      onChange={(e) => updateExp({ postcardFrom: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#4B4D54] mb-1">Destinataire</label>
                    <input
                      type="text"
                      value={experience.postcardTo}
                      onChange={(e) => updateExp({ postcardTo: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#4B4D54] mb-1">Cachet postal</label>
                    <input
                      type="text"
                      value={experience.postcardStampText}
                      onChange={(e) => updateExp({ postcardStampText: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                    />
                  </div>
                </div>
              )}

              {experience.template === 'private-page' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-[#EFECE4]">
                  <div>
                    <label className="block text-[11px] font-medium text-[#4B4D54] mb-1">Mention de dossier</label>
                    <input
                      type="text"
                      value={experience.privateBadgeLabel}
                      onChange={(e) => updateExp({ privateBadgeLabel: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#4B4D54] mb-1">Contenu confidentiel</label>
                    <input
                      type="text"
                      value={experience.privateSecretNote}
                      onChange={(e) => updateExp({ privateSecretNote: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                    />
                  </div>
                </div>
              )}

              {experience.template === 'mixed-collection' && (
                <div className="pt-2 border-t border-[#EFEFF5] dark:border-[#242C3D] space-y-2">
                  <label
                    htmlFor="mixed-text-block"
                    className="block text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]"
                  >
                    Texte de la collection mixte (retours à la ligne &amp; emojis préservés)
                  </label>
                  <textarea
                    id="mixed-text-block"
                    data-testid="mixed-text-block-input"
                    rows={3}
                    value={experience.mixedTextBlock || ''}
                    onChange={(e) => updateExp({ mixedTextBlock: e.target.value })}
                    placeholder="Ajoutez un texte éditorial, une histoire ou des notes avec emojis ✨ qui accompagneront vos images et vidéos..."
                    className="w-full px-3 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl resize-y leading-relaxed"
                  />
                </div>
              )}

              {(experience.template === 'photo-gallery' ||
                experience.template === 'video-gallery' ||
                experience.template === 'media-gallery' ||
                experience.template === 'mixed-collection') && (
                <div className="pt-2 border-t border-[#EFEFF5] dark:border-[#242C3D] space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
                      Éléments multimédia ({experience.galleryItems.length})
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={galleryFileRef}
                        type="file"
                        multiple
                        accept={
                          experience.template === 'photo-gallery'
                            ? 'image/*'
                            : experience.template === 'video-gallery'
                            ? 'video/*'
                            : 'image/*,video/*,audio/*,.pdf,.txt,.csv,.docx'
                        }
                        className="sr-only"
                        onChange={(e) => void handleGalleryUpload(e.target.files)}
                      />
                      <button
                        type="button"
                        disabled={uploadingGallery}
                        onClick={() => galleryFileRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-white bg-[#111214] dark:bg-[#2563EB] rounded-lg cursor-pointer"
                      >
                        <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{uploadingGallery ? 'Envoi...' : 'Importer fichiers'}</span>
                      </button>
                      {experience.template !== 'video-gallery' && (
                        <button
                          type="button"
                          data-testid="gallery-add-demo-image"
                          onClick={() => {
                            const hasAlt = experience.galleryItems.some(
                              (g) => g.url === DEMO_IMAGE_PATH_ALT
                            );
                            const nextUrl = hasAlt ? DEMO_IMAGE_PATH : DEMO_IMAGE_PATH_ALT;
                            const nextCaption = hasAlt
                              ? 'Affiche Exposition Studio'
                              : 'Sculpture Laiton & Obsidienne — Galerie';
                            updateExp({
                              galleryItems: [
                                ...experience.galleryItems,
                                {
                                  id: `demo-img-${Date.now()}`,
                                  type: 'image',
                                  url: nextUrl,
                                  caption: nextCaption,
                                },
                              ],
                            });
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#1D4ED8] dark:text-[#93C5FD] bg-[#EFF4FF] dark:bg-[#1E293B] rounded-lg cursor-pointer"
                        >
                          <Plus className="w-3 h-3" aria-hidden="true" />
                          <span>+ Image démo</span>
                        </button>
                      )}
                      {experience.template !== 'photo-gallery' && (
                        <button
                          type="button"
                          data-testid="gallery-add-demo-video"
                          onClick={() => {
                            const hasAltVideo = experience.galleryItems.some(
                              (g) => g.url === DEMO_VIDEO_PATH_ALT
                            );
                            const nextUrl = hasAltVideo
                              ? DEMO_VIDEO_PATH
                              : DEMO_VIDEO_PATH_ALT;
                            const nextPoster = hasAltVideo
                              ? DEMO_IMAGE_PATH
                              : DEMO_IMAGE_PATH_ALT;
                            const nextCaption = hasAltVideo
                              ? 'Teaser Vidéo Atelier'
                              : 'Visite Sculpture — Mouvement II';
                            updateExp({
                              galleryItems: [
                                ...experience.galleryItems,
                                {
                                  id: `demo-vid-${Date.now()}`,
                                  type: 'video',
                                  url: nextUrl,
                                  posterUrl: nextPoster,
                                  caption: nextCaption,
                                },
                              ],
                            });
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#1D4ED8] dark:text-[#93C5FD] bg-[#EFF4FF] dark:bg-[#1E293B] rounded-lg cursor-pointer"
                        >
                          <Plus className="w-3 h-3" aria-hidden="true" />
                          <span>+ Vidéo démo</span>
                        </button>
                      )}
                    </div>
                  </div>
                  {galleryError && (
                    <p className="text-[11px] text-[#B91C1C] dark:text-[#F87171]">{galleryError}</p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {experience.galleryItems.map((item, idx) => (
                      <div
                        key={item.id}
                        className="flex flex-col gap-1.5 p-2 rounded-xl bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E6F0] dark:border-[#242C3D]"
                      >
                        <div className="flex items-center gap-2">
                          {item.type === 'video' ? (
                            <video
                              src={localThumbs[item.url] || item.url}
                              poster={item.posterUrl || undefined}
                              muted
                              className="w-10 h-10 rounded-lg object-contain bg-black shrink-0"
                            />
                          ) : item.type === 'document' ? (
                            <div className="w-10 h-10 rounded-lg bg-[#EFF4FF] dark:bg-[#1E293B] text-[#1D4ED8] dark:text-[#93C5FD] flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4" aria-hidden="true" />
                            </div>
                          ) : item.type === 'audio' ? (
                            <div className="w-10 h-10 rounded-lg bg-[#F5F3FF] dark:bg-[#2E1065]/40 text-[#7C3AED] dark:text-[#C4B5FD] flex items-center justify-center shrink-0">
                              <Music className="w-4 h-4" aria-hidden="true" />
                            </div>
                          ) : (
                            <img
                              src={localThumbs[item.url] || item.url}
                              alt=""
                              className="w-10 h-10 rounded-lg object-contain bg-white dark:bg-[#131926] shrink-0"
                            />
                          )}
                          <input
                            type="text"
                            value={item.caption}
                            onChange={(e) => {
                              const next = [...experience.galleryItems];
                              next[idx] = { ...item, caption: e.target.value };
                              updateExp({ galleryItems: next });
                            }}
                            placeholder="Titre personnalisé (optionnel)..."
                            className="flex-1 min-w-0 px-2 py-1 text-xs bg-white dark:bg-[#131926] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-lg"
                          />
                          <button
                            type="button"
                            aria-label="Retirer de la galerie"
                            onClick={() =>
                              updateExp({
                                galleryItems: experience.galleryItems.filter(
                                  (g) => g.id !== item.id
                                ),
                              })
                            }
                            className="p-1 text-[#6E7078] dark:text-[#94A3B8] hover:text-[#B91C1C] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {item.type === 'video' && (
                          item.posterUrl && isInternalMediaPath(item.posterUrl) ? (
                            <div className="flex items-center justify-between gap-2 px-2 py-1 bg-white dark:bg-[#131926] border border-[#DCE2EE] dark:border-[#2A3346] rounded-lg">
                              <div className="flex items-center gap-2 min-w-0">
                                <img
                                  src={localThumbs[item.posterUrl] || item.posterUrl}
                                  alt="Miniature vidéo"
                                  className="w-6 h-6 rounded object-contain shrink-0"
                                />
                                <span className="text-[11px] font-medium text-[#15803D] dark:text-[#34D399] truncate">
                                  Miniature prête
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = [...experience.galleryItems];
                                  next[idx] = { ...item, posterUrl: '' };
                                  updateExp({ galleryItems: next });
                                }}
                                className="text-[11px] text-[#6E7078] dark:text-[#94A3B8] hover:text-[#B91C1C] cursor-pointer"
                              >
                                Retirer
                              </button>
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={item.posterUrl || ''}
                              onChange={(e) => {
                                const next = [...experience.galleryItems];
                                next[idx] = { ...item, posterUrl: e.target.value };
                                updateExp({ galleryItems: next });
                              }}
                              placeholder="Lien HTTPS miniature vidéo (optionnel)..."
                              className="w-full px-2 py-1 text-[11px] bg-white dark:bg-[#131926] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-lg"
                            />
                          )
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E6F0] dark:border-[#242C3D]">
                <div>
                  <label
                    htmlFor="dynamic-enabled-toggle"
                    className="text-xs font-bold text-[#111214] dark:text-[#F1F5F9] cursor-pointer"
                  >
                    Activer le QR code modifiable (dynamique)
                  </label>
                  <p className="text-[11px] text-[#5C5E66] dark:text-[#94A3B8] mt-0.5">
                    Permet de modifier le contenu après création, compter les scans, protéger par code PIN ou définir une durée d’accessibilité.
                  </p>
                </div>
                <input
                  id="dynamic-enabled-toggle"
                  data-testid="dynamic-enabled-toggle"
                  type="checkbox"
                  checked={dynamicSecurity.enabled}
                  onChange={(e) => updateSec({ enabled: e.target.checked })}
                  className="w-4 h-4 accent-[#2563EB] cursor-pointer"
                />
              </div>

              {dynamicSecurity.enabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label
                      htmlFor="dynamic-pin-input"
                      className="block text-[11px] font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1"
                    >
                      Code PIN / Mot de passe
                    </label>
                    <input
                      id="dynamic-pin-input"
                      data-testid="dynamic-pin-input"
                      type="text"
                      value={dynamicSecurity.pinCode}
                      onChange={(e) => updateSec({ pinCode: e.target.value })}
                      placeholder={dynamicSecurity.hasPin ? 'Laisser vide pour conserver' : 'Ex. : 2468'}
                      className="w-full px-3 py-1.5 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="dynamic-max-scans"
                      className="block text-[11px] font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1"
                    >
                      Limite de scans
                    </label>
                    <input
                      id="dynamic-max-scans"
                      data-testid="dynamic-max-scans"
                      type="number"
                      min={1}
                      value={dynamicSecurity.maxScans ?? ''}
                      onChange={(e) =>
                        updateSec({
                          maxScans: e.target.value ? Math.max(1, Number(e.target.value)) : null,
                        })
                      }
                      placeholder="Illimité"
                      className="w-full px-3 py-1.5 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl tabular-nums"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="dynamic-expires-at"
                      className="block text-[11px] font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1"
                    >
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3" aria-hidden="true" />
                        <span>Expiration automatique</span>
                      </span>
                    </label>
                    <input
                      id="dynamic-expires-at"
                      data-testid="dynamic-expires-at"
                      type="datetime-local"
                      value={dynamicSecurity.expiresAt}
                      onChange={(e) => updateSec({ expiresAt: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl"
                    />
                  </div>

                  <div className="flex flex-col justify-end">
                    <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#DCE2EE] dark:border-[#2A3346] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={dynamicSecurity.active}
                        onChange={(e) => updateSec({ active: e.target.checked })}
                        className="w-3.5 h-3.5 accent-[#2563EB]"
                      />
                      <span className="text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
                        {dynamicSecurity.active ? 'Lien actif' : 'Lien suspendu'}
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
