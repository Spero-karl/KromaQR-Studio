import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  CreditCard,
  FileText,
  Film,
  Image as ImageIcon,
  Link as LinkIcon,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Music,
  Phone,
  QrCode,
  ShieldCheck,
  Type,
  Upload,
  UserPlus,
  Wifi,
  X,
} from 'lucide-react';
import {
  DEMO_IMAGE_PATH,
  DEMO_VIDEO_PATH,
  FONT_CATALOG,
} from '../data/presets';
import type { QrConfig, QrIntent, QrSourceState } from '../types/qr';
import { workspaceHeaders } from '../utils/dynamicApi';
import {
  encryptFileForUpload,
  generateE2eeKeyBase64Url,
} from '../utils/e2eeCrypto';
import { inspectMediaUrlForQr, isInternalMediaPath } from '../utils/publicUrl';
import { resolveEncodedTextStyle } from '../utils/textStyle';

import { buildSocialPayload, type SocialNetworkKey } from '../utils/qrLogic';

const TikTokGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M16.6 5.82s.51.5 0 0A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48Z" />
  </svg>
);

const InstagramGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const FacebookGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M14 13.5h2.5l1-4H14v-2c0-1.03 0-2 2-2h1.5V2.14c-.326-.043-1.557-.14-2.857-.14C11.928 2 10 3.657 10 6.7v2.8H7v4h3V22h4v-8.5Z" />
  </svg>
);

const TelegramGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M21.9 4.6 18.7 19.8c-.24 1.07-.87 1.33-1.76.83l-4.86-3.58-2.34 2.26c-.26.26-.48.48-.98.48l.35-4.96 9.03-8.16c.39-.35-.09-.54-.61-.2L6.37 13.7l-4.8-1.5c-1.04-.33-1.06-1.04.22-1.54L20.5 3.45c.87-.32 1.63.21 1.4 1.15Z" />
  </svg>
);

const TwitterXGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117Z" />
  </svg>
);

interface SourcePanelProps {
  selectedIntent: QrIntent | null;
  onSelectIntent: (intent: QrIntent) => void;
  source: QrSourceState;
  onChange: (next: QrSourceState) => void;
  onGenerate: () => void;
  isGenerated: boolean;
  isGenerating?: boolean;
  config: QrConfig;
  validationError?: string;
  onMediaUploaded?: () => void;
  onJumpToTypography?: () => void;
}

type IntentGroupId = 'essentials' | 'social' | 'contact' | 'pro';

interface IntentOptionDef {
  id: QrIntent;
  group: IntentGroupId;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  iconSolid: string;
  idleSurface: string;
  activeBorder: string;
  activeSurface: string;
}

const INTENT_GROUPS: Array<{ id: IntentGroupId; label: string; count: number }> = [
  { id: 'essentials', label: 'Essentiels', count: 5 },
  { id: 'social', label: 'Réseaux sociaux', count: 5 },
  { id: 'contact', label: 'Contact & Agenda', count: 6 },
  { id: 'pro', label: 'Pro & Médias', count: 4 },
];

