import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import {
  calculateSettlementSummary,
  executeSettlement,
  exportAllDataCSV,
  getSettings,
  savePatientEntry,
} from '../src/db/indexedDB';
import { parseCSV, parseCSVFiles } from '../src/utils/importData';
import { buildSettlementStatement } from '../src/utils/settlementStatement';
import {
  computeSettlementOutcome,
  isSettlementWithDue,
  settlementResolutionOf,
  settlementOutcomeText,
  writtenOffAmountOf,
} from '../src/utils/settlementResolution';
import type { ClinicSettings, PatientEntry, Settlement } from '../src/types';

beforeEach(() => {
  // Isolated browser database per scenario.
  globalThis.indexedDB = new IDBFactory();
});

const settings: ClinicSettings = {
  clinicName: 'Yashfin Dental Care',
  doctorName: 'Dr. Test Surgeon',
  currencySymbol: '৳',
  sharePercentage: 40,
  autoBackup: true,
};

function visit(id: string, serial: number, name: string, date: string, amount: number): PatientEntry {
  return {
    id,
    serial,
    date,
    patientName: name,
    procedure: 'Filling',
    receivedAmount: amount,
    doctorShare: Math.round(amount * 0.4),
    settlementStatus: 'Pending',
    settlementId: null,
    remarks: '',
    createdAt: 1791547200000 + serial,
    updatedAt: 1791547200000 + serial,
  };
}

/** The scenario from the clinic: 4,300 claimable, a round 4,000 handed over. */
function settlementFixture(overrides: Partial<Settlement> = {}): Settlement {
  return {
    settlementId: 'ST-20261013-01',
    settlementDate: '2026-10-13',
    periodFrom: '2026-10-09',
    periodTo: '2026-10-12',
    patientCount: 8,
    periodShare: 4300,
    previousDue: 0,
    totalPayable: 4300,
    amountReceived: 4000,
    dueBalance: 300,
    remarks: 'Round-figure payment agreed with the clinic',
    patientIds: ['entry-1'],
    createdAt: 1791547200000,
    ...overrides,
  };
}

// ── Pure resolution arithmetic ─────────────────────────────────────────────

test('an underpayment is either carried forward or written off', () => {
  const carried = computeSettlementOutcome({
    totalClaimable: 4300,
    amountReceived: 4000,
    resolution: 'due',
  });
  assert.deepEqual(carried, { resolution: 'due', dueBalance: 300, writtenOffAmount: 0 });

  const cleared = computeSettlementOutcome({
    totalClaimable: 4300,
    amountReceived: 4000,
    resolution: 'cleared',
  });
  assert.deepEqual(cleared, { resolution: 'cleared', dueBalance: 0, writtenOffAmount: 300 });
});

test('an exact payment clears the batch with nothing written off', () => {
  const outcome = computeSettlementOutcome({
    totalClaimable: 4300,
    amountReceived: 4300,
    resolution: 'cleared',
  });
  assert.deepEqual(outcome, { resolution: 'cleared', dueBalance: 0, writtenOffAmount: 0 });
});

test('a clinic advance is never written off — it stays a credit', () => {
  const outcome = computeSettlementOutcome({
    totalClaimable: 4300,
    amountReceived: 4500,
    resolution: 'cleared',
  });
  assert.equal(outcome.dueBalance, -200);
  assert.equal(outcome.writtenOffAmount, 0);
});

test('float noise never leaks into a stored balance', () => {
  const outcome = computeSettlementOutcome({
    totalClaimable: 0.1 + 0.2,
    amountReceived: 0.3,
    resolution: 'due',
  });
  assert.equal(outcome.dueBalance, 0);
});

test('batches with no ticked confirmation keep the historic carry-forward', () => {
  const outcome = computeSettlementOutcome({ totalClaimable: 1000, amountReceived: 600 });
  assert.deepEqual(outcome, { resolution: 'due', dueBalance: 400, writtenOffAmount: 0 });
});

// ── Reading a stored batch ─────────────────────────────────────────────────

