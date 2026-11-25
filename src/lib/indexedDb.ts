import type {
  HiddenFileRecord,
  HiddenSection,
  HiddenVaultConfig,
  IntruderAttemptRecord,
} from '../types/hiddenVault';
import type {
  GuestRoomRecord,
  SyncQueueEntry,
  VaultConfig,
  VaultItemStored,
} from '../types/vault';
import { generateSalt } from './crypto';

const DB_NAME = 'securevault-db';
const DB_VERSION = 4;

const STORES = {
  ITEMS: 'vault_items',
  META: 'vault_meta',
  QUEUE: 'sync_queue',
  HIDDEN_FILES: 'hidden_files',
  HIDDEN_META: 'hidden_meta',
  INTRUDER_LOGS: 'intruder_logs',
  GUEST_ROOMS: 'guest_rooms',
  GUEST_SYNC_QUEUE: 'guest_sync_queue',
} as const;

export function createDefaultConfig(): VaultConfig {
  return {
    id: 'config',
    isInitialized: false,
    authMode: 'pin',
    pinHash: '',
    pinSalt: '',
    vaultSalt: generateSalt(16),
    wrappedVaultKey: '',
    wrappedVaultKeyIv: '',
    biometricEnabled: false,
    biometricMode: 'webauthn',
    biometricCredentialId: '',
    biometricWrappedKey: '',
    biometricWrappedKeyIv: '',
    biometricWrapSecret: '',
    calculatorDisguiseEnabled: false,
    calculatorSecretCode: '1234',
    autoLockMinutes: 5,
    darkMode: 'system',
    appDisplayName: 'SecureVault',
    appIconPreset: 'shield',
    customAppIconDataUrl: '',
    adsSettings: {
      personalizedAds: false,
      sponsoredTips: true,
      sponsorFrequency: 'minimal',
      adId: `sv_${generateSalt(8).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`,
    },
    autoUpdateEnabled: true,
    cloudSyncEnabled: false,
    lastSyncedAt: null,
    clientUpdatedAt: Date.now(),
  };
}

export function createDefaultHiddenConfig(): HiddenVaultConfig {
  return {
    id: 'hidden_config',
    isConfigured: false,
    masterPasswordHash: '',
    masterPasswordSalt: '',
    fakePasswordHash: '',
    fakePasswordSalt: '',
    vaultSalt: generateSalt(16),
    wrappedKey: '',
    wrappedKeyIv: '',
    permissionsGranted: {
      storage: false,
      camera: false,
      directoryMove: false,
    },
    hiddenAdsSettings: {
      personalizedAds: false,
      sponsoredTips: true,
      sponsorFrequency: 'minimal',
      adId: `hl_${generateSalt(8).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`,
    },
    updatedAt: Date.now(),
  };
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.ITEMS)) {
        const itemsStore = db.createObjectStore(STORES.ITEMS, { keyPath: 'id' });
        itemsStore.createIndex('category', 'category', { unique: false });
        itemsStore.createIndex('clientUpdatedAt', 'clientUpdatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.META)) {
        db.createObjectStore(STORES.META, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.QUEUE)) {
        db.createObjectStore(STORES.QUEUE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.HIDDEN_FILES)) {
        const hiddenStore = db.createObjectStore(STORES.HIDDEN_FILES, { keyPath: 'id' });
        hiddenStore.createIndex('section', 'section', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.HIDDEN_META)) {
        db.createObjectStore(STORES.HIDDEN_META, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.INTRUDER_LOGS)) {
        const intruderStore = db.createObjectStore(STORES.INTRUDER_LOGS, { keyPath: 'id' });
        intruderStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.GUEST_ROOMS)) {
        const guestStore = db.createObjectStore(STORES.GUEST_ROOMS, { keyPath: 'guestNumber' });
        guestStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.GUEST_SYNC_QUEUE)) {
        db.createObjectStore(STORES.GUEST_SYNC_QUEUE, { keyPath: 'guestNumber' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

function runTx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB transaction failed'));
        tx.oncomplete = () => db.close();
      })
  );
}

