# Legacy Loan Tracker - PRD
## Product Overview
Legacy Loan Tracker is a dedicated tool for digitizing and auditing historical handwritten loan records (2012-Present).

---

### 1. Overview & Objective
A dedicated digital ledger designed to digitize and audit handwritten loan records dating back to 2012. This system follows the specific group dynamic where members take multiple interest-only loans, perform frequent principal top-ups, and make partial repayments. **Regular Savings (Podhupu) features are explicitly excluded** to prioritize loan auditing accuracy.

### 2. Core Principles & Philosophy
*   **Manual Override is King**: The physical ledger contains many exceptions (e.g., waived late fees, prorated interest). The system must never auto-enforce strict calculations that prevent the operator from matching the physical book.
*   **Top-Ups over New Loans**: Rather than creating a new loan ID every time a member borrows more, the system must allow "Top-Ups" to a single active loan, dynamically adjusting the outstanding principal.
*   **Interest-Only Default**: Members typically pay only the monthly interest. Principal repayments are optional and serve to lower the outstanding balance (and future interest).

---

### 3. Core Features & Use Cases

#### 3.1. Special Loan Creation
*   Record new Special Loans with a Principal Amount, Monthly Interest Rate (%), and Start Date.
*   *Rule*: If a loan is taken in February, the first interest collection is due starting from March.

#### 3.2. Loan Top-Ups
*   Members with an active Special Loan can request additional funds.
*   Operators can record a "Top-Up" (Amount, Date) against the existing loan.
*   *Dynamic Balance*: `Outstanding Principal = Original Principal + Sum of Top-Ups - Sum of Principal Repayments`.

#### 3.3. Interest Collection & Proration
*   The system suggests the standard monthly interest (`Outstanding Principal * Interest Rate`).
*   **Crucial Override**: Operators can manually overwrite the suggested interest amount. This allows recording prorated interest when a member only took the loan for 15 or 20 days.
*   **Exact-Day Mode**: The system should allow operators to switch the current-period calculation to an exact day-count basis, store the day count used, and preserve whether the entry was `MONTHLY` or `PRORATED_DAYS` for later audit review.
*   **Existing-Month Interest Override**: Previously recorded interest rows must remain editable month-by-month so operators can convert a historical monthly charge into an exact-day figure without deleting the repayment row.
*   **Explicit Settlement Period**: The system must support recording an interest payment against the month it settles, even when the cash is physically collected in a later month.

#### 3.4. Principal Repayment
*   During interest collection (or independently), members can pay down a portion of the principal.
*   This instantly reduces the `Outstanding Principal` for the following month's interest calculation.
*   **Critical Rule**: A principal-only repayment must never mark a month as interest-settled.
*   **Corrected Principal Delta Recovery**: If a closed loan is later corrected to a higher original principal, the edit workflow must expose the remaining principal gap and allow the operator either to reopen the loan or to immediately record the balancing principal payment and re-close the loan.

#### 3.5. Late Fees (Strictly Manual)
*   **No Auto-Late Fees**: The system will *not* automatically generate or demand late fees, especially for back-dated entries.
*   Late fees are recorded *only* if explicitly entered by the Operator during a repayment collection.

#### 3.6. Audit & Reporting
*   A clean audit workspace to review total capital deployed and interest collected across all legacy records.
*   A comprehensive Audit Report tracking every principal disbursement and collection chronologically.
*   Audit review must support all-time history from 2012 onward.
*   The Audit Report summary cards and member-balance table must display `Original Loan Disbursed` separately from top-ups so operators can visually reconcile `Original Principal + Top-Ups - Principal Recovered = Outstanding`.
*   The member-balance table should prioritize calculation fields over profile-state fields, replacing status badges with the original loan start/disbursal date when space is limited.
*   The audit ledger must expose a deterministic row-by-row running principal balance, even when multiple events occur on the same date.
*   The Special Loan Audit Ledger must show live summary cards for original principal, top-ups, principal repaid, interest paid, and live balance.
*   **Web & Mobile Compatibility**: All financial tables must be horizontally scrollable on small screens using `overflow-x-auto`. Metric grids must adapt to single or double-column layouts on mobile viewports.
*   **Integrated Search & Filter**: The audit ledger modal must provide real-time search (by notes/period) and transaction-type filtering.
*   **Audit Ledger Sorting**: Operators can sort transactions by Date or Amount (Ascending/Descending) for easier reconciliation.
*   **Top-up Recording Edit**: Existing top-up records can be edited directly from the audit ledger to correct historical entry errors.
*   **Live Ledger Summary & Export:** The Special Loan Audit Ledger now shows live `Interest Paid` totals and supports direct ledger CSV download from the eye-view modal.
*   **Advanced Multi-Type Ledger Filtering:** Upgraded the audit ledger to support selecting multiple transaction types simultaneously (Disbursal, Top-up, Principal, Interest) using interactive toggle chips.
*   **Full Mobile Responsiveness:** Application is now optimized for mobile viewing with horizontally scrollable tables and adaptive metric grids.
*   **Ledger Column Totals:** The audit ledger now features a footer that automatically sums visible "Amount", "Principal", and "Interest" columns.
*   Database write-audit history must be exposed in a separate admin-only screen rather than being mixed into the financial summary report.

