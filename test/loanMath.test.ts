import assert from 'node:assert/strict';
import { Loan, LoanRepayment, LoanStatus, LoanTopup, LoanType, PaymentMethod } from '../types';
import {
  buildLoanLedger,
  getInterestDueForPeriod,
  getInterestPaidForPeriod,
  getMissingInterestPeriods,
  getSpecialLoanOutstandingFromEvents
} from '../utils/loanMath';

const makeLoan = (overrides: Partial<Loan> = {}): Loan => ({
  id: 'loan_1',
  memberId: 'mem_1',
  principalAmount: 100000,
  interestRate: 1.5,
  startDate: '2012-10-10',
  status: LoanStatus.ACTIVE,
  type: LoanType.SPECIAL,
  calculationMethod: 'INTEREST_ONLY',
  ...overrides
});

const makeTopup = (id: string, amount: number, date: string, rate = 1.5, createdAt?: string): LoanTopup => ({
  id,
  loanId: 'loan_1',
  amount,
  rate,
  date,
  createdAt
});

const makeRepayment = (id: string, overrides: Partial<LoanRepayment>): LoanRepayment => ({
  id,
  loanId: 'loan_1',
  date: '2024-01-05',
  amount: 0,
  principalPaid: 0,
  interestPaid: 0,
  lateFee: 0,
  method: PaymentMethod.CASH,
  ...overrides
});

{
  const loan = makeLoan();
  const topups = [
    makeTopup('top_2022', 100000, '2022-01-15'),
    makeTopup('top_2023', 100000, '2023-07-20')
  ];
  const repayments = [
    makeRepayment('rep_dec_2023', { date: '2023-12-20', amount: 50000, principalPaid: 50000 }),
    makeRepayment('rep_feb_2024', { date: '2024-02-20', amount: 10000, principalPaid: 10000 })
  ];

  assert.equal(
    getSpecialLoanOutstandingFromEvents(loan, topups, repayments),
    240000,
    'Outstanding should reflect original + top-ups - principal repayments'
  );

  const feb2024 = getInterestDueForPeriod(loan, topups, repayments, { year: 2024, month: 2 });
  assert.equal(feb2024.openingOutstanding, 250000, 'February 2024 interest should use January closing principal');
  assert.equal(feb2024.interestDue, 3750, 'February 2024 interest should be 1.5% of 250000');

  const mar2024 = getInterestDueForPeriod(loan, topups, repayments, { year: 2024, month: 3 });
  assert.equal(mar2024.openingOutstanding, 240000, 'March 2024 interest should reflect February principal repayment');
  assert.equal(mar2024.interestDue, 3600, 'March 2024 interest should be 1.5% of 240000');
}

{
  const loan = makeLoan({ startDate: '2023-11-10' });
  const repayments = [
    makeRepayment('rep_principal_only', {
      date: '2024-01-05',
      amount: 25000,
      principalPaid: 25000,
      interestPaid: 0
    }),
    makeRepayment('rep_interest_in_arrears', {
      date: '2024-02-10',
      amount: 1500,
      interestPaid: 1500,
      interestForMonth: 12,
      interestForYear: 2023
    })
  ];

  assert.equal(
    getInterestPaidForPeriod(repayments, loan.id, { year: 2023, month: 12 }),
    1500,
    'Interest settlement should follow the explicit allocated period'
  );

  const missing = getMissingInterestPeriods(loan, [], repayments, { year: 2024, month: 2 });
  assert.deepEqual(
    missing.map(period => `${period.year}-${String(period.month).padStart(2, '0')}`),
    ['2024-01', '2024-02'],
    'A principal-only repayment must not mark the month as interest-paid'
  );
}

{
  const loan = makeLoan({ startDate: '2024-01-01', principalAmount: 50000 });
  const topups = [makeTopup('top_same_day', 10000, '2024-03-01', 1.5, '2024-03-01T09:00:00.000Z')];
  const repayments = [
    makeRepayment('rep_same_day', {
      date: '2024-03-01',
      amount: 5000,
      principalPaid: 5000,
      createdAt: '2024-03-01T10:00:00.000Z'
    })
  ];

  const ledger = buildLoanLedger(loan, topups, repayments);
  assert.deepEqual(
    ledger.map(row => row.balanceAfter),
    [50000, 60000, 55000],
    'Running balance should be deterministic and respect same-day created_at ordering'
  );
}

console.log('loanMath regression tests passed');
