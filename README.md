# Legacy Loan Tracker
Digitize and audit historical handwritten loan records starting from 2012 with absolute precision. This specialized tool focuses exclusively on **Special Loans** (Interest-only, with multiple top-ups and flexible repayments).

> [!NOTE]
> All "Regular Savings" (Podhupu) features have been removed to simplify the user experience for historical record keeping.

## 🌟 Key Features

*   **Dynamic Principal Tracking:** Outstanding balances are calculated on-the-fly based on original principal + top-ups - principal repayments.
*   **Manual Interest Proration:** Supports overwriting standard monthly interest amounts to account for 15-day or 20-day partial borrowing periods.
*   **Exact-Day Interest Assistant:** The repayment modal can now calculate prorated interest for exact held-day counts and preserve that basis on the repayment entry for audit review.
*   **Historical Interest Override:** Existing interest rows can be reopened from the audit ledger and changed from monthly interest to exact-day interest without deleting the repayment record.
*   **Interest-Period Aware Ledger:** Interest collections are now allocated to an explicit settlement month/year, so back-dated entries, arrears, and principal-only recoveries no longer corrupt monthly status.
*   **No Auto-Late Fees:** Designed to perfectly match historical handwritten books, the system will never auto-calculate late fees. Late fees are only recorded if explicitly provided by the operator.
*   **Chronological Audit Trail:** Dedicated views to track every disbursement and repayment event historically.
*   **Top-up Loan Editing:** Existing top-up records can now be edited directly from the Special Loan Audit Ledger, ensuring historical record accuracy.
*   **Audit Ledger Sorting:** Operators can sort transactions by Date or Amount (Ascending/Descending) for easier reconciliation.
*   **Live Ledger Summary & Export:** The Special Loan Audit Ledger now shows live `Interest Paid` totals and supports direct ledger CSV download from the eye-view modal.
*   **Full Mobile Responsiveness:** Application is now optimized for mobile viewing with horizontally scrollable tables and adaptive metric grids.
*   **Ledger Column Totals:** The audit ledger now features a footer that automatically sums visible "Amount", "Principal", and "Interest" columns.
*   **Closed Loan Correction Workflow:** Editing a historical loan amount can now surface any remaining principal gap and optionally record the balancing principal payment immediately.
*   **Legacy Member ID Correction:** Member IDs can now be corrected from the Members edit screen while automatically remapping linked borrower and surety references.
*   **Legacy Data Importer:** Paste multiple rows directly from Excel/Google Sheets to auto-generate member profiles, loans, top-ups, and repayments with a dry-run preview.
*   **Dynamic Interest Rate Schedule:** Define historical or future rate overrides in Settings that apply automatically during data entry.
*   **Safe Loan Closure Validation:** A loan can only be closed when the selected close date has zero outstanding principal and no later principal-affecting activity.
*   **Audit Report Principal Breakdown:** The Audit Report now shows `Original Loan Disbursed` in the top cards, member balance table, and Full Audit CSV for cleaner reconciliation.
*   **Audit Report Table Cleanup:** The member balance table now shows the original loan start date instead of a status badge so the visible columns stay calculation-focused.
*   **Auto-Interest Engine:** Single-click "Zap" button to backfill decades of historical interest records based on dynamically calculated principal balances.
*   **Admin-Only Audit Log Tab:** Database write-history now lives in its own `Audit Log History` tab and is visible only to admins.
*   **Reduced Scope UI:** The application is laser-focused on `Special Loans`, `Members`, `Audit Report`, `Audit Log History` (admin only), and `Settings`. No distracting dashboards or bank-sync features.
*   **Separate Backend Scripts:** Schema setup and sample data are now split into separate SQL Editor scripts.

## 🚀 Quick Start

