import { describe, expect, it } from 'vitest';
import { PasswordService } from '../src/modules/auth/password.service';

const svc = new PasswordService();

describe('PasswordService (argon2id)', () => {
  it('hashes and verifies a correct password', async () => {
    const hash = await svc.hash('S3cret-Passphrase');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await svc.verify(hash, 'S3cret-Passphrase')).toBe(true);
    expect(await svc.verify(hash, 'wrong-password')).toBe(false);
  }, 20_000);

  it('returns false (never throws) for a malformed hash', async () => {
    expect(await svc.verify('not-a-real-hash', 'whatever')).toBe(false);
  });
});
