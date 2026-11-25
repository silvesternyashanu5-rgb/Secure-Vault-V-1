export type VaultCategory = 'credential' | 'note' | 'card' | 'document';

export type ThemeMode = 'system' | 'light' | 'dark';

export type AuthMode = 'pin' | 'password';

export type SponsorFrequency = 'off' | 'minimal' | 'balanced';

export type AppIconPresetId =
  | 'shield'
  | 'calculator'
  | 'notes'
  | 'weather'
  | 'calendar'
  | 'music'
  | 'compass'
  | 'clock'
  | 'custom';

export interface AdsSettings {
  personalizedAds: boolean;
  sponsoredTips: boolean;
  sponsorFrequency: SponsorFrequency;
  adId: string;
}

export interface VaultItemDecrypted {
  id: string;
  title: string;
  category: VaultCategory;
  username: string;
  url: string;
  secretValue: string;
  notes: string;
  favorite: boolean;
  deleted: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface VaultItemStored {
  id: string;
  title: string;
  category: VaultCategory;
  username: string;
  url: string;
  encryptedPayload: string;
  iv: string;
  favorite: boolean;
  deleted: boolean;
  clientUpdatedAt: number;
  createdAt: number;
}

export interface VaultConfig {
  id: 'config';
  isInitialized: boolean;
  authMode: AuthMode;
  pinHash: string;
  pinSalt: string;
  vaultSalt: string;
  wrappedVaultKey: string;
  wrappedVaultKeyIv: string;
  biometricEnabled: boolean;
  biometricMode: 'webauthn' | 'device-passkey';
  biometricCredentialId: string;
  biometricWrappedKey: string;
  biometricWrappedKeyIv: string;
  biometricWrapSecret: string;
  calculatorDisguiseEnabled: boolean;
  calculatorSecretCode: string;
  autoLockMinutes: number;
  darkMode: ThemeMode;
  appDisplayName: string;
  appIconPreset: AppIconPresetId;
  customAppIconDataUrl: string;
  adsSettings: AdsSettings;
  autoUpdateEnabled: boolean;
  cloudSyncEnabled: boolean;
  lastSyncedAt: number | null;
  clientUpdatedAt: number;
}

export interface SyncQueueEntry {
  id: string;
  operation: 'upsert' | 'delete';
  timestamp: number;
}

export interface GuestRoomRecord {
  guestNumber: number;
  label: string;
  items: VaultItemDecrypted[];
  deleted?: boolean;
  createdAt: number;
  updatedAt: number;
}
