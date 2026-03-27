**v1.4.1 — Reliability & Export Precision (Production Ready)**

This release hardens the project for production deployment by resolving critical export formatting and interest-recalculation bugs.

- **XLSX Financial Formatting**: Corrected the ledger column types for Debit, Credit, Interest, and Balance. By passing raw numbers instead of strings, native Excel formulas and "Auto-Sum" are now fully functional.
- **Bulk CSV ZIP Bundling**: Integrated `jszip` to bundle multiple member ledgers into a single ZIP file for bulk exports. This completely resolves browser-side download blocking for large portfolios.
- **Zero-Interest Settlement Control**: Updated the interest detection logic to recognize ₹0 entries (e.g., COVID-19 waived months) as settled. This eliminates "Duplicate Zero Rows" during interest regeneration.
- **Regression Logic Hardening**: Expanded the test suite in `loanMath.test.ts` to cover zero-interest settlement and chronological running balances.

---

**v1.4.0 — Audit Hardening & Precision Recovery**

This release focuses on long-term maintainability, logic consolidation, and audit-ready data persistence.

- **Centralized Financial Logic**: 100% of principal math and transaction labeling is now unified into `utils/loanMath.ts`. This eliminates inconsistent calculations ("repeated bugs") across UI components and reports.
- **Prorate Persistence (Snapshots)**: Implemented an automated safety mechanism in `FinancialContext` that snapshots manual "Prorated Day" date overrides to `app_settings` before any interest wipe or cleanup. 
- **Bulk XLSX Multi-Sheet Export**: Added "Download All Ledgers" to the Special Loans tab, enabling a single-click full-portfolio backup in a professionally formatted multi-sheet Excel workbook.
- **Mixed-Repayment Cleansing**: Hardened the interest-wipe logic to intelligently preserve principal payments and late fees while cleaning stale interest-only rows.
- **Database Validation Triggers**: Integrated PL/pgSQL triggers to enforce chronological data entry, rejecting any loan events that pre-date the original loan start.
- **Schema Update**: Added `prorate_override_dates` (JSONB) to `app_settings`.

---

**v1.3.1 — Dependency Hardening & Security Patch**

This release focuses on enterprise-grade security and build toolchain modernization.

- **Zero-Vulnerability Audit**: Resolved 13 vulnerabilities (5 High, 8 Moderate) identified during the pre-deployment audit.
- **Security Overrides**: Implemented `npm overrides` to force-patch transitive dependencies for `picomatch` (ReDoS), `serialize-javascript` (RCE), `brace-expansion`, and `minimatch`.
- **Toolchain Modernization**: Updated `vite`, `vite-plugin-pwa`, and `workbox` to resolve legacy deprecation warnings (`glob`, `sourcemap-codec`).
- **Clean Build Logs**: Eliminated all build-time security warnings to satisfy strict financial systems auditing.

---

**v1.3.0 — Global Interest Waiver Periods**

This release adds the ability to waive interest for specific month ranges across all loans, designed for scenarios like COVID-19 relief.

- **Configurable Waiver Ranges**: Operators can define one or more waiver periods in Settings using From/To Month+Year selectors. Each range has a descriptive label (e.g., "COVID-19 Relief").
- **Zero-Interest Auto-Generation**: The interest engine now emits ₹0 interest records for waived months (instead of skipping them), ensuring they appear in the Audit Ledger with full traceability.
- **Audit Narration**: Waived months are narrated as `Interest Waived (April 2020)` in both the UI ledger and CSV exports.
- **Global Scope**: Waivers apply to ALL loans automatically—no per-loan configuration needed.
- **Schema Update**: Added `interest_waiver_periods` (JSONB) to `app_settings`.

---

**v1.2.2 — Audit Ledger Narration Fix**

This patch ensures that historical interest rates are accurately reflected in audit narrations, synchronizing the ledger with the Global Interest Rate Schedule.

- **Dynamic Historical Rate Narration**: Interest records in the CSV export now dynamically display the correct historical rate based on the target interest period (e.g., `@2%` pre-Oct 2015, `@1.5%` post-Oct 2015).
- **Refined Top-up Narration**: Top-up entries now follow a consistent `Top-up N (@Rate%)` format, including chronological sequence numbers and historically accurate rates.
- **Improved Math Synchronization**: Updated `buildLoanLedger` to calculate and store authoritative historical rates for every transaction row, Ensuring perfect alignment between the UI ledger and the CSV export.

