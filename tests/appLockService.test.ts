import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import {
  getTodayDateKey,
  getRememberUserPreference,
  setRememberUserPreference,
  getRememberedUserId,
  setRememberedUserId,
  clearRememberedUserId,
  getLastUnlockedDate,
  isAppUnlockedToday,
  recordUnlockSuccess,
  lockApp,
  markLoggedOut,
} from '../src/services/appLockService';

// Polyfill mock localStorage for node:test environment
const mockStorage = new Map<string, string>();
const fakeLocalStorage = {
  getItem: (k: string) => mockStorage.get(k) ?? null,
  setItem: (k: string, v: string) => mockStorage.set(k, String(v)),
  removeItem: (k: string) => mockStorage.delete(k),
  clear: () => mockStorage.clear(),
};

(globalThis as any).localStorage = fakeLocalStorage;
(globalThis as any).window = {};

beforeEach(() => {
  mockStorage.clear();
});

test('getTodayDateKey produces YYYY-MM-DD formatted string', () => {
  const d = new Date(2026, 9, 11); // October 11, 2026
  assert.equal(getTodayDateKey(d), '2026-10-11');
});

test('getRememberUserPreference defaults to true and respects updates', () => {
  assert.equal(getRememberUserPreference(), true);
  setRememberUserPreference(false);
  assert.equal(getRememberUserPreference(), false);
  setRememberUserPreference(true);
  assert.equal(getRememberUserPreference(), true);
});

test('setRememberedUserId and getRememberedUserId handle 11-digit numbers', () => {
  assert.equal(getRememberedUserId(), null);
  setRememberedUserId('01712345678');
  assert.equal(getRememberedUserId(), '01712345678');
  clearRememberedUserId();
  assert.equal(getRememberedUserId(), null);
});

test('isAppUnlockedToday returns false when no session exists', () => {
  assert.equal(isAppUnlockedToday(), false);
});

test('isAppUnlockedToday returns false if session exists but unlocked on a previous date', () => {
  // Store an active session
  mockStorage.set('hisapp_vault_session', JSON.stringify({
    phoneNumber: '01712345678',
    pinHash: 'test_hash',
    loggedInAt: Date.now(),
  }));

  // Unlocked yesterday
  mockStorage.set('hisapp_last_unlocked_date', '2026-10-10');
  mockStorage.set('hisapp_user_logged_out', 'false');

  assert.equal(isAppUnlockedToday(), false);
});

test('isAppUnlockedToday returns true for the same calendar day (Rule 6)', () => {
  const today = getTodayDateKey();
  mockStorage.set('hisapp_vault_session', JSON.stringify({
    phoneNumber: '01712345678',
    pinHash: 'test_hash',
    loggedInAt: Date.now(),
  }));

  mockStorage.set('hisapp_last_unlocked_date', today);
  mockStorage.set('hisapp_user_logged_out', 'false');

  assert.equal(isAppUnlockedToday(), true);
});

test('isAppUnlockedToday returns false if user explicitly logged out', () => {
  const today = getTodayDateKey();
  mockStorage.set('hisapp_vault_session', JSON.stringify({
    phoneNumber: '01712345678',
    pinHash: 'test_hash',
    loggedInAt: Date.now(),
  }));

  mockStorage.set('hisapp_last_unlocked_date', today);
  mockStorage.set('hisapp_user_logged_out', 'true');

  assert.equal(isAppUnlockedToday(), false);
});

test('recordUnlockSuccess records today date and saves remembered user ID', () => {
  recordUnlockSuccess('01712345678', true);
  const today = getTodayDateKey();
  assert.equal(getLastUnlockedDate(), today);
  assert.equal(getRememberedUserId(), '01712345678');
  assert.equal(getRememberUserPreference(), true);
});

test('lockApp and markLoggedOut lock the app and require authentication again', () => {
  recordUnlockSuccess('01712345678', true);
  mockStorage.set('hisapp_vault_session', JSON.stringify({
    phoneNumber: '01712345678',
    pinHash: 'test_hash',
    loggedInAt: Date.now(),
  }));
  assert.equal(isAppUnlockedToday(), true);

  lockApp();
  assert.equal(isAppUnlockedToday(), false);

  // Re-unlock
  recordUnlockSuccess('01712345678', true);
  assert.equal(isAppUnlockedToday(), true);

  // Explicit sign out
  markLoggedOut();
  assert.equal(isAppUnlockedToday(), false);
});
