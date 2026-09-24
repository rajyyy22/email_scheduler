import { describe, it, expect } from 'vitest';
import { encryptCredential, decryptCredential } from '../../src/infrastructure/security/crypto.js';

describe('Crypto AES-256-GCM', () => {
  it('should encrypt plaintext into IV:AuthTag:Ciphertext format and decrypt successfully', () => {
    const secret = 'super-secret-smtp-password-123!@#';
    const encrypted = encryptCredential(secret);

    expect(encrypted).toContain(':');
    const parts = encrypted.split(':');
    expect(parts.length).toBe(3);

    const decrypted = decryptCredential(encrypted);
    expect(decrypted).toBe(secret);
  });

  it('should generate distinct ciphertexts for identical inputs due to random IV', () => {
    const secret = 'identical-password';
    const enc1 = encryptCredential(secret);
    const enc2 = encryptCredential(secret);

    expect(enc1).not.toBe(enc2);
    expect(decryptCredential(enc1)).toBe(secret);
    expect(decryptCredential(enc2)).toBe(secret);
  });
});
