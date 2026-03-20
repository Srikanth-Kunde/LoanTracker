-- Optional sample data for manual testing in Supabase SQL Editor
-- Run this only after migration.sql
-- Includes:
-- 1. Ajay: up-to-date monthly interest with partial principal repayments
-- 2. Srikanth: long-running special loan from October 2012 with multiple top-ups,
--    regular monthly interest, part-payments, and two prorated-interest cases

INSERT INTO members (id, name, phone, address, email, join_date, is_active)
VALUES
    ('sample_ajay', 'Ajay', '9000000000', 'Legacy Ledger Member', NULL, '2012-04-01', TRUE),
    ('sample_srikanth', 'Srikanth', '9000000001', 'Long Running Ledger Member', NULL, '2012-04-01', TRUE)
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
VALUES
    (
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
        'Sample ledger: Ajay special loan with top-ups and current interest paid on time',
        '2021-2022',
        TRUE
    ),
    (
        'sample_srikanth_loan_2012',
        'sample_srikanth',
        50000,
        0,
        1.5,
        '2012-10-10',
        'ACTIVE',
        'SPECIAL',
        0,
        'INTEREST_ONLY',
        'Sample ledger: Srikanth long-running special loan from October 2012',
        '2012-2013',
        TRUE
    )
ON CONFLICT (id) DO NOTHING;

INSERT INTO loan_topups (id, loan_id, amount, rate, date, notes)
VALUES
    ('sample_ajay_topup_202201', 'sample_ajay_loan_2021', 100000, 1.5, '2022-01-12', 'Ajay top-up 1'),
    ('sample_ajay_topup_202307', 'sample_ajay_loan_2021', 100000, 1.5, '2023-07-15', 'Ajay top-up 2'),
    ('sample_srikanth_topup_201304', 'sample_srikanth_loan_2012', 50000, 1.5, '2013-04-15', 'Srikanth top-up 1'),
    ('sample_srikanth_topup_201401', 'sample_srikanth_loan_2012', 75000, 1.5, '2014-01-10', 'Srikanth top-up 2'),
    ('sample_srikanth_topup_201506', 'sample_srikanth_loan_2012', 100000, 1.5, '2015-06-16', '15-day prorated interest case for delayed disbursal'),
    ('sample_srikanth_topup_201608', 'sample_srikanth_loan_2012', 100000, 1.5, '2016-08-10', 'Srikanth top-up 4'),
    ('sample_srikanth_topup_201709', 'sample_srikanth_loan_2012', 125000, 1.5, '2017-09-11', '20-day prorated interest case for delayed disbursal'),
    ('sample_srikanth_topup_201812', 'sample_srikanth_loan_2012', 100000, 1.5, '2018-12-10', 'Srikanth top-up 6'),
    ('sample_srikanth_topup_202002', 'sample_srikanth_loan_2012', 150000, 1.5, '2020-02-15', 'Srikanth top-up 7'),
    ('sample_srikanth_topup_202107', 'sample_srikanth_loan_2012', 100000, 1.5, '2021-07-05', 'Srikanth top-up 8'),
    ('sample_srikanth_topup_202303', 'sample_srikanth_loan_2012', 100000, 1.5, '2023-03-10', 'Srikanth top-up 9'),
    ('sample_srikanth_topup_202408', 'sample_srikanth_loan_2012', 150000, 1.5, '2024-08-20', 'Srikanth top-up 10')
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
    ('sample_ajay_prin_202312', 'sample_ajay_loan_2021', '2023-12-20', 50000, 0, 50000, 0, 'CASH', 'Ajay part payment'),
    ('sample_ajay_prin_202402', 'sample_ajay_loan_2021', '2024-02-20', 50000, 0, 50000, 0, 'CASH', 'Ajay part payment'),
    ('sample_ajay_prin_202412', 'sample_ajay_loan_2021', '2024-12-20', 50000, 0, 50000, 0, 'CASH', 'Ajay part payment'),
    ('sample_srikanth_prin_201412', 'sample_srikanth_loan_2012', '2014-12-20', 50000, 0, 50000, 0, 'CASH', 'Srikanth principal part payment'),
    ('sample_srikanth_prin_201612', 'sample_srikanth_loan_2012', '2016-12-20', 75000, 0, 75000, 0, 'CASH', 'Srikanth principal part payment'),
    ('sample_srikanth_prin_201806', 'sample_srikanth_loan_2012', '2018-06-15', 100000, 0, 100000, 0, 'CASH', 'Srikanth principal part payment'),
    ('sample_srikanth_prin_201911', 'sample_srikanth_loan_2012', '2019-11-25', 75000, 0, 75000, 0, 'CASH', 'Srikanth principal part payment'),
    ('sample_srikanth_prin_202112', 'sample_srikanth_loan_2012', '2021-12-15', 150000, 0, 150000, 0, 'CASH', 'Srikanth principal part payment'),
    ('sample_srikanth_prin_202312', 'sample_srikanth_loan_2012', '2023-12-20', 100000, 0, 100000, 0, 'CASH', 'Srikanth principal part payment'),
    ('sample_srikanth_prin_202412', 'sample_srikanth_loan_2012', '2024-12-20', 100000, 0, 100000, 0, 'CASH', 'Srikanth principal part payment'),
    ('sample_srikanth_prin_202508', 'sample_srikanth_loan_2012', '2025-08-10', 75000, 0, 75000, 0, 'CASH', 'Srikanth principal part payment'),
    ('sample_srikanth_prin_202602', 'sample_srikanth_loan_2012', '2026-02-15', 75000, 0, 75000, 0, 'CASH', 'Srikanth principal part payment')
