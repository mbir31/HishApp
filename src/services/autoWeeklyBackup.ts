/**
 * HishApp — Automated 7-Day JSON Backup Service
 * ─────────────────────────────────────────────────────────────────
 * Automatically generates and triggers background JSON backup exports
 * every 7 days without requiring manual action by the doctor.
 *
 * Keeps local snapshot redundancy and triggers non-disruptive download.
 */
import { exportAllDataJSON } from '../db/indexedDB';
import { todayDateKey } from '../utils/dateUtils';

const AUTO_BACKUP_STORAGE_KEY = 'hishapp_last_auto_export_ts';
const AUTO_BACKUP_SNAPSHOT_KEY = 'hishapp_latest_auto_backup_json';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface AutoBackupStatus {
  lastBackupAt: number | null;
  nextBackupAt: number | null;
  hasCachedSnapshot: boolean;
  isEligible: boolean;
}

export function getAutoBackupStatus(): AutoBackupStatus {
  if (typeof localStorage === 'undefined') {
    return { lastBackupAt: null, nextBackupAt: null, hasCachedSnapshot: false, isEligible: false };
  }
  const raw = localStorage.getItem(AUTO_BACKUP_STORAGE_KEY);
  // A non-numeric value must not poison the schedule: NaN would make
  // `isEligible` false forever and silently stop the weekly backup.
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  const lastBackupAt = Number.isFinite(parsed) ? parsed : null;
  const nextBackupAt = lastBackupAt ? lastBackupAt + SEVEN_DAYS_MS : Date.now();
  const hasCachedSnapshot = !!localStorage.getItem(AUTO_BACKUP_SNAPSHOT_KEY);
  const isEligible = !lastBackupAt || Date.now() - lastBackupAt >= SEVEN_DAYS_MS;
  return { lastBackupAt, nextBackupAt, hasCachedSnapshot, isEligible };
}

let isExporting = false;

export async function checkAndRunAutoWeeklyBackup(options?: {
  silent?: boolean;
  force?: boolean;
}): Promise<boolean> {
  if (isExporting || typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  const status = getAutoBackupStatus();
  if (!options?.force && !status.isEligible) {
    return false;
  }

  try {
    isExporting = true;
    const json = await exportAllDataJSON();
    const parsed = JSON.parse(json);

    // Only export if there is actual clinical data (at least 1 entry or settlement)
    const hasData =
      (Array.isArray(parsed.patientEntries) && parsed.patientEntries.length > 0) ||
      (Array.isArray(parsed.settlements) && parsed.settlements.length > 0);

    if (!hasData && !options?.force) {
      return false;
    }

    // 1. Cache rolling snapshot in localStorage for instant offline safety
    try {
      localStorage.setItem(AUTO_BACKUP_SNAPSHOT_KEY, json);
      localStorage.setItem(AUTO_BACKUP_STORAGE_KEY, Date.now().toString());
    } catch {
      // Storage might have quota, continue to download
    }

    // 2. Trigger automated file download seamlessly
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HishApp_AutoBackup_${todayDateKey()}.json`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
      } catch {}
      URL.revokeObjectURL(url);
    }, 1500);

    return true;
  } catch (err) {
    console.warn('Auto weekly backup exception:', err);
    return false;
  } finally {
    isExporting = false;
  }
}
