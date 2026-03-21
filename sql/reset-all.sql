-- Full schema reset for LoanTracker
-- WARNING: This permanently deletes all application data.
-- Run this first, then run ../migration.sql to recreate the schema.

BEGIN;

DROP TABLE IF EXISTS loan_repayments CASCADE;
DROP TABLE IF EXISTS loan_topups CASCADE;
DROP TABLE IF EXISTS loans CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS app_settings CASCADE;
DROP TABLE IF EXISTS members CASCADE;
DROP TABLE IF EXISTS payments CASCADE;

DROP FUNCTION IF EXISTS validate_loan_event_dates() CASCADE;
DROP FUNCTION IF EXISTS validate_loan_start_date_update() CASCADE;

COMMIT;
