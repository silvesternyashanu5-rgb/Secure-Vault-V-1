import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  AppWindow,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Download,
  FileText,
  Film,
  FolderInput,
  HardDrive,
  Lock,
  Megaphone,
  Music,
  Play,
  Plus,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  decryptBinaryData,
  deriveKeyFromSecret,
  encryptBinaryData,
  generateRandomId,
  generateSalt,
  hashAuthSecret,
  wrapMasterKey,
} from '../lib/crypto';
import {
  clearIntruderAttempts,
  deleteHiddenFile,
  getAllHiddenFiles,
  getAllIntruderAttempts,
  putHiddenFile,
  saveHiddenVaultConfig,
} from '../lib/indexedDb';
import { requestCameraPermission } from '../lib/intruderCapture';
import {
  classifyFileSection,
  formatBytes,
  getFileExtension,
} from '../lib/universalFileParser';
import type {
  HiddenFileDecrypted,
  HiddenFileRecord,
  HiddenLayerMode,
  HiddenSection,
  HiddenVaultConfig,
  IntruderAttemptRecord,
} from '../types/hiddenVault';
import type { AdsSettings, AppIconPresetId } from '../types/vault';
import { AdsSectionView } from './AdsSectionView';
import { AppBrandingCard } from './AppBrandingCard';
import { UniversalFileViewer } from './UniversalFileViewer';

type LayerTab = HiddenSection | 'ads' | 'settings';

interface HiddenVaultLayerProps {
  mode: HiddenLayerMode;
  masterKey: CryptoKey | null;
  hiddenConfig: HiddenVaultConfig;
  appDisplayName: string;
  appIconPreset: AppIconPresetId;
  customAppIconDataUrl: string;
  onUpdateAppBranding: (next: {
    appDisplayName: string;
    appIconPreset: AppIconPresetId;
    customAppIconDataUrl: string;
  }) => Promise<void>;
  onConfigUpdated: (next: HiddenVaultConfig) => void;
  onExit: () => void;
}

interface DirFileCandidate {
  name: string;
  handle: FileSystemFileHandle;
  size: number;
}

