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

## Suggested fix

### 1) Update the workflow to use a supported Node version

In `.github/workflows/firebase-deploy.yml`, change:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: npm
```

to:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 24
    cache: npm
```

### 2) Regenerate the lock file

Run this locally in the repository:

```bash
npm install
```

Then commit the updated `package-lock.json` to the repo.

### 3) Re-run CI

After updating the lock file and Node version, the workflow should be able to complete the install step before building and deploying.

## Summary

The failure is not from Firebase deployment itself; it is caused by an install-time dependency mismatch:

- the project is using a Node version too old for one or more Firebase packages
- `package-lock.json` is out of sync with `package.json`

Updating the workflow to Node 24 and refreshing the lock file should resolve the issue.
