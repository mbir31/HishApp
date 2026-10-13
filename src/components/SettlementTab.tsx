import React, { useState, useMemo, useEffect } from 'react';
import {
  Scale,
  Calendar,
  DollarSign,
  CheckCircle2,
  FileText,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  Receipt,
  Trash2,
  Download,
  ImageDown,
  Loader2,
  AlertTriangle,
  Handshake,
  BadgeCheck,
} from 'lucide-react';
import { ClinicSettings, PatientEntry, Settlement, SettlementResolution } from '../types';
import { deleteSettlement, executeSettlement } from '../db/indexedDB';
import {
  computeSettlementOutcome,
  isSettlementWithDue,
  settlementOutcomeText,
  writtenOffAmountOf,
} from '../utils/settlementResolution';
import { exportSettlementAsImage } from '../utils/settlementImageExport';
import { MonthlySummaryModal } from './MonthlySummaryModal';
import { SpecificSummaryModal } from './SpecificSummaryModal';
import { displayDateKey, formatDateKey, shiftDateKey, todayDateKey, weekdayNameDateKey } from '../utils/dateUtils';

interface SettlementTabProps {
  entries: PatientEntry[];
  settlements: Settlement[];
  settings: ClinicSettings;
  onSettlementCompleted: (settlement: Settlement) => void;
  onSettlementDeleted: (settlementId: string) => void;
  showToast: (title: string, desc?: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const SettlementTab: React.FC<SettlementTabProps> = ({
  entries,
  settlements,
  settings,
  onSettlementCompleted,
  onSettlementDeleted,
  showToast,
}) => {
  const currency = settings.currencySymbol || '৳';
  const todayStr = todayDateKey();

  // Default date range: from 14 days ago to today
  const defaultFrom = useMemo(() => shiftDateKey(todayDateKey(), -14) || todayDateKey(), []);

  const [periodFrom, setPeriodFrom] = useState<string>(defaultFrom);
  const [periodTo, setPeriodTo] = useState<string>(todayStr);
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  /**
   * Confirmation the doctor must tick when the amount received from the clinic
   * does not equal the total claimable amount:
   *   • 'due'     — the difference stays as a due and carries forward;
   *   • 'cleared' — mutual round-figure agreement: the difference is written
   *                 off and nothing shows in the dashboard due cards.
   * `null` means nothing has been ticked yet.
   */
  const [resolution, setResolution] = useState<SettlementResolution | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [isMonthlyModalOpen, setIsMonthlyModalOpen] = useState<boolean>(false);
  const [isSpecificModalOpen, setIsSpecificModalOpen] = useState<boolean>(false);
  // Settlement id currently being rendered into a JPG (spinner on that row)
  const [exportingImageId, setExportingImageId] = useState<string | null>(null);

  const shareRate = settings.sharePercentage || 40;

  // Latest settlement carry-forward balance
  const latestSettlement = settlements.length > 0 ? settlements[0] : null;
  const previousDue = latestSettlement ? latestSettlement.dueBalance : 0;

  // Total Outstanding Due (Overall)
  const allPendingEntries = useMemo(() => {
    return entries.filter((e) => e.settlementStatus === 'Pending');
  }, [entries]);

  const allPendingProceduresShare = useMemo(() => {
    return allPendingEntries.reduce((sum, e) => sum + e.doctorShare, 0);
  }, [allPendingEntries]);

  const totalOutstandingOwed = previousDue + allPendingProceduresShare;

  // Selected date-range calculations
  const eligibleEntriesInRange = useMemo(() => {
    return allPendingEntries.filter((e) => e.date >= periodFrom && e.date <= periodTo);
  }, [allPendingEntries, periodFrom, periodTo]);

  const periodShare = useMemo(() => {
    return eligibleEntriesInRange.reduce((sum, e) => sum + e.doctorShare, 0);
  }, [eligibleEntriesInRange]);

  const totalClaimable = periodShare + previousDue;
  const parsedReceived = Math.max(0, parseFloat(amountReceived) || 0);
  const dueBalancePreview = Math.round((totalClaimable - parsedReceived) * 100) / 100;
  /** True only once a payment figure has actually been typed in. */
  const amountEntered = amountReceived.trim() !== '';

  /**
   * The clinic paid a round figure that does not match the claimable amount,
   * so the doctor has to tick a confirmation before the batch can be closed.
   * Never true before an amount is entered — an empty field is simply an
   * unfinished form, not a round-figure agreement.
   */
  const amountMismatch = amountEntered && Math.abs(dueBalancePreview) > 0.004;
  const shortfallPreview = Math.max(0, dueBalancePreview); // unpaid, still claimable
  const advancePreview = Math.max(0, -dueBalancePreview); // clinic paid extra
  const dueOptionPreview = computeSettlementOutcome({
    totalClaimable,
    amountReceived: parsedReceived,
    resolution: 'due',
  });
  const clearedOptionPreview = computeSettlementOutcome({
    totalClaimable,
    amountReceived: parsedReceived,
    resolution: 'cleared',
  });
  const isClearedChoice = resolution === 'cleared';
  const requiresResolution = amountMismatch && resolution === null;

  // Any edit to the figures invalidates a previously ticked confirmation — the
  // doctor must re-confirm against the numbers now on screen.
  useEffect(() => {
    setResolution(null);
  }, [periodFrom, periodTo, amountReceived]);

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-BD').format(Math.round(num));
  };

  const handleApplyPreset = (type: 'all' | 'month' | '14days' | 'week') => {
    const today = new Date();
    const end = todayDateKey();
    setPeriodTo(end);

    if (type === 'all') {
      // Find oldest pending entry or 30 days ago
      if (allPendingEntries.length > 0) {
        const oldest = allPendingEntries.reduce((prev, curr) =>
          curr.date < prev.date ? curr : prev
        );
        setPeriodFrom(oldest.date);
      } else {
        setPeriodFrom(shiftDateKey(end, -30) || end);
      }
    } else if (type === 'month') {
      setPeriodFrom(formatDateKey(new Date(today.getFullYear(), today.getMonth(), 1)));
    } else if (type === '14days') {
      setPeriodFrom(shiftDateKey(end, -14) || end);
    } else if (type === 'week') {
      setPeriodFrom(shiftDateKey(end, -7) || end);
    }
  };

  const handleFillFullClaimable = () => {
    setAmountReceived(String(Math.max(0, totalClaimable)));
  };

  const handleConfirmSettlement = async (e: React.FormEvent) => {
    e.preventDefault();

    if (eligibleEntriesInRange.length === 0 && previousDue === 0) {
      showToast(
        'Nothing to Settle',
        'There are no pending procedures in this date range and no previous due.',
        'warning'
      );
      return;
    }

    if (parsedReceived < 0) {
      showToast('Invalid Amount', 'Received amount cannot be negative', 'warning');
      return;
    }

    if (!amountEntered) {
      showToast(
        'Amount Required',
        'Enter the amount received from the clinic to confirm this settlement.',
        'warning'
      );
      return;
    }

    // A round-figure payment can never be closed silently: the doctor has to
    // state whether the difference carries forward or the batch stands cleared.
    if (amountMismatch && resolution === null) {
      showToast(
        'Confirmation Required',
        `Amount received differs from the total claimable amount by ${currency} ${formatNumber(
          Math.abs(dueBalancePreview)
        )}. Tick how this settlement is confirmed.`,
        'warning'
      );
      return;
    }

    const finalResolution: SettlementResolution = amountMismatch
      ? (resolution as SettlementResolution)
      : 'cleared';

    try {
      setIsSubmitting(true);
      const newSettlement = await executeSettlement({
        periodFrom,
        periodTo,
        amountReceived: parsedReceived,
        remarks: remarks.trim(),
        resolution: finalResolution,
      });

      onSettlementCompleted(newSettlement);
      setAmountReceived('');
      setRemarks('');
      setResolution(null);

      const writtenOff = writtenOffAmountOf(newSettlement);
      showToast(
        `Settlement ${newSettlement.settlementId} Confirmed!`,
        writtenOff > 0
          ? `Settled ${newSettlement.patientCount} patients. Cleared with no amount due — ${currency} ${formatNumber(
              writtenOff
            )} waived by mutual agreement on a round figure.`
          : `Settled ${newSettlement.patientCount} patients. Carried forward balance: ${currency} ${formatNumber(
              newSettlement.dueBalance
            )}.`,
        'success'
      );
    } catch (err: any) {
      console.error('Settlement error:', err);
      showToast('Settlement Failed', err?.message || 'Database transaction error', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Renders one settlement as a formal JPG statement and saves / shares it. */
  const handleExportSettlementImage = async (settlement: Settlement) => {
    try {
      setExportingImageId(settlement.settlementId);
      const result = await exportSettlementAsImage(settlement, settings);
      if (result.outcome === 'cancelled') return; // share sheet dismissed on purpose
      showToast(
        result.outcome === 'shared' ? 'Settlement Image Shared' : 'Settlement Image Saved',
        result.outcome === 'shared'
          ? `${result.fileName} is ready in the share sheet.`
          : `${result.fileName} downloaded to this device.`,
        'success'
      );
    } catch (err: any) {
      console.error('Settlement image export error:', err);
      showToast(
        'Image Export Failed',
        err?.message || 'Could not create the settlement image',
        'error'
      );
    } finally {
      setExportingImageId(null);
    }
  };

  const handleShareSettlementWhatsApp = (s: Settlement) => {
    const text = `*DENTAL CLINIC SETTLEMENT RECEIPT*
----------------------------------------
*Settlement ID:* ${s.settlementId}
*Date:* ${weekdayNameDateKey(s.settlementDate)} ${displayDateKey(s.settlementDate)}
*Clinic:* ${settings.clinicName}
*Doctor:* ${settings.doctorName || '—'}
*Period:* ${weekdayNameDateKey(s.periodFrom)} ${displayDateKey(s.periodFrom)} to ${weekdayNameDateKey(s.periodTo)} ${displayDateKey(s.periodTo)}
*Patients Settled:* ${s.patientCount}

*FINANCIAL BREAKDOWN:*
• *Doctor ${settings.sharePercentage || 40}% Share:* ${currency} ${formatNumber(s.periodShare)}
• *Previous Due:* ${currency} ${formatNumber(s.previousDue)}
• *Total Payable:* ${currency} ${formatNumber(s.totalPayable)}
• *Amount Paid by Clinic:* ${currency} ${formatNumber(s.amountReceived)}
• *Due Carried Forward:* ${currency} ${formatNumber(s.dueBalance)}
• *Confirmation:* ${settlementOutcomeText(s, currency, formatNumber)}
${s.remarks ? `• *Notes:* ${s.remarks}\n` : ''}----------------------------------------
_Generated electronically by HishApp (hishapp1.web.app)_`;

    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    const a = document.createElement('a');
    a.href = waUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
      } catch {}
    }, 500);
    showToast('WhatsApp Share', `Settlement ${s.settlementId} opened in WhatsApp`, 'success');
  };

  const handleDeleteSettlement = async (sId: string) => {
    if (
      !confirm(
        `Revert settlement ${sId}? All associated patient visits will return to 'Pending' status.`
      )
    ) {
      return;
    }

    try {
      await deleteSettlement(sId);
      onSettlementDeleted(sId);
      showToast('Settlement Reverted', `${sId} deleted and visits returned to Pending`, 'info');
    } catch (err: any) {
      showToast('Failed to revert', err?.message, 'error');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-24 animate-in fade-in duration-200">
      {/* 1. Outstanding Balance Card (Prominent Header) */}
      <div className="ios-glass-card rounded-3xl p-6 bg-gradient-to-br from-indigo-600/85 via-indigo-700/80 to-sky-700/85 text-white shadow-xl shadow-indigo-700/20 relative overflow-hidden backdrop-blur-2xl">
        <div className="absolute top-0 right-0 -mr-12 -mt-12 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider uppercase bg-white/15 px-3 py-1 rounded-full border border-white/20">
              Outstanding Clinical Ledger
            </span>
            <div className="flex items-center gap-1.5 text-xs bg-black/20 px-2.5 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Carry-Forward Active</span>
            </div>
          </div>

          <div>
            <p className="text-xs text-indigo-100 font-medium">Total Unsettled Due Owed to You</p>
            <div className="text-3xl sm:text-4xl font-black tracking-tight mt-1">
              {currency} {formatNumber(totalOutstandingOwed)}
            </div>
          </div>

          {/* Due and Pending Visits decomposition */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/20 text-xs">
            <div>
              <p className="text-indigo-200 text-[11px]">Previous Carry-Over Due</p>
              <p className="font-extrabold text-white text-base">
                {currency} {formatNumber(previousDue)}
              </p>
            </div>
            <div>
              <p className="text-indigo-200 text-[11px]">Pending Procedures ({shareRate}%)</p>
              <p className="font-extrabold text-white text-base">
                {currency} {formatNumber(allPendingProceduresShare)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Summary PDF Export Banner */}
      <div className="ios-glass-card rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-indigo-200/70 bg-gradient-to-r from-indigo-50/70 via-white/40 to-sky-50/70">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-indigo-600/30">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 leading-tight">
              Monthly Settlement Statement
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Export official formatted PDF with 40% share, patient volume &amp; due balance
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsMonthlyModalOpen(true)}
          className="btn-gradient btn-gradient--sky self-start sm:self-auto px-4 py-2.5 rounded-2xl text-white text-xs font-bold flex items-center gap-2 shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>Export Statement</span>
        </button>
      </div>

      {/* Specific Period Statement Export Banner */}
      <div className="ios-glass-card rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-emerald-200/70 bg-gradient-to-r from-emerald-50/70 via-white/40 to-teal-50/70">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-emerald-600/30">
            <CalendarRange className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 leading-tight">
              Specific Settlement Statement
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Export official formatted PDF for any custom date range with 40% share, patient volume &amp; due balance
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsSpecificModalOpen(true)}
          className="btn-gradient btn-gradient--emerald self-start sm:self-auto px-4 py-2.5 rounded-2xl text-white text-xs font-bold flex items-center gap-2 shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>Export Statement</span>
        </button>
      </div>

      {/* Main Settlement Reconciler Form */}
      <form onSubmit={handleConfirmSettlement} className="ios-glass-card rounded-3xl p-5 sm:p-6 space-y-6">
        <div>
          <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Scale className="w-5 h-5 text-indigo-600" />
            <span>Reconcile Clinical Settlement Batch</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Select visit date range to calculate claimable compensation and record payment.
          </p>
        </div>

        {/* 2. Date Range Filter & Presets */}
        <div className="space-y-2.5 bg-slate-50/70 p-4 rounded-2xl border border-slate-200/60">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span>Settlement Period Range</span>
            </label>
            {/* Quick Filter Presets */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleApplyPreset('all')}
                className="px-2 py-0.5 text-[10px] font-semibold rounded-lg ios-glass-subtle border border-white/70 text-slate-700 hover:bg-white/80 transition"
              >
                All Pending
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('14days')}
                className="px-2 py-0.5 text-[10px] font-semibold rounded-lg ios-glass-subtle border border-white/70 text-slate-700 hover:bg-white/80 transition"
              >
                Last 14d
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('month')}
                className="px-2 py-0.5 text-[10px] font-semibold rounded-lg ios-glass-subtle border border-white/70 text-slate-700 hover:bg-white/80 transition"
              >
                This Month
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase">From</span>
              <input
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-xl bg-white/70 border border-white/70 text-xs font-medium text-slate-800 focus:border-indigo-500 outline-none"
                required
              />
            </div>
            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase">To</span>
              <input
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-xl bg-white/70 border border-white/70 text-xs font-medium text-slate-800 focus:border-indigo-500 outline-none"
                required
              />
            </div>
          </div>
        </div>

