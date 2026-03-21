import { Loan, LoanRepayment, LoanTopup } from '../types';
import { compareISODate, getISODateMonthYear, getLastDayOfMonthISO, normalizeISODate } from './date';

export interface InterestPeriod {
  year: number;
  month: number;
}

export interface LoanLedgerRow {
  id: string;
  date: string;
  createdAt?: string;
  entryType: 'DISBURSAL' | 'TOPUP' | 'REPAYMENT';
  amount: number;
  principalDelta: number;
  principalPaid: number;
  interestPaid: number;
  lateFee: number;
  notes?: string;
  balanceAfter: number;
  interestPeriod?: InterestPeriod | null;
}

const roundCurrency = (amount: number) => Math.round(amount * 100) / 100;

const compareCreatedAt = (a?: string, b?: string) => {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  return a.localeCompare(b);
};

const getEventPriority = (entryType: LoanLedgerRow['entryType']) => {
  if (entryType === 'DISBURSAL') return 0;
  if (entryType === 'TOPUP') return 1;
  return 2;
};

export const getInterestPeriodKey = ({ year, month }: InterestPeriod) =>
  `${year}-${String(month).padStart(2, '0')}`;

export const getInterestPeriodFromDate = (date: string): InterestPeriod => {
  const { year, month } = getISODateMonthYear(date);
  return { year, month };
};

export const getRepaymentInterestPeriod = (repayment: LoanRepayment): InterestPeriod | null => {
  if (repayment.interestForYear && repayment.interestForMonth) {
    return {
      year: repayment.interestForYear,
      month: repayment.interestForMonth
    };
  }

  if ((repayment.interestPaid || 0) <= 0) {
    return null;
  }

  return getInterestPeriodFromDate(repayment.date);
};

const getNextPeriod = ({ year, month }: InterestPeriod): InterestPeriod =>
  month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

const getPreviousPeriod = ({ year, month }: InterestPeriod): InterestPeriod =>
  month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };

const comparePeriods = (left: InterestPeriod, right: InterestPeriod) => {
  if (left.year !== right.year) return left.year - right.year;
  return left.month - right.month;
};

const isPeriodAfter = (left: InterestPeriod, right: InterestPeriod) =>
  left.year > right.year || (left.year === right.year && left.month > right.month);

const isSamePeriod = (left: InterestPeriod, right: InterestPeriod) =>
  left.year === right.year && left.month === right.month;

export const getEffectiveLoanRate = (loan: Loan, topups: LoanTopup[], asOfDate?: string) => {
  const cutoff = asOfDate ? normalizeISODate(asOfDate) : null;
  let effectiveRate = Number(loan.interestRate || 0);

  topups
    .filter(t => t.loanId === loan.id)
    .sort((a, b) => compareISODate(a.date, b.date) || compareCreatedAt(a.createdAt, b.createdAt))
    .forEach(topup => {
      const topupDate = normalizeISODate(topup.date);
      if (!cutoff || topupDate <= cutoff) {
        effectiveRate = Number(topup.rate || effectiveRate);
      }
    });

  return effectiveRate;
};

export const getSpecialLoanOutstandingFromEvents = (
  loan: Loan,
  topups: LoanTopup[],
  repayments: LoanRepayment[],
  asOfDate?: string
) => {
  const cutoff = asOfDate ? normalizeISODate(asOfDate) : null;
  const startDate = normalizeISODate(loan.startDate);

  if (cutoff && cutoff < startDate) {
    return 0;
  }

  let totalPrincipal = Number(loan.principalAmount || 0);

  topups.forEach(topup => {
    if (topup.loanId !== loan.id) return;
    const topupDate = normalizeISODate(topup.date);
    if (!cutoff || topupDate <= cutoff) {
      totalPrincipal += Number(topup.amount || 0);
    }
  });

  repayments.forEach(repayment => {
    if (repayment.loanId !== loan.id) return;
    const repaymentDate = normalizeISODate(repayment.date);
    if (!cutoff || repaymentDate <= cutoff) {
      totalPrincipal -= Number(repayment.principalPaid || 0);
    }
  });

  const result = roundCurrency(totalPrincipal);
  return result > 1 ? result : 0;
};

