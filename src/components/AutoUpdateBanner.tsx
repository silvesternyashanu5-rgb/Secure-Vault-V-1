import React from 'react';
import { RefreshCw, Sparkles, X } from 'lucide-react';

interface AutoUpdateBannerProps {
  updateAvailable: boolean;
  isApplying: boolean;
  latestVersion: string;
  countdownSeconds: number | null;
  pausedWhileTyping: boolean;
  onApplyNow: () => void;
  onDismiss: () => void;
}

export const AutoUpdateBanner: React.FC<AutoUpdateBannerProps> = ({
  updateAvailable,
  isApplying,
  latestVersion,
  countdownSeconds,
  pausedWhileTyping,
  onApplyNow,
  onDismiss,
}) => {
  if (!updateAvailable && !isApplying) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 lg:bottom-4 right-4 z-50 max-w-sm rounded-2xl border border-emerald-500/40 bg-slate-900 text-white p-4 shadow-2xl space-y-2.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            {isApplying ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
          </div>
          <div className="text-xs leading-relaxed">
            <div className="font-semibold text-white">
              {isApplying
                ? 'Applying App Update...'
                : 'New App Update Ready'}
            </div>
            <p className="text-slate-300 mt-0.5">
              {isApplying
                ? 'Refreshing cleanly across all users and guest rooms.'
                : pausedWhileTyping
                  ? 'Paused while you finish typing. Your local and guest data stays safe.'
                  : countdownSeconds !== null
                    ? `Updating automatically in ${countdownSeconds}s (${latestVersion}) — all user & guest room data is preserved.`
                    : `Version ${latestVersion} is ready for all users and guest rooms.`}
            </p>
          </div>
        </div>

        {!isApplying && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss update notification"
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {!isApplying && (
        <div className="flex items-center gap-2 pl-10">
          <button
            type="button"
            onClick={onApplyNow}
            className="min-h-[34px] px-3 rounded-lg bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
          >
            Update Now
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-[34px] px-3 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
          >
            Later
          </button>
        </div>
      )}
    </div>
  );
};
