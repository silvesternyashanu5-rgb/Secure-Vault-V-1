import { registerSW } from 'virtual:pwa-register';

export const CURRENT_APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'v1.0.0';

export type SessionRole = 'user' | 'guest-room' | 'lock';

export interface ConnectedSessionInfo {
  sessionId: string;
  role: SessionRole;
  guestNumber: number | null;
  label: string;
  lastSeen: number;
}

export type LiveBusEvent =
  | { type: 'CONFIG_SYNC'; sourceSessionId: string; timestamp: number }
  | {
      type: 'GUEST_ROOMS_SYNC';
      sourceSessionId: string;
      guestNumber: number | null;
      timestamp: number;
    }
  | { type: 'VAULT_ITEMS_SYNC'; sourceSessionId: string; timestamp: number }
  | {
      type: 'APP_UPDATE_SIGNAL';
      sourceSessionId: string;
      version: string;
      action: 'available' | 'applying';
      timestamp: number;
    }
  | {
      type: 'PRESENCE_PING' | 'PRESENCE_PONG';
      sourceSessionId: string;
      role: SessionRole;
      guestNumber: number | null;
      label: string;
      timestamp: number;
    };

export interface AutoUpdateState {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  isChecking: boolean;
  isApplying: boolean;
  lastCheckedAt: number | null;
  connectedSessions: ConnectedSessionInfo[];
}

const CHANNEL_NAME = 'securevault-auto-update-v1';
const STORAGE_BUS_KEY = 'securevault_live_bus_event';
const APPLIED_VERSION_SESSION_KEY = 'sv_applied_app_version';
const SESSION_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

let swUpdateFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
let swRegistrationRef: ServiceWorkerRegistration | null = null;
let swInitialized = false;
let broadcastChannel: BroadcastChannel | null = null;

let currentPresence: Omit<ConnectedSessionInfo, 'sessionId' | 'lastSeen'> = {
  role: 'lock',
  guestNumber: null,
  label: 'Vault Gate',
};

const connectedSessionsMap = new Map<string, ConnectedSessionInfo>();

let state: AutoUpdateState = {
  currentVersion: CURRENT_APP_VERSION,
  latestVersion: CURRENT_APP_VERSION,
  updateAvailable: false,
  isChecking: false,
  isApplying: false,
  lastCheckedAt: null,
  connectedSessions: [],
};

const stateListeners = new Set<(next: AutoUpdateState) => void>();
const busListeners = new Set<(event: LiveBusEvent) => void>();

function pruneStaleSessions() {
  const now = Date.now();
  connectedSessionsMap.set(SESSION_ID, {
    sessionId: SESSION_ID,
    role: currentPresence.role,
    guestNumber: currentPresence.guestNumber,
    label: currentPresence.label,
    lastSeen: now,
  });
  for (const [id, info] of connectedSessionsMap.entries()) {
    if (id !== SESSION_ID && now - info.lastSeen > 65_000) {
      connectedSessionsMap.delete(id);
    }
  }
}

function notifyStateListeners() {
  pruneStaleSessions();
  const snapshot: AutoUpdateState = {
    ...state,
    connectedSessions: Array.from(connectedSessionsMap.values()),
  };
  for (const listener of stateListeners) {
    listener(snapshot);
  }
}