export async function getVaultConfig(): Promise<VaultConfig> {
  const existing = await runTx<VaultConfig | undefined>(STORES.META, 'readonly', (store) =>
    store.get('config')
  );
  if (existing) {
    return {
      ...createDefaultConfig(),
      ...existing,
      adsSettings: {
        ...createDefaultConfig().adsSettings,
        ...(existing.adsSettings || {}),
      },
    };
  }
  const fresh = createDefaultConfig();
  await saveVaultConfig(fresh);
  return fresh;
}

export async function saveVaultConfig(config: VaultConfig): Promise<void> {
  await runTx(STORES.META, 'readwrite', (store) => store.put(config));
  try {
    localStorage.setItem('securevault_theme', config.darkMode);
    localStorage.setItem(
      'securevault_branding',
      JSON.stringify({
        name: config.appDisplayName || 'SecureVault',
        preset: config.appIconPreset || 'shield',
        customIcon: config.customAppIconDataUrl || '',
      })
    );
  } catch {
    // ignore storage restriction
  }
}

export async function getAllStoredItems(): Promise<VaultItemStored[]> {
  const items = await runTx<VaultItemStored[]>(STORES.ITEMS, 'readonly', (store) =>
    store.getAll()
  );
  return items ?? [];
}

export async function getStoredItem(id: string): Promise<VaultItemStored | undefined> {
  return runTx<VaultItemStored | undefined>(STORES.ITEMS, 'readonly', (store) =>
    store.get(id)
  );
}

export async function putStoredItem(item: VaultItemStored): Promise<void> {
  await runTx(STORES.ITEMS, 'readwrite', (store) => store.put(item));
}

export async function bulkPutStoredItems(items: VaultItemStored[]): Promise<void> {
  if (items.length === 0) return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORES.ITEMS, 'readwrite');
    const store = tx.objectStore(STORES.ITEMS);
    for (const item of items) {
      store.put(item);
    }
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Bulk put failed'));
    };
  });
}

export async function enqueueSync(entry: SyncQueueEntry): Promise<void> {
  await runTx(STORES.QUEUE, 'readwrite', (store) => store.put(entry));
}

export async function getSyncQueue(): Promise<SyncQueueEntry[]> {
  const queue = await runTx<SyncQueueEntry[]>(STORES.QUEUE, 'readonly', (store) =>
    store.getAll()
  );
  return queue ?? [];
}

export async function removeFromSyncQueue(id: string): Promise<void> {
  await runTx(STORES.QUEUE, 'readwrite', (store) => store.delete(id));
}

export async function clearSyncQueue(): Promise<void> {
  await runTx(STORES.QUEUE, 'readwrite', (store) => store.clear());
}

export async function clearAllLocalVaultData(): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(
      [
        STORES.ITEMS,
        STORES.META,
        STORES.QUEUE,
        STORES.HIDDEN_FILES,
        STORES.HIDDEN_META,
        STORES.INTRUDER_LOGS,
        STORES.GUEST_ROOMS,
        STORES.GUEST_SYNC_QUEUE,
      ],
      'readwrite'
    );
    tx.objectStore(STORES.ITEMS).clear();
    tx.objectStore(STORES.META).clear();
    tx.objectStore(STORES.QUEUE).clear();
    tx.objectStore(STORES.HIDDEN_FILES).clear();
    tx.objectStore(STORES.HIDDEN_META).clear();
    tx.objectStore(STORES.INTRUDER_LOGS).clear();
    tx.objectStore(STORES.GUEST_ROOMS).clear();
    tx.objectStore(STORES.GUEST_SYNC_QUEUE).clear();
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Failed to clear IndexedDB'));
    };
  });
}

/* ---------------- Hidden Media Vault & Intruder Logs ---------------- */

export async function getHiddenVaultConfig(): Promise<HiddenVaultConfig> {
  const existing = await runTx<HiddenVaultConfig | undefined>(
    STORES.HIDDEN_META,
    'readonly',
    (store) => store.get('hidden_config')
  );
  if (existing) {
    const defaults = createDefaultHiddenConfig();
    return {
      ...defaults,
      ...existing,
      permissionsGranted: {
        ...defaults.permissionsGranted,
        ...(existing.permissionsGranted || {}),
      },
      hiddenAdsSettings: {
        ...defaults.hiddenAdsSettings,
        ...(existing.hiddenAdsSettings || {}),
      },
    };
  }
  const fresh = createDefaultHiddenConfig();
  await saveHiddenVaultConfig(fresh);
  return fresh;
}