const INTENT_OPTIONS: IntentOptionDef[] = [
  // Essentiels (5)
  {
    id: 'url',
    group: 'essentials',
    label: 'Lien web',
    hint: 'Site ou page',
    icon: LinkIcon,
    iconSolid: 'bg-[#2563EB] text-white',
    idleSurface:
      'border-[#DCE6FF] dark:border-[#243047] bg-[#F5F8FF] dark:bg-[#0F172A] hover:border-[#93C5FD] dark:hover:border-[#3B82F6] hover:bg-[#EFF5FF] dark:hover:bg-[#162033]',
    activeBorder: 'border-[#2563EB] dark:border-[#3B82F6]',
    activeSurface: 'bg-[#EAF1FF] dark:bg-[#1E293B]',
  },
  {
    id: 'text',
    group: 'essentials',
    label: 'Texte',
    hint: 'Message libre',
    icon: Type,
    iconSolid: 'bg-[#7C3AED] text-white',
    idleSurface:
      'border-[#E6DDFF] dark:border-[#2C2444] bg-[#F7F4FF] dark:bg-[#0F172A] hover:border-[#C4B5FD] dark:hover:border-[#8B5CF6] hover:bg-[#F2ECFF] dark:hover:bg-[#162033]',
    activeBorder: 'border-[#7C3AED] dark:border-[#8B5CF6]',
    activeSurface: 'bg-[#EFE8FF] dark:bg-[#1E293B]',
  },
  {
    id: 'wifi',
    group: 'essentials',
    label: 'Wi-Fi',
    hint: 'Accès instantané',
    icon: Wifi,
    iconSolid: 'bg-[#059669] text-white',
    idleSurface:
      'border-[#CCF3E3] dark:border-[#1E3A34] bg-[#F2FCF8] dark:bg-[#0F172A] hover:border-[#6EE7B7] dark:hover:border-[#10B981] hover:bg-[#E8FAF2] dark:hover:bg-[#162033]',
    activeBorder: 'border-[#059669] dark:border-[#10B981]',
    activeSurface: 'bg-[#E2F9EF] dark:bg-[#1E293B]',
  },
  {
    id: 'image',
    group: 'essentials',
    label: 'Image',
    hint: 'Photo ou affiche',
    icon: ImageIcon,
    iconSolid: 'bg-[#D97706] text-white',
    idleSurface:
      'border-[#FDE6B8] dark:border-[#3D2F1C] bg-[#FFFBEB] dark:bg-[#0F172A] hover:border-[#FCD34D] dark:hover:border-[#F59E0B] hover:bg-[#FEF5D6] dark:hover:bg-[#162033]',
    activeBorder: 'border-[#D97706] dark:border-[#F59E0B]',
    activeSurface: 'bg-[#FEF2C7] dark:bg-[#1E293B]',
  },
  {
    id: 'video',
    group: 'essentials',
    label: 'Vidéo',
    hint: 'Lecteur natif HD',
    icon: Film,
    iconSolid: 'bg-[#E11D48] text-white',
    idleSurface:
      'border-[#FFD5DF] dark:border-[#3F202C] bg-[#FFF4F6] dark:bg-[#0F172A] hover:border-[#FDA4AF] dark:hover:border-[#F43F5E] hover:bg-[#FFEAEF] dark:hover:bg-[#162033]',
    activeBorder: 'border-[#E11D48] dark:border-[#F43F5E]',
    activeSurface: 'bg-[#FFE4EB] dark:bg-[#1E293B]',
  },

  // Réseaux sociaux (5)
  {
    id: 'tiktok',
    group: 'social',
    label: 'TikTok',
    hint: 'Profil officiel',
    icon: TikTokGlyph,
    iconSolid: 'bg-[#0F172A] dark:bg-[#1E293B] text-white',
    idleSurface:
      'border-[#DCE2EE] dark:border-[#2A3346] bg-[#F8FAFC] dark:bg-[#0F172A] hover:border-[#64748B] hover:bg-[#F1F5F9] dark:hover:bg-[#162033]',
    activeBorder: 'border-[#0F172A] dark:border-[#94A3B8]',
    activeSurface: 'bg-[#E2E8F0] dark:bg-[#1E293B]',
  },
  {
    id: 'instagram',
    group: 'social',
    label: 'Instagram',
    hint: 'Compte & bio',
    icon: InstagramGlyph,
    iconSolid: 'bg-[#E1306C] text-white',
    idleSurface:
      'border-[#FFD6E5] dark:border-[#421E2D] bg-[#FFF4F8] dark:bg-[#0F172A] hover:border-[#F472B6] hover:bg-[#FFE8F1] dark:hover:bg-[#162033]',
    activeBorder: 'border-[#E1306C] dark:border-[#F472B6]',
    activeSurface: 'bg-[#FCE7F3] dark:bg-[#1E293B]',
  },
  {
    id: 'facebook',
    group: 'social',
    label: 'Facebook',
    hint: 'Page ou profil',
    icon: FacebookGlyph,
    iconSolid: 'bg-[#1877F2] text-white',
    idleSurface:
      'border-[#D6E6FF] dark:border-[#1E334F] bg-[#F3F8FF] dark:bg-[#0F172A] hover:border-[#60A5FA] hover:bg-[#E8F1FF] dark:hover:bg-[#162033]',
    activeBorder: 'border-[#1877F2] dark:border-[#60A5FA]',
    activeSurface: 'bg-[#DBEAFE] dark:bg-[#1E293B]',
  },
  {
    id: 'telegram',
    group: 'social',
    label: 'Telegram',
    hint: 'Canal ou contact',
    icon: TelegramGlyph,
    iconSolid: 'bg-[#0088CC] text-white',
    idleSurface:
      'border-[#CEEFFF] dark:border-[#1B3547] bg-[#F0FAFF] dark:bg-[#0F172A] hover:border-[#38BDF8] hover:bg-[#E4F6FF] dark:hover:bg-[#162033]',
    activeBorder: 'border-[#0088CC] dark:border-[#38BDF8]',
    activeSurface: 'bg-[#E0F2FE] dark:bg-[#1E293B]',
  },
  {
    id: 'twitter',
    group: 'social',
    label: 'Twitter (X)',
    hint: 'Compte X officiel',
    icon: TwitterXGlyph,
    iconSolid: 'bg-[#111214] dark:bg-[#334155] text-white',
    idleSurface:
      'border-[#DCE2EE] dark:border-[#2A3346] bg-[#F8FAFC] dark:bg-[#0F172A] hover:border-[#475569] hover:bg-[#F1F5F9] dark:hover:bg-[#162033]',
    activeBorder: 'border-[#111214] dark:border-[#CBD5E1]',
    activeSurface: 'bg-[#E2E8F0] dark:bg-[#1E293B]',
  },

  // Contact & Agenda (6)
  {
    id: 'vcard',
    group: 'contact',
    label: 'Contact vCard',
    hint: 'Fiche carnet (.vcf)',
    icon: UserPlus,
    iconSolid: 'bg-[#0284C7] text-white',
    idleSurface:
      'border-[#D5ECFF] dark:border-[#1E334D] bg-[#F2F9FF] dark:bg-[#0F172A] hover:border-[#7DD3FC] dark:hover:border-[#38BDF8] hover:bg-[#E7F5FF] dark:hover:bg-[#162033]',
    activeBorder: 'border-[#0284C7] dark:border-[#38BDF8]',
    activeSurface: 'bg-[#E0F2FE] dark:bg-[#1E293B]',
  },
  {
    id: 'event',
    group: 'contact',
    label: 'Événement',
    hint: 'Agenda (.ics)',
    icon: Calendar,
    iconSolid: 'bg-[#4F46E5] text-white',
    idleSurface:
      'border-[#E0E4FF] dark:border-[#282B4A] bg-[#F5F6FF] dark:bg-[#0F172A] hover:border-[#A5B4FC] dark:hover:border-[#818CF8] hover:bg-[#ECEFFF] dark:hover:bg-[#162033]',
    activeBorder: 'border-[#4F46E5] dark:border-[#818CF8]',
    activeSurface: 'bg-[#E8EAFF] dark:bg-[#1E293B]',
  },
  {
    id: 'email',
    group: 'contact',
    label: 'E-mail',
    hint: 'Message pré-rempli',
    icon: Mail,
    iconSolid: 'bg-[#EA580C] text-white',
    idleSurface:
      'border-[#FFE2D1] dark:border-[#3E271C] bg-[#FFF7F2] dark:bg-[#0F172A] hover:border-[#FDBA74] dark:hover:border-[#FB923C] hover:bg-[#FFEEE3] dark:hover:bg-[#162033]',
    activeBorder: 'border-[#EA580C] dark:border-[#FB923C]',
    activeSurface: 'bg-[#FFEDD5] dark:bg-[#1E293B]',
  },
  {
    id: 'phone',
    group: 'contact',
    label: 'Téléphone',
    hint: 'Appel en un scan',
    icon: Phone,
    iconSolid: 'bg-[#0D9488] text-white',
    idleSurface:
      'border-[#CCF5EF] dark:border-[#1B3A37] bg-[#F0FDFB] dark:bg-[#0F172A] hover:border-[#5EEAD4] dark:hover:border-[#2DD4BF] hover:bg-[#E3FAF6] dark:hover:bg-[#162033]',
    activeBorder: 'border-[#0D9488] dark:border-[#2DD4BF]',
    activeSurface: 'bg-[#CCFBF1] dark:bg-[#1E293B]',
  },
  {
    id: 'sms',
    group: 'contact',
    label: 'SMS',
    hint: 'Texte pré-saisi',
    icon: MessageSquare,
    iconSolid: 'bg-[#9333EA] text-white',
    idleSurface:
      'border-[#EFE0FF] dark:border-[#322048] bg-[#FAF4FF] dark:bg-[#0F172A] hover:border-[#D8B4FE] dark:hover:border-[#C084FC] hover:bg-[#F3E8FF] dark:hover:bg-[#162033]',
    activeBorder: 'border-[#9333EA] dark:border-[#C084FC]',
    activeSurface: 'bg-[#F3E8FF] dark:bg-[#1E293B]',
  },
  {
    id: 'whatsapp',
    group: 'contact',
    label: 'WhatsApp',
    hint: 'Discussion directe',
    icon: MessageCircle,
    iconSolid: 'bg-[#16A34A] text-white',
    idleSurface:
      'border-[#D3F6DF] dark:border-[#1B3A29] bg-[#F2FDF6] dark:bg-[#0F172A] hover:border-[#86EFAC] dark:hover:border-[#4ADE80] hover:bg-[#E7FAEE] dark:hover:bg-[#162033]',
    activeBorder: 'border-[#16A34A] dark:border-[#4ADE80]',
    activeSurface: 'bg-[#DCFCE7] dark:bg-[#1E293B]',
  },

  // Pro & Médias (4)
  {
    id: 'geo',
    group: 'pro',
    label: 'Position GPS',
    hint: 'Carte & itinéraire',
    icon: MapPin,
    iconSolid: 'bg-[#DC2626] text-white',
    idleSurface:
      'border-[#FFDCDC] dark:border-[#3E1F22] bg-[#FFF5F5] dark:bg-[#0F172A] hover:border-[#FCA5A5] dark:hover:border-[#F87171] hover:bg-[#FEECEC] dark:hover:bg-[#162033]',
    activeBorder: 'border-[#DC2626] dark:border-[#F87171]',
    activeSurface: 'bg-[#FEE2E2] dark:bg-[#1E293B]',
  },
  {
    id: 'payment',
    group: 'pro',
    label: 'Paiement',
    hint: 'SEPA IBAN ou lien',
    icon: CreditCard,
    iconSolid: 'bg-[#0F766E] text-white',
    idleSurface:
      'border-[#CCEFEA] dark:border-[#193836] bg-[#F1FCFA] dark:bg-[#0F172A] hover:border-[#5EEAD4] dark:hover:border-[#2DD4BF] hover:bg-[#E3F8F5] dark:hover:bg-[#162033]',
    activeBorder: 'border-[#0F766E] dark:border-[#2DD4BF]',
    activeSurface: 'bg-[#CCFBF1] dark:bg-[#1E293B]',
  },
  {
    id: 'document',
    group: 'pro',
    label: 'Document',
    hint: 'PDF, TXT, CSV, DOCX',
    icon: FileText,
    iconSolid: 'bg-[#1D4ED8] text-white',
    idleSurface:
      'border-[#D9E5FF] dark:border-[#21304C] bg-[#F4F8FF] dark:bg-[#0F172A] hover:border-[#93C5FD] dark:hover:border-[#60A5FA] hover:bg-[#EBF2FF] dark:hover:bg-[#162033]',
    activeBorder: 'border-[#1D4ED8] dark:border-[#60A5FA]',
    activeSurface: 'bg-[#DBEAFE] dark:bg-[#1E293B]',
  },
  {
    id: 'audio',
    group: 'pro',
    label: 'Audio',
    hint: 'MP3, WAV, OGG, M4A',
    icon: Music,
    iconSolid: 'bg-[#DB2777] text-white',
    idleSurface:
      'border-[#FFD8EC] dark:border-[#3E1F32] bg-[#FFF4FA] dark:bg-[#0F172A] hover:border-[#F9A8D4] dark:hover:border-[#F472B6] hover:bg-[#FFE9F5] dark:hover:bg-[#162033]',
    activeBorder: 'border-[#DB2777] dark:border-[#F472B6]',
    activeSurface: 'bg-[#FCE7F3] dark:bg-[#1E293B]',
  },
];

