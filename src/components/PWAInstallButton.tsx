import React, { useState } from 'react';
import { Check, Copy, Download, ExternalLink, Laptop, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'full';
  iconOnlyMobile?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'compact',
  iconOnlyMobile = false,
}) => {
  const { isInstallable, isInstalled, isIOS, isInIframe, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const appUrl =
    typeof window !== 'undefined' ? window.location.origin + '/' : '';

  if (isInstalled) {
    if (variant === 'full') {
      return (
        <div className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2.5 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          <Check className="w-4 h-4 shrink-0" />
          <span>Installed as Standalone App</span>
        </div>
      );
    }
    return null;
  }

  const handlePrimaryClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowGuide(true);
      }
      return;
    }
    setShowGuide(true);
  };

  const handleCopyUrl = async () => {
    if (!appUrl) return;
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // ignore clipboard errors in restricted contexts
    }
  };

  const compactAria = isInstallable
    ? 'Install App'
    : isIOS
      ? 'Install on iOS'
      : 'Install in Chrome';

  return (
    <>
      <button
        type="button"
        onClick={() => void handlePrimaryClick()}
        aria-label={compactAria}
        title={compactAria}
        className={
          variant === 'full'
            ? 'w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer'
            : isInstallable
              ? `min-h-[40px] ${iconOnlyMobile ? 'min-w-[40px] sm:min-w-0 justify-center' : ''} flex items-center gap-1.5 rounded-xl bg-emerald-600 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer`
              : `min-h-[40px] ${iconOnlyMobile ? 'min-w-[40px] sm:min-w-0 justify-center' : ''} flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer`
        }
      >
        <Download className="w-4 h-4 shrink-0" />
        <span className={variant === 'compact' ? 'hidden sm:inline' : ''}>
          {compactAria}
        </span>
        {variant === 'compact' && !iconOnlyMobile && (
          <span className="sm:hidden">Install</span>
        )}
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    {isIOS ? 'Install on iPhone or iPad' : 'Install App in Chrome'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Works offline with standalone home-screen &amp; desktop window support
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close installation guide"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isInIframe && appUrl && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/30 p-3.5 space-y-2.5">
                <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                  You are currently viewing this app inside an embedded frame. Chrome only enables
                  the one-tap <strong>Install App</strong> dialog when opened directly in its own
                  browser tab.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={appUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Standalone Tab to Install</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleCopyUrl()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    {copiedUrl ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy App Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {isIOS ? (
              <ol className="space-y-2.5 text-sm text-slate-600 dark:text-slate-300 list-decimal list-inside">
                <li>
                  Tap the <strong className="text-slate-900 dark:text-white">Share</strong> icon in
                  Safari&apos;s toolbar.
                </li>
                <li>
                  Scroll down and tap{' '}
                  <strong className="text-slate-900 dark:text-white">Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong className="text-slate-900 dark:text-white">Add</strong> to launch the
                  standalone app.
                </li>
              </ol>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                    <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Chrome on Android</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Open in Chrome, tap the <strong className="text-slate-900 dark:text-white">⋮</strong>{' '}
                    menu at top-right, then tap{' '}
                    <strong className="text-slate-900 dark:text-white">Install app</strong> or{' '}
                    <strong className="text-slate-900 dark:text-white">Add to Home screen</strong>.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                    <Laptop className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Chrome on Desktop (Windows / Mac / Linux)</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Click the <strong className="text-slate-900 dark:text-white">Install</strong>{' '}
                    icon on the right side of the Chrome address bar, or open{' '}
                    <strong className="text-slate-900 dark:text-white">
                      ⋮ → Cast, save, and share → Install page as app…
                    </strong>
                  </p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-slate-800 py-2.5 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};
