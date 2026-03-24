**v1.1.4 — Ledger Display & Import Integrity**

This release fixes a display bug in the loan ledger that caused principal/top-up mismatch confusion after importing legacy data.

- **TOP-UP Principal Display Fix**: The loan ledger now correctly displays principal amounts for TOP-UP entries in both the transaction rows and ledger totals. Previously, TOP-UP rows showed "—" for principal, making it appear that only the original disbursal was counted.
- **Ledger Totals Accuracy**: The "Ledger Totals (Filtered)" footer now explicitly includes TOP-UP amounts in the principal calculation, ensuring the totals correctly reflect `Original Principal + Top-ups - Principal Repayments`.
- **No Database Changes**: This is purely a frontend display fix - no SQL migration required.

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