export const getInterestDueForPeriod = (
  loan: Loan,
  topups: LoanTopup[],
  repayments: LoanRepayment[],
  period: InterestPeriod
) => {
  const startPeriod = getInterestPeriodFromDate(loan.startDate);
  if (!isPeriodAfter(period, startPeriod)) {
    return { openingOutstanding: 0, interestDue: 0, rate: Number(loan.interestRate || 0) };
  }

  const previousPeriod = getPreviousPeriod(period);
  const asOfDate = getLastDayOfMonthISO(previousPeriod.year, previousPeriod.month);
  const openingOutstanding = getSpecialLoanOutstandingFromEvents(loan, topups, repayments, asOfDate);
  const rate = getEffectiveLoanRate(loan, topups, asOfDate);

  if (openingOutstanding <= 1) {
    return { openingOutstanding: 0, interestDue: 0, rate };
  }

  return {
    openingOutstanding,
    interestDue: roundCurrency(openingOutstanding * (rate / 100)),
    rate
  };
};

const getSustainedZeroBalanceDate = (
  loan: Loan,
  topups: LoanTopup[],
  repayments: LoanRepayment[]
) => {
  const ledger = buildLoanLedger(loan, topups, repayments);
  let zeroBalanceDate: string | null = null;

  ledger.forEach(row => {
    if (row.balanceAfter <= 1) {
      zeroBalanceDate = row.date;
      return;
    }

    zeroBalanceDate = null;
  });

  return zeroBalanceDate;
};

export const getAutoGenerationStopDate = (
  loan: Loan,
  topups: LoanTopup[],
  repayments: LoanRepayment[],
  endPeriod: InterestPeriod
) => {
  let stopDate = getLastDayOfMonthISO(endPeriod.year, endPeriod.month);
  const zeroBalanceDate = getSustainedZeroBalanceDate(loan, topups, repayments);

  if (loan.endDate && compareISODate(loan.endDate, stopDate) < 0) {
    stopDate = normalizeISODate(loan.endDate);
  }

  if (zeroBalanceDate && compareISODate(zeroBalanceDate, stopDate) < 0) {
    stopDate = zeroBalanceDate;
  }

  return stopDate;
};

const getChargeableInterestPeriods = (
  loan: Loan,
  topups: LoanTopup[],
  repayments: LoanRepayment[],
  endPeriod: InterestPeriod
) => {
  const startPeriod = getInterestPeriodFromDate(loan.startDate);
  const stopDate = getAutoGenerationStopDate(loan, topups, repayments, endPeriod);
  const stopPeriod = getInterestPeriodFromDate(stopDate);
  let cursor = getNextPeriod(startPeriod);
  const periods: Array<InterestPeriod & {
    interestDue: number;
    openingOutstanding: number;
    rate: number;
    postingDate: string;
  }> = [];

  while (comparePeriods(cursor, stopPeriod) <= 0) {
    const periodDue = getInterestDueForPeriod(loan, topups, repayments, cursor);
    if (periodDue.interestDue > 0) {
      periods.push({
        ...cursor,
        interestDue: periodDue.interestDue,
        openingOutstanding: periodDue.openingOutstanding,
        rate: periodDue.rate,
        postingDate: isSamePeriod(cursor, stopPeriod)
          ? stopDate
          : getLastDayOfMonthISO(cursor.year, cursor.month)
      });
    }
    cursor = getNextPeriod(cursor);
  }

  return periods;
};

export const getInterestPaidForPeriod = (
  repayments: LoanRepayment[],
  loanId: string,
  period: InterestPeriod
) => {
  const targetKey = getInterestPeriodKey(period);

  return roundCurrency(repayments.reduce((sum, repayment) => {
    if (repayment.loanId !== loanId) return sum;
    const assignedPeriod = getRepaymentInterestPeriod(repayment);
    if (!assignedPeriod) return sum;
    return getInterestPeriodKey(assignedPeriod) === targetKey
      ? sum + Number(repayment.interestPaid || 0)
      : sum;
  }, 0));
};

export const isInterestSettledForPeriod = (
  repayments: LoanRepayment[],
  loanId: string,
  period: InterestPeriod
) => getInterestPaidForPeriod(repayments, loanId, period) > 0;

