import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  initializeFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  setLogLevel,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  AppIconPresetId,
  GuestRoomRecord,
  VaultConfig,
  VaultItemDecrypted,
  VaultItemStored,
} from '../types/vault';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId
);
// Prevent Firestore OnlineStateTracker from emitting console.error on expected offline/WebChannel blips;
// handleFirestoreError still logs structured JSON for real permission/API failures.
setLogLevel('silent');
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function isTransientOfflineError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    msg.includes('unavailable') ||
    msg.includes('client is offline') ||
    msg.includes('network-request-failed') ||
    msg.includes('could not reach cloud firestore') ||
    msg.includes('failed to get document because the client is offline')
  );
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  if (!isTransientOfflineError(error)) {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (isTransientOfflineError(error)) {
      return false;
    }
    // Permission denied on test/connection is expected since global catch-all denies it
    return true;
  }
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutGoogle(): Promise<void> {
  await signOut(auth);
}

export async function ensureUserVaultRoot(user: User): Promise<void> {
  const rootPath = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ownerId: user.uid,
        displayName: (user.displayName || 'Vault Owner').slice(0, 120),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, rootPath);
  }
}

const VALID_ICON_PRESETS: AppIconPresetId[] = [
  'shield',
  'calculator',
  'notes',
  'weather',
  'calendar',
  'music',
  'compass',
  'clock',
  'custom',
];

function sanitizeIconPreset(preset: unknown): AppIconPresetId {
  return VALID_ICON_PRESETS.includes(preset as AppIconPresetId)
    ? (preset as AppIconPresetId)
    : 'shield';
}

export async function pushSettingsToCloud(
  user: User,
  config: VaultConfig
): Promise<void> {
  const settingsPath = `users/${user.uid}/settings/preferences`;
  const ref = doc(db, 'users', user.uid, 'settings', 'preferences');
  const darkMode =
    config.darkMode === 'light' || config.darkMode === 'dark' || config.darkMode === 'system'
      ? config.darkMode
      : 'system';
  const authMode = config.authMode === 'password' ? 'password' : 'pin';
  const sponsorFrequency =
    config.adsSettings?.sponsorFrequency === 'off' ||
    config.adsSettings?.sponsorFrequency === 'minimal' ||
    config.adsSettings?.sponsorFrequency === 'balanced'
      ? config.adsSettings.sponsorFrequency
      : 'off';
  const appDisplayName = (config.appDisplayName || 'SecureVault').trim().slice(0, 64) || 'SecureVault';
  const appIconPreset = sanitizeIconPreset(config.appIconPreset);

  try {
    await ensureUserVaultRoot(user);
    const snap = await getDoc(ref);
    const payload = {
      ownerId: user.uid,
      darkMode,
      calculatorDisguiseEnabled: Boolean(config.calculatorDisguiseEnabled),
      biometricEnabled: Boolean(config.biometricEnabled),
      autoUpdateEnabled: config.autoUpdateEnabled !== false,
      appDisplayName,
      appIconPreset,
      authMode,
      autoLockMinutes: Math.min(1440, Math.max(0, Number(config.autoLockMinutes) || 0)),
      cloudSyncEnabled: Boolean(config.cloudSyncEnabled),
      vaultSalt: (config.vaultSalt || 'default-salt').slice(0, 128),
      wrappedVaultKey: (config.wrappedVaultKey || '').slice(0, 512),
      wrappedVaultKeyIv: (config.wrappedVaultKeyIv || '').slice(0, 128),
      adsSettings: {
        personalizedAds: Boolean(config.adsSettings?.personalizedAds),
        sponsoredTips: Boolean(config.adsSettings?.sponsoredTips),
        sponsorFrequency,
        adId: (config.adsSettings?.adId || 'sv_default').slice(0, 64),
      },
      clientUpdatedAt: Math.max(0, Number(config.clientUpdatedAt) || Date.now()),
      createdAt: snap.exists() ? snap.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, settingsPath);
  }
}