export const SourcePanel: React.FC<SourcePanelProps> = ({
  selectedIntent,
  onSelectIntent,
  source,
  onChange,
  onGenerate,
  isGenerated,
  isGenerating = false,
  config,
  validationError,
  onMediaUploaded,
  onJumpToTypography,
}) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const [activeGroup, setActiveGroup] = useState<IntentGroupId>('essentials');
  const [uploading, setUploading] = useState<
    'image' | 'video' | 'poster' | 'document' | 'audio' | null
  >(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [showExternalUrlInput, setShowExternalUrlInput] = useState<
    'image' | 'video' | 'document' | 'audio' | null
  >(null);
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const localPreviewsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const refMap = localPreviewsRef.current;
    return () => {
      Object.values(refMap).forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  useEffect(() => {
    if (!selectedIntent) return;
    const found = INTENT_OPTIONS.find((opt) => opt.id === selectedIntent);
    if (found) {
      setActiveGroup(found.group);
    }
  }, [selectedIntent]);

  const isE2eeActive = source.e2eeEnabled !== false;

  const imageUrlWarning =
    selectedIntent === 'image' && source.imageUrl.trim()
      ? (() => {
          const check = inspectMediaUrlForQr(source.imageUrl);
          return check.safe ? null : check.error || null;
        })()
      : null;

  const videoUrlWarning =
    selectedIntent === 'video' && source.videoUrl.trim()
      ? (() => {
          const check = inspectMediaUrlForQr(source.videoUrl);
          return check.safe ? null : check.error || null;
        })()
      : null;

  const documentUrlWarning =
    selectedIntent === 'document' && (source.documentUrl || '').trim()
      ? (() => {
          const check = inspectMediaUrlForQr(source.documentUrl || '');
          return check.safe ? null : check.error || null;
        })()
      : null;

  const audioUrlWarning =
    selectedIntent === 'audio' && (source.audioUrl || '').trim()
      ? (() => {
          const check = inspectMediaUrlForQr(source.audioUrl || '');
          return check.safe ? null : check.error || null;
        })()
      : null;

  const handleChooseIntent = (intent: QrIntent) => {
    setUploadError(null);
    onSelectIntent(intent);
  };

  const handleFileUpload = async (
    file: File,
    expectedType: 'image' | 'video' | 'poster' | 'document' | 'audio'
  ) => {
    setUploadError(null);
    setUploading(expectedType);
    try {
      const formData = new FormData();
      let activeKey = source.e2eeKeyFragment || '';
      let encryptedMeta: {
        originalName: string;
        originalMimeType: string;
        originalSize: number;
      } | null = null;

      const resolvedMediaType = expectedType === 'poster' ? 'image' : expectedType;

      if (isE2eeActive) {
        if (!activeKey) {
          activeKey = generateE2eeKeyBase64Url();
        }
        const { encryptedFile, meta } = await encryptFileForUpload(file, activeKey);
        encryptedMeta = meta;
        formData.append('file', encryptedFile);
        formData.append('isEncrypted', 'true');
        formData.append('mediaType', resolvedMediaType);
        formData.append('originalSize', String(meta.originalSize));
      } else {
        formData.append('file', file);
      }

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: workspaceHeaders(),
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Échec du téléversement.');
      }

      const uploadedUrl = data.fileUrl || data.url;
      if (
        uploadedUrl &&
        isE2eeActive &&
        (expectedType === 'image' || expectedType === 'video' || expectedType === 'poster' || expectedType === 'audio')
      ) {
        const previewBlobUrl = URL.createObjectURL(file);
        if (localPreviewsRef.current[uploadedUrl]) {
          URL.revokeObjectURL(localPreviewsRef.current[uploadedUrl]);
        }
        localPreviewsRef.current[uploadedUrl] = previewBlobUrl;
        setLocalPreviews({ ...localPreviewsRef.current });
      }

      if (expectedType === 'image') {
        setShowExternalUrlInput(null);
        onChange({
          ...source,
          type: 'image',
          imageUrl: uploadedUrl,
          imagePageUrl: data.pageUrl,
          imageName: '',
          imageMimeType: encryptedMeta?.originalMimeType || file.type,
          imageSize: encryptedMeta?.originalSize || file.size,
          imageEncrypted: isE2eeActive,
          e2eeKeyFragment: isE2eeActive ? activeKey : source.e2eeKeyFragment,
        });
      } else if (expectedType === 'poster') {
        onChange({
          ...source,
          type: 'video',
          videoPosterUrl: uploadedUrl,
          e2eeKeyFragment: isE2eeActive ? activeKey : source.e2eeKeyFragment,
        });
      } else if (expectedType === 'video') {
        setShowExternalUrlInput(null);
        onChange({
          ...source,
          type: 'video',
          videoUrl: uploadedUrl,
          videoPageUrl: data.pageUrl,
          videoName: '',
          videoMimeType: encryptedMeta?.originalMimeType || file.type,
          videoSize: encryptedMeta?.originalSize || file.size,
          videoEncrypted: isE2eeActive,
          e2eeKeyFragment: isE2eeActive ? activeKey : source.e2eeKeyFragment,
        });
      } else if (expectedType === 'document') {
        setShowExternalUrlInput(null);
        onChange({
          ...source,
          type: 'document',
          documentUrl: uploadedUrl,
          documentPageUrl: data.pageUrl,
          documentMimeType: encryptedMeta?.originalMimeType || file.type || 'application/pdf',
          documentSize: encryptedMeta?.originalSize || file.size,
          documentEncrypted: isE2eeActive,
          e2eeKeyFragment: isE2eeActive ? activeKey : source.e2eeKeyFragment,
        });
      } else {
        setShowExternalUrlInput(null);
        onChange({
          ...source,
          type: 'audio',
          audioUrl: uploadedUrl,
          audioPageUrl: data.pageUrl,
          audioMimeType: encryptedMeta?.originalMimeType || file.type || 'audio/mpeg',
          audioSize: encryptedMeta?.originalSize || file.size,
          audioEncrypted: isE2eeActive,
          e2eeKeyFragment: isE2eeActive ? activeKey : source.e2eeKeyFragment,
        });
      }
      onMediaUploaded?.();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Erreur réseau lors du téléversement.'
      );
    } finally {
      setUploading(null);
    }
  };

  const handleUseDemoImage = async () => {
    setUploadError(null);
    setUploading('image');
    try {
      const res = await fetch('/api/register-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'image',
          url: DEMO_IMAGE_PATH,
          title: 'Exposition Formes Géométriques — Paris',
        }),
      });
      const data = await res.json();
      setShowExternalUrlInput(null);
      onChange({
        ...source,
        type: 'image',
        imageUrl: DEMO_IMAGE_PATH,
        imagePageUrl: data.pageUrl || DEMO_IMAGE_PATH,
        imageName: '',
      });
    } catch {
      setShowExternalUrlInput(null);
      onChange({
        ...source,
        type: 'image',
        imageUrl: DEMO_IMAGE_PATH,
        imagePageUrl: DEMO_IMAGE_PATH,
        imageName: '',
      });
    } finally {
      setUploading(null);
    }
  };

  const handleUseDemoVideo = async () => {
    setUploadError(null);
    setUploading('video');
    try {
      const res = await fetch('/api/register-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'video',
          url: DEMO_VIDEO_PATH,
          title: 'Teaser Atelier — Mouvement & Lumière',
        }),
      });
      const data = await res.json();
      setShowExternalUrlInput(null);
      onChange({
        ...source,
        type: 'video',
        videoUrl: DEMO_VIDEO_PATH,
        videoPageUrl: data.pageUrl || DEMO_VIDEO_PATH,
        videoName: '',
      });
    } catch {
      setShowExternalUrlInput(null);
      onChange({
        ...source,
        type: 'video',
        videoUrl: DEMO_VIDEO_PATH,
        videoPageUrl: DEMO_VIDEO_PATH,
        videoName: '',
      });
    } finally {
      setUploading(null);
    }
  };

  const handleDrop = (
    e: React.DragEvent,
    expectedType: 'image' | 'video' | 'document' | 'audio'
  ) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleFileUpload(file, expectedType);
    }
  };

  const liveTextStyle = resolveEncodedTextStyle(config, '#111214');
  const activeFontLabel = FONT_CATALOG[liveTextStyle.fontId]?.label || 'Bricolage';
  const visibleIntents = INTENT_OPTIONS.filter((opt) => opt.group === activeGroup);

  return (
    <section
      aria-labelledby="source-heading"
      className="bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] rounded-2xl p-5 sm:p-6 shadow-[0_2px_10px_rgba(15,23,42,0.03)] transition-colors overflow-hidden"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#EFEFF5] dark:border-[#242C3D]">
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2563EB] dark:text-[#60A5FA]">
            Étape 1 · 20 formats disponibles
          </span>
          <h2
            id="source-heading"
            className="font-display text-lg sm:text-xl font-bold tracking-tight text-[#111214] dark:text-[#F1F5F9] mt-0.5"
          >
            Que voulez-vous transformer ?
          </h2>
        </div>

        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] dark:text-[#94A3B8]">
          <ShieldCheck className="w-4 h-4 text-[#2563EB] dark:text-[#60A5FA]" aria-hidden="true" />
          <span>Confidentialité active</span>
        </span>
      </div>

      {/* Category Group Switcher */}
      <div className="pt-4 flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
        <div className="inline-flex flex-wrap p-1 bg-[#F3F4F8] dark:bg-[#0F1522] border border-[#E6E8F0] dark:border-[#242C3D] rounded-xl gap-1">
          {INTENT_GROUPS.map((grp) => {
            const isActive = activeGroup === grp.id;
            return (
              <button
                key={grp.id}
                type="button"
                data-testid={`intent-group-${grp.id}`}
                onClick={() => setActiveGroup(grp.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer tabular-nums ${
                  isActive
                    ? 'bg-white dark:bg-[#1E293B] text-[#111214] dark:text-[#F8FAFC] shadow-2xs'
                    : 'text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-[#F1F5F9]'
                }`}
              >
                {grp.label} · {grp.count}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tactile Visual Cards — centered cleanly on smartphones & balanced on desktop */}
      <div
        role="tablist"
        aria-label="Choix du contenu à encoder"
        className={`pt-3.5 flex flex-wrap justify-center gap-2.5 sm:grid ${
          visibleIntents.length === 4
            ? 'sm:grid-cols-4'
            : visibleIntents.length === 6
            ? 'sm:grid-cols-3 lg:grid-cols-6'
            : 'sm:grid-cols-5'
        }`}
      >
        {visibleIntents.map((opt) => {
          const Icon = opt.icon;
          const active = selectedIntent === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`intent-${opt.id}`}
              onClick={() => handleChooseIntent(opt.id)}
              className={`group w-[calc(50%-0.3125rem)] sm:w-auto min-h-[44px] flex flex-col items-center sm:items-start justify-between gap-2.5 p-3.5 rounded-xl border text-center sm:text-left transition-all duration-150 hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer ${
                active ? `${opt.activeBorder} ${opt.activeSurface}` : opt.idleSurface
              }`}
            >
              <span
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-150 ${
                  opt.iconSolid
                } ${active ? 'scale-105' : 'group-hover:scale-105'}`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 w-full">
                <span className="block text-sm font-semibold leading-tight text-[#111214] dark:text-[#F1F5F9] truncate">
                  {opt.label}
                </span>
                <span className="block text-[11px] text-[#525866] dark:text-[#94A3B8] truncate mt-0.5">
                  {opt.hint}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 1. URL INPUT */}
      {selectedIntent === 'url' && (
        <div className="pt-5 space-y-2.5 animate-[fadeIn_160ms_ease-out]">
          <label htmlFor="qr-url-input" className="block text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
            Adresse web de destination
          </label>
          <input
            id="qr-url-input"
            type="text"
            value={source.urlValue}
            onChange={(e) =>
              onChange({
                ...source,
                type: 'text',
                textMode: 'url',
                urlValue: e.target.value,
              })
            }
            placeholder="https://votre-site.fr/projet"
            className="w-full px-4 py-3 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-colors"
          />
        </div>
      )}

      {/* 2. FREE TEXT INPUT */}
      {selectedIntent === 'text' && (
        <div className="pt-5 space-y-3 animate-[fadeIn_160ms_ease-out]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="qr-text-input" className="text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
              Message typographique
            </label>
            <span className="text-xs text-[#6E7078] dark:text-[#94A3B8] tabular-nums">
              {source.textValue.length} car.
            </span>
          </div>

          <textarea
            id="qr-text-input"
            rows={5}
            value={source.textValue}
            onChange={(e) =>
              onChange({
                ...source,
                type: 'text',
                textMode: 'text',
                textValue: e.target.value,
              })
            }
            placeholder="Écrivez votre message ici… La police, taille, couleur et mise en forme seront conservées à l’identique après scan."
            style={{
              fontFamily: liveTextStyle.fontFamily,
              fontSize: `${liveTextStyle.fontSizePx}px`,
              fontStyle: liveTextStyle.fontStyle,
              fontWeight: liveTextStyle.fontWeight,
              textAlign: liveTextStyle.textAlign,
              color: liveTextStyle.color === '#111214' ? undefined : liveTextStyle.color,
              letterSpacing: liveTextStyle.letterSpacing,
              textDecoration: liveTextStyle.textDecoration,
            }}
            className="w-full min-h-[148px] px-4 py-3.5 bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-colors resize-y leading-relaxed"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5C5E66] dark:text-[#94A3B8]">
            <span>
              Rendu actif : <strong className="text-[#111214] dark:text-[#F1F5F9]">{activeFontLabel}</strong> ·{' '}
              {liveTextStyle.fontSizePx}px
            </span>
            {onJumpToTypography && (
              <button
                type="button"
                onClick={onJumpToTypography}
                className="text-xs font-semibold text-[#1D4ED8] dark:text-[#60A5FA] hover:underline cursor-pointer"
              >
                Modifier la typographie →
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. WI-FI INPUT */}
      {selectedIntent === 'wifi' && (
        <div className="pt-5 space-y-3 animate-[fadeIn_160ms_ease-out]">
          <span className="block text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
            Paramètres du réseau Wi-Fi
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="qr-wifi-ssid"
                className="block text-xs font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1.5"
              >
                Nom du réseau (SSID)
              </label>
              <input
                id="qr-wifi-ssid"
                type="text"
                value={source.wifiSsid}
                onChange={(e) =>
                  onChange({
                    ...source,
                    type: 'text',
                    textMode: 'wifi',
                    wifiSsid: e.target.value,
                  })
                }
                placeholder="Mon_WiFi"
                className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            <div>
              <label
                htmlFor="qr-wifi-pass"
                className="block text-xs font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1.5"
              >
                Mot de passe
              </label>
              <input
                id="qr-wifi-pass"
                type="text"
                value={source.wifiPassword}
                disabled={source.wifiSecurity === 'nopass'}
                onChange={(e) =>
                  onChange({
                    ...source,
                    type: 'text',
                    textMode: 'wifi',
                    wifiPassword: e.target.value,
                  })
                }
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB] disabled:opacity-50"
              />
            </div>

            <div>
              <label
                htmlFor="qr-wifi-sec"
                className="block text-xs font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1.5"
              >
                Protocole
              </label>
              <select
                id="qr-wifi-sec"
                value={source.wifiSecurity}
                onChange={(e) =>
                  onChange({
                    ...source,
                    type: 'text',
                    textMode: 'wifi',
                    wifiSecurity: e.target.value as 'WPA' | 'WEP' | 'nopass',
                  })
                }
                className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
              >
                <option value="WPA">WPA / WPA2</option>
                <option value="WEP">WEP</option>
                <option value="nopass">Ouvert</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* 4. IMAGE */}
      {selectedIntent === 'image' && (
        <div className="pt-4 space-y-2.5 animate-[fadeIn_160ms_ease-out]">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            aria-label="Importer un fichier image"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileUpload(file, 'image');
              e.target.value = '';
            }}
          />

          {source.imageUrl && isInternalMediaPath(source.imageUrl) ? (
            <div
              data-testid="image-loaded-card"
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => handleDrop(e, 'image')}
              className={`rounded-xl border px-3.5 py-2.5 transition-colors flex flex-wrap items-center justify-between gap-3 ${
                dragActive
                  ? 'border-[#2563EB] bg-[#F4F7FF] dark:bg-[#1E293B]'
                  : 'border-[#DCE6FF] dark:border-[#243047] bg-[#F8FAFF] dark:bg-[#0F172A]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={localPreviews[source.imageUrl] || source.imageUrl}
                  alt="Aperçu de l’image"
                  referrerPolicy="no-referrer"
                  data-testid="image-source-thumbnail"
                  className="w-12 h-12 rounded-lg object-contain border border-[#DCE2EE] dark:border-[#2A3346] bg-white dark:bg-[#131926] shrink-0"
                />
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-[#111214] dark:text-[#F1F5F9] inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] dark:text-[#34D399]" aria-hidden="true" />
                      <span>{uploading === 'image' ? 'Envoi en cours…' : 'Image prête'}</span>
                    </span>
                    {source.imageEncrypted && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#1D4ED8] dark:text-[#93C5FD]">
                        <Lock className="w-2.5 h-2.5" aria-hidden="true" />
                        <span>Chiffrée</span>
                      </span>
                    )}
                    {source.imageUrl === DEMO_IMAGE_PATH && (
                      <span className="text-[10px] font-semibold text-[#7C3AED] dark:text-[#C4B5FD]">
                        · Démo
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#5C5E66] dark:text-[#94A3B8]">
                    Affichée en plein format sans rognage après scan
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={uploading === 'image'}
                  onClick={() => imageInputRef.current?.click()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-[#111214] dark:text-[#F1F5F9] bg-white dark:bg-[#131926] border border-[#DCE2EE] dark:border-[#2A3346] hover:bg-[#EFF4FF] dark:hover:bg-[#1E293B] rounded-lg transition-colors cursor-pointer disabled:opacity-60"
                >
                  <Upload className="w-3 h-3" aria-hidden="true" />
                  <span>Remplacer</span>
                </button>
                <button
                  type="button"
                  aria-label="Retirer l’image sélectionnée"
                  onClick={() => {
                    setShowExternalUrlInput(null);
                    onChange({
                      ...source,
                      imageUrl: '',
                      imageName: '',
                      imagePageUrl: '',
                      imageEncrypted: false,
                    });
                  }}
                  className="p-1.5 text-[#6E7078] dark:text-[#94A3B8] hover:text-[#B91C1C] hover:bg-white dark:hover:bg-[#1E293B] rounded-lg cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => handleDrop(e, 'image')}
              className={`rounded-xl border border-dashed px-3.5 py-3 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                dragActive
                  ? 'border-[#2563EB] bg-[#F4F7FF] dark:bg-[#1E293B]'
                  : 'border-[#CBD5E1] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0F172A]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] flex items-center justify-center shrink-0">
                  <ImageIcon className="w-4 h-4 text-[#D97706] dark:text-[#FBBF24]" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-[#111214] dark:text-[#F1F5F9] truncate">
                    {uploading === 'image'
                      ? 'Hébergement chiffré...'
                      : 'Importer une image (PNG, JPG, WebP)'}
                  </p>
                  <p className="text-[11px] text-[#6E7078] dark:text-[#94A3B8] truncate">
                    Qualité d’origine préservée avec zoom &amp; plein écran.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={uploading === 'image'}
                  onClick={() => imageInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#111214] dark:bg-[#2563EB] hover:bg-[#27292E] dark:hover:bg-[#1D4ED8] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Importer</span>
                </button>
                <button
                  type="button"
                  disabled={uploading === 'image'}
                  onClick={handleUseDemoImage}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-[#1D4ED8] dark:text-[#93C5FD] bg-[#EFF4FF] dark:bg-[#1E293B] hover:bg-[#E0EAFF] dark:hover:bg-[#334155] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>Démo</span>
                </button>
              </div>
            </div>
          )}

          {(!source.imageUrl || !isInternalMediaPath(source.imageUrl) || showExternalUrlInput === 'image') ? (
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <label htmlFor="qr-image-url" className="sr-only">
                Lien HTTPS externe vers une image
              </label>
              <input
                id="qr-image-url"
                type="text"
                value={isInternalMediaPath(source.imageUrl) ? '' : source.imageUrl}
                onChange={(e) =>
                  onChange({
                    ...source,
                    type: 'image',
                    imageUrl: e.target.value,
                    imagePageUrl: '',
                    imageName: '',
                    imageEncrypted: false,
                  })
                }
                placeholder="Ou collez un lien HTTPS externe vers une image…"
                className="flex-1 px-3 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
              />

              {source.imageUrl && !isInternalMediaPath(source.imageUrl) && (
                <div className="flex items-center gap-2 px-2.5 py-1 bg-[#F4F5F8] dark:bg-[#1E293B] rounded-xl shrink-0">
                  <img
                    src={source.imageUrl}
                    alt="Aperçu de l’image"
                    referrerPolicy="no-referrer"
                    data-testid="image-source-thumbnail"
                    className="w-7 h-7 rounded-md object-contain border border-black/10 bg-white dark:bg-[#0F172A]"
                  />
                  <button
                    type="button"
                    aria-label="Retirer l’image sélectionnée"
                    onClick={() =>
                      onChange({
                        ...source,
                        imageUrl: '',
                        imageName: '',
                        imagePageUrl: '',
                      })
                    }
                    className="p-1 text-[#6E7078] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-white rounded-md cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowExternalUrlInput('image')}
                className="text-[11px] font-medium text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#1D4ED8] dark:hover:text-[#60A5FA] hover:underline cursor-pointer"
              >
                Utiliser plutôt un lien HTTPS externe
              </button>
            </div>
          )}

          {imageUrlWarning && (
            <p role="alert" className="text-xs font-medium text-[#B91C1C] dark:text-[#F87171]">
              {imageUrlWarning}
            </p>
          )}
        </div>
      )}

      {/* 5. VIDEO */}
      {selectedIntent === 'video' && (
        <div className="pt-4 space-y-2.5 animate-[fadeIn_160ms_ease-out]">
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            aria-label="Importer un fichier vidéo"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileUpload(file, 'video');
              e.target.value = '';
            }}
          />
          <input
            ref={posterInputRef}
            type="file"
            accept="image/*"
            aria-label="Importer une miniature vidéo"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileUpload(file, 'poster');
              e.target.value = '';
            }}
          />

          {source.videoUrl && isInternalMediaPath(source.videoUrl) ? (
            <div
              data-testid="video-loaded-card"
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => handleDrop(e, 'video')}
              className={`rounded-xl border px-3.5 py-2.5 transition-colors flex flex-wrap items-center justify-between gap-3 ${
                dragActive
                  ? 'border-[#2563EB] bg-[#F4F7FF] dark:bg-[#1E293B]'
                  : 'border-[#FFD5DF] dark:border-[#3F202C] bg-[#FFF8FA] dark:bg-[#0F172A]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-14 h-10 rounded-lg overflow-hidden bg-[#111214] border border-[#DCE2EE] dark:border-[#2A3346] shrink-0">
                  <video
                    src={localPreviews[source.videoUrl] || source.videoUrl}
                    poster={
                      (source.videoPosterUrl && localPreviews[source.videoPosterUrl]) ||
                      source.videoPosterUrl ||
                      undefined
                    }
                    muted
                    playsInline
                    data-testid="video-source-thumbnail"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-[#111214] dark:text-[#F1F5F9] inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] dark:text-[#34D399]" aria-hidden="true" />
                      <span>{uploading === 'video' ? 'Envoi en cours…' : 'Vidéo prête'}</span>
                    </span>
                    {source.videoEncrypted && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#1D4ED8] dark:text-[#93C5FD]">
                        <Lock className="w-2.5 h-2.5" aria-hidden="true" />
                        <span>Chiffrée</span>
                      </span>
                    )}
                    {source.videoUrl === DEMO_VIDEO_PATH && (
                      <span className="text-[10px] font-semibold text-[#7C3AED] dark:text-[#C4B5FD]">
                        · Démo
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#6E7078] dark:text-[#94A3B8] truncate">
                    Lecteur intégré plein écran compatible iOS et Android.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={uploading === 'video'}
                  onClick={() => videoInputRef.current?.click()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-[#111214] dark:text-[#F1F5F9] bg-white dark:bg-[#131926] border border-[#DCE2EE] dark:border-[#2A3346] hover:bg-[#FFF0F3] dark:hover:bg-[#1E293B] rounded-lg transition-colors cursor-pointer disabled:opacity-60"
                >
                  <Upload className="w-3 h-3" aria-hidden="true" />
                  <span>Remplacer</span>
                </button>
                <button
                  type="button"
                  aria-label="Retirer la vidéo sélectionnée"
                  onClick={() => {
                    setShowExternalUrlInput(null);
                    onChange({
                      ...source,
                      videoUrl: '',
                      videoName: '',
                      videoPageUrl: '',
                      videoEncrypted: false,
                    });
                  }}
                  className="p-1.5 text-[#6E7078] dark:text-[#94A3B8] hover:text-[#B91C1C] hover:bg-white dark:hover:bg-[#1E293B] rounded-lg cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => handleDrop(e, 'video')}
              className={`rounded-xl border border-dashed px-3.5 py-3 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                dragActive
                  ? 'border-[#2563EB] bg-[#F4F7FF] dark:bg-[#1E293B]'
                  : 'border-[#CBD5E1] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0F172A]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] flex items-center justify-center shrink-0">
                  <Film className="w-4 h-4 text-[#E11D48] dark:text-[#FB7185]" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-[#111214] dark:text-[#F1F5F9] truncate">
                    {uploading === 'video'
                      ? 'Téléversement en cours...'
                      : 'Importer une vidéo (MP4, WebM, MOV)'}
                  </p>
                  <p className="text-[11px] text-[#6E7078] dark:text-[#94A3B8] truncate">
                    Lecteur intégré sans redirection externe.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={uploading === 'video'}
                  onClick={() => videoInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#111214] dark:bg-[#2563EB] hover:bg-[#27292E] dark:hover:bg-[#1D4ED8] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Importer</span>
                </button>
                <button
                  type="button"
                  disabled={uploading === 'video'}
                  onClick={handleUseDemoVideo}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-[#1D4ED8] dark:text-[#93C5FD] bg-[#EFF4FF] dark:bg-[#1E293B] hover:bg-[#E0EAFF] dark:hover:bg-[#334155] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>Démo</span>
                </button>
              </div>
            </div>
          )}

          {(!source.videoUrl || !isInternalMediaPath(source.videoUrl) || showExternalUrlInput === 'video') ? (
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <label htmlFor="qr-video-url" className="sr-only">
                Lien HTTPS externe vers une vidéo
              </label>
              <input
                id="qr-video-url"
                type="text"
                value={isInternalMediaPath(source.videoUrl) ? '' : source.videoUrl}
                onChange={(e) =>
                  onChange({
                    ...source,
                    type: 'video',
                    videoUrl: e.target.value,
                    videoPageUrl: '',
                    videoName: '',
                    videoEncrypted: false,
                  })
                }
                placeholder="Ou collez une URL vidéo HTTPS externe (MP4, WebM, MOV)…"
                className="flex-1 px-3 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
              />

              {source.videoUrl && !isInternalMediaPath(source.videoUrl) && (
                <div className="flex items-center gap-2 px-2.5 py-1 bg-[#F4F5F8] dark:bg-[#1E293B] rounded-xl shrink-0">
                  <div className="w-10 h-7 rounded overflow-hidden bg-black shrink-0">
                    <video
                      src={source.videoUrl}
                      poster={
                        (source.videoPosterUrl && localPreviews[source.videoPosterUrl]) ||
                        source.videoPosterUrl ||
                        undefined
                      }
                      muted
                      playsInline
                      data-testid="video-source-thumbnail"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <span className="text-xs font-medium text-[#15803D] dark:text-[#34D399] inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Prête</span>
                  </span>
                  <button
                    type="button"
                    aria-label="Retirer la vidéo sélectionnée"
                    onClick={() =>
                      onChange({
                        ...source,
                        videoUrl: '',
                        videoName: '',
                        videoPageUrl: '',
                      })
                    }
                    className="p-1 text-[#6E7078] dark:text-[#94A3B8] hover:text-[#111214] dark:hover:text-white rounded-md cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowExternalUrlInput('video')}
                className="text-[11px] font-medium text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#1D4ED8] dark:hover:text-[#60A5FA] hover:underline cursor-pointer"
              >
                Utiliser plutôt un lien HTTPS externe
              </button>
            </div>
          )}

          {/* Optional video poster (never exposes internal path) */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#E2E6F0] dark:border-[#242C3D]">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {source.videoPosterUrl ? (
                <img
                  src={localPreviews[source.videoPosterUrl] || source.videoPosterUrl}
                  alt="Miniature vidéo"
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-md object-contain bg-white dark:bg-[#131926] border border-[#DCE2EE] dark:border-[#2A3346] shrink-0"
                />
              ) : null}
              {source.videoPosterUrl && isInternalMediaPath(source.videoPosterUrl) ? (
                <span className="text-xs font-medium text-[#15803D] dark:text-[#34D399] inline-flex items-center gap-1 truncate">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Miniature de couverture prête</span>
                </span>
              ) : (
                <>
                  <span className="text-xs font-medium text-[#5C5E66] dark:text-[#94A3B8] whitespace-nowrap">
                    Miniature (optionnel)
                  </span>
                  <input
                    type="text"
                    aria-label="Lien HTTPS de la miniature vidéo"
                    value={
                      source.videoPosterUrl && isInternalMediaPath(source.videoPosterUrl)
                        ? ''
                        : source.videoPosterUrl || ''
                    }
                    onChange={(e) =>
                      onChange({
                        ...source,
                        videoPosterUrl: e.target.value,
                      })
                    }
                    placeholder="Lien HTTPS d’image de couverture…"
                    className="flex-1 min-w-[140px] px-2.5 py-1 text-xs bg-white dark:bg-[#131926] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-lg"
                  />
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={uploading === 'poster'}
                onClick={() => posterInputRef.current?.click()}
                className="px-2.5 py-1 text-xs font-semibold text-[#111214] dark:text-[#F1F5F9] bg-white dark:bg-[#131926] border border-[#DCE2EE] dark:border-[#2A3346] hover:bg-[#F2F1EB] dark:hover:bg-[#1E293B] rounded-lg cursor-pointer"
              >
                {uploading === 'poster'
                  ? 'Envoi…'
                  : source.videoPosterUrl
                  ? 'Remplacer'
                  : 'Importer'}
              </button>
              {source.videoPosterUrl && (
                <button
                  type="button"
                  aria-label="Retirer la miniature"
                  onClick={() => onChange({ ...source, videoPosterUrl: '' })}
                  className="p-1 text-[#6E7078] dark:text-[#94A3B8] hover:text-[#B91C1C] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {videoUrlWarning && (
            <p role="alert" className="text-xs font-medium text-[#B91C1C] dark:text-[#F87171]">
              {videoUrlWarning}
            </p>
          )}
        </div>
      )}

      {/* 6. VCARD CONTACT INPUT */}
      {selectedIntent === 'vcard' && (
        <div className="pt-5 space-y-3 animate-[fadeIn_160ms_ease-out]">
          <span className="block text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
            Fiche contact professionnelle (vCard 3.0)
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              aria-label="Prénom"
              value={source.vcardFirstName || ''}
              onChange={(e) =>
                onChange({ ...source, type: 'text', textMode: 'vcard', vcardFirstName: e.target.value })
              }
              placeholder="Prénom *"
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
            />
            <input
              type="text"
              aria-label="Nom"
              value={source.vcardLastName || ''}
              onChange={(e) =>
                onChange({ ...source, type: 'text', textMode: 'vcard', vcardLastName: e.target.value })
              }
              placeholder="Nom"
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
            />
            <input
              type="text"
              aria-label="Entreprise"
              value={source.vcardOrg || ''}
              onChange={(e) =>
                onChange({ ...source, type: 'text', textMode: 'vcard', vcardOrg: e.target.value })
              }
              placeholder="Entreprise / Organisation"
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
            />
            <input
              type="text"
              aria-label="Poste / Fonction"
              value={source.vcardTitle || ''}
              onChange={(e) =>
                onChange({ ...source, type: 'text', textMode: 'vcard', vcardTitle: e.target.value })
              }
              placeholder="Fonction / Poste"
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
            />
            <input
              type="tel"
              aria-label="Téléphone"
              value={source.vcardPhone || ''}
              onChange={(e) =>
                onChange({ ...source, type: 'text', textMode: 'vcard', vcardPhone: e.target.value })
              }
              placeholder="Téléphone (+33 6 12 34 56 78)"
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
            />
            <input
              type="email"
              aria-label="Adresse e-mail"
              value={source.vcardEmail || ''}
              onChange={(e) =>
                onChange({ ...source, type: 'text', textMode: 'vcard', vcardEmail: e.target.value })
              }
              placeholder="E-mail professionnel"
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
            />
            <input
              type="url"
              aria-label="Site web"
              value={source.vcardWebsite || ''}
              onChange={(e) =>
                onChange({ ...source, type: 'text', textMode: 'vcard', vcardWebsite: e.target.value })
              }
              placeholder="https://entreprise.fr"
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
            />
            <input
              type="text"
              aria-label="Adresse postale"
              value={source.vcardAddress || ''}
              onChange={(e) =>
                onChange({ ...source, type: 'text', textMode: 'vcard', vcardAddress: e.target.value })
              }
              placeholder="Adresse / Ville"
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
            />
          </div>
        </div>
      )}

      {/* 7. CALENDAR EVENT INPUT */}
      {selectedIntent === 'event' && (
        <div className="pt-5 space-y-3 animate-[fadeIn_160ms_ease-out]">
          <span className="block text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
            Événement d’agenda (iCalendar)
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              aria-label="Titre de l’événement"
              value={source.eventTitle || ''}
              onChange={(e) =>
                onChange({ ...source, type: 'text', textMode: 'event', eventTitle: e.target.value })
              }
              placeholder="Nom de l’événement *"
              className="sm:col-span-2 w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
            />
            <div>
              <label className="block text-[11px] font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1">
                Début *
              </label>
              <input
                type="datetime-local"
                value={source.eventStart || ''}
                onChange={(e) =>
                  onChange({ ...source, type: 'text', textMode: 'event', eventStart: e.target.value })
                }
                className="w-full px-3 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#4B4D54] dark:text-[#CBD5E1] mb-1">
                Fin (optionnel)
              </label>
              <input
                type="datetime-local"
                value={source.eventEnd || ''}
                onChange={(e) =>
                  onChange({ ...source, type: 'text', textMode: 'event', eventEnd: e.target.value })
                }
                className="w-full px-3 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl"
              />
            </div>
            <input
              type="text"
              aria-label="Lieu"
              value={source.eventLocation || ''}
              onChange={(e) =>
                onChange({ ...source, type: 'text', textMode: 'event', eventLocation: e.target.value })
              }
              placeholder="Lieu ou lien visio"
              className="sm:col-span-2 w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
            />
            <textarea
              rows={2}
              aria-label="Description"
              value={source.eventDescription || ''}
              onChange={(e) =>
                onChange({
                  ...source,
                  type: 'text',
                  textMode: 'event',
                  eventDescription: e.target.value,
                })
              }
              placeholder="Notes ou programme..."
              className="sm:col-span-2 w-full px-3.5 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
            />
          </div>
        </div>
      )}

      {/* 8. EMAIL INPUT */}
      {selectedIntent === 'email' && (
        <div className="pt-5 space-y-3 animate-[fadeIn_160ms_ease-out]">
          <span className="block text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
            Envoi d’e-mail instantané
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="email"
              aria-label="Adresse e-mail destinataire"
              value={source.emailAddress || ''}
              onChange={(e) =>
                onChange({ ...source, type: 'text', textMode: 'email', emailAddress: e.target.value })
              }
              placeholder="contact@entreprise.fr *"
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
            />
            <input
              type="text"
              aria-label="Objet du message"
              value={source.emailSubject || ''}
              onChange={(e) =>
                onChange({ ...source, type: 'text', textMode: 'email', emailSubject: e.target.value })
              }
              placeholder="Objet (optionnel)"
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
            />
            <textarea
              rows={2}
              aria-label="Contenu de l'e-mail"
              value={source.emailBody || ''}
              onChange={(e) =>
                onChange({ ...source, type: 'text', textMode: 'email', emailBody: e.target.value })
              }
              placeholder="Corps du message pré-rempli (optionnel)..."
              className="sm:col-span-2 w-full px-3.5 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
            />
          </div>
        </div>
      )}

      {/* 9. PHONE INPUT */}
      {selectedIntent === 'phone' && (
        <div className="pt-5 space-y-2.5 animate-[fadeIn_160ms_ease-out]">
          <label htmlFor="qr-phone-input" className="block text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
            Numéro de téléphone
          </label>
          <input
            id="qr-phone-input"
            type="tel"
            value={source.phoneNumber || ''}
            onChange={(e) =>
              onChange({ ...source, type: 'text', textMode: 'phone', phoneNumber: e.target.value })
            }
            placeholder="+33 1 84 25 90 10"
            className="w-full px-4 py-3 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
          />
        </div>
      )}

      {/* 10. SMS INPUT */}
      {selectedIntent === 'sms' && (
        <div className="pt-5 space-y-3 animate-[fadeIn_160ms_ease-out]">
          <span className="block text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
            SMS pré-composé
          </span>
          <input
            type="tel"
            aria-label="Numéro SMS"
            value={source.smsPhone || ''}
            onChange={(e) =>
              onChange({ ...source, type: 'text', textMode: 'sms', smsPhone: e.target.value })
            }
            placeholder="+33 6 12 34 56 78 *"
            className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
          />
          <textarea
            rows={2}
            aria-label="Message SMS"
            value={source.smsMessage || ''}
            onChange={(e) =>
              onChange({ ...source, type: 'text', textMode: 'sms', smsMessage: e.target.value })
            }
            placeholder="Texte du SMS pré-rempli..."
            className="w-full px-3.5 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
          />
        </div>
      )}

      {/* 11. WHATSAPP INPUT */}
      {selectedIntent === 'whatsapp' && (
        <div className="pt-5 space-y-3 animate-[fadeIn_160ms_ease-out]">
          <span className="block text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
            Lien direct WhatsApp
          </span>
          <input
            type="tel"
            aria-label="Numéro WhatsApp international"
            value={source.whatsappPhone || ''}
            onChange={(e) =>
              onChange({
                ...source,
                type: 'text',
                textMode: 'whatsapp',
                whatsappPhone: e.target.value,
              })
            }
            placeholder="Numéro avec indicatif pays (+33 6 12 34 56 78) *"
            className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
          />
          <textarea
            rows={2}
            aria-label="Message d’accueil WhatsApp"
            value={source.whatsappMessage || ''}
            onChange={(e) =>
              onChange({
                ...source,
                type: 'text',
                textMode: 'whatsapp',
                whatsappMessage: e.target.value,
              })
            }
            placeholder="Message pré-rempli à l’ouverture de la conversation..."
            className="w-full px-3.5 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
          />
        </div>
      )}

      {/* 12. GEOLOCATION GPS INPUT */}
      {selectedIntent === 'geo' && (
        <div className="pt-5 space-y-3 animate-[fadeIn_160ms_ease-out]">
          <span className="block text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
            Coordonnées GPS &amp; itinéraire
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              aria-label="Latitude"
              value={source.geoLat || ''}
              onChange={(e) =>
                onChange({ ...source, type: 'text', textMode: 'geo', geoLat: e.target.value })
              }
              placeholder="Latitude (ex. 48.8566) *"
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
            />
            <input
              type="text"
              aria-label="Longitude"
              value={source.geoLng || ''}
              onChange={(e) =>
                onChange({ ...source, type: 'text', textMode: 'geo', geoLng: e.target.value })
              }
              placeholder="Longitude (ex. 2.3522) *"
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
            />
            <input
              type="text"
              aria-label="Nom du lieu"
              value={source.geoLabel || ''}
              onChange={(e) =>
                onChange({ ...source, type: 'text', textMode: 'geo', geoLabel: e.target.value })
              }
              placeholder="Nom du lieu (optionnel)"
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
            />
          </div>
        </div>
      )}

      {/* 13. PAYMENT SEPA EPC / LINK INPUT */}
      {selectedIntent === 'payment' && (
        <div className="pt-5 space-y-3 animate-[fadeIn_160ms_ease-out]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex p-0.5 bg-[#F3F4F8] dark:bg-[#0F1522] border border-[#E6E8F0] dark:border-[#242C3D] rounded-lg gap-0.5">
              <button
                type="button"
                onClick={() =>
                  onChange({ ...source, type: 'text', textMode: 'payment', paymentMode: 'sepa' })
                }
                className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                  (source.paymentMode || 'sepa') === 'sepa'
                    ? 'bg-white dark:bg-[#1E293B] text-[#111214] dark:text-white shadow-2xs'
                    : 'text-[#5C5E66] dark:text-[#94A3B8]'
                }`}
              >
                Virement SEPA (EPC)
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({ ...source, type: 'text', textMode: 'payment', paymentMode: 'link' })
                }
                className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                  source.paymentMode === 'link'
                    ? 'bg-white dark:bg-[#1E293B] text-[#111214] dark:text-white shadow-2xs'
                    : 'text-[#5C5E66] dark:text-[#94A3B8]'
                }`}
              >
                Lien Stripe / PayPal
              </button>
            </div>
          </div>

          {source.paymentMode === 'link' ? (
            <input
              type="url"
              aria-label="Lien de paiement HTTPS"
              value={source.paymentUrl || ''}
              onChange={(e) =>
                onChange({
                  ...source,
                  type: 'text',
                  textMode: 'payment',
                  paymentMode: 'link',
                  paymentUrl: e.target.value,
                })
              }
              placeholder="https://buy.stripe.com/... ou https://paypal.me/..."
              className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                aria-label="Bénéficiaire"
                value={source.paymentName || ''}
                onChange={(e) =>
                  onChange({
                    ...source,
                    type: 'text',
                    textMode: 'payment',
                    paymentName: e.target.value,
                  })
                }
                placeholder="Nom du bénéficiaire *"
                className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
              />
              <input
                type="text"
                aria-label="IBAN"
                value={source.paymentIban || ''}
                onChange={(e) =>
                  onChange({
                    ...source,
                    type: 'text',
                    textMode: 'payment',
                    paymentIban: e.target.value,
                  })
                }
                placeholder="IBAN *"
                className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
              />
              <input
                type="text"
                aria-label="BIC"
                value={source.paymentBic || ''}
                onChange={(e) =>
                  onChange({
                    ...source,
                    type: 'text',
                    textMode: 'payment',
                    paymentBic: e.target.value,
                  })
                }
                placeholder="BIC (optionnel)"
                className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
              />
              <input
                type="text"
                aria-label="Montant en EUR"
                value={source.paymentAmount || ''}
                onChange={(e) =>
                  onChange({
                    ...source,
                    type: 'text',
                    textMode: 'payment',
                    paymentAmount: e.target.value,
                  })
                }
                placeholder="Montant EUR (ex. 49.90)"
                className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
              />
              <input
                type="text"
                aria-label="Référence facture"
                value={source.paymentReference || ''}
                onChange={(e) =>
                  onChange({
                    ...source,
                    type: 'text',
                    textMode: 'payment',
                    paymentReference: e.target.value,
                  })
                }
                placeholder="Référence ou motif de virement (optionnel)"
                className="sm:col-span-2 w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
              />
            </div>
          )}
        </div>
      )}

      {/* 14. DOCUMENT / PDF */}
      {selectedIntent === 'document' && (
        <div className="pt-4 space-y-2.5 animate-[fadeIn_160ms_ease-out]">
          <input
            ref={documentInputRef}
            type="file"
            accept=".pdf,.txt,.csv,.doc,.docx,application/pdf,text/plain,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            aria-label="Importer un document"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileUpload(file, 'document');
              e.target.value = '';
            }}
          />

          {source.documentUrl && isInternalMediaPath(source.documentUrl) ? (
            <div
              data-testid="document-loaded-card"
              className="rounded-xl border border-[#D9E5FF] dark:border-[#21304C] bg-[#F4F8FF] dark:bg-[#0F172A] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-white dark:bg-[#131926] border border-[#DCE2EE] dark:border-[#2A3346] flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-[#1D4ED8] dark:text-[#60A5FA]" aria-hidden="true" />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-[#111214] dark:text-[#F1F5F9] inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] dark:text-[#34D399]" aria-hidden="true" />
                      <span>{uploading === 'document' ? 'Envoi en cours…' : 'Document prêt'}</span>
                    </span>
                    {source.documentEncrypted && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#1D4ED8] dark:text-[#93C5FD]">
                        <Lock className="w-2.5 h-2.5" aria-hidden="true" />
                        <span>Chiffré</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#5C5E66] dark:text-[#94A3B8]">
                    Lecteur intégré avec téléchargement direct après scan
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={uploading === 'document'}
                  onClick={() => documentInputRef.current?.click()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-[#111214] dark:text-[#F1F5F9] bg-white dark:bg-[#131926] border border-[#DCE2EE] dark:border-[#2A3346] hover:bg-[#EFF4FF] dark:hover:bg-[#1E293B] rounded-lg cursor-pointer"
                >
                  <Upload className="w-3 h-3" aria-hidden="true" />
                  <span>Remplacer</span>
                </button>
                <button
                  type="button"
                  aria-label="Retirer le document sélectionné"
                  onClick={() => {
                    setShowExternalUrlInput(null);
                    onChange({
                      ...source,
                      documentUrl: '',
                      documentPageUrl: '',
                      documentEncrypted: false,
                    });
                  }}
                  className="p-1.5 text-[#6E7078] dark:text-[#94A3B8] hover:text-[#B91C1C] rounded-lg cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => handleDrop(e, 'document')}
              className={`rounded-xl border border-dashed px-3.5 py-3 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                dragActive
                  ? 'border-[#2563EB] bg-[#F4F7FF] dark:bg-[#1E293B]'
                  : 'border-[#CBD5E1] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0F172A]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-[#1D4ED8] dark:text-[#60A5FA]" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-[#111214] dark:text-[#F1F5F9] truncate">
                    {uploading === 'document'
                      ? 'Hébergement chiffré...'
                      : 'Importer un document (PDF, DOCX, TXT, CSV)'}
                  </p>
                  <p className="text-[11px] text-[#6E7078] dark:text-[#94A3B8] truncate">
                    Catalogue, menu, facture ou contrat consultable après scan.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={uploading === 'document'}
                onClick={() => documentInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#111214] dark:bg-[#2563EB] hover:bg-[#27292E] dark:hover:bg-[#1D4ED8] rounded-xl cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Importer</span>
              </button>
            </div>
          )}

          {(!source.documentUrl || !isInternalMediaPath(source.documentUrl) || showExternalUrlInput === 'document') ? (
            <input
              type="text"
              aria-label="Lien HTTPS externe vers un document"
              value={isInternalMediaPath(source.documentUrl || '') ? '' : source.documentUrl || ''}
              onChange={(e) =>
                onChange({
                  ...source,
                  type: 'document',
                  documentUrl: e.target.value,
                  documentPageUrl: '',
                  documentEncrypted: false,
                })
              }
              placeholder="Ou collez un lien HTTPS externe vers un document PDF…"
              className="w-full px-3 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
            />
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowExternalUrlInput('document')}
                className="text-[11px] font-medium text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#1D4ED8] dark:hover:text-[#60A5FA] hover:underline cursor-pointer"
              >
                Utiliser plutôt un lien HTTPS externe
              </button>
            </div>
          )}

          {documentUrlWarning && (
            <p role="alert" className="text-xs font-medium text-[#B91C1C] dark:text-[#F87171]">
              {documentUrlWarning}
            </p>
          )}
        </div>
      )}

      {/* 15. AUDIO */}
      {selectedIntent === 'audio' && (
        <div className="pt-4 space-y-2.5 animate-[fadeIn_160ms_ease-out]">
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*"
            aria-label="Importer un fichier audio"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileUpload(file, 'audio');
              e.target.value = '';
            }}
          />

          {source.audioUrl && isInternalMediaPath(source.audioUrl) ? (
            <div
              data-testid="audio-loaded-card"
              className="rounded-xl border border-[#FFD8EC] dark:border-[#3E1F32] bg-[#FFF4FA] dark:bg-[#0F172A] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-white dark:bg-[#131926] border border-[#DCE2EE] dark:border-[#2A3346] flex items-center justify-center shrink-0">
                  <Music className="w-5 h-5 text-[#DB2777] dark:text-[#F472B6]" aria-hidden="true" />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-[#111214] dark:text-[#F1F5F9] inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] dark:text-[#34D399]" aria-hidden="true" />
                      <span>{uploading === 'audio' ? 'Envoi en cours…' : 'Audio prêt'}</span>
                    </span>
                    {source.audioEncrypted && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#1D4ED8] dark:text-[#93C5FD]">
                        <Lock className="w-2.5 h-2.5" aria-hidden="true" />
                        <span>Chiffré</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#5C5E66] dark:text-[#94A3B8]">
                    Lecteur audio haute fidélité après scan
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={uploading === 'audio'}
                  onClick={() => audioInputRef.current?.click()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-[#111214] dark:text-[#F1F5F9] bg-white dark:bg-[#131926] border border-[#DCE2EE] dark:border-[#2A3346] hover:bg-[#FFF0F6] dark:hover:bg-[#1E293B] rounded-lg cursor-pointer"
                >
                  <Upload className="w-3 h-3" aria-hidden="true" />
                  <span>Remplacer</span>
                </button>
                <button
                  type="button"
                  aria-label="Retirer l’audio sélectionné"
                  onClick={() => {
                    setShowExternalUrlInput(null);
                    onChange({
                      ...source,
                      audioUrl: '',
                      audioPageUrl: '',
                      audioEncrypted: false,
                    });
                  }}
                  className="p-1.5 text-[#6E7078] dark:text-[#94A3B8] hover:text-[#B91C1C] rounded-lg cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => handleDrop(e, 'audio')}
              className={`rounded-xl border border-dashed px-3.5 py-3 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                dragActive
                  ? 'border-[#2563EB] bg-[#F4F7FF] dark:bg-[#1E293B]'
                  : 'border-[#CBD5E1] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0F172A]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-white dark:bg-[#131926] border border-[#E2E6F0] dark:border-[#242C3D] flex items-center justify-center shrink-0">
                  <Music className="w-4 h-4 text-[#DB2777] dark:text-[#F472B6]" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-[#111214] dark:text-[#F1F5F9] truncate">
                    {uploading === 'audio'
                      ? 'Hébergement chiffré...'
                      : 'Importer un fichier audio (MP3, WAV, OGG, M4A)'}
                  </p>
                  <p className="text-[11px] text-[#6E7078] dark:text-[#94A3B8] truncate">
                    Podcast, note vocale, guide sonore ou extrait musical.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={uploading === 'audio'}
                onClick={() => audioInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#111214] dark:bg-[#2563EB] hover:bg-[#27292E] dark:hover:bg-[#1D4ED8] rounded-xl cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Importer</span>
              </button>
            </div>
          )}

          {(!source.audioUrl || !isInternalMediaPath(source.audioUrl) || showExternalUrlInput === 'audio') ? (
            <input
              type="text"
              aria-label="Lien HTTPS externe vers un fichier audio"
              value={isInternalMediaPath(source.audioUrl || '') ? '' : source.audioUrl || ''}
              onChange={(e) =>
                onChange({
                  ...source,
                  type: 'audio',
                  audioUrl: e.target.value,
                  audioPageUrl: '',
                  audioEncrypted: false,
                })
              }
              placeholder="Ou collez un lien HTTPS externe vers un flux audio…"
              className="w-full px-3 py-2 text-xs bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:border-[#2563EB]"
            />
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowExternalUrlInput('audio')}
                className="text-[11px] font-medium text-[#5C5E66] dark:text-[#94A3B8] hover:text-[#1D4ED8] dark:hover:text-[#60A5FA] hover:underline cursor-pointer"
              >
                Utiliser plutôt un lien HTTPS externe
              </button>
            </div>
          )}

          {audioUrlWarning && (
            <p role="alert" className="text-xs font-medium text-[#B91C1C] dark:text-[#F87171]">
              {audioUrlWarning}
            </p>
          )}
        </div>
      )}

      {/* 16. SOCIAL NETWORKS (TIKTOK, INSTAGRAM, FACEBOOK, TELEGRAM, TWITTER X) */}
      {(selectedIntent === 'tiktok' ||
        selectedIntent === 'instagram' ||
        selectedIntent === 'facebook' ||
        selectedIntent === 'telegram' ||
        selectedIntent === 'twitter') && (() => {
        const net = selectedIntent as SocialNetworkKey;
        const fieldByNet: Record<SocialNetworkKey, keyof QrSourceState> = {
          tiktok: 'tiktokHandle',
          instagram: 'instagramHandle',
          facebook: 'facebookHandle',
          telegram: 'telegramHandle',
          twitter: 'twitterHandle',
        };
        const labelByNet: Record<SocialNetworkKey, string> = {
          tiktok: 'Compte TikTok officiel',
          instagram: 'Compte Instagram officiel',
          facebook: 'Page ou profil Facebook officiel',
          telegram: 'Canal ou identifiant Telegram officiel',
          twitter: 'Compte Twitter (X) officiel',
        };
        const placeholderByNet: Record<SocialNetworkKey, string> = {
          tiktok: '@votre.compte ou https://www.tiktok.com/@votre.compte',
          instagram: '@votre.compte ou https://www.instagram.com/votre.compte/',
          facebook: 'nom.de.page ou https://www.facebook.com/nom.de.page',
          telegram: '@votre_canal ou https://t.me/votre_canal',
          twitter: '@votrecompte ou https://x.com/votrecompte',
        };
        const fieldKey = fieldByNet[net];
        const rawVal = String(source[fieldKey] || '');
        const check = rawVal.trim() ? buildSocialPayload(rawVal, net) : null;
        return (
          <div className="pt-5 space-y-2.5 animate-[fadeIn_160ms_ease-out]">
            <label
              htmlFor={`qr-social-${net}`}
              className="block text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]"
            >
              {labelByNet[net]}
            </label>
            <input
              id={`qr-social-${net}`}
              data-testid={`social-input-${net}`}
              type="text"
              value={rawVal}
              onChange={(e) =>
                onChange({
                  ...source,
                  type: 'text',
                  textMode: net,
                  [fieldKey]: e.target.value,
                })
              }
              placeholder={placeholderByNet[net]}
              className="w-full px-4 py-3 text-sm bg-[#F8FAFC] dark:bg-[#0F172A] text-[#111214] dark:text-[#F1F5F9] border border-[#DCE2EE] dark:border-[#2A3346] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-colors"
            />
            {check?.valid ? (
              <p className="text-[11px] font-medium text-[#15803D] dark:text-[#34D399] truncate">
                Lien officiel normalisé : {check.payload}
              </p>
            ) : (
              <p className="text-[11px] text-[#5C5E66] dark:text-[#94A3B8]">
                Saisissez un @identifiant ou un lien HTTPS officiel : seuls les domaines authentiques sont acceptés.
              </p>
            )}
          </div>
        );
      })()}

      {(uploadError || validationError) && (
        <div
          role="alert"
          data-testid="source-validation-error"
          className="mt-4 flex items-center gap-2 text-xs font-medium text-[#B91C1C] dark:text-[#FCA5A5] bg-[#FEF2F2] dark:bg-[#7F1D1D]/30 border border-[#FECACA] dark:border-[#991B1B] rounded-xl px-3.5 py-2.5"
        >
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{uploadError || validationError}</span>
        </div>
      )}

      {/* E2EE PRIVACY BAR + CONSERVATION SUMMARY */}
      {selectedIntent !== null && (
        <div className="mt-4 rounded-xl border border-[#DCE6FF] dark:border-[#243047] bg-[#F5F8FF]/80 dark:bg-[#0F172A] px-3.5 py-2.5 flex flex-wrap items-start justify-between gap-3">
          <label
            htmlFor="e2ee-toggle-checkbox"
            className="flex items-start gap-2.5 cursor-pointer min-w-0 flex-1"
          >
            <input
              id="e2ee-toggle-checkbox"
              data-testid="e2ee-toggle-checkbox"
              type="checkbox"
              checked={isE2eeActive}
              onChange={(e) =>
                onChange({
                  ...source,
                  e2eeEnabled: e.target.checked,
                  e2eeKeyFragment:
                    e.target.checked && !source.e2eeKeyFragment
                      ? generateE2eeKeyBase64Url()
                      : source.e2eeKeyFragment,
                })
              }
              className="mt-0.5 w-4 h-4 accent-[#2563EB] shrink-0 cursor-pointer"
            />
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#111214] dark:text-[#F1F5F9]">
                <Lock className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA]" aria-hidden="true" />
                <span>Chiffrement de bout en bout</span>
              </span>
              <p className="text-[11px] text-[#475569] dark:text-[#94A3B8] leading-relaxed mt-0.5">
                {isE2eeActive
                  ? 'Contenu chiffré sur votre appareil avant envoi · Conservation gratuite 7 jours. Partagez uniquement votre QR code avec des personnes de confiance.'
                  : 'Mode standard non chiffré · Conservation gratuite 7 jours sur votre espace.'}
              </p>
            </div>
          </label>
        </div>
      )}

      {/* MANDATORY CONFIDENTIAL GENERATE CTA */}
      {selectedIntent !== null && (
        <div className="mt-5 pt-4 border-t border-[#EFEFF5] dark:border-[#242C3D] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[#5C5E66] dark:text-[#94A3B8]">
            {isGenerated ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-[#15803D] dark:text-[#34D399]">
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>QR code généré dans l’aperçu.</span>
              </span>
            ) : (
              <span>Validez pour générer et révéler votre QR code.</span>
            )}
          </div>

          <button
            type="button"
            data-testid="generate-qr-btn"
            onClick={onGenerate}
            disabled={uploading !== null || isGenerating}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] active:scale-[0.98] rounded-xl transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            <QrCode className="w-4 h-4" aria-hidden="true" />
            <span>
              {isGenerating
                ? 'Génération…'
                : isGenerated
                ? 'Régénérer mon QR code'
                : 'Générer mon QR code'}
            </span>
          </button>
        </div>
      )}
    </section>
  );
};
