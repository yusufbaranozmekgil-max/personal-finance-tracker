/**
 * Password-based encryption with the browser's Web Crypto:
 * PBKDF2-SHA256 (600k iterations, OWASP 2023) derives an AES-256-GCM key.
 * GCM authenticates, so a wrong password fails to decrypt instead of returning garbage.
 */

export interface Sealed {
  v: 2;
  kdf: 'PBKDF2-SHA256';
  iter: number;
  salt: string;
  iv: string;
  data: string;
}

const ITERATIONS = 600_000;

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

function b64Large(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

export async function deriveKey(password: string, salt: Uint8Array, iterations = ITERATIONS): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** A key plus the salt it was derived with, kept in memory while unlocked. */
export interface VaultKey {
  key: CryptoKey;
  salt: Uint8Array;
  iter: number;
}

export async function newVaultKey(password: string): Promise<VaultKey> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { key: await deriveKey(password, salt), salt, iter: ITERATIONS };
}

export async function seal(plain: string, vk: VaultKey): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vk.key, new TextEncoder().encode(plain)));
  return { v: 2, kdf: 'PBKDF2-SHA256', iter: vk.iter, salt: b64(vk.salt), iv: b64(iv), data: b64Large(ct) };
}

/** Returns the plaintext and the key (for re-sealing), or null when the password is wrong. */
export async function open(sealed: Sealed, password: string): Promise<{ plain: string; vk: VaultKey } | null> {
  const salt = unb64(sealed.salt);
  const vk = { key: await deriveKey(password, salt, sealed.iter), salt, iter: sealed.iter };
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv) as BufferSource }, vk.key, unb64(sealed.data) as BufferSource);
    return { plain: new TextDecoder().decode(plain), vk };
  } catch {
    return null;
  }
}

/** Re-opens with a key already in memory (same salt), e.g. after another tab saved. */
export async function openWithKey(sealed: Sealed, vk: VaultKey): Promise<string | null> {
  if (sealed.salt !== b64(vk.salt) || sealed.iter !== vk.iter) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv) as BufferSource }, vk.key, unb64(sealed.data) as BufferSource);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export function isSealed(v: unknown): v is Sealed {
  const o = v as Sealed;
  return !!o && o.v === 2 && o.kdf === 'PBKDF2-SHA256' && typeof o.data === 'string' && typeof o.salt === 'string' && typeof o.iv === 'string'
    && Number.isInteger(o.iter) && o.iter >= 100_000 && o.iter <= 10_000_000;
}

/** Opens a vault written by the first version (CryptoJS passphrase AES). Loaded only when needed. */
export async function openLegacyVault(blob: string, password: string): Promise<string | null> {
  const CryptoJS = (await import('crypto-js')).default;
  try {
    const plain = CryptoJS.AES.decrypt(blob, password).toString(CryptoJS.enc.Utf8);
    return plain || null;
  } catch {
    return null;
  }
}
