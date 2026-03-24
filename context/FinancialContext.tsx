import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSettings } from './SettingsContext';
import { Loan, LoanRepayment, LoanStatus, PaymentMethod, LoanType, LoanCalculationMethod, LoanTopup, InterestCalculationType } from '../types';
import { getIndianFinancialYear } from '../constants';
import { supabase } from '../supabaseClient';
import { logger } from '../utils/logger';
import {
  normalizeISODate
} from '../utils/date';
import { getInvalidInterestRepayments, getSpecialLoanOutstandingFromEvents, validateLoanCanCloseOnDate } from '../utils/loanMath';

interface FinancialContextType {
  loans: Loan[];
  loanRepayments: LoanRepayment[];
  loanTopups: LoanTopup[];

  createLoan: (loan: Omit<Loan, 'id'>) => Promise<void>;
  updateLoan: (loan: Loan) => Promise<void>;
  deleteLoan: (id: string) => Promise<void>;
  recordLoanRepayment: (repayment: Omit<LoanRepayment, 'id'>) => Promise<void>;
  updateLoanRepayment: (repayment: LoanRepayment) => Promise<void>;
  bulkRecordLoanRepayments: (repayments: Omit<LoanRepayment, 'id'>[]) => Promise<void>;
  deleteLoanRepayment: (id: string) => Promise<void>;
  closeLoan: (loanId: string, endDate?: string) => Promise<void>;

  // Top-up actions (Special / Interest-Only loans)
  addLoanTopup: (topup: Omit<LoanTopup, 'id' | 'createdAt'>) => Promise<void>;
  updateLoanTopup: (topup: LoanTopup) => Promise<void>;
  deleteLoanTopup: (id: string) => Promise<void>;
  wipeLoanInterest: (loanId: string) => Promise<void>;
  cleanupInvalidLoanInterest: (loanId: string) => Promise<number>;
  getSpecialLoanOutstanding: (loanId: string, asOfDate?: string) => number;

  setFinancialData: (data: { loans?: Loan[], loanRepayments?: LoanRepayment[] }) => void;
  importFinancials: (data: { loans?: Loan[], loanRepayments?: LoanRepayment[] }) => Promise<void>;
  deleteAllFinancials: () => Promise<void>;
  resetFinancials: () => void;
  isLoading: boolean;
}

const FinancialContext = createContext<FinancialContextType | undefined>(undefined);

