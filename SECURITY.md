# HishApp — Security Review (2026-10-11)

Honest assessment of whether HishApp is **safe to publish for regular clinical use**.
Short answer: **not yet** — one critical cloud-access issue must be fixed first.
Everything below was verified against the code in this repo.

## Verdict

| Area | Status |
|---|---|
| Local app hardening (offline ledger, backups, PIN hashing) | ✅ Good |
| Client-side code safety (XSS, CSV injection, deps) | ✅ Good |
| Cloud access control (who can read/write patient data) | 🔴 **Blocker — open to the internet** |
| PIN strength vs. offline brute force | 🟠 Weak by design (4 digits, readable hash) |
| Morning unlock availability without internet | 🟠 Locked out until back online |
| Hosting headers / transport security | ✅ Fixed in this release |

**Do not onboard real clinics with patient names until the Firestore blocker (§1) is closed.**
A demo/pilot with a couple of trusted doctors and non-sensitive test data is acceptable
while the fix is in progress.

## 1. 🔴 BLOCKER — Firestore vaults are world-readable/writable

**Where:** `firestore.rules` — every vault rule is `allow read, write: if true;`
**Why it matters:** the 4-digit PIN is verified **only inside the app**
(`src/services/vaultAuth.ts`); Firestore itself checks no identity at all.
The Firebase project id + apiKey ship inside the public JS bundle (normal for
Firebase), so anyone on the internet can, with a few lines of code:

- **list every vault** (`allow read` includes collection list) and download all
  patient names, procedures, amounts, settlements and audit logs;
- **modify or delete** any clinic's ledger, including planting fake records;
- **overwrite any vault's PIN hash** and take the account over;
- **wipe the cloud snapshots** (`latest` / `yesterday` / `last_week`).

Phone-number "secrecy" is not a defense: Bangladeshi mobile numbers use a small
set of prefixes, and vault ids are listable anyway.

**Fix (in order, all are Firebase-console + rules work — no app redesign):**

1. Enable **Firebase Authentication → Phone provider** (maps 1:1 onto the vault id).
2. Change the rules to bind each vault to its owner, e.g.
   `allow read, write: if request.auth != null && request.auth.uid == phoneNumber;`
   (or keep the PIN UX and verify it in a Cloud Function that mints a custom
   token/claim, then check the claim in the rules).
3. Enable **App Check** (reCAPTCHA v3 / Play Integrity / App Attest) so only the
   real PWA can call the project.
4. Rotate nothing client-side: after (1)–(2), existing vault data stays valid.

> ⚠️ Do NOT tighten the rules before step 1 exists — every device would be
> locked out of its own data (this warning is also embedded in `firestore.rules`).

## 2. 🟠 4-digit PIN cannot survive a readable hash

PBKDF2-SHA256 at 210,000 rounds (`PIN_HASH_VERSION = 2`, with transparent v1→v2
upgrade on login) is implemented correctly — but the salt + hash are stored in
the openly-readable vault document (§1), and 10,000 PIN candidates × 210k rounds
falls to a GPU in seconds-to-minutes. The stretching only becomes meaningful
**after** §1 is fixed (hash no longer world-readable) **plus** server-side
rate limiting. Until then, treat the PIN as a casual device gate, not encryption.

## 3. 🟠 New-day unlock requires internet (availability, not just security)

Both PIN login and biometric login call Firestore (`getDoc`) before unlocking
(`src/services/backupEngine.ts` → `login` / `loginWithBiometrics`); there is no
offline PIN check against the stored session. So on a new calendar day, or after
Lock/Sign-out, **a doctor with no connectivity cannot open their own local
ledger at all**. The README now carries a footnote stating this. Recommended
follow-up: optional offline unlock (verify PIN against the stored stretched hash
— requires also caching the salt at login time), with a banner that cloud sync
is pending until reconnect.

## 4. Biometrics: device gate, not vault cryptography

WebAuthn platform authentication (Face ID / fingerprint) is real hardware-backed
user verification, but the assertion signature is never verified against a
server — enrollment is a `localStorage` record and any valid on-device assertion
unlocks the vault (`src/services/biometricAuth.ts`). Practical impact is limited
(an attacker still needs the physical device + enrolled biometrics), but do not
describe it as cryptographic vault access. Related: anyone who can enroll a new
fingerprint on an **unlocked** device can then reset the vault PIN.

## 5. Backups/exports are unencrypted files in Downloads

The 7-day auto-backup (`HishApp_AutoBackup-<date>.json`), manual JSON/CSV/PDF/JPG
exports land unencrypted in the phone's `Downloads` folder, containing patient
names and financials. Acceptable for a personal device, but doctors should know:
don't share the phone's files, and delete old exports. A future hardening step
is an optional encrypted (PIN-derived, e.g. AES-GCM) export format.

## 6. What's already solid ✅

- **No XSS surface:** zero uses of `dangerouslySetInnerHTML` / `innerHTML` / `eval`;
  all rendering goes through React escaping.
- **CSV formula-injection neutralised** in `exportAllDataCSV` (`= + - @ TAB CR`
  prefixed cells are defused).
- **Local redundancy is genuinely good:** per-vault IndexedDB ledgers
  (`HishAppLedger_<phone>`) + atomic sync outbox, `HishAppSafetyMirror` shadow DB,
  emergency `localStorage` snapshots, `navigator.storage.persist()`, multi-gen
  cloud snapshots, 10-second Undo toast, audit-log recycle bin.
- **Sync engine:** batched writes, acked outbox, backoff retry, cross-tab +
  visibility + online triggers, parity reconciliation — reviewed, sound.
- **111/111 unit tests pass**, `tsc --noEmit` clean, production build clean.
- **Dependencies:** no secrets in the repo (the Firebase `apiKey` is a public
  browser key by design); `npm audit` surface is the standard React/Firebase set.
- **Transport/clickjacking (fixed 2026-10-11):** `firebase.json` now sends
  `Strict-Transport-Security`, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, a minimal `Permissions-Policy`, `no-cache` for `/sw.js`,
  and a **report-only** CSP to observe violations before enforcing one.

## Pre-launch checklist

- [ ] Firebase Phone Auth enabled; Firestore rules bound to `request.auth` (§1)
- [ ] App Check enforced on Firestore
- [ ] Decide on offline-unlock behaviour (§3) and document it in-app
- [ ] Consider encrypted export option (§5)
- [ ] Re-run this review after the above; then publish for regular use
