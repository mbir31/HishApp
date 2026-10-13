/**
 * HISAPP — SETTLEMENT RESOLUTION RULES (PURE)
 * ─────────────────────────────────────────────────────────────────
 * A settlement batch is confirmed against the total claimable amount
 * (period share + carried-over due). Clinics often pay a round figure, so the
 * amount received may not match the claimable amount exactly. In that case the
 * doctor MUST record how the difference was closed:
 *
 *   • 'due'     — "Settlement done with due amount …": the shortfall is carried
 *                 forward and stays visible in the dashboard due cards;
 *   • 'cleared' — "Settlement Cleared with no due": both sides agreed to close
 *                 the batch on a round figure, the shortfall is written off and
 *                 the dashboard shows no due or overdue for this batch.
 *
 * Everything here is pure and free of DOM / IndexedDB access so the arithmetic
 * and the wording can be unit-tested in Node.
 */
import type { Settlement, SettlementResolution } from '../types';

/** Rounds to two decimals so float noise never leaks into the ledger. */
const round2 = (value: number): number => {
  const safe = Number.isFinite(value) ? value : 0;
  return Math.round(safe * 100) / 100;
};

export interface SettlementOutcome {
  /** Resolution actually stored on the batch. */
  resolution: SettlementResolution;
  /** Balance carried forward — 0 when the batch is cleared with no due. */
  dueBalance: number;
  /** Amount forgiven by mutual agreement (0 unless a cleared batch underpaid). */
  writtenOffAmount: number;
}

/**
 * The single place that turns "total claimable + amount received + ticked
 * option" into the stored ledger numbers.
 *
 * An advance (the clinic paid MORE than claimable) is never written off: it is
 * money the clinic is holding, so it stays as a negative balance / credit and
 * is adjusted in the next cycle. Only a genuine shortfall can be waived.
 */
export function computeSettlementOutcome(params: {
  totalClaimable: number;
  amountReceived: number;
  resolution?: SettlementResolution | null;
}): SettlementOutcome {
  const totalClaimable = round2(params.totalClaimable);
  const amountReceived = round2(params.amountReceived);
  const difference = round2(totalClaimable - amountReceived);

  const resolution: SettlementResolution = params.resolution === 'cleared' ? 'cleared' : 'due';
  if (resolution === 'cleared') {
    return {
      resolution,
      dueBalance: difference < 0 ? difference : 0,
      writtenOffAmount: difference > 0 ? difference : 0,
    };
  }

  return { resolution, dueBalance: difference, writtenOffAmount: 0 };
}

/** Amount waived on a stored batch (0 for batches that carried a due forward). */
export function writtenOffAmountOf(settlement: Settlement): number {
  const stored = Number(settlement.writtenOffAmount);
  if (Number.isFinite(stored) && stored > 0) return round2(stored);

  // Batches written by older builds have neither field: they never waived
  // anything, so nothing is inferred for them.
  if (settlement.resolution !== 'cleared') return 0;
  const shortfall = round2((settlement.totalPayable || 0) - (settlement.amountReceived || 0));
  return shortfall > 0 ? shortfall : 0;
}

/**
 * Resolution of a stored batch. Records created before this feature existed
 * have no `resolution` field — they are read as 'due' when a balance was
 * carried forward and as 'cleared' when nothing was left outstanding.
 */
export function settlementResolutionOf(settlement: Settlement): SettlementResolution {
  if (settlement.resolution === 'due' || settlement.resolution === 'cleared') {
    return settlement.resolution;
  }
  return (settlement.dueBalance || 0) > 0 ? 'due' : 'cleared';
}

/** True when the batch was confirmed with a due amount still outstanding. */
export function isSettlementWithDue(settlement: Settlement): boolean {
  return settlementResolutionOf(settlement) === 'due' && (settlement.dueBalance || 0) > 0;
}

/** True when the batch was closed with a round-figure waiver. */
export function isSettlementClearedWithWriteOff(settlement: Settlement): boolean {
  return settlementResolutionOf(settlement) === 'cleared' && writtenOffAmountOf(settlement) > 0;
}

/**
 * One-line, plain-language outcome used by receipts, WhatsApp shares, CSV/PDF
 * statements and audit logs. `format` renders a number (thousands grouping).
 *
 *   • due            → "Settlement done with due amount ৳ 300"
 *   • cleared waiver → "Settlement cleared with no due (৳ 300 written off by mutual agreement)"
 *   • cleared exact  → "Settlement cleared with no due"
 *   • advance credit → "Settlement carried forward with advance credit ৳ 200"
 */
export function settlementOutcomeText(
  settlement: Settlement,
  currencySymbol: string,
  format: (value: number) => string
): string {
  const resolution = settlementResolutionOf(settlement);
  const money = (value: number) => `${currencySymbol} ${format(Math.abs(value))}`;
  const due = round2(settlement.dueBalance || 0);

  if (resolution === 'due' && due > 0) {
    return `Settlement done with due amount ${money(due)}`;
  }
  if (resolution === 'due' && due < 0) {
    return `Settlement carried forward with advance credit ${money(due)}`;
  }
  const waived = writtenOffAmountOf(settlement);
  if (waived > 0) {
    return `Settlement cleared with no due (${money(waived)} written off by mutual agreement)`;
  }
  return 'Settlement cleared with no due';
}
