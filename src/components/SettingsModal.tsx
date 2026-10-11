import React, { useRef, useState, useEffect } from 'react';
import {
  X,
  CloudUpload,
  Download,
  Upload,
  Building2,
  Sparkles,
  Save,
  LogIn,
  LogOut,
  Loader2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  KeyRound,
  Smartphone,
  Lock,
  Fingerprint,
  RotateCcw,
  Database,
  RefreshCw,
  FileCheck,
  History,
} from 'lucide-react';
import { ClinicSettings, CloudSnapshotInfo, ReconciliationResult } from '../types';
import {
  DEFAULT_CLINIC_LOGO,
  DEFAULT_CLINIC_NAME,
  exportAllDataCSV,
  exportAllDataJSON,
  logAudit,
  restoreAllData,
  saveSettings,
  syncAllPatientProfiles,
} from '../db/indexedDB';
import {
  ImportResult,
  parseCSVFiles,
  parseJSONBackup,
} from '../utils/importData';
import { backupEngine, type BackupStatus } from '../services/backupEngine';
import type { DualStoreHealth } from '../services/emergencyBackup';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { AuditLogModal } from './AuditLogModal';
import { todayDateKey } from '../utils/dateUtils';
import {
  isBiometricAvailable,
  isBiometricEnrolledFor,
  removeBiometricEnrollment,
} from '../services/biometricAuth';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ClinicSettings;
  backup: BackupStatus;
  onSaveSettings: (settings: ClinicSettings) => void;
  onVaultLogin: (phone: string, pin: string) => Promise<any>;
  onVaultBiometricLogin: (phone: string) => Promise<any>;
  onVaultEnableBiometric: () => Promise<boolean>;
  onVaultResetPinBiometric: (phone: string, newPin: string) => Promise<void>;
  onVaultSignOut: () => Promise<void>;
  onVaultLock?: () => void;
  onVaultChangePin: (oldPin: string, newPin: string) => Promise<void>;
  onBackupNow: () => Promise<any>;
  onToggleAutoBackup: (enabled: boolean) => void;
  onDataImported?: () => void;
  showToast: (title: string, desc?: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  backup,
  onSaveSettings,
  onVaultLogin,
  onVaultBiometricLogin,
  onVaultEnableBiometric,
  onVaultResetPinBiometric,
  onVaultSignOut,
  onVaultLock,
  onVaultChangePin,
  onBackupNow,
  onToggleAutoBackup,
  onDataImported,
  showToast,
}) => {
  const [clinicName, setClinicName] = useState<string>(settings.clinicName || DEFAULT_CLINIC_NAME);
  const [clinicLogo, setClinicLogo] = useState<string>(settings.clinicLogo || DEFAULT_CLINIC_LOGO);
  const [doctorName, setDoctorName] = useState<string>(settings.doctorName);
  const [currencySymbol, setCurrencySymbol] = useState<string>(settings.currencySymbol || '৳');
  const [sharePercentage, setSharePercentage] = useState<number>(settings.sharePercentage || 40);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);
  const [showIOSPrompt, setShowIOSPrompt] = useState<boolean>(false);

  // Vault login state
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [pinInput, setPinInput] = useState<string>('');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [rememberPhone, setRememberPhone] = useState<boolean>(() => {
    try {
      return localStorage.getItem('hisapp_remember_phone') !== 'false';
    } catch {
      return true;
    }
  });

  // Biometric state
  const [hasBiometricSupport, setHasBiometricSupport] = useState<boolean>(false);
  const [isBiometricEnrolled, setIsBiometricEnrolled] = useState<boolean>(false);
  const [isBiometricLoading, setIsBiometricLoading] = useState<boolean>(false);

  // Change PIN state
  const [showChangePin, setShowChangePin] = useState<boolean>(false);
  const [oldPinInput, setOldPinInput] = useState<string>('');
  const [newPinInput, setNewPinInput] = useState<string>('');
  const [confirmPinInput, setConfirmPinInput] = useState<string>('');
  const [isSavingPin, setIsSavingPin] = useState<boolean>(false);

  // Resilience & Fail-Safe states
  const [reconcileResult, setReconcileResult] = useState<ReconciliationResult | null>(null);
  const [isReconciling, setIsReconciling] = useState<boolean>(false);
  const [showTimeMachine, setShowTimeMachine] = useState<boolean>(false);
  const [snapshots, setSnapshots] = useState<CloudSnapshotInfo[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState<boolean>(false);
  const [isRestoringSnapshot, setIsRestoringSnapshot] = useState<boolean>(false);
  const [dualStoreHealth, setDualStoreHealth] = useState<DualStoreHealth | null>(null);

  // File import state (restore from JSON / CSV backup files)
  const [importConfirm, setImportConfirm] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const jsonFileRef = useRef<HTMLInputElement>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  // Load saved phone if remembered
  useEffect(() => {
    isBiometricAvailable().then(setHasBiometricSupport);
    try {
      const savedPhone = localStorage.getItem('hisapp_saved_phone');
      if (savedPhone) {
        setPhoneInput(savedPhone);
      }
    } catch {
      // ignore storage error
    }
  }, []);

  // Sync biometric enrollment status for current target phone
  useEffect(() => {
    const target = backup.user?.phoneNumber || phoneInput.replace(/\D/g, '');
    setIsBiometricEnrolled(isBiometricEnrolledFor(target));
  }, [backup.user, phoneInput]);

  // Load dual-store health when modal opens
  useEffect(() => {
    if (isOpen) {
      backupEngine.getDualStoreHealth().then(setDualStoreHealth).catch(() => {});
    }
  }, [isOpen]);

  // Sync state when settings prop updates
  useEffect(() => {
    setClinicName(settings.clinicName || DEFAULT_CLINIC_NAME);
    setClinicLogo(settings.clinicLogo || DEFAULT_CLINIC_LOGO);
    setDoctorName(settings.doctorName);
    setCurrencySymbol(settings.currencySymbol || '৳');
    setSharePercentage(settings.sharePercentage || 40);
  }, [settings]);

  if (!isOpen) return null;

  const handleVaultLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phoneInput.replace(/\D/g, '').trim();
    if (cleanPhone.length !== 11) {
      showToast('Invalid Mobile Number', 'Please enter an 11-digit mobile number (e.g., 017XXXXXXXX)', 'warning');
      return;
    }
    const cleanPin = pinInput.trim();
    if (cleanPin.length !== 4) {
      showToast('Invalid PIN', 'PIN must be 4 digits (e.g., 1234)', 'warning');
      return;
    }

    setIsLoggingIn(true);
    try {
      const session = await onVaultLogin(cleanPhone, cleanPin);

      // Handle remember phone preference
      if (rememberPhone) {
        localStorage.setItem('hisapp_saved_phone', cleanPhone);
        localStorage.setItem('hisapp_remember_phone', 'true');
      } else {
        localStorage.removeItem('hisapp_saved_phone');
        localStorage.setItem('hisapp_remember_phone', 'false');
      }

      showToast(
        session.isNew ? 'New Cloud Vault created!' : 'Cloud Vault unlocked!',
        `Mobile: ${cleanPhone}`,
        'success'
      );
      setPinInput('');
    } catch (err: any) {
      showToast('Vault Error', err?.message || 'Login failed', 'error');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleBiometricLogin = async () => {
    const cleanPhone = (phoneInput || backup.user?.phoneNumber || '').replace(/\D/g, '').trim();
    if (cleanPhone.length !== 11) {
      showToast('Mobile Number Required', 'Enter 11-digit mobile number for biometric login', 'warning');
      return;
    }

    setIsBiometricLoading(true);
    try {
      await onVaultBiometricLogin(cleanPhone);
      if (rememberPhone) {
        localStorage.setItem('hisapp_saved_phone', cleanPhone);
      }
      showToast('Biometric Login Successful!', `Vault ID: ${cleanPhone}`, 'success');
      setPinInput('');
    } catch (err: any) {
      showToast('Biometric Error', err?.message || 'Verification failed', 'error');
    } finally {
      setIsBiometricLoading(false);
    }
  };

  const handleToggleBiometric = async () => {
    if (!backup.user) return;
    setIsBiometricLoading(true);
    try {
      if (isBiometricEnrolled) {
        removeBiometricEnrollment(backup.user.phoneNumber);
        setIsBiometricEnrolled(false);
        showToast('Biometrics Disabled', 'Fingerprint credentials removed for this device', 'info');
      } else {
        await onVaultEnableBiometric();
        setIsBiometricEnrolled(true);
        showToast('Biometrics Enabled!', 'You can now sign in with fingerprint or Face ID', 'success');
      }
    } catch (err: any) {
      showToast('Biometric Error', err?.message || 'Setup failed', 'error');
    } finally {
      setIsBiometricLoading(false);
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (oldPinInput.trim().length !== 4) {
      showToast('Invalid Current PIN', 'Current PIN must be 4 digits', 'warning');
      return;
    }
    if (newPinInput.trim().length !== 4) {
      showToast('Invalid New PIN', 'New PIN must be 4 digits', 'warning');
      return;
    }
    if (newPinInput.trim() !== confirmPinInput.trim()) {
      showToast('PIN Mismatch', 'New PIN and confirmation PIN must match', 'warning');
      return;
    }

    setIsSavingPin(true);
    try {
      await onVaultChangePin(oldPinInput.trim(), newPinInput.trim());
      showToast('PIN Changed Successfully!', 'Your new 4-digit PIN has been saved', 'success');
      setShowChangePin(false);
      setOldPinInput('');
      setNewPinInput('');
      setConfirmPinInput('');
    } catch (err: any) {
      showToast('PIN Change Failed', err?.message || 'Please enter your correct current PIN', 'error');
    } finally {
      setIsSavingPin(false);
    }
  };

  const handleBiometricPinReset = async () => {
    if (!backup.user) return;
    if (newPinInput.trim().length !== 4) {
      showToast('New PIN Required', 'New PIN must be 4 digits', 'warning');
      return;
    }
    if (newPinInput.trim() !== confirmPinInput.trim()) {
      showToast('PIN Mismatch', 'New PIN and confirmation PIN must match', 'warning');
      return;
    }

    setIsSavingPin(true);
    try {
      await onVaultResetPinBiometric(backup.user.phoneNumber, newPinInput.trim());
      showToast('PIN Updated!', 'New 4-digit PIN saved via biometric verification', 'success');
      setShowChangePin(false);
      setOldPinInput('');
      setNewPinInput('');
      setConfirmPinInput('');
    } catch (err: any) {
      showToast('PIN Reset Failed', err?.message || 'Biometric verification was not completed', 'error');
    } finally {
      setIsSavingPin(false);
    }
  };

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Invalid File', 'Please select an image file (PNG, JPG, SVG, WebP)', 'warning');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('File Too Large', 'Please upload a logo under 5MB', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setClinicLogo(result);
        showToast('Logo Preview Loaded', 'Remember to tap Save Profile to keep changes', 'info');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetDefaultLogo = () => {
    setClinicLogo(DEFAULT_CLINIC_LOGO);
    showToast('Reset to Default', `${DEFAULT_CLINIC_NAME} logo restored`, 'info');
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      const effectiveShare = Math.max(1, Math.min(100, Number(sharePercentage) || 40));
      const updated = await saveSettings({
        clinicName: clinicName.trim() || DEFAULT_CLINIC_NAME,
        clinicLogo: clinicLogo.trim() || DEFAULT_CLINIC_LOGO,
        doctorName: doctorName.trim(),
        currencySymbol: currencySymbol.trim() || '৳',
        sharePercentage: effectiveShare,
      });
      onSaveSettings(updated);
      showToast('Settings Saved', 'Clinic profile, share rate, and logo updated', 'success');
    } catch (err: any) {
      showToast('Failed to save', err?.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleReconcileVault = async () => {
    setIsReconciling(true);
    try {
      const res = await backupEngine.reconcileVault();
      setReconcileResult(res);
      showToast(
        res.status === 'perfect-parity' ? '100% Data Parity!' : 'Data Auto-Healed!',
        res.message,
        'success'
      );
    } catch (err: any) {
      showToast('Audit Failed', err?.message || 'Data integrity check could not be completed', 'error');
    } finally {
      setIsReconciling(false);
    }
  };

  const handleToggleTimeMachine = async () => {
    const nextState = !showTimeMachine;
    setShowTimeMachine(nextState);
    if (nextState && backup.user) {
      setIsLoadingSnapshots(true);
      try {
        const list = await backupEngine.getAvailableCloudSnapshots();
        setSnapshots(list);
      } catch (err) {
        // ignore
      } finally {
        setIsLoadingSnapshots(false);
      }
    }
  };

  const handleRestoreSnapshot = async (key: 'latest' | 'yesterday' | 'last_week', label: string) => {
    if (!window.confirm(`Are you sure you want to restore ${label}? Your current database will be restored to this snapshot.`)) {
      return;
    }
    setIsRestoringSnapshot(true);
    try {
      const res = await backupEngine.restoreCloudSnapshotByKey(key);
      showToast('Snapshot Restore Succeeded!', `${res.entries} entries and ${res.settlements} settlements successfully restored`, 'success');
      onDataImported?.();
    } catch (err: any) {
      showToast('Restore Failed', err?.message || 'Could not restore snapshot', 'error');
    } finally {
      setIsRestoringSnapshot(false);
    }
  };

  const handleExportJSON = async () => {
    try {
      const json = await exportAllDataJSON();
      downloadFile(
        json,
        `HishApp_Data_Backup_${todayDateKey()}.json`,
        'application/json;charset=utf-8;'
      );
      const updated = await saveSettings({
        ...settings,
        lastOfflineExportAt: Date.now(),
      });
      onSaveSettings(updated);
      showToast('JSON Backup Ready', 'Complete database exported safely to your device', 'success');
    } catch (err: any) {
      showToast('Export failed', err?.message, 'error');
    }
  };

  const handleExportCSV = async () => {
    try {
      const { patientEntriesCSV, settlementsCSV } = await exportAllDataCSV();
      downloadFile(
        patientEntriesCSV,
        `HishApp_Patient_Entries_${todayDateKey()}.csv`,
        'text/csv;charset=utf-8;'
      );
      setTimeout(() => {
        downloadFile(
          settlementsCSV,
          `HishApp_Settlements_${todayDateKey()}.csv`,
          'text/csv;charset=utf-8;'
        );
      }, 400);
      showToast('CSV Exports Ready', 'Patient entries and settlements downloaded', 'success');
    } catch (err: any) {
      showToast('Export failed', err?.message, 'error');
    }
  };

  const handleImportFiles = async (
    files: FileList | null,
    format: 'json' | 'csv'
  ) => {
    if (!files || files.length === 0) return;
    try {
      let result: ImportResult;
      if (format === 'json') {
        const file = files[0];
        const text = await file.text();
        result = parseJSONBackup(text, file.name);
      } else {
        const loadedFiles = await Promise.all(
          Array.from(files).map(async (f) => ({
            name: f.name,
            text: await f.text(),
          }))
        );
        result = parseCSVFiles(loadedFiles);
      }
      setImportConfirm(result);
    } catch (err: any) {
      showToast('Import Failed', err?.message || 'Could not parse the selected file(s)', 'error');
    } finally {
      if (jsonFileRef.current) jsonFileRef.current.value = '';
      if (csvFileRef.current) csvFileRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!importConfirm) return;
    setIsImporting(true);
    try {
      try {
        const safetyBackup = await exportAllDataJSON();
        downloadFile(
          safetyBackup,
          `HishApp_Safety_Before_Import_${todayDateKey()}.json`,
          'application/json;charset=utf-8;'
        );
      } catch (safetyErr) {
        console.warn('Could not generate safety backup before import:', safetyErr);
      }

      await restoreAllData({
        patientEntries: importConfirm.patientEntries,
        settlements: importConfirm.settlements,
      });
      await syncAllPatientProfiles();
      await logAudit({
        action: 'DATA_IMPORTED',
        targetId: 'system',
        targetType: 'patient_entry',
        details: `Imported ${importConfirm.patientEntries.length} visits and ${importConfirm.settlements.length} settlements from ${importConfirm.source}`,
      });

      showToast(
        'Import Successful',
        `Restored ${importConfirm.patientEntries.length} visits and ${importConfirm.settlements.length} settlements`,
        'success'
      );
      setImportConfirm(null);
      onDataImported?.();
      onClose();
    } catch (err: any) {
      showToast('Import Failed', err?.message || 'Could not restore data', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const isSyncing = backup.phase === 'syncing';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 shadow-2xl space-y-6 border border-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Clinic Settings</h3>
              <p className="text-xs text-slate-500">Cloud Data Vault &amp; Branding Profile</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 active:scale-95 transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section: Cloud Data Vault (Firestore central database) */}
        <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100/80 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Cloud Data Vault (Firestore)
                </h4>
                <p className="text-[10px] text-slate-500">11-digit mobile number and 4-digit secret PIN</p>
              </div>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                isSyncing
                  ? 'bg-indigo-100 text-indigo-800'
                  : backup.phase === 'error'
                  ? 'bg-rose-100 text-rose-800'
                  : backup.user
                  ? backup.pendingChanges
                    ? 'bg-sky-100 text-sky-800'
                    : 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {isSyncing
                ? 'Syncing…'
                : backup.phase === 'error'
                ? 'Sync Error'
                : backup.user
                ? backup.pendingChanges
                  ? 'Changes Pending'
                  : 'Vault Connected'
                : 'Not Logged In'}
            </span>
          </div>

          {!backup.user ? (
            /* Login / Vault Registration Form */
            <form onSubmit={handleVaultLogin} className="space-y-3 pt-1">
              <p className="text-xs text-slate-600 leading-relaxed">
                Log in with your 11-digit mobile number and 4-digit secret PIN. On first entry, a secure <strong>Cloud Data Vault</strong> is created automatically for this number.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1 mb-1">
                    <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                    Mobile Number (11 Digits)
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={11}
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="01XXXXXXXXX"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 focus:border-indigo-500 text-xs font-semibold text-slate-900 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1 mb-1">
                    <Lock className="w-3.5 h-3.5 text-indigo-600" />
                    Secret PIN (4 Digits)
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 focus:border-indigo-500 text-xs font-semibold text-slate-900 outline-none tracking-widest"
                    required
                  />
                </div>
              </div>

              {/* Remember Mobile Number Checkbox */}
              <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={rememberPhone}
                  onChange={(e) => setRememberPhone(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 accent-indigo-600"
                />
                <span>Remember mobile number on this device</span>
              </label>

              {backup.error && (
                <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-1.5">
                  {backup.error}
                </p>
              )}

              <div className="flex flex-col gap-2 pt-0.5">
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="btn-gradient w-full py-2.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60 shadow-sm"
                >
                  {isLoggingIn ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Opening Vault...</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Sign In / Create Vault</span>
                    </>
                  )}
                </button>

                {/* Biometric One-Tap Login Button (if enrolled for this phone on device) */}
                {hasBiometricSupport && isBiometricEnrolled && (
                  <button
                    type="button"
                    onClick={handleBiometricLogin}
                    disabled={isBiometricLoading}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition active:scale-95 disabled:opacity-60"
                  >
                    {isBiometricLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Fingerprint className="w-4 h-4" />
                    )}
                    <span>One-Tap Biometric Sign In (Fingerprint / Face ID)</span>
                  </button>
                )}
              </div>
            </form>
          ) : (
            /* Active Vault Info & Actions */
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-white/90 border border-indigo-100 shadow-2xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      Vault ID: {backup.user.phoneNumber}
                    </p>
                    <p className="text-[10.5px] text-slate-500 truncate flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {backup.lastBackupAt
                        ? `Last Synced: ${new Date(backup.lastBackupAt).toLocaleTimeString()}`
                        : 'Not yet synced to cloud'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {onVaultLock && (
                    <button
                      type="button"
                      onClick={() => onVaultLock()}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-[10px] font-bold flex items-center gap-1 active:scale-95 transition"
                      title="Lock App Now"
                    >
                      <Lock className="w-3 h-3 text-amber-600" />
                      Lock App
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onVaultSignOut()}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center gap-1 active:scale-95 transition"
                    title="Sign Out from Vault"
                  >
                    <LogOut className="w-3 h-3" />
                    Sign Out
                  </button>
                </div>
              </div>

              {/* Biometric Integration Card */}
              {hasBiometricSupport && (
                <div className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2 shadow-2xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`p-2 rounded-xl shrink-0 ${isBiometricEnrolled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                      <Fingerprint className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">Device Biometric Unlock</p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {isBiometricEnrolled
                          ? 'Fingerprint / Face ID active'
                          : 'Enable for quick PIN-less daily unlock'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleToggleBiometric}
                    disabled={isBiometricLoading}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold active:scale-95 transition shrink-0 ${
                      isBiometricEnrolled
                        ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                        : 'btn-gradient btn-gradient--emerald text-white'
                    }`}
                  >
                    {isBiometricLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isBiometricEnrolled ? (
                      'Disable'
                    ) : (
                      'Enable'
                    )}
                  </button>
                </div>
              )}

              {backup.error && (
                <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-1.5">
                  {backup.error}
                </p>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => onBackupNow()}
                  disabled={isSyncing}
                  className="btn-gradient btn-gradient--sky px-3 py-2 rounded-xl text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60"
                >
                  <CloudUpload className={`w-3.5 h-3.5 ${isSyncing ? 'animate-pulse' : ''}`} />
                  <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleReconcileVault}
                  disabled={isReconciling}
                  className="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition disabled:opacity-60"
                  title="Automatically audit and verify zero data desync between local storage and cloud"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${isReconciling ? 'animate-spin' : ''}`} />
                  <span>{isReconciling ? 'Auditing...' : 'Audit Data Parity'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleTimeMachine}
                  className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition"
                  title="Time-Machine 3-tier Cloud Snapshot Recovery"
                >
                  <History className="w-3.5 h-3.5 text-sky-600" />
                  <span>{showTimeMachine ? 'Hide Time-Machine' : 'Time-Machine'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowChangePin(!showChangePin)}
                  className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition"
                >
                  <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{showChangePin ? 'Cancel PIN Change' : 'Change PIN'}</span>
                </button>

                {backup.pendingChanges && (
                  <span className="text-[10px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-full">
                    {backup.pendingCount} changes waiting to sync
                  </span>
                )}
              </div>

              {/* Reconcile Audit Result Panel */}
              {reconcileResult && (
                <div
                  className={`p-3 rounded-xl border text-xs leading-relaxed space-y-1 ${
                    reconcileResult.status === 'perfect-parity'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-indigo-50 border-indigo-200 text-indigo-800'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1">
                      <FileCheck className="w-4 h-4 text-emerald-600" />
                      Data Integrity Audit Report
                    </span>
                    <span className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-slate-200 text-slate-600">
                      {new Date(reconcileResult.checkedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 font-mono text-[11px] pt-1 text-slate-700">
                    <div>
                      Local Entries: <strong className="text-slate-900">{reconcileResult.localEntries}</strong> | Settlements:{' '}
                      <strong className="text-slate-900">{reconcileResult.localSettlements}</strong>
                    </div>
                    <div>
                      Cloud Entries: <strong className="text-slate-900">{reconcileResult.remoteEntries}</strong> | Settlements:{' '}
                      <strong className="text-slate-900">{reconcileResult.remoteSettlements}</strong>
                    </div>
                  </div>
                  <p className="text-[11px] font-sans pt-0.5">{reconcileResult.message}</p>
                </div>
              )}

              {/* Time Machine Cloud Recovery Panel */}
              {showTimeMachine && (
                <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200 space-y-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <History className="w-4 h-4 text-sky-600" />
                      Cloud Time-Machine Recovery (Rolling Snapshots)
                    </h5>
                    <button
                      type="button"
                      onClick={handleToggleTimeMachine}
                      className="text-[10.5px] font-semibold text-sky-700 hover:text-sky-900"
                    >
                      Close
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Recover your entire clinical database in 1 click from any previous complete cloud snapshot in case of accidental overwrite or device data loss.
                  </p>

                  {isLoadingSnapshots ? (
                    <div className="py-4 text-center text-xs text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin inline-block mr-1 text-sky-600" />
                      Searching cloud snapshots...
                    </div>
                  ) : snapshots.length === 0 ? (
                    <div className="py-3 text-center text-xs text-slate-500">No cloud snapshots found.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {snapshots.map((snap) => (
                        <div
                          key={snap.key}
                          className="p-2.5 rounded-xl bg-white border border-sky-100 flex items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <div className="font-bold text-slate-800">{snap.label}</div>
                            <div className="text-[10.5px] text-slate-500 font-mono">
                              {snap.exists
                                ? `${snap.entryCount} entries, ${snap.settlementCount} settlements • ${new Date(
                                    snap.timestamp
                                  ).toLocaleString()}`
                                : 'Not yet created'}
                            </div>
                          </div>
                          {snap.exists && (
                            <button
                              type="button"
                              onClick={() => handleRestoreSnapshot(snap.key, snap.label)}
                              disabled={isRestoringSnapshot}
                              className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-[11px] active:scale-95 transition disabled:opacity-60 shrink-0"
                            >
                              Restore
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Change PIN Expandable Panel */}
              {showChangePin && (
                <form
                  onSubmit={handleChangePin}
                  className="p-3.5 rounded-xl bg-white border border-indigo-200 space-y-3 shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                      Change Secret PIN
                    </h5>
                    {isBiometricEnrolled && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        Biometrics Ready
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-0.5">
                        Current PIN
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        value={oldPinInput}
                        onChange={(e) => setOldPinInput(e.target.value.replace(/\D/g, ''))}
                        placeholder={isBiometricEnrolled ? 'Optional (with biometrics)' : '••••'}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-center font-bold outline-none focus:border-indigo-500"
                        required={!isBiometricEnrolled}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-0.5">
                        New PIN (4 Digits)
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        value={newPinInput}
                        onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                        placeholder="••••"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-center font-bold outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-0.5">
                        Confirm New PIN
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        value={confirmPinInput}
                        onChange={(e) => setConfirmPinInput(e.target.value.replace(/\D/g, ''))}
                        placeholder="••••"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-center font-bold outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowChangePin(false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Cancel
                    </button>

                    {/* Biometric PIN Reset button if biometrics is enrolled */}
                    {isBiometricEnrolled && (
                      <button
                        type="button"
                        onClick={handleBiometricPinReset}
                        disabled={isSavingPin}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-60 shadow-xs active:scale-95 transition"
                        title="Set new PIN using fingerprint without typing current PIN"
                      >
                        <Fingerprint className="w-3.5 h-3.5" />
                        <span>Update PIN with Biometrics</span>
                      </button>
                    )}

                    <button
                      type="submit"
                      disabled={isSavingPin}
                      className="btn-gradient px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-60"
                    >
                      {isSavingPin ? 'Saving...' : 'Save with Current PIN'}
                    </button>
                  </div>
                </form>
              )}

              {/* Automatic Sync Switch */}
              <label className="flex items-center justify-between p-2.5 rounded-xl bg-white/80 border border-white shadow-2xs cursor-pointer">
                <div>
                  <p className="text-xs font-bold text-slate-900">Automatic Cloud Sync (Auto-Sync)</p>
                  <p className="text-[11px] text-slate-500">
                    Every modification is automatically synced live to Cloud Vault and accessible across devices.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.autoBackup !== false}
                  onClick={() => onToggleAutoBackup(!(settings.autoBackup !== false))}
                  className={`relative w-10 h-5.5 rounded-full transition-colors shrink-0 ${
                    settings.autoBackup !== false ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                  style={{ height: '22px' }}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-transform ${
                      settings.autoBackup !== false ? 'translate-x-[18px]' : ''
                    }`}
                  />
                </button>
              </label>
            </div>
          )}
        </div>

        {/* Section 1: Clinic & Doctor Profile */}
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Doctor &amp; Clinic Identity
            </h4>
            <span className="text-[10px] text-slate-400">Customizable Branding</span>
          </div>

          {/* Clinic Logo Customization */}
          <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-700">Clinic Brand Logo</label>
              <button
                type="button"
                onClick={handleResetDefaultLogo}
                className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 transition"
              >
                Reset to Default
              </button>
            </div>

            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center overflow-hidden p-1 shrink-0">
                {clinicLogo ? (
                  <img
                    src={clinicLogo}
                    alt="Clinic Logo Preview"
                    className="w-full h-full object-contain rounded-xl"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <Building2 className="w-6 h-6 text-slate-400" />
                )}
              </div>

              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold cursor-pointer active:scale-95 transition inline-flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoFileUpload}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setClinicLogo('/applogo.png');
                      showToast('App Launcher Logo Selected', 'Set to app launcher icon', 'info');
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                  >
                    Use App Logo
                  </button>
                  <span className="text-[10px] text-slate-400">PNG, JPG, SVG, WebP</span>
                </div>
                <input
                  type="text"
                  placeholder="Or enter logo URL (e.g. /applogo.png)..."
                  value={clinicLogo}
                  onChange={(e) => setClinicLogo(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-[11px] text-slate-800 outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">Clinic Name</label>
              <input
                type="text"
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                placeholder={DEFAULT_CLINIC_NAME}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 outline-none focus:border-indigo-500 font-semibold"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">Doctor Name</label>
              <input
                type="text"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                placeholder="Doctor name (e.g. Dr. MBR)"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 outline-none focus:border-indigo-500 font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Currency Symbol
              </label>
              <input
                type="text"
                value={currencySymbol}
                onChange={(e) => setCurrencySymbol(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 outline-none focus:border-indigo-500"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-700">
                  Doctor's Share Rate (%)
                </label>
                <span className="text-[10px] text-slate-400">Default: 40%</span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min="1"
                  max="100"
                  step="1"
                  value={sharePercentage}
                  onChange={(e) =>
                    setSharePercentage(
                      Math.max(1, Math.min(100, parseFloat(e.target.value) || 0))
                    )
                  }
                  className="w-full px-3 py-2 pr-8 rounded-xl border border-slate-200 text-xs font-bold text-indigo-700 outline-none focus:border-indigo-500 bg-white"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  %
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                {[30, 40, 50, 60].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setSharePercentage(rate)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition ${
                      sharePercentage === rate
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {rate}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="btn-gradient w-full py-2.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Profile Changes'}</span>
          </button>
        </form>

        {/* Section 2: Audit Trail & Emergency Backups */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Backups &amp; Data Safety
          </h4>

          {/* 7-Day Automatic Background Backup Status Card */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-50/70 to-emerald-50/70 border border-indigo-100/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <h5 className="text-xs font-bold text-slate-900">
                  7-Day Automated JSON Auto-Export
                </h5>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                Active &amp; Running
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              HishApp automatically compiles and saves a full database JSON backup every 7 days in the background, ensuring your clinical ledger is permanently safeguarded without requiring manual intervention.
            </p>
            <button
              type="button"
              onClick={handleExportJSON}
              className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Fresh Snapshot Now (JSON)</span>
            </button>
          </div>

          {/* Dual-Store Redundancy Status Card */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-600" />
                <h5 className="text-xs font-bold text-slate-900">
                  Dual-Store Redundancy (Shadow Mirror)
                </h5>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                100% Protected
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 font-mono">
              <div className="p-2 rounded-xl bg-white border border-slate-200">
                <div className="text-[10px] font-bold text-slate-400 uppercase font-sans">
                  Primary DB
                </div>
                <div className="font-bold text-slate-800">
                  {dualStoreHealth?.primaryEntries ?? '...'} entries,{' '}
                  {dualStoreHealth?.primarySettlements ?? '...'} settlements
                </div>
              </div>
              <div className="p-2 rounded-xl bg-white border border-slate-200">
                <div className="text-[10px] font-bold text-slate-400 uppercase font-sans">
                  Safety Mirror DB
                </div>
                <div className="font-bold text-slate-800">
                  {dualStoreHealth?.mirrorEntries ?? '...'} entries,{' '}
                  {dualStoreHealth?.mirrorSettlements ?? '...'} settlements
                </div>
              </div>
            </div>
            <p className="text-[10.5px] text-slate-500 leading-relaxed font-sans">
              To protect against browser clearing or unexpected memory drops, a completely independent shadow database maintains continuous mirrors of all records alongside the primary database.
            </p>
          </div>

          {/* Internal Financial Audit Trail & Recycle Bin */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h5 className="text-xs font-bold text-slate-900">
                Audit Trail &amp; Recycle Bin
              </h5>
              <p className="text-[11px] text-slate-500">
                Restore deleted records or inspect the comprehensive clinical audit trail.
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold active:scale-95 transition shadow-xs flex items-center gap-1"
                title="View and restore deleted records"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Recycle Bin</span>
              </button>
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold active:scale-95 transition shrink-0 shadow-xs"
              >
                Audit Log
              </button>
            </div>
          </div>

          {/* Emergency Local Files Export */}
          <div>
            <span className="text-[11px] font-bold text-slate-700 block mb-1">
              Emergency Local Downloads (Offline)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleExportJSON}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <Download className="w-3.5 h-3.5 text-indigo-600" />
                <span>Export JSON Backup</span>
              </button>
              <button
                type="button"
                onClick={handleExportCSV}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                <span>Export CSV (2 Sheets)</span>
              </button>
            </div>
          </div>

          {/* Restore from File (JSON / CSV import) */}
          <div>
            <span className="text-[11px] font-bold text-slate-700 block mb-1">
              Restore from File (Import)
            </span>
            <p className="text-[10.5px] text-slate-500 mb-2 leading-relaxed">
              Replace this device's data with a backup file (e.g. on a new phone). Your current
              data is downloaded as a safety copy automatically before anything is replaced.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Import JSON Backup</span>
                <input
                  ref={jsonFileRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => handleImportFiles(e.target.files, 'json')}
                  className="hidden"
                />
              </label>
              <label className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Import CSV Files</span>
                <input
                  ref={csvFileRef}
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  onChange={(e) => handleImportFiles(e.target.files, 'csv')}
                  className="hidden"
                />
              </label>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              CSV import: select the exported Patient_Entries CSV (and optionally the Settlements
              CSV) together.
            </p>
          </div>

          {/* Import Confirmation Panel */}
          {importConfirm && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 space-y-2.5 animate-in fade-in">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <p className="font-bold text-rose-900">Replace all data on this device?</p>
                  <p className="text-rose-800">
                    The file <strong>{importConfirm.source}</strong> contains{' '}
                    <strong>{importConfirm.patientEntries.length} visits</strong> and{' '}
                    <strong>{importConfirm.settlements.length} settlements</strong>
                    {importConfirm.skippedRows > 0
                      ? ` (${importConfirm.skippedRows} invalid rows skipped)`
                      : ''}
                    . Current records will be replaced. A safety backup of the current data
                    downloads first.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setImportConfirm(null)}
                  disabled={isImporting}
                  className="flex-1 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={isImporting}
                  className="btn-gradient btn-gradient--rose flex-1 py-2 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-70"
                >
                  {isImporting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>{isImporting ? 'Importing…' : 'Import & Replace'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Progressive Web App Install */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <img
              src="/applogo.png"
              alt="HishApp Launcher Logo"
              className="w-7 h-7 rounded-lg object-contain shadow-xs border border-slate-200 bg-white"
            />
            <div>
              <h5 className="text-xs font-bold text-slate-900">Install as Mobile App (PWA)</h5>
              <p className="text-[11px] text-slate-500">
                Works 100% offline from your home screen.
              </p>
            </div>
          </div>

          {isInstalled ? (
            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
              Installed
            </span>
          ) : isInstallable ? (
            <button
              onClick={install}
              className="btn-gradient px-3 py-1.5 rounded-xl text-white text-xs font-bold"
            >
              Install
            </button>
          ) : isIOS ? (
            <button
              onClick={() => setShowIOSPrompt(true)}
              className="px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold active:scale-95 transition"
            >
              iOS Guide
            </button>
          ) : (
            <span className="text-[11px] text-slate-400">PWA Active</span>
          )}
        </div>

        {/* iOS Install Prompt Modal */}
        {showIOSPrompt && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60">
            <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3">
              <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
                <img
                  src="/applogo.png"
                  alt="HishApp"
                  className="w-10 h-10 rounded-xl object-contain border border-slate-200 shadow-xs"
                />
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Install HishApp on iPhone / iPad</h4>
                  <p className="text-[11px] text-slate-500">Add to your Home Screen</p>
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                1. Tap the <strong>Share</strong> icon (box with upward arrow) in the Safari toolbar.<br />
                2. Scroll down and tap <strong>Add to Home Screen</strong>.<br />
                3. Tap <strong>Add</strong> at top right.
              </p>
              <button
                onClick={() => setShowIOSPrompt(false)}
                className="btn-gradient w-full py-2 rounded-xl text-white text-xs font-bold"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Financial Audit Trail Modal */}
        {isAuditModalOpen && (
          <AuditLogModal
            isOpen={isAuditModalOpen}
            onClose={() => setIsAuditModalOpen(false)}
            showToast={showToast}
          />
        )}
      </div>
    </div>
  );
};
