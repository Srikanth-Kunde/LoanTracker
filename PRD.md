# Product Requirements Document (PRD)
## LoanTracker: Special Loans Edition

---

### 1. Overview & Objective
A specialized digital ledger system to manage complex "Special Loans" for groups of over 40 members. This system modernizes a physical, handwritten ledger dating back to 2012, characterized by members taking multiple interest-only loans, frequent principal top-ups, and varying interest payment structures (e.g., prorated 15/20 day interest periods).

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

#### 3.4. Principal Repayment
*   During interest collection (or independently), members can pay down a portion of the principal.
*   This instantly reduces the `Outstanding Principal` for the following month's interest calculation.

#### 3.5. Late Fees (Strictly Manual)
*   **No Auto-Late Fees**: The system will *not* automatically generate or demand late fees, especially for back-dated entries.
*   Late fees are recorded *only* if explicitly entered by the Operator during a repayment collection.

#### 3.6. Audit & Reporting
*   A Dashboard to view total capital deployed via Special Loans and total interest collected.
*   A comprehensive Audit Report tracking every principal disbursement (Loans + Top-ups) and every collection (Interest + Principal + Late Fees) chronologically.

---

### 4. Technical Specifications & Architecture

#### Stack
*   **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide React icons.
*   **Build Tool**: Vite (ESNext target, React SWC).
*   **Database**: Supabase (PostgreSQL).

#### Database Schema Highlights
*   `loans`: Stores `member_id`, `principal`, `interest_rate`, `status` (Active/Closed), `created_at`, `loan_type`, `surety1_id`, `surety2_id` (foreign keys to members), and a `description`.
*   `loan_topups`: Links to a `loan_id`. Stores `amount`, `date_taken`, and `rate`.
*   `loan_repayments`: Links to a `loan_id`. Separates `amount_paid` (Total) into `principal_paid`, `interest_paid`, and `late_fee_paid`.
*   `app_settings`: Stores global configurations, operator codes, and UI preferences (`themeMode`, `accentColor`, `bannerImage`).

#### Data Flow (FinancialContext)
*   All calculations are derived dynamically on the client side from the Supabase tables.
*   `getSpecialLoanOutstanding(loanId, asOfDate?)`: Calculates the exact principal balance by netting the original principal, top-ups up to the date, and principal repayments up to the date.

---

### 5. Recent System Fixes & IDE Tooling

#### 5.1. Legacy TypeScript & WSL Compatibility
To support older IDE TypeScript Language Servers (specifically in WSL/Windows environments), the project utilizes a highly explicit `tsconfig.json` configuration:
*   `moduleResolution: node` prevents the IDE from failing to parse the Vite `bundler` resolution strategy.
*   `typeRoots: ["./node_modules/@types"]` explicitly points the IDE to ambient declarations.
*   Components use manual prop typings (e.g., `({ children }: { children: React.ReactNode })`) rather than `React.FC` to eliminate "implicit any" inference failures.
*   Global default exports are bypassed with `import * as React from 'react'` in core files.

#### 5.2. Strict Environment Requirements
*   A valid `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` is required for the application to function. Missing credentials will trigger the `ErrorBoundary`.

#### 5.3. Recent Schema Enhancements
*   **Surety Logic**: `loans` table now supports `surety1_id`, `surety2_id` and a `description`.
*   **Late Fees**: `loan_repayments` explicitly tracks a dedicated `late_fee` column for manual overrides.
*   **UI Settings**: `app_settings` now persists `themeMode`, `accentColor`, and `bannerImage`.
*   Operators must ensure these columns are added via Supabase SQL Editor for the app to function correctly.

#### 5.4. Styling Note
*   The project uses the Tailwind CSS v3 CDN (`<script src="https://cdn.tailwindcss.com"></script>`). Avoid using Tailwind v4 specific features like the `@theme` CSS directive to prevent syntax errors.
