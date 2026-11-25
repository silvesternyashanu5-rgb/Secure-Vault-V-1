import React, { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, RotateCcw, Sparkles } from 'lucide-react';
import { APP_ICON_PRESETS, processCustomIconFile } from '../lib/appBranding';
import type { AppIconPresetId } from '../types/vault';
import { AppBrandIcon } from './AppBrandIcon';

interface AppBrandingCardProps {
  appDisplayName: string;
  appIconPreset: AppIconPresetId;
  customAppIconDataUrl: string;
  onSaveBranding: (next: {
    appDisplayName: string;
    appIconPreset: AppIconPresetId;
    customAppIconDataUrl: string;
  }) => Promise<void>;
}

export const AppBrandingCard: React.FC<AppBrandingCardProps> = ({
  appDisplayName,
  appIconPreset,
  customAppIconDataUrl,
  onSaveBranding,
}) => {
  const [nameInput, setNameInput] = useState(appDisplayName || 'SecureVault');
  const [selectedPreset, setSelectedPreset] = useState<AppIconPresetId>(
    appIconPreset || 'shield'
  );
  const [customDataUrl, setCustomDataUrl] = useState(customAppIconDataUrl || '');
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setNameInput(appDisplayName || 'SecureVault');
    setSelectedPreset(appIconPreset || 'shield');
    setCustomDataUrl(customAppIconDataUrl || '');
  }, [appDisplayName, appIconPreset, customAppIconDataUrl]);

  const handleUploadCustomIcon = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg('');
    try {
      const processed = await processCustomIconFile(file);
      setCustomDataUrl(processed);
      setSelectedPreset('custom');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not load icon image.');
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = nameInput.trim().slice(0, 28);
    if (!cleaned) {
      setErrorMsg('Enter an app name.');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    setStatusMsg('');
    try {
      await onSaveBranding({
        appDisplayName: cleaned,
        appIconPreset: selectedPreset,
        customAppIconDataUrl: selectedPreset === 'custom' ? customDataUrl : '',
      });
      setStatusMsg(
        `App updated to "${cleaned}". Browser tab, lock screen, header, and Add-to-Home-Screen manifest are updated.`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = async () => {
    setSaving(true);
    setErrorMsg('');
    setStatusMsg('');
    try {
      setNameInput('SecureVault');
      setSelectedPreset('shield');
      setCustomDataUrl('');
      await onSaveBranding({
        appDisplayName: 'SecureVault',
        appIconPreset: 'shield',
        customAppIconDataUrl: '',
      });
      setStatusMsg('Restored default SecureVault name and icon.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <AppBrandIcon
            preset={selectedPreset}
            customIconDataUrl={customDataUrl}
            size="lg"
          />
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              App Name &amp; Icon Customization
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl">
              Change how this app looks and is named across the lock screen, top bar, browser
              tab, and PWA Add-to-Home-Screen icon.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleResetDefault()}
          disabled={saving}
          className="min-h-[38px] flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Default</span>
        </button>
      </div>

      <form onSubmit={handleApply} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            Custom App Name
          </label>
          <input
            type="text"
            maxLength={28}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="e.g., Calculator, QuickNotes, SkyCast"
            className="w-full max-w-md min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Select App Icon
            </span>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <ImagePlus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Upload Custom Icon</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => void handleUploadCustomIcon(e)}
              className="hidden"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
            {APP_ICON_PRESETS.map((preset) => {
              const isActive = selectedPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setSelectedPreset(preset.id);
                    const isKnownPresetName =
                      nameInput.trim() === '' ||
                      APP_ICON_PRESETS.some(
                        (p) => p.defaultName.toLowerCase() === nameInput.trim().toLowerCase()
                      );
                    if (isKnownPresetName) {
                      setNameInput(preset.defaultName);
                    }
                  }}
                  className={`min-h-[56px] flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition-colors cursor-pointer ${
                    isActive
                      ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <AppBrandIcon preset={preset.id} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {preset.label}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {preset.defaultName}
                    </div>
                  </div>
                </button>
              );
            })}

            {customDataUrl && (
              <button
                type="button"
                onClick={() => setSelectedPreset('custom')}
                className={`min-h-[56px] flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition-colors cursor-pointer ${
                  selectedPreset === 'custom'
                    ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <AppBrandIcon
                  preset="custom"
                  customIconDataUrl={customDataUrl}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    Custom
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Uploaded
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Note: If you already installed this app onto your phone&apos;s home screen earlier,
          Android/iOS cache the pinned launcher icon—remove the old home-screen shortcut and
          use <strong>Add to Home Screen</strong> again after saving to apply the new launcher
          icon and name.
        </p>

        {errorMsg && (
          <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
            {errorMsg}
          </p>
        )}
        {statusMsg && (
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>{statusMsg}</span>
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 transition-colors cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{saving ? 'Applying...' : 'Apply App Name & Icon'}</span>
        </button>
      </form>
    </section>
  );
};
