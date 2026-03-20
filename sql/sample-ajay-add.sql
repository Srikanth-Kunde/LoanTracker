-- Optional sample data for manual testing in Supabase SQL Editor
-- Run this only after migration.sql

INSERT INTO members (id, name, phone, address, email, join_date, is_active)
VALUES ('sample_ajay', 'Ajay', '9000000000', 'Legacy Ledger Member', NULL, '2012-04-01', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO loans (
    id,
    member_id,
    principal_amount,
    processing_fee,
    interest_rate,
    start_date,
    status,
    loan_type,
    duration_months,
    calculation_method,
    description,
    financial_year,
    is_legacy
)
VALUES (
    'sample_ajay_loan_2021',
    'sample_ajay',
    100000,
    0,
    1.5,
    '2021-10-10',
    'ACTIVE',
    'SPECIAL',
    0,
    'INTEREST_ONLY',
    'Sample ledger: original special loan for Ajay',
    '2021-2022',
    TRUE
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO loan_topups (id, loan_id, amount, rate, date, notes)
VALUES
    ('sample_ajay_topup_202201', 'sample_ajay_loan_2021', 100000, 1.5, '2022-01-12', 'Sample top-up from handwritten book scenario'),
    ('sample_ajay_topup_202307', 'sample_ajay_loan_2021', 100000, 1.5, '2023-07-15', 'Sample top-up from handwritten book scenario')
ON CONFLICT (id) DO NOTHING;

INSERT INTO loan_repayments (
    id,
    loan_id,
    date,
    amount,
    interest_paid,
    principal_paid,
    late_fee,
    method,
    notes
)
VALUES
    ('sample_ajay_rep_202111', 'sample_ajay_loan_2021', '2021-11-05', 1500, 1500, 0, 0, 'CASH', 'Interest starts in the month after October disbursal'),
    ('sample_ajay_rep_202202', 'sample_ajay_loan_2021', '2022-02-05', 3000, 3000, 0, 0, 'CASH', 'Interest on original principal plus January top-up'),
    ('sample_ajay_rep_202308', 'sample_ajay_loan_2021', '2023-08-05', 4500, 4500, 0, 0, 'CASH', 'Interest on principal after July 2023 top-up'),
    ('sample_ajay_rep_202312', 'sample_ajay_loan_2021', '2023-12-20', 54500, 4500, 50000, 0, 'CASH', 'Interest paid and partial principal reduction'),
    ('sample_ajay_rep_202402', 'sample_ajay_loan_2021', '2024-02-20', 53750, 3750, 50000, 0, 'CASH', 'Second partial principal reduction'),
    ('sample_ajay_rep_202412', 'sample_ajay_loan_2021', '2024-12-20', 53000, 3000, 50000, 0, 'CASH', 'Example later principal payment from the handwritten plan')
ON CONFLICT (id) DO NOTHING;
