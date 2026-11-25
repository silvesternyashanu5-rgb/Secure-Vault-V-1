import React from 'react';
import { CheckCircle2, Megaphone, RefreshCw, ShieldCheck } from 'lucide-react';
import type { AdsSettings, SponsorFrequency } from '../types/vault';

interface AdsSectionViewProps {
  adsSettings: AdsSettings;
  onUpdateAds: (partial: Partial<AdsSettings>) => Promise<void>;
  onResetAdId: () => Promise<void>;
  scopeLabel?: string;
}

export const AdsSectionView: React.FC<AdsSectionViewProps> = ({
  adsSettings,
  onUpdateAds,
  onResetAdId,
  scopeLabel = 'Vault',
}) => {
  const adsEnabled =
    adsSettings.sponsoredTips && adsSettings.sponsorFrequency !== 'off';

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <Megaphone className="w-3.5 h-3.5" />
          <span>Dedicated Ads Section · Isolated from {scopeLabel}</span>
        </div>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
          Ads Section
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          All third-party ad placements are kept strictly inside this dedicated section, completely separated from your vault entries and hidden files.
        </p>
      </div>

      {/* Clean Ready State (All HilltopAds Cleared) */}
      <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
          {adsEnabled ? <ShieldCheck className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
        </div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
          {adsEnabled ? 'No Active Ad Scripts Configured' : 'Ad-Free Mode Active'}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          {adsEnabled
            ? 'Previous HilltopAds scripts and verification tags have been completely removed. This dedicated section is clean and ready whenever you want to add another ad provider.'
            : 'Ads are currently turned off across the app.'}
        </p>
      </section>

      {/* Dedicated Ad Controls */}
      <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              {scopeLabel} Ad Preferences
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Vault entries, passwords, and hidden media are never read or shared with ad networks.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
              Ads Status
            </div>
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 max-w-xs">
              {(
                [
                  { id: 'off', label: 'Off (Ad-Free)' },
                  { id: 'balanced', label: 'Section Ready' },
                ] as { id: SponsorFrequency; label: string }[]
              ).map((opt) => {
                const isSelected = opt.id === 'off' ? !adsEnabled : adsEnabled;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      void onUpdateAds({
                        sponsorFrequency: opt.id,
                        sponsoredTips: opt.id !== 'off',
                      })
                    }
                    className={`min-h-[40px] rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-800 p-4 cursor-pointer">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-white">
                  Enable Ads Section
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Allow future ad slots inside Ads tab only
                </div>
              </div>
              <input
                type="checkbox"
                checked={adsEnabled}
                onChange={(e) =>
                  void onUpdateAds({
                    sponsoredTips: e.target.checked,
                    sponsorFrequency: e.target.checked ? 'balanced' : 'off',
                  })
                }
                className="w-4 h-4 accent-emerald-600"
              />
            </label>

            <label className="flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-800 p-4 cursor-pointer">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-white">
                  Local Category Relevance
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Off by default · Zero external tracking
                </div>
              </div>
              <input
                type="checkbox"
                checked={adsSettings.personalizedAds}
                onChange={(e) =>
                  void onUpdateAds({ personalizedAds: e.target.checked })
                }
                className="w-4 h-4 accent-emerald-600"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-slate-500 dark:text-slate-400">
            <div>
              Anonymous Ad Session ID:{' '}
              <code className="font-mono text-slate-800 dark:text-slate-200">
                {adsSettings.adId}
              </code>
            </div>
            <button
              type="button"
              onClick={() => void onResetAdId()}
              className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reset Anonymous Ad ID</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