export async function saveHiddenVaultConfig(config: HiddenVaultConfig): Promise<void> {
  await runTx(STORES.HIDDEN_META, 'readwrite', (store) => store.put(config));
}

export async function getAllHiddenFiles(): Promise<HiddenFileRecord[]> {
  const files = await runTx<HiddenFileRecord[]>(STORES.HIDDEN_FILES, 'readonly', (store) =>
    store.getAll()
  );
  return files ?? [];
}

export async function getHiddenFilesBySection(
  section: HiddenSection
): Promise<HiddenFileRecord[]> {
  const all = await getAllHiddenFiles();
  return all.filter((f) => f.section === section);
}

export async function putHiddenFile(record: HiddenFileRecord): Promise<void> {
  await runTx(STORES.HIDDEN_FILES, 'readwrite', (store) => store.put(record));
}

export async function deleteHiddenFile(id: string): Promise<void> {
  await runTx(STORES.HIDDEN_FILES, 'readwrite', (store) => store.delete(id));
}

export async function getAllIntruderAttempts(): Promise<IntruderAttemptRecord[]> {
  const logs = await runTx<IntruderAttemptRecord[]>(
    STORES.INTRUDER_LOGS,
    'readonly',
    (store) => store.getAll()
  );
  return (logs ?? []).sort((a, b) => b.timestamp - a.timestamp);
}

export async function addIntruderAttempt(record: IntruderAttemptRecord): Promise<void> {
  await runTx(STORES.INTRUDER_LOGS, 'readwrite', (store) => store.put(record));
}

export async function clearIntruderAttempts(): Promise<void> {
  await runTx(STORES.INTRUDER_LOGS, 'readwrite', (store) => store.clear());
}

/* ---------------- Persistent Guest Rooms (Account-Style Switching & Auto-Update Sync) ---------------- */

export async function getAllGuestRoomsRaw(): Promise<GuestRoomRecord[]> {
  const rooms = await runTx<GuestRoomRecord[]>(STORES.GUEST_ROOMS, 'readonly', (store) =>
    store.getAll()
  );
  return (rooms ?? []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getAllGuestRooms(): Promise<GuestRoomRecord[]> {
  const rooms = await getAllGuestRoomsRaw();
  return rooms.filter((r) => !r.deleted);
}

export async function getGuestRoom(guestNumber: number): Promise<GuestRoomRecord | undefined> {
  return runTx<GuestRoomRecord | undefined>(STORES.GUEST_ROOMS, 'readonly', (store) =>
    store.get(guestNumber)
  );
}

export async function saveGuestRoom(room: GuestRoomRecord): Promise<void> {
  await runTx(STORES.GUEST_ROOMS, 'readwrite', (store) => store.put(room));
}

export async function deleteGuestRoom(guestNumber: number): Promise<void> {
  const existing = await getGuestRoom(guestNumber);
  if (existing) {
    await saveGuestRoom({
      ...existing,
      items: [],
      deleted: true,
      updatedAt: Date.now(),
    });
    return;
  }
  await runTx(STORES.GUEST_ROOMS, 'readwrite', (store) => store.delete(guestNumber));
}

export async function enqueueGuestRoomSync(guestNumber: number): Promise<void> {
  await runTx(STORES.GUEST_SYNC_QUEUE, 'readwrite', (store) =>
    store.put({ guestNumber, timestamp: Date.now() })
  );
}

export async function getGuestRoomSyncQueue(): Promise<{ guestNumber: number; timestamp: number }[]> {
  const q = await runTx<{ guestNumber: number; timestamp: number }[]>(
    STORES.GUEST_SYNC_QUEUE,
    'readonly',
    (store) => store.getAll()
  );
  return q ?? [];
}

export async function removeGuestRoomFromSyncQueue(guestNumber: number): Promise<void> {
  await runTx(STORES.GUEST_SYNC_QUEUE, 'readwrite', (store) => store.delete(guestNumber));
}

export async function clearGuestRoomSyncQueue(): Promise<void> {
  await runTx(STORES.GUEST_SYNC_QUEUE, 'readwrite', (store) => store.clear());
}