export const FinancialProvider = ({ children }: { children: React.ReactNode }) => {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loanRepayments, setLoanRepayments] = useState<LoanRepayment[]>([]);
  const [loanTopups, setLoanTopups] = useState<LoanTopup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { settings } = useSettings();

  const roundCurrency = useCallback((value: number) => Math.round(value * 100) / 100, []);

  const fetchFinancials = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) {
        setIsLoading(true);
      }
      logger.info('Fetching initial financial data from Supabase');

      const [loansRes, repaymentsRes, topupsRes] = await Promise.all([
        supabase.from('loans').select('*').order('created_at', { ascending: false }),
        supabase.from('loan_repayments').select('*'),
        supabase.from('loan_topups').select('*')
      ]);

      if (loansRes.error) throw loansRes.error;
      if (repaymentsRes.error) throw repaymentsRes.error;
      if (topupsRes.error) throw topupsRes.error;

      if (loansRes.data) {
        setLoans((loansRes.data as any[]).map(l => ({
          id: l.id,
          memberId: l.member_id,
          principalAmount: Number(l.principal_amount),
          processingFee: Number(l.processing_fee || 0),
          interestRate: Number(l.interest_rate),
          startDate: normalizeISODate(l.start_date),
          endDate: l.end_date ? normalizeISODate(l.end_date) : undefined,
          status: l.status as LoanStatus,
          type: (l.loan_type || 'SPECIAL') as LoanType,
          durationMonths: l.duration_months,
          calculationMethod: l.calculation_method as LoanCalculationMethod,
          remarks: l.purpose,
          surety1Id: l.surety1_id,
          surety2Id: l.surety2_id,
          isLegacy: l.is_legacy,
          financialYear: l.financial_year,
          description: l.description
        })));
      }

      if (repaymentsRes.data) {
        setLoanRepayments((repaymentsRes.data as any[]).map(r => {
          const amt = Number(r.amount || 0);
          const iPaid = Number(r.interest_paid || 0);
          const pPaid = Number(r.principal_paid ?? Math.max(0, amt - iPaid));
          return {
            id: r.id,
            loanId: r.loan_id,
            date: normalizeISODate(r.date),
            amount: amt,
            interestPaid: iPaid,
            principalPaid: pPaid,
          lateFee: Number(r.late_fee || 0),
          interestForMonth: r.interest_for_month ? Number(r.interest_for_month) : undefined,
          interestForYear: r.interest_for_year ? Number(r.interest_for_year) : undefined,
          interestDays: r.interest_days ? Number(r.interest_days) : undefined,
          interestCalculationType: (r.interest_calculation_type || 'MONTHLY') as InterestCalculationType,
          method: r.method as PaymentMethod,
          notes: r.notes,
          createdAt: r.created_at
          };
        }));
      }

      if (topupsRes.data) {
        setLoanTopups((topupsRes.data as any[]).map(t => ({
          id: t.id,
          loanId: t.loan_id,
          amount: Number(t.amount),
          rate: Number(t.rate),
          date: normalizeISODate(t.date),
          notes: t.notes,
          createdAt: t.created_at
        })));
      }
    } catch (error) {
      logger.error('Error fetching socials:', error);
    } finally {
      if (showLoader) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchFinancials();

    const channel = supabase
      .channel('financials_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loans' }, () => fetchFinancials(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loan_repayments' }, () => fetchFinancials(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loan_topups' }, () => fetchFinancials(false))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchFinancials]);

  // Loans
  const createLoan = useCallback(async (l: Omit<Loan, 'id'>) => {
    const newId = `loan_${Date.now()}`;
    const { error } = await supabase.from('loans').insert([{
      id: newId,
      member_id: l.memberId,
      principal_amount: l.principalAmount,
      processing_fee: l.processingFee || 0,
      interest_rate: l.interestRate,
      start_date: l.startDate,
      status: l.status,
      loan_type: l.type,
      duration_months: l.durationMonths,
      calculation_method: l.calculationMethod,
      purpose: l.remarks,
      financial_year: l.financialYear || getIndianFinancialYear(l.startDate),
      is_legacy: l.isLegacy || false,
      description: l.description,
      surety1_id: l.surety1Id,
      surety2_id: l.surety2Id
    }]);

    if (error) throw error;
    await fetchFinancials(false);
  }, [fetchFinancials]);

  const updateLoan = useCallback(async (l: Loan) => {
    const { error } = await supabase.from('loans').update({
      principal_amount: l.principalAmount,
      processing_fee: l.processingFee,
      interest_rate: l.interestRate,
      start_date: l.startDate,
      end_date: l.endDate,
      status: l.status,
      loan_type: l.type,
      duration_months: l.durationMonths,
      calculation_method: l.calculationMethod,
      purpose: l.remarks,
      financial_year: l.financialYear,
      is_legacy: l.isLegacy,
      description: l.description,
      surety1_id: l.surety1Id,
      surety2_id: l.surety2Id
    }).eq('id', l.id);

    if (error) throw error;
    await fetchFinancials(false);
  }, [fetchFinancials]);

  const deleteLoan = useCallback(async (id: string) => {
    const { error } = await supabase.from('loans').delete().eq('id', id);
    if (error) throw error;
    await fetchFinancials(false);
  }, [fetchFinancials]);

  const validateRepayment = useCallback((repayment: Omit<LoanRepayment, 'id'>) => {
    const principalPaid = Number(repayment.principalPaid || 0);
    const interestPaid = Number(repayment.interestPaid || 0);
    const lateFee = Number(repayment.lateFee || 0);
    const amount = Number(repayment.amount || 0);

    const periodLabel = (repayment.interestForMonth && repayment.interestForYear)
      ? ` for ${repayment.interestForMonth}/${repayment.interestForYear}`
      : '';

    if (principalPaid < 0 || interestPaid < 0 || lateFee < 0 || amount < 0) {
      throw new Error(`Repayment values cannot be negative${periodLabel}.`);
    }

    const expectedAmount = roundCurrency(principalPaid + interestPaid);
    if (roundCurrency(amount) !== expectedAmount) {
      throw new Error(`Repayment amount (${amount}) must equal principal + interest (${expectedAmount})${periodLabel}.`);
    }

    const hasInterestPeriod = repayment.interestForMonth != null || repayment.interestForYear != null;
    if (hasInterestPeriod && (!repayment.interestForMonth || !repayment.interestForYear)) {
      throw new Error(`Interest period must include both month and year${periodLabel}.`);
    }

    if (repayment.interestForMonth && (repayment.interestForMonth < 1 || repayment.interestForMonth > 12)) {
      throw new Error(`Interest period month must be between 1 and 12 (got ${repayment.interestForMonth})${periodLabel}.`);
    }

    if (repayment.interestDays != null && (!Number.isInteger(repayment.interestDays) || repayment.interestDays <= 0)) {
      throw new Error(`Interest days must be a positive whole number${periodLabel}.`);
    }

    if (repayment.interestCalculationType === 'PRORATED_DAYS' && !repayment.interestDays) {
      throw new Error(`Prorated interest entries must include the number of days held${periodLabel}.`);
    }
  }, [roundCurrency]);

  const recordLoanRepayment = useCallback(async (r: Omit<LoanRepayment, 'id'>) => {
    validateRepayment(r);
    const { error } = await supabase.from('loan_repayments').insert([{
      id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      loan_id: r.loanId,
      date: r.date,
      amount: r.amount,
      interest_paid: r.interestPaid,
      principal_paid: r.principalPaid,
      late_fee: r.lateFee || 0,
      interest_for_month: r.interestForMonth ?? null,
      interest_for_year: r.interestForYear ?? null,
      interest_days: r.interestDays ?? null,
      interest_calculation_type: r.interestCalculationType ?? 'MONTHLY',
      method: r.method,
      notes: r.notes
    }]);

    if (error) throw error;
    await fetchFinancials(false);
  }, [fetchFinancials, validateRepayment]);

  const updateLoanRepayment = useCallback(async (repayment: LoanRepayment) => {
    const existingRepayment = loanRepayments.find(row => row.id === repayment.id);
    if (!existingRepayment) {
      throw new Error('Repayment record not found.');
    }

    validateRepayment({
      loanId: repayment.loanId,
      date: repayment.date,
      amount: repayment.amount,
      interestPaid: repayment.interestPaid,
      principalPaid: repayment.principalPaid,
      lateFee: repayment.lateFee,
      interestForMonth: repayment.interestForMonth,
      interestForYear: repayment.interestForYear,
      interestDays: repayment.interestDays,
      interestCalculationType: repayment.interestCalculationType,
      method: repayment.method,
      notes: repayment.notes
    });

    const { error } = await supabase.from('loan_repayments').update({
      loan_id: repayment.loanId,
      date: repayment.date,
      amount: repayment.amount,
      interest_paid: repayment.interestPaid,
      principal_paid: repayment.principalPaid,
      late_fee: repayment.lateFee || 0,
      interest_for_month: repayment.interestForMonth ?? null,
      interest_for_year: repayment.interestForYear ?? null,
      interest_days: repayment.interestDays ?? null,
      interest_calculation_type: repayment.interestCalculationType ?? null,
      method: repayment.method,
      notes: repayment.notes ?? null
    }).eq('id', existingRepayment.id);

    if (error) throw error;
    await fetchFinancials(false);
  }, [fetchFinancials, loanRepayments, validateRepayment]);

  const bulkRecordLoanRepayments = useCallback(async (repayments: Omit<LoanRepayment, 'id'>[]) => {
    if (!repayments.length) return;
    
    // Process in batches if large, but typical auto-generate is < 150 months so single insert is fine
    const payload = repayments.map((r, i) => ({
      id: `rep_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`,
      loan_id: r.loanId,
      date: r.date,
      amount: r.amount,
      interest_paid: r.interestPaid,
      principal_paid: r.principalPaid,
      late_fee: r.lateFee || 0,
      interest_for_month: r.interestForMonth ?? null,
      interest_for_year: r.interestForYear ?? null,
      interest_days: r.interestDays ?? null,
      interest_calculation_type: r.interestCalculationType ?? 'MONTHLY',
      method: r.method,
      notes: r.notes
    }));

    repayments.forEach((r, idx) => {
      try {
        validateRepayment(r);
      } catch (e) {
        const err = e as Error;
        throw new Error(`Batch record #${idx + 1} failed: ${err.message}`);
      }
    });

    const { error } = await supabase.from('loan_repayments').insert(payload);

    if (error) {
      logger.error("Bulk Insert Failed", error);
      throw error;
    }
    await fetchFinancials(false);
  }, [fetchFinancials, validateRepayment]);

  const deleteLoanRepayment = useCallback(async (id: string) => {
    const { error } = await supabase.from('loan_repayments').delete().eq('id', id);
    if (error) throw error;
    await fetchFinancials(false);
  }, [fetchFinancials]);

  const cleanupInvalidInterestRowsForLoan = useCallback(async (loan: Loan) => {
    const today = new Date();
    const endPeriod = { year: today.getFullYear(), month: today.getMonth() + 1 };
    const invalidRows = getInvalidInterestRepayments(
      loan,
      loanTopups.filter(t => t.loanId === loan.id),
      loanRepayments.filter(r => r.loanId === loan.id),
      endPeriod,
      settings
    );

    if (!invalidRows.length) {
      return 0;
    }

    const fullDeleteIds = invalidRows
      .filter(row => (row.principalPaid || 0) === 0 && (row.lateFee || 0) === 0)
      .map(row => row.id);
    const mixedRows = invalidRows.filter(row => !fullDeleteIds.includes(row.id));

    if (fullDeleteIds.length > 0) {
      const { error } = await supabase.from('loan_repayments')
        .delete()
        .in('id', fullDeleteIds);
      if (error) throw error;
    }

    for (const row of mixedRows) {
      const { error } = await supabase.from('loan_repayments').update({
        amount: roundCurrency(Number(row.principalPaid || 0)),
        interest_paid: 0,
        interest_for_month: null,
        interest_for_year: null,
        interest_days: null,
        interest_calculation_type: null
      }).eq('id', row.id);

      if (error) throw error;
    }

    return invalidRows.length;
  }, [loanRepayments, loanTopups, roundCurrency]);

  const closeLoan = useCallback(async (loanId: string, endDate?: string) => {
    const normalizedEndDate = normalizeISODate(endDate || new Date().toISOString().split('T')[0]);
    const loan = loans.find(existingLoan => existingLoan.id === loanId);
    if (!loan) {
      throw new Error('Loan record not found.');
    }

    const closeValidation = validateLoanCanCloseOnDate(
      loan,
      loanTopups.filter(topup => topup.loanId === loanId),
      loanRepayments.filter(repayment => repayment.loanId === loanId),
      normalizedEndDate
    );

    if (!closeValidation.canClose) {
      throw new Error(closeValidation.reason);
    }

    const { error } = await supabase.from('loans').update({
      status: LoanStatus.CLOSED,
      end_date: normalizedEndDate
    }).eq('id', loanId);

    if (error) throw error;

    await cleanupInvalidInterestRowsForLoan({
      ...loan,
      status: LoanStatus.CLOSED,
      endDate: normalizedEndDate
    });

    await fetchFinancials(false);
  }, [cleanupInvalidInterestRowsForLoan, fetchFinancials, loanRepayments, loanTopups, loans]);

  // Top-ups
  const addLoanTopup = useCallback(async (t: Omit<LoanTopup, 'id' | 'createdAt'>) => {
    const { error } = await supabase.from('loan_topups').insert([{
      id: `top_${Date.now()}`,
      loan_id: t.loanId,
      amount: t.amount,
      rate: t.rate,
      date: t.date,
      notes: t.notes
    }]);

    if (error) throw error;
    await fetchFinancials(false);
  }, [fetchFinancials]);

  const deleteLoanTopup = useCallback(async (id: string) => {
    const { error } = await supabase.from('loan_topups').delete().eq('id', id);
    if (error) throw error;
    await fetchFinancials(false);
  }, [fetchFinancials]);

  const updateLoanTopup = useCallback(async (t: LoanTopup) => {
    const { error } = await supabase.from('loan_topups').update({
      amount: t.amount,
      rate: t.rate,
      date: t.date,
      notes: t.notes
    }).eq('id', t.id);

    if (error) throw error;
    await fetchFinancials(false);
  }, [fetchFinancials]);

  const wipeLoanInterest = useCallback(async (loanId: string) => {
    const interestRows = loanRepayments.filter(r => r.loanId === loanId && (r.interestPaid || 0) > 0);
    const fullDeleteIds = interestRows
      .filter(r => (r.principalPaid || 0) === 0 && (r.lateFee || 0) === 0)
      .map(r => r.id);

    const mixedRows = interestRows.filter(r => !fullDeleteIds.includes(r.id));

    if (fullDeleteIds.length > 0) {
      const { error } = await supabase.from('loan_repayments')
        .delete()
        .in('id', fullDeleteIds);
      if (error) throw error;
    }

    for (const row of mixedRows) {
      const { error } = await supabase.from('loan_repayments').update({
        amount: roundCurrency(Number(row.principalPaid || 0)),
        interest_paid: 0,
        interest_for_month: null,
        interest_for_year: null,
        interest_days: null,
        interest_calculation_type: null
      }).eq('id', row.id);

      if (error) throw error;
    }

    await fetchFinancials(false);
  }, [fetchFinancials, loanRepayments, roundCurrency]);

  const cleanupInvalidLoanInterest = useCallback(async (loanId: string) => {
    const loan = loans.find(existingLoan => existingLoan.id === loanId);
    if (!loan) return 0;

    const cleanedCount = await cleanupInvalidInterestRowsForLoan(loan);
    if (cleanedCount > 0) {
      await fetchFinancials(false);
    }

    return cleanedCount;
  }, [cleanupInvalidInterestRowsForLoan, fetchFinancials, loans]);

  const getSpecialLoanOutstanding = useCallback((loanId: string, asOfDate?: string) => {
    const targetId = String(loanId).trim();
    const loan = loans.find((l: Loan) => String(l.id).trim() === targetId);
    if (!loan) return 0;

    return getSpecialLoanOutstandingFromEvents(
      loan,
      loanTopups.filter(t => String(t.loanId).trim() === targetId),
      loanRepayments.filter(r => String(r.loanId).trim() === targetId),
      asOfDate
    );
  }, [loans, loanTopups, loanRepayments]);

  const setFinancialData = useCallback(({ loans, loanRepayments }: any) => {
    if (loans) setLoans(loans);
    if (loanRepayments) setLoanRepayments(loanRepayments);
  }, []);

  const importFinancials = useCallback(async (data: any) => {
    await fetchFinancials(false);
  }, [fetchFinancials]);

  const deleteAllFinancials = useCallback(async () => {
    await Promise.all([
      supabase.from('loans').delete().neq('id', '0'),
      supabase.from('loan_repayments').delete().neq('id', '0'),
      supabase.from('loan_topups').delete().neq('id', '0')
    ]);
    await fetchFinancials(false);
  }, [fetchFinancials]);

  const resetFinancials = useCallback(() => {
    setLoans([]);
    setLoanRepayments([]);
    setLoanTopups([]);
  }, []);

  return (
    <FinancialContext.Provider value={{
      loans, loanRepayments, loanTopups,
      createLoan, updateLoan, deleteLoan, recordLoanRepayment, updateLoanRepayment, bulkRecordLoanRepayments, deleteLoanRepayment,
      closeLoan,
      addLoanTopup, updateLoanTopup, deleteLoanTopup, wipeLoanInterest, cleanupInvalidLoanInterest, getSpecialLoanOutstanding,
      setFinancialData, importFinancials, deleteAllFinancials, resetFinancials,
      isLoading
    }}>
      {children}
    </FinancialContext.Provider>
  );
};

export const useFinancials = () => {
  const context = useContext(FinancialContext);
  if (!context) throw new Error('useFinancials must be used within FinancialProvider');
  return context;
};
