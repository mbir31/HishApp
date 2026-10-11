import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  deployFirestoreRules,
  loadRulesFile,
  parseServiceAccount,
} from '../scripts/deploy-firestore-rules';

const oldSource = "rules_version = '2'; service cloud.firestore { match /{path=**} { allow read: if false; } }";
const file = { name: 'firestore.rules', content: `${oldSource}\n// Updated source\n` };

function fakeClient(source = oldSource, failAt?: 'read' | 'compile' | 'release') {
  const calls: string[] = [];
  return {
    calls,
    async getFirestoreRuleset() {
      calls.push('read');
      if (failAt === 'read') throw new Error('Permission denied reading release');
      return { name: 'old-ruleset', createTime: '', source: [{ name: 'existing.rules', content: source }] };
    },
    async createRuleset(input: typeof file) {
      calls.push('compile');
      assert.deepEqual(input, file, 'deploy the exact configured file, without rewriting its rules');
      if (failAt === 'compile') throw new Error('Compilation failed');
      return { name: 'new-ruleset', createTime: '', source: [input] };
    },
    async releaseFirestoreRuleset(name: unknown) {
      calls.push('release');
      assert.equal(name, 'new-ruleset');
      if (failAt === 'release') throw new Error('Permission denied publishing rules');
    },
  };
}

test('rules deployment compiles the exact source before updating the Firestore release', async () => {
  const client = fakeClient();
  assert.deepEqual(await deployFirestoreRules(client, file), { name: 'new-ruleset', changed: true });
  assert.deepEqual(client.calls, ['read', 'compile', 'release']);
});

test('unchanged rules do not create another ruleset or update the release', async () => {
  const client = fakeClient(file.content);
  assert.deepEqual(await deployFirestoreRules(client, file), { name: 'old-ruleset', changed: false });
  assert.deepEqual(client.calls, ['read']);
});

test('the access check is read-only even if the local rules have changed', async () => {
  const client = fakeClient();
  await deployFirestoreRules(client, file, true);
  assert.deepEqual(client.calls, ['read']);
});

test('a compilation failure never updates the active release', async () => {
  const client = fakeClient(oldSource, 'compile');
  await assert.rejects(deployFirestoreRules(client, file), /Compilation failed/);
  assert.deepEqual(client.calls, ['read', 'compile']);
});

test('an unreadable or missing active release fails without attempting to create one', async () => {
  const client = fakeClient(oldSource, 'read');
  await assert.rejects(deployFirestoreRules(client, file), /Permission denied reading release/);
  assert.deepEqual(client.calls, ['read']);
});

test('release errors propagate rather than being treated as a successful deployment', async () => {
  const client = fakeClient(oldSource, 'release');
  await assert.rejects(deployFirestoreRules(client, file), /Permission denied publishing rules/);
  assert.deepEqual(client.calls, ['read', 'compile', 'release']);
});

test('empty rules are rejected before any API request', async () => {
  const client = fakeClient();
  await assert.rejects(deployFirestoreRules(client, { ...file, content: ' \n' }), /rules file is empty/);
  assert.deepEqual(client.calls, []);
});

test('the deployer reads the rules path from firebase.json relative to that config', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'hishapp-rules-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'rules'));
  await writeFile(join(dir, 'rules', 'custom.rules'), file.content);
  await writeFile(join(dir, 'firebase.json'), JSON.stringify({ firestore: { rules: 'rules/custom.rules' } }));
  assert.deepEqual(await loadRulesFile(join(dir, 'firebase.json')), {
    name: 'rules/custom.rules', content: file.content,
  });
});

test('missing rules configuration fails instead of publishing a default file', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'hishapp-rules-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'firebase.json'), JSON.stringify({ hosting: { public: 'dist' } }));
  await assert.rejects(loadRulesFile(join(dir, 'firebase.json')), /must configure firestore.rules/);
});

test('service-account credentials are normalized for the Admin SDK', () => {
  assert.deepEqual(parseServiceAccount(JSON.stringify({
    project_id: 'example-project', client_email: 'deployer@example.com', private_key: 'test-private-key',
  })), {
    projectId: 'example-project', clientEmail: 'deployer@example.com', privateKey: 'test-private-key',
  });
});

test('missing or malformed credentials fail safely without echoing secret contents', () => {
  assert.throws(() => parseServiceAccount(undefined), /FIREBASE_SERVICE_ACCOUNT_JSON is required/);
  assert.throws(() => parseServiceAccount('{"private_key":"secret-key"'), (error: Error) => {
    assert.equal(error.message.includes('secret-key'), false);
    return error.message.includes('valid service-account JSON');
  });
  for (const invalid of ['null', '[]', '{}', '{"project_id": 42}']) {
    assert.throws(() => parseServiceAccount(invalid), /must include project_id, client_email and private_key/);
  }
});