export async function pushVaultItemToCloud(
  user: User,
  item: VaultItemStored
): Promise<void> {
  const safeId = item.id.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128) || 'item_default';
  const itemPath = `users/${user.uid}/vaultItems/${safeId}`;
  const ref = doc(db, 'users', user.uid, 'vaultItems', safeId);
  const category =
    item.category === 'credential' ||
    item.category === 'note' ||
    item.category === 'card' ||
    item.category === 'document'
      ? item.category
      : 'note';

  try {
    if (!item.encryptedPayload || item.encryptedPayload.length > 100000) {
      throw new Error('Encrypted item exceeds cloud sync size limit (100,000 chars).');
    }
    if (!item.iv || item.iv.length > 128) {
      throw new Error('Invalid encryption IV for cloud sync.');
    }
    await ensureUserVaultRoot(user);
    const snap = await getDoc(ref);
    const payload = {
      ownerId: user.uid,
      title: (item.title || 'Untitled').slice(0, 160),
      category,
      username: (item.username || '').slice(0, 200),
      url: (item.url || '').slice(0, 500),
      encryptedPayload: item.encryptedPayload,
      iv: item.iv,
      favorite: Boolean(item.favorite),
      deleted: Boolean(item.deleted),
      clientUpdatedAt: Math.max(0, Number(item.clientUpdatedAt) || Date.now()),
      createdAt: snap.exists() ? snap.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, itemPath);
  }
}

