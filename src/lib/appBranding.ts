import type { AppIconPresetId } from '../types/vault';

export interface AppIconPreset {
  id: Exclude<AppIconPresetId, 'custom'>;
  label: string;
  defaultName: string;
  bgColor: string;
  accentColor: string;
  /** Inner Lucide-compatible 24x24 SVG paths rendered centered inside a 64x64 rounded badge */
  svgInner: string;
}

export const APP_ICON_PRESETS: AppIconPreset[] = [
  {
    id: 'shield',
    label: 'Shield',
    defaultName: 'SecureVault',
    bgColor: '#0F172A',
    accentColor: '#10B981',
    svgInner:
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  },
  {
    id: 'calculator',
    label: 'Calculator',
    defaultName: 'Calculator',
    bgColor: '#334155',
    accentColor: '#F59E0B',
    svgInner:
      '<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>',
  },
  {
    id: 'notes',
    label: 'Notes',
    defaultName: 'QuickNotes',
    bgColor: '#D97706',
    accentColor: '#FFFFFF',
    svgInner:
      '<path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/>',
  },
  {
    id: 'weather',
    label: 'Weather',
    defaultName: 'SkyCast',
    bgColor: '#0284C7',
    accentColor: '#FDE047',
    svgInner:
      '<path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    defaultName: 'DayPlan',
    bgColor: '#DC2626',
    accentColor: '#FFFFFF',
    svgInner:
      '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  },
  {
    id: 'music',
    label: 'Music',
    defaultName: 'SoundWave',
    bgColor: '#7C3AED',
    accentColor: '#FFFFFF',
    svgInner:
      '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  },
  {
    id: 'compass',
    label: 'Compass',
    defaultName: 'Navigator',
    bgColor: '#059669',
    accentColor: '#FFFFFF',
    svgInner:
      '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  },
  {
    id: 'clock',
    label: 'Clock',
    defaultName: 'TimeKeep',
    bgColor: '#475569',
    accentColor: '#FFFFFF',
    svgInner:
      '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  },
];

export function getPresetMeta(id: AppIconPresetId): AppIconPreset {
  return APP_ICON_PRESETS.find((p) => p.id === id) || APP_ICON_PRESETS[0];
}

export function buildPresetSvgDataUrl(preset: AppIconPreset): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${preset.bgColor}"/><g transform="translate(16 16) scale(1.3333)" fill="none" stroke="${preset.accentColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${preset.svgInner}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function renderSvgToPngDataUrl(svgDataUrl: string, size: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(svgDataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(svgDataUrl);
      }
    };
    img.onerror = () => resolve(svgDataUrl);
    img.src = svgDataUrl;
  });
}

export async function processCustomIconFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read selected icon file.'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image format for app icon.'));
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        // Rounded icon mask
        const r = 48;
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(size - r, 0);
        ctx.quadraticCurveTo(size, 0, size, r);
        ctx.lineTo(size, size - r);
        ctx.quadraticCurveTo(size, size, size - r, size);
        ctx.lineTo(r, size);
        ctx.quadraticCurveTo(0, size, 0, size - r);
        ctx.lineTo(0, r);
        ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.closePath();
        ctx.clip();

        // Cover crop center square
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export async function applyAppBrandingToDocument(params: {
  appDisplayName: string;
  appIconPreset: AppIconPresetId;
  customAppIconDataUrl?: string;
}): Promise<void> {
  if (typeof document === 'undefined') return;

  const displayName = (params.appDisplayName || 'SecureVault').trim() || 'SecureVault';
  const shortName = displayName.slice(0, 12);

  // 1. Update page title & mobile meta tags
  document.title = displayName;
  const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (appleTitle) appleTitle.setAttribute('content', shortName);
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', displayName);

  // 2. Resolve active icon URLs
  const preset = getPresetMeta(params.appIconPreset);
  const isCustomDefault =
    params.appIconPreset === 'shield' && !params.customAppIconDataUrl && displayName === 'SecureVault';

  const svgUrl = buildPresetSvgDataUrl(preset);
  const iconPng192 =
    params.appIconPreset === 'custom' && params.customAppIconDataUrl
      ? params.customAppIconDataUrl
      : isCustomDefault
        ? '/pwa-192x192.png'
        : await renderSvgToPngDataUrl(svgUrl, 192);
  const iconPng512 =
    params.appIconPreset === 'custom' && params.customAppIconDataUrl
      ? params.customAppIconDataUrl
      : isCustomDefault
        ? '/pwa-512x512.png'
        : await renderSvgToPngDataUrl(svgUrl, 512);

  const faviconHref =
    params.appIconPreset === 'custom' && params.customAppIconDataUrl
      ? params.customAppIconDataUrl
      : isCustomDefault
        ? '/icon.svg'
        : svgUrl;

  const iconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (iconLink) {
    iconLink.type =
      params.appIconPreset === 'custom' && params.customAppIconDataUrl
        ? 'image/png'
        : 'image/svg+xml';
    iconLink.href = faviconHref;
  }

  const appleIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (appleIcon) {
    appleIcon.href = isCustomDefault ? '/apple-touch-icon.png' : iconPng192;
  }

  const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute('content', preset.bgColor);
  }

  // 3. Keep HTTPS /manifest.json link intact with credentials so Chrome always allows PWA installation
  try {
    let manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      manifestLink.crossOrigin = 'use-credentials';
      document.head.appendChild(manifestLink);
    }
    if (manifestLink.getAttribute('href') !== '/manifest.json') {
      manifestLink.href = '/manifest.json';
    }
    if (manifestLink.getAttribute('crossorigin') !== 'use-credentials') {
      manifestLink.setAttribute('crossorigin', 'use-credentials');
    }
  } catch {
    // ignore manifest DOM errors in restricted contexts
  }
}
