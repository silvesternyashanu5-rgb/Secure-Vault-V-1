import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Calculator,
  Check,
  Cloud,
  CloudOff,
  Copy,
  CreditCard,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Lock,
  LogOut,
  Megaphone,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Star,
  StickyNote,
  Sun,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { AutoUpdateController } from '../hooks/useAutoUpdateSystem';
import type { SyncConflict } from '../lib/syncEngine';
import type {
  AdsSettings,
  GuestRoomRecord,
  VaultCategory,
  VaultConfig,
  VaultItemDecrypted,
} from '../types/vault';
import { AdsSectionView } from './AdsSectionView';
import { AppBrandIcon } from './AppBrandIcon';
import { PasswordGeneratorView } from './PasswordGeneratorView';
import { PWAInstallButton } from './PWAInstallButton';
import { SettingsView } from './SettingsView';
import { VaultItemModal } from './VaultItemModal';

type NavTab = 'vault' | 'generator' | 'ads' | 'settings';
type FilterScope = 'all' | 'favorites' | VaultCategory;

interface VaultDashboardProps {
  items: VaultItemDecrypted[];
  config: VaultConfig;
  isGuestMode: boolean;
  guestNumber: number | null;
  guestRooms: GuestRoomRecord[];
  cloudUser: User | null;
  pendingSyncCount: number;
  isSyncing: boolean;
  conflicts: SyncConflict[];
  conflictPolicy: 'latest-wins' | 'ask-me';
  autoUpdate: AutoUpdateController;
  onChangeConflictPolicy: (policy: 'latest-wins' | 'ask-me') => void;
  onOpenConflictModal: () => void;
  onSaveItem: (data: {
    id?: string;
    title: string;
    category: VaultCategory;
    username: string;
    url: string;
    secretValue: string;
    notes: string;
    favorite: boolean;
  }) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onToggleFavorite: (id: string) => Promise<void>;
  onUpdateConfig: (partial: Partial<VaultConfig>) => Promise<void>;
  onChangeLockCredential: (mode: 'pin' | 'password', newSecret: string) => Promise<void>;
  onToggleBiometrics: (enable: boolean) => Promise<{ notice?: string }>;
  onSignInGoogle: () => Promise<void>;
  onSignOutGoogle: () => Promise<void>;
  onManualSync: () => Promise<void>;
  onLockVault: () => void;
  onExitGuestToSetup: () => void;
  onSwitchGuestRoom: (guestNumber?: number) => Promise<void>;
  onDeleteGuestRoom: (guestNumber: number) => Promise<void>;
  onLaunchDisguise: () => void;
  onToggleTheme: () => void;
  onExportEncryptedBackup: () => Promise<void>;
  onResetVault: () => Promise<void>;
  onLogoPress: () => void;
}

const CATEGORY_META: Record<
  VaultCategory,
  { label: string; Icon: React.FC<{ className?: string }> }
> = {
  credential: { label: 'Login / Key', Icon: KeyRound },
  card: { label: 'Payment Card', Icon: CreditCard },
  note: { label: 'Secure Note', Icon: StickyNote },
  document: { label: 'Identity / Doc', Icon: FileText },
};