export async function pushGuestRoomToCloud(
  user: User,
  room: GuestRoomRecord
): Promise<void> {
  const roomId = `room_${Math.max(1, Math.min(999999, Math.floor(room.guestNumber)))}`;
  const roomPath = `users/${user.uid}/guestRooms/${roomId}`;
  const roomRef = doc(db, 'users', user.uid, 'guestRooms', roomId);

  try {
    await ensureUserVaultRoot(user);
    const roomSnap = await getDoc(roomRef);
    await setDoc(roomRef, {
      ownerId: user.uid,
      guestNumber: Math.max(1, Math.min(999999, Math.floor(room.guestNumber))),
      label: (room.label || `Guest #${room.guestNumber}`).trim().slice(0, 80) || `Guest #${room.guestNumber}`,
      deleted: Boolean(room.deleted),
      clientUpdatedAt: Math.max(0, Number(room.updatedAt) || Date.now()),
      createdAt: roomSnap.exists() ? roomSnap.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (room.deleted) {
      return;
    }

    const itemsCol = collection(db, 'users', user.uid, 'guestRooms', roomId, 'items');
    const existingSnap = await getDocs(
      query(itemsCol, where('ownerId', '==', user.uid), where('roomId', '==', roomId))
    );
    const currentIds = new Set<string>();

    for (const item of room.items) {
      const safeItemId = item.id.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128) || 'guest_item';
      currentIds.add(safeItemId);
      const itemRef = doc(db, 'users', user.uid, 'guestRooms', roomId, 'items', safeItemId);
      const existingDoc = existingSnap.docs.find((d) => d.id === safeItemId);
      const category =
        item.category === 'credential' ||
        item.category === 'note' ||
        item.category === 'card' ||
        item.category === 'document'
          ? item.category
          : 'note';

      await setDoc(itemRef, {
        ownerId: user.uid,
        roomId,
        title: (item.title || 'Untitled').slice(0, 160),
        category,
        username: (item.username || '').slice(0, 200),
        url: (item.url || '').slice(0, 500),
        secretValue: (item.secretValue || '').slice(0, 10000),
        notes: (item.notes || '').slice(0, 20000),
        favorite: Boolean(item.favorite),
        deleted: Boolean(item.deleted),
        clientUpdatedAt: Math.max(0, Number(item.updatedAt) || Date.now()),
        createdAt: existingDoc?.exists() ? existingDoc.data().createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // Tombstone any cloud items removed locally from this guest room
    for (const docSnap of existingSnap.docs) {
      const d = docSnap.data();
      if (!currentIds.has(docSnap.id) && !d.deleted) {
        const itemRef = doc(db, 'users', user.uid, 'guestRooms', roomId, 'items', docSnap.id);
        await setDoc(itemRef, {
          ownerId: user.uid,
          roomId,
          title: (String(d.title || 'Untitled')).slice(0, 160),
          category:
            d.category === 'credential' ||
            d.category === 'note' ||
            d.category === 'card' ||
            d.category === 'document'
              ? d.category
              : 'note',
          username: String(d.username || '').slice(0, 200),
          url: String(d.url || '').slice(0, 500),
          secretValue: String(d.secretValue || '').slice(0, 10000),
          notes: String(d.notes || '').slice(0, 20000),
          favorite: Boolean(d.favorite),
          deleted: true,
          clientUpdatedAt: Date.now(),
          createdAt: d.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, roomPath);
  }
}

export interface CloudSettingsRemote {
  darkMode: VaultConfig['darkMode'];
  calculatorDisguiseEnabled: boolean;
  biometricEnabled: boolean;
  autoUpdateEnabled: boolean;
  appDisplayName: string;
  appIconPreset: AppIconPresetId;
  authMode: VaultConfig['authMode'];
  autoLockMinutes: number;
  cloudSyncEnabled: boolean;
  vaultSalt: string;
  wrappedVaultKey: string;
  wrappedVaultKeyIv: string;
  adsSettings: VaultConfig['adsSettings'];
  clientUpdatedAt: number;
}

export function subscribeToCloudVault(
  uid: string,
  onItems: (items: VaultItemStored[]) => void,
  onSettings: (settings: CloudSettingsRemote) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const itemsPath = `users/${uid}/vaultItems`;
  const settingsPath = `users/${uid}/settings/preferences`;

  const itemsQuery = query(
    collection(db, 'users', uid, 'vaultItems'),
    where('ownerId', '==', uid)
  );

  const unsubItems = onSnapshot(
    itemsQuery,
    (snapshot) => {
      const list: VaultItemStored[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          title: d.title,
          category: d.category,
          username: d.username || '',
          url: d.url || '',
          encryptedPayload: d.encryptedPayload,
          iv: d.iv,
          favorite: Boolean(d.favorite),
          deleted: Boolean(d.deleted),
          clientUpdatedAt: typeof d.clientUpdatedAt === 'number' ? d.clientUpdatedAt : Date.now(),
          createdAt:
            typeof d.clientUpdatedAt === 'number' ? d.clientUpdatedAt : Date.now(),
        });
      });
      onItems(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, itemsPath);
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );

  const unsubSettings = onSnapshot(
    doc(db, 'users', uid, 'settings', 'preferences'),
    (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        onSettings({
          darkMode: d.darkMode,
          calculatorDisguiseEnabled: Boolean(d.calculatorDisguiseEnabled),
          biometricEnabled: Boolean(d.biometricEnabled),
          autoUpdateEnabled: d.autoUpdateEnabled !== false,
          appDisplayName: typeof d.appDisplayName === 'string' && d.appDisplayName.trim() ? d.appDisplayName : 'SecureVault',
          appIconPreset: sanitizeIconPreset(d.appIconPreset),
          authMode: d.authMode,
          autoLockMinutes: d.autoLockMinutes,
          cloudSyncEnabled: Boolean(d.cloudSyncEnabled),
          vaultSalt: d.vaultSalt,
          wrappedVaultKey: d.wrappedVaultKey || '',
          wrappedVaultKeyIv: d.wrappedVaultKeyIv || '',
          adsSettings: d.adsSettings,
          clientUpdatedAt: d.clientUpdatedAt || 0,
        });
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, settingsPath);
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );

  return () => {
    unsubItems();
    unsubSettings();
  };
}

export function subscribeToCloudGuestRooms(
  uid: string,
  onRooms: (rooms: GuestRoomRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const roomsPath = `users/${uid}/guestRooms`;
  const roomsQuery = query(
    collection(db, 'users', uid, 'guestRooms'),
    where('ownerId', '==', uid)
  );

  const itemUnsubs = new Map<string, Unsubscribe>();
  const roomDocsCache = new Map<
    string,
    { guestNumber: number; label: string; deleted: boolean; updatedAt: number }
  >();
  const roomItemsCache = new Map<string, VaultItemDecrypted[]>();

  const emitAllRooms = () => {
    const assembled: GuestRoomRecord[] = [];
    for (const [roomId, meta] of roomDocsCache.entries()) {
      const items = roomItemsCache.get(roomId) ?? [];
      assembled.push({
        guestNumber: meta.guestNumber,
        label: meta.label,
        deleted: meta.deleted,
        items: items.filter((item) => !item.deleted),
        createdAt: meta.updatedAt,
        updatedAt: meta.updatedAt,
      });
    }
    onRooms(assembled);
  };

  const unsubRooms = onSnapshot(
    roomsQuery,
    (snapshot) => {
      const activeRoomIds = new Set<string>();
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const roomId = docSnap.id;
        activeRoomIds.add(roomId);
        roomDocsCache.set(roomId, {
          guestNumber: typeof d.guestNumber === 'number' ? d.guestNumber : 1000,
          label: typeof d.label === 'string' && d.label.trim() ? d.label : `Guest #${d.guestNumber || 1000}`,
          deleted: Boolean(d.deleted),
          updatedAt: typeof d.clientUpdatedAt === 'number' ? d.clientUpdatedAt : Date.now(),
        });

        if (!d.deleted && !itemUnsubs.has(roomId)) {
          const itemsPath = `users/${uid}/guestRooms/${roomId}/items`;
          const itemsQuery = query(
            collection(db, 'users', uid, 'guestRooms', roomId, 'items'),
            where('ownerId', '==', uid),
            where('roomId', '==', roomId)
          );
          const unsubRoomItems = onSnapshot(
            itemsQuery,
            (itemsSnap) => {
              const items: VaultItemDecrypted[] = [];
              itemsSnap.forEach((itemDoc) => {
                const idata = itemDoc.data();
                items.push({
                  id: itemDoc.id,
                  title: String(idata.title || 'Untitled'),
                  category:
                    idata.category === 'credential' ||
                    idata.category === 'note' ||
                    idata.category === 'card' ||
                    idata.category === 'document'
                      ? idata.category
                      : 'note',
                  username: String(idata.username || ''),
                  url: String(idata.url || ''),
                  secretValue: String(idata.secretValue || ''),
                  notes: String(idata.notes || ''),
                  favorite: Boolean(idata.favorite),
                  deleted: Boolean(idata.deleted),
                  createdAt:
                    typeof idata.clientUpdatedAt === 'number' ? idata.clientUpdatedAt : Date.now(),
                  updatedAt:
                    typeof idata.clientUpdatedAt === 'number' ? idata.clientUpdatedAt : Date.now(),
                });
              });
              roomItemsCache.set(roomId, items);
              emitAllRooms();
            },
            (error) => {
              try {
                handleFirestoreError(error, OperationType.LIST, itemsPath);
              } catch (e) {
                onError(e instanceof Error ? e : new Error(String(e)));
              }
            }
          );
          itemUnsubs.set(roomId, unsubRoomItems);
        }
      });

      // Cleanup listeners for removed rooms
      for (const [roomId, unsub] of itemUnsubs.entries()) {
        if (!activeRoomIds.has(roomId)) {
          unsub();
          itemUnsubs.delete(roomId);
          roomDocsCache.delete(roomId);
          roomItemsCache.delete(roomId);
        }
      }

      emitAllRooms();
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, roomsPath);
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );

  return () => {
    unsubRooms();
    for (const unsub of itemUnsubs.values()) {
      unsub();
    }
    itemUnsubs.clear();
  };
}