function handleIncomingBusEvent(event: LiveBusEvent) {
  if (!event || event.sourceSessionId === SESSION_ID) return;

  if (event.type === 'PRESENCE_PING' || event.type === 'PRESENCE_PONG') {
    connectedSessionsMap.set(event.sourceSessionId, {
      sessionId: event.sourceSessionId,
      role: event.role,
      guestNumber: event.guestNumber,
      label: event.label,
      lastSeen: event.timestamp,
    });
    if (event.type === 'PRESENCE_PING') {
      postBusEvent({
        type: 'PRESENCE_PONG',
        sourceSessionId: SESSION_ID,
        role: currentPresence.role,
        guestNumber: currentPresence.guestNumber,
        label: currentPresence.label,
        timestamp: Date.now(),
      });
    }
    notifyStateListeners();
    return;
  }

  if (event.type === 'APP_UPDATE_SIGNAL') {
    const alreadyApplied =
      typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem(APPLIED_VERSION_SESSION_KEY) === event.version;
    if (!alreadyApplied && event.version !== CURRENT_APP_VERSION) {
      state = {
        ...state,
        latestVersion: event.version,
        updateAvailable: true,
        isApplying: event.action === 'applying' ? true : state.isApplying,
      };
      notifyStateListeners();
    }
    if (event.action === 'applying' && !alreadyApplied) {
      void applyPendingAppUpdate(false);
    }
    return;
  }

  for (const listener of busListeners) {
    listener(event);
  }
}

function ensureChannel() {
  if (typeof window === 'undefined') return;
  if (!broadcastChannel && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    broadcastChannel.onmessage = (msg) => {
      handleIncomingBusEvent(msg.data as LiveBusEvent);
    };
  }
}

let storageListenerAttached = false;
function ensureStorageFallbackListener() {
  if (typeof window === 'undefined' || storageListenerAttached) return;
  storageListenerAttached = true;
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_BUS_KEY || !e.newValue) return;
    try {
      const parsed = JSON.parse(e.newValue) as LiveBusEvent;
      handleIncomingBusEvent(parsed);
    } catch {
      // ignore malformed bus event
    }
  });
}

function postBusEvent(event: LiveBusEvent) {
  ensureChannel();
  ensureStorageFallbackListener();
  try {
    broadcastChannel?.postMessage(event);
  } catch {
    // ignore channel errors
  }
  try {
    localStorage.setItem(STORAGE_BUS_KEY, JSON.stringify(event));
  } catch {
    // ignore storage errors
  }
}

export function initAutoUpdater(): void {
  if (typeof window === 'undefined') return;
  ensureChannel();
  ensureStorageFallbackListener();

  if (swInitialized) return;
  swInitialized = true;

  try {
    swUpdateFn = registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, registration) {
        if (registration) {
          swRegistrationRef = registration;
        }
      },
      onNeedRefresh() {
        const nextVersion =
          state.latestVersion !== CURRENT_APP_VERSION
            ? state.latestVersion
            : `${CURRENT_APP_VERSION}-sw`;
        state = {
          ...state,
          latestVersion: nextVersion,
          updateAvailable: true,
        };
        notifyStateListeners();
        postBusEvent({
          type: 'APP_UPDATE_SIGNAL',
          sourceSessionId: SESSION_ID,
          version: nextVersion,
          action: 'available',
          timestamp: Date.now(),
        });
      },
      onOfflineReady() {
        notifyStateListeners();
      },
    });
  } catch {
    // Ignore SW registration failure in restricted iframe contexts
  }
}

export function getAutoUpdateSnapshot(): AutoUpdateState {
  pruneStaleSessions();
  return {
    ...state,
    connectedSessions: Array.from(connectedSessionsMap.values()),
  };
}

export function subscribeAutoUpdateState(
  listener: (next: AutoUpdateState) => void
): () => void {
  ensureChannel();
  ensureStorageFallbackListener();
  stateListeners.add(listener);
  listener(getAutoUpdateSnapshot());
  return () => {
    stateListeners.delete(listener);
  };
}

export function subscribeLiveBus(listener: (event: LiveBusEvent) => void): () => void {
  ensureChannel();
  ensureStorageFallbackListener();
  busListeners.add(listener);
  return () => {
    busListeners.delete(listener);
  };
}

export function announceSessionPresence(profile: {
  role: SessionRole;
  guestNumber: number | null;
  label: string;
}): void {
  currentPresence = profile;
  notifyStateListeners();
  postBusEvent({
    type: 'PRESENCE_PING',
    sourceSessionId: SESSION_ID,
    role: profile.role,
    guestNumber: profile.guestNumber,
    label: profile.label,
    timestamp: Date.now(),
  });
}

