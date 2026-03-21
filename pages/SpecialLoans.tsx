
import React, { useState, useMemo } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useMembers } from '../context/MemberContext';
import { useFinancials } from '../context/FinancialContext';
import { useAuth } from '../context/AuthContext';
import { useAuditLog } from '../context/AuditLogContext';
import { Loan, LoanStatus, LoanRepayment, PaymentMethod, UserRole, LoanCalculationMethod, LoanType } from '../types';
import { MONTHS, formatCurrency } from '../constants';
import {
    ChevronLeft, ChevronRight, Calculator, Eye, Banknote, Filter, AlertTriangle, FileText, Star,
    Plus, Search, TrendingUp, CheckCircle, Clock,
    Edit, Trash2, Download, Zap
} from 'lucide-react';
import EmptyState from '../components/EmptyState';
import { logger } from '../utils/logger';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Card } from '../components/ui/Card';
import { LoanCalculator } from '../components/LoanCalculator';
import { compareISODate, formatDisplayDate, getISODateMonthYear, getLastDayOfMonthISO, isoDateToTimestamp } from '../utils/date';

interface EnrichedLoan extends Loan {
    memberName: string;
    historicalOutstanding: number;
    openingOutstanding: number;
    historicalPrincipalPaid: number;
    historicalInterestPaid: number;
    monthlyDue: number;
    principalComp: number;
    interestComp: number;
    isPaidSelectedMonth: boolean;
    totalPaidInSelectedMonth: number;
    isOverdueMonth: boolean;
    historicalLateFeePaid: number;
    selectedMonthLateFee: number;
    missedMonths?: string[];
    missedMonthsDetails?: { month: number, year: number, principal: number, interest: number, lateFee: number }[];
}

