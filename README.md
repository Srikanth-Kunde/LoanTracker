# Legacy Loan Tracker
Digitize and audit historical handwritten loan records starting from 2012 with absolute precision. This specialized tool focuses exclusively on **Special Loans** (Interest-only, with multiple top-ups and flexible repayments).

> [!NOTE]
> All "Regular Savings" (Podhupu) features have been removed to simplify the user experience for historical record keeping.

## 🌟 Key Features

*   **Dynamic Principal Tracking:** Outstanding balances are calculated on-the-fly based on original principal + top-ups - principal repayments.
*   **Manual Interest Proration:** Supports overwriting standard monthly interest amounts to account for 15-day or 20-day partial borrowing periods.
*   **No Auto-Late Fees:** Designed to perfectly match historical handwritten books, the system will never auto-calculate late fees. Late fees are only recorded if explicitly provided by the operator.
*   **Chronological Audit Trail:** Dedicated views to track every disbursement and repayment event historically.
*   **Auto-Interest Engine:** Single-click "Zap" button to backfill decades of historical interest records based on dynamically calculated principal balances.
*   **Reduced Scope UI:** The application is laser-focused on `Special Loans`, `Members`, `Audit Report`, and `Settings`. No distracting dashboards or bank-sync features.
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
The navigation is intentionally limited to `Special Loans`, `Audit Report`, and `Settings`.

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
3.  Run `migration.sql` for schema setup.
4.  Run `sql/sample-ajay-add.sql` only when you want sample data for Ajay and Srikanth.
5.  Run `sql/sample-ajay-remove.sql` whenever you want to remove the sample rows.

### Do You Need To Run SQL Again?
- **No new schema changes** are required for the Legacy Loan Tracker update.
- **Run `migration.sql` only once** for initial setup. Rerunning it is safe and idempotent.
- **`payments` table**: This table is still present in the schema but is ignored by the UI in this version.
- **Data Cleanup**: To remove sample data (Ajay/Srikanth), run `sql/sample-ajay-remove.sql`.

**What this script does:**
- **Recreates Tables**: Sets up `members`, `loans`, `payments`, etc., with the correct types.
- **Enables Security**: Activates Row Level Security (RLS) to remove the "UNRESTRICTED" warning.
- **Grants Access**: Adds policies to allow your web app (via the `anon` key) to read and write data.
- **Idempotency**: Safe to run multiple times; it will only add missing pieces.

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

*   **Restored Members Tab**: Re-added the Members page to the UI for better member tracking and updates.
*   **Improved Type Safety**: Fixed `AuditAction` enum mismatches in the frontend.
*   **IDE Resolution Fixes**: Added explicit file extensions to lazy-loaded imports in `App.tsx` for better IDE path resolution.
*   **SQL Security**: Verified and updated RLS policies in `migration.sql` to resolve "UNRESTRICTED" warnings.
*   **Member Details Profile**: Added a comprehensive profile view for members, showing total outstanding, top-ups, and interest collected at a glance.
*   **Quick Date Selection**: Implemented direct Year and Month dropdowns in the Special Loans tab for significantly faster historical record navigation.
*   **Audit Report Consistency**: Refactored filtering logic to ensure that UI cards and CSV exports (Tally/Full Audit) are always in sync, even when search filters are applied.
*   **Auto-Generate Interest Module**: Added a powerful utility to backfill historical legacy ledgers by dynamically generating accurate monthly interest payments with a single click.
*   **Auto-Generate Edge-Cases**: Hardened the auto-generator to correctly calculate liability across months containing partial principal recoveries, elegantly handle legacy closed loans, format output dates to the end-of-month, and automatically repair manual SQL entries missing principal data.
*   **Robust Date Parsing**: Upgraded internal date utilities to support diverse formats like `10/06/2017` and `10-06-2017`, preventing data parsing failures on legacy handwritten records.
*   **Auto-Gen Stability**: Resolved a critical "React Error #321" in the interest generator and refactored it for better performance and real-time UI updates after data wipes.
*   **Precision Interest Logic**: Validated the "zero-balance" logic, ensuring interest is only generated for months where an actual principal liability exists.


*   **Audit Reports**: Extended the Audit Tally and CSV exports to handle historical data from 2012.


