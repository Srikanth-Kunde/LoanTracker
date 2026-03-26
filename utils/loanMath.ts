import { Loan, LoanRepayment, LoanStatus, LoanTopup, SocietySettings } from '../types';
import { getInterestRateForDate } from './interest';
import { compareISODate, getDaysInMonth, getISODateMonthYear, getLastDayOfMonthISO, normalizeISODate } from './date';

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
  interestDays?: number;
  interestCalculationType?: string;
  rate?: number;
}

export interface FuturePrincipalActivity {
  id: string;
  date: string;
  entryType: 'TOPUP' | 'REPAYMENT';
  amount: number;
}

export interface LoanClosureValidation {
  canClose: boolean;
  outstandingAtClose: number;
  futurePrincipalActivity: FuturePrincipalActivity[];
  reason?: string;
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

const formatAmountForMessage = (amount: number) =>
  Number.isInteger(amount) ? String(amount) : amount.toFixed(2);

export const getEffectiveLoanRate = (loan: Loan, topups: LoanTopup[], asOfDate?: string, settings?: SocietySettings) => {
  // If a global schedule is provided and we have an asOfDate, it becomes the authoritative source
  // for this specific date, overriding any sticky rates from loan or top-ups.
  if (settings && asOfDate) {
    return getInterestRateForDate(asOfDate, settings);
  }

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
      // For special loans, we treat any amount not allocated to interest as principal reduction
      // Use || 0 to treat missing or 0 principalPaid as an invitation to check the amount-based residual
      const principalPart = repayment.principalPaid ||
        (Number(repayment.amount || 0) - Number(repayment.interestPaid || 0));
      totalPrincipal -= principalPart;
    }
  });

  const result = roundCurrency(totalPrincipal);
  return result > 1 ? result : 0;
};

export const getFuturePrincipalActivityAfterDate = (
  loan: Loan,
  topups: LoanTopup[],
  repayments: LoanRepayment[],
  closeDate: string
): FuturePrincipalActivity[] => {
  const cutoff = normalizeISODate(closeDate);

  return buildLoanLedger(loan, topups, repayments)
    .filter(row => compareISODate(row.date, cutoff) > 0)
    .filter(row =>
      row.entryType === 'TOPUP' ||
      (row.entryType === 'REPAYMENT' && Number(row.principalPaid || 0) > 0)
    )
    .map(row => ({
      id: row.id,
      date: row.date,
      entryType: row.entryType === 'TOPUP' ? 'TOPUP' : 'REPAYMENT',
      amount: row.entryType === 'TOPUP'
        ? Number(row.amount || 0)
        : Number(row.principalPaid || 0)
    }));
};

export const validateLoanCanCloseOnDate = (
  loan: Loan,
  topups: LoanTopup[],
  repayments: LoanRepayment[],
  closeDate: string
): LoanClosureValidation => {
  const normalizedCloseDate = normalizeISODate(closeDate);
  const outstandingAtClose = getSpecialLoanOutstandingFromEvents(loan, topups, repayments, normalizedCloseDate);

  if (outstandingAtClose > 1) {
    return {
      canClose: false,
      outstandingAtClose,
      futurePrincipalActivity: [],
      reason: `Loan cannot be closed on ${normalizedCloseDate} because outstanding principal is Rs.${formatAmountForMessage(outstandingAtClose)}.`
    };
  }

  const futurePrincipalActivity = getFuturePrincipalActivityAfterDate(loan, topups, repayments, normalizedCloseDate);
  if (futurePrincipalActivity.length > 0) {
    const firstFutureEntry = futurePrincipalActivity[0];
    const entryLabel = firstFutureEntry.entryType === 'TOPUP' ? 'top-up' : 'principal repayment';

    return {
      canClose: false,
      outstandingAtClose,
      futurePrincipalActivity,
      reason: `Loan cannot be closed on ${normalizedCloseDate} because later principal activity exists (${entryLabel} on ${firstFutureEntry.date}). Choose a later close date or remove the future entry first.`
    };
  }

  return {
    canClose: true,
    outstandingAtClose,
    futurePrincipalActivity: []
  };
};