export function broadcastConfigSync(): void {
  postBusEvent({
    type: 'CONFIG_SYNC',
    sourceSessionId: SESSION_ID,
    timestamp: Date.now(),
  });
}

export function broadcastGuestRoomsSync(guestNumber: number | null = null): void {
  postBusEvent({
    type: 'GUEST_ROOMS_SYNC',
    sourceSessionId: SESSION_ID,
    guestNumber,
    timestamp: Date.now(),
  });
}

export function broadcastVaultItemsSync(): void {
  postBusEvent({
    type: 'VAULT_ITEMS_SYNC',
    sourceSessionId: SESSION_ID,
    timestamp: Date.now(),
  });
}

export async function checkForAppUpdates(): Promise<{
  updateAvailable: boolean;
  latestVersion: string;
}> {
  if (state.isChecking) {
    return {
      updateAvailable: state.updateAvailable,
      latestVersion: state.latestVersion,
    };
  }

  state = { ...state, isChecking: true };
  notifyStateListeners();

  let detectedNewVersion: string | null = null;

  try {
    if (swRegistrationRef && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        await swRegistrationRef.update();
        if (swRegistrationRef.waiting) {
          detectedNewVersion = `${CURRENT_APP_VERSION}-sw`;
        }
      } catch {
        // ignore transient SW check errors
      }
    }

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const res = await fetch(`/app-version.json?t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (res.ok) {
          const data = (await res.json()) as { version?: string };
          const remoteVer = typeof data.version === 'string' ? data.version.trim() : '';
          const alreadyApplied =
            typeof sessionStorage !== 'undefined' &&
            sessionStorage.getItem(APPLIED_VERSION_SESSION_KEY) === remoteVer;

          if (remoteVer && remoteVer !== CURRENT_APP_VERSION && !alreadyApplied) {
            detectedNewVersion = remoteVer;
          }
        }
      } catch {
        // Offline or network unreachable — keep existing state quietly
      }
    }
  } finally {
    const nextUpdateAvailable = Boolean(detectedNewVersion) || state.updateAvailable;
    const nextLatest = detectedNewVersion || state.latestVersion;

    state = {
      ...state,
      isChecking: false,
      lastCheckedAt: Date.now(),
      latestVersion: nextLatest,
      updateAvailable: nextUpdateAvailable,
    };
    notifyStateListeners();

    if (detectedNewVersion) {
      postBusEvent({
        type: 'APP_UPDATE_SIGNAL',
        sourceSessionId: SESSION_ID,
        version: detectedNewVersion,
        action: 'available',
        timestamp: Date.now(),
      });
    }
  }

  return {
    updateAvailable: state.updateAvailable,
    latestVersion: state.latestVersion,
  };
}

export async function applyPendingAppUpdate(broadcastToPeers = true): Promise<void> {
  if (state.isApplying) return;

  const targetVersion = state.latestVersion || CURRENT_APP_VERSION;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(APPLIED_VERSION_SESSION_KEY, targetVersion);
    }
  } catch {
    // ignore
  }

  state = { ...state, isApplying: true };
  notifyStateListeners();

  if (broadcastToPeers) {
    postBusEvent({
      type: 'APP_UPDATE_SIGNAL',
      sourceSessionId: SESSION_ID,
      version: targetVersion,
      action: 'applying',
      timestamp: Date.now(),
    });
  }

  try {
    if (swUpdateFn) {
      await swUpdateFn(true);
    }
  } catch {
    // Fallback to clean page reload
  }

  if (typeof window !== 'undefined') {
    window.setTimeout(() => {
      window.location.reload();
    }, 180);
  }
}

export function dismissPendingAppUpdate(): void {
  state = {
    ...state,
    updateAvailable: false,
  };
  notifyStateListeners();
}