#### 3.7. Member Management
*   A centralized interface to manage the society's 40+ members.
*   Operators can create, update, and deactivate member profiles (Name, Phone, Address, Join Date).
*   *Rule*: Member IDs can be manual (to match legacy books) or auto-generated.
*   Operators must be able to correct a member's legacy member/account ID from the frontend without breaking linked loans or surety references.
*   A member ID correction must preserve dependent `loans.member_id`, `surety1_id`, and `surety2_id` relationships.


---

### 4. Technical Specifications & Architecture

#### Stack
*   **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide React icons.
*   **Build Tool**: Vite (ESNext target, React SWC).
*   **Database**: Supabase (PostgreSQL).

#### Database Schema Highlights
*   `loans`: Stores `member_id`, `principal_amount`, `interest_rate`, `status`, `loan_type`, `surety1_id`, `surety2_id`, `description`, `financial_year`, and `is_legacy`.
*   `loan_topups`: Links to a `loan_id`. Stores `amount`, `date`, `rate`, and notes. The latest effective top-up rate is used for future monthly interest calculations.
*   `loan_repayments`: Links to a `loan_id`. Stores total `amount` plus separated `principal_paid`, `interest_paid`, and `late_fee`.
*   `loan_repayments` also stores `interest_for_month` and `interest_for_year` so the operator can allocate an interest collection to the intended liability month.
*   `loan_repayments` also stores optional `interest_days` and `interest_calculation_type` metadata whenever a repayment is recorded on an exact-day basis.
*   `app_settings`: Stores context-wide configuration. Includes `default_loan_interest_rate` and `interest_rate_rules` (JSONB array). 
    *   *Rule Schema*: `[{"id": string, "label": string, "endDate": "YYYY-MM-DD", "rate": float}]`.
*   `audit_logs`: Stores write-audit metadata for ledger and admin actions.
*   Member-linked foreign keys on `loans.member_id`, `loans.surety1_id`, and `loans.surety2_id` should support `ON UPDATE CASCADE` so direct backend member-ID corrections do not violate referential integrity.

#### 3.8. Legacy Data Importer (Automated)
*   **Smart Paste Interface**: Support copying multiple rows from Excel/Google Sheets and pasting them directly into the system.
*   **Automatic Entity Mapping**:
    *   **Members**: Automate creation of new member profiles if the ID or Name is not found in the existing database.
    *   **Loans**: Automatically initialize a "Special Loan" on the member's first "Loan" voucher.
    *   **Top-ups**: Detect subsequent "Loan" entries (or "Top-up" narrations) and append them as `loan_topups` to the active loan.
    *   **Repayments**: Map "Payment" vouchers to `loan_repayments` with automated link-to-loan logic.
*   **Dry-Run Validation**: Provide a mandatory "Preview" step showing all proposed database actions (Create/Add/Skip) before final commitment.
*   **Date Normalization**: Support `MM-YYYY` (e.g., `01-2013`) by defaulting to the 1st of the month, and standard `DD-MM-YYYY` formats.
*   **Dynamic Interest Schedule**:
    *   Automated lookup during spreadsheet analysis.
    *   Reactive rate suggestions in the manual "Create Loan" and "Add Top-up" forms.
    *   *Evaluation Logic*: Rules are checked sequentially by `endDate`. The first matching rule (where `date <= rule.endDate`) wins. If no rule matches, the system falls back to the global `default_loan_interest_rate`.
    *   *Recalculation Engine*: Core math utilities (`getInterestDueForPeriod`, `getMissingInterestPeriods`) are injected with `SocietySettings` to ensure historical consistency regardless of current-day configuration changes.

