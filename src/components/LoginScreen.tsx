import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Lock,
  Phone,
  KeyRound,
  Fingerprint,
  Eye,
  EyeOff,
  UserCheck,
  Sparkles,
  ArrowRight,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import {
  cleanPhoneNumber,
  isValidPhoneNumber,
  isValidPin,
  type VaultSession,
} from '../services/vaultAuth';
import {
  getRememberUserPreference,
  getRememberedUserId,
  recordUnlockSuccess,
  setRememberUserPreference,
} from '../services/appLockService';
import {
  isBiometricAvailable,
  isBiometricEnrolledFor,
} from '../services/biometricAuth';

interface LoginScreenProps {
  onUnlock: (session: VaultSession) => void;
  onLogin: (phone: string, pin: string) => Promise<VaultSession>;
  onBiometricLogin: (phone: string) => Promise<VaultSession>;
  defaultPhone?: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onUnlock,
  onLogin,
  onBiometricLogin,
  defaultPhone,
}) => {
  const rememberedPhone = defaultPhone || getRememberedUserId();
  const [isRememberedMode, setIsRememberedMode] = useState<boolean>(!!rememberedPhone);

  // Form states
  const [phone, setPhone] = useState<string>(rememberedPhone || '');
  const [pin, setPin] = useState<string>('');
  const [rememberUser, setRememberUser] = useState<boolean>(getRememberUserPreference());
  const [showPin, setShowPin] = useState<boolean>(false);

  // Interaction & UI states
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isBioSupported, setIsBioSupported] = useState<boolean>(false);
  const [isBioEnrolled, setIsBioEnrolled] = useState<boolean>(false);

  const pinInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  // Check biometric support & enrollment
  useEffect(() => {
    let isMounted = true;
    async function checkBio() {
      const supported = await isBiometricAvailable();
      if (!isMounted) return;
      setIsBioSupported(supported);
      if (rememberedPhone) {
        setIsBioEnrolled(isBiometricEnrolledFor(rememberedPhone));
      }
    }
    checkBio();
    return () => {
      isMounted = false;
    };
  }, [rememberedPhone]);

  // Focus PIN automatically if remembered user
  useEffect(() => {
    if (isRememberedMode) {
      pinInputRef.current?.focus();
    }
  }, [isRememberedMode]);

  // Handle Full Form or PIN Submit
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const targetPhone = cleanPhoneNumber(isRememberedMode ? (rememberedPhone || phone) : phone);
    const targetPin = pin.trim();

    if (!isValidPhoneNumber(targetPhone)) {
      setError('Please enter a valid 11-digit mobile number (01XXXXXXXXX).');
      phoneInputRef.current?.focus();
      return;
    }

    if (!isValidPin(targetPin)) {
      setError('Please enter your 4-digit secret PIN.');
      pinInputRef.current?.focus();
      return;
    }

    setIsLoading(true);
    try {
      const session = await onLogin(targetPhone, targetPin);
      setRememberUserPreference(rememberUser);
      recordUnlockSuccess(targetPhone, rememberUser);
      onUnlock(session);
    } catch (err: any) {
      setError(err?.message || 'Login failed. Please verify your mobile number and PIN.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Biometric Unlock
  const handleBiometricClick = async () => {
    const targetPhone = cleanPhoneNumber(rememberedPhone || phone);
    if (!targetPhone) {
      setError('Mobile number is required before using biometrics.');
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const session = await onBiometricLogin(targetPhone);
      recordUnlockSuccess(targetPhone, true);
      onUnlock(session);
    } catch (err: any) {
      setError(err?.message || 'Biometric unlock failed. Please use your secret PIN.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchUser = () => {
    setIsRememberedMode(false);
    setPin('');
    setError(null);
    setTimeout(() => {
      phoneInputRef.current?.focus();
    }, 50);
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 -z-10 bg-radial from-indigo-100/60 via-slate-50 to-indigo-50/40 pointer-events-none" />

      {/* Decorative Blur Orbs */}
      <div className="absolute -top-24 -left-20 w-80 h-80 rounded-full bg-gradient-to-tr from-indigo-300/30 to-sky-200/40 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-20 w-80 h-80 rounded-full bg-gradient-to-br from-emerald-200/30 to-indigo-200/30 blur-3xl pointer-events-none" />

      {/* Login Card */}
      <div className="w-full max-w-md mx-auto ios-glass-card rounded-3xl p-6 sm:p-8 shadow-2xl border border-white/80 animate-in fade-in zoom-in-95 duration-200">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2 pb-5 border-b border-slate-150/70">
          <div className="relative w-16 h-16 rounded-2xl p-0.5 bg-gradient-to-tr from-indigo-500 via-sky-500 to-emerald-400 shadow-lg shadow-indigo-500/20 flex items-center justify-center">
            <img
              src="/applogo.png"
              alt="HishApp Logo"
              className="w-full h-full rounded-[14px] object-contain bg-white p-1"
            />
          </div>

          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
              HishApp
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Dental Clinic Income &amp; Settlement Vault
            </p>
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-semibold border border-indigo-200/60">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
            <span>Cloud Firestore Secured Vault</span>
          </div>
        </div>

        {/* 1-Click Install Button Header Notification */}
        <div className="pt-4 pb-2">
          <PWAInstallButton
            variant="primary"
            label="1-Click Install App"
            className="w-full justify-center py-2.5"
          />
        </div>

        {/* Error Notice */}
        {error && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}

        {/* Form Area */}
        <form onSubmit={handleFormSubmit} className="mt-5 space-y-4">
          {/* Mode 1: Remembered User ID Greeting */}
          {isRememberedMode ? (
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-indigo-50/90 to-sky-50/90 border border-indigo-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                      Logged-in Doctor / Vault ID
                    </div>
                    <div className="text-sm font-extrabold text-slate-800 font-mono tracking-wide">
                      {rememberedPhone}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSwitchUser}
                  className="text-[11px] font-semibold text-slate-500 hover:text-indigo-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/80 transition"
                  title="Switch to another number"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Switch</span>
                </button>
              </div>

              {/* PIN input for remembered user */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Enter 4-Digit Secret PIN</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    Unlock for Today
                  </span>
                </label>

                <div className="relative glow-field">
                  <input
                    ref={pinInputRef}
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    placeholder="• • • •"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center tracking-[0.5em] text-lg font-bold py-3 px-4 rounded-xl border border-slate-300 bg-white/90 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 placeholder:tracking-normal placeholder:font-normal placeholder:text-slate-400"
                    disabled={isLoading}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    tabIndex={-1}
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  type="submit"
                  disabled={isLoading || pin.length !== 4}
                  className="w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm text-white shadow-md shadow-indigo-500/25 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition active:scale-[0.98]"
                >
                  {isLoading ? (
                    <span>Verifying...</span>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Unlock with PIN</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                {/* Biometric Unlock Option if enrolled or supported */}
                {(isBioEnrolled || isBioSupported) && (
                  <button
                    type="button"
                    onClick={handleBiometricClick}
                    disabled={isLoading}
                    className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 shadow-xs flex items-center justify-center gap-2 transition active:scale-[0.98]"
                  >
                    <Fingerprint className="w-4 h-4 text-indigo-600" />
                    <span>Unlock with Biometrics / Fingerprint</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Mode 2: Full Login with 11-digit mobile & 4-digit PIN */
            <div className="space-y-3.5">
              {/* Phone Input */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-indigo-600" />
                  <span>11-Digit Mobile Number</span>
                </label>
                <div className="relative glow-field">
                  <input
                    ref={phoneInputRef}
                    type="tel"
                    inputMode="numeric"
                    maxLength={11}
                    placeholder="01XXXXXXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    className="w-full py-2.5 px-3.5 rounded-xl border border-slate-300 bg-white/90 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-semibold text-slate-800 placeholder:text-slate-400 font-mono"
                    disabled={isLoading}
                    autoComplete="tel"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Standard 11-digit mobile number (e.g. 01712345678)
                </p>
              </div>

              {/* PIN Input */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Secret PIN (4 Digits)</span>
                  </span>
                  <span className="text-[10px] text-indigo-600 font-medium flex items-center gap-0.5">
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Any 4 digits on first login</span>
                  </span>
                </label>
                <div className="relative glow-field">
                  <input
                    ref={pinInputRef}
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    placeholder="• • • •"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full py-2.5 px-3.5 rounded-xl border border-slate-300 bg-white/90 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold text-slate-800 placeholder:text-slate-400"
                    disabled={isLoading}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    tabIndex={-1}
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Mobile Number Checkbox */}
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberUser}
                    onChange={(e) => setRememberUser(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                  />
                  <span className="text-xs text-slate-700 font-medium">
                    Remember Mobile Number / User ID on this device
                  </span>
                </label>
                <p className="text-[10px] text-slate-400 ml-6 mt-0.5">
                  When saved, you only need to enter your PIN or use biometrics for quick access.
                </p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || phone.length !== 11 || pin.length !== 4}
                className="w-full mt-2 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm text-white shadow-md shadow-indigo-500/25 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition active:scale-[0.98]"
              >
                {isLoading ? (
                  <span>Preparing Vault...</span>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Sign In (Access Vault)</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {rememberedPhone && (
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => setIsRememberedMode(true)}
                    className="text-xs text-indigo-600 font-semibold hover:underline"
                  >
                    Back to saved number ({rememberedPhone})
                  </button>
                </div>
              )}
            </div>
          )}
        </form>

        {/* Security / Once-A-Day Policy Footer */}
        <div className="mt-6 pt-4 border-t border-slate-150/70 text-center space-y-1.5">
          <p className="text-[11px] text-slate-500 font-medium flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span>Unlock once per day with PIN or biometrics for all-day access.</span>
          </p>
          <p className="text-[10px] text-slate-400">
            Unless you log out, no PIN or credentials will be required for the rest of the day.
          </p>
        </div>
      </div>
    </div>
  );
};
