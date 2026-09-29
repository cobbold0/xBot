import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '../../src/core/config';
import { decryptSecret, encryptSecret } from '../../src/core/secrets';

process.env.DATABASE_URL = 'postgres://x';
describe('secret encryption', () => {
  it('round-trips and never contains plaintext', () => {
    process.env.SESSION_SECRET = 'k'.repeat(40); resetEnvCache();
    const blob = encryptSecret('auth_token=abc;ct0=def;');
    expect(blob).not.toMatch(/abc|def/);
    expect(decryptSecret(blob)).toBe('auth_token=abc;ct0=def;');
    expect(encryptSecret('x')).not.toBe(encryptSecret('x')); // random IV
  });
  it('rejects tampering and a different SESSION_SECRET', () => {
    process.env.SESSION_SECRET = 'k'.repeat(40); resetEnvCache();
    const blob = encryptSecret('secret');
    const parts = blob.split('.'); parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => decryptSecret(parts.join('.'))).toThrow();
    process.env.SESSION_SECRET = 'z'.repeat(40); resetEnvCache();
    expect(() => decryptSecret(blob)).toThrow();
  });
  it('requires a strong SESSION_SECRET', () => {
    process.env.SESSION_SECRET = 'short'; resetEnvCache();
    expect(() => encryptSecret('x')).toThrow(/SESSION_SECRET/);
  });
});
