import React, { useEffect, useState } from 'react';
import {
  Calculator,
  Cloud,
  CloudOff,
  Download,
  Fingerprint,
  Lock,
  Megaphone,
  Monitor,
  Moon,
  RefreshCw,
  ShieldAlert,
  Sun,
  Trash2,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { AutoUpdateController } from '../hooks/useAutoUpdateSystem';
import { checkBiometricCapability, type BiometricCapability } from '../lib/biometrics';
import type { ConflictPolicy } from '../lib/syncEngine';
import type {
  AuthMode,
  ThemeMode,
  VaultConfig,
} from '../types/vault';
import { AppBrandingCard } from './AppBrandingCard';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsViewProps {
  config: VaultConfig;
  isGuestMode: boolean;
  guestNumber: number | null;
  cloudUser: User | null;
  pendingSyncCount: number;
  isSyncing: boolean;
  conflictPolicy: ConflictPolicy;
  autoUpdate: AutoUpdateController;
  onChangeConflictPolicy: (policy: ConflictPolicy) => void;
  onUpdateConfig: (partial: Partial<VaultConfig>) => Promise<void>;
  onChangeLockCredential: (mode: AuthMode, newSecret: string) => Promise<void>;
  onToggleBiometrics: (enable: boolean) => Promise<{ notice?: string }>;
  onSignInGoogle: () => Promise<void>;
  onSignOutGoogle: () => Promise<void>;
  onManualSync: () => Promise<void>;
  onTestDisguise: () => void;
  onOpenAdsSection?: () => void;
  onExportEncryptedBackup: () => Promise<void>;
  onResetVault: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  config,
  isGuestMode,
  guestNumber,
  cloudUser,
  pendingSyncCount,
  isSyncing,
  conflictPolicy,
  autoUpdate,
  onChangeConflictPolicy,
  onUpdateConfig,
  onChangeLockCredential,
  onToggleBiometrics,
  onSignInGoogle,
  onSignOutGoogle,
  onManualSync,
  onTestDisguise,
  onOpenAdsSection,
  onExportEncryptedBackup,
  onResetVault,
}) => {
  const [bioCap, setBioCap] = useState<BiometricCapability | null>(null);
  const [bioMessage, setBioMessage] = useState('');
  const [newAuthMode, setNewAuthMode] = useState<AuthMode>(config.authMode);
  const [newSecret, setNewSecret] = useState('');
  const [secretMessage, setSecretMessage] = useState('');
  const [disguiseCodeInput, setDisguiseCodeInput] = useState(config.calculatorSecretCode);
  const [disguiseSavedMsg, setDisguiseSavedMsg] = useState('');
  const [cloudError, setCloudError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [updateCheckNote, setUpdateCheckNote] = useState('');

  useEffect(() => {
    void checkBiometricCapability().then(setBioCap);
  }, []);

  useEffect(() => {
    setDisguiseCodeInput(config.calculatorSecretCode);
  }, [config.calculatorSecretCode]);

  const handleSaveCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecretMessage('');
    if (newAuthMode === 'pin' && !/^\d{4,8}$/.test(newSecret)) {
      setSecretMessage('PIN must be 4 to 8 digits.');
      return;
    }
    if (newAuthMode === 'password' && newSecret.length < 6) {
      setSecretMessage('Master password must be at least 6 characters.');
      return;
    }
    await onChangeLockCredential(newAuthMode, newSecret);
    setNewSecret('');
    setSecretMessage('Vault unlock credential updated and key re-wrapped.');
  };

  const handleBiometricSwitch = async () => {
    setBioMessage('');
    try {
      const res = await onToggleBiometrics(!config.biometricEnabled);
      if (res.notice) {
        setBioMessage(res.notice);
      } else {
        setBioMessage(
          !config.biometricEnabled
            ? 'Biometric passkey enrolled successfully.'
            : 'Biometric authentication disabled.'
        );
      }
    } catch (err) {
      setBioMessage(err instanceof Error ? err.message : 'Failed to update biometrics.');
    }
  };

  const handleSaveDisguiseCode = async () => {
    const cleaned = disguiseCodeInput.replace(/\D/g, '').slice(0, 8);
    if (cleaned.length < 3) {
      setDisguiseSavedMsg('Enter 3–8 digits for the calculator trigger.');
      return;
    }
    await onUpdateConfig({ calculatorSecretCode: cleaned });
    setDisguiseSavedMsg(`Saved! Type ${cleaned} then "=" in Calculator to unlock.`);
    setTimeout(() => setDisguiseSavedMsg(''), 3500);
  };

  const handleAdsUpdate = async (partialAds: Partial<VaultConfig['adsSettings']>) => {
    await onUpdateConfig({
      adsSettings: {
        ...config.adsSettings,
        ...partialAds,
      },
    });
  };

  return (
    <div className="max-w-4xl space-y-6 pb-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Settings &amp; Security Controls
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {isGuestMode
            ? `Active profile: Guest Room #${guestNumber}. Connected to shared updates across all users and guest rooms.`
            : 'Manage encryption credentials, biometrics, calculator disguise, automatic updates, cloud sync, dark mode, and ads settings.'}
        </p>
      </div>

      {/* 1. Theme & Appearance */}
      <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Appearance &amp; Dark Mode
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Synced across both SecureVault and Calculator Disguise mode.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 max-w-md">
          {(
            [
              { mode: 'system', label: 'System', Icon: Monitor },
              { mode: 'light', label: 'Light', Icon: Sun },
              { mode: 'dark', label: 'Dark', Icon: Moon },
            ] as { mode: ThemeMode; label: string; Icon: React.FC<{ className?: string }> }[]
          ).map(({ mode, label, Icon }) => (
            <button
              key={mode}
              type="button"
              onClick={() => void onUpdateConfig({ darkMode: mode })}
              className={`min-h-[40px] flex items-center justify-center gap-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                config.darkMode === mode
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 1B. App Name & Icon Disguise */}
      <AppBrandingCard
        appDisplayName={config.appDisplayName}
        appIconPreset={config.appIconPreset}
        customAppIconDataUrl={config.customAppIconDataUrl}
        onSaveBranding={async (next) => {
          await onUpdateConfig(next);
        }}
      />

      {/* 2. Cloud Sync & Data Integrity */}
      <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              {cloudUser ? <Cloud className="w-5 h-5" /> : <CloudOff className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Cloud Sync &amp; Cross-Device Integrity
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {cloudUser
                  ? isGuestMode
                    ? `Signed in as ${cloudUser.email} · Guest Room #${guestNumber} and all saved rooms sync across your devices`
                    : `Signed in as ${cloudUser.email} · Main Vault & Guest Rooms synced with SHA-256 verification`
                  : 'Sign in with Google to synchronize your Main Vault, preferences, and Guest Rooms across devices.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {cloudUser ? (
              <>
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={() => void onManualSync()}
                  className="min-h-[40px] flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void onSignOutGoogle()}
                  className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  setCloudError('');
                  try {
                    await onSignInGoogle();
                  } catch (err) {
                    setCloudError(err instanceof Error ? err.message : 'Sign-in failed.');
                  }
                }}
                className="min-h-[42px] rounded-xl bg-slate-900 dark:bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors cursor-pointer"
              >
                Connect Google Account
              </button>
            )}
          </div>
        </div>

        {cloudError && (
          <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
            {cloudError}
          </p>
        )}

        {cloudUser && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Sync Status</div>
              <div className="mt-1 text-sm font-medium text-slate-900 dark:text-white tabular-nums">
                {pendingSyncCount > 0
                  ? `${pendingSyncCount} pending local edits`
                  : 'Users & Guest Rooms synced'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Last Verified Sync</div>
              <div className="mt-1 text-sm font-mono text-slate-900 dark:text-white tabular-nums">
                {config.lastSyncedAt
                  ? new Date(config.lastSyncedAt).toLocaleTimeString()
                  : 'Connected'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                Conflict Strategy
              </div>
              <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => onChangeConflictPolicy('latest-wins')}
                  className={`min-h-[32px] rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    conflictPolicy === 'latest-wins'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Latest Wins
                </button>
                <button
                  type="button"
                  onClick={() => onChangeConflictPolicy('ask-me')}
                  className={`min-h-[32px] rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    conflictPolicy === 'ask-me'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Ask Me
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 2B. Automatic Update System (All Users & Guest Rooms) */}
      <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <RefreshCw className={`w-5 h-5 ${autoUpdate.isChecking ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Automatic Update System
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Keeps app updates, preferences, and saved items synchronized automatically across all Main Vault users and every Guest Room.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                void onUpdateConfig({ autoUpdateEnabled: !config.autoUpdateEnabled })
              }
              className={`min-h-[40px] px-4 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                config.autoUpdateEnabled
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                  : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {config.autoUpdateEnabled ? 'Auto-Update Active' : 'Enable Auto-Update'}
            </button>
            <button
              type="button"
              disabled={autoUpdate.isChecking}
              onClick={async () => {
                setUpdateCheckNote('');
                const res = await autoUpdate.checkNow();
                setUpdateCheckNote(
                  res.updateAvailable
                    ? `Update ${res.latestVersion} is ready for all users and guest rooms.`
                    : `Up to date (${autoUpdate.currentVersion}) · All connected users and guest rooms synced.`
                );
              }}
              className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {autoUpdate.isChecking ? 'Checking...' : 'Check for Updates'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div>
            <div className="text-slate-500 dark:text-slate-400">App Version</div>
            <div className="mt-1 font-mono font-medium text-slate-900 dark:text-white">
              {autoUpdate.currentVersion}
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">Connected Profiles</div>
            <div className="mt-1 font-medium text-slate-900 dark:text-white tabular-nums">
              {autoUpdate.connectedSessions.length} active session
              {autoUpdate.connectedSessions.length === 1 ? '' : 's'} (Users &amp; Guests)
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">Last Update Check</div>
            <div className="mt-1 font-mono text-slate-900 dark:text-white tabular-nums">
              {autoUpdate.lastCheckedAt
                ? new Date(autoUpdate.lastCheckedAt).toLocaleTimeString()
                : 'Ready'}
            </div>
          </div>
        </div>

        {updateCheckNote && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">{updateCheckNote}</p>
        )}

        {autoUpdate.updateAvailable && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 p-3.5 text-xs">
            <span className="font-medium text-emerald-900 dark:text-emerald-200">
              New version {autoUpdate.latestVersion} is ready to apply across all users and guest rooms.
            </span>
            <button
              type="button"
              onClick={autoUpdate.applyNow}
              className="min-h-[34px] px-3.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 cursor-pointer"
            >
              Apply Update Now
            </button>
          </div>
        )}
      </section>

      {/* 3. Biometrics & Lock Credentials */}
      {!isGuestMode && (
        <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0">
              <Fingerprint className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    Biometric Authentication
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {bioCap?.platformAuthenticatorAvailable
                      ? 'Platform authenticator detected (Face ID, Touch ID, or Windows Hello).'
                      : 'WebAuthn passkey with automatic cryptographic device-key support.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleBiometricSwitch}
                  className={`min-h-[40px] px-4 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    config.biometricEnabled
                      ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {config.biometricEnabled ? 'Enabled (Disable)' : 'Enable Biometrics'}
                </button>
              </div>
              {bioMessage && (
                <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">{bioMessage}</p>
              )}
            </div>
          </div>

          <div className="pt-5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form onSubmit={handleSaveCredential} className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <Lock className="w-4 h-4 text-slate-500" />
                <span>Update PIN or Master Password</span>
              </div>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setNewAuthMode('pin');
                    setNewSecret('');
                  }}
                  className={`min-h-[36px] rounded-lg text-xs font-medium cursor-pointer ${
                    newAuthMode === 'pin'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  PIN Mode
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewAuthMode('password');
                    setNewSecret('');
                  }}
                  className={`min-h-[36px] rounded-lg text-xs font-medium cursor-pointer ${
                    newAuthMode === 'password'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Password Mode
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={newSecret}
                  inputMode={newAuthMode === 'pin' ? 'numeric' : 'text'}
                  onChange={(e) =>
                    setNewSecret(
                      newAuthMode === 'pin'
                        ? e.target.value.replace(/\D/g, '').slice(0, 8)
                        : e.target.value
                    )
                  }
                  placeholder={newAuthMode === 'pin' ? 'New 4–8 digit PIN' : 'New password (6+ chars)'}
                  className="flex-1 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  className="min-h-[42px] px-4 rounded-xl bg-slate-900 dark:bg-slate-800 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Update
                </button>
              </div>
              {secretMessage && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">{secretMessage}</p>
              )}
            </form>

            <div className="space-y-3">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                Auto-Lock Timeout
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Automatically lock the vault after inactivity.
              </p>
              <select
                value={config.autoLockMinutes}
                onChange={(e) => void onUpdateConfig({ autoLockMinutes: Number(e.target.value) })}
                className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value={1}>After 1 minute</option>
                <option value={5}>After 5 minutes</option>
                <option value={15}>After 15 minutes</option>
                <option value={60}>After 1 hour</option>
                <option value={0}>Never (Manual lock only)</option>
              </select>
            </div>
          </div>
        </section>
      )}

      {/* 4. Calculator Disguise */}
      <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Calculator Disguise Mode
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Masks SecureVault behind a fully functional calculator. Type your secret code and
                press <code className="font-mono">=</code> (or hold <code className="font-mono">AC</code>) to reveal the vault.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                void onUpdateConfig({
                  calculatorDisguiseEnabled: !config.calculatorDisguiseEnabled,
                })
              }
              className={`min-h-[40px] px-4 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                config.calculatorDisguiseEnabled
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                  : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {config.calculatorDisguiseEnabled ? 'Disguise Active' : 'Enable Disguise'}
            </button>
            <button
              type="button"
              onClick={onTestDisguise}
              className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Open Disguise
            </button>
          </div>
        </div>

        <div className="pt-3 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px] max-w-xs">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Secret Calculator Unlock Code
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={disguiseCodeInput}
              onChange={(e) => setDisguiseCodeInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
              className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleSaveDisguiseCode()}
            className="min-h-[42px] px-4 rounded-xl bg-slate-900 dark:bg-slate-800 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
          >
            Save Code
          </button>
        </div>
        {disguiseSavedMsg && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">{disguiseSavedMsg}</p>
        )}
      </section>

      {/* 5. Dedicated Ads Section Shortcut */}
      <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Dedicated Ads Section
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              All ads stay isolated inside the Ads tab. Status:{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {config.adsSettings.sponsoredTips && config.adsSettings.sponsorFrequency !== 'off'
                  ? 'Ready'
                  : 'Off (Ad-Free)'}
              </strong>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              void handleAdsUpdate({
                sponsoredTips:
                  !(config.adsSettings.sponsoredTips && config.adsSettings.sponsorFrequency !== 'off'),
                sponsorFrequency:
                  config.adsSettings.sponsoredTips && config.adsSettings.sponsorFrequency !== 'off'
                    ? 'off'
                    : 'balanced',
              })
            }
            className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            {config.adsSettings.sponsoredTips && config.adsSettings.sponsorFrequency !== 'off'
              ? 'Switch to Ad-Free'
              : 'Enable Ads'}
          </button>

          {onOpenAdsSection && (
            <button
              type="button"
              onClick={onOpenAdsSection}
              className="min-h-[40px] px-4 rounded-xl bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
            >
              Open Ads Section
            </button>
          )}
        </div>
      </section>

      {/* 6. PWA & Data Management */}
      <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          Offline PWA &amp; Vault Storage
        </h2>
        <PWAInstallButton variant="full" />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void onExportEncryptedBackup()}
            className="min-h-[40px] flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export Vault Backup (JSON)</span>
          </button>

          {!isGuestMode && (
            !confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="min-h-[40px] flex items-center gap-2 rounded-xl border border-rose-200 dark:border-rose-900/50 px-3.5 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Wipe Local IndexedDB Vault</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" /> Confirm local wipe?
                </span>
                <button
                  type="button"
                  onClick={() => void onResetVault()}
                  className="min-h-[36px] px-3 rounded-lg bg-rose-600 text-xs font-semibold text-white hover:bg-rose-500 cursor-pointer"
                >
                  Yes, Wipe
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )
          )}
        </div>
      </section>
    </div>
  );
};