export const HiddenVaultLayer: React.FC<HiddenVaultLayerProps> = ({
  mode,
  masterKey,
  hiddenConfig,
  appDisplayName,
  appIconPreset,
  customAppIconDataUrl,
  onUpdateAppBranding,
  onConfigUpdated,
  onExit,
}) => {
  const [activeTab, setActiveTab] = useState<LayerTab>('apps');
  const [files, setFiles] = useState<HiddenFileDecrypted[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [viewerFile, setViewerFile] = useState<HiddenFileDecrypted | null>(null);
  const [decoyAdsSettings, setDecoyAdsSettings] = useState<AdsSettings>(
    hiddenConfig.hiddenAdsSettings
  );

  // Settings Sub-Layer: Intruder Attempts Layer
  const [showIntruderLayer, setShowIntruderLayer] = useState(false);
  const [intruderLogs, setIntruderLogs] = useState<IntruderAttemptRecord[]>([]);
  const [previewPhoto, setPreviewPhoto] = useState<IntruderAttemptRecord | null>(null);

  // Permissions Banner & Status
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permStatusMsg, setPermStatusMsg] = useState('');

  // Move from Device Folder modal (File System Access API)
  const [folderDirHandle, setFolderDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [folderFiles, setFolderFiles] = useState<DirFileCandidate[]>([]);
  const [moveNotice, setMoveNotice] = useState('');

  // Add Phone App modal
  const [showAddAppModal, setShowAddAppModal] = useState(false);
  const [showNativeGuideModal, setShowNativeGuideModal] = useState(false);
  const [phoneAppName, setPhoneAppName] = useState('');
  const [phonePackageId, setPhonePackageId] = useState('');
  const [phoneAppScheme, setPhoneAppScheme] = useState('');
  const [webAppUrl, setWebAppUrl] = useState('');

  // Password update inputs inside Settings
  const [newMasterPw, setNewMasterPw] = useState('');
  const [newFakePw, setNewFakePw] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadVaultContents = useCallback(async () => {
    setLoadingFiles(true);
    try {
      if (mode === 'decoy' || !masterKey) {
        setFiles([]);
        setIntruderLogs([]);
        return;
      }

      const records = await getAllHiddenFiles();
      const decrypted: HiddenFileDecrypted[] = [];
      for (const rec of records) {
        try {
          const plain = await decryptBinaryData(masterKey, rec.encryptedData, rec.iv);
          decrypted.push({
            id: rec.id,
            section: rec.section,
            name: rec.name,
            mimeType: rec.mimeType,
            extension: rec.extension,
            size: rec.size,
            appUrl: rec.appUrl,
            packageId: rec.packageId,
            appScheme: rec.appScheme,
            movedFromSource: rec.movedFromSource,
            data: plain,
            createdAt: rec.createdAt,
          });
        } catch {
          // ignore corrupted/mismatched records
        }
      }
      setFiles(decrypted.sort((a, b) => b.createdAt - a.createdAt));

      const logs = await getAllIntruderAttempts();
      setIntruderLogs(logs);
    } finally {
      setLoadingFiles(false);
    }
  }, [masterKey, mode]);

  useEffect(() => {
    void loadVaultContents();
  }, [loadVaultContents]);

  // Prompt permissions once when entering real hidden layer for the first time
  useEffect(() => {
    if (
      mode === 'real' &&
      (!hiddenConfig.permissionsGranted.storage || !hiddenConfig.permissionsGranted.camera)
    ) {
      setShowPermissionModal(true);
    }
  }, [
    hiddenConfig.permissionsGranted.camera,
    hiddenConfig.permissionsGranted.storage,
    mode,
  ]);

  const sectionFiles = useMemo(() => {
    if (activeTab === 'settings' || activeTab === 'ads') return [];
    return files.filter((f) => f.section === activeTab);
  }, [activeTab, files]);

  const activeAdsSettings =
    mode === 'decoy' ? decoyAdsSettings : hiddenConfig.hiddenAdsSettings;

  const handleUpdateHiddenAds = async (partialAds: Partial<AdsSettings>) => {
    const nextAds: AdsSettings = {
      ...activeAdsSettings,
      ...partialAds,
    };
    if (mode === 'decoy') {
      setDecoyAdsSettings(nextAds);
      return;
    }
    const updated: HiddenVaultConfig = {
      ...hiddenConfig,
      hiddenAdsSettings: nextAds,
      updatedAt: Date.now(),
    };
    await saveHiddenVaultConfig(updated);
    onConfigUpdated(updated);
  };

  const handleResetHiddenAdId = async () => {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const nextId = `hl_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
    await handleUpdateHiddenAds({ adId: nextId });
  };

  const sectionCounts = useMemo(() => {
    return {
      apps: files.filter((f) => f.section === 'apps').length,
      music: files.filter((f) => f.section === 'music').length,
      documents: files.filter((f) => f.section === 'documents').length,
      videos: files.filter((f) => f.section === 'videos').length,
    };
  }, [files]);

  const handleRequestAllPermissions = async () => {
    setPermStatusMsg('');
    let storageOk = hiddenConfig.permissionsGranted.storage;
    if (navigator.storage && navigator.storage.persist) {
      try {
        storageOk = await navigator.storage.persist();
      } catch {
        storageOk = true;
      }
    } else {
      storageOk = true;
    }

    const cameraOk = await requestCameraPermission();
    const updated: HiddenVaultConfig = {
      ...hiddenConfig,
      permissionsGranted: {
        ...hiddenConfig.permissionsGranted,
        storage: storageOk,
        camera: cameraOk,
      },
      updatedAt: Date.now(),
    };
    await saveHiddenVaultConfig(updated);
    onConfigUpdated(updated);

    setPermStatusMsg(
      cameraOk
        ? 'Permissions granted: Encrypted storage and front-camera intruder protection are active.'
        : 'Storage permission active. Camera permission was denied or unavailable in this browser.'
    );
    setShowPermissionModal(false);
  };

  const encryptAndStoreFile = async (params: {
    name: string;
    mimeType: string;
    data: ArrayBuffer;
    targetSection?: HiddenSection;
    appUrl?: string;
    packageId?: string;
    appScheme?: string;
    movedFromSource: boolean;
  }) => {
    if (mode === 'decoy' || !masterKey) {
      // Decoy session does not save anything persistently
      const section =
        params.targetSection || classifyFileSection(params.name, params.mimeType);
      const temp: HiddenFileDecrypted = {
        id: `decoy_${generateRandomId()}`,
        section,
        name: params.name,
        mimeType: params.mimeType,
        extension: getFileExtension(params.name),
        size: params.data.byteLength,
        appUrl: params.appUrl,
        packageId: params.packageId,
        appScheme: params.appScheme,
        movedFromSource: params.movedFromSource,
        data: params.data,
        createdAt: Date.now(),
      };
      setFiles((prev) => [temp, ...prev]);
      return;
    }

    const section =
      params.targetSection || classifyFileSection(params.name, params.mimeType);
    const enc = await encryptBinaryData(masterKey, params.data);
    const record: HiddenFileRecord = {
      id: `hf_${generateRandomId()}`,
      section,
      name: params.name,
      mimeType: params.mimeType || 'application/octet-stream',
      extension: getFileExtension(params.name),
      size: params.data.byteLength,
      appUrl: params.appUrl,
      packageId: params.packageId,
      appScheme: params.appScheme,
      movedFromSource: params.movedFromSource,
      encryptedData: enc.encryptedData,
      iv: enc.iv,
      createdAt: Date.now(),
    };

    await putHiddenFile(record);
    setFiles((prev) => [
      {
        id: record.id,
        section: record.section,
        name: record.name,
        mimeType: record.mimeType,
        extension: record.extension,
        size: record.size,
        appUrl: record.appUrl,
        packageId: record.packageId,
        appScheme: record.appScheme,
        movedFromSource: record.movedFromSource,
        data: params.data,
        createdAt: record.createdAt,
      },
      ...prev,
    ]);
  };

  const handleImportFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setMoveNotice('');
    const targetSection =
      activeTab === 'settings' || activeTab === 'ads' ? undefined : activeTab;

    for (const file of Array.from(fileList)) {
      const buffer = await file.arrayBuffer();
      await encryptAndStoreFile({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        data: buffer,
        targetSection,
        movedFromSource: false,
      });
    }
    setMoveNotice(
      `Encrypted & hidden ${fileList.length} item${fileList.length > 1 ? 's' : ''} inside IndexedDB. Browser security sandboxes prevent deleting files picked via standard dialog—remove the original from your phone gallery/files if needed, or use "Move from Folder" on supported browsers.`
    );
  };

  const handleOpenDeviceFolderToMove = async () => {
    setMoveNotice('');
    const win = window as unknown as {
      showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
    };

    if (!win.showDirectoryPicker) {
      setMoveNotice(
        'Direct folder-move (auto-delete original) requires Chrome/Edge File System Access outside an iframe. Using standard encrypted import instead.'
      );
      fileInputRef.current?.click();
      return;
    }

    try {
      const dirHandle = await win.showDirectoryPicker({ mode: 'readwrite' });
      const candidates: DirFileCandidate[] = [];
      for await (const [, entry] of (
        dirHandle as unknown as {
          entries: () => AsyncIterable<[string, FileSystemHandle]>;
        }
      ).entries()) {
        if (entry.kind === 'file') {
          const fh = entry as FileSystemFileHandle;
          const f = await fh.getFile();
          candidates.push({ name: f.name, handle: fh, size: f.size });
        }
      }
      setFolderDirHandle(dirHandle);
      setFolderFiles(candidates);

      if (mode === 'real') {
        const updated = {
          ...hiddenConfig,
          permissionsGranted: { ...hiddenConfig.permissionsGranted, directoryMove: true },
          updatedAt: Date.now(),
        };
        await saveHiddenVaultConfig(updated);
        onConfigUpdated(updated);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('AbortError') || msg.includes('cancelled')) return;
      setMoveNotice(
        'Folder access is restricted in this browser frame; opening standard file import instead.'
      );
      fileInputRef.current?.click();
    }
  };

  const handleMoveCandidateFromFolder = async (candidate: DirFileCandidate) => {
    if (!folderDirHandle) return;
    const file = await candidate.handle.getFile();
    const buffer = await file.arrayBuffer();
    const targetSection =
      activeTab === 'settings' || activeTab === 'ads' ? undefined : activeTab;

    await encryptAndStoreFile({
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      data: buffer,
      targetSection,
      movedFromSource: true,
    });

    try {
      await folderDirHandle.removeEntry(candidate.name);
      setFolderFiles((prev) => prev.filter((c) => c.name !== candidate.name));
      setMoveNotice(
        `"${candidate.name}" was encrypted into SecureVault and removed from your local folder.`
      );
    } catch {
      setMoveNotice(
        `"${candidate.name}" was encrypted into SecureVault, but the OS blocked deleting the original.`
      );
    }
  };

  const handleAddPhoneApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneAppName.trim()) return;
    if (!phonePackageId.trim() && !phoneAppScheme.trim() && !webAppUrl.trim()) return;

    const normalizedUrl = webAppUrl.trim()
      ? webAppUrl.startsWith('http://') || webAppUrl.startsWith('https://')
        ? webAppUrl.trim()
        : `https://${webAppUrl.trim()}`
      : undefined;

    await encryptAndStoreFile({
      name: phoneAppName.trim(),
      mimeType: 'application/x-phone-app',
      data: new TextEncoder().encode(
        phonePackageId.trim() || phoneAppScheme.trim() || normalizedUrl || ''
      ).buffer,
      targetSection: 'apps',
      appUrl: normalizedUrl,
      packageId: phonePackageId.trim() || undefined,
      appScheme: phoneAppScheme.trim() || undefined,
      movedFromSource: true,
    });

    setPhoneAppName('');
    setPhonePackageId('');
    setPhoneAppScheme('');
    setWebAppUrl('');
    setShowAddAppModal(false);
  };

  const handleDeleteHiddenItem = async (id: string) => {
    if (mode === 'real') {
      await deleteHiddenFile(id);
    }
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (viewerFile?.id === id) setViewerFile(null);
  };

  const handleDownloadRestore = (file: HiddenFileDecrypted) => {
    const blob = new Blob([file.data], {
      type: file.mimeType || 'application/octet-stream',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpdateHiddenPasswords = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg('');
    if (mode !== 'real' || !masterKey) return;

    if (newMasterPw && newMasterPw.length < 4) {
      setPwMsg('Master password must be at least 4 characters.');
      return;
    }
    if (newFakePw && newFakePw.length < 4) {
      setPwMsg('Fake password must be at least 4 characters.');
      return;
    }

    const updated = { ...hiddenConfig };

    if (newMasterPw) {
      const mSalt = generateSalt(16);
      updated.masterPasswordSalt = mSalt;
      updated.masterPasswordHash = await hashAuthSecret(newMasterPw, mSalt);
      const wrapKey = await deriveKeyFromSecret(newMasterPw, updated.vaultSalt);
      const wrapped = await wrapMasterKey(masterKey, wrapKey);
      updated.wrappedKey = wrapped.wrappedKey;
      updated.wrappedKeyIv = wrapped.iv;
    }

    if (newFakePw) {
      const fSalt = generateSalt(16);
      updated.fakePasswordSalt = fSalt;
      updated.fakePasswordHash = await hashAuthSecret(newFakePw, fSalt);
    }

    updated.updatedAt = Date.now();
    await saveHiddenVaultConfig(updated);
    onConfigUpdated(updated);
    setNewMasterPw('');
    setNewFakePw('');
    setPwMsg('Hidden layer passwords updated.');
  };

  const handleClearIntruderLogs = async () => {
    await clearIntruderAttempts();
    setIntruderLogs([]);
  };

  const tabs: {
    id: LayerTab;
    label: string;
    Icon: React.FC<{ className?: string }>;
    count?: number;
  }[] = [
    { id: 'apps', label: 'Apps', Icon: AppWindow, count: sectionCounts.apps },
    { id: 'music', label: 'Music', Icon: Music, count: sectionCounts.music },
    { id: 'documents', label: 'Documents', Icon: FileText, count: sectionCounts.documents },
    { id: 'videos', label: 'Videos', Icon: Film, count: sectionCounts.videos },
    { id: 'ads', label: 'Ads', Icon: Megaphone },
    { id: 'settings', label: 'Settings', Icon: Settings },
  ];

  return (
    <div className="fixed inset-0 z-40 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col overflow-hidden">
      {/* Hidden Layer Top Header */}
      <header className="h-14 lg:h-16 px-4 sm:px-6 lg:px-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onExit}
            className="min-h-[40px] flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span className="font-display text-base sm:text-lg font-bold tracking-tight">
              {mode === 'decoy' ? 'Private Space' : 'Hidden Media Vault'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPermissionModal(true)}
            className="min-h-[38px] hidden sm:flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Permissions</span>
          </button>
          <button
            type="button"
            onClick={onExit}
            className="min-h-[38px] flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-emerald-500 cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Lock Layer</span>
          </button>
        </div>
      </header>

      {/* Section Layer Navigation Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 lg:px-8 shrink-0">
        <div className="max-w-6xl mx-auto flex items-center gap-2 overflow-x-auto py-2.5">
          {tabs.map(({ id, label, Icon, count }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setActiveTab(id);
                setShowIntruderLayer(false);
              }}
              className={`min-h-[40px] flex items-center gap-2 px-4 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeTab === id
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
              {typeof count === 'number' && (
                <span className="font-mono text-xs opacity-80 tabular-nums">({count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Body */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {activeTab !== 'settings' && activeTab !== 'ads' ? (
            <>
              {/* Action Bar for Apps / Music / Documents / Videos */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-xl sm:text-2xl font-bold capitalize text-slate-900 dark:text-white">
                    Hidden {activeTab}
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    {activeTab === 'apps'
                      ? 'Hide phone app launchers (Android package / deep-link) or .apk / .ipa installer packages inside encrypted vault storage.'
                      : activeTab === 'music'
                        ? 'Encrypted audio library with built-in player and track queue.'
                        : activeTab === 'videos'
                          ? 'Encrypted video vault with built-in playback controls.'
                          : 'Universal encrypted file & document vault supporting PDF, Office, CSV, JSON, images, archives, and raw binaries.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {activeTab === 'apps' && (
                    <button
                      type="button"
                      onClick={() => setShowAddAppModal(true)}
                      className="min-h-[42px] flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Phone App</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleOpenDeviceFolderToMove()}
                    className="min-h-[42px] flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <FolderInput className="w-4 h-4 text-emerald-600" />
                    <span>Move from Folder</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[42px] flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>{activeTab === 'apps' ? 'Hide App File (.apk)' : 'Hide File(s)'}</span>
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="*/*"
                    onChange={(e) => {
                      void handleImportFiles(e.target.files);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </div>
              </div>

              {activeTab === 'apps' && (
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-start gap-3 max-w-3xl">
                    <Smartphone className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      <strong className="text-slate-900 dark:text-white">
                        Phone OS Security Note:
                      </strong>{' '}
                      Because browsers sandbox web PWAs, Android and iOS do not allow any web app to directly delete or hide installed native icons from your phone&apos;s home screen. You can move <code className="font-mono">.apk</code> packages here, launch phone apps from inside this layer, or follow the OS guide to hide native home-screen icons.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNativeGuideModal(true)}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Hide Home Screen Icon Guide
                  </button>
                </div>
              )}

              {moveNotice && (
                <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 px-4 py-3 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-3">
                  <span>{moveNotice}</span>
                  <button
                    type="button"
                    onClick={() => setMoveNotice('')}
                    className="text-emerald-700 dark:text-emerald-300 font-semibold cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Folder Move Browser when directory access is open */}
              {folderDirHandle && (
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      Folder: {folderDirHandle.name} (Click Move to encrypt &amp; remove from folder)
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFolderDirHandle(null);
                        setFolderFiles([]);
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      Close Folder
                    </button>
                  </div>
                  {folderFiles.length === 0 ? (
                    <p className="text-xs text-slate-500">No remaining files in this folder.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {folderFiles.map((cand) => (
                        <div
                          key={cand.name}
                          className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-medium truncate">{cand.name}</div>
                            <div className="font-mono text-slate-400 tabular-nums">
                              {formatBytes(cand.size)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleMoveCandidateFromFolder(cand)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 shrink-0 cursor-pointer"
                          >
                            Move
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Section Files Grid */}
              {loadingFiles ? (
                <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500">
                  Decrypting hidden {activeTab}...
                </div>
              ) : sectionFiles.length === 0 ? (
                <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-12 text-center">
                  <p className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                    No {activeTab} in this layer
                  </p>
                  <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    {mode === 'decoy'
                      ? 'This private space is currently empty. Add items using the controls above.'
                      : 'Move or import any file format to encrypt it inside IndexedDB and open it directly inside the app.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sectionFiles.map((file) => (
                    <div
                      key={file.id}
                      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between gap-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {file.name}
                          </h3>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            <span>
                              {file.packageId
                                ? file.packageId
                                : file.appScheme
                                  ? 'Phone App'
                                  : file.appUrl
                                    ? 'App Link'
                                    : (file.extension || 'BIN').toUpperCase()}
                            </span>
                            {!file.appUrl && !file.packageId && !file.appScheme && (
                              <>
                                <span aria-hidden="true"> · </span>
                                <span className="font-mono tabular-nums">
                                  {formatBytes(file.size)}
                                </span>
                              </>
                            )}
                            {file.movedFromSource && !file.packageId && !file.appScheme && (
                              <>
                                <span aria-hidden="true"> · </span>
                                <span>Moved</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => setViewerFile(file)}
                          className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>
                            {file.section === 'apps'
                              ? file.appUrl || file.packageId || file.appScheme
                                ? 'Launch App'
                                : 'Inspect Package'
                              : file.section === 'music'
                                ? 'Play Audio'
                                : file.section === 'videos'
                                  ? 'Play Video'
                                  : 'Open File'}
                          </span>
                        </button>

                        {!file.appUrl && !file.packageId && !file.appScheme && (
                          <button
                            type="button"
                            onClick={() => handleDownloadRestore(file)}
                            aria-label="Restore file to device"
                            title="Restore to device"
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => void handleDeleteHiddenItem(file.id)}
                          aria-label="Delete hidden item"
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : activeTab === 'ads' ? (
            <AdsSectionView
              adsSettings={activeAdsSettings}
              onUpdateAds={handleUpdateHiddenAds}
              onResetAdId={handleResetHiddenAdId}
              scopeLabel="Hidden Layer"
            />
          ) : showIntruderLayer ? (
            /* NEW SUB-LAYER INSIDE SETTINGS: Intruder Attempts & Camera Snapshots */
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowIntruderLayer(false)}
                    className="min-h-[40px] flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Settings</span>
                  </button>
                  <div>
                    <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                      Intruder Attempts Layer
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Tracks failed password attempts, exact timestamps, and front-camera captures.
                    </p>
                  </div>
                </div>

                {mode === 'real' && intruderLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleClearIntruderLogs()}
                    className="min-h-[40px] px-3.5 rounded-xl border border-rose-200 dark:border-rose-900/50 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                  >
                    Clear All Logs
                  </button>
                )}
              </div>

              {mode === 'decoy' || intruderLogs.length === 0 ? (
                <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center">
                  <ShieldCheck className="w-8 h-8 text-emerald-600 mx-auto" />
                  <h2 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-white">
                    No failed attempts recorded
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Whenever an incorrect password is entered at the logo gate, the attempt time,
                    input, and front-camera photo are logged here.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {intruderLogs.map((log, index) => (
                    <div
                      key={log.id}
                      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col"
                    >
                      {log.photoDataUrl ? (
                        <button
                          type="button"
                          onClick={() => setPreviewPhoto(log)}
                          className="relative aspect-video bg-slate-950 overflow-hidden cursor-pointer group"
                        >
                          <img
                            src={log.photoDataUrl}
                            alt={`Intruder attempt #${intruderLogs.length - index}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </button>
                      ) : (
                        <div className="aspect-video bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
                          <Camera className="w-6 h-6 text-slate-400 mb-1" />
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {log.cameraStatus === 'denied'
                              ? 'Camera permission denied'
                              : 'Camera hardware unavailable'}
                          </span>
                        </div>
                      )}

                      <div className="p-4 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-white">
                          <span>Attempt #{intruderLogs.length - index}</span>
                          <span className="font-mono text-rose-600 dark:text-rose-400">
                            Failed
                          </span>
                        </div>
                        <div className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                          {new Date(log.timestamp).toLocaleString()}
                        </div>
                        <div className="pt-1 text-slate-600 dark:text-slate-300">
                          Entered:{' '}
                          <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {log.attemptedInput}
                          </code>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* HIDDEN LAYER SETTINGS SECTION */
            <div className="max-w-3xl space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                  Hidden Layer Settings
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Manage permissions, dual passwords, and intruder security captures.
                </p>
              </div>

              {/* Intruder Attempts New Layer Entry Card */}
              <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                      Intruder Attempts &amp; Camera Capture Layer
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {mode === 'decoy'
                        ? '0 failed attempts logged.'
                        : `${intruderLogs.length} failed unlock attempt${intruderLogs.length === 1 ? '' : 's'} recorded with timestamps and front-camera photos.`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIntruderLayer(true)}
                  className="min-h-[42px] px-4 rounded-xl bg-slate-900 dark:bg-emerald-600 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-emerald-500 cursor-pointer"
                >
                  Open Intruder Layer
                </button>
              </section>

              {/* Permissions Management */}
              <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                      System &amp; Device Permissions
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Required for encrypted local file hiding, folder moving, and intruder selfies.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRequestAllPermissions()}
                    className="min-h-[40px] px-4 rounded-xl bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                  >
                    Grant Permissions
                  </button>
                </div>

                {permStatusMsg && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">{permStatusMsg}</p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
                      <HardDrive className="w-4 h-4 text-emerald-600" />
                      <span>Persistent Storage</span>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {hiddenConfig.permissionsGranted.storage ? 'Active' : 'Not requested'}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
                      <Camera className="w-4 h-4 text-emerald-600" />
                      <span>Front Camera</span>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {hiddenConfig.permissionsGranted.camera ? 'Granted' : 'Pending / Denied'}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
                      <FolderInput className="w-4 h-4 text-emerald-600" />
                      <span>Folder Move</span>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {hiddenConfig.permissionsGranted.directoryMove
                        ? 'Authorized'
                        : 'Requested on Move'}
                    </div>
                  </div>
                </div>
              </section>

              {/* App Name & Icon Disguise Customization */}
              <AppBrandingCard
                appDisplayName={appDisplayName}
                appIconPreset={appIconPreset}
                customAppIconDataUrl={customAppIconDataUrl}
                onSaveBranding={onUpdateAppBranding}
              />

              {/* Master vs Fake Password Management (Real Mode only) */}
              {mode === 'real' && (
                <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    Update Master &amp; Fake Decoy Passwords
                  </h2>
                  <form onSubmit={handleUpdateHiddenPasswords} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="password"
                        value={newMasterPw}
                        onChange={(e) => setNewMasterPw(e.target.value)}
                        placeholder="New Master Password (optional)"
                        className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <input
                        type="password"
                        value={newFakePw}
                        onChange={(e) => setNewFakePw(e.target.value)}
                        placeholder="New Fake Password (optional)"
                        className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    {pwMsg && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">{pwMsg}</p>
                    )}
                    <button
                      type="submit"
                      className="min-h-[42px] px-4 rounded-xl bg-slate-900 dark:bg-slate-800 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                    >
                      Save Updated Passwords
                    </button>
                  </form>
                </section>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Universal In-App Player / Document / App Viewer */}
      <UniversalFileViewer
        file={viewerFile}
        queue={viewerFile?.section === 'music' ? sectionFiles : []}
        onClose={() => setViewerFile(null)}
        onSelectFromQueue={(next) => setViewerFile(next)}
        onDownloadRestore={handleDownloadRestore}
      />

      {/* Permission Request Modal */}
      {showPermissionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Hidden Layer Permissions
              </h3>
              <button
                type="button"
                onClick={() => setShowPermissionModal(false)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              To hide apps, music, documents, and videos securely and capture intruder photos on
              failed password attempts, grant the following permissions:
            </p>
            <ul className="space-y-2.5 text-xs text-slate-700 dark:text-slate-200">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Persistent Encrypted Storage</strong>: Keeps hidden files isolated inside
                  IndexedDB and prevents eviction.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <Camera className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Front Camera Access</strong>: Captures an intruder snapshot when an
                  incorrect password is entered.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  <strong>Folder Move Access</strong>: Requested when choosing a device folder to
                  move &amp; remove original files from phone storage.
                </span>
              </li>
            </ul>
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowPermissionModal(false)}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                Later
              </button>
              <button
                type="button"
                onClick={() => void handleRequestAllPermissions()}
                className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
              >
                Allow Permissions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Phone App Modal */}
      {showAddAppModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleAddPhoneApp}
            className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Add Phone App to Hidden Layer
              </h3>
              <button
                type="button"
                onClick={() => setShowAddAppModal(false)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
                Quick-Fill Popular Phone Apps
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { name: 'WhatsApp', pkg: 'com.whatsapp', scheme: 'whatsapp://' },
                  { name: 'Instagram', pkg: 'com.instagram.android', scheme: 'instagram://' },
                  { name: 'Telegram', pkg: 'org.telegram.messenger', scheme: 'tg://' },
                  { name: 'Signal', pkg: 'org.thoughtcrime.securesms', scheme: 'sgnl://' },
                  { name: 'Snapchat', pkg: 'com.snapchat.android', scheme: 'snapchat://' },
                  { name: 'TikTok', pkg: 'com.zhiliaoapp.musically', scheme: 'snssdk1233://' },
                ].map((preset) => (
                  <button
                    key={preset.pkg}
                    type="button"
                    onClick={() => {
                      setPhoneAppName(preset.name);
                      setPhonePackageId(preset.pkg);
                      setPhoneAppScheme(preset.scheme);
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Phone App Name
              </label>
              <input
                type="text"
                required
                value={phoneAppName}
                onChange={(e) => setPhoneAppName(e.target.value)}
                placeholder="e.g., WhatsApp or Banking App"
                className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Android Package ID
                </label>
                <input
                  type="text"
                  value={phonePackageId}
                  onChange={(e) => setPhonePackageId(e.target.value)}
                  placeholder="com.whatsapp"
                  className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  App URI Scheme
                </label>
                <input
                  type="text"
                  value={phoneAppScheme}
                  onChange={(e) => setPhoneAppScheme(e.target.value)}
                  placeholder="whatsapp://"
                  className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Optional Web Fallback URL
              </label>
              <input
                type="url"
                value={webAppUrl}
                onChange={(e) => setWebAppUrl(e.target.value)}
                placeholder="https://web.whatsapp.com (optional)"
                className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
            >
              Save Phone App to Hidden Layer
            </button>
          </form>
        </div>
      )}

      {/* Native Phone OS Home-Screen Icon Hiding Guide Modal */}
      {showNativeGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                How to Hide Native App Icons on Your Phone
              </h3>
              <button
                type="button"
                onClick={() => setShowNativeGuideModal(false)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <p>
                A browser-based PWA cannot directly modify your phone&apos;s system launcher or uninstall native apps. To completely remove an app icon from your phone&apos;s home screen while keeping it accessible:
              </p>
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5 space-y-1">
                <div className="font-semibold text-slate-900 dark:text-white">
                  Android 15+ (Built-in Private Space)
                </div>
                <p>
                  Open <strong>Settings → Security &amp; privacy → Private space</strong>, install or move sensitive apps inside it, and toggle <em>Hide private space when locked</em>.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5 space-y-1">
                <div className="font-semibold text-slate-900 dark:text-white">
                  Samsung Galaxy (Secure Folder)
                </div>
                <p>
                  Open <strong>Settings → Security and privacy → Secure Folder</strong>, add apps inside Secure Folder, then uninstall the duplicate public copy from your home screen.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5 space-y-1">
                <div className="font-semibold text-slate-900 dark:text-white">
                  iPhone (iOS 18+ Hide &amp; Require Face ID)
                </div>
                <p>
                  Touch and hold any app icon on your Home Screen → tap <strong>Require Face ID → Hide and Require Face ID</strong> to move it out of the home screen into the locked Hidden folder.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowNativeGuideModal(false)}
              className="w-full min-h-[42px] rounded-xl bg-slate-900 dark:bg-emerald-600 text-xs font-semibold text-white cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* Full-Size Intruder Photo Modal */}
      {previewPhoto && previewPhoto.photoDataUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="max-w-lg w-full rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-slate-600 dark:text-slate-300">
                {new Date(previewPhoto.timestamp).toLocaleString()}
              </span>
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={previewPhoto.photoDataUrl}
              alt="Intruder snapshot"
              className="w-full rounded-2xl object-cover"
            />
          </div>
        </div>
      )}
    </div>
  );
};
