import React from 'react';
import { AlertCircle, Cloud, Laptop, CopyCheck } from 'lucide-react';
import type { SyncConflict } from '../lib/syncEngine';

interface ConflictResolutionModalProps {
  conflicts: SyncConflict[];
  onResolve: (
    itemId: string,
    choice: 'keep-local' | 'use-cloud' | 'keep-both'
  ) => Promise<void>;
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  conflicts,
  onResolve,
}) => {
  if (conflicts.length === 0) return null;
  const active = conflicts[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Sync Conflict Detected ({conflicts.length} remaining)
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              This entry was modified on both this device and your cloud vault since your last sync.
              Choose which version to preserve.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <Laptop className="w-4 h-4 text-emerald-600" />
              <span>This Device</span>
            </div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {active.localItem.title}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {active.localItem.username || 'No username'}
            </div>
            <div className="text-xs font-mono text-slate-400 tabular-nums">
              {new Date(active.localItem.clientUpdatedAt).toLocaleString()}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <Cloud className="w-4 h-4 text-sky-500" />
              <span>Cloud Account</span>
            </div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {active.remoteItem.title}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {active.remoteItem.username || 'No username'}
            </div>
            <div className="text-xs font-mono text-slate-400 tabular-nums">
              {new Date(active.remoteItem.clientUpdatedAt).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => void onResolve(active.itemId, 'keep-local')}
            className="min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Keep Local
          </button>
          <button
            type="button"
            onClick={() => void onResolve(active.itemId, 'use-cloud')}
            className="min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Use Cloud
          </button>
          <button
            type="button"
            onClick={() => void onResolve(active.itemId, 'keep-both')}
            className="min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors cursor-pointer"
          >
            <CopyCheck className="w-3.5 h-3.5" />
            <span>Keep Both</span>
          </button>
        </div>
      </div>
    </div>
  );
};
