import React, { useEffect, useState } from 'react';
import {
  Calculator,
  Cloud,
  Delete,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Lock,
  Moon,
  Plus,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { AutoUpdateController } from '../hooks/useAutoUpdateSystem';
import type { AuthMode, GuestRoomRecord, ThemeMode, VaultConfig } from '../types/vault';
import { AppBrandIcon } from './AppBrandIcon';
import { PWAInstallButton } from './PWAInstallButton';

interface SetupLockScreenProps {
  config: VaultConfig;
  isLoading: boolean;
  cloudUser: User | null;
  guestRooms: GuestRoomRecord[];
  pendingGuestNumber: number;
  cloudRestoreRequired: boolean;
  autoUpdate: AutoUpdateController;
  onInitializeVault: (params: {
    authMode: AuthMode;
    secret: string;
    seedSample: boolean;
  }) => Promise<void>;
  onUnlockWithSecret: (secret: string) => Promise<boolean>;
  onUnlockWithBiometrics: () => Promise<boolean>;
  onSignInCloudFromLogin: () => Promise<void>;
  onEnterAsGuest: (guestNumber: number) => Promise<void>;
  onDeleteGuestRoom: (guestNumber: number) => Promise<void>;
  onSwitchToDisguise: () => void;
  onToggleTheme: () => void;
  darkMode: ThemeMode;
}

export const SetupLockScreen: React.FC<SetupLockScreenProps> = ({
  config,
  isLoading,
  cloudUser,
  guestRooms,
  pendingGuestNumber,
  cloudRestoreRequired,
  autoUpdate,
  onInitializeVault,
  onUnlockWithSecret,
  onUnlockWithBiometrics,
  onSignInCloudFromLogin,
  onEnterAsGuest,
  onDeleteGuestRoom,
  onSwitchToDisguise,
  onToggleTheme,
  darkMode,
}) => {
  const [setupAuthMode, setSetupAuthMode] = useState<AuthMode>('pin');
  const [secretInput, setSecretInput] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [seedSample, setSeedSample] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cloudSigningIn, setCloudSigningIn] = useState(false);

  const isCurrentlyDark =
    darkMode === 'dark' ||
    (darkMode === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const activeMode = config.isInitialized ? config.authMode : setupAuthMode;

  const handlePinKey = (digit: string) => {
    setError('');
    if (secretInput.length < 8) {
      setSecretInput((prev) => prev + digit);
    }
  };

  const handlePinBackspace = () => {
    setError('');
    setSecretInput((prev) => prev.slice(0, -1));
  };

  const handleUnlockSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!secretInput) {
      setError(
        config.authMode === 'pin' ? 'Enter your vault PIN.' : 'Enter your master password.'
      );
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const ok = await onUnlockWithSecret(secretInput);
      if (!ok) {
        setError(
          config.authMode === 'pin'
            ? 'Incorrect PIN. Try again.'
            : 'Incorrect master password. Try again.'
        );
        setSecretInput('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (setupAuthMode === 'pin') {
      if (!/^\d{4,8}$/.test(secretInput)) {
        setError('PIN must be 4 to 8 digits.');
        return;
      }
    } else if (secretInput.length < 6) {
      setError('Master password must be at least 6 characters.');
      return;
    }

    if (secretInput !== confirmInput) {
      setError('Confirmation does not match.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await onInitializeVault({
        authMode: setupAuthMode,
        secret: secretInput,
        seedSample,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize vault.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickStart = async () => {
    setSubmitting(true);
    setError('');
    try {
      await onInitializeVault({
        authMode: 'pin',
        secret: '1234',
        seedSample: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize quick vault.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBiometric = async () => {
    setSubmitting(true);
    setError('');
    try {
      const ok = await onUnlockWithBiometrics();
      if (!ok) {
        setError('Biometric verification cancelled or failed.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Biometric authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloudSignIn = async () => {
    setCloudSigningIn(true);
    setError('');
    try {
      await onSignInCloudFromLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setCloudSigningIn(false);
    }
  };

  const handleGuestStart = async () => {
    setSubmitting(true);
    setError('');
    try {
      await onEnterAsGuest(pendingGuestNumber);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!config.isInitialized || config.authMode !== 'pin') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handlePinKey(e.key);
      } else if (e.key === 'Backspace') {
        handlePinBackspace();
      } else if (e.key === 'Enter') {
        void handleUnlockSubmit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const displayAppName = config.appDisplayName?.trim() || 'SecureVault';

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <AppBrandIcon
            preset={config.appIconPreset}
            customIconDataUrl={config.customAppIconDataUrl}
            size="lg"
          />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Loading {displayAppName}...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="h-16 px-4 sm:px-8 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <AppBrandIcon
            preset={config.appIconPreset}
            customIconDataUrl={config.customAppIconDataUrl}
            size="sm"
          />
          <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap shrink-0">
            {displayAppName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <PWAInstallButton variant="compact" />
          {config.isInitialized && config.calculatorDisguiseEnabled && (
            <button
              type="button"
              onClick={onSwitchToDisguise}
              className="min-h-[40px] flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>Calculator</span>
            </button>
          )}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle color theme"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {isCurrentlyDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Context & Guest Access Column */}
          <section className="lg:col-span-6 rounded-3xl bg-slate-900 border border-slate-800 p-7 sm:p-8 text-white flex flex-col justify-between gap-6">
            <div>
              <p className="text-xs font-medium text-emerald-400">
                Zero-Knowledge Local Storage · Cloud Sync
              </p>
              <h1 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight leading-tight [text-wrap:balance]">
                {cloudRestoreRequired
                  ? 'Cloud vault found. Unlock to restore.'
                  : config.isInitialized
                    ? 'Your private vault is locked.'
                    : 'Encrypt credentials locally, sync everywhere.'}
              </h1>
              <p className="mt-4 text-sm text-slate-300 leading-relaxed max-w-md">
                {cloudRestoreRequired
                  ? `Signed in as ${cloudUser?.email || 'your account'}. Enter your existing vault PIN or master password to decrypt your synced items onto this device.`
                  : config.isInitialized
                    ? 'Secrets stay AES-256-GCM encrypted in IndexedDB on this device. Unlock with your PIN, password, biometric passkey, or enter a temporary guest session.'
                    : 'SecureVault encrypts every credential, card, and note inside browser IndexedDB using Web Crypto PBKDF2 + AES-GCM before syncing to your cloud account.'}
              </p>
            </div>

            {/* Cloud Account Sign-In Card on Login */}
            <div className="space-y-4">
              {!cloudUser && (
                <div className="rounded-2xl bg-slate-800/70 border border-slate-700/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Cloud className="w-4 h-4 text-emerald-400" />
                        <span>Sync or Restore Cloud Account</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        Sign in with Google to restore your synced vault across devices.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={cloudSigningIn}
                      onClick={handleCloudSignIn}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white text-slate-900 text-xs font-semibold hover:bg-slate-100 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {cloudSigningIn ? 'Signing in...' : 'Google Sign-In'}
                    </button>
                  </div>
                </div>
              )}

              {/* Persistent Guest Rooms (Account-Style Switching) */}
              <div className="rounded-2xl bg-slate-800/40 border border-slate-700/70 p-4 space-y-3">
                <div>
                  <div className="flex items-center justify-between gap-2 text-sm font-semibold text-white">
                    <div className="flex items-center gap-2">
                      <UserRound className="w-4 h-4 text-amber-400" />
                      <span>Guest Rooms</span>
                    </div>
                    {guestRooms.length > 0 && (
                      <span className="text-[11px] font-mono text-slate-400">
                        {guestRooms.length} saved
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                    Guest rooms stay saved when you leave or switch rooms—connected to the same automatic update system as regular users ({autoUpdate.currentVersion}).
                  </p>
                </div>

                {guestRooms.length > 0 && (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {guestRooms.map((room) => (
                      <div
                        key={room.guestNumber}
                        className="flex items-center gap-2 rounded-xl bg-slate-800/90 border border-slate-700/80 px-3 py-2"
                      >
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => void onEnterAsGuest(room.guestNumber)}
                          className="flex-1 text-left flex items-center justify-between gap-2 text-xs text-slate-100 hover:text-emerald-300 transition-colors cursor-pointer"
                        >
                          <span className="font-semibold tabular-nums">
                            {room.label}
                          </span>
                          <span className="font-mono text-[11px] text-slate-400">
                            {room.items.length} item{room.items.length === 1 ? '' : 's'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeleteGuestRoom(room.guestNumber)}
                          aria-label={`Delete ${room.label}`}
                          title="Delete saved guest room"
                          className="p-1 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleGuestStart}
                  className="w-full min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-600 bg-slate-800/80 hover:bg-slate-700/80 text-xs font-semibold text-slate-100 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="tabular-nums">
                    Open New Guest Room (#{pendingGuestNumber})
                  </span>
                </button>
              </div>
            </div>
          </section>

          {/* Right Vault Unlock / Creation Card */}
          <section className="lg:col-span-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm flex flex-col justify-center">
            {!config.isInitialized ? (
              <form onSubmit={handleSetupSubmit} className="space-y-5">
                <div>
                  <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                    Create Your Vault Key
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Choose a numeric PIN or alphanumeric master password.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setSetupAuthMode('pin');
                      setSecretInput('');
                      setConfirmInput('');
                      setError('');
                    }}
                    className={`min-h-[40px] rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      setupAuthMode === 'pin'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    PIN Code (4–8 Digits)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSetupAuthMode('password');
                      setSecretInput('');
                      setConfirmInput('');
                      setError('');
                    }}
                    className={`min-h-[40px] rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      setupAuthMode === 'password'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Master Password
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {setupAuthMode === 'pin' ? 'New PIN' : 'Master Password'}
                  </label>
                  <div className="relative">
                    <input
                      type={showSecret ? 'text' : 'password'}
                      inputMode={setupAuthMode === 'pin' ? 'numeric' : 'text'}
                      value={secretInput}
                      onChange={(e) => {
                        const val =
                          setupAuthMode === 'pin'
                            ? e.target.value.replace(/\D/g, '').slice(0, 8)
                            : e.target.value;
                        setSecretInput(val);
                      }}
                      placeholder={
                        setupAuthMode === 'pin' ? 'Enter 4–8 digits' : 'Minimum 6 characters'
                      }
                      className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 pr-11 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((v) => !v)}
                      aria-label="Toggle visibility"
                      className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Confirm {setupAuthMode === 'pin' ? 'PIN' : 'Password'}
                  </label>
                  <input
                    type={showSecret ? 'text' : 'password'}
                    inputMode={setupAuthMode === 'pin' ? 'numeric' : 'text'}
                    value={confirmInput}
                    onChange={(e) => {
                      const val =
                        setupAuthMode === 'pin'
                          ? e.target.value.replace(/\D/g, '').slice(0, 8)
                          : e.target.value;
                      setConfirmInput(val);
                    }}
                    placeholder="Re-enter to confirm"
                    className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <label className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={seedSample}
                    onChange={(e) => setSeedSample(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Include sample encrypted vault items for exploration</span>
                </label>

                {error && (
                  <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                    {error}
                  </p>
                )}

                <div className="space-y-2.5 pt-1">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60 transition-colors cursor-pointer"
                  >
                    {submitting ? 'Deriving Key & Encrypting...' : 'Create Encrypted Vault'}
                  </button>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleQuickStart}
                    className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Quick Start Demo Vault (PIN: 1234)
                  </button>
                </div>
              </form>
            ) : activeMode === 'pin' ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                      {cloudRestoreRequired ? 'Enter Cloud Vault PIN' : 'Enter PIN'}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {cloudRestoreRequired
                        ? 'Unwrap your synced encryption key'
                        : 'Unlock local encrypted vault'}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                    <Lock className="w-4 h-4" />
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 py-4 px-4 flex items-center justify-center gap-3 min-h-[56px]">
                  {secretInput.length === 0 ? (
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      Tap digits or type on keyboard
                    </span>
                  ) : (
                    Array.from({ length: secretInput.length }).map((_, i) => (
                      <span
                        key={i}
                        className="w-3 h-3 rounded-full bg-emerald-600 dark:bg-emerald-400"
                      />
                    ))
                  )}
                </div>

                {error && (
                  <p
                    role="alert"
                    className="text-center text-xs font-medium text-rose-600 dark:text-rose-400"
                  >
                    {error}
                  </p>
                )}

                <div className="grid grid-cols-3 gap-2.5">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => handlePinKey(d)}
                      className="min-h-[52px] rounded-2xl bg-slate-100 dark:bg-slate-800/70 text-slate-900 dark:text-white font-mono text-lg font-semibold hover:bg-slate-200/80 dark:hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer"
                    >
                      {d}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={handlePinBackspace}
                    aria-label="Backspace"
                    className="min-h-[52px] rounded-2xl bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 flex items-center justify-center hover:bg-slate-200/80 dark:hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer"
                  >
                    <Delete className="w-5 h-5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePinKey('0')}
                    className="min-h-[52px] rounded-2xl bg-slate-100 dark:bg-slate-800/70 text-slate-900 dark:text-white font-mono text-lg font-semibold hover:bg-slate-200/80 dark:hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer"
                  >
                    0
                  </button>

                  <button
                    type="button"
                    disabled={submitting || !secretInput}
                    onClick={() => void handleUnlockSubmit()}
                    className="min-h-[52px] rounded-2xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50 active:scale-[0.98] transition cursor-pointer"
                  >
                    {submitting ? '...' : 'Unlock'}
                  </button>
                </div>

                {config.biometricEnabled && !cloudRestoreRequired && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleBiometric}
                    className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Fingerprint className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Unlock with Biometrics</span>
                  </button>
                )}
              </div>
            ) : (
              <form onSubmit={handleUnlockSubmit} className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                      Master Password
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {cloudRestoreRequired
                        ? 'Unwrap your synced cloud encryption key'
                        : 'Decrypt local vault storage'}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                    <KeyRound className="w-4 h-4" />
                  </div>
                </div>

                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    autoFocus
                    value={secretInput}
                    onChange={(e) => {
                      setError('');
                      setSecretInput(e.target.value);
                    }}
                    placeholder="Enter master password"
                    className="w-full min-h-[46px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 pr-11 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    aria-label="Toggle password visibility"
                    className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {error && (
                  <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {submitting ? 'Decrypting...' : 'Unlock Vault'}
                </button>

                {config.biometricEnabled && !cloudRestoreRequired && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleBiometric}
                    className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Fingerprint className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Unlock with Biometrics</span>
                  </button>
                )}
              </form>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};
