import React, { useEffect, useState } from 'react';
import { RefreshCw, Star, X } from 'lucide-react';
import { evaluatePasswordStrength, generateStrongPassword } from '../lib/crypto';
import type { VaultCategory, VaultItemDecrypted } from '../types/vault';

interface VaultItemModalProps {
  isOpen: boolean;
  editingItem: VaultItemDecrypted | null;
  initialSecret?: string;
  onClose: () => void;
  onSave: (data: {
    id?: string;
    title: string;
    category: VaultCategory;
    username: string;
    url: string;
    secretValue: string;
    notes: string;
    favorite: boolean;
  }) => Promise<void>;
}

const CATEGORIES: { value: VaultCategory; label: string }[] = [
  { value: 'credential', label: 'Login / Key' },
  { value: 'card', label: 'Payment Card' },
  { value: 'note', label: 'Secure Note' },
  { value: 'document', label: 'Identity / Doc' },
];

export const VaultItemModal: React.FC<VaultItemModalProps> = ({
  isOpen,
  editingItem,
  initialSecret,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<VaultCategory>('credential');
  const [username, setUsername] = useState('');
  const [url, setUrl] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [notes, setNotes] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (editingItem) {
      setTitle(editingItem.title);
      setCategory(editingItem.category);
      setUsername(editingItem.username);
      setUrl(editingItem.url);
      setSecretValue(editingItem.secretValue);
      setNotes(editingItem.notes);
      setFavorite(editingItem.favorite);
    } else {
      setTitle('');
      setCategory('credential');
      setUsername('');
      setUrl('');
      setSecretValue(initialSecret || '');
      setNotes('');
      setFavorite(false);
    }
    setError('');
  }, [editingItem, initialSecret, isOpen]);

  if (!isOpen) return null;

  const strength = evaluatePasswordStrength(secretValue);

  const handleGenerateInline = () => {
    setSecretValue(
      generateStrongPassword({
        length: 18,
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: true,
        excludeAmbiguous: true,
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!secretValue.trim()) {
      setError('Secret value / password cannot be empty.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        id: editingItem?.id,
        title: title.trim().slice(0, 160),
        category,
        username: username.trim().slice(0, 200),
        url: url.trim().slice(0, 500),
        secretValue: secretValue.slice(0, 12000),
        notes: notes.slice(0, 4000),
        favorite,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save item.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl max-h-[92vh] flex flex-col">
        {/* Grab handle on mobile */}
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3" />

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            {editingItem ? 'Edit Vault Entry' : 'New Vault Entry'}
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFavorite((f) => !f)}
              aria-label="Toggle favorite"
              className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-colors cursor-pointer ${
                favorite
                  ? 'text-amber-500 bg-amber-50 dark:bg-amber-500/10'
                  : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Star className={`w-4 h-4 ${favorite ? 'fill-current' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`min-h-[38px] rounded-lg px-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    category === cat.value
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Title
            </label>
            <input
              type="text"
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., GitHub Enterprise or Chase Sapphire"
              className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                {category === 'card'
                  ? 'Card Number / Mask'
                  : category === 'document'
                    ? 'Document ID'
                    : 'Username / Email / Label'}
              </label>
              <input
                type="text"
                maxLength={200}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={category === 'card' ? '4242 •••• •••• 4242' : 'name@domain.com'}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                Website URL (Optional)
              </label>
              <input
                type="text"
                maxLength={500}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {category === 'note'
                  ? 'Encrypted Content'
                  : category === 'card'
                    ? 'Expiry / CVV / PIN'
                    : 'Password / Secret Key'}
              </label>
              {category === 'credential' && (
                <button
                  type="button"
                  onClick={handleGenerateInline}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Generate Strong</span>
                </button>
              )}
            </div>
            <input
              type="text"
              required
              maxLength={12000}
              value={secretValue}
              onChange={(e) => setSecretValue(e.target.value)}
              placeholder="Enter secret value to encrypt"
              className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {category === 'credential' && secretValue && (
              <div className="mt-2 flex items-center justify-between text-xs">
                <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 mr-3 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      strength.score >= 80
                        ? 'bg-emerald-500'
                        : strength.score >= 60
                          ? 'bg-teal-500'
                          : strength.score >= 40
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                    }`}
                    style={{ width: `${strength.score}%` }}
                  />
                </div>
                <span className="font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                  {strength.label}
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Encrypted Notes
            </label>
            <textarea
              rows={3}
              maxLength={4000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Recovery codes, account remarks, or security questions..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {error && (
            <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] px-5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {saving ? 'Encrypting...' : editingItem ? 'Save Changes' : 'Save to Vault'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