*   No new tables or columns are required for the latest month-interest override, remaining-principal settlement, admin-only audit-log tab, member-ID edit flow, or audit-report disbursal view. These changes operate on the existing `members`, `loans`, `loan_repayments`, and `audit_logs` structures.
*   The legacy `payments` table is not part of the active product and should not exist after the latest migration.
*   Sample data is intentionally separated from schema setup so operators can add or remove it directly from the Supabase backend when needed.

#### Data Flow (FinancialContext)
*   All calculations are derived dynamically on the client side from the Supabase tables.
*   `getSpecialLoanOutstanding(loanId, asOfDate?)`: Calculates the exact principal balance by netting the original principal, top-ups up to the date, and principal repayments up to the date.
*   Shared loan math utilities now drive arrears detection, current-month due, auto-generation, running balances, and interest-settlement status from the same event model.
*   Shared loan math utilities also validate whether a loan can be closed on a selected date by checking both outstanding principal at that date and any future principal-affecting activity.

---

### 5. Recent System Fixes & IDE Tooling

#### 5.1. Legacy TypeScript & WSL Compatibility
To support older IDE TypeScript Language Servers (specifically in WSL/Windows environments), the project utilizes a highly explicit `tsconfig.json` configuration:
*   `moduleResolution: node` prevents the IDE from failing to parse the Vite `bundler` resolution strategy.
*   `typeRoots: ["./node_modules/@types"]` explicitly points the IDE to ambient declarations.
*   Components use manual prop typings (e.g., `({ children }: { children: React.ReactNode })`) rather than `React.FC` to eliminate "implicit any" inference failures.
*   Global default exports are bypassed with `import * as React from 'react'` in core files.

#### 5.2. Strict Environment Requirements
*   A valid `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` is required for the application to function. 
*   **Resilient Initialization**: The `supabaseClient.ts` has been refactored to log a console error instead of throwing a fatal exception during module import. This prevents white-screen crashes if environment variables are missing during the build phase.

#### 5.3. Schema Migrations (Idempotent)
*   **Source of Truth**: All required schema setup is consolidated in `migration.sql`.
*   **Safety**: The script is- **Idempotency**: Safe to run multiple times; it will only add missing pieces.
- **Audit Verification**: Every financial calculation is deterministic and can be reconciled using the `interest_rate_rules` JSON schedule in `app_settings`.

### 🛡️ Financial Systems Audit Checklist
For Senior Auditors, verify these controls:
- [x] **Principal Integrity**: Sum of `Original Principal + Top-ups - Principal Recoveries` matches live outstanding.
- [x] **Interest Determinism**: Monthly dues match either the `loan.interestRate` OR a matching `interest_rate_rules` entry for that date.
- [x] **Allocation Separation**: `interestPaid` is tracked separately from `principalPaid` to prevent amortized balance corruption.
- [x] **Zero-Balance Cutoff**: No interest is generated for periods where principal is ≤ 1.00 INR.
- [x] **Immutable Repayment Basis**: Exact-day interest rows preserve their `interestDays` and `interestCalculationType` even if global rules change.
- [x] **Event-Driven Running Balance**: Every transaction generates a new `balanceAfter` based on chronological event ordering (including same-day `created_at` sub-ordering).
 and indexes and guarded policy creation.
*   **Access Control**: The script automatically enables Row Level Security (RLS) and adds global permissions for the `anon` role to ensure secure but functional access from the Vite app.
*   **Operational Note**: `migration.sql` is also the upgrade path for existing deployments. Operators must rerun it after the ledger hardening release so the new repayment-period columns, audit-log compatibility columns, constraints, triggers, and legacy-table cleanup are applied.
*   **Current Proration Upgrade Note**: Existing deployments must rerun `migration.sql` one more time to add `interest_days` and `interest_calculation_type` for exact-day repayment auditability.
*   **Current Closure Auto-Cleanup Fix**: No additional schema change is required for the latest post-closure interest cleanup. It is implemented in the shared calculation engine and repayment workflows on top of the existing tables.
*   **Current Release SQL Requirement**: Existing deployments should rerun `migration.sql` once more so the member-linked loan foreign keys are upgraded to `ON UPDATE CASCADE`. This is required if operators or backend admins need direct member-ID corrections to work without FK errors. The remaining latest fixes are application-only.

