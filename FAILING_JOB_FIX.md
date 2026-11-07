# Firebase Deployment Workflow Fixes

## November 7, 2026: Hosting API permission check

The [deployment](https://github.com/mbir31/HishApp/actions/runs/42415532048)
installed and built successfully and deployed Firestore rules, but Hosting failed
with HTTP 403: permission denied to get service `firebasehosting.googleapis.com`.
The Hosting action defaults to the latest Firebase CLI. Firebase CLI added an
API-enabled check in [firebase-tools #11296](https://github.com/firebase/firebase-tools/pull/11296),
which requires `serviceusage.services.get`; the existing deployment account does
not have that permission.

As an immediate workaround, pin the Hosting action to Firebase CLI 15.33.0,
the version available at the last successful Hosting deployment, before that
check was added. A [verification run](https://github.com/mbir31/HishApp/actions/runs/42415912203)
successfully built and deployed the current application to the live site with
that version. This pin should not be permanent: a project administrator can
ensure the Hosting API is enabled and grant the deployment service account the
least-privileged access needed to read service status (for example, Service Usage
Viewer). Then test and update the pin to a current CLI version to receive fixes.
Hosting deployment permissions remain necessary independently of Service Usage
permissions. Do not change Firestore rules or grant API enablement permissions
just to bypass this check.

## November 4, 2026: optional platform packages missing again

The [deployment](https://github.com/mbir31/HishApp/actions/runs/41903279506)
failed during dependency installation. Its logs were unavailable in this environment,
but running `npm ci` with Node 24 and npm 11 reproduced `EUSAGE`: the lockfile
was missing optional native packages for other platforms. npm 10 did not catch
this, so a successful install with an older npm is not sufficient validation.

Restore the missing entries without changing locked versions by removing the local
`node_modules` directory and running `npm install --package-lock-only` with Node
24/npm 11. Then run `npm ci` with the same versions, followed by lint, tests, and
build. The pull-request workflow runs these checks before a change reaches main.

## October 11, 2026: `npm ci` EUSAGE after lockfile pruning

The [failed deployment](https://github.com/mbir31/HishApp/actions/runs/38156771694)
stopped at **Install dependencies**. The preceding commit hand-pruned the
optional, platform-specific packages (`@esbuild/*`, `@rolldown/binding-*`,
`@tailwindcss/oxide-*`, `lightningcss-*`, `@typescript/typescript-*`,
`fsevents`) from `package-lock.json`, keeping only the linux-x64 entries.

npm 11 (bundled with Node 24 in CI) requires the lockfile to describe the whole
dependency tree, including optional packages for other platforms. With those
entries missing, `npm ci` aborts with:

```text
npm error code EUSAGE
npm error `npm ci` can only install packages when your package.json and
package-lock.json or npm-shrinkwrap.json are in sync.
npm error Missing: @tailwindcss/oxide-darwin-arm64@4.3.3 from lock file
...
```

### Fix

- Regenerate the lockfile with npm 11 (`npm install --package-lock-only`),
  which restores the 92 optional platform entries. No dependency version
  changed; nothing was removed.
- Never hand-edit or prune `package-lock.json`. Optional platform packages are
  metadata only — npm downloads just the ones matching the runner, so they do
  not add install time or bundle size.

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
