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
*   **Explicit Settlement Period**: The system must support recording an interest payment against the month it settles, even when the cash is physically collected in a later month.

#### 3.4. Principal Repayment
*   During interest collection (or independently), members can pay down a portion of the principal.
*   This instantly reduces the `Outstanding Principal` for the following month's interest calculation.
*   **Critical Rule**: A principal-only repayment must never mark a month as interest-settled.

#### 3.5. Late Fees (Strictly Manual)
*   **No Auto-Late Fees**: The system will *not* automatically generate or demand late fees, especially for back-dated entries.
*   Late fees are recorded *only* if explicitly entered by the Operator during a repayment collection.

#### 3.6. Audit & Reporting
*   A clean audit workspace to review total capital deployed and interest collected across all legacy records.
*   A comprehensive Audit Report tracking every principal disbursement and collection chronologically.
*   Audit review must support all-time history from 2012 onward.
*   The audit ledger must expose a deterministic row-by-row running principal balance, even when multiple events occur on the same date.

#### 3.7. Member Management
*   A centralized interface to manage the society's 40+ members.
*   Operators can create, update, and deactivate member profiles (Name, Phone, Address, Join Date).
*   *Rule*: Member IDs can be manual (to match legacy books) or auto-generated.


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
*   `app_settings`: Stores the active UI-backed settings used by the app, including `society_name`, `currency`, `loan_processing_fee`, `default_loan_interest_rate`, access codes, and appearance preferences.
*   `audit_logs`: Stores write-audit metadata for ledger and admin actions.
*   The legacy `payments` table is not part of the active product and should not exist after the latest migration.
*   Sample data is intentionally separated from schema setup so operators can add or remove it directly from the Supabase backend when needed.

#### Data Flow (FinancialContext)
*   All calculations are derived dynamically on the client side from the Supabase tables.
*   `getSpecialLoanOutstanding(loanId, asOfDate?)`: Calculates the exact principal balance by netting the original principal, top-ups up to the date, and principal repayments up to the date.
*   Shared loan math utilities now drive arrears detection, current-month due, auto-generation, running balances, and interest-settlement status from the same event model.

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
*   **Safety**: The script is **idempotent** and safe to rerun. It uses `IF NOT EXISTS` for tables and indexes and guarded policy creation.
*   **Access Control**: The script automatically enables Row Level Security (RLS) and adds global permissions for the `anon` role to ensure secure but functional access from the Vite app.
*   **Operational Note**: `migration.sql` is also the upgrade path for existing deployments. Operators must rerun it after the ledger hardening release so the new repayment-period columns, audit-log compatibility columns, constraints, triggers, and legacy-table cleanup are applied.

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
*   **Interest Allocation Model**: Reworked repayment storage so an interest collection can be assigned to a specific settlement month/year instead of inferring the liability month from the payment date alone.
*   **Principal-Only Recovery Fix**: Corrected the loan status logic so voluntary principal repayments no longer suppress the interest collection workflow for the same month.
*   **Arrears Posting Fix**: Corrected missed-month posting so arrears are allocated to their actual historical periods without generating negative or mathematically invalid current-period rows.
*   **Collection-Date Based Due Calculation**: Corrected the repayment modal so interest due is derived from the operator-entered collection date, not merely from the currently selected reporting month.
*   **Long-History Collection UX**: Added a compact arrears summary for loans spanning many years so the operator can review total arrears, month count, and date range without rendering excessively long month lists.
*   **Safe Interest Wipe**: Refactored “Wipe Interest” so mixed repayment rows keep their principal component and only the interest allocation is removed.
*   **Running Balance Determinism**: Refactored the audit ledger to compute row-by-row balance progression using event ordering rather than date-only reconstruction.
*   **Top-Up Rate History Support**: Top-ups now preserve a rate value that becomes the effective future monthly rate for subsequent interest calculations.
*   **Audit Log Schema Alignment**: Fixed the frontend audit payload shape to match the Supabase `audit_logs` table and avoid silent insert failures.
*   **Database Integrity Guards**: Added DB-level checks for non-negative repayments, component-sum validation, valid interest-period ranges, and trigger-based date validation for top-ups, repayments, and edited loan start dates.
*   **Regression Harness**: Added deterministic loan-math regression coverage for multi-top-up and partial-repayment scenarios via `npm test`.
*   **Robust Date Parsing**: Upgraded all date-handling utilities to natively support both dash-separated (`YYYY-MM-DD`) and slash-separated (`DD/MM/YYYY`) formats, as well as Indian-style shorthand (`DD-MM-YYYY`). This ensures legacy manual data imported via SQL can still be correctly parsed for interest calculations and audit reporting.
*   **High-Precision UTC Calculation Logic**: Refactored the core calculation engine (`getSpecialLoanOutstanding`) to use UTC-aligned ISO comparisons. This resolves subtle "timezone shift" bugs where payments at the end of a month were occasionally missed by the interest calculator.
*   **Zero-Balance & Start-Date Guards**: Implemented strict liability guards that automatically nullify interest for any period prior to the loan start date or any month where the principal balance has been cleared (within a 1-rupee rounding tolerance).
*   **Auto-Gen Stability (Fix for React Error #321)**: Resolved a critical "Minified Hooks Error" by refactoring the `handleGenerateInterest` function to eliminate illegal hook calls within callbacks.
*   **Reactive Auto-Gen Preview**: Migrated the "Missing Months" calculation to a `useMemo` hook. This ensures that the count refreshes instantly in the UI after a user performs a "Wipe & Re-gen" action, providing immediate visual confirmation.
*   **Audit Ledger Running Balance**: Implemented a new "Balance" column in the Special Loan Audit Ledger. This provides a row-by-row mathematical audit trail, showing the exact outstanding principal remaining after every individual transaction.




*   Ajay sample data handling was moved out of the main migration into separate add/remove SQL scripts.

#### 5.5. Build & Deployment Portability
*   **Relative Pathing**: The project is configured with `base: './'` in `vite.config.ts`. This ensures that all JS/CSS assets load correctly even if the application is served from a subdirectory, a custom WSL route, or a PWA context.

#### 5.6. Styling Note
*   The project uses the Tailwind CSS v3 CDN (`<script src="https://cdn.tailwindcss.com"></script>`). Avoid using Tailwind v4 specific features like the `@theme` CSS directive to prevent syntax errors.
