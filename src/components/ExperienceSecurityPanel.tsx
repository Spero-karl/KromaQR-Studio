import React, { useRef, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Lock,
  Plus,
  Shield,
  Sparkles,
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

interface ExperienceSecurityPanelProps {
  experience: PostScanExperience;
  onChangeExperience: (next: PostScanExperience) => void;
  dynamicSecurity: DynamicSecurityConfig;
  onChangeSecurity: (next: DynamicSecurityConfig) => void;
  projectCategory: ProjectCategory;
  onChangeCategory: (next: ProjectCategory) => void;
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
  onMediaUploaded,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'experience' | 'security'>('experience');
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const galleryFileRef = useRef<HTMLInputElement>(null);

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
      for (const file of Array.from(files).slice(0, 6)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Échec du téléversement.');
        }
        added.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: data.type === 'video' ? 'video' : 'image',
          url: data.fileUrl || data.url,
          caption: data.originalName || file.name,
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

  return (
    <section
      aria-labelledby="exp-sec-heading"
      data-testid="experience-security-panel"
      className="bg-white border border-[#E6E4DC] rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(17,18,20,0.03)]"
    >
      <div className="px-5 sm:px-6 py-4 bg-[#FAF9F5] border-b border-[#F1EFE9] flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="exp-sec-heading"
            className="font-display text-sm sm:text-base font-bold tracking-tight text-[#111214]"
          >
            Options avancées · Destination après scan &amp; Sécurité
          </h2>
          <p className="text-xs text-[#6E7078] truncate mt-0.5">
            {activeTemplateMeta?.label || 'Aperçu direct'}
            {' · '}
            {dynamicSecurity.enabled
              ? `QR dynamique${dynamicSecurity.pinCode || dynamicSecurity.hasPin ? ' · Code PIN' : ''}`
              : 'QR statique'}
            {' · '}
            {projectCategory}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="toggle-exp-sec-btn"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#111214] bg-white hover:bg-[#F4F2EC] border border-[#E6E4DC] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5 text-[#1D4ED8]" aria-hidden="true" />
            <span>{expanded ? 'Masquer' : 'Configurer'}</span>
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
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#EFECE4]">
            <div className="inline-flex p-0.5 bg-[#F2F1EB] rounded-xl gap-0.5">
              <button
                type="button"
                data-testid="tab-post-scan"
                onClick={() => setActiveTab('experience')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'experience'
                    ? 'bg-white text-[#111214] shadow-2xs'
                    : 'text-[#5C5E66] hover:text-[#111214]'
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
                    ? 'bg-white text-[#111214] shadow-2xs'
                    : 'text-[#5C5E66] hover:text-[#111214]'
                }`}
              >
                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>QR Dynamique &amp; PIN</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="project-category-select" className="text-[11px] font-medium text-[#5C5E66]">
                Classement
              </label>
              <select
                id="project-category-select"
                value={projectCategory}
                onChange={(e) => onChangeCategory(e.target.value as ProjectCategory)}
                className="px-2.5 py-1 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-lg"
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
            <div className="space-y-4">
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
                          ? 'border-[#1D4ED8] bg-[#EFF4FF] text-[#1D4ED8]'
                          : 'border-[#E6E4DC] bg-[#FAF9F5] text-[#2C2E33] hover:bg-white'
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
                  <label htmlFor="exp-headline" className="block text-[11px] font-medium text-[#4B4D54] mb-1">
                    Titre de la page cible
                  </label>
                  <input
                    id="exp-headline"
                    type="text"
                    value={experience.headline}
                    onChange={(e) => updateExp({ headline: e.target.value })}
                    placeholder="Titre principal après scan"
                    className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                  />
                </div>

                <div>
                  <label htmlFor="exp-mood" className="block text-[11px] font-medium text-[#4B4D54] mb-1">
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
                    className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                  >
                    {MOOD_OPTIONS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="exp-cta" className="block text-[11px] font-medium text-[#4B4D54] mb-1">
                    Bouton d’action (optionnel)
                  </label>
                  <input
                    id="exp-cta"
                    type="text"
                    value={experience.ctaLabel}
                    onChange={(e) => updateExp({ ctaLabel: e.target.value })}
                    placeholder="Ex. : Confirmer ma venue"
                    className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="exp-desc" className="block text-[11px] font-medium text-[#4B4D54] mb-1">
                  Description / Texte d’accompagnement
                </label>
                <textarea
                  id="exp-desc"
                  rows={2}
                  value={experience.description}
                  onChange={(e) => updateExp({ description: e.target.value })}
                  placeholder="Présentation, programme ou légende affichée lors du scan..."
                  className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
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
                <div className="pt-2 border-t border-[#EFECE4] space-y-2">
                  <label
                    htmlFor="mixed-text-block"
                    className="block text-xs font-semibold text-[#111214]"
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
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl resize-y leading-relaxed"
                  />
                </div>
              )}

              {(experience.template === 'photo-gallery' ||
                experience.template === 'video-gallery' ||
                experience.template === 'media-gallery' ||
                experience.template === 'mixed-collection') && (
                <div className="pt-2 border-t border-[#EFECE4] space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#111214]">
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
                            : 'image/*,video/*'
                        }
                        className="sr-only"
                        onChange={(e) => void handleGalleryUpload(e.target.files)}
                      />
                      <button
                        type="button"
                        disabled={uploadingGallery}
                        onClick={() => galleryFileRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-white bg-[#111214] rounded-lg cursor-pointer"
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
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#1D4ED8] bg-[#EFF4FF] rounded-lg cursor-pointer"
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
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#1D4ED8] bg-[#EFF4FF] rounded-lg cursor-pointer"
                        >
                          <Plus className="w-3 h-3" aria-hidden="true" />
                          <span>+ Vidéo démo</span>
                        </button>
                      )}
                    </div>
                  </div>
                  {galleryError && (
                    <p className="text-[11px] text-[#B91C1C]">{galleryError}</p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {experience.galleryItems.map((item, idx) => (
                      <div
                        key={item.id}
                        className="flex flex-col gap-1.5 p-2 rounded-xl bg-[#FAF9F5] border border-[#E6E4DC]"
                      >
                        <div className="flex items-center gap-2">
                          {item.type === 'video' ? (
                            <video
                              src={item.url}
                              poster={item.posterUrl || undefined}
                              muted
                              className="w-10 h-10 rounded-lg object-cover bg-black shrink-0"
                            />
                          ) : (
                            <img
                              src={item.url}
                              alt=""
                              className="w-10 h-10 rounded-lg object-cover shrink-0"
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
                            placeholder="Légende..."
                            className="flex-1 min-w-0 px-2 py-1 text-xs bg-white border border-[#DBD8CE] rounded-lg"
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
                            className="p-1 text-[#6E7078] hover:text-[#B91C1C] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {item.type === 'video' && (
                          <input
                            type="text"
                            value={item.posterUrl || ''}
                            onChange={(e) => {
                              const next = [...experience.galleryItems];
                              next[idx] = { ...item, posterUrl: e.target.value };
                              updateExp({ galleryItems: next });
                            }}
                            placeholder="URL miniature vidéo (optionnel)..."
                            className="w-full px-2 py-1 text-[11px] bg-white border border-[#DBD8CE] rounded-lg"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[#FAF9F5] border border-[#E6E4DC]">
                <div>
                  <label
                    htmlFor="dynamic-enabled-toggle"
                    className="text-xs font-bold text-[#111214] cursor-pointer"
                  >
                    Activer le routage dynamique serveur (/d/slug)
                  </label>
                  <p className="text-[11px] text-[#5C5E66] mt-0.5">
                    Permet de modifier la destination après impression, compter les scans, protéger par PIN serveur, limiter les scans ou désactiver le QR.
                  </p>
                </div>
                <input
                  id="dynamic-enabled-toggle"
                  data-testid="dynamic-enabled-toggle"
                  type="checkbox"
                  checked={dynamicSecurity.enabled}
                  onChange={(e) => updateSec({ enabled: e.target.checked })}
                  className="w-4 h-4 accent-[#1D4ED8] cursor-pointer"
                />
              </div>

              {dynamicSecurity.enabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label
                      htmlFor="dynamic-pin-input"
                      className="block text-[11px] font-medium text-[#4B4D54] mb-1"
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
                      className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="dynamic-max-scans"
                      className="block text-[11px] font-medium text-[#4B4D54] mb-1"
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
                      className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl tabular-nums"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="dynamic-expires-at"
                      className="block text-[11px] font-medium text-[#4B4D54] mb-1"
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
                      className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#DBD8CE] rounded-xl"
                    />
                  </div>

                  <div className="flex flex-col justify-end">
                    <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#FAF9F5] border border-[#DBD8CE] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={dynamicSecurity.active}
                        onChange={(e) => updateSec({ active: e.target.checked })}
                        className="w-3.5 h-3.5 accent-[#1D4ED8]"
                      />
                      <span className="text-xs font-semibold text-[#111214]">
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