#### 5.4. Product Scope Corrections
*   The generic `Dashboard` has been removed from the live app surface to focus on the ledger system.
*   The `Members` page has been restored to provide easier access to member profiles and status.
*   The default route now opens the Special Loans page directly.
*   A dedicated `Settings` page replaces the local storage preferences but syncs to Supabase.
*   Audit reports correctly handle all-time history from 2012 onward.
*   Audit CSV exports now maintain perfect consistency with UI cards by utilizing unified filtering and chronological voucher sequencing.
*   **Member Details View**: Integrated a specialized profile modal in the Members tab, providing a deep-dive into individual financial standing and historical loan summaries.
*   **Enhanced Date Navigation**: Replaced linear month-switchers with direct Month/Year dropdown selectors in the Special Loans view, enabling instant jumps to historical data (e.g., 2012).
*   **Auto-Generate Historical Interest**: Added a single-click "Auto-Gen" tool to automatically traverse a legacy loan's history month-by-month and backfill all missing interest payment records based on dynamically calculated outstanding principal balances.
*   **Auto-Generate Interest Edge-Case Handling**: Fortified mathematical calculations to strictly evaluate liability across months where only partial principal was recovered, gracefully handle missing SQL `principal_paid` mappings for manual test entries, perfectly align output timestamps to the end of the month (e.g. `31-08-2017`), and allowed auto-generation to seamlessly function on historic legacy loans that are already marked as Closed.
*   **Auto-Gen Stability**: Resolved a critical "React Error #321" in the interest generator and refactored it for better performance and real-time UI updates after data wipes.
*   **Precision Interest Logic**: Validated the "zero-balance" logic, ensuring interest is only generated for months where an actual principal liability exists.
*   **Mobile Optimized UI**: Implemented horizontal scrolling for all wide tables and adaptive grid systems for financial metric cards.
*   **Multi-Select Ledger Filtering**: Redesigned the audit ledger filter to support multi-select transaction types with color-coded interactive chips for better financial tracking.
*   **Auto-Gen Closure / Payoff Control**: The generator now stops at the earlier of today, the loan close date, or the sustained zero-balance date. If the last valid interest month ends on a mid-month closure/payoff, the generated record is dated on that actual closure date instead of month-end, and any stale post-cutoff interest entries are automatically cleaned.
*   **Closed-Loan Repair Workflow**: Operators can open the same Auto-Gen workflow on closed loans to repair stale historical interest rows without directly editing the database.
*   **Interest Allocation Model**: Reworked repayment storage so an interest collection can be assigned to a specific settlement month/year instead of inferring the liability month from the payment date alone.
*   **Principal-Only Recovery Fix**: Corrected the loan status logic so voluntary principal repayments no longer suppress the interest collection workflow for the same month.
*   **Arrears Posting Fix**: Corrected missed-month posting so arrears are allocated to their actual historical periods without generating negative or mathematically invalid current-period rows.
*   **Collection-Date Based Due Calculation**: Corrected the repayment modal so interest due is derived from the operator-entered collection date, not merely from the currently selected reporting month.
*   **Exact-Day Interest Workflow**: Added a current-period interest mode that can calculate and store 15-day / 20-day style proration directly in the repayment form while still clearing arrears month-by-month first.
*   **Historical Interest Row Override**: Operators can now reopen a specific recorded interest month from the audit ledger, switch it between monthly and exact-day calculation, and update the existing repayment row in place while preserving before/after audit history.
*   **Exact-Day Recalc Protection**: Auto-generation previews now identify exact-day overrides and protect them from accidental wipe/regenerate flows so manually corrected rows are not overwritten by monthly defaults.
*   **Long-History Collection UX**: Added a compact arrears summary for loans spanning many years so the operator can review total arrears, month count, and date range without rendering excessively long month lists.
*   **Safe Interest Wipe**: Refactored “Wipe Interest” so mixed repayment rows keep their principal component and only the interest allocation is removed.
*   **Running Balance Determinism**: Refactored the audit ledger to compute row-by-row balance progression using event ordering rather than date-only reconstruction.
*   **Live Ledger Summary Fix**: The audit-ledger summary cards now derive from live repayment/top-up data instead of stale modal snapshots, so interest edits instantly update the displayed totals.
*   **Per-Loan Ledger Export**: Added a download action inside the Special Loan Audit Ledger modal to export the selected member’s summary and transaction rows directly to CSV.
*   **Corrected Closed-Loan Principal Adjustment Workflow**: The loan edit modal now surfaces remaining principal when a historical principal amount is corrected upward and lets the operator either keep the loan active or record the balancing principal settlement immediately.
*   **Top-Up Rate History Support**: Top-ups now preserve a rate value that becomes the effective future monthly rate for subsequent interest calculations.
*   **Audit Log Schema Alignment**: Fixed the frontend audit payload shape to match the Supabase `audit_logs` table and avoid silent insert failures.
*   **Admin-Only Audit Log Screen**: Audit Log History has been moved out of the financial Audit Report into a dedicated admin-only navigation tab with both sidebar and route-level access control.
*   **Legacy Member ID Correction**: The Members edit modal now allows changing a member ID from the frontend and safely remaps linked borrower/surety references instead of forcing manual SQL fixes.
*   **Future-Activity Close Guard**: Loans can no longer be closed on a date that still has later top-ups or principal recoveries in history, which prevents premature closure on legacy books where the same loan resumes years later.
*   **Audit Report Principal Clarity**: Audit Report now surfaces `Original Loan Disbursed` both in the summary cards and in the member-balance table before outstanding calculations.
*   **Audit Report Table Cleanup**: The member-balance grid now removes the status column and shows the original disbursal start date instead, keeping the table focused on balance math.
*   **Database Integrity Guards**: Added DB-level checks for non-negative repayments, component-sum validation, valid interest-period ranges, and trigger-based date validation for top-ups, repayments, and edited loan start dates.
*   **Regression Harness**: Added deterministic loan-math regression coverage for multi-top-up and partial-repayment scenarios via `npm test`.
*   **Live Context Sync**: Member, financial, and settings contexts now push local updates immediately and also subscribe/refetch in real time so backend changes surface without manual page reloads.
*   **Robust Date Parsing**: Upgraded all date-handling utilities to natively support both dash-separated (`YYYY-MM-DD`) and slash-separated (`DD/MM/YYYY`) formats, as well as Indian-style shorthand (`DD-MM-YYYY`). This ensures legacy manual data imported via SQL can still be correctly parsed for interest calculations and audit reporting.
*   **High-Precision UTC Calculation Logic**: Refactored the core calculation engine (`getSpecialLoanOutstanding`) to use UTC-aligned ISO comparisons. This resolves subtle "timezone shift" bugs where payments at the end of a month were occasionally missed by the interest calculator.
*   **Zero-Balance & Start-Date Guards**: Implemented strict liability guards that automatically nullify interest for any period prior to the loan start date or any month where the principal balance has been cleared (within a 1-rupee rounding tolerance).
*   **Refined Auto-Gen & Liveness**: Resolved the `At is not a function` (TypeError) by removing minified logger dependencies, fixed the `fetchFinancials` ReferenceError, and silenced `401 Unauthorized` console noise by replacing root-level REST liveness probes with authenticated table-level pings.
*   **Authoritative Interest Schedule**: Upgraded `getEffectiveLoanRate` to prioritize the **Global Interest Rate Schedule** over legacy sticky top-up rates. This ensures historical accounting switches (like the 2% to 1.5% transition in 2015) work reliably across all loans.
*   **ISO Date Normalization**: Hardened the interest calculation engine by enforcing `YYYY-MM-DD` normalization in `interest.ts`. This prevents string collation errors when comparing rules with mixed date formats (`DD-MM-YYYY` vs ISO).
*   **Audit Ledger Visibility**: Implemented the `entry_type` database column and frontend mapping to correctly distinguish between `REPAYMENT` and `INTEREST` in the audit ledger trails.
*   **Reactive Auto-Gen Preview**: Migrated the "Missing Months" calculation to a `useMemo` hook. This ensures that the count refreshes instantly in the UI after a user performs a "Wipe & Re-gen" action, providing immediate visual confirmation.
*   **Audit Ledger Running Balance**: Implemented a new "Balance" column in the Special Loan Audit Ledger. This provides a row-by-row mathematical audit trail, showing the exact outstanding principal remaining after every individual transaction.
*   **Top-up & Sorting Enhancements**: Added the ability to edit historical top-up records and sort the audit ledger by Date/Amount.
*   **TypeScript & JSX Stability**: Resolved critical build errors related to JSX nesting, missing type imports, and unimplemented context functions for a 100% clean production build.




*   Ajay sample data handling was moved out of the main migration into separate add/remove SQL scripts.

#### 5.5. Build & Deployment Portability
*   **Relative Pathing**: The project is configured with `base: './'` in `vite.config.ts`. This ensures that all JS/CSS assets load correctly even if the application is served from a subdirectory, a custom WSL route, or a PWA context.

#### 5.6. Styling Note
*   The project uses the Tailwind CSS v3 CDN (`<script src="https://cdn.tailwindcss.com"></script>`). Avoid using Tailwind v4 specific features like the `@theme` CSS directive to prevent syntax errors.