test('records written before this feature are read from their own balance', () => {
  const legacyWithDue = settlementFixture({ resolution: undefined, writtenOffAmount: undefined });
  assert.equal(settlementResolutionOf(legacyWithDue), 'due');
  assert.equal(isSettlementWithDue(legacyWithDue), true);
  assert.equal(writtenOffAmountOf(legacyWithDue), 0);

  const legacyExact = settlementFixture({
    amountReceived: 4300,
    dueBalance: 0,
    resolution: undefined,
    writtenOffAmount: undefined,
  });
  assert.equal(settlementResolutionOf(legacyExact), 'cleared');
  assert.equal(writtenOffAmountOf(legacyExact), 0);
});

test('the outcome line states the due, the waiver or the cleared account', () => {
  const fmt = (value: number) => new Intl.NumberFormat('en-BD').format(Math.round(value));

  assert.equal(
    settlementOutcomeText(settlementFixture({ resolution: 'due' }), '৳', fmt),
    'Settlement done with due amount ৳ 300'
  );
  assert.equal(
    settlementOutcomeText(
      settlementFixture({ resolution: 'cleared', dueBalance: 0, writtenOffAmount: 300 }),
      '৳',
      fmt
    ),
    'Settlement cleared with no due (৳ 300 written off by mutual agreement)'
  );
  assert.equal(
    settlementOutcomeText(
      settlementFixture({ resolution: 'cleared', amountReceived: 4300, dueBalance: 0, writtenOffAmount: 0 }),
      '৳',
      fmt
    ),
    'Settlement cleared with no due'
  );
});

// ── IndexedDB write path ───────────────────────────────────────────────────

test('a cleared batch leaves no due behind and records the waiver', async () => {
  await getSettings();
  await savePatientEntry(visit('entry-1', 1, 'Patient One', '2026-10-09', 5000));
  await savePatientEntry(visit('entry-2', 2, 'Patient Two', '2026-10-10', 5750));

  // 40% of 10,750 = 4,300 claimable; the clinic hands over a round 4,000.
  const cleared = await executeSettlement({
    periodFrom: '2026-10-09',
    periodTo: '2026-10-12',
    amountReceived: 4000,
    remarks: 'Round figure agreed',
    resolution: 'cleared',
  });

  assert.equal(cleared.totalPayable, 4300);
  assert.equal(cleared.resolution, 'cleared');
  assert.equal(cleared.writtenOffAmount, 300);
  assert.equal(cleared.dueBalance, 0);
  assert.equal(isSettlementWithDue(cleared), false);

  // Nothing is carried into the next batch — a fully cleared ledger.
  await savePatientEntry(visit('entry-3', 3, 'Patient Three', '2026-10-11', 2500));
  const next = await executeSettlement({
    periodFrom: '2026-10-11',
    periodTo: '2026-10-11',
    amountReceived: 1000,
    remarks: '',
    resolution: 'due',
  });
  assert.equal(next.previousDue, 0);
  assert.equal(next.totalPayable, 1000);
  assert.equal(next.dueBalance, 0);
});

test('a due batch still carries its shortfall into the next settlement', async () => {
  await getSettings();
  await savePatientEntry(visit('entry-1', 1, 'Patient One', '2026-10-09', 5000));
  await savePatientEntry(visit('entry-2', 2, 'Patient Two', '2026-10-10', 5750));

  const withDue = await executeSettlement({
    periodFrom: '2026-10-09',
    periodTo: '2026-10-12',
    amountReceived: 4000,
    remarks: 'Balance promised next week',
    resolution: 'due',
  });

  assert.equal(withDue.resolution, 'due');
  assert.equal(withDue.writtenOffAmount, 0);
  assert.equal(withDue.dueBalance, 300);

  await savePatientEntry(visit('entry-3', 3, 'Patient Three', '2026-10-11', 2500));
  const next = await executeSettlement({
    periodFrom: '2026-10-11',
    periodTo: '2026-10-11',
    amountReceived: 1000,
    remarks: '',
  });
  assert.equal(next.previousDue, 300);
  assert.equal(next.totalPayable, 1300);
  assert.equal(next.dueBalance, 300);
});

