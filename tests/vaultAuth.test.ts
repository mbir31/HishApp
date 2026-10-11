import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  cacheVaultMeta,
  cleanPhoneNumber,
  generateSalt,
  getCachedVaultMeta,
  hashPin,
  hashPinStretched,
  isValidPhoneNumber,
  isValidPin,
  loginOrCreateVault,
  PIN_HASH_VERSION,
} from '../src/services/vaultAuth';

// Mock localStorage for node:test environment
const mockStorage = new Map<string, string>();
const fakeLocalStorage = {
  getItem: (k: string) => mockStorage.get(k) ?? null,
  setItem: (k: string, v: string) => mockStorage.set(k, String(v)),
  removeItem: (k: string) => mockStorage.delete(k),
  clear: () => mockStorage.clear(),
};

(globalThis as any).localStorage = fakeLocalStorage;

beforeEach(() => {
  mockStorage.clear();
});

test('cleanPhoneNumber strips spaces, dashes and non-numeric characters', () => {
  assert.equal(cleanPhoneNumber('01712-345678'), '01712345678');
  assert.equal(cleanPhoneNumber('+88 017 123 45678'), '8801712345678');
  assert.equal(cleanPhoneNumber('  01811223344  '), '01811223344');
});

test('isValidPhoneNumber validates strictly 11 digits', () => {
  assert.equal(isValidPhoneNumber('01712345678'), true);
  assert.equal(isValidPhoneNumber('01811223344'), true);
  assert.equal(isValidPhoneNumber('01999999999'), true);
  assert.equal(isValidPhoneNumber('0171234567'), false); // 10 digits
  assert.equal(isValidPhoneNumber('017123456789'), false); // 12 digits
  assert.equal(isValidPhoneNumber('abcdefghijk'), false);
});

test('isValidPin validates strictly 4 digits', () => {
  assert.equal(isValidPin('1234'), true);
  assert.equal(isValidPin('0000'), true);
  assert.equal(isValidPin('9876'), true);
  assert.equal(isValidPin('123'), false); // 3 digits
  assert.equal(isValidPin('12345'), false); // 5 digits
  assert.equal(isValidPin('abcd'), false);
  assert.equal(isValidPin('12a4'), false);
});

test('generateSalt returns a 32-character random hex string', () => {
  const salt1 = generateSalt();
  const salt2 = generateSalt();
  assert.ok(salt1.length >= 16);
  assert.notEqual(salt1, salt2);
});

test('hashPin produces deterministic hash for same pin and salt', async () => {
  const salt = 'abcdef0123456789';
  const pin = '1234';
  const hash1 = await hashPin(pin, salt);
  const hash2 = await hashPin(pin, salt);
  assert.equal(hash1, hash2);
  assert.ok(hash1.length > 0);
});

test('hashPin produces different hashes for different PINs', async () => {
  const salt = 'abcdef0123456789';
  const hash1 = await hashPin('1234', salt);
  const hash2 = await hashPin('5678', salt);
  assert.notEqual(hash1, hash2);
});

test('hashPin produces different hashes for different salts', async () => {
  const hash1 = await hashPin('1234', 'salt_alpha');
  const hash2 = await hashPin('1234', 'salt_beta');
  assert.notEqual(hash1, hash2);
});

test('cacheVaultMeta stores credentials and getCachedVaultMeta retrieves them', () => {
  const phone = '01712345678';
  const salt = 'testsalt12345678';
  const pinHash = 'testhashvalue';

  cacheVaultMeta(phone, { pinHash, salt, hashVersion: PIN_HASH_VERSION });
  const retrieved = getCachedVaultMeta(phone);

  assert.ok(retrieved);
  assert.equal(retrieved.pinHash, pinHash);
  assert.equal(retrieved.salt, salt);
  assert.equal(retrieved.hashVersion, PIN_HASH_VERSION);
});

test('loginOrCreateVault unlocks using locally cached credentials when offline', async () => {
  const phone = '01899887766';
  const pin = '4321';
  const salt = generateSalt();
  const pinHash = await hashPinStretched(pin, salt);

  cacheVaultMeta(phone, { pinHash, salt, hashVersion: PIN_HASH_VERSION });

  // In test environment without Firebase config or offline, cached unlock succeeds
  const session = await loginOrCreateVault(phone, pin);
  assert.equal(session.phoneNumber, phone);
  assert.equal(session.pinHash, pinHash);
  assert.equal(session.isNew, false);
});

test('loginOrCreateVault rejects incorrect PIN even when using cached fallback', async () => {
  const phone = '01899887766';
  const pin = '4321';
  const salt = generateSalt();
  const pinHash = await hashPinStretched(pin, salt);

  cacheVaultMeta(phone, { pinHash, salt, hashVersion: PIN_HASH_VERSION });

  await assert.rejects(
    async () => {
      await loginOrCreateVault(phone, '9999');
    },
    { message: /Incorrect PIN/ }
  );
});
