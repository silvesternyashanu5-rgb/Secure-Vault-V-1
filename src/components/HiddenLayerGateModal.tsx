import React, { useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck, X } from 'lucide-react';
import {
  deriveKeyFromSecret,
  generateMasterVaultKey,
  generateRandomId,
  generateSalt,
  hashAuthSecret,
  unwrapMasterKey,
  wrapMasterKey,
} from '../lib/crypto';
import {
  addIntruderAttempt,
  saveHiddenVaultConfig,
} from '../lib/indexedDb';
import { captureIntruderSnapshot } from '../lib/intruderCapture';
import type { HiddenLayerMode, HiddenVaultConfig } from '../types/hiddenVault';

interface HiddenLayerGateModalProps {
  isOpen: boolean;
  hiddenConfig: HiddenVaultConfig;
  onClose: () => void;
  onConfigUpdated: (next: HiddenVaultConfig) => void;
  onUnlocked: (mode: HiddenLayerMode, masterKey: CryptoKey | null) => void;
}

export const HiddenLayerGateModal: React.FC<HiddenLayerGateModalProps> = ({
  isOpen,
  hiddenConfig,
  onClose,
  onConfigUpdated,
  onUnlocked,
}) => {
  const [masterPw, setMasterPw] = useState('');
  const [fakePw, setFakePw] = useState('');
  const [entryPw, setEntryPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const handleFirstTimeSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (masterPw.length < 4) {
      setError('Master password must be at least 4 characters.');
      return;
    }
    if (fakePw.length < 4) {
      setError('Fake (decoy) password must be at least 4 characters.');
      return;
    }
    if (masterPw === fakePw) {
      setError('Fake password must be different from your real Master password.');
      return;
    }

    setBusy(true);
    try {
      const masterSalt = generateSalt(16);
      const fakeSalt = generateSalt(16);
      const vaultSalt = generateSalt(16);

      const masterHash = await hashAuthSecret(masterPw, masterSalt);
      const fakeHash = await hashAuthSecret(fakePw, fakeSalt);

      const masterKey = await generateMasterVaultKey();
      const wrappingKey = await deriveKeyFromSecret(masterPw, vaultSalt);
      const wrapped = await wrapMasterKey(masterKey, wrappingKey);

      const updated: HiddenVaultConfig = {
        ...hiddenConfig,
        isConfigured: true,
        masterPasswordHash: masterHash,
        masterPasswordSalt: masterSalt,
        fakePasswordHash: fakeHash,
        fakePasswordSalt: fakeSalt,
        vaultSalt,
        wrappedKey: wrapped.wrappedKey,
        wrappedKeyIv: wrapped.iv,
        updatedAt: Date.now(),
      };

      await saveHiddenVaultConfig(updated);
      onConfigUpdated(updated);
      setMasterPw('');
      setFakePw('');
      onUnlocked('real', masterKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize hidden layer.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryPw) {
      setError('Enter password.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const candidateMaster = await hashAuthSecret(
        entryPw,
        hiddenConfig.masterPasswordSalt
      );
      if (candidateMaster === hiddenConfig.masterPasswordHash) {
        const wrappingKey = await deriveKeyFromSecret(entryPw, hiddenConfig.vaultSalt);
        const masterKey = await unwrapMasterKey(
          hiddenConfig.wrappedKey,
          hiddenConfig.wrappedKeyIv,
          wrappingKey
        );
        setEntryPw('');
        onUnlocked('real', masterKey);
        return;
      }

      const candidateFake = await hashAuthSecret(
        entryPw,
        hiddenConfig.fakePasswordSalt
      );
      if (candidateFake === hiddenConfig.fakePasswordHash) {
        setEntryPw('');
        // Decoy layer opens completely empty with zero access to real hidden items
        onUnlocked('decoy', null);
        return;
      }

      // Failed attempt: silently capture camera snapshot + record timestamp & input
      const capture = await captureIntruderSnapshot();
      await addIntruderAttempt({
        id: `intr_${generateRandomId()}`,
        timestamp: Date.now(),
        attemptedInput: entryPw,
        cameraStatus: capture.cameraStatus,
        photoDataUrl: capture.photoDataUrl,
      });

      setEntryPw('');
      setError('Incorrect password. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white flex items-center justify-center">
              {hiddenConfig.isConfigured ? (
                <Lock className="w-4 h-4" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {hiddenConfig.isConfigured
                  ? 'Vault Layer Access'
                  : 'Configure Hidden Vault Layer'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {hiddenConfig.isConfigured
                  ? 'Enter Master Password or Decoy Password'
                  : 'Set your real Master Password and a Fake Decoy Password'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!hiddenConfig.isConfigured ? (
          <form onSubmit={handleFirstTimeSetup} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Real Master Password (opens real hidden layer)
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  value={masterPw}
                  onChange={(e) => setMasterPw(e.target.value)}
                  placeholder="Minimum 4 characters"
                  className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 pr-10 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label="Toggle visibility"
                  className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 cursor-pointer"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Fake Decoy Password (opens empty layer with nothing inside)
              </label>
              <input
                type={showPw ? 'text' : 'password'}
                required
                value={fakePw}
                onChange={(e) => setFakePw(e.target.value)}
                placeholder="Must differ from Master Password"
                className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {error && (
              <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {busy ? 'Creating Encrypted Layer...' : 'Create & Open Hidden Layer'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyUnlock} className="space-y-4">
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                autoFocus
                value={entryPw}
                onChange={(e) => {
                  setError('');
                  setEntryPw(e.target.value);
                }}
                placeholder="Enter layer password"
                className="w-full min-h-[46px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 pr-11 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label="Toggle visibility"
                className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 cursor-pointer"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {busy ? 'Verifying...' : 'Open Layer'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
