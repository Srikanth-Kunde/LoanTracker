-- Remove optional Ajay sample data from Supabase
-- Run this in SQL Editor whenever you want a clean database

DELETE FROM loan_repayments WHERE id LIKE 'sample_ajay_%';
DELETE FROM loan_topups WHERE id LIKE 'sample_ajay_%';
DELETE FROM loans WHERE id LIKE 'sample_ajay_%';
DELETE FROM members WHERE id = 'sample_ajay';
