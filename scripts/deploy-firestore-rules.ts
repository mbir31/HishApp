import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { cert, deleteApp, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getSecurityRules, type RulesFile, type SecurityRules } from 'firebase-admin/security-rules';

type RulesClient = Pick<SecurityRules,
  'getFirestoreRuleset' | 'createRuleset' | 'releaseFirestoreRuleset'>;

export function parseServiceAccount(json: string | undefined): ServiceAccount {
  if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is required.');
  let account;
  try {
    account = JSON.parse(json);
  } catch {
    // Do not include JSON parser errors: they can echo parts of the private key.
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON.');
  }
  if (!account || ['project_id', 'client_email', 'private_key'].some(
    key => typeof account[key] !== 'string' || !account[key].trim(),
  )) {
    throw new Error('The service account must include project_id, client_email and private_key.');
  }
  return {
    projectId: account.project_id,
    clientEmail: account.client_email,
    privateKey: account.private_key,
  };
}

export async function loadRulesFile(configPath = 'firebase.json'): Promise<RulesFile> {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const rulesPath = config.firestore?.rules;
  if (typeof rulesPath !== 'string' || !rulesPath.trim()) {
    throw new Error('firebase.json must configure firestore.rules for the default database.');
  }
  return {
    name: rulesPath,
    content: await readFile(resolve(dirname(configPath), rulesPath), 'utf8'),
  };
}

export async function deployFirestoreRules(
  client: RulesClient,
  file: RulesFile,
  checkAccessOnly = false,
): Promise<{ name: string; changed: boolean }> {
  if (!file.content.trim()) throw new Error('The Firestore rules file is empty.');

  // This project already has a Firestore release. Read it first so errors are
  // fatal, and unchanged deployments don't consume the ruleset quota.
  const current = await client.getFirestoreRuleset();
  if (checkAccessOnly || (
    current.source.length === 1 && current.source[0].content === file.content
  )) {
    return { name: current.name, changed: false };
  }

  // The Rules API compiles the source when creating an immutable ruleset. Only
  // publish after that succeeds. Unlike the CLI, this requires no Service Usage
  // API inspection/enablement and never changes project IAM or database setup.
  const next = await client.createRuleset(file);
  await client.releaseFirestoreRuleset(next.name);
  return { name: next.name, changed: true };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      project: { type: 'string' },
      'check-access': { type: 'boolean', default: false },
    },
  });
  if (!values.project) throw new Error('Specify the Firebase project with --project.');
  const account = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const file = await loadRulesFile();
  const app = initializeApp({ credential: cert(account), projectId: values.project });
  try {
    const result = await deployFirestoreRules(getSecurityRules(app), file, values['check-access']);
    const status = values['check-access'] ? 'Access verified (read-only)' :
      result.changed ? 'Deployed' : 'Already up to date';
    console.log(`${status}: ${file.name} on ${values.project} (${result.name}).`);
  } finally {
    await deleteApp(app);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    // Log only the message, never an HTTP error object with authorization headers.
    console.error(`Firestore rules deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exitCode = 1;
  });
}
