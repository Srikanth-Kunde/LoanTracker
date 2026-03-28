# LoanTracker Audit & Change History (v1.4.0 – v1.4.5)

This document serves as an exhaustive audit trail for all changes performed during the **Production Hardening Phase** (March 24 – March 28, 2026). As a Financial Systems Auditor, this log ensures transparency of all architectural and security decisions.

---

## 📅 March 28, 2026: v1.4.6 (Beautification & Universal Exports)

### **1. Universal Report Customization**
- **Action**: Injected an `ExportModal` capable of handling dynamic array restructuring across single, bulk, and portfolio reports.
- **Rationale**: Auditors required the ability to exclude technical columns (like `Days` or `CalcType`) to preserve horizontal layout space on custom print-outs.
- **Fail-safe**: Form validation ensures users cannot execute an export when 0 columns are selected, avoiding crash conditions.

### **2. Platinum Styling Engine**
- **Action**: Converted the `downloadMultiSheetXLSX` engine from basic SheetJS to `ExcelJS`.
- **UI UX Impact**: Applied `animate-in` fades to the main application body and extended the bottom scroll clearance (`pb-32`) explicitly for narrow mobile viewport accessibility.
- **Action**: Augmented the PDF generator to explicitly imprint **Member Name & ID** diagonally opposite the page numbers, firmly binding floating metadata during physical audits.

---

## 📅 March 28, 2026: v1.4.4 & v1.4.5 (Final Polish & Defense-In-Depth)

### **1. Security Hardening (Defense-in-Depth)**
- **Architectural Shift**: Implemented component-level role verification *inside* the execution logic of all destructive functions (`handleDelete`, `handleWipeInterest`, `handlePreClose`).
- **Rationale**: Even if UI buttons are "unhidden" via DOM manipulation, the underlying business logic now strictly rejects non-Admin requests.
- **Affected Components**: `SpecialLoans.tsx`, `Members.tsx`, `Settings.tsx`, `ImportData.tsx`.

### **2. PDF Premium Reporting Engine**
- **Refinement**: Overhauled the PDF rendering logic to use a professional 3-column metadata grid.
- **Aesthetics**: Added zebra-striping to all audit tables, professional "Audit Blue" headers, and dynamic society branding.
- **Compliance**: Added automatic page numbering ("Page X of Y") for all ledger reports to prevent data omission during physical audits.

---

## 📅 March 27, 2026: v1.4.3 (Production Hardening & Standardization)

### **1. Reporting Standardization**
- **Action**: Unified all financial ledgers (Audit Report UI, XLSX Export, PDF Export, and Member-specific Views) to use the identical 10-column header set.
- **Headers**: `Sl.no`, `Member Name`, `ID`, `Start Date`, `Loan`, `Top-ups`, `Total Loan`, `Recovered`, `Interest`, `Outstanding Principal`.

### **2. Security Guarding**
- **Action**: Implemented route-level guards in `App.tsx` for `Settings`, `Import`, and `AuditLog`.
- **Secondary Defense**: Added "Restricted Access" fallback UI for non-Admins trying to access these components directly.

---

## 📅 March 25-26, 2026: v1.4.1 – v1.4.2 (Arithmetic Stability)

### **1. Principal & Interest Sync**
- **Action**: Refactored `Total Loan` calculation to always be `Original + Top-ups` across all ledger views.
- **Rationale**: Prevented confusion where "Total Loan" sometimes included interest accruals in legacy views.

### **2. Zero-Balance Interest Logic**
- **Bug Fix**: Resolved an issue where the Auto-Gen engine stopped generating interest for zero-principal-balance periods (e.g., when a loan was fully paid but required historical interest records for the audit trail).

---

## 📅 March 24, 2026: v1.4.0 (The Hardening Foundation)

### **1. Historical Interest Engine**
- **Innovation**: Introduced the `generateMissingInterest` engine to bridge historical gaps between 2012 and 2026.
- **Precision**: Enforced a manual "Month" override system allowing admins to correct individual interest records without affecting principal history.

---

## 🔐 Compliance Statement
All changes recorded here have been verified against **Supabase RLS Policies** and **TypeScript Strict Mode** to ensure a zero-defect production deployment.
