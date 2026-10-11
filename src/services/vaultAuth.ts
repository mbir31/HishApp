/**
 * HISHAPP — SECURED CLOUD DATA VAULT AUTHENTICATION
 * ─────────────────────────────────────────────────────────────────
 * Central Cloud Firestore authentication for HishApp.
 * Users authenticate with:
 *   - 11-digit mobile number (e.g., 01XXXXXXXXX)
 *   - 4-digit secret PIN (e.g., 1234)
 *
 * First login: Automatically provisions a secured Firestore data vault
 * for that 11-digit number with a salted, stretched PIN hash.
 * Subsequent logins: Verifies PIN on any device running the PWA.
 * PIN can be updated anytime by the user.
 *
 * PIN HASHING
 * ───────────
 * A 4-digit PIN has only 10,000 possible values, so a single fast hash is not
 * enough: anyone who can read the vault document can brute-force it offline in
 * milliseconds. Vaults are therefore hashed with PBKDF2-SHA256 at
 * `PIN_HASH_ITERATIONS` rounds (v2). Vaults created before v2 still store a
 * single-round SHA-256 (v1); those are still accepted so nobody is locked out,
 * and the very next successful login transparently re-hashes them to v2.
 */
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getFirestoreDb, isFirebaseConfigured } from '../config/firebase';

const SESSION_KEY = 'hisapp_vault_session';
const CACHED_VAULT_META_PREFIX = 'hisapp_vault_meta_';

export interface VaultSession {
  phoneNumber: string;
  pinHash: string;
  isNew?: boolean;
  loggedInAt: number;
}

export interface CachedVaultCredentials {
  pinHash: string;
  salt: string;
  hashVersion?: number;
  cachedAt?: number;
}

/** Retrieve locally cached vault credentials for offline morning unlock */
export function getCachedVaultMeta(phone: string): CachedVaultCredentials | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${CACHED_VAULT_META_PREFIX}${cleanPhoneNumber(phone)}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedVaultCredentials;
    if (parsed && typeof parsed.pinHash === 'string' && typeof parsed.salt === 'string') {
      return parsed;
    }
  } catch {
    // ignore parse error
  }
  return null;
}

/** Cache vault credentials locally so users can unlock offline when internet is unavailable */
export function cacheVaultMeta(
  phone: string,
  meta: Pick<VaultMetadata, 'pinHash' | 'salt' | 'hashVersion'>
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const payload: CachedVaultCredentials = {
      pinHash: meta.pinHash,
      salt: meta.salt,
      hashVersion: meta.hashVersion,
      cachedAt: Date.now(),
    };
    localStorage.setItem(`${CACHED_VAULT_META_PREFIX}${cleanPhoneNumber(phone)}`, JSON.stringify(payload));
  } catch {
    // ignore quota error
  }
}

export interface VaultMetadata {
  phone: string;
  pinHash: string;
  salt: string;
  /**
   * PIN hash scheme. `1` (or missing) = single-round SHA-256 written by older
   * builds; `2` = PBKDF2-SHA256 with `PIN_HASH_ITERATIONS` rounds.
   */
  hashVersion?: number;
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number;
  doctorName?: string;
  clinicName?: string;
}

/** Sanitize input to only digits */
export function cleanPhoneNumber(phone: string): string {
  return (phone || '').replace(/\D/g, '').trim();
}

/** Check if phone is a valid 11-digit mobile number */
export function isValidPhoneNumber(phone: string): boolean {
  const cleaned = cleanPhoneNumber(phone);
  return cleaned.length === 11 && /^\d{11}$/.test(cleaned);
}

/** Check if PIN is strictly 4 digits */
export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test((pin || '').trim());
}

