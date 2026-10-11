import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import {
  csvSafeText,
  executeSettlement,
  exportAllDataCSV,
  getAllPatientEntries,
  getAllSettlements,
  getSettings,
  savePatientEntry,
} from '../src/db/indexedDB';
import { parseCSV, parseCSVFiles } from '../src/utils/importData';
import type { PatientEntry } from '../src/types';

beforeEach(() => {
  // Isolated browser database per scenario.
  globalThis.indexedDB = new IDBFactory();
});

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

// ── Spreadsheet formula-injection guard ────────────────────────────────────

test('csvSafeText neutralises spreadsheet formula triggers', () => {
  assert.equal(csvSafeText('=HYPERLINK("http://evil")'), "'=HYPERLINK(\"http://evil\")");
  assert.equal(csvSafeText('+1234567890'), "'+1234567890");
  assert.equal(csvSafeText('-2+3'), "'-2+3");
  assert.equal(csvSafeText('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvSafeText('\tTAB'), "'\tTAB");
});

test('csvSafeText leaves ordinary text untouched', () => {
  assert.equal(csvSafeText('Ayesha Rahman'), 'Ayesha Rahman');
  assert.equal(csvSafeText("O'Brien"), "O'Brien");
  assert.equal(csvSafeText(''), '');
  assert.equal(csvSafeText(null), '');
  assert.equal(csvSafeText(undefined), '');
  // A lone leading apostrophe is not a formula trigger, so it is preserved.
  assert.equal(csvSafeText("'quoted"), "'quoted");
});

test('CSV export guards a hostile patient name and remark', async () => {
  await getSettings();
  await savePatientEntry(visit('entry-evil', 1, '=CMD("calc")', '2026-10-09', 1000));
  await savePatientEntry(visit('entry-evil-2', 2, 'Normal Name', '2026-10-09', 500));

  const { patientEntriesCSV } = await exportAllDataCSV();
  const rows = parseCSV(patientEntriesCSV);
  const headers = rows[0];
  const nameCol = headers.indexOf('Patient Name / ID');
  const hostile = rows.find((r) => r[nameCol].includes('CMD'));

  assert.ok(hostile, 'the hostile row should still be exported');
  // The guard must be the very first character, so a spreadsheet reads the
  // cell as text instead of executing it.
  assert.equal(hostile[nameCol].startsWith("'="), true);
  // An ordinary name is not altered.
  const normal = rows.find((r) => r[nameCol] === 'Normal Name');
  assert.ok(normal, 'ordinary names must pass through unchanged');
});

test('CSV export → import round-trip restores the original hostile value', async () => {
  await getSettings();
  const hostileName = '=CMD("calc")';
  await savePatientEntry(visit('entry-evil', 1, hostileName, '2026-10-09', 1000));

  const { patientEntriesCSV } = await exportAllDataCSV();
  const result = parseCSVFiles([{ name: 'HishApp_Patient_Entries.csv', text: patientEntriesCSV }]);

  assert.equal(result.patientEntries.length, 1);
  // The guard is stripped on the way back in, so the ledger is unchanged.
  assert.equal(result.patientEntries[0].patientName, hostileName);
  assert.equal(result.skippedRows, 0);
});

// ── Settlement id uniqueness ───────────────────────────────────────────────

test('executeSettlement produces a unique id for every batch on the same day', async () => {
  await getSettings();
  await savePatientEntry(visit('entry-1', 1, 'Patient One', '2026-10-09', 1000));
  await savePatientEntry(visit('entry-2', 2, 'Patient Two', '2026-10-10', 2000));

  const first = await executeSettlement({
    periodFrom: '2026-10-09',
    periodTo: '2026-10-09',
    amountReceived: 400,
    remarks: 'first batch',
  });
  const second = await executeSettlement({
    periodFrom: '2026-10-10',
    periodTo: '2026-10-10',
    amountReceived: 800,
    remarks: 'second batch',
  });

  assert.notEqual(first.settlementId, second.settlementId);
  assert.match(first.settlementId, /^ST-\d{8}-\d{2}-[a-z0-9]{4}$/);

  const stored = await getAllSettlements();
  assert.equal(stored.length, 2);
  assert.equal(new Set(stored.map((s) => s.settlementId)).size, 2);
});

test('the settlement sequence does not rewind after a batch is deleted', async () => {
  await getSettings();
  await savePatientEntry(visit('entry-1', 1, 'Patient One', '2026-10-09', 1000));

  const first = await executeSettlement({
    periodFrom: '2026-10-09',
    periodTo: '2026-10-09',
    amountReceived: 100,
    remarks: '',
  });
  assert.equal(/-(\d{2})-/.exec(first.settlementId)?.[1], '01');

  // Deleting must not hand sequence 01 to the next batch.
  const { deleteSettlement } = await import('../src/db/indexedDB');
  await deleteSettlement(first.settlementId);

  // The visit returns to Pending, so it can be settled again.
  const pending = await getAllPatientEntries();
  assert.equal(pending[0].settlementStatus, 'Pending');

  const second = await executeSettlement({
    periodFrom: '2026-10-09',
    periodTo: '2026-10-09',
    amountReceived: 200,
    remarks: '',
  });

  assert.equal(/-(\d{2})-/.exec(second.settlementId)?.[1], '02');
  assert.notEqual(first.settlementId, second.settlementId);
});

test('carry-forward accumulates across sequential settlements', async () => {
  await getSettings();
  await savePatientEntry(visit('entry-1', 1, 'Patient One', '2026-10-09', 1000));
  await savePatientEntry(visit('entry-2', 2, 'Patient Two', '2026-10-10', 1000));

  // 40% of 1000 = 400 payable, only 100 paid → 300 carried forward.
  const first = await executeSettlement({
    periodFrom: '2026-10-09',
    periodTo: '2026-10-09',
    amountReceived: 100,
    remarks: '',
  });
  assert.equal(first.periodShare, 400);
  assert.equal(first.previousDue, 0);
  assert.equal(first.dueBalance, 300);

  const second = await executeSettlement({
    periodFrom: '2026-10-10',
    periodTo: '2026-10-10',
    amountReceived: 0,
    remarks: '',
  });
  assert.equal(second.previousDue, 300);
  assert.equal(second.totalPayable, 700);
  assert.equal(second.dueBalance, 700);
});
