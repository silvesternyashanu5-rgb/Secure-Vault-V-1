import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { AutoUpdateBanner } from './components/AutoUpdateBanner';
import { CalculatorDisguise } from './components/CalculatorDisguise';
import { ConflictResolutionModal } from './components/ConflictResolutionModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HiddenLayerGateModal } from './components/HiddenLayerGateModal';
import { HiddenVaultLayer } from './components/HiddenVaultLayer';
import { OfflineIndicator } from './components/OfflineIndicator';
import { SetupLockScreen } from './components/SetupLockScreen';
import { VaultDashboard } from './components/VaultDashboard';
import { useAutoUpdateSystem } from './hooks/useAutoUpdateSystem';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  broadcastConfigSync,
  broadcastGuestRoomsSync,
  broadcastVaultItemsSync,
  subscribeLiveBus,
} from './lib/autoUpdater';
import {
  enrollBiometricCredential,
  verifyBiometricCredential,
} from './lib/biometrics';
import { applyAppBrandingToDocument } from './lib/appBranding';
import {
  decryptVaultPayload,
  deriveKeyFromSecret,
  encryptVaultPayload,
  generateMasterVaultKey,
  generateRandomId,
  generateSalt,
  hashAuthSecret,
  unwrapMasterKey,
  wrapMasterKey,
} from './lib/crypto';
import {
  auth,
  isTransientOfflineError,
  pushGuestRoomToCloud,
  pushSettingsToCloud,
  pushVaultItemToCloud,
  signInWithGoogle,
  signOutGoogle,
  subscribeToCloudGuestRooms,
  subscribeToCloudVault,
  testConnection,
  type CloudSettingsRemote,
} from './lib/firebase';
import {
  bulkPutStoredItems,
  clearAllLocalVaultData,
  clearGuestRoomSyncQueue,
  clearSyncQueue,
  createDefaultConfig,
  createDefaultHiddenConfig,
  deleteGuestRoom,
  enqueueGuestRoomSync,
  enqueueSync,
  getAllGuestRooms,
  getAllGuestRoomsRaw,
  getAllStoredItems,
  getGuestRoom,
  getGuestRoomSyncQueue,
  getHiddenVaultConfig,
  getSyncQueue,
  getVaultConfig,
  putStoredItem,
  removeFromSyncQueue,
  removeGuestRoomFromSyncQueue,
  saveGuestRoom,
  saveVaultConfig,
} from './lib/indexedDb';
import { buildStarterVaultItems } from './lib/sampleVault';
import {
  reconcileVaultItems,
  type ConflictPolicy,
  type SyncConflict,
} from './lib/syncEngine';
import type { HiddenLayerMode, HiddenVaultConfig } from './types/hiddenVault';
import type {
  AuthMode,
  GuestRoomRecord,
  VaultCategory,
  VaultConfig,
  VaultItemDecrypted,
  VaultItemStored,
} from './types/vault';

function generateGuestNumber(): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return 1000 + (arr[0] % 9000);
}

