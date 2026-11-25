import type { VaultItemStored } from '../types/vault';

export interface SyncConflict {
  itemId: string;
  localItem: VaultItemStored;
  remoteItem: VaultItemStored;
  detectedAt: number;
}

export type ConflictPolicy = 'latest-wins' | 'ask-me';

const BASELINE_STORAGE_KEY = 'securevault_sync_baselines';

export interface SyncBaselineMap {
  [itemId: string]: {
    clientUpdatedAt: number;
    digest: string;
  };
}

export async function computeItemIntegrityDigest(item: VaultItemStored): Promise<string> {
  const canonical = JSON.stringify({
    id: item.id,
    title: item.title,
    category: item.category,
    username: item.username,
    url: item.url,
    encryptedPayload: item.encryptedPayload,
    iv: item.iv,
    favorite: item.favorite,
    deleted: item.deleted,
  });
  const encoded = new TextEncoder().encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const bytes = new Uint8Array(hashBuffer);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export function loadSyncBaselines(): SyncBaselineMap {
  try {
    const raw = localStorage.getItem(BASELINE_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SyncBaselineMap;
  } catch {
    return {};
  }
}

export function saveSyncBaselines(baselines: SyncBaselineMap): void {
  try {
    localStorage.setItem(BASELINE_STORAGE_KEY, JSON.stringify(baselines));
  } catch {
    // ignore storage errors
  }
}

export async function reconcileVaultItems(params: {
  localItems: VaultItemStored[];
  remoteItems: VaultItemStored[];
  policy: ConflictPolicy;
}): Promise<{
  merged: VaultItemStored[];
  toPushToCloud: VaultItemStored[];
  toSaveLocally: VaultItemStored[];
  conflicts: SyncConflict[];
  updatedBaselines: SyncBaselineMap;
}> {
  const { localItems, remoteItems, policy } = params;
  const baselines = loadSyncBaselines();
  const updatedBaselines: SyncBaselineMap = { ...baselines };

  const localMap = new Map(localItems.map((i) => [i.id, i]));
  const remoteMap = new Map(remoteItems.map((i) => [i.id, i]));
  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);

  const merged: VaultItemStored[] = [];
  const toPushToCloud: VaultItemStored[] = [];
  const toSaveLocally: VaultItemStored[] = [];
  const conflicts: SyncConflict[] = [];

  for (const id of allIds) {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);

    if (local && !remote) {
      merged.push(local);
      toPushToCloud.push(local);
      updatedBaselines[id] = {
        clientUpdatedAt: local.clientUpdatedAt,
        digest: await computeItemIntegrityDigest(local),
      };
      continue;
    }

    if (!local && remote) {
      merged.push(remote);
      toSaveLocally.push(remote);
      updatedBaselines[id] = {
        clientUpdatedAt: remote.clientUpdatedAt,
        digest: await computeItemIntegrityDigest(remote),
      };
      continue;
    }

    if (local && remote) {
      const localDigest = await computeItemIntegrityDigest(local);
      const remoteDigest = await computeItemIntegrityDigest(remote);

      if (localDigest === remoteDigest) {
        const winner =
          local.clientUpdatedAt >= remote.clientUpdatedAt ? local : remote;
        merged.push(winner);
        updatedBaselines[id] = {
          clientUpdatedAt: winner.clientUpdatedAt,
          digest: localDigest,
        };
        continue;
      }

      const baseline = baselines[id];
      const localChangedSinceSync = baseline
        ? localDigest !== baseline.digest
        : true;
      const remoteChangedSinceSync = baseline
        ? remoteDigest !== baseline.digest
        : true;

      if (
        policy === 'ask-me' &&
        localChangedSinceSync &&
        remoteChangedSinceSync &&
        Math.abs(local.clientUpdatedAt - remote.clientUpdatedAt) > 1000
      ) {
        conflicts.push({
          itemId: id,
          localItem: local,
          remoteItem: remote,
          detectedAt: Date.now(),
        });
        merged.push(local);
        continue;
      }

      // Deterministic conflict resolution: newest timestamp wins (or remote if one side hasn't changed)
      if (!localChangedSinceSync && remoteChangedSinceSync) {
        merged.push(remote);
        toSaveLocally.push(remote);
        updatedBaselines[id] = {
          clientUpdatedAt: remote.clientUpdatedAt,
          digest: remoteDigest,
        };
      } else if (localChangedSinceSync && !remoteChangedSinceSync) {
        merged.push(local);
        toPushToCloud.push(local);
        updatedBaselines[id] = {
          clientUpdatedAt: local.clientUpdatedAt,
          digest: localDigest,
        };
      } else if (remote.clientUpdatedAt > local.clientUpdatedAt) {
        merged.push(remote);
        toSaveLocally.push(remote);
        updatedBaselines[id] = {
          clientUpdatedAt: remote.clientUpdatedAt,
          digest: remoteDigest,
        };
      } else {
        merged.push(local);
        toPushToCloud.push(local);
        updatedBaselines[id] = {
          clientUpdatedAt: local.clientUpdatedAt,
          digest: localDigest,
        };
      }
    }
  }

  saveSyncBaselines(updatedBaselines);

  return {
    merged,
    toPushToCloud,
    toSaveLocally,
    conflicts,
    updatedBaselines,
  };
}