### 1. Prerequisites
*   Node.js (v18+)
*   A [Supabase](https://supabase.com/) project to host the PostgreSQL database.

### 2. Installation
Clone the repository and install dependencies:
```bash
npm install
```

### 3. Environment Configuration
Copy the sample environment file and add your Supabase credentials:
```bash
cp .env.example .env
```
Open `.env` and fill in:
*   `VITE_SUPABASE_URL`
*   `VITE_SUPABASE_ANON_KEY`

### 4. Run the Development Server
```bash
npm run dev
```
Navigate to `http://localhost:5173`. The default operator login code is managed within your Supabase `app_settings` table.
The navigation is intentionally limited to `Special Loans`, `Members`, `Audit Report`, and `Settings`, with `Audit Log History` visible only to admins.

---

## 🛠️ Tech Stack
*   **Framework:** React 19
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS + Lucide React Icons
*   **Build Tool:** Vite 6
*   **Database & Auth:** Supabase (Client-side)

## 🐛 Troubleshooting Common Issues

### 1. IDE Errors (VS Code / WSL)
If your IDE reports TypeScript errors like `Cannot find module 'react'` even though builds succeed:
- Open VS Code Command Palette (`Ctrl + Shift + P`).
- Search for and execute **"TypeScript: Restart TS server"**.

### 2. Blank UI Post-Deployment
If the UI is blank after building:
- Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` were present in your environment **during** `npm run build`.
- Check the browser console. The app is designed to log initialization errors rather than crashing.
- **WSL Route Issues**: The app uses relative pathing (`./`). If you are serving from a path, ensure your server is configured to resolve assets relatively.

## 📄 Documentation
For detailed business logic and architectural decisions, refer to the [Product Requirements Document (PRD.md)](./PRD.md).

## 🗄️ Database Setup & Security

The application requires a specific schema and security configuration to function with Supabase.

1.  Open your [Supabase Dashboard](https://supabase.com/dashboard).
2.  Navigate to the **SQL Editor**.
3.  If you want a full wipe, run `sql/reset-all.sql` first.
4.  Run `migration.sql` for schema setup.
5.  Run `sql/sample-ajay-add.sql` only when you want sample data for Ajay and Srikanth.
6.  Run `sql/sample-ajay-remove.sql` whenever you want to remove the sample rows.

### Do You Need To Run SQL Again?
- **Yes, if your database was created before the latest ledger hardening update, rerun `migration.sql`.**
- `migration.sql` now adds new repayment allocation columns, audit-log compatibility columns, repayment validation constraints, and date-validation triggers.
- The latest migration also adds `loan_repayments.interest_days` and `loan_repayments.interest_calculation_type` for exact-day interest auditability.
- **Rerun `migration.sql` once more on existing deployments** if you want direct backend updates to `members.id` to work without foreign-key errors.
- **Important Deployment Step**: Run `sql/interest_rules_migration.sql` in your Supabase SQL Editor. This adds the `interest_rate_rules` and `entry_type` columns and initializes the legacy 2012-2015 rules.
- **Auto-Gen Logic Hardening**: Fixed the "sticky rate" bug in `getEffectiveLoanRate`, added ISO date normalization in `interest.ts`, and implemented **Interest Resume Logic** (detecting activity on closed loans) + **Principal Fallback Logic** (correctly detecting zero-balance gaps in v1.1.1).
- **Liveness Fix**: Replaced the invalid `HEAD /rest/v1` probe with an authenticated table-level `GET` ping to silence misleading `401 Unauthorized` alarms.

### 🛡️ Financial Systems Audit Checklist

For Senior Auditors, verify these controls in the application:
- [x] **Principal Integrity**: Sum of `Original Principal + Top-ups - Principal Recoveries` matches live outstanding.
- [x] **Interest Determinism**: Monthly dues match either the `loan.interestRate` OR a matching `interest_rate_rules` entry for that date.
- [x] **Allocation Separation**: `interestPaid` is tracked separately from `principalPaid` to prevent amortized balance corruption.
- [x] **Zero-Balance Cutoff**: No interest is generated for periods where principal is ≤ 1.00 INR (rounding tolerance).
- [x] **Immutable Repayment Basis**: Exact-day interest rows preserve their specific `interestDays` and `interestCalculationType` even if global rules change later.
- [x] **Event-Driven Running Balance**: Every transaction generates a new `balanceAfter` based on deterministic chronological event ordering.

If you want to verify that your database is already on the required schema, these objects must exist:

- `loan_repayments.interest_for_month`
- `loan_repayments.interest_for_year`
- `loan_repayments.interest_days`
- `loan_repayments.interest_calculation_type`
- `audit_logs.performed_by`
- `audit_logs.record_id`
- `audit_logs.details`
- `app_settings.interest_rate_rules`

If you also need direct manual SQL edits of `members.id`, the `loans_member_id_fkey`, `loans_surety1_id_fkey`, and `loans_surety2_id_fkey` constraints should include `ON UPDATE CASCADE`.

### Full Reset

If you want to delete every application table and recreate the database from scratch:

1. Run `sql/reset-all.sql`
2. Run `migration.sql`
3. Optionally run `sql/sample-ajay-add.sql`

This will remove all current members, loans, repayments, top-ups, settings, and audit logs.

**What this script does:**
- **Recreates Active Tables**: Sets up `members`, `loans`, `loan_repayments`, `loan_topups`, `app_settings`, and `audit_logs`.
- **Upgrades Existing Tables**: Adds `loan_repayments.interest_for_month`, `loan_repayments.interest_for_year`, and new `audit_logs` compatibility columns if they are missing.
- **Removes Dead Schema**: Drops the unused `payments` table so the database matches the actual app surface.
- **Adds Integrity Guards**: Enforces non-negative repayment values, `amount = principal + interest`, valid interest-period ranges, and blocks loan events before the base loan date.
- **Enables Security**: Activates Row Level Security (RLS) to remove the "UNRESTRICTED" warning.
- **Grants Access**: Adds policies to allow your web app (via the `anon` key) to read and write data.
- **Idempotency**: Safe to run multiple times; it will only add missing pieces.

### Existing Deployment Upgrade

If you already have live ledger data:

1. Run `migration.sql` in the Supabase SQL Editor.
2. Confirm that only these public tables remain for the app: `members`, `loans`, `loan_topups`, `loan_repayments`, `app_settings`, `audit_logs`.
3. Refresh the app so the frontend starts using the new repayment-period fields.
4. Run `npm test` and `npm run build` locally if you maintain a custom deployment pipeline.

You do **not** need any separate ad-hoc SQL patch if your existing data already satisfies:

- `loan_repayments.amount = principal_paid + interest_paid`
- `loan_repayments.amount >= 0`
- `loan_repayments.interest_paid >= 0`
- `loan_repayments.principal_paid >= 0`
- `loan_repayments.late_fee >= 0`
- no `loan_topups.date` or `loan_repayments.date` earlier than the parent `loans.start_date`

If your legacy database contains rows that violate those rules, `migration.sql` can fail while adding the new constraints. In that case, correct the offending legacy rows first, then rerun `migration.sql`.

Optional diagnostic queries for existing data:

```sql
-- Repayments where total amount does not equal principal + interest
SELECT id, loan_id, date, amount, principal_paid, interest_paid
FROM loan_repayments
WHERE COALESCE(amount, 0) <> COALESCE(principal_paid, 0) + COALESCE(interest_paid, 0);

-- Repayments with negative values
SELECT id, loan_id, date, amount, principal_paid, interest_paid, late_fee
FROM loan_repayments
WHERE COALESCE(amount, 0) < 0
   OR COALESCE(principal_paid, 0) < 0
   OR COALESCE(interest_paid, 0) < 0
   OR COALESCE(late_fee, 0) < 0;

-- Loan events earlier than the parent loan start date
SELECT l.id AS loan_id, l.start_date, r.id AS repayment_id, r.date AS repayment_date
FROM loans l
JOIN loan_repayments r ON r.loan_id = l.id
WHERE r.date < l.start_date
UNION ALL
SELECT l.id AS loan_id, l.start_date, t.id AS topup_id, t.date AS topup_date
FROM loans l
JOIN loan_topups t ON t.loan_id = l.id
WHERE t.date < l.start_date;
```

### Sample Data Cleanup Queries

If sample data was already inserted and you want to remove it before entering real handwritten records, run `sql/sample-ajay-remove.sql`, or paste:

```sql
DELETE FROM loan_repayments WHERE id LIKE 'sample_srikanth_%';
DELETE FROM loan_topups WHERE id LIKE 'sample_srikanth_%';
DELETE FROM loans WHERE id LIKE 'sample_srikanth_%';
DELETE FROM members WHERE id = 'sample_srikanth';
DELETE FROM loan_repayments WHERE id LIKE 'sample_ajay_%';
DELETE FROM loan_topups WHERE id LIKE 'sample_ajay_%';
DELETE FROM loans WHERE id LIKE 'sample_ajay_%';
DELETE FROM members WHERE id = 'sample_ajay';
```

### Latest Changes

*   **Start Month Interest Calculation Fix**: Fixed `getChargeableInterestPeriods` to skip the first partial month when calculating chargeable interest periods. For loans disbursed mid-month (e.g., November 10), the system now correctly starts charging interest from the following full month (December), rather than attempting to charge full month's interest for a partial month. This aligns with standard interest-in-arrears accounting.

*   **Ledger Hardening Update**: Added a shared event-driven calculation engine to keep monthly dues, arrears detection, running balances, auto-generation, and reporting on the same rule set.
*   **Explicit Interest Settlement Periods**: Repayment rows can now store `interest_for_month` and `interest_for_year`, allowing operators to record “December interest paid in January” without distorting ledger history.
*   **Principal-Only Repayment Fix**: Principal recoveries no longer mark a month as “interest collected”, which fixes a major historical-entry bug for voluntary part-payments.
*   **Arrears Split Fix**: Backlog interest is now allocated to the correct historical months instead of back-dating artificial cash movements or generating negative current-month rows.
*   **Collection-Date Driven Interest Preview**: The repayment modal now recalculates arrears and current-period interest from the entered collection date itself, fixing back-dated entries such as `10-03-2013` needing `Feb 2013 + Mar 2013`.
*   **Prorated Day-Based Interest**: Operators can switch the current-period calculation to `Exact Days`, enter 15 or 20 days, and let the system calculate/store the prorated interest basis directly on the repayment row.
*   **Historical Interest Row Editing**: Existing interest repayments can now be edited in place from the ledger, preserving audit history while switching between `MONTHLY` and `PRORATED_DAYS`.
*   **Exact-Day Override Protection**: Auto-generation now identifies exact-day rows and avoids offering destructive wipe/regenerate paths that would overwrite manual overrides.
*   **Large History UX**: For long-running loans from 2012 onward, the repayment modal now shows a compact arrears summary with month count, date range, and total instead of rendering an unreadable month-by-month list.
*   **Running Balance Accuracy**: The Special Loan audit ledger now uses deterministic row-by-row balance progression instead of date-only balance reconstruction.
*   **Live Ledger Summary Cards**: The eye-view audit ledger cards now recompute `Top-Ups`, `Principal Repaid`, `Interest Paid`, and `Live Balance` from live transaction data so edits reflect immediately.
*   **Per-Ledger CSV Download**: Each Special Loan Audit Ledger modal now has a `Download Ledger` action that exports summary values and transaction rows for the selected member.
*   **Closed Loan Principal Correction Flow**: Editing a historical loan amount upward now exposes the remaining balance and can immediately post a balancing principal repayment before closing the loan again.
*   **Frontend Member ID Edit Flow**: The Members page now allows legacy member/account ID corrections directly from the edit modal and safely remaps linked borrower and surety references.
*   **Future-Activity Close Blocking**: Loan closure is now refused if later top-ups or principal recoveries exist after the requested close date, preventing premature closure on long-running legacy ledgers.
*   **Audit Report Original Disbursal View**: Added `Original Loan Disbursed` to the Audit Report summary cards, member balance table, and Full Audit CSV export for clearer balance math.
*   **Audit Report Start-Date Column**: Replaced the member status column in the balance table with the original loan start date to make the row-level calculation trail easier to read.
*   **Interest Wipe Safety**: “Wipe Interest” now preserves principal and mixed repayment rows instead of deleting them wholesale.
*   **Effective Rate Tracking**: Top-ups can now capture a monthly rate, and the latest effective rate is used in future interest calculations.
*   **Audit Log Compatibility Fix**: Frontend audit writes were aligned with the real Supabase `audit_logs` schema so audit inserts no longer silently fail due to column mismatches.
*   **Admin-Only Audit Log History**: Audit log browsing has been moved to a separate `Audit Log History` page and is now hidden and route-blocked for operator/viewer roles.
*   **Schema Integrity Guards**: Added database checks and triggers to reject negative repayment values, invalid interest period metadata, loan events before loan start, and start-date edits after later transactions exist.
*   **Admin-Only Settings Mutations**: Non-admin users are now blocked from changing system settings and access codes through the UI.
*   **Regression Coverage**: Added `npm test` with deterministic loan-math scenarios covering top-ups, partial principal repayments, arrears allocation, and running balances.
*   **Live Refresh Without Manual Reloads**: Member, loan, repayment, top-up, and settings data now refetch and subscribe in real time so CRUD and backend changes appear immediately.
*   **Restored Members Tab**: Re-added the Members page to the UI for better member tracking and updates.
*   **Improved Type Safety**: Fixed `AuditAction` enum mismatches in the frontend.
*   **IDE Resolution Fixes**: Added explicit file extensions to lazy-loaded imports in `App.tsx` for better IDE path resolution.
*   **SQL Security**: Verified and updated RLS policies in `migration.sql` to resolve "UNRESTRICTED" warnings.
*   **Member Details Profile**: Added a comprehensive profile view for members, showing total outstanding, top-ups, and interest collected at a glance.
*   **Quick Date Selection**: Implemented direct Year and Month dropdowns in the Special Loans tab for significantly faster historical record navigation.
*   **Audit Report Consistency**: Refactored filtering logic to ensure that UI cards and CSV exports (Tally/Full Audit) are always in sync, even when search filters are applied.
*   **Auto-Generate Interest Module**: Added a powerful utility to backfill historical legacy ledgers by dynamically generating accurate monthly interest payments with a single click.
*   **Auto-Generate Edge-Cases**: Hardened the auto-generator to correctly calculate liability across months containing partial principal recoveries, elegantly handle legacy closed loans, format output dates to the end-of-month, and automatically repair manual SQL entries missing principal data.
*   **Zero-Balance Gap Handling**: Fixed auto-generation to correctly calculate interest from loan start date, only skipping actual zero-balance periods. This ensures complete interest coverage for legacy loans with interrupted repayment histories.
*   **Auto-Gen Closure / Zero-Balance Cleanup**: Auto-generation now stops at the earlier of today, the loan close date, or the sustained zero-balance date. If the final valid period ends mid-month, the generated interest is dated on the actual close/payoff date, and stale interest rows after that cutoff are cleaned automatically.
*   **Closed-Loan Repair Access**: The same Auto-Gen modal is now available on closed loans so historical stale interest rows can be repaired without SQL intervention.
*   **Robust Date Parsing**: Upgraded internal date utilities to support diverse formats like `10/06/2017` and `10-06-2017`, preventing data parsing failures on legacy handwritten records.
*   **High-Precision Calculation Engine**: Hardened the interest logic with UTC-safe date comparisons and "zero-balance" guards to ensure 100% accuracy on historical ledgers.
*   **Balance Audit Column**: Added a real-time "Running Balance" column to the loan ledger for row-by-row verification of principal reductions.
*   **Auto-Gen Stability**: Resolved reported crashes (`React Error #321` and `Invalid Date 2018-00-31`) and refactored the generator for instant UI updates.
*   **Auto-Gen Stability**: Resolved a critical "React Error #321" in the interest generator and refactored it for better performance and real-time UI updates after data wipes.
*   **Interest Resume Logic**: Fortified the generator to ignore stale `endDate` (Close Date) values if a loan status is `ACTIVE`. This allows interest to successfully resume after a Top-up even if the loan was previously marked as finished in the legacy books.
*   **Automatic Re-activation**: The system now detects activity (like Top-ups) on closed/zero-balance loans and automatically clears the `endDate` and resets status to `ACTIVE` to ensure continuous audit accuracy.
*   **Precision Interest Logic**: Validated the "zero-balance" logic, ensuring interest is only generated for months where an actual principal liability exists.
*   **Mobile Optimized UI**: Implemented horizontal scrolling for all wide tables and adaptive grid systems for financial metric cards.
*   **Multi-Select Ledger Filtering**: Redesigned the audit ledger filter to support multi-select transaction types with color-coded interactive chips for better financial tracking.
*   **Audit Ledger Sorting**: Added the ability to sort transaction rows by Date or Amount (Asc/Desc) directly from the audit ledger header.
*   **Top-up Record Editing**: Operators can now correct and update existing top-up records from the ledger without database manual intervention.
*   **Stability & Build Integrity**: Resolved persistent JSX/TSX syntax errors and TypeScript compilation issues, ensuring 100% build compatibility.


*   **TOP-UP Principal Display Fix**: The loan ledger now correctly displays principal amounts for TOP-UP entries instead of showing "—", making ledger reconciliation clearer after legacy data imports.
*   **Auto-Generate Interest Resume Fix**: Interest auto-generation now resumes from the first Top-up date for active loans, handling zero-balance gaps correctly.
*   **Ledger Totals Accuracy**: The ledger totals footer now explicitly counts TOP-UP amounts in principal calculations.
*   **Audit Reports**: Extended the Audit Tally and CSV exports to handle historical data from 2012.
