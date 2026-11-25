import type { AdsSettings } from './vault';

export type HiddenSection = 'apps' | 'music' | 'documents' | 'videos';

export type HiddenLayerMode = 'real' | 'decoy';

export interface HiddenFileRecord {
  id: string;
  section: HiddenSection;
  name: string;
  mimeType: string;
  extension: string;
  size: number;
  /** For hidden phone apps / deep-link launchers inside the Apps layer */
  appUrl?: string;
  packageId?: string;
  appScheme?: string;
  /** True if the original file was deleted from a user-selected directory after moving */
  movedFromSource: boolean;
  encryptedData: ArrayBuffer;
  iv: string;
  createdAt: number;
}

export interface HiddenFileDecrypted {
  id: string;
  section: HiddenSection;
  name: string;
  mimeType: string;
  extension: string;
  size: number;
  appUrl?: string;
  packageId?: string;
  appScheme?: string;
  movedFromSource: boolean;
  data: ArrayBuffer;
  createdAt: number;
}

export interface HiddenVaultConfig {
  id: 'hidden_config';
  isConfigured: boolean;
  masterPasswordHash: string;
  masterPasswordSalt: string;
  fakePasswordHash: string;
  fakePasswordSalt: string;
  vaultSalt: string;
  wrappedKey: string;
  wrappedKeyIv: string;
  permissionsGranted: {
    storage: boolean;
    camera: boolean;
    directoryMove: boolean;
  };
  hiddenAdsSettings: AdsSettings;
  updatedAt: number;
}

export interface IntruderAttemptRecord {
  id: string;
  timestamp: number;
  attemptedInput: string;
  cameraStatus: 'captured' | 'denied' | 'unavailable';
  photoDataUrl?: string;
}
