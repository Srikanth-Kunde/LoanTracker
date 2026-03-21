import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Payment, Loan, LoanRepayment, LoanStatus, PaymentMethod, LoanType, LoanCalculationMethod, LoanTopup, PaymentCategory } from '../types';
import { getIndianFinancialYear } from '../constants';
import { supabase } from '../supabaseClient';
import { logger } from '../utils/logger';
import {
  compareISODate,
  isoDateToTimestamp,
  getLastDayOfMonthISO,
  isISODateOnOrBefore,
  normalizeISODate
} from '../utils/date';

interface FinancialContextType {
  payments: Payment[];
  loans: Loan[];
  loanRepayments: LoanRepayment[];
  loanTopups: LoanTopup[];

  recordPayment: (payment: Omit<Payment, 'id'>) => Promise<string>;
  deletePayment: (id: string) => Promise<void>;
  getMemberPayments: (memberId: string) => Payment[];
  getPaymentById: (id: string) => Payment | undefined;

  createLoan: (loan: Omit<Loan, 'id'>) => Promise<void>;
  updateLoan: (loan: Loan) => Promise<void>;
  deleteLoan: (id: string) => Promise<void>;
  recordLoanRepayment: (repayment: Omit<LoanRepayment, 'id'>) => Promise<void>;
  bulkRecordLoanRepayments: (repayments: Omit<LoanRepayment, 'id'>[]) => Promise<void>;
  deleteLoanRepayment: (id: string) => Promise<void>;
  closeLoan: (loanId: string) => Promise<void>;

  // Top-up actions (Special / Interest-Only loans)
  addLoanTopup: (topup: Omit<LoanTopup, 'id' | 'createdAt'>) => Promise<void>;
  deleteLoanTopup: (id: string) => Promise<void>;
  wipeLoanInterest: (loanId: string) => Promise<void>;
  getSpecialLoanOutstanding: (loanId: string, asOfDate?: string) => number;

  setFinancialData: (data: { payments?: Payment[], loans?: Loan[], loanRepayments?: LoanRepayment[] }) => void;
  importFinancials: (data: { payments?: Payment[], loans?: Loan[], loanRepayments?: LoanRepayment[] }) => Promise<void>;
  deleteAllFinancials: () => Promise<void>;
  resetFinancials: () => void;
  isLoading: boolean;
}

const FinancialContext = createContext<FinancialContextType | undefined>(undefined);

