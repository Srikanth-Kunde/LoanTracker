**v1.1.2 — High-Fidelity Historical Accrual**

This stabilization release resolves interest gaps in multi-cycle legacy loans and first-month accrual.

- **Gap Bridging**: The engine now correctly "jumps" over zero-balance periods and resumes interest accrual the moment a Top-up is detected.
- **First-Month Inclusion**: Fixed a logic bug where the first month of a loan was skipped. It now correctly calculates interest based on the initial disbursal principal.
- **Improved Success Feedback**: Added explicit record counts and status resets to the Auto-Gen modal.

---

**v1.1.1 — Principal Overflow & Persistence Fix**

This stabilization release resolves critical calculation overflows and persistence gaps reported in v1.1.0.

- **Principal Fallback Logic**: Fixed a bug where interest was over-calculated (the 117-month issue) because the engine missed principal reductions in generic repayments. It now correctly detects zero-balance gaps.
- **Hardened Persistence**: Fixed the "Not Applying" issue by snapshotting records and adding explicit success alerts to the Auto-Gen modal.
- **UI Refresh**: Forced an explicit refetch with a loader to ensure results are visible immediately after "Apply".

---

**v1.1.0 — Financial Engine Stabilization**

This release resolves critical logic gaps in interest generation and silences authentication-related console noise.

- **Interest Resume Logic**: The interest generator now ignores stale `endDate` (Close Date) values if a loan status is `ACTIVE`.
- **Automatic Re-activation**: Adding or editing a Top-up now automatically resets a loan's status to `ACTIVE`.
- **Session Polish**: Replaced the heart-beat probe with an authenticated `GET` request.
- **Audit Hardening**: Full integration of the `entry_type` database column.
- **Bug Fix**: Resolved `ReferenceError: LoanStatus is not defined`.
