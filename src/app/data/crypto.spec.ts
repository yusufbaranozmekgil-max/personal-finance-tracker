import { describe, expect, it } from 'vitest';
import CryptoJS from 'crypto-js';
import { isSealed, newVaultKey, open, openLegacyVault, openWithKey, seal } from './crypto';

describe('vault encryption', () => {
  it('seals and opens with the right password only', async () => {
    const vk = await newVaultKey('correct horse');
    const sealed = await seal('{"secret":1}', vk);
    expect(isSealed(JSON.parse(JSON.stringify(sealed)))).toBe(true);
    expect(sealed.data).not.toContain('secret');
    expect((await open(sealed, 'correct horse'))?.plain).toBe('{"secret":1}');
    expect(await open(sealed, 'wrong')).toBeNull();
    expect(await openWithKey(sealed, vk)).toBe('{"secret":1}');
  }, 20_000);

  it('opens a first-version vault', async () => {
    const blob = CryptoJS.AES.encrypt('{"__probe":"OK_FINANS_VAULT_v1"}', 'old-pass').toString();
    expect(await openLegacyVault(blob, 'old-pass')).toContain('OK_FINANS_VAULT_v1');
    expect(await openLegacyVault(blob, 'nope')).toBeNull();
  });
});