        {/* 3. Calculated Settlement Summary for Selected Range */}
        <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600">Pending Patients in Period:</span>
            <span className="font-bold text-slate-900">{eligibleEntriesInRange.length} visits</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600">Doctor's {shareRate}% Share for Period:</span>
            <span className="font-bold text-indigo-600">
              {currency} {formatNumber(periodShare)}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600">Previous Due Carried Over:</span>
            <span className="font-bold text-amber-700">
              {currency} {formatNumber(previousDue)}
            </span>
          </div>

          <div className="pt-2 border-t border-indigo-200/60 flex items-center justify-between text-sm">
            <span className="font-extrabold text-slate-900">Total Claimable Amount:</span>
            <span className="font-black text-indigo-700 text-base">
              {currency} {formatNumber(totalClaimable)}
            </span>
          </div>
        </div>

        {/* 4. Settlement Payment Input & Live Balance Preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
              <span>Amount Received from Clinic ({currency})</span>
            </label>
            <button
              type="button"
              onClick={handleFillFullClaimable}
              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition underline underline-offset-2"
            >
              Fill Full ({currency} {formatNumber(totalClaimable)})
            </button>
          </div>

          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-base">
              {currency}
            </span>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="0"
              value={amountReceived}
              onChange={(e) => setAmountReceived(e.target.value)}
              className="w-full pl-9 pr-3.5 py-3 rounded-2xl bg-white/70 border border-white/70 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-slate-900 text-xl font-bold tracking-tight transition outline-none"
              min="0"
              step="any"
              required
            />
          </div>

          {/* LIVE BALANCE PREVIEW (REMAINING DUE / ADVANCE ADJUSTED) */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isClearedChoice || dueBalancePreview === 0
                ? 'bg-emerald-50/40 border-emerald-200 text-emerald-900'
                : dueBalancePreview > 0
                ? 'bg-amber-50/60 border-amber-200 text-amber-900'
                : 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">
                  {isClearedChoice
                    ? clearedOptionPreview.writtenOffAmount > 0
                      ? 'Cleared with No Amount Due (Difference Waived)'
                      : 'Cleared with No Amount Due'
                    : !amountEntered
                    ? 'Balance Awaiting Payment Entry'
                    : amountMismatch && resolution === null
                    ? 'Difference Awaiting Confirmation'
                    : dueBalancePreview > 0
                    ? 'Remaining Due (Carried Forward to Next Batch)'
                    : dueBalancePreview < 0
                    ? 'Advance Paid by Clinic (Credit)'
                    : 'Exact Settlement (Zero Due)'}
                </span>
                <div className="text-xl font-black mt-0.5">
                  {currency}{' '}
                  {formatNumber(
                    isClearedChoice ? clearedOptionPreview.writtenOffAmount : Math.abs(dueBalancePreview)
                  )}
                </div>
              </div>

              <div className="text-right text-xs">
                {isClearedChoice ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-200/80 font-bold text-emerald-800">
                    No Due
                  </span>
                ) : !amountEntered ? (
                  <span className="px-2 py-0.5 rounded-full bg-slate-200/80 font-bold text-slate-600">
                    Enter Amount
                  </span>
                ) : amountMismatch && resolution === null ? (
                  <span className="px-2 py-0.5 rounded-full bg-amber-200/80 font-bold text-amber-800">
                    Tick Below
                  </span>
                ) : dueBalancePreview > 0 ? (
                  <span className="px-2 py-0.5 rounded-full bg-amber-200/80 font-bold text-amber-800">
                    Underpaid
                  </span>
                ) : dueBalancePreview < 0 ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-200/80 font-bold text-emerald-800">
                    Overpaid
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-200/80 font-bold text-emerald-800">
                    Cleared
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 4b. Mandatory settlement confirmation (amount ≠ total claimable) */}
          {amountMismatch ? (
            <div className="space-y-3 p-4 rounded-2xl bg-slate-50/70 border border-slate-200/60">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Handshake className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Settlement Confirmation</span>
                </label>
                <span
                  className={`text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                    resolution === null
                      ? 'bg-amber-100 text-amber-700 border-amber-200'
                      : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {resolution === null ? 'Selection Required' : 'Confirmed'}
                </span>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                The clinic paid <strong>{currency} {formatNumber(parsedReceived)}</strong> against a total
                claimable of <strong>{currency} {formatNumber(totalClaimable)}</strong> — a difference of{' '}
                <strong>{currency} {formatNumber(Math.abs(dueBalancePreview))}</strong>. Tick one option to
                confirm how this batch is closed.
              </p>

              <div className="space-y-2" role="radiogroup" aria-label="Settlement confirmation options">
                {/* Option 1 — due amount carried forward */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={resolution === 'due'}
                  onClick={() => setResolution('due')}
                  className={`w-full text-left p-3.5 rounded-2xl border transition flex items-start gap-3 ${
                    resolution === 'due'
                      ? 'bg-amber-50/80 border-amber-300 ring-1 ring-amber-400/40'
                      : 'bg-white/70 border-white/70 hover:bg-white/90'
                  }`}
                >
                  <span
                    className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      resolution === 'due' ? 'border-amber-500 bg-amber-500' : 'border-slate-300'
                    }`}
                  >
                    {resolution === 'due' && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="text-xs font-bold text-slate-900">
                        Settlement completed with an amount due:
                      </span>
                      <span className="text-xs font-black text-amber-700">
                        {currency} {formatNumber(shortfallPreview)}
                      </span>
                    </span>
                    <span className="block text-[10px] text-slate-500 mt-1 leading-relaxed">
                      {dueOptionPreview.dueBalance < 0
                        ? `The clinic's extra ${currency} ${formatNumber(advancePreview)} stays in the ledger as an advance credit and is adjusted in the next settlement cycle.`
                        : `The unpaid ${currency} ${formatNumber(shortfallPreview)} carries forward to the next settlement cycle and keeps showing in the dashboard due cards until it is paid.`}
                    </span>
                  </span>
                </button>

                {/* Option 2 — cleared, nothing left due */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={resolution === 'cleared'}
                  onClick={() => setResolution('cleared')}
                  className={`w-full text-left p-3.5 rounded-2xl border transition flex items-start gap-3 ${
                    resolution === 'cleared'
                      ? 'bg-emerald-50/80 border-emerald-300 ring-1 ring-emerald-400/40'
                      : 'bg-white/70 border-white/70 hover:bg-white/90'
                  }`}
                >
                  <span
                    className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      resolution === 'cleared' ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'
                    }`}
                  >
                    {resolution === 'cleared' && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <BadgeCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="text-xs font-bold text-slate-900">Settlement cleared with no amount due</span>
                      {clearedOptionPreview.writtenOffAmount > 0 && (
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                          {currency} {formatNumber(clearedOptionPreview.writtenOffAmount)} waived
                        </span>
                      )}
                    </span>
                    <span className="block text-[10px] text-slate-500 mt-1 leading-relaxed">
                      {clearedOptionPreview.writtenOffAmount > 0
                        ? `Mutual round-figure agreement: the difference of ${currency} ${formatNumber(
                            clearedOptionPreview.writtenOffAmount
                          )} is written off and no due or overdue is shown in the dashboard due cards.`
                        : `The account is closed on the agreed figure — no due or overdue is shown in the dashboard due cards${
                            advancePreview > 0
                              ? `, and the clinic's extra ${currency} ${formatNumber(advancePreview)} stays as an advance credit`
                              : ''
                          }.`}
                    </span>
                  </span>
                </button>
              </div>

              {resolution === 'cleared' &&
                clearedOptionPreview.writtenOffAmount > 0 &&
                !clearedOptionPreview.dueBalance && (
                  <p className="text-[10px] font-medium text-emerald-700 bg-emerald-50/80 border border-emerald-100 rounded-xl p-2.5 leading-relaxed">
                    This will be recorded on the settlement and printed on the receipt/statement as a{' '}
                    <strong>round-figure waiver of {currency}{' '}
                    {formatNumber(clearedOptionPreview.writtenOffAmount)}</strong>.
                  </p>
                )}

              {resolution === 'cleared' && advancePreview > 0 && (
                <p className="text-[10px] font-medium text-emerald-700 bg-emerald-50/80 border border-emerald-100 rounded-xl p-2.5 leading-relaxed">
                  The clinic paid {currency} {formatNumber(advancePreview)} more than the claimable amount. That
                  extra is kept as an advance credit — never as a due — and is adjusted in the next cycle.
                </p>
              )}

              {resolution === 'due' && shortfallPreview > 0 && (
                <p className="text-[10px] font-medium text-amber-700 bg-amber-50/80 border border-amber-100 rounded-xl p-2.5 leading-relaxed">
                  Dashboard due cards will keep showing{' '}
                  <strong>{currency} {formatNumber(dueOptionPreview.dueBalance)}</strong> until it is received
                  from the clinic.
                </p>
              )}
            </div>
          ) : totalClaimable > 0 ? (
            <div className="flex items-start gap-2 p-3 rounded-2xl bg-emerald-50/50 border border-emerald-100 text-[11px] font-semibold text-emerald-800">
              <BadgeCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                Amount received matches the total claimable exactly — this batch will be confirmed as{' '}
                <strong>Settlement cleared with no amount due</strong>.
              </span>
            </div>
          ) : null}

          {/* Settlement Notes / Remarks */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              <span>Settlement Notes</span>
              <span className="text-[10px] font-normal text-slate-400">
                (e.g., Cheque number, bank transfer, remainder date)
              </span>
            </label>
            <input
              type="text"
              placeholder="e.g. Paid via Bank transfer #TXN9928, balance ৳1,000 next Thursday"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white/70 border border-white/70 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-slate-800 text-xs sm:text-sm font-medium transition outline-none"
            />
          </div>
        </div>

        {/* 5. Action Button: Confirm Settlement */}
        {/* The confirmation tick is mandatory while the amounts differ, so the
            button stays disabled until one of the two options is selected. */}
        {requiresResolution && (
          <p className="text-[11px] font-semibold text-amber-700 bg-amber-50/80 border border-amber-200 rounded-2xl px-3.5 py-2.5 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Tick <strong>Settlement completed with an amount due: {currency}{' '}
              {formatNumber(shortfallPreview)}</strong> or <strong>Settlement cleared with no amount due</strong> above
              to confirm this settlement.
            </span>
          </p>
        )}

        <button
          type="submit"
          disabled={
            isSubmitting ||
            !amountEntered ||
            (eligibleEntriesInRange.length === 0 && previousDue === 0) ||
            requiresResolution
          }
          className="btn-gradient w-full py-3.5 px-6 rounded-2xl text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CheckCircle2 className="w-5 h-5" />
          <span>
            {isSubmitting
              ? 'Finalizing Batch...'
              : isClearedChoice && amountMismatch
              ? 'Confirm — Cleared with No Amount Due'
              : 'Confirm Settlement'}
          </span>
        </button>
      </form>

      {/* 6. Settlement History Accordion */}
      <div className="ios-glass-card rounded-3xl p-5">
        <button
          type="button"
          onClick={() => setShowHistory(!showHistory)}
          className="w-full flex items-center justify-between text-left group"
        >
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Settlement History Log ({settlements.length})
            </h3>
          </div>
          {showHistory ? (
            <ChevronUp className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
          )}
        </button>

        {showHistory && (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
            {settlements.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs">
                No settlements finalized yet.
              </div>
            ) : (
              settlements.map((s) => (
                <div
                  key={s.settlementId}
                  className="ios-glass-card p-3.5 rounded-2xl space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                        {s.settlementId}
                      </span>
                      <span className="text-[11px] text-slate-400 ml-2">
                        {weekdayNameDateKey(s.settlementDate)} {displayDateKey(s.settlementDate)} ({s.patientCount} patients)
                      </span>
                    </div>

                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => void handleExportSettlementImage(s)}
                        disabled={exportingImageId === s.settlementId}
                        className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition disabled:opacity-60"
                        title="Export this settlement as a JPG image"
                        aria-label={`Export settlement ${s.settlementId} as JPG image`}
                      >
                        {exportingImageId === s.settlementId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ImageDown className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        onClick={() => handleShareSettlementWhatsApp(s)}
                        className="p-1 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition"
                        title="Share settlement directly to WhatsApp"
                        aria-label={`Share settlement ${s.settlementId} on WhatsApp`}
                      >
                        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.455 5.711 1.456h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                      </button>

                      <button
                        onClick={() => handleDeleteSettlement(s.settlementId)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        title="Revert settlement"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
                    <div>
                      <span className="text-slate-400 block">Total Payable</span>
                      <span className="font-bold text-slate-800">
                        {currency} {formatNumber(s.totalPayable)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Received</span>
                      <span className="font-bold text-emerald-600">
                        {currency} {formatNumber(s.amountReceived)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Carried Forward Due</span>
                      <span
                        className={`font-black ${
                          s.dueBalance > 0 ? 'text-amber-600' : 'text-slate-700'
                        }`}
                      >
                        {currency} {formatNumber(s.dueBalance)}
                      </span>
                    </div>
                  </div>

                  {/* Confirmation recorded for this batch */}
                  {isSettlementWithDue(s) ? (
                    <p className="text-[10px] font-semibold text-amber-700 bg-amber-50/80 border border-amber-100 p-1.5 rounded-lg flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>
                        Settlement completed with an amount due {currency} {formatNumber(s.dueBalance)} — carried
                        forward
                      </span>
                    </p>
                  ) : (
                    <p className="text-[10px] font-semibold text-emerald-700 bg-emerald-50/80 border border-emerald-100 p-1.5 rounded-lg flex items-center gap-1.5">
                      <BadgeCheck className="w-3 h-3 shrink-0" />
                      <span>
                        Settlement cleared with no amount due
                        {writtenOffAmountOf(s) > 0
                          ? ` — ${currency} ${formatNumber(writtenOffAmountOf(s))} waived by mutual agreement`
                          : ''}
                      </span>
                    </p>
                  )}

                  {s.remarks && (
                    <p className="text-[10px] text-slate-500 italic bg-slate-50/80 p-1.5 rounded-lg">
                      Note: {s.remarks}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Monthly Summary Formatted PDF Modal */}
      {isMonthlyModalOpen && (
        <MonthlySummaryModal
          isOpen={isMonthlyModalOpen}
          onClose={() => setIsMonthlyModalOpen(false)}
          entries={entries}
          settlements={settlements}
          settings={settings}
          showToast={showToast}
        />
      )}

      {/* Specific Period Summary Formatted PDF Modal */}
      {isSpecificModalOpen && (
        <SpecificSummaryModal
          isOpen={isSpecificModalOpen}
          onClose={() => setIsSpecificModalOpen(false)}
          entries={entries}
          settlements={settlements}
          settings={settings}
          showToast={showToast}
        />
      )}
    </div>
  );
};
