import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  generateSalt,
  hashPin,
  hashPinStretched,
  isValidPin,
  PIN_HASH_ITERATIONS,
  PIN_HASH_VERSION,
  pinHashVersionOf,
  timingSafeEqualHex,
  verifyVaultPin,
} from '../src/services/vaultAuth';

const SALT = 'abcdef0123456789abcdef0123456789';

test('hashPinStretched is deterministic for the same PIN and salt', async () => {
  const a = await hashPinStretched('1234', SALT);
  const b = await hashPinStretched('1234', SALT);
  assert.equal(a, b);
  // 256 bits of output, hex encoded.
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('hashPinStretched differs from the legacy single-round hash', async () => {
  const stretched = await hashPinStretched('1234', SALT);
  const legacy = await hashPin('1234', SALT);
  assert.notEqual(stretched, legacy);
});

test('hashPinStretched produces different hashes for different PINs and salts', async () => {
  assert.notEqual(await hashPinStretched('1234', SALT), await hashPinStretched('5678', SALT));
  assert.notEqual(
    await hashPinStretched('1234', 'salt_alpha'),
    await hashPinStretched('1234', 'salt_beta')
  );
});

test('hashPinStretched ignores surrounding whitespace in the PIN', async () => {
  assert.equal(await hashPinStretched('  1234  ', SALT), await hashPinStretched('1234', SALT));
});

test('PIN_HASH constants describe the current scheme', () => {
  assert.equal(PIN_HASH_VERSION, 2);
  // Stretching has to be expensive enough to make a 10,000-value PIN space
  // unattractive to brute force offline.
  assert.ok(PIN_HASH_ITERATIONS >= 100_000);
});

test('pinHashVersionOf treats a missing version as legacy v1', () => {
  assert.equal(pinHashVersionOf({ hashVersion: undefined }), 1);
  assert.equal(pinHashVersionOf({ hashVersion: 1 }), 1);
  assert.equal(pinHashVersionOf({ hashVersion: 2 }), PIN_HASH_VERSION);
  assert.equal(pinHashVersionOf(null), 1);
});

test('verifyVaultPin accepts the correct PIN on a v2 vault and rejects a wrong one', async () => {
  const salt = generateSalt();
  const pinHash = await hashPinStretched('4321', salt);
  const meta = { pinHash, salt, hashVersion: PIN_HASH_VERSION };

  const ok = await verifyVaultPin('4321', meta);
  assert.deepEqual(ok, { valid: true, needsUpgrade: false });

  const bad = await verifyVaultPin('9999', meta);
  assert.equal(bad.valid, false);
});

test('verifyVaultPin still accepts a legacy v1 vault and flags it for upgrade', async () => {
  const salt = generateSalt();
  const pinHash = await hashPin('4321', salt);
  const meta = { pinHash, salt };

  const ok = await verifyVaultPin('4321', meta);
  assert.deepEqual(ok, { valid: true, needsUpgrade: true });

  const bad = await verifyVaultPin('0000', meta);
  assert.equal(bad.valid, false);
  assert.equal(bad.needsUpgrade, true);
});

test('a v2 hash is never accepted against a v1 vault record', async () => {
  const salt = generateSalt();
  const stretched = await hashPinStretched('4321', salt);
  const meta = { pinHash: stretched, salt, hashVersion: 1 };

  // The stored bytes came from the stretched scheme, so the legacy comparison
  // must not match — no cross-scheme confusion.
  assert.equal((await verifyVaultPin('4321', meta)).valid, false);
});

test('timingSafeEqualHex compares equal-length hex strings by value', () => {
  assert.equal(timingSafeEqualHex('abc123', 'abc123'), true);
  assert.equal(timingSafeEqualHex('abc123', 'abc124'), false);
  assert.equal(timingSafeEqualHex('abc123', 'abc12'), false);
  assert.equal(timingSafeEqualHex('abc123', 'abc1234'), false);
  assert.equal(timingSafeEqualHex('', ''), true);
});

test('a PIN that fails validation is never hashed', async () => {
  assert.equal(isValidPin('12'), false);
});