export const VaultDashboard: React.FC<VaultDashboardProps> = ({
  items,
  config,
  isGuestMode,
  guestNumber,
  guestRooms,
  cloudUser,
  pendingSyncCount,
  isSyncing,
  conflicts,
  conflictPolicy,
  autoUpdate,
  onChangeConflictPolicy,
  onOpenConflictModal,
  onSaveItem,
  onDeleteItem,
  onToggleFavorite,
  onUpdateConfig,
  onChangeLockCredential,
  onToggleBiometrics,
  onSignInGoogle,
  onSignOutGoogle,
  onManualSync,
  onLockVault,
  onExitGuestToSetup,
  onSwitchGuestRoom,
  onDeleteGuestRoom,
  onLaunchDisguise,
  onToggleTheme,
  onExportEncryptedBackup,
  onResetVault,
  onLogoPress,
}) => {
  const [activeTab, setActiveTab] = useState<NavTab>('vault');
  const [filterScope, setFilterScope] = useState<FilterScope>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revealSecret, setRevealSecret] = useState(false);
  const [copiedField, setCopiedField] = useState<'username' | 'secret' | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItemDecrypted | null>(null);
  const [prefilledSecret, setPrefilledSecret] = useState<string | undefined>(undefined);
  const [guestSwitcherOpen, setGuestSwitcherOpen] = useState(false);

  const isCurrentlyDark =
    config.darkMode === 'dark' ||
    (config.darkMode === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const activeItems = useMemo(() => items.filter((i) => !i.deleted), [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeItems
      .filter((item) => {
        if (filterScope === 'favorites') return item.favorite;
        if (filterScope !== 'all') return item.category === filterScope;
        return true;
      })
      .filter((item) => {
        if (!q) return true;
        return (
          item.title.toLowerCase().includes(q) ||
          item.username.toLowerCase().includes(q) ||
          item.url.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [activeItems, filterScope, searchQuery]);

  const selectedItem = useMemo(() => {
    if (!selectedId) return filteredItems[0] || null;
    return filteredItems.find((i) => i.id === selectedId) || filteredItems[0] || null;
  }, [filteredItems, selectedId]);

  const counts = useMemo(() => {
    return {
      all: activeItems.length,
      favorites: activeItems.filter((i) => i.favorite).length,
      credential: activeItems.filter((i) => i.category === 'credential').length,
      card: activeItems.filter((i) => i.category === 'card').length,
      note: activeItems.filter((i) => i.category === 'note').length,
      document: activeItems.filter((i) => i.category === 'document').length,
    };
  }, [activeItems]);

  const handleCopy = async (text: string, field: 'username' | 'secret') => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1600);
  };

  const openNewModal = (secret?: string) => {
    setEditingItem(null);
    setPrefilledSecret(secret);
    setModalOpen(true);
  };

  const openEditModal = (item: VaultItemDecrypted) => {
    setEditingItem(item);
    setPrefilledSecret(undefined);
    setModalOpen(true);
  };

  const handleUpdateAds = async (partialAds: Partial<AdsSettings>) => {
    await onUpdateConfig({
      adsSettings: {
        ...config.adsSettings,
        ...partialAds,
      },
    });
  };

  const handleResetAdId = async () => {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const nextId = `sv_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
    await handleUpdateAds({ adId: nextId });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Bar — 3-Zone Contract */}
      <header className="sticky top-0 z-30 h-14 lg:h-16 px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 sm:gap-4 lg:gap-8 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
        {/* Zone 1: Single-line brand mark (tapping opens hidden layer gate) */}
        <button
          type="button"
          onClick={onLogoPress}
          aria-label={`${config.appDisplayName || 'SecureVault'} Logo`}
          className="flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer group"
        >
          <AppBrandIcon
            preset={config.appIconPreset}
            customIconDataUrl={config.customAppIconDataUrl}
            size="sm"
            className="group-active:scale-95 transition-transform"
          />
          <span className="font-display text-base sm:text-lg font-bold tracking-tight max-w-[115px] sm:max-w-[180px] truncate">
            {config.appDisplayName?.trim() || 'SecureVault'}
          </span>
        </button>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium">
          {(
            [
              { id: 'vault', label: 'Vault' },
              { id: 'generator', label: 'Generator' },
              { id: 'ads', label: 'Ads' },
              { id: 'settings', label: 'Settings' },
            ] as { id: NavTab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-600 dark:border-emerald-400'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: Primary CTA & quick actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <PWAInstallButton variant="compact" iconOnlyMobile />
          {config.calculatorDisguiseEnabled && (
            <button
              type="button"
              onClick={onLaunchDisguise}
              title="Switch to Calculator Disguise"
              aria-label="Switch to Calculator Disguise"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Calculator className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle color theme"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {isCurrentlyDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onLockVault}
            className="min-h-[40px] flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isGuestMode ? <LogOut className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            <span>{isGuestMode ? 'Exit Guest' : 'Lock'}</span>
          </button>
          <button
            type="button"
            onClick={() => openNewModal()}
            className="min-h-[40px] flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Entry</span>
          </button>
        </div>
      </header>

      {/* Persistent Guest Room Notice & Account-Style Switcher */}
      {isGuestMode && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/50 px-4 sm:px-8 py-2.5">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
              <UserRound className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong className="font-semibold tabular-nums">Guest Room #{guestNumber}</strong>
                <span aria-hidden="true"> · </span>
                {config.autoUpdateEnabled
                  ? 'Connected to Auto-Update & saved across rooms.'
                  : 'Saved locally — leaving or changing rooms keeps your information intact.'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setGuestSwitcherOpen(true)}
                className="inline-flex items-center gap-1 font-semibold text-amber-900 dark:text-amber-200 underline underline-offset-2 hover:text-amber-950 cursor-pointer whitespace-nowrap"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Switch Room ({guestRooms.length})</span>
              </button>
              <button
                type="button"
                onClick={onExitGuestToSetup}
                className="font-semibold text-amber-800 dark:text-amber-300 underline underline-offset-2 hover:text-amber-950 cursor-pointer whitespace-nowrap"
              >
                Switch to Saved Vault
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Conflict Alert Bar */}
      {conflicts.length > 0 && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-900/50 px-4 sm:px-8 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-rose-800 dark:text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                {conflicts.length} cloud sync conflict{conflicts.length > 1 ? 's' : ''} detected between this device and your account.
              </span>
            </div>
            <button
              type="button"
              onClick={onOpenConflictModal}
              className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-500 cursor-pointer whitespace-nowrap"
            >
              Resolve Conflict
            </button>
          </div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-8 flex gap-6">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col justify-between gap-6">
          <div className="space-y-6">
            {/* Categories */}
            <div>
              <div className="px-3 mb-2 text-xs font-semibold text-slate-400 dark:text-slate-500">
                Categories
              </div>
              <div className="space-y-1">
                {(
                  [
                    { id: 'all', label: 'All Items', count: counts.all },
                    { id: 'favorites', label: 'Favorites', count: counts.favorites },
                    { id: 'credential', label: 'Logins & Keys', count: counts.credential },
                    { id: 'card', label: 'Payment Cards', count: counts.card },
                    { id: 'note', label: 'Secure Notes', count: counts.note },
                    { id: 'document', label: 'Documents', count: counts.document },
                  ] as { id: FilterScope; label: string; count: number }[]
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setFilterScope(cat.id);
                      setActiveTab('vault');
                    }}
                    className={`w-full min-h-[40px] flex items-center justify-between px-3 rounded-xl text-sm transition-colors cursor-pointer ${
                      activeTab === 'vault' && filterScope === cat.id
                        ? 'bg-slate-900 dark:bg-emerald-600/20 text-white dark:text-emerald-400 font-semibold'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span className="font-mono text-xs opacity-75 tabular-nums">{cat.count}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Cloud Sync & Auto-Update Card */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                  Sync &amp; Auto-Update
                </span>
                {cloudUser ? (
                  <Cloud className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <CloudOff className="w-4 h-4 text-slate-400" />
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {isGuestMode
                  ? cloudUser
                    ? `Guest Room #${guestNumber} is synced with ${cloudUser.email} & connected to auto-updates.`
                    : `Guest Room #${guestNumber} stays synced across rooms on this device with auto-updates.`
                  : cloudUser
                    ? pendingSyncCount > 0
                      ? `${pendingSyncCount} edits queued for sync`
                      : `Synced · ${cloudUser.email}`
                    : 'Local IndexedDB & cross-room auto-updates active. Connect Google to sync devices.'}
              </p>
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                <span>
                  {config.autoUpdateEnabled ? 'Auto-Update On' : 'Manual Updates'}
                </span>
                <span className="font-mono tabular-nums">
                  {autoUpdate.connectedSessions.length} active
                </span>
              </div>
              {cloudUser ? (
                <button
                  type="button"
                  disabled={isSyncing || autoUpdate.isChecking}
                  onClick={() => void autoUpdate.checkNow()}
                  className="w-full min-h-[38px] flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      isSyncing || autoUpdate.isChecking ? 'animate-spin' : ''
                    }`}
                  />
                  <span>
                    {isSyncing || autoUpdate.isChecking ? 'Updating...' : 'Check Updates'}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  className="w-full min-h-[38px] rounded-xl bg-slate-900 dark:bg-emerald-600 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors cursor-pointer"
                >
                  Sync &amp; Update Settings
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Main Workspace */}
        <main className="flex-1 min-w-0">
          {activeTab === 'vault' && (
            <div className="space-y-5">
              {/* Search & Mobile Filter Strip */}
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search titles, usernames, or URLs..."
                    className="w-full min-h-[44px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-10 pr-4 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Mobile category filter */}
                <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto pb-1">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'favorites', label: 'Favorites' },
                      { id: 'credential', label: 'Logins' },
                      { id: 'card', label: 'Cards' },
                      { id: 'note', label: 'Notes' },
                      { id: 'document', label: 'Docs' },
                    ] as { id: FilterScope; label: string }[]
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFilterScope(tab.id)}
                      className={`min-h-[38px] px-3 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        filterScope === tab.id
                          ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredItems.length === 0 ? (
                <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center mx-auto">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h2 className="mt-4 font-display text-lg font-semibold text-slate-900 dark:text-white">
                    {searchQuery ? 'No matching entries' : 'Your vault is empty'}
                  </h2>
                  <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    {searchQuery
                      ? 'Try adjusting your search filter or category.'
                      : 'Add your first login, payment card, recovery phrase, or secure note.'}
                  </p>
                  {!searchQuery && (
                    <button
                      type="button"
                      onClick={() => openNewModal()}
                      className="mt-5 min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add First Vault Entry</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                  {/* Items List */}
                  <div className="xl:col-span-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                    {filteredItems.map((item) => {
                      const meta = CATEGORY_META[item.category];
                      const Icon = meta.Icon;
                      const isSelected = selectedItem?.id === item.id;
                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            setSelectedId(item.id);
                            setRevealSecret(false);
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedId(item.id);
                              setRevealSecret(false);
                            }
                          }}
                          className={`min-h-[68px] px-4 py-3.5 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                {item.title}
                              </div>
                              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                                <span>{item.username || meta.label}</span>
                                <span aria-hidden="true"> · </span>
                                <span>{meta.label}</span>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void onToggleFavorite(item.id);
                            }}
                            aria-label="Toggle favorite"
                            className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-colors cursor-pointer ${
                              item.favorite
                                ? 'text-amber-500'
                                : 'text-slate-300 dark:text-slate-600 hover:text-amber-500'
                            }`}
                          >
                            <Star className={`w-4 h-4 ${item.favorite ? 'fill-current' : ''}`} />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Detail Inspector */}
                  {selectedItem && (
                    <div className="xl:col-span-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            {CATEGORY_META[selectedItem.category].label}
                            <span aria-hidden="true"> · </span>
                            <span className="tabular-nums">
                              Updated {new Date(selectedItem.updatedAt).toLocaleDateString()}
                            </span>
                          </div>
                          <h2 className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white break-words">
                            {selectedItem.title}
                          </h2>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditModal(selectedItem)}
                            aria-label="Edit entry"
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDeleteItem(selectedItem.id)}
                            aria-label="Delete entry"
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {selectedItem.username && (
                        <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 p-4 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              Username / Identifier
                            </div>
                            <div className="mt-0.5 text-sm font-mono text-slate-900 dark:text-white truncate">
                              {selectedItem.username}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleCopy(selectedItem.username, 'username')}
                            className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 shrink-0 cursor-pointer"
                          >
                            {copiedField === 'username' ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 p-4 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Encrypted Secret
                          </div>
                          <div className="mt-0.5 text-sm font-mono text-slate-900 dark:text-white break-all">
                            {revealSecret
                              ? selectedItem.secretValue
                              : '••••••••••••••••••••'}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setRevealSecret((v) => !v)}
                            aria-label={revealSecret ? 'Hide secret' : 'Reveal secret'}
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            {revealSecret ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleCopy(selectedItem.secretValue, 'secret')}
                            className="min-h-[38px] px-3 rounded-xl bg-slate-900 dark:bg-emerald-600 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-emerald-500 flex items-center gap-1.5 cursor-pointer"
                          >
                            {copiedField === 'secret' ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {selectedItem.url && (
                        <div className="text-xs">
                          <span className="text-slate-500 dark:text-slate-400">URL: </span>
                          <span className="font-mono text-slate-700 dark:text-slate-200 break-all">
                            {selectedItem.url}
                          </span>
                        </div>
                      )}

                      {selectedItem.notes && (
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                            Encrypted Notes
                          </div>
                          <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                            {selectedItem.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'generator' && (
            <PasswordGeneratorView
              onUsePasswordInNewItem={(secret) => {
                openNewModal(secret);
              }}
            />
          )}

          {activeTab === 'ads' && (
            <AdsSectionView
              adsSettings={config.adsSettings}
              onUpdateAds={handleUpdateAds}
              onResetAdId={handleResetAdId}
              scopeLabel={config.appDisplayName?.trim() || 'SecureVault'}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              config={config}
              isGuestMode={isGuestMode}
              guestNumber={guestNumber}
              cloudUser={cloudUser}
              pendingSyncCount={pendingSyncCount}
              isSyncing={isSyncing}
              conflictPolicy={conflictPolicy}
              autoUpdate={autoUpdate}
              onChangeConflictPolicy={onChangeConflictPolicy}
              onUpdateConfig={onUpdateConfig}
              onChangeLockCredential={onChangeLockCredential}
              onToggleBiometrics={onToggleBiometrics}
              onSignInGoogle={onSignInGoogle}
              onSignOutGoogle={onSignOutGoogle}
              onManualSync={onManualSync}
              onTestDisguise={onLaunchDisguise}
              onOpenAdsSection={() => setActiveTab('ads')}
              onExportEncryptedBackup={onExportEncryptedBackup}
              onResetVault={onResetVault}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar (Thumb Zone) */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center px-1"
      >
        <button
          type="button"
          onClick={() => setActiveTab('vault')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            activeTab === 'vault'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <ShieldCheck className="w-5 h-5" />
          <span className="text-[10px] sm:text-[11px] font-medium">Vault</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('generator')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            activeTab === 'generator'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <KeyRound className="w-5 h-5" />
          <span className="text-[10px] sm:text-[11px] font-medium">Generator</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ads')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            activeTab === 'ads'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Megaphone className="w-5 h-5" />
          <span className="text-[10px] sm:text-[11px] font-medium">Ads</span>
        </button>

        <button
          type="button"
          onClick={onLaunchDisguise}
          className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-slate-500 dark:text-slate-400 cursor-pointer"
        >
          <Calculator className="w-5 h-5" />
          <span className="text-[10px] sm:text-[11px] font-medium">Disguise</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            activeTab === 'settings'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] sm:text-[11px] font-medium">Settings</span>
        </button>
      </nav>

      <VaultItemModal
        isOpen={modalOpen}
        editingItem={editingItem}
        initialSecret={prefilledSecret}
        onClose={() => setModalOpen(false)}
        onSave={onSaveItem}
      />

      {/* Account-Style Guest Room Switcher Modal */}
      {isGuestMode && guestSwitcherOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Switch Guest Room
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setGuestSwitcherOpen(false)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Change rooms just like switching accounts. Everything in your current room stays saved locally when you switch or leave.
            </p>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {guestRooms.map((room) => {
                const isActive = room.guestNumber === guestNumber;
                return (
                  <div
                    key={room.guestNumber}
                    className={`flex items-center justify-between gap-2 rounded-2xl border p-3 ${
                      isActive
                        ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setGuestSwitcherOpen(false);
                        if (!isActive) {
                          void onSwitchGuestRoom(room.guestNumber);
                        }
                      }}
                      className="flex-1 text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                        <span>{room.label}</span>
                        {isActive && (
                          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {room.items.length} item{room.items.length === 1 ? '' : 's'}
                      </div>
                    </button>

                    {!isActive && (
                      <button
                        type="button"
                        onClick={() => void onDeleteGuestRoom(room.guestNumber)}
                        aria-label={`Delete ${room.label}`}
                        title="Delete room"
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setGuestSwitcherOpen(false);
                  void onSwitchGuestRoom();
                }}
                className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New Guest Room</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setGuestSwitcherOpen(false);
                  onExitGuestToSetup();
                }}
                className="flex-1 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 px-4 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Main Vault Login
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
