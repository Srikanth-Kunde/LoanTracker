**v1.1.0 — Financial Engine Stabilization**

This release resolves critical logic gaps in interest generation and silences authentication-related console noise.

**What’s New**
- **Interest Resume Logic**: The interest generator now ignores stale `endDate` (Close Date) values if a loan status is `ACTIVE`. This allows interest to successfully resume after a Top-up even if the loan was previously marked as finished.
- **Automatic Re-activation**: Adding or editing a Top-up now automatically resets a loan's status to `ACTIVE` and clears any historical `endDate` (correctly nullifying the DB field).
- **Session Polish**: Replaced the heart-beat probe with an authenticated `GET` request to silence misleading `401 Unauthorized` console alarms.
- **Audit Hardening**: Full integration of the `entry_type` database column to accurately distinguish between `REPAYMENT` and `INTEREST` in the audit ledger.
- **Bug Fix**: Resolved `ReferenceError: LoanStatus is not defined` in the loan math utility.
- **Logic Correction**: Fixed a backward condition in the loan edit flow where closure was incorrectly triggering an "Active" status.

**Fixes**
- Fixed a bug where interest generation would stop at the first zero-balance month, even if subsequent Top-ups existed.
- Fixed "sticky" interest rates by prioritizing the Global Interest Schedule over historical Top-up rates.
- Fixed date normalization errors during interest rule matching.

---

**v1.0.6 — Ledger Hardening**

This release improves historical loan correction workflows, audit visibility, and ledger safety for Special Loans.



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
