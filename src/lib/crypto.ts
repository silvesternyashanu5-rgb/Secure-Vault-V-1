const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateSalt(length = 16): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return toBase64(bytes);
}

export function generateRandomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function generateMasterVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function deriveKeyFromSecret(
  secret: string,
  saltBase64: string
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: fromBase64(saltBase64),
      iterations: 120000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function hashAuthSecret(
  secret: string,
  saltBase64: string
): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: fromBase64(saltBase64),
      iterations: 120000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return toBase64(new Uint8Array(bits));
}

export async function wrapMasterKey(
  masterKey: CryptoKey,
  wrappingKey: CryptoKey
): Promise<{ wrappedKey: string; iv: string }> {
  const rawMaster = await crypto.subtle.exportKey('raw', masterKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    rawMaster
  );

  return {
    wrappedKey: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
  };
}

export async function unwrapMasterKey(
  wrappedKeyBase64: string,
  ivBase64: string,
  wrappingKey: CryptoKey
): Promise<CryptoKey> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivBase64) },
    wrappingKey,
    fromBase64(wrappedKeyBase64)
  );

  return crypto.subtle.importKey(
    'raw',
    decrypted,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function encryptVaultPayload(
  masterKey: CryptoKey,
  payload: { secretValue: string; notes: string }
): Promise<{ encryptedPayload: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = encoder.encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    encoded
  );

  return {
    encryptedPayload: toBase64(new Uint8Array(ciphertext)),
    iv: toBase64(iv),
  };
}

export async function decryptVaultPayload(
  masterKey: CryptoKey,
  encryptedPayload: string,
  ivBase64: string
): Promise<{ secretValue: string; notes: string }> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivBase64) },
    masterKey,
    fromBase64(encryptedPayload)
  );

  const parsed = JSON.parse(decoder.decode(decrypted));
  return {
    secretValue: typeof parsed.secretValue === 'string' ? parsed.secretValue : '',
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
  };
}

export async function encryptBinaryData(
  masterKey: CryptoKey,
  data: ArrayBuffer
): Promise<{ encryptedData: ArrayBuffer; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    data
  );
  return {
    encryptedData,
    iv: toBase64(iv),
  };
}

export async function decryptBinaryData(
  masterKey: CryptoKey,
  encryptedData: ArrayBuffer,
  ivBase64: string
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivBase64) },
    masterKey,
    encryptedData
  );
}

export interface PasswordGeneratorOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

export function generateStrongPassword(opts: PasswordGeneratorOptions): string {
  let upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let lower = 'abcdefghijkmnopqrstuvwxyz';
  let nums = '23456789';
  const syms = '!@#$%^&*-_+=?';

  if (!opts.excludeAmbiguous) {
    upper += 'IO';
    lower += 'l';
    nums += '01';
  }

  let pool = '';
  const required: string[] = [];

  const pick = (chars: string) => {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return chars[arr[0] % chars.length];
  };

  if (opts.uppercase) {
    pool += upper;
    required.push(pick(upper));
  }
  if (opts.lowercase) {
    pool += lower;
    required.push(pick(lower));
  }
  if (opts.numbers) {
    pool += nums;
    required.push(pick(nums));
  }
  if (opts.symbols) {
    pool += syms;
    required.push(pick(syms));
  }

  if (!pool) {
    pool = lower + nums;
  }

  const chars: string[] = [...required];
  while (chars.length < opts.length) {
    chars.push(pick(pool));
  }

  // Fisher-Yates shuffle with CSPRNG
  for (let i = chars.length - 1; i > 0; i--) {
    const rand = new Uint32Array(1);
    crypto.getRandomValues(rand);
    const j = rand[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.slice(0, opts.length).join('');
}

export function evaluatePasswordStrength(secret: string): {
  label: 'Weak' | 'Fair' | 'Strong' | 'Very Strong';
  score: number;
} {
  if (!secret) return { label: 'Weak', score: 0 };
  let score = 0;
  if (secret.length >= 8) score += 20;
  if (secret.length >= 12) score += 20;
  if (secret.length >= 16) score += 15;
  if (/[a-z]/.test(secret)) score += 10;
  if (/[A-Z]/.test(secret)) score += 10;
  if (/[0-9]/.test(secret)) score += 10;
  if (/[^a-zA-Z0-9]/.test(secret)) score += 15;

  const clamped = Math.min(100, score);
  if (clamped >= 80) return { label: 'Very Strong', score: clamped };
  if (clamped >= 60) return { label: 'Strong', score: clamped };
  if (clamped >= 40) return { label: 'Fair', score: clamped };
  return { label: 'Weak', score: clamped };
}
