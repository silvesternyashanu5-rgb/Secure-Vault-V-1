import { useCallback, useEffect, useRef, useState } from 'react';
import {
  announceSessionPresence,
  applyPendingAppUpdate,
  checkForAppUpdates,
  dismissPendingAppUpdate,
  getAutoUpdateSnapshot,
  initAutoUpdater,
  subscribeAutoUpdateState,
  type AutoUpdateState,
  type SessionRole,
} from '../lib/autoUpdater';

interface UseAutoUpdateSystemOptions {
  autoUpdateEnabled: boolean;
  role: SessionRole;
  guestNumber: number | null;
  profileLabel: string;
  onSyncAllData?: () => Promise<void>;
}

export interface AutoUpdateController extends AutoUpdateState {
  countdownSeconds: number | null;
  pausedWhileTyping: boolean;
  checkNow: () => Promise<{ updateAvailable: boolean; latestVersion: string }>;
  applyNow: () => Promise<void>;
  dismissUpdate: () => void;
}

export function useAutoUpdateSystem({
  autoUpdateEnabled,
  role,
  guestNumber,
  profileLabel,
  onSyncAllData,
}: UseAutoUpdateSystemOptions): AutoUpdateController {
  const [updateState, setUpdateState] = useState<AutoUpdateState>(() =>
    getAutoUpdateSnapshot()
  );
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [pausedWhileTyping, setPausedWhileTyping] = useState(false);

  const onSyncRef = useRef(onSyncAllData);
  onSyncRef.current = onSyncAllData;

  useEffect(() => {
    initAutoUpdater();
    return subscribeAutoUpdateState(setUpdateState);
  }, []);

  // Announce active User / Guest Room presence so all tabs stay connected
  useEffect(() => {
    announceSessionPresence({
      role,
      guestNumber,
      label: profileLabel,
    });
    const heartbeat = window.setInterval(() => {
      announceSessionPresence({
        role,
        guestNumber,
        label: profileLabel,
      });
    }, 25_000);
    return () => window.clearInterval(heartbeat);
  }, [role, guestNumber, profileLabel]);

  const checkNow = useCallback(async () => {
    const res = await checkForAppUpdates();
    if (onSyncRef.current) {
      try {
        await onSyncRef.current();
      } catch {
        // Sync errors are surfaced via normal runtime handlers
      }
    }
    return res;
  }, []);

  // Periodic automatic update checks (startup, online, focus/visibility, 45s interval)
  useEffect(() => {
    if (!autoUpdateEnabled) return;

    const initialTimer = window.setTimeout(() => {
      void checkForAppUpdates();
    }, 3000);

    const handleOnline = () => {
      void checkNow();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkForAppUpdates();
      }
    };

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void checkForAppUpdates();
      }
    }, 45_000);

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [autoUpdateEnabled, checkNow]);

  // Safe auto-apply countdown when an update becomes available (pauses if user is typing)
  useEffect(() => {
    if (!autoUpdateEnabled || !updateState.updateAvailable || updateState.isApplying) {
      setCountdownSeconds(null);
      setPausedWhileTyping(false);
      return;
    }

    let remaining = 4;
    setCountdownSeconds(remaining);

    const timer = window.setInterval(() => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isEditing = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';
      if (isEditing) {
        setPausedWhileTyping(true);
        return;
      }
      setPausedWhileTyping(false);
      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(timer);
        setCountdownSeconds(null);
        void applyPendingAppUpdate(true);
      } else {
        setCountdownSeconds(remaining);
      }
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [autoUpdateEnabled, updateState.updateAvailable, updateState.isApplying]);

  return {
    ...updateState,
    countdownSeconds,
    pausedWhileTyping,
    checkNow,
    applyNow: () => applyPendingAppUpdate(true),
    dismissUpdate: dismissPendingAppUpdate,
  };
}