export const getMissingInterestPeriods = (
  loan: Loan,
  topups: LoanTopup[],
  repayments: LoanRepayment[],
  endPeriod: InterestPeriod
) => {
  const invalidRepaymentIds = new Set(
    getInvalidInterestRepayments(loan, topups, repayments, endPeriod).map(repayment => repayment.id)
  );
  const validRepayments = repayments.filter(repayment => !invalidRepaymentIds.has(repayment.id));

  return getChargeableInterestPeriods(loan, topups, repayments, endPeriod).filter(period =>
    !isInterestSettledForPeriod(validRepayments, loan.id, period)
  );
};

export const getInvalidInterestRepayments = (
  loan: Loan,
  topups: LoanTopup[],
  repayments: LoanRepayment[],
  endPeriod: InterestPeriod
) => {
  const chargeablePeriods = getChargeableInterestPeriods(loan, topups, repayments, endPeriod);
  const validPeriodKeys = new Set(chargeablePeriods.map(getInterestPeriodKey));
  const stopDate = getAutoGenerationStopDate(loan, topups, repayments, endPeriod);

  return repayments.filter(repayment => {
    if (repayment.loanId !== loan.id || (repayment.interestPaid || 0) <= 0) {
      return false;
    }

    const assignedPeriod = getRepaymentInterestPeriod(repayment);
    if (!assignedPeriod) {
      return compareISODate(repayment.date, stopDate) > 0;
    }

    if (!validPeriodKeys.has(getInterestPeriodKey(assignedPeriod))) {
      return true;
    }

    return compareISODate(repayment.date, stopDate) > 0;
  });
};

export const buildLoanLedger = (
  loan: Loan,
  topups: LoanTopup[],
  repayments: LoanRepayment[]
): LoanLedgerRow[] => {
  const rows: LoanLedgerRow[] = [{
    id: `loan:${loan.id}`,
    date: normalizeISODate(loan.startDate),
    entryType: 'DISBURSAL',
    amount: Number(loan.principalAmount || 0),
    principalDelta: Number(loan.principalAmount || 0),
    principalPaid: 0,
    interestPaid: 0,
    lateFee: 0,
    notes: loan.description || loan.remarks || 'Original loan disbursal',
    balanceAfter: 0,
    interestPeriod: null
  }];

  topups
    .filter(t => t.loanId === loan.id)
    .forEach(topup => {
      rows.push({
        id: topup.id,
        date: normalizeISODate(topup.date),
        createdAt: topup.createdAt,
        entryType: 'TOPUP',
        amount: Number(topup.amount || 0),
        principalDelta: Number(topup.amount || 0),
        principalPaid: 0,
        interestPaid: 0,
        lateFee: 0,
        notes: topup.notes,
        balanceAfter: 0,
        interestPeriod: null
      });
    });

  repayments
    .filter(r => r.loanId === loan.id)
    .forEach(repayment => {
      rows.push({
        id: repayment.id,
        date: normalizeISODate(repayment.date),
        createdAt: repayment.createdAt,
        entryType: 'REPAYMENT',
        amount: Number(repayment.amount || 0),
        principalDelta: -Number(repayment.principalPaid || 0),
        principalPaid: Number(repayment.principalPaid || 0),
        interestPaid: Number(repayment.interestPaid || 0),
        lateFee: Number(repayment.lateFee || 0),
        notes: repayment.notes,
        balanceAfter: 0,
        interestPeriod: getRepaymentInterestPeriod(repayment)
      });
    });

  rows.sort((a, b) =>
    compareISODate(a.date, b.date) ||
    compareCreatedAt(a.createdAt, b.createdAt) ||
    getEventPriority(a.entryType) - getEventPriority(b.entryType) ||
    a.id.localeCompare(b.id)
  );

  let balance = 0;
  return rows.map(row => {
    balance = roundCurrency(balance + row.principalDelta);
    return {
      ...row,
      balanceAfter: balance > 1 ? balance : 0
    };
  });
};

export const getLastInterestPaymentDate = (repayments: LoanRepayment[], loanId: string) => {
  const dates = repayments
    .filter(repayment => repayment.loanId === loanId && (repayment.interestPaid || 0) > 0)
    .map(repayment => repayment.date)
    .sort(compareISODate);

  return dates.at(-1) || null;
};