---

**v1.2.1 — Special Loans Integrity & Audit Maintenance**

This release focuses on data integrity, audit-ready reporting, and advanced repayment management.

- **Advanced Repayment Editing**: Expanded the Audit Ledger to support full editing of ANY repayment transaction. Operators can now adjust transaction dates, principal/interest breakdowns, and interest periods (Month/Year) with a single click.
- **Member ID Integrity Lock**: Implemented a safeguard in the Members module that disables Member ID editing for any member with active or historical loans. This prevents "Unknown Member" states and preserves the integrity of the audit trail.
- **Chronological Audit Narration**: Re-engineered the Special Loan CSV export to feature detailed, numbered narrations (e.g., "Payment 1", "Interest @1.5% (Jan 2026)") for superior audit traceability.
- **Search Engine Enhancements**: Integrated phone number search into the Special Loans tab and hardened Member ID lookups across the system.
- **Misspelling Fix**: Corrected "Intrest" to "Interest" in Audit Ledger headers.

---

**v1.2.0 — Special Loans Audit & Maintenance (Final)**

This version completes the Special Loans module with high-fidelity audit reporting and global maintenance tools.

- **Audit-Ready CSV Ledger**: Re-engineered the Special Loan ledger export to match auditor requirements. Columns: `Sl.No`, `Date`, `CalcType`, `Days`, `Vch Type`, `Debit`, `Credit`, `Interest`, `Balance`, `Narration`.
- **Global "Zap" Reconciliation**: Added a portfolio-wide "Zap Missing Interest" tool in the Special Loans tab. This feature performs a "Wipe & Regenerate" workflow—cleaning stale/invalid interest records and then automatically filling all gaps in the financial timeline.
- **Member ID Visibility**: Added a dedicated Member ID column to the Special Loans table and optimized the search engine to support case-insensitive Member ID lookups.
- **Build & Integrity Hardening**: Resolved structural JSX issues and TypeScript errors in the Special Loans module to ensure a clean, production-ready build.

---

**v1.1.9 — Global Cutoff Governance**

This release implements a hard boundary for interest auto-generation, ensuring that no records are created past a user-defined date.

- **Global Interest Cutoff Date**: A new system setting that allows operators to define a hard boundary for interest auto-generation (e.g., "Stop all generation at 31-01-2026").
- **Unified Logic**: The cutoff is respected by both the "Global Zap" (mass-import) tool and individual per-loan auto-generation modals.
- **Form Integration**: Added the "Global Interest Cutoff Date" input to the Settings tab with full persistence to Supabase.
- **Schema Update**: Added `global_cutoff_date` (DATE) to `app_settings`.

---

**v1.1.8 — Global Interest Alignment & Batch Processing**

This release introduces a powerful "Global Auto-Generate Interest" feature to streamline the final step of legacy data migration.

- **Global Interest Alignment**: A new "Zap All Missing Interest Periods" tool has been added to the Legacy Importer's success screen. It automatically scans all active loans for chronological gaps and fills them in one click, ensuring the entire portfolio is audit-ready immediately after a bulk import.
- **High-Safety Batch Processing**: To prevent database timeouts and ensure stability, the global generator processes records in secure batches of 50. This allows the system to effortlessly handle thousands of years of missing interest across hundreds of members.
- **Real-Time Progress Tracking**: Added a new progress architecture that provides live UI feedback (percentage and status labels) during both the analysis and insertion phases of the auto-generation process.
- **Vite Build Optimization**: Consolidated static and dynamic imports for `loanMath.ts` to resolve build-time warnings and ensure efficient bundle chunking for Cloudflare/Vite deployments.
- **No Database Schema Changes**: This is a frontend logic and API orchestration enhancement.

---

**v1.1.7 — Pagination & Ledger UI Enhancements**

This release fixes a critical data truncation bug caused by API limits and introduces a cleaner, tabbed layout for the Special Loans Audit Ledger modal.