/** Generate a random 16-byte hex salt */
export function generateSalt(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback if crypto.getRandomValues is unavailable
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/** PIN hash scheme written by every new vault and every PIN change. */
export const PIN_HASH_VERSION = 2;

/**
 * PBKDF2 rounds for the v2 PIN hash. High enough that a 10,000-value PIN
 * space cannot be swept offline in a useful time, low enough to stay
 * imperceptible on a mid-range phone.
 */
export const PIN_HASH_ITERATIONS = 210_000;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

function hasSubtleCrypto(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

/**
 * Legacy v1 scheme: a single salted SHA-256 round. Kept ONLY so vaults written
 * by older builds can still be verified; never used to hash a new PIN.
 */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const input = `hisapp_v1_salt_${salt}_pin_${pin.trim()}`;
  if (hasSubtleCrypto() && crypto.subtle.digest) {
    const data = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return toHex(hashBuffer);
  }
  // Fallback for non-subtle environments (e.g. Node tests if globalThis.crypto not available)
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `hash_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

/**
 * Current v2 scheme: PBKDF2-SHA256 over the salt, hex encoded.
 *
 * Unlike `hashPin`, this deliberately has no weak fallback. Without
 * `crypto.subtle` there is no way to stretch a 4-digit PIN safely, so hashing
 * fails loudly instead of silently storing something reversible. Every context
 * that can reach Firestore is a secure context, so `crypto.subtle` is present
 * whenever a login can actually succeed.
 */
export async function hashPinStretched(pin: string, salt: string): Promise<string> {
  if (!hasSubtleCrypto() || !crypto.subtle.importKey || !crypto.subtle.deriveBits) {
    throw new Error(
      'This browser does not expose the Web Crypto API, so the PIN cannot be secured. Open HishApp over HTTPS.'
    );
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin.trim()), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(`hisapp_v2_${salt}`),
      iterations: PIN_HASH_ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    256
  );
  return toHex(bits);
}

/** Hash scheme recorded on a vault document. */
export function pinHashVersionOf(meta: Pick<VaultMetadata, 'hashVersion'> | null | undefined): number {
  const version = Number(meta?.hashVersion);
  return version === PIN_HASH_VERSION ? PIN_HASH_VERSION : 1;
}

/**
 * Verify a PIN against a stored vault document.
 *
 * `needsUpgrade` is true when the PIN matched a legacy v1 hash, so the caller
 * can transparently re-hash it to v2 on this successful login.
 */
export async function verifyVaultPin(
  pin: string,
  meta: Pick<VaultMetadata, 'pinHash' | 'salt' | 'hashVersion'>
): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  if (pinHashVersionOf(meta) === PIN_HASH_VERSION) {
    const candidate = await hashPinStretched(pin, meta.salt);
    return { valid: timingSafeEqualHex(candidate, meta.pinHash), needsUpgrade: false };
  }
  const candidate = await hashPin(pin, meta.salt);
  return { valid: candidate === meta.pinHash, needsUpgrade: true };
}

/** Constant-time comparison so hash prefixes cannot be probed by timing. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Log into an existing vault or automatically provision a new secured vault
 * on first login with the 11-digit number and 4-digit PIN.
 *
 * Supports offline unlock: if internet is unreachable or Firebase is offline,
 * verifies PIN against locally cached credentials previously stored on this device.
 */
export async function loginOrCreateVault(
  rawPhone: string,
  rawPin: string
): Promise<VaultSession> {
  const phone = cleanPhoneNumber(rawPhone);
  if (!isValidPhoneNumber(phone)) {
    throw new Error('Please enter a valid 11-digit mobile number.');
  }

  const pin = (rawPin || '').trim();
  if (!isValidPin(pin)) {
    throw new Error('PIN must be exactly 4 digits.');
  }

  const now = Date.now();
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const configured = isFirebaseConfigured();

  // If offline or Firebase is not configured, attempt local cached hash unlock
  if (!isOnline || !configured) {
    const cached = getCachedVaultMeta(phone);
    if (cached) {
      const { valid } = await verifyVaultPin(pin, cached);
      if (!valid) {
        throw new Error('Incorrect PIN. Please enter your valid 4-digit secret PIN.');
      }
      const session: VaultSession = {
        phoneNumber: phone,
        pinHash: cached.pinHash,
        isNew: false,
        loggedInAt: now,
      };
      storeVaultSession(session);
      return session;
    }
    if (!configured) {
      throw new Error('Firebase configuration is missing or incomplete.');
    }
    throw new Error('Device is offline. Please connect to the internet once to unlock this vault.');
  }

  try {
    const db = getFirestoreDb();
    const vaultRef = doc(db, 'vaults', phone);
    const snapshot = await getDoc(vaultRef);

    if (!snapshot.exists()) {
      // First-time registration: Create secured cloud vault
      const salt = generateSalt();
      const pinHash = await hashPinStretched(pin, salt);

      const vaultData: VaultMetadata = {
        phone,
        pinHash,
        salt,
        hashVersion: PIN_HASH_VERSION,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      };

      await setDoc(vaultRef, vaultData);
      cacheVaultMeta(phone, vaultData);

      const session: VaultSession = {
        phoneNumber: phone,
        pinHash,
        isNew: true,
        loggedInAt: now,
      };
      storeVaultSession(session);
      return session;
    }

    // Existing vault: Verify PIN
    const data = snapshot.data() as VaultMetadata;
    const { valid, needsUpgrade } = await verifyVaultPin(pin, data);

    if (!valid) {
      throw new Error('Incorrect PIN. Please enter your valid 4-digit secret PIN.');
    }

    let pinHash = data.pinHash;
    let currentSalt = data.salt;
    let currentVersion = data.hashVersion;

    // Legacy vaults are re-hashed to the stretched scheme on this successful
    // login, so an old vault becomes brute-force resistant without the doctor
    // having to do anything.
    const patch: Record<string, unknown> = { lastLoginAt: now };
    if (needsUpgrade) {
      try {
        const upgradedSalt = generateSalt();
        const upgradedHash = await hashPinStretched(pin, upgradedSalt);
        patch.pinHash = upgradedHash;
        patch.salt = upgradedSalt;
        patch.hashVersion = PIN_HASH_VERSION;
        patch.updatedAt = now;
        pinHash = upgradedHash;
        currentSalt = upgradedSalt;
        currentVersion = PIN_HASH_VERSION;
      } catch (err) {
        // Keep the working v1 hash rather than locking the vault out.
        console.warn('Could not upgrade the vault PIN hash yet:', err);
      }
    }

    // Cache vault credentials locally for fast & offline morning unlock
    cacheVaultMeta(phone, {
      pinHash,
      salt: currentSalt,
      hashVersion: currentVersion,
    });

    // Update last login timestamp in Firestore
    try {
      await updateDoc(vaultRef, patch);
    } catch {
      // non-fatal if offline
    }

    const session: VaultSession = {
      phoneNumber: phone,
      pinHash,
      isNew: false,
      loggedInAt: now,
    };
    storeVaultSession(session);
    return session;
  } catch (err: any) {
    // If the PIN was incorrect, propagate that error directly
    if (err?.message?.includes('Incorrect PIN')) {
      throw err;
    }

    // Network / Firestore error: Fallback to cached vault credentials
    const cached = getCachedVaultMeta(phone);
    if (cached) {
      const { valid } = await verifyVaultPin(pin, cached);
      if (!valid) {
        throw new Error('Incorrect PIN. Please enter your valid 4-digit secret PIN.');
      }
      const session: VaultSession = {
        phoneNumber: phone,
        pinHash: cached.pinHash,
        isNew: false,
        loggedInAt: now,
      };
      storeVaultSession(session);
      return session;
    }

    throw err;
  }
}

/**
 * Change the 4-digit PIN of the current vault
 */
export async function changeVaultPin(
  rawPhone: string,
  rawOldPin: string,
  rawNewPin: string
): Promise<void> {
  const phone = cleanPhoneNumber(rawPhone);
  if (!isValidPhoneNumber(phone)) {
    throw new Error('Invalid mobile number.');
  }

  const newPin = (rawNewPin || '').trim();
  if (!isValidPin(newPin)) {
    throw new Error('New PIN must be exactly 4 digits.');
  }

  const db = getFirestoreDb();
  const vaultRef = doc(db, 'vaults', phone);
  const snapshot = await getDoc(vaultRef);

  if (!snapshot.exists()) {
    throw new Error('Vault not found.');
  }

  const data = snapshot.data() as VaultMetadata;
  const { valid } = await verifyVaultPin((rawOldPin || '').trim(), data);

  if (!valid) {
    throw new Error('Current PIN is incorrect.');
  }

  // Generate new salt and new hash — always on the current (stretched) scheme.
  const newSalt = generateSalt();
  const newPinHash = await hashPinStretched(newPin, newSalt);

  await updateDoc(vaultRef, {
    pinHash: newPinHash,
    salt: newSalt,
    hashVersion: PIN_HASH_VERSION,
    updatedAt: Date.now(),
  });

  // Keep local cached meta in sync
  cacheVaultMeta(phone, {
    pinHash: newPinHash,
    salt: newSalt,
    hashVersion: PIN_HASH_VERSION,
  });

  // Update local session
  const currentSession = getStoredVaultSession();
  if (currentSession && currentSession.phoneNumber === phone) {
    storeVaultSession({
      ...currentSession,
      pinHash: newPinHash,
    });
  }
}

/** Get persisted vault session from localStorage */
export function getStoredVaultSession(): VaultSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VaultSession;
    if (parsed && isValidPhoneNumber(parsed.phoneNumber) && parsed.pinHash) {
      return parsed;
    }
  } catch {
    // ignore parse error
  }
  return null;
}

/** Store vault session in localStorage */
export function storeVaultSession(session: VaultSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore quota error
  }
}

/** Clear active vault session from localStorage */
export function clearVaultSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore error
  }
}
