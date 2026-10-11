# Firebase Deployment Workflow Fixes

## October 11, 2026: Firestore deployment HTTP 403

The [failed deployment](https://github.com/mbir31/HishApp/actions/runs/38148988055)
installed dependencies and built successfully, but failed before Hosting deployment:

```text
Request to https://serviceusage.googleapis.com/v1/projects/hishapp1/services/firestore.googleapis.com
had HTTP Error: 403, Permission denied to get service [firestore.googleapis.com]
```

### Cause

The service account in `FIREBASE_SERVICE_ACCOUNT` can read the existing Firestore
release, create rulesets, and update the release. It cannot inspect or enable
project APIs (`serviceusage.services.get` / `serviceusage.services.enable`).
`firebase-tools deploy --only firestore:rules` performs that additional API
inspection before publishing rules, so it fails despite the account having the
permissions needed to update the existing rules.

Earlier green runs were misleading: the rules step used `run:` without a literal
block (`|`). YAML folded its three commands into one `printf`; neither the rules
deployment nor credential cleanup actually executed. Correcting the YAML exposed
the IAM failure.

### Fix

- Deploy rules through the official Firebase Admin SDK's Security Rules API,
  using `npm run deploy:firestore-rules -- --project hishapp1`.
- Read the rules file configured in `firebase.json`. Read the existing default
  Firestore release, skip unchanged source, and compile a new immutable ruleset
  before publishing it. Read, compilation, and release errors remain fatal;
  Hosting is not deployed after a failed rules deployment.
- Keep the service-account JSON in memory. No credential file is written, and
  error objects containing authorization headers are never logged.
- Do not grant broader IAM roles, bypass rule compilation, or change the rules
  themselves. The deployment tooling updates an **existing default database**;
  API enablement and initial database/release provisioning remain administrator
  tasks rather than CI responsibilities.
- Pin the Admin SDK in the lockfile as a development dependency. It is not
  imported by the browser application or included in its production bundle.
- Use Node 24 with current checkout/setup-node actions and strict `npm ci`.
  Regenerate the lockfile with Node 24/npm 11 and no existing `node_modules` so
  optional native packages for all platforms are included. The old install
  fallback masked missing entries that npm 11 rejects with `EUSAGE`.
  `.npmrc` supplies the lockfile's `legacy-peer-deps` setting.
- Validate type-checks, regression tests, and the production build on pull
  requests. Deployment tooling is included in the TypeScript check.

A read-only access smoke check is available with the existing secret supplied in
the environment (never commit the service-account JSON):

```sh
npm run deploy:firestore-rules -- --project hishapp1 --check-access
```

This reads the active release/ruleset; it does not publish rules or prove write
access. Deployment tests cover ordering, unchanged-source skipping, read-only
checks, configuration, credential validation, and failure propagation.

## Earlier issue: dependency installation

An earlier failure at `npm ci` reported `EUSAGE` because `package.json` and
`package-lock.json` were out of sync. Firebase packages also required Node
`>=24.12.0`, while the workflow was using Node 22. The lockfile was synchronized
and the workflow switched to Node 24. These fixes remain in place; a stale
lockfile now fails explicitly rather than silently installing unpinned versions.