export const getInterestDueForPeriod = (
  loan: Loan,
  topups: LoanTopup[],
  repayments: LoanRepayment[],
  period: InterestPeriod,
  settings?: SocietySettings
) => {
  const startPeriod = getInterestPeriodFromDate(loan.startDate);
  if (comparePeriods(period, startPeriod) < 0) {
    return { openingOutstanding: 0, interestDue: 0, rate: Number(loan.interestRate || 0) };
  }

  let openingOutstanding = 0;
  if (isSamePeriod(period, startPeriod)) {
    // For the very first month, the opening balance is the initial principal
    openingOutstanding = Number(loan.principalAmount || 0);
  } else {
    const previousPeriod = getPreviousPeriod(period);
    const asOfDate = getLastDayOfMonthISO(previousPeriod.year, previousPeriod.month);
    openingOutstanding = getSpecialLoanOutstandingFromEvents(loan, topups, repayments, asOfDate);
  }

  const periodEndDate = getLastDayOfMonthISO(period.year, period.month);
  const rate = getEffectiveLoanRate(loan, topups, periodEndDate, settings);

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

  // If loan is active, we MUST iterate up to the provided endPeriod (usually today)
  // regardless of historical zero-balance dates, to find periods after Top-ups.
  if (loan.status === LoanStatus.ACTIVE) {
    return stopDate;
  }

  if (loan.status === LoanStatus.CLOSED && loan.endDate && compareISODate(loan.endDate, stopDate) < 0) {
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
  endPeriod: InterestPeriod,
  settings?: SocietySettings
) => {
  const startPeriod = getInterestPeriodFromDate(loan.startDate);
  const stopDate = getAutoGenerationStopDate(loan, topups, repayments, endPeriod);
  const stopPeriod = getInterestPeriodFromDate(stopDate);

  // For active loans with top-ups, find the first top-up date to start from
  // BUT only skip the zero-balance gap, not all periods before top-up
  let effectiveStartPeriod = startPeriod;
  const firstTopup = topups
    .filter(t => t.loanId === loan.id)
    .sort((a, b) => compareISODate(a.date, b.date))[0];

  // Get the zero-balance date to know if there was a gap
  const zeroBalanceDate = getSustainedZeroBalanceDate(loan, topups, repayments);

  // Only adjust start if there was a zero-balance gap AND a top-up after it
  if (firstTopup && zeroBalanceDate) {
    const zeroBalancePeriod = getInterestPeriodFromDate(zeroBalanceDate);
    const topupPeriod = getInterestPeriodFromDate(firstTopup.date);

    // If top-up is after zero-balance, start from top-up
    if (comparePeriods(topupPeriod, zeroBalancePeriod) > 0) {
      effectiveStartPeriod = topupPeriod;
    }
  }

  // Start from the month AFTER the loan began (or first topup for active loans with zero balance gaps)
  // Skip the first partial month - interest for the month of disbursal is charged in the following month
  let cursor = getNextPeriod(effectiveStartPeriod);
  const periods: Array<InterestPeriod & {
    interestDue: number;
    openingOutstanding: number;
    rate: number;
    postingDate: string;
  }> = [];

  while (comparePeriods(cursor, stopPeriod) <= 0) {
    const periodDue = getInterestDueForPeriod(loan, topups, repayments, cursor, settings);
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
  endPeriod: InterestPeriod,
  settings?: SocietySettings
) => {
  const invalidRepaymentIds = new Set(
    getInvalidInterestRepayments(loan, topups, repayments, endPeriod, settings).map(repayment => repayment.id)
  );
  const validRepayments = repayments.filter(repayment => !invalidRepaymentIds.has(repayment.id));

  return getChargeableInterestPeriods(loan, topups, repayments, endPeriod, settings).filter(period =>
    !isInterestSettledForPeriod(validRepayments, loan.id, period)
  );
};

export const getInvalidInterestRepayments = (
  loan: Loan,
  topups: LoanTopup[],
  repayments: LoanRepayment[],
  endPeriod: InterestPeriod,
  settings?: SocietySettings
) => {
  const chargeablePeriods = getChargeableInterestPeriods(loan, topups, repayments, endPeriod, settings);
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
    interestPeriod: null,
    rate: Number(loan.interestRate || 0)
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
        interestPeriod: null,
        rate: Number(topup.rate || 0)
      });
    });

  repayments
    .filter(r => String(r.loanId) === String(loan.id))

    .forEach(repayment => {
      rows.push({
        id: repayment.id,
        date: normalizeISODate(repayment.date),
        createdAt: repayment.createdAt,
        entryType: 'REPAYMENT',
        amount: Number(repayment.amount || 0),
        principalDelta: -(repayment.principalPaid || (Number(repayment.amount || 0) - Number(repayment.interestPaid || 0))),
        principalPaid: repayment.principalPaid || (Number(repayment.amount || 0) - Number(repayment.interestPaid || 0)),

        interestPaid: Number(repayment.interestPaid || 0),
        lateFee: Number(repayment.lateFee || 0),
        notes: repayment.notes,
        balanceAfter: 0,
        interestPeriod: getRepaymentInterestPeriod(repayment),
        interestDays: repayment.interestDays,
        interestCalculationType: repayment.interestCalculationType

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

export const getProratedInterestForDays = (
  principal: number,
  monthlyRate: number,
  year: number,
  month: number,
  daysHeld: number
) => {
  const monthDays = getDaysInMonth(year, month);
  const safeDaysHeld = Math.min(Math.max(Math.round(daysHeld), 0), monthDays);
  const fullMonthInterest = roundCurrency(principal * (monthlyRate / 100));
  const proratedInterest = roundCurrency(fullMonthInterest * (safeDaysHeld / monthDays));

  return {
    monthDays,
    daysHeld: safeDaysHeld,
    fullMonthInterest,
    proratedInterest
  };
};