ON CONFLICT (id) DO NOTHING;

WITH ajay_topups(topup_date, amount) AS (
    VALUES
        ('2022-01-12'::date, 100000::numeric),
        ('2023-07-15'::date, 100000::numeric)
),
ajay_principal_payments(payment_date, amount) AS (
    VALUES
        ('2023-12-20'::date, 50000::numeric),
        ('2024-02-20'::date, 50000::numeric),
        ('2024-12-20'::date, 50000::numeric)
),
ajay_months AS (
    SELECT generate_series('2021-11-05'::date, '2026-03-05'::date, interval '1 month')::date AS pay_date
)
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
SELECT
    'sample_ajay_int_' || to_char(pay_date, 'YYYYMM'),
    'sample_ajay_loan_2021',
    pay_date,
    ROUND((
        100000::numeric
        + COALESCE((SELECT SUM(amount) FROM ajay_topups t WHERE t.topup_date < pay_date), 0)
        - COALESCE((SELECT SUM(amount) FROM ajay_principal_payments p WHERE p.payment_date < pay_date), 0)
    ) * 0.015, 2),
    ROUND((
        100000::numeric
        + COALESCE((SELECT SUM(amount) FROM ajay_topups t WHERE t.topup_date < pay_date), 0)
        - COALESCE((SELECT SUM(amount) FROM ajay_principal_payments p WHERE p.payment_date < pay_date), 0)
    ) * 0.015, 2),
    0,
    0,
    'CASH',
    'Ajay monthly interest paid on time'
FROM ajay_months
ON CONFLICT (id) DO NOTHING;

WITH srikanth_topups(topup_date, amount) AS (
    VALUES
        ('2013-04-15'::date, 50000::numeric),
        ('2014-01-10'::date, 75000::numeric),
        ('2015-06-16'::date, 100000::numeric),
        ('2016-08-10'::date, 100000::numeric),
        ('2017-09-11'::date, 125000::numeric),
        ('2018-12-10'::date, 100000::numeric),
        ('2020-02-15'::date, 150000::numeric),
        ('2021-07-05'::date, 100000::numeric),
        ('2023-03-10'::date, 100000::numeric),
        ('2024-08-20'::date, 150000::numeric)
),
srikanth_principal_payments(payment_date, amount) AS (
    VALUES
        ('2014-12-20'::date, 50000::numeric),
        ('2016-12-20'::date, 75000::numeric),
        ('2018-06-15'::date, 100000::numeric),
        ('2019-11-25'::date, 75000::numeric),
        ('2021-12-15'::date, 150000::numeric),
        ('2023-12-20'::date, 100000::numeric),
        ('2024-12-20'::date, 100000::numeric),
        ('2025-08-10'::date, 75000::numeric),
        ('2026-02-15'::date, 75000::numeric)
),
srikanth_months AS (
    SELECT generate_series('2012-11-05'::date, '2026-03-05'::date, interval '1 month')::date AS pay_date
),
srikanth_balances AS (
    SELECT
        pay_date,
        50000::numeric
        + COALESCE((SELECT SUM(amount) FROM srikanth_topups t WHERE t.topup_date < pay_date), 0)
        - COALESCE((SELECT SUM(amount) FROM srikanth_principal_payments p WHERE p.payment_date < pay_date), 0) AS outstanding_before_payment
    FROM srikanth_months
)
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
SELECT
    'sample_srikanth_int_' || to_char(pay_date, 'YYYYMM'),
    'sample_srikanth_loan_2012',
    pay_date,
    ROUND(
        CASE
            WHEN pay_date = '2015-07-05'::date THEN (outstanding_before_payment * 0.015) - 750
            WHEN pay_date = '2017-10-05'::date THEN (outstanding_before_payment * 0.015) - 625
            ELSE outstanding_before_payment * 0.015
        END,
        2
    ),
    ROUND(
        CASE
            WHEN pay_date = '2015-07-05'::date THEN (outstanding_before_payment * 0.015) - 750
            WHEN pay_date = '2017-10-05'::date THEN (outstanding_before_payment * 0.015) - 625
            ELSE outstanding_before_payment * 0.015
        END,
        2
    ),
    0,
    0,
    'CASH',
    CASE
        WHEN pay_date = '2015-07-05'::date THEN '15-day prorated interest for delayed top-up date'
        WHEN pay_date = '2017-10-05'::date THEN '20-day prorated interest for delayed top-up date'
        ELSE 'Srikanth monthly interest paid on time'
    END
FROM srikanth_balances
ON CONFLICT (id) DO NOTHING;
