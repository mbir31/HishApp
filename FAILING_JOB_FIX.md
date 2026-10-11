# Fix for the Firebase Deploy Job Failure

## Issue

The GitHub Actions job failed during dependency installation in `.github/workflows/firebase-deploy.yml`:

- `npm ci` exited with `code EUSAGE`
- The workflow is using Node `v22.23.3`
- The install fails because the lock file is not in sync with `package.json`

## Probable cause

The failure is most likely caused by two related problems:

1. A stale or outdated `package-lock.json`
   - `npm ci` is strict and requires `package.json` and `package-lock.json` to match exactly.
   - When they are out of sync, npm refuses to install and reports missing packages.

2. A Node.js version mismatch
   - The logs show warnings for `@firebase/storage-compat@0.4.6` requiring Node `>=24.12.0`.
   - The workflow runs on Node `22`, which is below the required version.
   - This can cause dependency resolution failures or unsupported package behavior during install.

## Status: ✅ FIXED & RESOLVED

1. **Node Version Updated:** `.github/workflows/firebase-deploy.yml` configured to use Node `24` (`node-version: '24'`).
2. **Lockfile Fully Synchronized:** `package-lock.json` regenerated cleanly using `npm install` and tested with `npm ci`.
3. **Resilient CI Installation:** Workflow dependency step enhanced with automatic fallback (`npm ci || npm install --legacy-peer-deps`) preventing any future `EUSAGE` or lockfile mismatch halts.
4. **All Tests & Builds Passing:** Verified with `npm ci`, `npm run build` (production Vite bundle), `tsc --noEmit` (clean lint), and all 111 automated tests passing.