function VaultAppShell() {
  const [config, setConfig] = useState<VaultConfig>(createDefaultConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showDisguise, setShowDisguise] = useState(false);

  // Persistent Guest Rooms (kept intact when leaving or switching rooms like accounts)
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [guestNumber, setGuestNumber] = useState<number | null>(null);
  const [guestRooms, setGuestRooms] = useState<GuestRoomRecord[]>([]);
  const [pendingGuestNumber, setPendingGuestNumber] = useState<number>(() =>
    generateGuestNumber()
  );

  // Decrypted items in active memory
  const [items, setItems] = useState<VaultItemDecrypted[]>([]);
  const masterKeyRef = useRef<CryptoKey | null>(null);

  // Cloud sync state
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudRestoreRequired, setCloudRestoreRequired] = useState(false);
  const [remoteItemsCache, setRemoteItemsCache] = useState<VaultItemStored[]>([]);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy>('latest-wins');
  const [runtimeError, setRuntimeError] = useState<Error | null>(null);

  // Hidden Media Vault layer state (triggered via top-bar logo press)
  const [hiddenConfig, setHiddenConfig] = useState<HiddenVaultConfig>(
    createDefaultHiddenConfig
  );
  const [hiddenGateOpen, setHiddenGateOpen] = useState(false);
  const [hiddenLayerOpen, setHiddenLayerOpen] = useState(false);
  const [hiddenLayerMode, setHiddenLayerMode] = useState<HiddenLayerMode>('real');
  const hiddenMasterKeyRef = useRef<CryptoKey | null>(null);

  const configRef = useRef(config);
  configRef.current = config;
  const isUnlockedRef = useRef(isUnlocked);
  isUnlockedRef.current = isUnlocked;
  const isGuestModeRef = useRef(isGuestMode);
  isGuestModeRef.current = isGuestMode;

  const isOnline = useOnlineStatus();
  const guestNumberRef = useRef(guestNumber);
  guestNumberRef.current = guestNumber;

  if (runtimeError) {
    throw runtimeError;
  }

  // Apply Tailwind v4 `.dark` class cleanly to <html>
  useEffect(() => {
    const applyTheme = () => {
      const dark =
        config.darkMode === 'dark' ||
        (config.darkMode === 'system' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
    };

    applyTheme();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [config.darkMode]);

  // Apply customizable app name, favicon, and dynamic PWA manifest
  useEffect(() => {
    void applyAppBrandingToDocument({
      appDisplayName: config.appDisplayName,
      appIconPreset: config.appIconPreset,
      customAppIconDataUrl: config.customAppIconDataUrl,
    });
  }, [config.appDisplayName, config.appIconPreset, config.customAppIconDataUrl]);

  // Initial IndexedDB hydration + non-blocking Firebase connectivity check
  useEffect(() => {
    let mounted = true;
    void testConnection();
    (async () => {
      try {
        const storedConfig = await getVaultConfig();
        const storedHidden = await getHiddenVaultConfig();
        const queue = await getSyncQueue();
        const storedRooms = await getAllGuestRooms();
        if (!mounted) return;
        setConfig(storedConfig);
        setHiddenConfig(storedHidden);
        setPendingSyncCount(queue.length);
        setGuestRooms(storedRooms);
        if (storedConfig.isInitialized && storedConfig.calculatorDisguiseEnabled) {
          setShowDisguise(true);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Decrypt all IndexedDB items using active masterKey
  const decryptStoredList = useCallback(
    async (storedList: VaultItemStored[], key: CryptoKey): Promise<VaultItemDecrypted[]> => {
      const decrypted: VaultItemDecrypted[] = [];
      for (const s of storedList) {
        try {
          const payload = await decryptVaultPayload(key, s.encryptedPayload, s.iv);
          decrypted.push({
            id: s.id,
            title: s.title,
            category: s.category,
            username: s.username,
            url: s.url,
            secretValue: payload.secretValue,
            notes: payload.notes,
            favorite: s.favorite,
            deleted: s.deleted,
            createdAt: s.createdAt,
            updatedAt: s.clientUpdatedAt,
          });
        } catch {
          // Skip items encrypted under a mismatched legacy key
        }
      }
      return decrypted;
    },
    []
  );

  // Flush offline queue and merge with cloud items
  const reconcileAndSync = useCallback(
    async (user: User, remoteItems: VaultItemStored[], activeConfig: VaultConfig) => {
      if (isGuestMode) return;
      setIsSyncing(true);
      try {
        const localItems = await getAllStoredItems();
        const result = await reconcileVaultItems({
          localItems,
          remoteItems,
          policy: conflictPolicy,
        });

        if (result.toSaveLocally.length > 0) {
          await bulkPutStoredItems(result.toSaveLocally);
        }

        let hadOfflinePush = false;
        for (const itemToPush of result.toPushToCloud) {
          if (navigator.onLine) {
            try {
              await pushVaultItemToCloud(user, itemToPush);
              await removeFromSyncQueue(itemToPush.id);
            } catch (pushErr) {
              if (isTransientOfflineError(pushErr)) {
                hadOfflinePush = true;
                await enqueueSync({
                  id: itemToPush.id,
                  operation: itemToPush.deleted ? 'delete' : 'upsert',
                  timestamp: Date.now(),
                });
              } else {
                throw pushErr;
              }
            }
          } else {
            hadOfflinePush = true;
            await enqueueSync({
              id: itemToPush.id,
              operation: itemToPush.deleted ? 'delete' : 'upsert',
              timestamp: Date.now(),
            });
          }
        }

        const queue = await getSyncQueue();
        setPendingSyncCount(queue.length);
        setConflicts(result.conflicts);

        if (masterKeyRef.current) {
          const freshDecrypted = await decryptStoredList(result.merged, masterKeyRef.current);
          setItems(freshDecrypted);
        }

        if (!hadOfflinePush) {
          const updatedConfig: VaultConfig = {
            ...activeConfig,
            cloudSyncEnabled: true,
            lastSyncedAt: Date.now(),
          };
          setConfig(updatedConfig);
          await saveVaultConfig(updatedConfig);
        }
      } catch (err) {
        if (!isTransientOfflineError(err)) {
          setRuntimeError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        setIsSyncing(false);
      }
    },
    [conflictPolicy, decryptStoredList, isGuestMode]
  );

  const reconcileAndSyncRef = useRef(reconcileAndSync);
  reconcileAndSyncRef.current = reconcileAndSync;

  // Merge cloud Guest Rooms into local IndexedDB (latest updatedAt wins)
  const mergeRemoteGuestRooms = useCallback(async (remoteRooms: GuestRoomRecord[]) => {
    const localRaw = await getAllGuestRoomsRaw();
    const localMap = new Map(localRaw.map((r) => [r.guestNumber, r]));
    let changed = false;

    for (const remote of remoteRooms) {
      const local = localMap.get(remote.guestNumber);
      if (!local || remote.updatedAt > local.updatedAt) {
        await saveGuestRoom(remote);
        changed = true;
      }
    }

    if (changed) {
      const freshRooms = await getAllGuestRooms();
      setGuestRooms(freshRooms);
      if (isGuestModeRef.current && guestNumberRef.current !== null) {
        const active = freshRooms.find((r) => r.guestNumber === guestNumberRef.current);
        if (active) {
          setItems(active.items);
        }
      }
      broadcastGuestRoomsSync(guestNumberRef.current);
    }
  }, []);

  const mergeRemoteGuestRoomsRef = useRef(mergeRemoteGuestRooms);
  mergeRemoteGuestRoomsRef.current = mergeRemoteGuestRooms;

  // Firebase Auth listener + real-time Firestore subscription (connects both Main Users & Guest Rooms)
  useEffect(() => {
    let unsubFirestore: (() => void) | null = null;
    let unsubGuestRooms: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCloudUser(user);
      if (unsubFirestore) {
        unsubFirestore();
        unsubFirestore = null;
      }
      if (unsubGuestRooms) {
        unsubGuestRooms();
        unsubGuestRooms = null;
      }

      if (!user) {
        setCloudRestoreRequired(false);
        return;
      }

      unsubFirestore = subscribeToCloudVault(
        user.uid,
        (remoteItems) => {
          setRemoteItemsCache(remoteItems);
          const currentConfig = configRef.current;
          if (!isGuestModeRef.current && currentConfig.isInitialized && isUnlockedRef.current) {
            void reconcileAndSyncRef.current(user, remoteItems, currentConfig);
          }
        },
        async (remoteSettings: CloudSettingsRemote) => {
          const localCfg = await getVaultConfig();

          // Fresh device restoration from cloud
          if (!localCfg.isInitialized && remoteSettings.wrappedVaultKey) {
            const restoredCfg: VaultConfig = {
              ...localCfg,
              isInitialized: true,
              authMode: remoteSettings.authMode,
              vaultSalt: remoteSettings.vaultSalt,
              wrappedVaultKey: remoteSettings.wrappedVaultKey,
              wrappedVaultKeyIv: remoteSettings.wrappedVaultKeyIv,
              darkMode: remoteSettings.darkMode,
              calculatorDisguiseEnabled: remoteSettings.calculatorDisguiseEnabled,
              autoUpdateEnabled: remoteSettings.autoUpdateEnabled,
              appDisplayName: remoteSettings.appDisplayName || localCfg.appDisplayName,
              appIconPreset: remoteSettings.appIconPreset || localCfg.appIconPreset,
              autoLockMinutes: remoteSettings.autoLockMinutes,
              adsSettings: remoteSettings.adsSettings,
              cloudSyncEnabled: true,
              clientUpdatedAt: remoteSettings.clientUpdatedAt,
            };
            setConfig(restoredCfg);
            await saveVaultConfig(restoredCfg);
            if (!isGuestModeRef.current) {
              setCloudRestoreRequired(true);
            }
            broadcastConfigSync();
            return;
          }

          // Merge newer remote shared preferences cleanly for BOTH Main Users and Guest Rooms
          if (remoteSettings.clientUpdatedAt > localCfg.clientUpdatedAt) {
            const mergedCfg: VaultConfig = {
              ...localCfg,
              darkMode: remoteSettings.darkMode,
              calculatorDisguiseEnabled: remoteSettings.calculatorDisguiseEnabled,
              autoUpdateEnabled: remoteSettings.autoUpdateEnabled,
              appDisplayName: remoteSettings.appDisplayName || localCfg.appDisplayName,
              appIconPreset: remoteSettings.appIconPreset || localCfg.appIconPreset,
              autoLockMinutes: remoteSettings.autoLockMinutes,
              adsSettings: remoteSettings.adsSettings,
              cloudSyncEnabled: true,
              clientUpdatedAt: remoteSettings.clientUpdatedAt,
            };
            setConfig(mergedCfg);
            await saveVaultConfig(mergedCfg);
            broadcastConfigSync();
          }
        },
        (err) => {
          if (!isTransientOfflineError(err)) {
            setRuntimeError(err);
          }
        }
      );

      unsubGuestRooms = subscribeToCloudGuestRooms(
        user.uid,
        (remoteRooms) => {
          void mergeRemoteGuestRoomsRef.current(remoteRooms);
        },
        (err) => {
          if (!isTransientOfflineError(err)) {
            setRuntimeError(err);
          }
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubFirestore) unsubFirestore();
      if (unsubGuestRooms) unsubGuestRooms();
    };
  }, []);

  // Cross-tab & cross-profile live update listener (connects all Users & Guest Rooms locally)
  useEffect(() => {
    return subscribeLiveBus((event) => {
      if (event.type === 'CONFIG_SYNC') {
        void getVaultConfig().then((freshCfg) => {
          setConfig(freshCfg);
        });
      } else if (event.type === 'GUEST_ROOMS_SYNC') {
        void getAllGuestRooms().then((freshRooms) => {
          setGuestRooms(freshRooms);
          if (isGuestModeRef.current && guestNumberRef.current !== null) {
            const active = freshRooms.find((r) => r.guestNumber === guestNumberRef.current);
            if (active) {
              setItems(active.items);
            }
          }
        });
      } else if (event.type === 'VAULT_ITEMS_SYNC') {
        if (!isGuestModeRef.current && isUnlockedRef.current && masterKeyRef.current) {
          void getAllStoredItems().then(async (stored) => {
            if (masterKeyRef.current) {
              setItems(await decryptStoredList(stored, masterKeyRef.current));
            }
          });
        }
      }
    });
  }, [decryptStoredList]);

  // Flush sync queues automatically when coming back online (Main Vault + Guest Rooms)
  useEffect(() => {
    if (!isOnline || !cloudUser) return;
    (async () => {
      // 1. Flush Guest Room offline queue (works whether currently in Guest Mode or Main Vault)
      const guestQueue = await getGuestRoomSyncQueue();
      if (guestQueue.length > 0) {
        const rawRooms = await getAllGuestRoomsRaw();
        const roomMap = new Map(rawRooms.map((r) => [r.guestNumber, r]));
        for (const entry of guestQueue) {
          const room = roomMap.get(entry.guestNumber);
          if (room) {
            try {
              await pushGuestRoomToCloud(cloudUser, room);
              await removeGuestRoomFromSyncQueue(entry.guestNumber);
            } catch (err) {
              if (!isTransientOfflineError(err)) {
                setRuntimeError(err instanceof Error ? err : new Error(String(err)));
              }
            }
          } else {
            await removeGuestRoomFromSyncQueue(entry.guestNumber);
          }
        }
      }

      // 2. Flush Main Vault offline queue when unlocked in Main Vault mode
      if (isGuestMode || !isUnlocked) return;
      const queue = await getSyncQueue();
      if (queue.length === 0) return;
      const allLocal = await getAllStoredItems();
      const map = new Map(allLocal.map((i) => [i.id, i]));
      setIsSyncing(true);
      try {
        for (const entry of queue) {
          const item = map.get(entry.id);
          if (item) {
            await pushVaultItemToCloud(cloudUser, item);
          }
          await removeFromSyncQueue(entry.id);
        }
        setPendingSyncCount(0);
        await pushSettingsToCloud(cloudUser, configRef.current);
      } catch (err) {
        if (!isTransientOfflineError(err)) {
          setRuntimeError(err instanceof Error ? err : new Error(String(err)));
        } else {
          const remaining = await getSyncQueue();
          setPendingSyncCount(remaining.length);
        }
      } finally {
        setIsSyncing(false);
      }
    })();
  }, [cloudUser, isGuestMode, isOnline, isUnlocked]);

  // Auto-lock timer
  useEffect(() => {
    if (!isUnlocked || isGuestMode || config.autoLockMinutes <= 0) return;
    let timer = window.setTimeout(() => {
      handleLockVault();
    }, config.autoLockMinutes * 60 * 1000);

    const resetTimer = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        handleLockVault();
      }, config.autoLockMinutes * 60 * 1000);
    };

    window.addEventListener('pointerdown', resetTimer);
    window.addEventListener('keydown', resetTimer);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', resetTimer);
      window.removeEventListener('keydown', resetTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnlocked, isGuestMode, config.autoLockMinutes, config.calculatorDisguiseEnabled]);

  const handleLockVault = () => {
    hiddenMasterKeyRef.current = null;
    setHiddenLayerOpen(false);
    setHiddenGateOpen(false);

    if (isGuestMode) {
      // Leaving a guest room preserves its saved items in IndexedDB and returns to room/account switcher
      setItems([]);
      setGuestNumber(null);
      setIsGuestMode(false);
      setPendingGuestNumber(generateGuestNumber());
      setIsUnlocked(false);
      setShowDisguise(false);
      return;
    }

    masterKeyRef.current = null;
    setItems([]);
    setIsUnlocked(false);
    if (config.calculatorDisguiseEnabled) {
      setShowDisguise(true);
    }
  };

  const handleInitializeVault = async (params: {
    authMode: AuthMode;
    secret: string;
    seedSample: boolean;
  }) => {
    const pinSalt = generateSalt(16);
    const vaultSalt = generateSalt(16);
    const pinHash = await hashAuthSecret(params.secret, pinSalt);
    const masterKey = await generateMasterVaultKey();
    const wrappingKey = await deriveKeyFromSecret(params.secret, vaultSalt);
    const wrapped = await wrapMasterKey(masterKey, wrappingKey);

    const newConfig: VaultConfig = {
      ...config,
      isInitialized: true,
      authMode: params.authMode,
      pinHash,
      pinSalt,
      vaultSalt,
      wrappedVaultKey: wrapped.wrappedKey,
      wrappedVaultKeyIv: wrapped.iv,
      calculatorSecretCode:
        params.authMode === 'pin' ? params.secret : config.calculatorSecretCode,
      clientUpdatedAt: Date.now(),
    };

    await saveVaultConfig(newConfig);
    masterKeyRef.current = masterKey;
    setConfig(newConfig);

    if (params.seedSample) {
      const starter = buildStarterVaultItems();
      const storedList: VaultItemStored[] = [];
      for (const item of starter) {
        const enc = await encryptVaultPayload(masterKey, {
          secretValue: item.secretValue,
          notes: item.notes,
        });
        storedList.push({
          id: item.id,
          title: item.title,
          category: item.category,
          username: item.username,
          url: item.url,
          encryptedPayload: enc.encryptedPayload,
          iv: enc.iv,
          favorite: item.favorite,
          deleted: false,
          clientUpdatedAt: item.updatedAt,
          createdAt: item.createdAt,
        });
      }
      await bulkPutStoredItems(storedList);
      setItems(starter);
      if (cloudUser) {
        try {
          if (navigator.onLine) {
            await pushSettingsToCloud(cloudUser, newConfig);
            for (const s of storedList) {
              await pushVaultItemToCloud(cloudUser, s);
            }
          } else {
            for (const s of storedList) {
              await enqueueSync({ id: s.id, operation: 'upsert', timestamp: Date.now() });
            }
            setPendingSyncCount((await getSyncQueue()).length);
          }
        } catch (err) {
          if (isTransientOfflineError(err)) {
            for (const s of storedList) {
              await enqueueSync({ id: s.id, operation: 'upsert', timestamp: Date.now() });
            }
            setPendingSyncCount((await getSyncQueue()).length);
          } else {
            throw err;
          }
        }
      }
    } else {
      setItems([]);
      if (cloudUser && navigator.onLine) {
        try {
          await pushSettingsToCloud(cloudUser, newConfig);
        } catch (err) {
          if (!isTransientOfflineError(err)) throw err;
        }
      }
    }

    setIsGuestMode(false);
    setCloudRestoreRequired(false);
    setShowDisguise(false);
    setIsUnlocked(true);
  };

  const handleUnlockWithSecret = async (secret: string): Promise<boolean> => {
    // Verify against local hash if present, or unwrap cloud key directly on fresh device restore
    try {
      if (config.pinHash && config.pinSalt) {
        const candidateHash = await hashAuthSecret(secret, config.pinSalt);
        if (candidateHash !== config.pinHash) return false;
      }

      const wrappingKey = await deriveKeyFromSecret(secret, config.vaultSalt);
      const masterKey = await unwrapMasterKey(
        config.wrappedVaultKey,
        config.wrappedVaultKeyIv,
        wrappingKey
      );

      // If this was a cloud restore on a fresh device, persist local pinHash now
      if (!config.pinHash) {
        const pinSalt = generateSalt(16);
        const pinHash = await hashAuthSecret(secret, pinSalt);
        const updated = { ...config, pinHash, pinSalt };
        setConfig(updated);
        await saveVaultConfig(updated);
      }

      masterKeyRef.current = masterKey;
      const localStored = await getAllStoredItems();
      const decrypted = await decryptStoredList(localStored, masterKey);
      setItems(decrypted);
      setIsGuestMode(false);
      setCloudRestoreRequired(false);
      setShowDisguise(false);
      setIsUnlocked(true);

      if (cloudUser) {
        await reconcileAndSync(cloudUser, remoteItemsCache, config);
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleUnlockWithBiometrics = async (): Promise<boolean> => {
    if (!config.biometricEnabled || !config.biometricWrappedKey) return false;
    const verified = await verifyBiometricCredential(
      config.biometricCredentialId,
      config.biometricMode
    );
    if (!verified) return false;

    const bioWrappingKey = await deriveKeyFromSecret(
      config.biometricWrapSecret,
      config.vaultSalt
    );
    const masterKey = await unwrapMasterKey(
      config.biometricWrappedKey,
      config.biometricWrappedKeyIv,
      bioWrappingKey
    );

    masterKeyRef.current = masterKey;
    const localStored = await getAllStoredItems();
    const decrypted = await decryptStoredList(localStored, masterKey);
    setItems(decrypted);
    setIsGuestMode(false);
    setShowDisguise(false);
    setIsUnlocked(true);

    if (cloudUser) {
      await reconcileAndSync(cloudUser, remoteItemsCache, config);
    }
    return true;
  };

  const syncGuestRoomRecord = async (room: GuestRoomRecord) => {
    await saveGuestRoom(room);
    setGuestRooms(await getAllGuestRooms());
    broadcastGuestRoomsSync(room.guestNumber);

    if (cloudUser) {
      if (navigator.onLine) {
        try {
          await pushGuestRoomToCloud(cloudUser, room);
          await removeGuestRoomFromSyncQueue(room.guestNumber);
        } catch (err) {
          if (isTransientOfflineError(err)) {
            await enqueueGuestRoomSync(room.guestNumber);
          } else {
            throw err;
          }
        }
      } else {
        await enqueueGuestRoomSync(room.guestNumber);
      }
    }
  };

  const persistGuestRoomItems = async (
    roomNumber: number,
    nextItems: VaultItemDecrypted[]
  ) => {
    const now = Date.now();
    const existingRoom = await getGuestRoom(roomNumber);
    const updatedRoom: GuestRoomRecord = {
      guestNumber: roomNumber,
      label: existingRoom?.label || `Guest #${roomNumber}`,
      items: nextItems,
      deleted: false,
      createdAt: existingRoom?.createdAt ?? now,
      updatedAt: now,
    };
    await syncGuestRoomRecord(updatedRoom);
  };

  const handleEnterAsGuest = async (assignedNumber: number) => {
    masterKeyRef.current = null;
    const existing = await getGuestRoom(assignedNumber);
    const now = Date.now();

    if (existing && !existing.deleted) {
      const touched: GuestRoomRecord = { ...existing, updatedAt: now };
      await syncGuestRoomRecord(touched);
      setItems(existing.items);
    } else {
      const starter = buildStarterVaultItems();
      const created: GuestRoomRecord = {
        guestNumber: assignedNumber,
        label: `Guest #${assignedNumber}`,
        items: starter,
        deleted: false,
        createdAt: now,
        updatedAt: now,
      };
      await syncGuestRoomRecord(created);
      setItems(starter);
    }

    setIsGuestMode(true);
    setGuestNumber(assignedNumber);
    setShowDisguise(false);
    setIsUnlocked(true);
  };

  const handleSwitchGuestRoom = async (targetNumber?: number) => {
    if (typeof targetNumber === 'number') {
      await handleEnterAsGuest(targetNumber);
      return;
    }
    let nextNum = generateGuestNumber();
    const existingNumbers = new Set(guestRooms.map((r) => r.guestNumber));
    while (existingNumbers.has(nextNum)) {
      nextNum = generateGuestNumber();
    }
    await handleEnterAsGuest(nextNum);
  };

  const handleDeleteGuestRoom = async (targetNumber: number) => {
    await deleteGuestRoom(targetNumber);
    const remaining = await getAllGuestRooms();
    setGuestRooms(remaining);
    broadcastGuestRoomsSync(targetNumber);

    if (cloudUser) {
      const tombstoned = await getGuestRoom(targetNumber);
      if (tombstoned) {
        if (navigator.onLine) {
          try {
            await pushGuestRoomToCloud(cloudUser, tombstoned);
            await removeGuestRoomFromSyncQueue(targetNumber);
          } catch (err) {
            if (isTransientOfflineError(err)) {
              await enqueueGuestRoomSync(targetNumber);
            } else {
              throw err;
            }
          }
        } else {
          await enqueueGuestRoomSync(targetNumber);
        }
      }
    }

    if (isGuestMode && guestNumber === targetNumber) {
      if (remaining.length > 0) {
        await handleEnterAsGuest(remaining[0].guestNumber);
      } else {
        setItems([]);
        setGuestNumber(null);
        setIsGuestMode(false);
        setPendingGuestNumber(generateGuestNumber());
        setIsUnlocked(false);
      }
    }
  };

  const handleExitGuestToSetup = () => {
    setItems([]);
    setGuestNumber(null);
    setIsGuestMode(false);
    setPendingGuestNumber(generateGuestNumber());
    setIsUnlocked(false);
  };

  const handleSaveItem = async (data: {
    id?: string;
    title: string;
    category: VaultCategory;
    username: string;
    url: string;
    secretValue: string;
    notes: string;
    favorite: boolean;
  }) => {
    const now = Date.now();
    const itemId = data.id || `item_${generateRandomId()}`;

    if (isGuestMode && guestNumber !== null) {
      const exists = items.some((i) => i.id === itemId);
      const nextItems = exists
        ? items.map((i) => (i.id === itemId ? { ...i, ...data, updatedAt: now } : i))
        : [
            {
              id: itemId,
              title: data.title,
              category: data.category,
              username: data.username,
              url: data.url,
              secretValue: data.secretValue,
              notes: data.notes,
              favorite: data.favorite,
              deleted: false,
              createdAt: now,
              updatedAt: now,
            },
            ...items,
          ];
      setItems(nextItems);
      await persistGuestRoomItems(guestNumber, nextItems);
      return;
    }

    const masterKey = masterKeyRef.current;
    if (!masterKey) throw new Error('Vault key is locked.');

    const enc = await encryptVaultPayload(masterKey, {
      secretValue: data.secretValue,
      notes: data.notes,
    });

    const existing = items.find((i) => i.id === itemId);
    const stored: VaultItemStored = {
      id: itemId,
      title: data.title,
      category: data.category,
      username: data.username,
      url: data.url,
      encryptedPayload: enc.encryptedPayload,
      iv: enc.iv,
      favorite: data.favorite,
      deleted: false,
      clientUpdatedAt: now,
      createdAt: existing?.createdAt ?? now,
    };

    await putStoredItem(stored);
    broadcastVaultItemsSync();
    setItems((prev) => {
      const dec: VaultItemDecrypted = {
        id: itemId,
        title: data.title,
        category: data.category,
        username: data.username,
        url: data.url,
        secretValue: data.secretValue,
        notes: data.notes,
        favorite: data.favorite,
        deleted: false,
        createdAt: stored.createdAt,
        updatedAt: now,
      };
      return existing ? prev.map((i) => (i.id === itemId ? dec : i)) : [dec, ...prev];
    });

    if (cloudUser) {
      if (navigator.onLine) {
        try {
          await pushVaultItemToCloud(cloudUser, stored);
        } catch (err) {
          if (isTransientOfflineError(err)) {
            await enqueueSync({ id: itemId, operation: 'upsert', timestamp: now });
            const queue = await getSyncQueue();
            setPendingSyncCount(queue.length);
          } else {
            throw err;
          }
        }
      } else {
        await enqueueSync({ id: itemId, operation: 'upsert', timestamp: now });
        const queue = await getSyncQueue();
        setPendingSyncCount(queue.length);
      }
    }
  };

  const handleDeleteItem = async (id: string) => {
    const now = Date.now();
    if (isGuestMode && guestNumber !== null) {
      const nextItems = items.filter((i) => i.id !== id);
      setItems(nextItems);
      await persistGuestRoomItems(guestNumber, nextItems);
      return;
    }

    const existing = items.find((i) => i.id === id);
    const masterKey = masterKeyRef.current;
    if (!existing || !masterKey) return;

    const enc = await encryptVaultPayload(masterKey, {
      secretValue: existing.secretValue,
      notes: existing.notes,
    });

    const tombstone: VaultItemStored = {
      id,
      title: existing.title,
      category: existing.category,
      username: existing.username,
      url: existing.url,
      encryptedPayload: enc.encryptedPayload,
      iv: enc.iv,
      favorite: existing.favorite,
      deleted: true,
      clientUpdatedAt: now,
      createdAt: existing.createdAt,
    };

    await putStoredItem(tombstone);
    broadcastVaultItemsSync();
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, deleted: true, updatedAt: now } : i)));

    if (cloudUser) {
      if (navigator.onLine) {
        try {
          await pushVaultItemToCloud(cloudUser, tombstone);
        } catch (err) {
          if (isTransientOfflineError(err)) {
            await enqueueSync({ id, operation: 'delete', timestamp: now });
            const queue = await getSyncQueue();
            setPendingSyncCount(queue.length);
          } else {
            throw err;
          }
        }
      } else {
        await enqueueSync({ id, operation: 'delete', timestamp: now });
        const queue = await getSyncQueue();
        setPendingSyncCount(queue.length);
      }
    }
  };

  const handleToggleFavorite = async (id: string) => {
    const target = items.find((i) => i.id === id);
    if (!target) return;
    await handleSaveItem({
      id: target.id,
      title: target.title,
      category: target.category,
      username: target.username,
      url: target.url,
      secretValue: target.secretValue,
      notes: target.notes,
      favorite: !target.favorite,
    });
  };

  const handleUpdateConfig = async (partial: Partial<VaultConfig>) => {
    const updated: VaultConfig = {
      ...config,
      ...partial,
      clientUpdatedAt: Date.now(),
    };
    setConfig(updated);
    await saveVaultConfig(updated);
    broadcastConfigSync();

    if (cloudUser && navigator.onLine && updated.isInitialized) {
      try {
        await pushSettingsToCloud(cloudUser, updated);
      } catch (err) {
        if (!isTransientOfflineError(err)) {
          throw err;
        }
      }
    }
  };

  const handleChangeLockCredential = async (mode: AuthMode, newSecret: string) => {
    const masterKey = masterKeyRef.current;
    if (!masterKey) return;

    const pinSalt = generateSalt(16);
    const pinHash = await hashAuthSecret(newSecret, pinSalt);
    const wrappingKey = await deriveKeyFromSecret(newSecret, config.vaultSalt);
    const wrapped = await wrapMasterKey(masterKey, wrappingKey);

    await handleUpdateConfig({
      authMode: mode,
      pinHash,
      pinSalt,
      wrappedVaultKey: wrapped.wrappedKey,
      wrappedVaultKeyIv: wrapped.iv,
    });
  };

  const handleToggleBiometrics = async (
    enable: boolean
  ): Promise<{ notice?: string }> => {
    if (!enable) {
      await handleUpdateConfig({
        biometricEnabled: false,
        biometricCredentialId: '',
        biometricWrappedKey: '',
        biometricWrappedKeyIv: '',
        biometricWrapSecret: '',
      });
      return {};
    }

    const masterKey = masterKeyRef.current;
    if (!masterKey) throw new Error('Unlock vault before enrolling biometrics.');

    const res = await enrollBiometricCredential(cloudUser?.email || 'SecureVault Owner');
    const bioSecret = generateSalt(24);
    const bioWrappingKey = await deriveKeyFromSecret(bioSecret, config.vaultSalt);
    const wrapped = await wrapMasterKey(masterKey, bioWrappingKey);

    await handleUpdateConfig({
      biometricEnabled: true,
      biometricMode: res.mode,
      biometricCredentialId: res.credentialId,
      biometricWrappedKey: wrapped.wrappedKey,
      biometricWrappedKeyIv: wrapped.iv,
      biometricWrapSecret: bioSecret,
    });

    return { notice: res.notice };
  };

  const handleSignInGoogle = async () => {
    const user = await signInWithGoogle();
    const rawGuestRooms = await getAllGuestRoomsRaw();
    try {
      if (isUnlocked && !isGuestMode) {
        const localItems = await getAllStoredItems();
        await pushSettingsToCloud(user, { ...config, cloudSyncEnabled: true });
        for (const item of localItems) {
          await pushVaultItemToCloud(user, item);
        }
        await clearSyncQueue();
        setPendingSyncCount(0);
      }
      for (const room of rawGuestRooms) {
        await pushGuestRoomToCloud(user, room);
      }
      await clearGuestRoomSyncQueue();
    } catch (err) {
      if (isTransientOfflineError(err)) {
        if (isUnlocked && !isGuestMode) {
          const localItems = await getAllStoredItems();
          for (const item of localItems) {
            await enqueueSync({
              id: item.id,
              operation: item.deleted ? 'delete' : 'upsert',
              timestamp: Date.now(),
            });
          }
          setPendingSyncCount((await getSyncQueue()).length);
        }
        for (const room of rawGuestRooms) {
          await enqueueGuestRoomSync(room.guestNumber);
        }
      } else {
        throw err;
      }
    }
  };

  const handleManualSync = useCallback(async () => {
    if (!cloudUser) return;
    if (isGuestMode) {
      setIsSyncing(true);
      try {
        const rawRooms = await getAllGuestRoomsRaw();
        for (const room of rawRooms) {
          await pushGuestRoomToCloud(cloudUser, room);
        }
        await clearGuestRoomSyncQueue();
        if (configRef.current.isInitialized) {
          await pushSettingsToCloud(cloudUser, configRef.current);
        }
        broadcastGuestRoomsSync(guestNumberRef.current);
        broadcastConfigSync();
      } catch (err) {
        if (!isTransientOfflineError(err)) {
          setRuntimeError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        setIsSyncing(false);
      }
      return;
    }

    await reconcileAndSync(cloudUser, remoteItemsCache, configRef.current);
    const rawRooms = await getAllGuestRoomsRaw();
    for (const room of rawRooms) {
      try {
        await pushGuestRoomToCloud(cloudUser, room);
      } catch (err) {
        if (!isTransientOfflineError(err)) {
          setRuntimeError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }
  }, [cloudUser, isGuestMode, reconcileAndSync, remoteItemsCache]);

  const handleResolveConflict = async (
    itemId: string,
    choice: 'keep-local' | 'use-cloud' | 'keep-both'
  ) => {
    const conflict = conflicts.find((c) => c.itemId === itemId);
    if (!conflict || !cloudUser) return;

    if (choice === 'keep-local') {
      const winner = { ...conflict.localItem, clientUpdatedAt: Date.now() };
      await putStoredItem(winner);
      await pushVaultItemToCloud(cloudUser, winner);
    } else if (choice === 'use-cloud') {
      await putStoredItem(conflict.remoteItem);
    } else {
      // Keep both: save remote under original ID, clone local as a new entry
      await putStoredItem(conflict.remoteItem);
      const duplicate: VaultItemStored = {
        ...conflict.localItem,
        id: `item_${generateRandomId()}`,
        title: `${conflict.localItem.title} (Local Copy)`,
        clientUpdatedAt: Date.now(),
      };
      await putStoredItem(duplicate);
      await pushVaultItemToCloud(cloudUser, duplicate);
    }

    setConflicts((prev) => prev.filter((c) => c.itemId !== itemId));
    if (masterKeyRef.current) {
      const all = await getAllStoredItems();
      setItems(await decryptStoredList(all, masterKeyRef.current));
    }
  };

  const handleToggleTheme = () => {
    const nextTheme =
      config.darkMode === 'dark'
        ? 'light'
        : config.darkMode === 'light'
          ? 'dark'
          : window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'light'
            : 'dark';
    void handleUpdateConfig({ darkMode: nextTheme });
  };

  const handleExportEncryptedBackup = async () => {
    const stored = isGuestMode ? [] : await getAllStoredItems();
    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'SecureVault',
      encryptedItems: stored,
      guestItemsCount: isGuestMode ? items.length : undefined,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `securevault-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleResetVault = async () => {
    await clearAllLocalVaultData();
    try {
      localStorage.removeItem('securevault_branding');
    } catch {
      // ignore
    }
    masterKeyRef.current = null;
    hiddenMasterKeyRef.current = null;
    setHiddenLayerOpen(false);
    setHiddenGateOpen(false);
    setHiddenConfig(createDefaultHiddenConfig());
    setGuestRooms([]);
    setItems([]);
    setIsUnlocked(false);
    setShowDisguise(false);
    const fresh = createDefaultConfig();
    setConfig(fresh);
    await saveVaultConfig(fresh);
  };

  const autoUpdate = useAutoUpdateSystem({
    autoUpdateEnabled: config.autoUpdateEnabled !== false,
    role: isUnlocked ? (isGuestMode ? 'guest-room' : 'user') : 'lock',
    guestNumber: isGuestMode ? guestNumber : null,
    profileLabel: isUnlocked
      ? isGuestMode
        ? `Guest #${guestNumber}`
        : cloudUser?.email || config.appDisplayName || 'Vault Owner'
      : 'Lock Screen',
    onSyncAllData: handleManualSync,
  });

  return (
    <>
      {showDisguise ? (
        <CalculatorDisguise
          secretCode={config.calculatorSecretCode}
          biometricAvailable={config.biometricEnabled && !isGuestMode}
          darkMode={config.darkMode}
          onToggleTheme={handleToggleTheme}
          onUnlockSuccess={async () => {
            if (!isUnlocked && config.isInitialized) {
              await handleUnlockWithSecret(config.calculatorSecretCode);
            }
            setShowDisguise(false);
          }}
          onRequestBiometricUnlock={async () => {
            const ok = await handleUnlockWithBiometrics();
            if (ok) setShowDisguise(false);
          }}
        />
      ) : !isUnlocked ? (
        <SetupLockScreen
          config={config}
          isLoading={isLoading}
          cloudUser={cloudUser}
          guestRooms={guestRooms}
          pendingGuestNumber={pendingGuestNumber}
          cloudRestoreRequired={cloudRestoreRequired}
          autoUpdate={autoUpdate}
          onInitializeVault={handleInitializeVault}
          onUnlockWithSecret={handleUnlockWithSecret}
          onUnlockWithBiometrics={handleUnlockWithBiometrics}
          onSignInCloudFromLogin={handleSignInGoogle}
          onEnterAsGuest={handleEnterAsGuest}
          onDeleteGuestRoom={handleDeleteGuestRoom}
          onSwitchToDisguise={() => setShowDisguise(true)}
          onToggleTheme={handleToggleTheme}
          darkMode={config.darkMode}
        />
      ) : (
        <VaultDashboard
          items={items}
          config={config}
          isGuestMode={isGuestMode}
          guestNumber={guestNumber}
          guestRooms={guestRooms}
          cloudUser={cloudUser}
          pendingSyncCount={pendingSyncCount}
          isSyncing={isSyncing}
          conflicts={conflicts}
          conflictPolicy={conflictPolicy}
          autoUpdate={autoUpdate}
          onChangeConflictPolicy={setConflictPolicy}
          onOpenConflictModal={() => setConflictModalOpen(true)}
          onSaveItem={handleSaveItem}
          onDeleteItem={handleDeleteItem}
          onToggleFavorite={handleToggleFavorite}
          onUpdateConfig={handleUpdateConfig}
          onChangeLockCredential={handleChangeLockCredential}
          onToggleBiometrics={handleToggleBiometrics}
          onSignInGoogle={handleSignInGoogle}
          onSignOutGoogle={signOutGoogle}
          onManualSync={handleManualSync}
          onLockVault={handleLockVault}
          onExitGuestToSetup={handleExitGuestToSetup}
          onSwitchGuestRoom={handleSwitchGuestRoom}
          onDeleteGuestRoom={handleDeleteGuestRoom}
          onLaunchDisguise={() => setShowDisguise(true)}
          onToggleTheme={handleToggleTheme}
          onExportEncryptedBackup={handleExportEncryptedBackup}
          onResetVault={handleResetVault}
          onLogoPress={() => setHiddenGateOpen(true)}
        />
      )}

      {hiddenLayerOpen && (
        <HiddenVaultLayer
          mode={hiddenLayerMode}
          masterKey={hiddenMasterKeyRef.current}
          hiddenConfig={hiddenConfig}
          appDisplayName={config.appDisplayName}
          appIconPreset={config.appIconPreset}
          customAppIconDataUrl={config.customAppIconDataUrl}
          onUpdateAppBranding={async (next) => {
            await handleUpdateConfig(next);
          }}
          onConfigUpdated={setHiddenConfig}
          onExit={() => {
            hiddenMasterKeyRef.current = null;
            setHiddenLayerOpen(false);
          }}
        />
      )}

      <HiddenLayerGateModal
        isOpen={hiddenGateOpen}
        hiddenConfig={hiddenConfig}
        onClose={() => setHiddenGateOpen(false)}
        onConfigUpdated={setHiddenConfig}
        onUnlocked={(mode, key) => {
          hiddenMasterKeyRef.current = key;
          setHiddenLayerMode(mode);
          setHiddenGateOpen(false);
          setHiddenLayerOpen(true);
        }}
      />

      {conflictModalOpen && (
        <ConflictResolutionModal
          conflicts={conflicts}
          onResolve={async (itemId, choice) => {
            await handleResolveConflict(itemId, choice);
            if (conflicts.length <= 1) setConflictModalOpen(false);
          }}
        />
      )}

      <AutoUpdateBanner
        updateAvailable={autoUpdate.updateAvailable}
        isApplying={autoUpdate.isApplying}
        latestVersion={autoUpdate.latestVersion}
        countdownSeconds={autoUpdate.countdownSeconds}
        pausedWhileTyping={autoUpdate.pausedWhileTyping}
        onApplyNow={autoUpdate.applyNow}
        onDismiss={autoUpdate.dismissUpdate}
      />

      <OfflineIndicator />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <VaultAppShell />
    </ErrorBoundary>
  );
}