test('the settlement summary previews the ticked resolution', async () => {
  await getSettings();
  await savePatientEntry(visit('entry-1', 1, 'Patient One', '2026-10-09', 5000));
  await savePatientEntry(visit('entry-2', 2, 'Patient Two', '2026-10-10', 5750));

  const carried = await calculateSettlementSummary('2026-10-09', '2026-10-12', 4000, 'due');
  assert.equal(carried.totalPayable, 4300);
  assert.equal(carried.remainingDuePreview, 300);
  assert.equal(carried.writtenOffPreview, 0);

  const cleared = await calculateSettlementSummary('2026-10-09', '2026-10-12', 4000, 'cleared');
  assert.equal(cleared.remainingDuePreview, 0);
  assert.equal(cleared.writtenOffPreview, 300);
});

// ── Exported records and statements ────────────────────────────────────────

test('the CSV export and import round-trip a cleared batch', async () => {
  await getSettings();
  await savePatientEntry(visit('entry-1', 1, 'Patient One', '2026-10-09', 5000));
  await savePatientEntry(visit('entry-2', 2, 'Patient Two', '2026-10-10', 5750));
  await executeSettlement({
    periodFrom: '2026-10-09',
    periodTo: '2026-10-12',
    amountReceived: 4000,
    remarks: 'Round figure agreed',
    resolution: 'cleared',
  });

  const { settlementsCSV } = await exportAllDataCSV();
  const rows = parseCSV(settlementsCSV);
  const headers = rows[0];
  assert.ok(headers.includes('Resolution'));
  assert.ok(headers.includes('Written Off'));

  const result = parseCSVFiles([{ name: 'HishApp_Settlements.csv', text: settlementsCSV }]);
  assert.equal(result.skippedRows, 0);
  assert.equal(result.settlements.length, 1);
  assert.equal(result.settlements[0].resolution, 'cleared');
  assert.equal(result.settlements[0].writtenOffAmount, 300);
  assert.equal(result.settlements[0].dueBalance, 0);
});

test('a cleared statement prints the waiver and certifies no outstanding due', () => {
  const cleared = settlementFixture({ resolution: 'cleared', dueBalance: 0, writtenOffAmount: 300 });
  const statement = buildSettlementStatement(cleared, settings);

  assert.deepEqual(
    statement.rows.map((row) => [row.label, row.value, row.emphasis]),
    [
      ["Doctor's Professional Share (40%)", '৳ 4,300', 'highlight'],
      ['Previous Carry-over Due', '৳ 0', 'normal'],
      ['Total Payable to Doctor', '৳ 4,300', 'total'],
      ['Amount Received from Clinic', '৳ 4,000', 'normal'],
      ['Due Carried Forward', '৳ 0', 'due'],
      ['Waived by Mutual Agreement (Round-Figure Settlement)', '৳ 300', 'normal'],
    ]
  );
  assert.match(statement.statement, /waived by mutual agreement/);
  assert.match(statement.statement, /the account stands fully cleared with no outstanding due/);
  assert.ok(
    statement.meta.some(
      (field) => field.label === 'Settlement Confirmation' && field.value.includes('Cleared with no due')
    )
  );

  // A batch confirmed with a due still reads exactly as before.
  const withDue = buildSettlementStatement(settlementFixture({ resolution: 'due' }), settings);
  assert.equal(withDue.rows.length, 5);
  assert.match(withDue.statement, /which shall be carried forward/);
});

test('the Bangla certification also mentions the round-figure waiver', () => {
  const cleared = settlementFixture({ resolution: 'cleared', dueBalance: 0, writtenOffAmount: 300 });
  const statement = buildSettlementStatement(cleared, settings, { includeBangla: true });
  assert.match(statement.statementBangla, /সম্মতিতে/);
});