- **Supabase 1000-Row Pagination Fix**: Upgraded the data-fetching architecture in `FinancialContext.tsx` to automatically paginate through Supabase limits, ensuring that massive datasets (like auto-generated historical interest spanning decades) are fully loaded into the ledger without silent truncation.
- **Audit Ledger Separation (Tabs)**: The Special Loans eye-icon modal now features two tabs. "Transaction Summary" provides a clean, simplified data table with 5 high-level metric cards, while "Audit Ledger" houses the traditional, complex period-by-period computational logic.
- **Member ID Search & Sort**: Added the ability to search by Member ID inside the Special Loans tab, along with new `Member ID (Asc)` and `Member ID (Desc)` dropdown sorting options.
- **No Database Schema Changes**: This is a pure frontend UI and API query fix.

---

**v1.1.6 — Principal Calculation Fixes**

- **Start Month Interest Calculation Fix**: Fixed `getChargeableInterestPeriods` to skip the first partial month when calculating chargeable interest periods. For loans disbursed mid-month (e.g., November 10), the system now correctly starts charging interest from the following full month.
- **Principal Repaid Fallback Fix**: Fixed the "Principal Repaid" summary calculation to use the fallback formula (amount - interestPaid) when explicit principalPaid is missing. This ensures legacy imported data correctly reflects principal reductions even when the import didn't populate the principalPaid field.
- **No Database Schema Changes**: This is purely a frontend calculation fix.

---

**v1.1.5 — Interest Generation & TypeScript Fixes**

This release fixes a TypeScript type error and improves the interest auto-generation logic to correctly handle loans with zero-balance gaps before top-ups.

- **TypeScript Property Fix**: Corrected `loan_id` → `loanId` in loanMath.ts to match the LoanRepayment type definition, fixing the "Property 'loan_id' does not exist" error.
- **Zero-Balance Gap Fix**: Fixed interest auto-generation to properly calculate periods from loan start date, only skipping actual zero-balance periods before top-ups. Previously, the code incorrectly skipped ALL periods before a top-up, causing missing interest for loans that had principal payments before the top-up.
- **Duplicate Record Prevention**: The auto-generator now correctly identifies the full interest period range. Manual cleanup of existing duplicate records may be required via SQL.
- **No Database Schema Changes**: This is purely a frontend calculation fix.

---

**v1.1.4 — Ledger Display & Import Integrity**

This release fixes a display bug in the loan ledger that caused principal/top-up mismatch confusion after importing legacy data, and improves the Auto-Generate Interest engine to resume after Top-ups.

- **TOP-UP Principal Display Fix**: The loan ledger now correctly displays principal amounts for TOP-UP entries in both the transaction rows and ledger totals. Previously, TOP-UP rows showed "—" for principal, making it appear that only the original disbursal was counted.
- **Ledger Totals Accuracy**: The "Ledger Totals (Filtered)" footer now explicitly includes TOP-UP amounts in the principal calculation, ensuring the totals correctly reflect `Original Principal + Top-ups - Principal Repayments`.
- **Auto-Generate Interest Resume Fix**: The interest auto-generator now correctly identifies the first Top-up date for active loans and starts generating interest from that point, even if there was a zero-balance gap between the original loan and the Top-up. This ensures complete interest coverage for legacy ledgers with interrupted repayment histories.
- **No Database Changes**: This is purely a frontend display and calculation fix - no SQL migration required.

---

**v1.1.3 — Sequence & Integrity Hardening**

This release fixes critical data-integrity gaps in the Legacy Data Importer and ledger visibility.

- **Sequential Import Fix**: The Importer now correctly tracks newly created loans during a bulk paste, ensuring that subsequent repayments and Top-ups in the same batch link to the correct loan. This resolves the "Wrong Balance" issue for imported data.
- **Ledger Visibility Normalization**: Hardened the ledger builder to use string-normalized ID matching. This ensures that all interest records are 100% visible even if there's an ID type mismatch (UUID vs String).
- **Persistence UI Polish**: Explicitly resets the "Processing" state after the success alert is dismissed.

---

**v1.1.2 — High-Fidelity Historical Accrual**

This stabilization release resolves interest gaps in multi-cycle legacy loans and first-month accrual.

- **Gap Bridging**: The engine now correctly "jumps" over zero-balance periods and resumes interest accrual the moment a Top-up is detected.
- **First-Month Inclusion**: Fixed a logic bug where the first month of a loan was skipped.
- **Improved Success Feedback**: Added explicit record counts to the Auto-Gen modal.

---

**v1.1.1 — Principal Overflow & Persistence Fix**
