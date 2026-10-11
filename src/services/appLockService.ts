/**
 * HISHAPP — APP ACCESS LOCK & DAILY UNLOCK SERVICE
 * ─────────────────────────────────────────────────────────────────
 * Enforces security & seamless clinic workflow access rules:
 *
 * 1. Initial Gate: The app is accessible ONLY through the login screen.
 * 2. First-Time Login: User enters 11-digit mobile number + 4-digit PIN.
 * 3. Remember Mobile Number / User ID: If checked, subsequent access
 *    only requires the 4-digit PIN or phone's biometric (Fingerprint / Face ID).
 * 4. Once-A-Day Unlock: If the user doesn't log out from the app, no credentials
 *    are needed to access the app for the same calendar day. In a day, PIN or
 *    biometric is needed only once.
 * 5. Explicit Logout / New Day: Re-locks the app and requires credentials to unlock.
 */

import { getStoredVaultSession } from './vaultAuth';

const STORAGE_KEYS = {
  REMEMBER_USER: 'hisapp_remember_user',
  SAVED_USER_ID: 'hisapp_saved_user_id',
  LAST_UNLOCKED_DATE: 'hisapp_last_unlocked_date',
  LOGGED_OUT: 'hisapp_user_logged_out',
} as const;

/** Get today's local date string formatted as YYYY-MM-DD */
export function getTodayDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Check if "Remember Mobile Number / User ID" was ticked by the user */
export function getRememberUserPreference(): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    const val = localStorage.getItem(STORAGE_KEYS.REMEMBER_USER);
    // Default to true for convenience unless explicitly turned off
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

/** Set "Remember Mobile Number / User ID" preference */
export function setRememberUserPreference(remember: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.REMEMBER_USER, remember ? 'true' : 'false');
  } catch {
    // ignore
  }
}

/** Get remembered 11-digit mobile number / User ID */
export function getRememberedUserId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const phone = localStorage.getItem(STORAGE_KEYS.SAVED_USER_ID);
    return phone && /^\d{11}$/.test(phone.trim()) ? phone.trim() : null;
  } catch {
    return null;
  }
}

/** Save remembered 11-digit mobile number / User ID */
export function setRememberedUserId(phone: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.SAVED_USER_ID, phone.trim());
  } catch {
    // ignore
  }
}

/** Clear remembered user */
export function clearRememberedUserId(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEYS.SAVED_USER_ID);
  } catch {
    // ignore
  }
}

/** Get the date on which the app was last unlocked */
export function getLastUnlockedDate(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_KEYS.LAST_UNLOCKED_DATE) || null;
  } catch {
    return null;
  }
}

/**
 * Check if the app is currently unlocked for today.
 *
 * Rules:
 *   1. Must have an active stored vault session.
 *   2. Must NOT be marked as explicitly logged out.
 *   3. Must have been unlocked on today's calendar date (once-a-day unlock rule).
 */
export function isAppUnlockedToday(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    // If user explicitly clicked log out, app is locked
    const isLoggedOut = localStorage.getItem(STORAGE_KEYS.LOGGED_OUT) === 'true';
    if (isLoggedOut) {
      return false;
    }

    // Must have a valid active session
    const session = getStoredVaultSession();
    if (!session || !session.phoneNumber) {
      return false;
    }

    // Check once-a-day rule: unlocked on today's local date
    const lastUnlockedDate = getLastUnlockedDate();
    const today = getTodayDateKey();
    return lastUnlockedDate === today;
  } catch {
    return false;
  }
}

/**
 * Record a successful unlock (by full login, PIN unlock, or biometric unlock).
 * Sets the last unlocked date to today, clearing any logged-out flags.
 */
export function recordUnlockSuccess(phone: string, remember: boolean): void {
  if (typeof localStorage === 'undefined') return;

  const today = getTodayDateKey();
  try {
    localStorage.setItem(STORAGE_KEYS.LAST_UNLOCKED_DATE, today);
    localStorage.setItem(STORAGE_KEYS.LOGGED_OUT, 'false');
    localStorage.setItem(STORAGE_KEYS.REMEMBER_USER, remember ? 'true' : 'false');

    if (remember) {
      localStorage.setItem(STORAGE_KEYS.SAVED_USER_ID, phone.trim());
    } else {
      localStorage.removeItem(STORAGE_KEYS.SAVED_USER_ID);
    }
  } catch {
    // ignore
  }
}

/**
 * Lock the app immediately (e.g. Lock button or date change)
 */
export function lockApp(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEYS.LAST_UNLOCKED_DATE);
  } catch {
    // ignore
  }
}

/**
 * Log out from the app: marks logged out, clears today's unlock date.
 * If user chose not to remember their ID, cleans up the remembered ID too.
 */
export function markLoggedOut(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.LOGGED_OUT, 'true');
    localStorage.removeItem(STORAGE_KEYS.LAST_UNLOCKED_DATE);
    const remember = getRememberUserPreference();
    if (!remember) {
      localStorage.removeItem(STORAGE_KEYS.SAVED_USER_ID);
    }
  } catch {
    // ignore
  }
}
