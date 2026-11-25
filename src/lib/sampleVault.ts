import type { VaultItemDecrypted } from '../types/vault';
import { generateRandomId } from './crypto';

export function buildStarterVaultItems(): VaultItemDecrypted[] {
  const now = Date.now();
  return [
    {
      id: `item_${generateRandomId()}`,
      title: 'Cloud Infrastructure Console',
      category: 'credential',
      username: 'ops-admin@acme-systems.io',
      url: 'https://console.cloud.google.com',
      secretValue: 'Xk9#mP2!vQ8$rL4z',
      notes: 'Primary production billing & IAM root account. Hardware MFA required.',
      favorite: true,
      deleted: false,
      createdAt: now - 86400000 * 6,
      updatedAt: now - 86400000 * 1,
    },
    {
      id: `item_${generateRandomId()}`,
      title: 'Mercury Business Checking',
      category: 'card',
      username: '4815 •••• •••• 9042',
      url: 'https://mercury.com',
      secretValue: 'Exp 09/29 · CVV 418',
      notes: 'Virtual corporate expense card for SaaS subscriptions.',
      favorite: true,
      deleted: false,
      createdAt: now - 86400000 * 4,
      updatedAt: now - 86400000 * 2,
    },
    {
      id: `item_${generateRandomId()}`,
      title: 'SSH Recovery & Backup Passphrase',
      category: 'note',
      username: 'ed25519-primary-key',
      url: '',
      secretValue: 'cedar-quartz-harbor-94-lantern-ridge-velvet',
      notes: 'Offline cold-storage recovery phrase. Never share or store in plaintext email.',
      favorite: false,
      deleted: false,
      createdAt: now - 86400000 * 3,
      updatedAt: now - 3600000 * 12,
    },
    {
      id: `item_${generateRandomId()}`,
      title: 'Passport & Travel Insurance ID',
      category: 'document',
      username: 'US-904821773',
      url: '',
      secretValue: 'Issued 2024-03-14 · Expires 2034-03-13',
      notes: 'Global emergency assistance policy #TRV-88412-B.',
      favorite: false,
      deleted: false,
      createdAt: now - 86400000 * 2,
      updatedAt: now - 3600000 * 5,
    },
  ];
}
