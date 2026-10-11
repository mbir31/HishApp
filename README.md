<div align="center">

<img src="./applogo.png" alt="HishApp logo" width="104" />

# 🦷 HishApp — Clinical Income, Share & Settlement Tracker
### *The Ultimate Percentage-Based Financial Ledger Engineered for Dental Surgeons* 🇧🇩

[![PWA Ready](https://img.shields.io/badge/PWA-Installable-4F46E5.svg)](https://hishapp1.web.app/)
[![Offline First](https://img.shields.io/badge/Offline-100%25%20Functional-10B981.svg)](https://hishapp1.web.app/)
[![Cloud Vault](https://img.shields.io/badge/Cloud%20Vault-Mobile%20%2B%20PIN-06B6D4.svg)](https://hishapp1.web.app/)
[![Made for BDS](https://img.shields.io/badge/Community-BDS%20Doctors%20BD-E11D48.svg)](https://hishapp1.web.app/)

**🌐 Live Application:** <https://hishapp1.web.app/>

[📱 Install as App](#-quick-install-guide) · [✨ Core Features](#-core-features) · [💡 The Name Story](#-the-story-behind-hishapp) · [🔢 How the 40% Share Works](#-how-the-share-calculation-works) · [🛡️ Security & Backup Architecture](#️-enterprise-grade-data-safety--backup-engine)

</div>

---

## 💡 The Story Behind HishApp

<div align="center">

### **আয়ের শতকরা হিসাব ও হিস্যা অ্যাপ**
### **HishApp ≈ হিস্যাঅ্যাপ !**

</div>

Every dental surgeon practicing in private chambers and clinics across Bangladesh encounters the exact same daily hurdle:

> *"The clinic retains 60%, and my professional share is 40%. After treating patients all day, writing in paper notebooks and calculating shares at month-end is exhausting. Unpaid arrears, carried-over dues, and clinic advances get lost in loose sheets!"*

**HishApp was built to eliminate this friction entirely.**  
It combines **“হিসাব” (Account & Calculation)** and **“হিস্যা” (Doctor's Earned Percentage Share)** into a seamless, modern, lightning-fast digital ledger designed specifically for dental chambers.

---

## ✨ Core Features

### 📥 1. Rapid 5-Second Visit Entry
- **Type or Select Patient:** Real-time auto-suggestions for repeat patients with cumulative visit history.
- **Smart Duplicate Guard:** Instantly warns if the same patient was already entered on the selected date to prevent accidental double-logging.
- **Dental Procedure Presets:** One-tap selection for RCT, Filling, Scaling, Extraction, Crown, Pulpectomy, etc.
- **Follow-up (৳0) Preset:** Instantly sets the fee to 0 while keeping it fully editable.
- **Quick Amount Presets:** Pre-configured buttons (+500, +1000, +2000, No Payment) with an in-app Preset Manager.

### 🔢 2. Real-Time Share Computation
- Live calculation of your **Doctor's Share** (default 40%, customizable to any percentage in Settings) and the **Clinic Retention** (60%).
- Real-time gross and net figures update as you type.

### 💰 3. Carry-Forward Settlement Engine
- **Batch Reconciliation:** Select any settlement window (This Week, Last 14 Days, This Month, or Custom range).
- **Automated Due Carry-Forward:** If the clinic pays partial amounts, the remaining unpaid balance automatically carries forward to the next cycle. You never lose a single earned taka.
- **Advance Payment Credit:** Clinic advances automatically reflect as adjustable credits in subsequent cycles.

### 💬 4. 1-Tap Direct WhatsApp Share
- Instant **Direct WhatsApp Share** button on every settlement receipt and historical record.
- Pre-formats a formal, professional message breakdown (Clinic Name, Attending Surgeon, Period, Patients Settled, Share Breakdown, Arrears, and Next Due) directly into WhatsApp with zero copying required.

### 🖼️ 5. Formal JPG Statement & Monthly PDF Export
- **Certified JPG Statement:** Crisp, high-resolution graphic statement generated on-canvas, complete with certification text, ready for WhatsApp sharing or printing.
- **Monthly Summary PDF:** Formatted multi-page PDF report with procedure-wise breakdown, daily volume, and financial audits.

### 📊 6. Interactive Analytics Dashboard
- Comprehensive metrics: Today's Share, This Month's Income, Pending Settlement Visits, and Outstanding Arrears.
- Interactive charts showing treatment revenue distribution and 7-day/30-day earnings velocity.

### 🔒 7. Cloud Data Vault with Biometrics
- **Frictionless Auth:** 11-digit mobile number + 4-digit secret PIN — no complicated passwords or third-party dependencies.
- **Once-A-Day Unlock:** Unlock once in the morning via PIN or device biometrics (Fingerprint / Face ID / Touch ID), and enjoy unrestricted access all day long.
- **Vault Auto-Lock:** Optional manual instant lock button.

### 🛡️ 8. Automated 7-Day Background Backup
- **Zero-Effort Protection:** Automatically compiles and triggers a full JSON backup every 7 days in the background.
- **Dual-Store Local Redundancy:** Continuous shadow mirroring across two independent IndexedDB stores (`Primary Ledger` + `HishAppSafetyMirror`) plus emergency localStorage snapshots.
- **Recycle Bin & Audit Log:** Accidentally deleted visits can be instantly recovered with the 10-second Undo toast or restored from the Audit Log.

---

## 📱 Quick Install Guide

HishApp is built as a progressive web application (PWA). It requires no app store downloads and works **100% offline**:

1. Open **Google Chrome** (Android/Desktop) or **Safari** (iOS) and visit:  
   👉 **<https://hishapp1.web.app/>**
2. Tap the **"INSTALL APP"** button in the header (or tap browser menu `⋮` ➔ **"Install app"** / **"Add to Home screen"**).
3. The **HishApp** icon will appear on your phone's home screen.
4. Launch it anytime — it runs full-screen like a native app and works flawlessly even when you have **zero internet connection**!

---

## 🔢 How the Share Calculation Works

Every patient visit record stores the **full collected patient bill** and immediately divides it by your negotiated clinical percentage:

$$\text{Doctor Share} = \text{Received Amount} \times \left(\frac{\text{Share \%}}{100}\right)$$

```
Example (at 40% Share):
Patient: Shuvo | RCT | Received: ৳3,000
➔ Doctor's Share (40%):  ৳1,200
➔ Clinic Retention (60%): ৳1,800
```

### Settlement Cycle Formula:
$$\text{Total Payable} = \text{Current Period Doctor Share} + \text{Previous Carry-over Due}$$
$$\text{Next Carried Forward Due} = \text{Total Payable} - \text{Amount Paid by Clinic}$$

If the clinic owner pays ৳10,000 against a total payable of ৳12,500, the remaining **৳2,500** is automatically recorded as an outstanding balance and added to the top of your next settlement batch.

---

## 🛡️ Enterprise-Grade Data Safety & 5 Preventive Layers
### *Why Phone Cache Cleaners or Browser Cleans CANNOT Delete Your Data*

Dental surgeons frequently ask:
> *"What happens if my phone's default cleaner, memory booster, or browser cache cleaner wipes app data? Will my clinic ledger be lost?"*

**The short answer: NO.** HishApp incorporates **5 engineered defense barriers** specifically designed to survive device storage sweeps and cache clearing:

```
┌─────────────────────────────────────────────────────────────────────────┐
│               HISHAPP MULTI-TIER DATA PROTECTION SHIELD                │
├─────────────────────────────────────────────────────────────────────────┤
│ [1] navigator.storage.persist()  ──> Operating System Protected Storage │
│ [2] IndexedDB Separation         ──> Excluded from Temp HTTP Cache      │
│ [3] Shadow Mirror (Dual-DB)      ──> Independent Local Redundancy       │
│ [4] Emergency Snapshot (Storage) ──> Critical JSON Recovery Fallback    │
│ [5] Auto 7-Day JSON Auto-Export  ──> Physical Backup in Phone Downloads │
└─────────────────────────────────────────────────────────────────────────┘
```

### 🛡️ The 5 Preventive Layers in Detail:

1. **🔒 Layer 1: Hardware-Level Storage Eviction Immunity (`navigator.storage.persist()`)**
   - On initialization, HishApp programmatically requests Chrome/Safari OS-level **Persistent Storage permission**.
   - Once granted by the OS, the browser kernel assigns the storage bucket **Persistent (Non-Evictable)** status. Even when the phone runs critically low on disk space, the OS will purge temporary caches of other apps while leaving HishApp's transactional database 100% untouched.

2. **🧱 Layer 2: IndexedDB Architectural Insulation (Not HTTP Cache)**
   - When phone "Cleaner" apps (like Xiaomi Security, Samsung Device Care, or Files by Google) clean "Cache", they target temporary HTTP assets (`.jpg`, `.js`, cached network requests).
   - HishApp records are stored inside **W3C Structured IndexedDB (`HishAppLedger_<phone>`)**, which is treated as an installed structured database—not temporary cache. Standard cache clearing operations do not touch IndexedDB records.

3. **🪞 Layer 3: Independent Dual-Store Shadow Mirror (`HishAppSafetyMirror`)**
   - Every patient visit, settlement, and setting is dual-written in real-time across two separate, isolated IndexedDB databases. If an abnormal browser crash or table corruption ever affects the primary database, the background engine automatically self-heals from the `HishAppSafetyMirror`.

4. **⚡ Layer 4: Emergency Local Snapshot Fallback**
   - Alongside IndexedDB, the engine captures compressed emergency JSON snapshots into isolated Web Storage. If a device ever encounters an IndexedDB initialization failure or strict sandbox reset, the application instantly detects it and offers 1-tap data reconstruction.

5. **📦 Layer 5: Automated 7-Day Background JSON Export & Cloud Vault**
   - **Zero-Effort Automated Backups:** Every 7 days, HishApp silently compiles a complete, timestamped JSON export file (`hishapp-autobackup-<date>.json`) and triggers a direct background download into your device's `Downloads` folder without interrupting your clinical workflow.
   - **Multi-Device Cloud Vault:** Backed up and synced via your Mobile Number + Secret PIN, allowing you to restore your entire chamber history on a new phone or laptop in seconds.

---

## 📋 Comprehensive Feature Matrix

| Category | Feature | Benefit for Doctors |
|---|---|---|
| **Entry & Visits** | 5-Second Rapid Entry | Log patients instantly between dental procedures |
| | Numeric Keypad Optimized | Mobile auto-triggers large number pad (`inputMode="numeric"`) |
| | Smart Duplicate Guard | Prevents double-billing the same patient on the same day |
| | Procedure Quick-Pick | 1-tap RCT, Scaling, Extraction, Filling, Crown, etc. |
| | ৳0 Follow-Up Shortcut | Log follow-up checkups with zero fee instantly |
| | Customizable Amount Presets | Quick increment buttons (+500, +1000, +2000, etc.) |
| **Share & Calculations**| Configurable Doctor % | Default 40% (customizable to 30%, 50%, or any custom rate) |
| | Live Calculations | Real-time calculation of Doctor Share & Clinic Retention |
| | Unpaid Arrears Carry-Over | Unpaid clinic dues auto-transfer to subsequent cycles |
| | Advance Settlement Credits | Clinic prepayments deduct smoothly from future batches |
| **Sharing & Reports** | 1-Tap Direct WhatsApp Share | Share formatted settlement & monthly breakdowns via WhatsApp |
| | Certified High-Res JPG | Export cryptographic stamped visual receipts (Canvas 2x) |
| | Monthly PDF Audit Report | Multi-page procedure audit table with daily totals |
| | CSV / Excel Data Export | 2 separate spreadsheets (Detailed Visits + Settlements) |
| **Security & Privacy** | Mobile + 4-Digit PIN Vault | Frictionless authentication without third-party email trackers |
| | Biometric Quick Unlock | Instant Touch ID / Face ID / Fingerprint morning login |
| | Once-a-Day Unlock | Enter PIN once in the morning, works seamlessly all day |
| | Zero Lag & 60 FPS Polish | Hardware-accelerated transitions & zero UI blocking |
| | 100% Offline PWA | Operates smoothly in clinics with poor cellular reception |
| | Recycle Bin & 10s Undo | Safely restore any accidentally deleted visit |

---

## 🛠️ Tech Stack & Architecture

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS 4
- **Storage:** Offline-first IndexedDB with persistent Outbox architecture
- **Security:** Web Crypto API (PBKDF2/SHA-256 PIN hashing), WebAuthn Biometrics
- **Reporting:** HTML5 Canvas (high-DPI 2x image rendering), jsPDF & AutoTable
- **Quality:** 99 Automated Unit Tests (`tsx --test`), strict TypeScript typing (`tsc --noEmit`)

---

<div align="center">

### 💙 Dedication & Credits

**Made with respect by Dr. Munabbir, for the BDS Doctors in Bangladesh.**

*হিসাব রাখুন নির্ভুল ও ঝামেলামুক্ত, মন দিন উন্নত চিকিৎসায়।* 🦷

[🚀 Launch HishApp Now](https://hishapp1.web.app/)

</div>