const SpecialLoans: React.FC = () => {
    const { settings } = useSettings();
    const { members } = useMembers();
    const {
        loans, loanRepayments, createLoan, updateLoan, deleteLoan,
        recordLoanRepayment, closeLoan,
        deleteLoanRepayment, deleteLoanTopup, wipeLoanInterest, bulkRecordLoanRepayments
    } = useFinancials();
    const { role } = useAuth();
    const { loanTopups, addLoanTopup, getSpecialLoanOutstanding } = useFinancials();
    const { log } = useAuditLog();

    // State
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'CLOSED'>('ACTIVE');
    const [sortOrder, setSortOrder] = useState<'DATE_DESC' | 'DATE_ASC' | 'NAME_ASC' | 'NAME_DESC' | 'AMOUNT_DESC' | 'AMOUNT_ASC' | 'OUTSTANDING_DESC'>('DATE_DESC');

    // Modals
    const [modals, setModals] = useState<{
        create: boolean;
        repay: boolean;
        calc: boolean;
        history: boolean;
        edit: boolean;
        topup: boolean;
        autoGen: boolean;
    }>({ create: false, repay: false, calc: false, history: false, edit: false, topup: false, autoGen: false });

    const [printScheduleLoan, setPrintScheduleLoan] = useState<EnrichedLoan | null>(null);

    // Form States
    const [createForm, setCreateForm] = useState({
        memberId: '',
        amount: '',
        processingFee: (settings.loanProcessingFee ?? 0).toString(),
        rate: (settings.defaultLoanInterestRate ?? 1.5).toString(),
        date: new Date().toISOString().split('T')[0],
        // duration intentionally omitted — Special Loans are open-ended
        method: 'INTEREST_ONLY' as LoanCalculationMethod
    });

    // Top-up form state
    const [topupForm, setTopupForm] = useState({
        amount: '',
        date: new Date().toISOString().split('T')[0],
        notes: ''
    });
    const [topupLoan, setTopupLoan] = useState<EnrichedLoan | null>(null);

    const [autoGenLoan, setAutoGenLoan] = useState<EnrichedLoan | null>(null);

    const [repayForm, setRepayForm] = useState({
        principal: '',
        interest: '',
        lateFee: '0',
        date: new Date().toISOString().split('T')[0],
        method: PaymentMethod.CASH,
        notes: ''
    });

    const [activeLoan, setActiveLoan] = useState<EnrichedLoan | null>(null); // For Repay/History
    const [errorMsg, setErrorMsg] = useState('');

    const [editForm, setEditForm] = useState({
        id: '',
        amount: '',
        rate: '',
        date: '',
        status: LoanStatus.ACTIVE
    });

    const activeLoanTransactions = useMemo(() => {
        if (!activeLoan) return [];
        const repayments = loanRepayments.filter(r => r.loanId === activeLoan.id).map(r => ({ ...r, entryType: 'REPAYMENT' }));
        const topups = loanTopups.filter(t => t.loanId === activeLoan.id).map(t => ({ ...t, entryType: 'TOPUP' }));
        
        return [...repayments, ...topups].sort((a, b) => compareISODate(a.date, (b as any).date));
    }, [activeLoan, loanRepayments, loanTopups]);

    // Permissions
    const canCreateLoan = role === UserRole.ADMIN;
    const canRepayLoan = role === UserRole.ADMIN || role === UserRole.OPERATOR;

    // --- Logic & Memos ---

    const roundCurrency = (amount: number) => Math.round(amount * 100) / 100;

    const calculateEMI = (principal: number, ratePerMonth: number, months: number) => {
        const safeMonths = Math.max(1, months);
        const r = ratePerMonth / 100;
        if (r === 0) return roundCurrency(principal / safeMonths);
        const emi = (principal * r * Math.pow(1 + r, safeMonths)) / (Math.pow(1 + r, safeMonths) - 1);
        return roundCurrency(emi);
    };

    const loansInSelectedPeriod = useMemo((): EnrichedLoan[] => {
        const endOfMonth = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);
        const startOfMonthTime = new Date(selectedYear, selectedMonth - 1, 1).getTime();
        const endOfMonthTime = endOfMonth.getTime();

        const repaymentsByLoan = new Map<string, LoanRepayment[]>();
        loanRepayments.forEach(r => {
            if (!repaymentsByLoan.has(r.loanId)) repaymentsByLoan.set(r.loanId, []);
            repaymentsByLoan.get(r.loanId)!.push(r);
        });

        // FILTER FOR SPECIAL LOANS ONLY
        return loans.filter(loan => {
            if (loan.type !== LoanType.SPECIAL) return false;
            if (statusFilter !== 'ALL' && loan.status !== statusFilter) return false;
            if (isoDateToTimestamp(loan.startDate, true) > endOfMonthTime) return false;
            return true;
        }).map(loan => {
            const member = members.find(m => m.id === loan.memberId);
            const allRepayments = repaymentsByLoan.get(loan.id) || [];

            let historicalPrincipalPaid = 0;
            let historicalInterestPaid = 0;
            let historicalLateFeePaid = 0;
            let totalPaidInSelectedMonth = 0;
            let selectedMonthLateFee = 0;
            let isPaidSelectedMonth = false;
            let principalPaidBeforeMonth = 0;

            allRepayments.forEach(r => {
                const rDate = isoDateToTimestamp(r.date, true);
                if (rDate <= endOfMonthTime) {
                    historicalPrincipalPaid += (r.principalPaid || 0);
                    historicalInterestPaid += (r.interestPaid || 0);
                    historicalLateFeePaid += (r.lateFee || 0);
                }
                const [rYear, rMonth] = r.date.split('-').map(Number);
                if (rMonth === selectedMonth && rYear === selectedYear) {
                    isPaidSelectedMonth = true;
                    selectedMonthLateFee += (r.lateFee || 0);
                    totalPaidInSelectedMonth += (r.amount || 0) + (r.lateFee || 0);
                }
                if (rDate < startOfMonthTime) {
                    principalPaidBeforeMonth += (r.principalPaid || 0);
                }
            });

            const principalAmount = loan.principalAmount || 0;
            let historicalOutstanding = Math.max(0, principalAmount - historicalPrincipalPaid);
            let openingOutstanding = Math.max(0, principalAmount - principalPaidBeforeMonth);
            let monthlyDue = 0;
            let principalComp = 0;
            let interestComp = 0;

            // ── INTEREST-ONLY logic for Special Loans ────────────────────────
            // Outstanding = original + topups before start-of-month − principal repaid before start-of-month
            if (loan.status === LoanStatus.ACTIVE) {
                // End-of-last-month cutoff for opening balance
                const lastDayOfPrevMonth = new Date(selectedYear, selectedMonth - 1, 0, 23, 59, 59).toISOString();
                const outstanding = getSpecialLoanOutstanding(loan.id, lastDayOfPrevMonth);
                openingOutstanding = outstanding;
                historicalOutstanding = getSpecialLoanOutstanding(loan.id);

                interestComp = roundCurrency(outstanding * (loan.interestRate / 100));
                principalComp = 0;  // No mandatory principal
                monthlyDue = interestComp;
            }

            // Fix: No payment due in the month of disbursement itself.
            // Payment obligation starts the NEXT month.
            const loanStartDate = getISODateMonthYear(loan.startDate);
            if (
                loanStartDate.year === selectedYear &&
                loanStartDate.month === selectedMonth
            ) {
                monthlyDue = 0;
                principalComp = 0;
                interestComp = 0;
            }

            // Determine if this month's payment is overdue
            // A payment is considered overdue only if we are now in a month AFTER the selectedMonth
            const todayDate = new Date();
            const isOverdueMonth =
                (todayDate.getFullYear() > selectedYear || (todayDate.getFullYear() === selectedYear && todayDate.getMonth() + 1 > selectedMonth)) &&
                loan.status === LoanStatus.ACTIVE &&
                monthlyDue > 0;

            return {
                ...loan,
                memberName: member?.name || 'Unknown',
                historicalOutstanding,
                openingOutstanding,
                historicalPrincipalPaid,
                historicalInterestPaid,
                historicalLateFeePaid,
                selectedMonthLateFee,
                monthlyDue: Math.round(monthlyDue),
                principalComp: Math.round(principalComp),
                interestComp: Math.round(interestComp),
                isPaidSelectedMonth,
                totalPaidInSelectedMonth,
                isOverdueMonth
            };
        }).filter(l =>
            l.memberName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            l.id.toLowerCase().includes(searchTerm.toLowerCase())
        ).sort((a, b) => {
            if (sortOrder === 'DATE_ASC') return compareISODate(a.startDate, b.startDate);
            if (sortOrder === 'DATE_DESC') return compareISODate(b.startDate, a.startDate);
            if (sortOrder === 'NAME_ASC') return a.memberName.localeCompare(b.memberName);
            if (sortOrder === 'NAME_DESC') return b.memberName.localeCompare(a.memberName);
            if (sortOrder === 'AMOUNT_ASC') return a.principalAmount - b.principalAmount;
            if (sortOrder === 'AMOUNT_DESC') return b.principalAmount - a.principalAmount;
            if (sortOrder === 'OUTSTANDING_DESC') return b.historicalOutstanding - a.historicalOutstanding;
            return compareISODate(b.startDate, a.startDate);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loans, members, loanRepayments, loanTopups, selectedMonth, selectedYear, searchTerm, statusFilter, sortOrder]);

    const autoGenPreview = useMemo(() => {
        if (!autoGenLoan) return { months: 0, totalInterest: 0, records: [] };
        
        const { year: startYear, month: startMonth } = getISODateMonthYear(autoGenLoan.startDate);
        const today = new Date();
        const endYear = today.getFullYear();
        const endMonth = today.getMonth() + 1;

        const loanRepaymentsForLoan = loanRepayments.filter(r => r.loanId === autoGenLoan.id);
        
        const paidMonths = new Set(
            loanRepaymentsForLoan
                .filter(r => (r.interestPaid || 0) > 0)
                .map(r => {
                    try {
                        const { year, month } = getISODateMonthYear(r.date);
                        return `${year}-${month}`;
                    } catch (e) { return null; }
                })
                .filter(Boolean) as string[]
        );

        let currentY = startYear;
        let currentM = startMonth + 1;
        if (currentM > 12) { currentM = 1; currentY++; }
        
        const missingRecords: Omit<LoanRepayment, 'id'>[] = [];
        let totalInterest = 0;
        
        while (currentY < endYear || (currentY === endYear && currentM <= endMonth)) {
            const monthKey = `${currentY}-${currentM}`;
            if (!paidMonths.has(monthKey)) {
                // Calculation of interest for 'current month' depends on outstanding at 'end of previous month'
                const asOf = getLastDayOfMonthISO(currentY, currentM - 1);
                const outstanding = getSpecialLoanOutstanding(autoGenLoan.id, asOf);
                
                if (outstanding > 1) { 
                    const interestDue = Math.round(outstanding * (autoGenLoan.interestRate / 100));
                    totalInterest += interestDue;
                    
                    missingRecords.push({
                        loanId: autoGenLoan.id,
                        date: getLastDayOfMonthISO(currentY, currentM),
                        amount: interestDue,
                        interestPaid: interestDue,
                        principalPaid: 0,
                        lateFee: 0,
                        method: PaymentMethod.CASH,
                        notes: 'Auto-generated historical interest'
                    });
                }
            }
            
            currentM++;
            if (currentM > 12) { currentM = 1; currentY++; }
        }
        
        return { months: missingRecords.length, totalInterest, records: missingRecords };
    }, [autoGenLoan, loanRepayments, loanTopups, getSpecialLoanOutstanding]);

    const stats = useMemo(() => {
        const specialLoans = loans.filter(l => l.type === LoanType.SPECIAL && l.status === LoanStatus.ACTIVE);
        const totalDisbursed = specialLoans.reduce((sum, l) => {
            // Original principal + all top-ups
            const topupsForLoan = loanTopups.filter(t => t.loanId === l.id).reduce((s, t) => s + t.amount, 0);
            return sum + l.principalAmount + topupsForLoan;
        }, 0);

        // Use getSpecialLoanOutstanding for accurate outstanding (includes topups, deducts principal repayments)
        const totalOutstanding = specialLoans.reduce((sum, loan) => {
            return sum + getSpecialLoanOutstanding(loan.id);
        }, 0);

        const totalInterestEarned = loanRepayments
            .filter(r => loans.find(l => l.id === r.loanId)?.type === LoanType.SPECIAL)
            .reduce((sum, r) => sum + (r.interestPaid || 0), 0);

        const periodDue = loansInSelectedPeriod.reduce((sum, l) => sum + (l.monthlyDue || 0), 0);
        const periodCollected = loansInSelectedPeriod.reduce((sum, l) => sum + (l.totalPaidInSelectedMonth || 0), 0);

        // Late fees collected this period for special loans
        const specialLoanIds = new Set(loans.filter(l => l.type === LoanType.SPECIAL).map(l => l.id));
        const periodLateFees = loanRepayments.filter(r => {
            const { month, year } = getISODateMonthYear(r.date);
            return specialLoanIds.has(r.loanId) && month === selectedMonth && year === selectedYear;
        }).reduce((sum, r) => sum + (r.lateFee || 0), 0);

        return {
            totalDisbursed,
            totalOutstanding,
            totalInterestEarned,
            periodDue,
            periodCollected,
            periodLateFees,
            pendingCount: loansInSelectedPeriod.filter(l => !l.isPaidSelectedMonth && l.monthlyDue > 0 && l.status === LoanStatus.ACTIVE).length
        };
    }, [loans, loanRepayments, loanTopups, loansInSelectedPeriod, getSpecialLoanOutstanding]);

    // --- Handlers ---

    const handleCreateLoan = () => {
        if (!canCreateLoan) return;
        setErrorMsg('');
        try {
            const reqAmount = parseFloat(createForm.amount);
            if (isNaN(reqAmount) || reqAmount <= 0) throw new Error("Please enter a valid principal amount");
            const rate = parseFloat(createForm.rate);
            if (isNaN(rate) || rate <= 0) throw new Error("Please enter a valid interest rate");

            createLoan({
                memberId: createForm.memberId,
                principalAmount: reqAmount,
                processingFee: parseFloat(createForm.processingFee) || 0,
                interestRate: rate,
                startDate: createForm.date,
                status: LoanStatus.ACTIVE,
                type: LoanType.SPECIAL,
                durationMonths: 0,           // Open-ended — no fixed term
                calculationMethod: 'INTEREST_ONLY'
            });
            const mem = members.find(m => m.id === createForm.memberId);
            log('CREATE_LOAN', 'loans', createForm.memberId, { memberName: mem?.name, amount: reqAmount, rate, type: 'SPECIAL' });
            setModals({ ...modals, create: false });
            setCreateForm({
                memberId: '', amount: '', processingFee: (settings.loanProcessingFee ?? 0).toString(),
                rate: (settings.defaultLoanInterestRate ?? 1.5).toString(),
                date: new Date().toISOString().split('T')[0],
                method: 'INTEREST_ONLY'
            });
        } catch (error) {
            const e = error as Error;
            logger.error("Error creating special loan", e);
            setErrorMsg(e.message);
        }
    };

    const openRepayModal = (loan: EnrichedLoan) => {
        if (!canRepayLoan) return;
        if (loan.isPaidSelectedMonth) {
            alert(`Interest for ${MONTHS[selectedMonth - 1]} ${selectedYear} has already been collected for this loan.`);
            return;
        }

        // Detect missed payments before this selected month
        const missedMonths: string[] = [];
        const missedMonthsDetails: { month: number, year: number, interest: number, lateFee: number }[] = [];
        const loanStart = getISODateMonthYear(loan.startDate);
        let checkYear = loanStart.month === 12 ? loanStart.year + 1 : loanStart.year;
        let checkMonth = loanStart.month === 12 ? 1 : loanStart.month + 1;
        const selectedDate = new Date(selectedYear, selectedMonth - 1, 1);

        while (new Date(checkYear, checkMonth - 1, 1) < selectedDate) {
            const m = checkMonth;
            const y = checkYear;
            const wasPaid = loanRepayments.some(r => {
                const { year: rYear, month: rMonth } = getISODateMonthYear(r.date);
                return rMonth === m && rYear === y && r.loanId === loan.id && (r.interestPaid || 0) > 0;
            });
            if (!wasPaid) {
                missedMonths.push(`${MONTHS[m - 1]} ${y}`);
                
                // For Special Loans (Interest Only):
                // We need the outstanding balance for THAT historical month to calculate late fees correctly.
                const lastDayOfThatMonth = getLastDayOfMonthISO(y, m);
                const historicalOutstanding = getSpecialLoanOutstanding(loan.id, lastDayOfThatMonth);
                const monthlyInterest = Math.round(historicalOutstanding * (loan.interestRate / 100));
                
                missedMonthsDetails.push({
                    month: m,
                    year: y,
                    interest: monthlyInterest,
                    lateFee: monthlyInterest // 1:1 Late fee for each missed month
                });
            }
            if (checkMonth === 12) {
                checkMonth = 1;
                checkYear += 1;
            } else {
                checkMonth += 1;
            }
        }

        setActiveLoan({ ...loan, missedMonths, missedMonthsDetails } as any);
        const today = new Date();
        let defaultDate = today.toISOString().split('T')[0];
        if (selectedMonth !== today.getMonth() + 1 || selectedYear !== today.getFullYear()) {
            const d = new Date(selectedYear, selectedMonth - 1, 5);
            defaultDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        }

        // Multiplier calculates the dues for missed months + current month
        const multiplier = missedMonths.length + 1;

        setRepayForm({
            principal: '0',
            interest: (loan.interestComp * multiplier).toString(),
            lateFee: '0',
            date: defaultDate,
            method: PaymentMethod.CASH,
            notes: ''
        });
        setErrorMsg('');
        setModals({ ...modals, repay: true });
    };

    const handleRepay = async () => {
        if (!activeLoan) return;
        setErrorMsg('');
        try {
            const pAmt = parseFloat(repayForm.principal) || 0;
            const iAmt = parseFloat(repayForm.interest) || 0;
            const lFee = parseFloat(repayForm.lateFee) || 0;

            if (compareISODate(repayForm.date, activeLoan.startDate) < 0) {
                throw new Error(`Repayment date cannot be before loan start date`);
            }
            if (iAmt + lFee <= 0 && pAmt <= 0) throw new Error("Enter at least interest or late fee amount");

            const currentOutstanding = getSpecialLoanOutstanding(activeLoan.id);
            if (pAmt > currentOutstanding + 10) throw new Error(`Principal repaid (₹${pAmt}) exceeds outstanding balance (₹${currentOutstanding})`);

            if (activeLoan.missedMonthsDetails && activeLoan.missedMonthsDetails.length > 0) {
                // SPLIT TRANSACTION LOGIC:
                // Record the historical months first with back-dated entries.
                for (const missed of activeLoan.missedMonthsDetails) {
                    const dateStr = getLastDayOfMonthISO(missed.year, missed.month);
                    
                    await recordLoanRepayment({
                        loanId: activeLoan.id,
                        date: dateStr,
                        amount: missed.interest, // amount = principalPaid + interestPaid
                        principalPaid: 0,
                        interestPaid: missed.interest,
                        lateFee: 0, // Entire late fee attributed to the month of actual payment
                        method: repayForm.method
                    });
                }
                
                // Current month transaction
                await recordLoanRepayment({
                    loanId: activeLoan.id,
                    date: repayForm.date,
                    amount: pAmt + (iAmt - activeLoan.missedMonthsDetails.reduce((s, m) => s + m.interest, 0)),
                    principalPaid: pAmt,
                    interestPaid: iAmt - activeLoan.missedMonthsDetails.reduce((s, m) => s + m.interest, 0),
                    lateFee: lFee, // Entire late fee attributed to current transaction
                    method: repayForm.method
                });
            } else {
                await recordLoanRepayment({
                    loanId: activeLoan.id,
                    date: repayForm.date,
                    amount: pAmt + iAmt,
                    principalPaid: pAmt,
                    interestPaid: iAmt,
                    lateFee: lFee,
                    method: repayForm.method,
                    notes: repayForm.notes
                });
            }

            log('RECORD_REPAYMENT', 'loan_repayments', activeLoan.id, { 
                memberName: activeLoan.memberName, 
                interest: iAmt, 
                principal: pAmt, 
                lateFee: lFee,
                splitCount: (activeLoan.missedMonthsDetails?.length || 0) + 1
            });

            // Auto-close if principal fully repaid
            if (pAmt > 0 && (currentOutstanding - pAmt) <= 1) {
                if (confirm("Outstanding balance is now zero. Close this loan?")) {
                    await closeLoan(activeLoan.id);
                }
            }

            setModals({ ...modals, repay: false });
        } catch (error) {
            const e = error as Error;
            logger.error("Error recording repayment", e);
            setErrorMsg(e.message);
        }
    };

    // ── Top-up handlers ──────────────────────────────────────────────────────
    const openTopupModal = (loan: EnrichedLoan) => {
        if (!canCreateLoan) return;
        setTopupLoan(loan);
        setTopupForm({
            amount: '',
            date: new Date().toISOString().split('T')[0],
            notes: ''
        });
        setErrorMsg('');
        setModals({ ...modals, topup: true });
    };

    const handleTopup = async () => {
        if (!topupLoan) return;
        setErrorMsg('');
        try {
            const amt = parseFloat(topupForm.amount);
            if (isNaN(amt) || amt <= 0) throw new Error("Please enter a valid top-up amount");
            if (!topupForm.date) throw new Error("Please select a top-up date");

            await addLoanTopup({
                loanId: topupLoan.id,
                amount: amt,
                rate: topupLoan.interestRate,
                date: topupForm.date,
                notes: topupForm.notes || undefined
            });
            log('ADD_TOPUP', 'loan_topups', topupLoan.id, { memberName: topupLoan.memberName, amount: amt, date: topupForm.date });
            setModals({ ...modals, topup: false });
        } catch (error) {
            const e = error as Error;
            logger.error("Error adding top-up", e);
            setErrorMsg(e.message);
        }
    };

    const changeMonth = (delta: number) => {
        let m = selectedMonth + delta;
        let y = selectedYear;
        if (m > 12) { m = 1; y++; }
        if (m < 1) { m = 12; y--; }
        setSelectedMonth(m);
        setSelectedYear(y);
    };

    const downloadReport = () => {
        const headers = ["Member ID", "Member Name", "Start Date", "Original Principal", "Top-ups", "Top-up Dates", "Outstanding", "Rate %/mo", "Interest Earned", "Late Fee (Period)", "Late Fee (Total)", "Last Payment", "Status"];
        const rows = loansInSelectedPeriod.map(l => {
            const loanTopupsForLoan = loanTopups.filter(t => t.loanId === l.id).sort((a, b) => compareISODate(a.date, b.date));
            const topupTotal = loanTopupsForLoan.reduce((s, t) => s + t.amount, 0);
            const topupDatesStr = loanTopupsForLoan.map(t => formatDisplayDate(t.date)).join(' | ');
            const lateFeesTotal = loanRepayments.filter(r => r.loanId === l.id).reduce((s, r) => s + (r.lateFee || 0), 0);
            const outstanding = getSpecialLoanOutstanding(l.id);
            
            return [
                l.memberId,
                `"${l.memberName}"`,
                l.startDate,
                l.principalAmount,
                topupTotal,
                `"${topupDatesStr}"`,
                outstanding,
                `${l.interestRate}%`,
                l.historicalInterestPaid,
                l.selectedMonthLateFee,
                lateFeesTotal, // this is cumulative from the repayments loop above
                l.historicalOutstanding,
                l.status
            ];
        });

        const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Special_Loans_Report_${MONTHS[selectedMonth - 1]}_${selectedYear}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const openEditModal = (loan: EnrichedLoan) => {
        setEditForm({
            id: loan.id,
            amount: loan.principalAmount.toString(),
            rate: loan.interestRate.toString(),
            date: loan.startDate,
            status: loan.status
        });
        setModals({ ...modals, edit: true });
    };

    const handleUpdateLoan = async () => {
        if (!activeLoan) return;
        try {
            await updateLoan({
                ...activeLoan,
                principalAmount: parseFloat(editForm.amount),
                interestRate: parseFloat(editForm.rate),
                startDate: editForm.date,
                status: editForm.status,
                durationMonths: 0,
                calculationMethod: 'INTEREST_ONLY'
            });
            setModals({ ...modals, edit: false });
        } catch (error) {
            const e = error as Error;
            logger.error("Error updating special loan", e);
            setErrorMsg(e.message);
        }
    };

    const handlePreClose = async (loan: EnrichedLoan) => {
        const amount = loan.historicalOutstanding;
        if (confirm(`Are you sure you want to pre-close this loan? Full outstanding principal of ${formatCurrency(amount, settings.currency)} will be recorded as paid.`)) {
            try {
                await recordLoanRepayment({
                    loanId: loan.id,
                    date: new Date().toISOString().split('T')[0],
                    amount: amount,
                    principalPaid: amount,
                    interestPaid: 0,
                    lateFee: 0,
                    method: PaymentMethod.CASH
                });
                await closeLoan(loan.id);
            } catch (error) {
                const e = error as Error;
                logger.error("Error pre-closing loan", e);
                alert("Error pre-closing loan: " + e.message);
            }
        }
    };

    const handleDeleteLoan = async (id: string) => {
        if (confirm("Are you sure you want to delete this loan? This will also remove all its repayment history.")) {
            try {
                await deleteLoan(id);
            } catch (error) {
                const e = error as Error;
                logger.error("Error deleting loan", e);
                alert("Error deleting loan: " + e.message);
            }
        }
    };

    const handleWipeInterest = async () => {
        const target = activeLoan || autoGenLoan;
        if (!target) return;

        const interestCount = loanRepayments.filter(r => r.loanId === target.id && (r.interestPaid || 0) > 0).length;
        if (interestCount === 0) {
            alert("No interest records found to wipe.");
            return;
        }

        if (confirm(`CAUTION: This will delete ALL ${interestCount} recorded interest payments for this loan. Principal repayments will be kept. Proceed?`)) {
            try {
                await wipeLoanInterest(target.id);
                log('WIPE_INTEREST', 'loan_repayments', target.id, { memberName: target.memberName });
                // No need to manually refresh, useMemo handles it
            } catch (error) {
                logger.error("Error wiping interest", error);
                alert("Failed to wipe interest records");
            }
        }
    };

    const openAutoGenModal = (loan: EnrichedLoan) => {
        if (!canRepayLoan) return;
        setAutoGenLoan(loan);
        setModals({ ...modals, autoGen: true });
    };

    const handleGenerateInterest = async () => {
        try {
            await bulkRecordLoanRepayments(autoGenPreview.records);
            log('BULK_RECORD_INTEREST', 'loan_repayments', autoGenLoan?.id || '', { generatedCount: autoGenPreview.months, totalAmount: autoGenPreview.totalInterest });
            setModals({ ...modals, autoGen: false });
        } catch (error) {
            const e = error as Error;
            logger.error("Error generating interest", e);
            alert("Error generating interest: " + e.message);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Special Loans</h1>
                        <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center">
                            <Star size={10} className="mr-1 fill-amber-500" /> Premium
                        </span>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400">High-value loans without matching savings requirements.</p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <div className="flex items-center bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 px-3 py-1 gap-2">
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                            className="bg-transparent font-semibold text-slate-800 dark:text-white focus:outline-none cursor-pointer"
                        >
                            {MONTHS.map((month, idx) => (
                                <option key={month} value={idx + 1}>{month}</option>
                            ))}
                        </select>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            className="bg-transparent font-semibold text-slate-800 dark:text-white focus:outline-none cursor-pointer border-l border-slate-200 dark:border-slate-700 pl-2"
                        >
                            {Array.from({ length: new Date().getFullYear() - 2011 + 1 }, (_, i) => 2012 + i).reverse().map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-2">
                        <Button variant="outline" icon={Download} onClick={downloadReport}>Report</Button>
                        <Button variant="outline" icon={Calculator} onClick={() => setModals({ ...modals, calc: true })}>Calc</Button>
                        {canCreateLoan && (
                            <Button icon={Plus} onClick={() => setModals({ ...modals, create: true })}>New Special Loan</Button>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase">Active Portfolio</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(stats.totalOutstanding, settings.currency)}</p>
                    <p className="text-xs text-slate-400">Principal + Top-ups</p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase">Total Interest</p>
                    <p className="text-lg font-bold text-emerald-900 dark:text-emerald-300">{formatCurrency(stats.totalInterestEarned, settings.currency)}</p>
                    <p className="text-xs text-slate-400">Yield to date</p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase">Late Fees</p>
                    <p className="text-lg font-bold text-amber-900 dark:text-amber-300">{formatCurrency(stats.periodLateFees, settings.currency)}</p>
                    <p className="text-xs text-slate-400">Collected this period</p>
                </div>
                <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase">Due ({MONTHS[selectedMonth - 1]})</p>
                        <Clock size={16} className="text-indigo-500 dark:text-indigo-400" />
                    </div>
                    <p className="text-lg font-bold text-indigo-900 dark:text-indigo-200">{formatCurrency(stats.periodDue, settings.currency)}</p>
                    <p className="text-xs text-indigo-600 dark:text-indigo-400">{stats.pendingCount} pending payments</p>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                    <Input
                        placeholder="Search by member name..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <div className="relative w-full sm:w-48">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Filter size={18} className="text-slate-400" />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="block w-full pl-10 pr-8 py-2 border border-slate-200 dark:border-slate-700 rounded-lg leading-5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm cursor-pointer"
                    >
                        <option value="ACTIVE">Active Special Loans</option>
                        <option value="CLOSED">Closed Special Loans</option>
                        <option value="ALL">All Special Loans</option>
                    </select>
                </div>
                <div className="relative w-full sm:w-48">
                    <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value as any)}
                        className="block w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg leading-5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm cursor-pointer"
                    >
                        <option value="DATE_DESC">Newest First</option>
                        <option value="DATE_ASC">Oldest First</option>
                        <option value="NAME_ASC">Name (A-Z)</option>
                        <option value="NAME_DESC">Name (Z-A)</option>
                        <option value="AMOUNT_DESC">Highest Amount</option>
                        <option value="OUTSTANDING_DESC">Highest Outstanding</option>
                    </select>
                </div>
            </div>

            <Card noPadding>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                        <thead className="bg-slate-50 dark:bg-slate-900/50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Member / Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Mode &amp; Rate</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Original</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wider">Top-Ups</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">Outstanding</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-amber-500 dark:text-amber-400 uppercase tracking-wider">Late Fee</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Collection Status</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                            {loansInSelectedPeriod.map((loan) => (
                                <tr key={loan.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-semibold text-slate-900 dark:text-white">{loan.memberName}</div>
                                        <div className="text-xs text-slate-500 mb-1">{formatDisplayDate(loan.startDate)}</div>
                                        {loan.status === LoanStatus.CLOSED ? (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                                <CheckCircle size={8} className="mr-1" /> Fully Paid
                                            </span>
                                        ) : (
                                            <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                                Ongoing
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">
                                        <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded text-[10px] font-bold">
                                            Interest Only · {loan.interestRate}%/mo
                                        </div>
                                        {(() => {
                                            const tc = loanTopups.filter(t => t.loanId === loan.id).length; return tc > 0 ? (
                                                <div className="mt-1 text-[10px] text-violet-500">{tc} top-up{tc > 1 ? 's' : ''}</div>
                                            ) : null;
                                        })()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-700 dark:text-slate-200 font-medium">
                                        {formatCurrency(loan.principalAmount, settings.currency)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-violet-600 dark:text-violet-400">
                                        {(() => { const t = loanTopups.filter(x => x.loanId === loan.id).reduce((s, x) => s + x.amount, 0); return t > 0 ? `+ ${formatCurrency(t, settings.currency)}` : '-'; })()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-black text-amber-600 dark:text-amber-500">
                                        {formatCurrency(loan.historicalOutstanding, settings.currency)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-amber-500">
                                        {loan.selectedMonthLateFee > 0 ? formatCurrency(loan.selectedMonthLateFee, settings.currency) : '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        {loan.isPaidSelectedMonth ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                                Collected {settings.currency}{loan.totalPaidInSelectedMonth}
                                            </span>
                                        ) : loan.status === LoanStatus.ACTIVE && loan.monthlyDue > 0 ? (
                                            <div className="flex flex-col items-center">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border border-rose-100 dark:border-rose-800">Overdue</span>
                                                <span className="text-[10px] text-slate-400 mt-1 font-bold">Demand: {settings.currency}{loan.monthlyDue}</span>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-slate-400">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button size="sm" variant="ghost" icon={Eye} onClick={() => { setActiveLoan(loan); setModals({ ...modals, history: true }); }} title="View Details" />
                                            <Button size="sm" variant="ghost" icon={FileText} onClick={() => setPrintScheduleLoan(loan)} title="View Schedule" className="text-blue-600 dark:text-blue-400" />
                                            {canRepayLoan && loan.status === LoanStatus.ACTIVE && !loan.isPaidSelectedMonth && (
                                                <Button size="sm" onClick={() => openRepayModal(loan)} title="Record Interest Payment" className="text-xs px-2 py-1">
                                                    Collect
                                                </Button>
                                            )}
                                            {canCreateLoan && (
                                                <Button size="sm" variant="ghost" onClick={() => openAutoGenModal(loan)} title="Auto-Generate Interest History" className="text-amber-600 dark:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 px-2">
                                                    <Zap size={14} className="mr-1 inline" /> Auto-Gen
                                                </Button>
                                            )}
                                            {loan.isPaidSelectedMonth && loan.status === LoanStatus.ACTIVE && (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded cursor-not-allowed select-none" title="Already collected this month">
                                                    ✓ Paid
                                                </span>
                                            )}
                                            {canCreateLoan && loan.status === LoanStatus.ACTIVE && (
                                                <button
                                                    onClick={() => openTopupModal(loan)}
                                                    title="Add Top-Up"
                                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded hover:bg-violet-200 dark:hover:bg-violet-800"
                                                >
                                                    <Plus size={12} /> Top-Up
                                                </button>
                                            )}
                                            {role === UserRole.ADMIN && (
                                                <>
                                                    <Button size="sm" variant="ghost" icon={AlertTriangle} onClick={() => handlePreClose(loan)} title="Pre-close Loan" className="text-rose-600 hover:bg-rose-50" />
                                                    <Button size="sm" variant="ghost" icon={Edit} onClick={() => openEditModal(loan)} title="Edit Loan" />
                                                    <Button size="sm" variant="ghost" icon={Trash2} onClick={() => handleDeleteLoan(loan.id)} className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20" title="Delete Loan" />
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {loansInSelectedPeriod.length === 0 && (
                    <div className="p-12">
                        <EmptyState
                            icon={Star}
                            title="No special loans found"
                            description={`There are no active or historical special loans recorded for ${MONTHS[selectedMonth - 1]} ${selectedYear}.`}
                            action={canCreateLoan ? (
                                <Button
                                    onClick={() => setModals({ ...modals, create: true })}
                                >
                                    Disburse Loan
                                </Button>
                            ) : undefined}
                        />
                    </div>
                )}
            </Card >

            {/* CREATE SPECIAL LOAN MODAL */}
            < Modal isOpen={modals.create} onClose={() => setModals({ ...modals, create: false })} title="Disburse Special Loan" >
                <div className="space-y-4">
                    <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-100 dark:border-amber-800 flex items-start">
                        <AlertTriangle size={18} className="text-amber-600 mr-2 mt-0.5" />
                        <p className="text-xs text-amber-800 dark:text-amber-200 font-medium">
                            Special loans are not limited by member savings. Ensure proper collateral or verification before disbursement.
                        </p>
                    </div>

                    {errorMsg && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">{errorMsg}</div>}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Select Member</label>
                        <select
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-white transition-shadow"
                            value={createForm.memberId}
                            onChange={(e) => setCreateForm({ ...createForm, memberId: e.target.value })}
                        >
                            <option value="">-- Choose Member --</option>
                            {members.filter(m => m.isActive).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Loan Amount"
                            type="number"
                            value={createForm.amount}
                            onChange={e => setCreateForm({ ...createForm, amount: e.target.value })}
                            leftIcon={<span className="text-xs font-bold text-amber-600">{settings.currency}</span>}
                        />
                        <Input
                            label="Int. Rate (% / Mo)"
                            type="number"
                            value={createForm.rate}
                            onChange={e => setCreateForm({ ...createForm, rate: e.target.value })}
                        />
                    </div>

                    <Input
                        label="Processing Fee"
                        type="number"
                        value={createForm.processingFee}
                        onChange={e => setCreateForm({ ...createForm, processingFee: e.target.value })}
                        leftIcon={<span className="text-xs font-bold text-amber-600">{settings.currency}</span>}
                        description="Revenue collected when the special loan is disbursed"
                    />

                    <Input
                        label="Disbursal Date"
                        type="date"
                        value={createForm.date}
                        onChange={e => setCreateForm({ ...createForm, date: e.target.value })}
                    />

                    <div className="bg-violet-50 dark:bg-violet-900/20 p-3 rounded-lg border border-violet-100 dark:border-violet-800 text-xs text-violet-700 dark:text-violet-300 space-y-1">
                        <div className="font-bold">✓ Interest-Only · Open-Ended</div>
                        <div className="text-violet-600 dark:text-violet-400">Monthly collection = outstanding × {createForm.rate || 1.5}% interest. No fixed duration. Principal repayable anytime. Top-ups allowed.</div>
                    </div>

                    <Button
                        className="w-full mt-4 bg-amber-600 hover:bg-amber-700 text-white shadow-lg active:scale-[0.98] transition-transform"
                        onClick={handleCreateLoan}
                        disabled={!createForm.memberId || !createForm.amount}
                    >
                        Disburse Special Loan
                    </Button>
                </div>
            </Modal>

            {/* REPAY MODAL — Interest Only Collection */}
            <Modal isOpen={modals.repay} onClose={() => setModals({ ...modals, repay: false })} title="Collect Monthly Interest">
                {activeLoan && (
                    <div className="space-y-4">
                        <div className="bg-violet-50 dark:bg-violet-900/20 p-3 rounded-lg border border-violet-100 dark:border-violet-800">
                            <div className="text-xs text-violet-500 uppercase font-bold tracking-tight mb-1">Interest-Only Special Loan</div>
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-slate-800 dark:text-white">{activeLoan.memberName}</span>
                                <div className="text-right">
                                    <div className="text-violet-700 dark:text-violet-300 font-black text-sm">{formatCurrency(activeLoan.historicalOutstanding, settings.currency)} outstanding</div>
                                    <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">Interest Due: {formatCurrency(activeLoan.interestComp, settings.currency)}</div>
                                </div>
                            </div>
                        </div>

                        {errorMsg && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{errorMsg}</div>}

                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                label="Interest Amount"
                                type="number"
                                value={repayForm.interest}
                                onChange={e => setRepayForm({ ...repayForm, interest: e.target.value })}
                                description="Monthly interest due"
                            />
                            <Input
                                label="Voluntary Principal ↓"
                                type="number"
                                value={repayForm.principal}
                                onChange={e => setRepayForm({ ...repayForm, principal: e.target.value })}
                                description="Optional — reduces outstanding"
                            />
                        </div>

                        <Input
                            label="Late Fee / Penalty"
                            type="number"
                            value={repayForm.lateFee}
                            onChange={e => setRepayForm({ ...repayForm, lateFee: e.target.value })}
                            description="Optional charges for delayed payment"
                        />

                        <Input
                            label="Collection Date"
                            type="date"
                            value={repayForm.date}
                            onChange={e => setRepayForm({ ...repayForm, date: e.target.value })}
                        />

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Payment Channel</label>
                            <div className="grid grid-cols-2 gap-2">
                                {[PaymentMethod.CASH, PaymentMethod.UPI, PaymentMethod.BANK_TRANSFER].map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setRepayForm({ ...repayForm, method: m })}
                                        className={`px-3 py-2 text-xs font-bold border rounded-lg transition-all ${repayForm.method === m ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                        
                        <Input
                            label="Internal Notes"
                            placeholder="Optional reference notes..."
                            value={repayForm.notes}
                            onChange={e => setRepayForm({ ...repayForm, notes: e.target.value })}
                        />
                        </div>

                        <div className="flex justify-between items-center pt-4 border-t border-slate-200 dark:border-slate-700">
                            <span className="font-bold text-slate-600 dark:text-slate-400">Transaction Total:</span>
                            <span className="font-black text-xl text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(((parseFloat(repayForm.principal) || 0) + (parseFloat(repayForm.interest) || 0) + (parseFloat(repayForm.lateFee) || 0)), settings.currency)}
                            </span>
                        </div>

                        <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 shadow-md" onClick={handleRepay}>Post Collection</Button>
                    </div>
                )}
            </Modal>

            {/* TOP-UP MODAL */}
            <Modal isOpen={modals.topup} onClose={() => setModals({ ...modals, topup: false })} title="Add Top-Up to Special Loan">
                {topupLoan && (
                    <div className="space-y-4">
                        <div className="bg-violet-50 dark:bg-violet-900/20 p-3 rounded-lg border border-violet-100 dark:border-violet-800">
                            <div className="text-xs text-violet-500 uppercase font-bold mb-1">Disbursing Top-Up For</div>
                            <div className="flex justify-between">
                                <span className="font-bold text-slate-800 dark:text-white">{topupLoan.memberName}</span>
                                <div className="text-right">
                                    <div className="text-xs text-slate-500">Current outstanding</div>
                                    <div className="font-black text-amber-600">{formatCurrency(getSpecialLoanOutstanding(topupLoan.id), settings.currency)}</div>
                                </div>
                            </div>
                            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                Rate: <span className="font-semibold text-violet-600">{topupLoan.interestRate}% / month</span> (same as original)
                            </div>
                        </div>

                        {errorMsg && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{errorMsg}</div>}

                        <Input
                            label="Top-Up Amount (₹)"
                            type="number"
                            placeholder="e.g. 50000"
                            value={topupForm.amount}
                            onChange={e => setTopupForm({ ...topupForm, amount: e.target.value })}
                            description={topupForm.amount ? `New outstanding will be: ${formatCurrency(getSpecialLoanOutstanding(topupLoan.id) + (parseFloat(topupForm.amount) || 0), settings.currency)}` : 'Amount being disbursed now'}
                        />

                        <Input
                            label="Disbursement Date"
                            type="date"
                            value={topupForm.date}
                            onChange={e => setTopupForm({ ...topupForm, date: e.target.value })}
                            description="Interest on this top-up starts from the following month"
                        />

                        <Input
                            label="Notes / Remarks"
                            type="text"
                            placeholder="Optional"
                            value={topupForm.notes}
                            onChange={e => setTopupForm({ ...topupForm, notes: e.target.value })}
                        />

                        <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                            <span>This top-up will increase the outstanding balance immediately. Interest on the new amount will be due from next month onward.</span>
                        </div>

                        <Button className="w-full bg-violet-600 hover:bg-violet-700 text-white py-3" onClick={handleTopup}
                            disabled={!topupForm.amount || !topupForm.date}>
                            Disburse Top-Up
                        </Button>
                    </div>
                )}
            </Modal>

            <Modal isOpen={modals.autoGen && !!autoGenLoan} onClose={() => setModals({ ...modals, autoGen: false })} title="Auto-Generate Interest Payments" maxWidth="max-w-md">
                <div className="space-y-6 pt-2">
                    <div className="bg-amber-50 dark:bg-amber-900/30 p-4 rounded-lg flex gap-3 text-amber-800 dark:text-amber-200 text-sm">
                        <AlertTriangle className="shrink-0 mt-0.5" />
                        <p>This will automatically calculate and record interest payments for all missing months from the loan's start date ({autoGenLoan && formatDisplayDate(autoGenLoan.startDate)}) until the current month.</p>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                            <span className="text-slate-500 font-medium">Missing Months Detected</span>
                            <span className="font-bold text-slate-900 dark:text-white text-xl">{autoGenPreview.months}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                            <span className="text-slate-500 font-medium">Total Interest Calculated</span>
                            <span className="font-bold text-amber-600 text-xl">{formatCurrency(autoGenPreview.totalInterest, settings.currency)}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-2">Interest is calculated month-by-month based on the outstanding principal at that time, accounting for any top-ups or partial repayments.</p>
                    </div>

                    <div className="flex justify-between gap-3 mt-6">
                        {autoGenPreview.months === 0 && loanRepayments.filter(r => r.loanId === (autoGenLoan?.id) && (r.interestPaid || 0) > 0).length > 0 && (
                            <Button variant="danger" onClick={handleWipeInterest} className="bg-red-50 text-red-600 hover:bg-red-100 border-red-200">
                                <Trash2 size={16} className="mr-2" />
                                Wipe & Re-gen
                            </Button>
                        )}
                        <div className="flex gap-3 ml-auto">
                            <Button variant="outline" onClick={() => setModals({ ...modals, autoGen: false })}>Cancel</Button>
                            <Button onClick={handleGenerateInterest} disabled={autoGenPreview.months === 0}>Generate {autoGenPreview.months} Records</Button>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* LOAN DETAILS MODAL — Expanded width for ledger stability */}
            <Modal isOpen={modals.history} onClose={() => setModals({ ...modals, history: false })} title="Special Loan Audit Ledger" maxWidth="4xl">
                {activeLoan && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-4 gap-3">
                            <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                                <p className="text-slate-400 text-[9px] uppercase font-bold mb-1">Original Principal</p>
                                <p className="font-black text-slate-800 dark:text-white">{formatCurrency(activeLoan.principalAmount, settings.currency)}</p>
                            </div>
                            <div className="p-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-100 dark:border-violet-800 text-center">
                                <p className="text-violet-500 text-[9px] uppercase font-bold mb-1">Total Top-Ups</p>
                                <p className="font-black text-violet-800 dark:text-violet-200">{formatCurrency(loanTopups.filter(t => t.loanId === activeLoan.id).reduce((s, t) => s + t.amount, 0), settings.currency)}</p>
                            </div>
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 text-center">
                                <p className="text-blue-500 text-[9px] uppercase font-bold mb-1">Principal Repaid</p>
                                <p className="font-black text-blue-800 dark:text-blue-200">{formatCurrency(activeLoan.historicalPrincipalPaid, settings.currency)}</p>
                            </div>
                            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800 text-center shadow-inner">
                                <p className="text-amber-600 text-[9px] uppercase font-bold mb-1">Live Balance</p>
                                <p className="font-black text-xl text-amber-900 dark:text-amber-200">{formatCurrency(activeLoan.historicalOutstanding, settings.currency)}</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between shadow-sm items-center">
                                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Transaction Audit Trail</h4>
                                <Button variant="ghost" size="sm" className="text-[10px] text-red-600" onClick={handleWipeInterest}>Wipe All Interest</Button>
                            </div>
                            <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                                <div className="max-h-[400px] overflow-y-auto">
                                    <table className="min-w-full text-xs">
                                        <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                                            <tr>
                                                <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase">Date</th>
                                                <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase">Type</th>
                                                <th className="px-4 py-3 text-right font-bold text-slate-500 uppercase">Amount</th>
                                                <th className="px-4 py-3 text-right font-bold text-slate-500 uppercase">Principal</th>
                                                <th className="px-4 py-3 text-right font-bold text-slate-500 uppercase">Interest</th>
                                                <th className="px-4 py-3 text-right font-bold text-slate-500 uppercase">Balance</th>
                                                <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase">Notes</th>
                                                <th className="px-4 py-3 text-center font-bold text-slate-500 uppercase">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {/* Base Loan Disbursal Row */}
                                            <tr className="bg-emerald-50/20">
                                                <td className="px-4 py-3 font-medium">{formatDisplayDate(activeLoan.startDate)}</td>
                                                <td className="px-4 py-3"><span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px]">DISBURSAL</span></td>
                                                <td className="px-4 py-3 text-right font-black text-emerald-700">{formatCurrency(activeLoan.principalAmount, settings.currency)}</td>
                                                <td className="px-4 py-3 text-right font-black text-emerald-700">{formatCurrency(activeLoan.principalAmount, settings.currency)}</td>
                                                <td className="px-4 py-3 text-right text-slate-300">—</td>
                                                <td className="px-4 py-3 text-right font-black text-emerald-700">{formatCurrency(activeLoan.principalAmount, settings.currency)}</td>
                                                <td className="px-4 py-3 text-slate-500 italic">Original loan disbursement</td>
                                                <td className="px-4 py-3 text-center">
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-blue-500" onClick={() => openEditModal(activeLoan)}><Edit size={12} /></Button>
                                                </td>
                                            </tr>
                                            {activeLoanTransactions.map((tx: any) => (
                                                <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/20 transition-colors">
                                                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatDisplayDate(tx.date)}</td>
                                                    <td className="px-4 py-3">
                                                        {tx.entryType === 'TOPUP' ? (
                                                            <span className="px-2 py-0.5 rounded bg-violet-100 text-violet-700 font-bold text-[10px]">TOP-UP</span>
                                                        ) : (tx.principalPaid || 0) > 0 && (tx.interestPaid || 0) === 0 ? (
                                                            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-bold text-[10px]">REPAYMENT</span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px]">INTEREST</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold">
                                                        {tx.entryType === 'TOPUP' ? (
                                                            <span className="text-violet-600">+{formatCurrency(tx.amount || 0, settings.currency)}</span>
                                                        ) : (tx.principalPaid || 0) > 0 || (tx.interestPaid || 0) > 0 ? (
                                                            <span className="text-red-600">-{formatCurrency((tx.principalPaid || 0) + (tx.interestPaid || 0), settings.currency)}</span>
                                                        ) : '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold">
                                                        {(tx.principalPaid || 0) > 0 ? (
                                                            <span className="text-blue-600">-{formatCurrency(tx.principalPaid, settings.currency)}</span>
                                                        ) : '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold">
                                                        {(tx.interestPaid || 0) > 0 ? (
                                                            <span className="text-emerald-600">-{formatCurrency(tx.interestPaid, settings.currency)}</span>
                                                        ) : '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold">
                                                        <span className="text-slate-700">{formatCurrency(getSpecialLoanOutstanding(activeLoan.id, tx.date), settings.currency)}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-500 italic max-w-[200px] truncate">{tx.notes || '—'}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        <div className="flex justify-center gap-1">
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon" 
                                                                className="h-6 w-6 text-red-500" 
                                                                onClick={async () => {
                                                                    if (confirm("Delete this transaction permanently?")) {
                                                                        try {
                                                                            if (tx.entryType === 'TOPUP') await deleteLoanTopup(tx.id);
                                                                            else await deleteLoanRepayment(tx.id);
                                                                            log('DELETE_TRANSACTION', 'special_loans', activeLoan.id, { date: tx.date, type: tx.entryType });
                                                                        } catch (e) { alert("Failed to delete record"); }
                                                                    }
                                                                }}
                                                            >
                                                                <Trash2 size={12} />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                             <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setModals({ ...modals, history: false })}>Close Ledger</Button>
                             <Button className="flex-1 bg-amber-600 hover:bg-amber-700 text-white rounded-xl" onClick={() => { setModals({ ...modals, history: false, autoGen: true }); openAutoGenModal(activeLoan); }}>Recalculate Interest</Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* EDIT LOAN MODAL */}
            < Modal isOpen={modals.edit} onClose={() => setModals({ ...modals, edit: false })} title="Edit Special Loan" >
                <div className="space-y-4">
                    {errorMsg && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">{errorMsg}</div>}

                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Loan Amount"
                            type="number"
                            value={editForm.amount}
                            onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                            leftIcon={<span className="text-xs font-bold text-amber-600">{settings.currency}</span>}
                        />
                        <Input
                            label="Int. Rate (% / Mo)"
                            type="number"
                            value={editForm.rate}
                            onChange={e => setEditForm({ ...editForm, rate: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                            <select
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                                value={editForm.status}
                                onChange={(e) => setEditForm({ ...editForm, status: e.target.value as LoanStatus })}
                            >
                                <option value={LoanStatus.ACTIVE}>Active</option>
                                <option value={LoanStatus.CLOSED}>Closed</option>
                                <option value={LoanStatus.REJECTED}>Rejected</option>
                            </select>
                        </div>
                    </div>

                    <Button
                        className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
                        onClick={handleUpdateLoan}
                    >
                        Save Changes
                    </Button>
                </div>
            </Modal>

            {/* CALCULATOR MODAL */}
            <Modal isOpen={modals.calc} onClose={() => setModals({ ...modals, calc: false })} title="Loan Calculator (Premium)" maxWidth="4xl">
                <LoanCalculator />
            </Modal>

            {/* PRINT SCHEDULE MODAL */}
            <Modal
                isOpen={!!printScheduleLoan}
                onClose={() => setPrintScheduleLoan(null)}
                title={`Amortization Schedule: ${printScheduleLoan?.memberName}`}
                maxWidth="3xl"
            >
                {printScheduleLoan && (
                    <LoanCalculator
                        initialValues={{
                            principal: printScheduleLoan.principalAmount,
                            rate: printScheduleLoan.interestRate,
                            months: printScheduleLoan.durationMonths || 12,
                            startDate: printScheduleLoan.startDate,
                            method: printScheduleLoan.calculationMethod
                        }}
                        repayments={loanRepayments.filter(r => r.loanId === printScheduleLoan.id)}
                    />
                )}
            </Modal>
        </div>
    );
};

export default SpecialLoans;
