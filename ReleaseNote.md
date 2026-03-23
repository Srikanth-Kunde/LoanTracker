**Release Note**

This release improves historical loan correction workflows, audit visibility, and ledger safety for Special Loans.

**What’s New**
- Existing interest rows can now be edited in place from the Special Loan Audit Ledger.
- Operators can switch a recorded month between `Monthly` and `Exact Days` without deleting the repayment row.
- Exact-day overrides now preserve audit history with before/after repayment values.
- Closed loans corrected to a higher original principal now support immediate remaining-balance settlement from the loan edit flow.
- The Special Loan Audit Ledger now shows a live `Interest Paid` summary card.
- **New Feature**: Added a real-time search filter and transaction-type dropdown (Disbursal, Top-up, Repayment, Interest) to the Special Loan Audit Ledger.
- **New Feature**: Full Mobile Responsiveness — Added horizontal scrolling for tables and adaptive grids for metric cards.
- **New Feature**: Added a footer to the Audit Ledger table showing the sum of Amount, Principal, and Interest for filtered transactions.
- The ledger modal now supports direct `Download Ledger` CSV export per member.
- Audit Log History has been moved into its own tab.
- Audit Log History is now restricted to `Admin` users only. Operators and viewers cannot see or open it.
- Auto-generation now protects exact-day override rows from being unintentionally wiped or replaced by monthly defaults.
- Ledger summary cards now refresh from live transaction data, so edited interest values update immediately.
- Member IDs can now be corrected from the frontend, and linked borrower/surety loan references are remapped automatically.
- Audit Report now shows `Original Loan Disbursed` before outstanding calculations in the summary cards, member balance table, and Full Audit CSV.
- The Audit Report member balance table now replaces `Status` with the original loan start date for a cleaner calculation-first layout.

**Fixes**
- Fixed stale `Interest Paid` totals in the ledger header after editing an existing interest row.
- Fixed auto-recalculation behavior that could overwrite exact-day interest overrides.
- Fixed historical loan correction flow so remaining principal is surfaced and can be settled properly.
- Fixed route and sidebar access so audit-log browsing is admin-only.
- Fixed the member-ID correction gap that previously required manual backend edits and triggered foreign-key failures.
- Fixed loan closure logic so a loan cannot be closed while future top-ups or later principal recoveries still exist in history.

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
- `PRD.md`
- `README.md`

**Verification**
- `npm test`
- `npm run build`