export const FinancialProvider = ({ children }: { children: React.ReactNode }) => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loanRepayments, setLoanRepayments] = useState<LoanRepayment[]>([]);
  const [loanTopups, setLoanTopups] = useState<LoanTopup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchFinancials = useCallback(async () => {
    try {
      setIsLoading(true);
      logger.info('Fetching initial financial data from Supabase');

      const [paymentsRes, loansRes, repaymentsRes, topupsRes] = await Promise.all([
        supabase.from('payments').select('*'),
        supabase.from('loans').select('*').order('created_at', { ascending: false }),
        supabase.from('loan_repayments').select('*'),
        supabase.from('loan_topups').select('*')
      ]);

      if (paymentsRes.error) throw paymentsRes.error;
      if (loansRes.error) throw loansRes.error;
      if (repaymentsRes.error) throw repaymentsRes.error;
      if (topupsRes.error) throw topupsRes.error;

      if (paymentsRes.data) {
        setPayments((paymentsRes.data as any[]).map(p => ({
          id: p.id,
          memberId: p.member_id,
          amount: p.amount,
          lateFee: p.late_fee,
          category: (p.category || PaymentCategory.LOAN_REPAYMENT) as PaymentCategory,
          date: p.date,
          month: p.month,
          year: p.year,
          method: p.method as PaymentMethod,
          notes: p.notes,
          isLegacy: p.is_legacy,
          financialYear: p.financial_year,
          description: p.description
        })));
      }

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
          const pPaid = Number(r.principal_paid || (iPaid === 0 ? amt : 0));
          return {
            id: r.id,
            loanId: r.loan_id,
            date: normalizeISODate(r.date),
            amount: amt,
            interestPaid: iPaid,
            principalPaid: pPaid,
            lateFee: Number(r.late_fee || 0),
            method: r.method as PaymentMethod,
            notes: r.notes
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
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFinancials();
  }, [fetchFinancials]);

  const recordPayment = useCallback(async (p: Omit<Payment, 'id'>) => {
    const newId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { error } = await supabase.from('payments').insert([{
      id: newId,
      member_id: p.memberId,
      amount: p.amount,
      late_fee: p.lateFee || 0,
      category: p.category || PaymentCategory.LOAN_REPAYMENT,
      date: p.date,
      month: p.month,
      year: p.year,
      method: p.method,
      notes: p.notes,
      financial_year: p.financialYear || getIndianFinancialYear(p.date),
      is_legacy: p.isLegacy || false,
      description: p.description
    }]);

    if (error) throw error;
    fetchFinancials();
    return newId;
  }, [fetchFinancials]);

  const deletePayment = useCallback(async (id: string) => {
    const { error } = await supabase.from('payments').delete().eq('id', id);
    if (error) throw error;
    fetchFinancials();
  }, [fetchFinancials]);

  const getMemberPayments = useCallback((memberId: string) => {
    return payments.filter((p: Payment) => p.memberId === memberId).sort((a: Payment, b: Payment) => b.date.localeCompare(a.date));
  }, [payments]);

  const getPaymentById = useCallback((id: string) => {
    return payments.find((p: Payment) => p.id === id);
  }, [payments]);

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
    fetchFinancials();
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
    fetchFinancials();
  }, [fetchFinancials]);

  const deleteLoan = useCallback(async (id: string) => {
    const { error } = await supabase.from('loans').delete().eq('id', id);
    if (error) throw error;
    fetchFinancials();
  }, [fetchFinancials]);

  const recordLoanRepayment = useCallback(async (r: Omit<LoanRepayment, 'id'>) => {
    const { error } = await supabase.from('loan_repayments').insert([{
      id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      loan_id: r.loanId,
      date: r.date,
      amount: r.amount,
      interest_paid: r.interestPaid,
      principal_paid: r.principalPaid,
      late_fee: r.lateFee || 0,
      method: r.method,
      notes: r.notes
    }]);

    if (error) throw error;
    fetchFinancials();
  }, [fetchFinancials]);

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
      method: r.method,
      notes: r.notes
    }));

    const { error } = await supabase.from('loan_repayments').insert(payload);

    if (error) throw error;
    fetchFinancials();
  }, [fetchFinancials]);

  const deleteLoanRepayment = useCallback(async (id: string) => {
    const { error } = await supabase.from('loan_repayments').delete().eq('id', id);
    if (error) throw error;
    fetchFinancials();
  }, [fetchFinancials]);

  const closeLoan = useCallback(async (loanId: string) => {
    const { error } = await supabase.from('loans').update({
      status: LoanStatus.CLOSED,
      end_date: new Date().toISOString().split('T')[0]
    }).eq('id', loanId);

    if (error) throw error;
    fetchFinancials();
  }, [fetchFinancials]);

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
    fetchFinancials();
  }, [fetchFinancials]);

  const deleteLoanTopup = useCallback(async (id: string) => {
    const { error } = await supabase.from('loan_topups').delete().eq('id', id);
    if (error) throw error;
    fetchFinancials();
  }, [fetchFinancials]);

  const wipeLoanInterest = useCallback(async (loanId: string) => {
    const { error } = await supabase.from('loan_repayments')
      .delete()
      .eq('loan_id', loanId)
      .gt('interest_paid', 0);
    
    if (error) throw error;
    fetchFinancials();
  }, [fetchFinancials]);

  const getSpecialLoanOutstanding = useCallback((loanId: string, asOfDate?: string) => {
    const targetId = String(loanId).trim();
    const loan = loans.find((l: Loan) => String(l.id).trim() === targetId);
    if (!loan) return 0;

    // Standard normalization to YYYY-MM-DD for comparison
    const cutoff = asOfDate ? normalizeISODate(asOfDate) : null;
    const lStart = normalizeISODate(loan.startDate);

    // If cutoff is before loan start, balance is effectively zero for interest purposes
    if (cutoff && cutoff < lStart) return 0;

    let totalPrincipal = Number(loan.principalAmount || 0);
    
    // Add all top-ups recorded on or before cutoff
    loanTopups.forEach((t: LoanTopup) => {
      if (String(t.loanId).trim() === targetId) {
        const tDate = normalizeISODate(t.date);
        if (!cutoff || tDate <= cutoff) {
          totalPrincipal += Number(t.amount || 0);
        }
      }
    });

    // Subtract all principal repayments recorded on or before cutoff
    loanRepayments.forEach((r: LoanRepayment) => {
      if (String(r.loanId).trim() === targetId) {
        const rDate = normalizeISODate(r.date);
        if (!cutoff || rDate <= cutoff) {
          totalPrincipal -= Number(r.principalPaid || 0);
        }
      }
    });

    // Use a small epsilon of ₹1 to ignore rounding artifacts in legacy migrations
    const result = Math.round(totalPrincipal * 100) / 100;
    return result > 1 ? result : 0;
  }, [loans, loanTopups, loanRepayments]);

  const setFinancialData = useCallback(({ payments, loans, loanRepayments }: any) => {
    if (payments) setPayments(payments);
    if (loans) setLoans(loans);
    if (loanRepayments) setLoanRepayments(loanRepayments);
  }, []);

  const importFinancials = useCallback(async (data: any) => {
    // Large batch inserts - typically used in admin migration tools
    if (data.payments?.length) await supabase.from('payments').insert(data.payments.map((p: any) => ({
      member_id: p.memberId,
      amount: p.amount,
      late_fee: p.lateFee || 0,
      date: p.date,
      month: p.month,
      year: p.year,
      method: p.method,
      category: p.category || PaymentCategory.LOAN_REPAYMENT,
      financial_year: p.financialYear || getIndianFinancialYear(p.date)
    })));

    fetchFinancials();
  }, [fetchFinancials]);

  const deleteAllFinancials = useCallback(async () => {
    await Promise.all([
      supabase.from('payments').delete().neq('id', '0'),
      supabase.from('loans').delete().neq('id', '0'),
      supabase.from('loan_repayments').delete().neq('id', '0'),
      supabase.from('loan_topups').delete().neq('id', '0')
    ]);
    fetchFinancials();
  }, [fetchFinancials]);

  const resetFinancials = useCallback(() => {
    setPayments([]);
    setLoans([]);
    setLoanRepayments([]);
    setLoanTopups([]);
  }, []);

  return (
    <FinancialContext.Provider value={{
      payments, loans, loanRepayments, loanTopups,
      recordPayment, deletePayment, getMemberPayments, getPaymentById,
      createLoan, updateLoan, deleteLoan, recordLoanRepayment, bulkRecordLoanRepayments, deleteLoanRepayment,
      closeLoan,
      addLoanTopup, deleteLoanTopup, wipeLoanInterest, getSpecialLoanOutstanding,
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
