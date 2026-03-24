**Release Note**

This release improves historical loan correction workflows, audit visibility, and ledger safety for Special Loans.

**What’s New**
- Existing interest rows can now be edited in place from the Special Loan Audit Ledger.
- Operators can switch a recorded month between `Monthly` and `Exact Days` without deleting the repayment row.
- Exact-day overrides now preserve audit history with before/after repayment values.
- Closed loans corrected to a higher original principal now support immediate remaining-balance settlement from the loan edit flow.
- The Special Loan Audit Ledger now shows a live `Interest Paid` summary card.
- **New Feature**: Legacy Data Importer — Paste multiple rows directly from Excel/CSV to auto-generate member profiles, loans, top-ups, and repayments.
- **New Feature**: Top-up Loan Editing — Existing top-up records can now be edited directly from the Special Loan Audit Ledger.
- **New Feature**: Audit Ledger Sorting — Transactions can now be sorted by Date and Amount (Ascending/Descending).
- **New Feature**: Multi-type transaction selection (Disbursal, Top-up, Principal, Interest) to the Special Loan Audit Ledger using interactive toggle chips.
- **New Feature**: Full Mobile Responsiveness — Added horizontal scrolling for tables and adaptive grids for metric cards.
- **New Feature**: Added a footer to the Audit Ledger table showing the sum of Amount, Principal, and Interest for filtered transactions.
- **New Feature**: Dynamic Interest Rate Schedule — Define historical or future rate overrides in Settings.
- **New Enhancement**: Automated Rate Selection — The Legacy Importer and manual Special Loans screen now auto-suggest rates based on the disbursal date.
- **New Enhancement**: Auto-gen Progress Tracking — Added loading states and better error reporting for bulk interest generation.
- **New Enhancement**: Descriptive Validation — Financial engine now provides period-specific error messages (e.g., "Batch record #7 failed for 01/2026").
- The ledger modal now supports direct `Download Ledger` CSV export per member.
- Audit Log History has been moved into its own tab.
- Audit Log History is now restricted to `Admin` users only. Operators and viewers cannot see or open it.
- Auto-generation now protects exact-day override rows from being unintentionally wiped or replaced by monthly defaults.
- Ledger summary cards now refresh from live transaction data, so edited interest values update immediately.
- Member IDs can now be corrected from the frontend, and linked borrower/surety loan references are remapped automatically.
- Audit Report now shows `Original Loan Disbursed` before outstanding calculations in the summary cards, member balance table, and Full Audit CSV.
- The Audit Report member balance table now replaces `Status` with the original loan start date for a cleaner calculation-first layout.

**Fixes**
- Fixed critical CSS/JSX nesting errors in `SpecialLoans.tsx` that caused build failures.
- Fixed stale `Interest Paid` totals in the ledger header after editing an existing interest row.
- Fixed auto-recalculation behavior that could overwrite exact-day interest overrides.
- Fixed historical loan correction flow so remaining principal is surfaced and can be settled properly.
- Fixed route and sidebar access so audit-log browsing is admin-only.
- Fixed the member-ID correction gap that previously required manual backend edits and triggered foreign-key failures.
- Fixed loan closure logic so a loan cannot be closed while future top-ups or later principal recoveries still exist in history.
- Fixed Legacy Data Importer logic to correctly track single-session member discovery and avoid duplicate creation actions across rows.
- Enhanced Legacy Data Importer parsing to correctly handle inconsistent tabular pastes containing tabs, multiple spaces, and empty columns by inferring Debit/Credit via Voucher Type.
- Fixed "Unknown Voucher: ₹" bug in the Legacy Importer by implementing pivot-logic column detection.
- Fixed the latest "Auto-generate Interest" regression by removing a bad Supabase-session probe from `fetchFinancials` and replacing the invalid REST-root liveness probe that was generating misleading `401 Unauthorized` errors.
- Fixed calculation engine rounding inconsistencies that could trigger validation errors during bulk operations.
- Fixed a race condition in Settings synchronization (`SettingsContext.tsx`) which prevented local defaults from overwriting remote rules on load.
- Hardened the Legacy Data Importer with pivot-logic for dynamic column detection (Voucher Type based) and "₹" symbol stripping.
- Fixed missing `entryType` mapping in `FinancialContext.tsx` to ensure generated interest correctly appears in the audit ledger.


**Database / Deployment Note**
- Existing deployments should rerun `migration.sql` once if they want direct backend edits of `members.id` to work cleanly. The migration now upgrades member-linked loan foreign keys to `ON UPDATE CASCADE`.
- If your deployment is older and does not yet include:
  - `loan_repayments.interest_for_month`
  - `loan_repayments.interest_for_year`
  - `loan_repayments.interest_days`
  - `loan_repayments.interest_calculation_type`
  - `audit_logs.performed_by`
  - `audit_logs.record_id`
  - `audit_logs.details`
  then rerun `migration.sql` once.

**Documentation Updated**
- `PRD.md` (Updated with historical calculation engine specs)
- `README.md` (Added Senior Auditor Financial Controls Checklist)

**Verification**
- `npm test`
- `npm run build`
