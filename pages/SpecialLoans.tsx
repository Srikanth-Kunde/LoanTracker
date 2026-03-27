
import React, { useState, useMemo } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useMembers } from '../context/MemberContext';
import { useFinancials } from '../context/FinancialContext';
import { useAuth } from '../context/AuthContext';
import { useAuditLog } from '../context/AuditLogContext';
import { InterestCalculationType, Loan, LoanStatus, LoanRepayment, PaymentMethod, UserRole, LoanCalculationMethod, LoanType, LoanTopup } from '../types';
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
import { compareISODate, formatDisplayDate, getDaysInMonth, getISODateMonthYear, getLastDayOfMonthISO, isoDateToTimestamp, parseISODateParts } from '../utils/date';
import { getInterestRateForDate } from '../utils/interest';
import { downloadAs, downloadMultiSheetXLSX, type DownloadFormat } from '../utils/xlsxUtils';
import {
    getAutoGenerationStopDate,
    buildLoanLedger,
    getInterestDueForPeriod,
    getInvalidInterestRepayments,
    getInterestPaidForPeriod,
    getInterestPeriodKey,
    getLastInterestPaymentDate,
    getMissingInterestPeriods,
    getProratedInterestForDays,
    getRepaymentInterestPeriod,
    isWaivedPeriod,
    calculatePrincipalPaid,
    getVoucherTypeLabel
} from '../utils/loanMath';

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
    selectedPeriodInterestPaid: number;
    lastInterestPaymentDate?: string | null;
}

const SpecialLoans: React.FC = () => {
    const { settings } = useSettings();
    const { members } = useMembers();
    const {
        loans, loanRepayments, loanTopups, createLoan, updateLoan, deleteLoan,
        recordLoanRepayment, updateLoanRepayment, closeLoan,
        addLoanTopup, updateLoanTopup, deleteLoanRepayment, deleteLoanTopup, wipeLoanInterest, cleanupInvalidLoanInterest, bulkRecordLoanRepayments,
        globalAutoGenLoanInterest, getSpecialLoanOutstanding, fetchFinancials
    } = useFinancials();
    const { role } = useAuth();
    const { log } = useAuditLog();

    // State
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'CLOSED'>('ACTIVE');
    const [sortOrder, setSortOrder] = useState<'DATE_DESC' | 'DATE_ASC' | 'NAME_ASC' | 'NAME_DESC' | 'AMOUNT_DESC' | 'AMOUNT_ASC' | 'OUTSTANDING_DESC' | 'MEMBER_ID_ASC' | 'MEMBER_ID_DESC'>('DATE_DESC');

    const [modals, setModals] = useState<{
        create: boolean;
        repay: boolean;
        calc: boolean;
        history: boolean;
        edit: boolean;
        editInterest: boolean;
        topup: boolean;
        autoGen: boolean;
        globalZap: boolean;
    }>({ create: false, repay: false, calc: false, history: false, edit: false, editInterest: false, topup: false, autoGen: false, globalZap: false });

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
        rate: '',
        date: new Date().toISOString().split('T')[0],
        notes: ''
    });
    const [topupLoan, setTopupLoan] = useState<EnrichedLoan | null>(null);
    const [topupEditTarget, setTopupEditTarget] = useState<LoanTopup | null>(null);

    const [autoGenLoan, setAutoGenLoan] = useState<EnrichedLoan | null>(null);
    const [interestEditTarget, setInterestEditTarget] = useState<LoanRepayment | null>(null);

    const [repayForm, setRepayForm] = useState({
        principal: '',
        interest: '',
        lateFee: '0',
        date: new Date().toISOString().split('T')[0],
        interestCalculationType: 'MONTHLY' as InterestCalculationType,
        interestDays: '',
        method: PaymentMethod.CASH,
        notes: ''
    });

    const [interestEditForm, setInterestEditForm] = useState({
        interestCalculationType: 'MONTHLY' as InterestCalculationType,
        interestDays: '',
        date: '',
        month: '',
        year: '',
        principalPaid: '0',
        interestPaid: '0',
        notes: ''
    });

    const [activeLoan, setActiveLoan] = useState<EnrichedLoan | null>(null); // For Repay/History
    const [errorMsg, setErrorMsg] = useState('');

    const [editForm, setEditForm] = useState({
        id: '',
        amount: '',
        rate: '',
        date: '',
        status: LoanStatus.ACTIVE,
        settleRemaining: false,
        settlementDate: new Date().toISOString().split('T')[0],
        settlementMethod: PaymentMethod.CASH,
        settlementNotes: ''
    });

    // Ledger Filter & Sum State
    const [ledgerSearchTerm, setLedgerSearchTerm] = useState('');
    const [ledgerTypeFilters, setLedgerTypeFilters] = useState<string[]>([]);
    const [ledgerSortConfig, setLedgerSortConfig] = useState<{ key: 'DATE' | 'AMOUNT', direction: 'ASC' | 'DESC' }>({ key: 'DATE', direction: 'ASC' });
    const [ledgerViewTab, setLedgerViewTab] = useState<'SUMMARY' | 'AUDIT'>('SUMMARY');

    // Download format state
    const [reportFormat, setReportFormat] = useState<DownloadFormat>('XLSX');
    const [ledgerFormat, setLedgerFormat] = useState<DownloadFormat>('XLSX');
    const [bulkDownloadFormat, setBulkDownloadFormat] = useState<DownloadFormat>('XLSX');

    // Sync rates with dates based on rules
    React.useEffect(() => {
        if (createForm.date) {
            const autoRate = getInterestRateForDate(createForm.date, settings);
            setCreateForm(prev => ({ ...prev, rate: autoRate.toString() }));
        }
    }, [createForm.date, settings]);

    React.useEffect(() => {
        if (topupForm.date) {
            const autoRate = getInterestRateForDate(topupForm.date, settings);
            setTopupForm(prev => ({ ...prev, rate: autoRate.toString() }));
        }
    }, [topupForm.date, settings]);

    const roundCurrency = (amount: number) => Math.round(amount * 100) / 100;
    const escapeCsvValue = (value: string | number | null | undefined) => {
        const normalized = value == null ? '' : String(value);
        if (/[",\n]/.test(normalized)) {
            return `"${normalized.replace(/"/g, '""')}"`;
        }
        return normalized;
    };
    const getDefaultInterestDays = (repayment: LoanRepayment, year: number, month: number) =>
        repayment.interestDays || Math.min(parseISODateParts(repayment.date).day, getDaysInMonth(year, month));

    const getInterestEditPreview = (
        loan: EnrichedLoan,
        repayment: LoanRepayment,
        form: typeof interestEditForm
    ) => {
        const interestPeriod = form.month && form.year 
            ? { month: parseInt(form.month), year: parseInt(form.year) }
            : getRepaymentInterestPeriod(repayment);
            
        if (!interestPeriod) {
            return null;
        }

        const currentLoanTopups = loanTopups.filter(t => t.loanId === loan.id);
        const currentLoanRepayments = loanRepayments.filter(r => r.loanId === loan.id);
        const periodDue = getInterestDueForPeriod(
            loan,
            currentLoanTopups,
            currentLoanRepayments,
            interestPeriod,
            settings
        );
        const defaultInterestDays = getDefaultInterestDays(repayment, interestPeriod.year, interestPeriod.month);
        const parsedInterestDays = Number.parseInt(form.interestDays || '', 10);
        const requestedInterestDays = Number.isFinite(parsedInterestDays) && parsedInterestDays > 0
            ? parsedInterestDays
            : defaultInterestDays;
        const monthDays = getDaysInMonth(interestPeriod.year, interestPeriod.month);
        const proration = form.interestCalculationType === 'PRORATED_DAYS'
            ? getProratedInterestForDays(
                periodDue.openingOutstanding,
                periodDue.rate,
                interestPeriod.year,
                interestPeriod.month,
                requestedInterestDays
            )
            : null;
        const nextInterestAmount = form.interestCalculationType === 'PRORATED_DAYS'
            ? proration?.proratedInterest || 0
            : (form.interestPaid !== String(repayment.interestPaid || 0) ? Number(form.interestPaid) : periodDue.interestDue);

        return {
            interestPeriod,
            periodLabel: `${MONTHS[interestPeriod.month - 1]} ${interestPeriod.year}`,
            openingOutstanding: periodDue.openingOutstanding,
            monthlyRate: periodDue.rate,
            monthlyInterest: periodDue.interestDue,
            currentInterest: Number(repayment.interestPaid || 0),
            currentAmount: Number(repayment.amount || 0),
            nextInterest: roundCurrency(nextInterestAmount),
            nextAmount: roundCurrency(Number(form.principalPaid || 0) + nextInterestAmount),
            daysHeld: proration?.daysHeld || requestedInterestDays,
            monthDays,
            formula: proration
                ? `${formatCurrency(periodDue.openingOutstanding, settings.currency)} × ${periodDue.rate}% × ${proration.daysHeld}/${proration.monthDays}`
                : null
        };
    };

    const getRepaymentPreview = (
        loan: EnrichedLoan,
        collectionDate: string,
        interestCalculationType: InterestCalculationType = 'MONTHLY',
        rawInterestDays = ''
    ) => {
        const collectionPeriod = getISODateMonthYear(collectionDate);
        const previousPeriod = collectionPeriod.month === 1
            ? { year: collectionPeriod.year - 1, month: 12 }
            : { year: collectionPeriod.year, month: collectionPeriod.month - 1 };
        const currentLoanTopups = loanTopups.filter(t => t.loanId === loan.id);
        const currentLoanRepayments = loanRepayments.filter(r => r.loanId === loan.id);
        const missedPeriods = getMissingInterestPeriods(
            loan,
            currentLoanTopups,
            currentLoanRepayments,
            previousPeriod,
            settings
        );
        const currentPeriodDue = getInterestDueForPeriod(
            loan,
            currentLoanTopups,
            currentLoanRepayments,
            collectionPeriod,
            settings
        );
        const currentPeriodInterestPaid = getInterestPaidForPeriod(currentLoanRepayments, loan.id, collectionPeriod);
        const currentPeriodAlreadyPaid = currentPeriodInterestPaid > 0;
        const parsedInterestDays = Number.parseInt(rawInterestDays || '', 10);
        const exactDaysRequested = interestCalculationType === 'PRORATED_DAYS' && Number.isFinite(parsedInterestDays) && parsedInterestDays > 0;
        const exactDaysBasePrincipal = getSpecialLoanOutstanding(loan.id, collectionDate);
        const fallbackMonthlyInterest = roundCurrency(exactDaysBasePrincipal * (currentPeriodDue.rate / 100));
        const currentPeriodProration = exactDaysRequested
            ? getProratedInterestForDays(
                exactDaysBasePrincipal,
                currentPeriodDue.rate,
                collectionPeriod.year,
                collectionPeriod.month,
                parsedInterestDays
            )
            : null;
        const missedMonthsDetails = missedPeriods.map(period => ({
            month: period.month,
            year: period.year,
            principal: 0,
            interest: Math.round(period.interestDue),
            lateFee: 0
        }));
        const arrearsInterest = missedMonthsDetails.reduce((sum, period) => sum + period.interest, 0);
        const currentInterestDue = currentPeriodAlreadyPaid
            ? 0
            : roundCurrency(exactDaysRequested
                ? currentPeriodProration?.proratedInterest || fallbackMonthlyInterest
                : currentPeriodDue.interestDue);

        return {
            collectionPeriod,
            currentPeriodAlreadyPaid,
            currentInterestDue,
            arrearsInterest,
            totalSuggestedInterest: arrearsInterest + currentInterestDue,
            missedMonthsDetails,
            interestCalculationType,
            interestDays: currentPeriodProration?.daysHeld,
            interestMonthDays: currentPeriodProration?.monthDays || getDaysInMonth(collectionPeriod.year, collectionPeriod.month),
            currentRate: currentPeriodDue.rate,
            exactDaysBasePrincipal,
            currentInterestFormula: currentPeriodProration
                ? `${formatCurrency(exactDaysBasePrincipal, settings.currency)} × ${currentPeriodDue.rate}% × ${currentPeriodProration.daysHeld}/${currentPeriodProration.monthDays}`
                : null
        };
    };

    const repaymentPreview = useMemo(() => {
        if (!activeLoan || !repayForm.date) return null;
        return getRepaymentPreview(activeLoan, repayForm.date, repayForm.interestCalculationType, repayForm.interestDays);
    }, [activeLoan, repayForm.date, repayForm.interestCalculationType, repayForm.interestDays, loanRepayments, loanTopups]);

    const repaymentPreviewSummary = useMemo(() => {
        if (!repaymentPreview) return null;
        const missed = repaymentPreview.missedMonthsDetails;
        if (missed.length === 0) {
            const currentPeriodLabel = `${MONTHS[repaymentPreview.collectionPeriod.month - 1]} ${repaymentPreview.collectionPeriod.year}`;
            if (repaymentPreview.interestCalculationType === 'PRORATED_DAYS' && repaymentPreview.interestDays) {
                return `Current period ${currentPeriodLabel}: ${formatCurrency(repaymentPreview.currentInterestDue, settings.currency)} for ${repaymentPreview.interestDays} day${repaymentPreview.interestDays > 1 ? 's' : ''} (${repaymentPreview.currentInterestFormula}).`;
            }
            return `Current period ${currentPeriodLabel}: ${formatCurrency(repaymentPreview.currentInterestDue, settings.currency)}`;
        }

        const first = missed[0];
        const last = missed[missed.length - 1];
        const arrearsRange = missed.length === 1
            ? `${MONTHS[first.month - 1]} ${first.year}`
            : `${MONTHS[first.month - 1]} ${first.year} to ${MONTHS[last.month - 1]} ${last.year}`;

        const currentPeriodLabel = `${MONTHS[repaymentPreview.collectionPeriod.month - 1]} ${repaymentPreview.collectionPeriod.year}`;
        const currentPeriodSummary = repaymentPreview.interestCalculationType === 'PRORATED_DAYS' && repaymentPreview.interestDays
            ? `${formatCurrency(repaymentPreview.currentInterestDue, settings.currency)} for ${repaymentPreview.interestDays} day${repaymentPreview.interestDays > 1 ? 's' : ''} (${repaymentPreview.currentInterestFormula})`
            : formatCurrency(repaymentPreview.currentInterestDue, settings.currency);

        return `Arrears: ${missed.length} month${missed.length > 1 ? 's' : ''} (${arrearsRange}) = ${formatCurrency(repaymentPreview.arrearsInterest, settings.currency)}. Current period ${currentPeriodLabel} = ${currentPeriodSummary}.`;
    }, [repaymentPreview, settings.currency]);

    const interestEditPreview = useMemo(() => {
        if (!activeLoan || !interestEditTarget) return null;
        return getInterestEditPreview(
            activeLoan,
            interestEditTarget,
            interestEditForm
        );
    }, [activeLoan, interestEditForm, interestEditTarget, loanRepayments, loanTopups]);

    const activeLoanTransactions = useMemo(() => {
        if (!activeLoan) return [];
        return buildLoanLedger(
            activeLoan,
            loanTopups.filter(t => t.loanId === activeLoan.id),
            loanRepayments.filter(r => r.loanId === activeLoan.id),
            settings
        );
    }, [activeLoan, loanRepayments, loanTopups, settings]);

    const filteredLedgerTransactions = useMemo(() => {
        if (!activeLoanTransactions) return [];
        return activeLoanTransactions.filter(tx => {
            const matchesSearch = !ledgerSearchTerm || (tx.notes || '').toLowerCase().includes(ledgerSearchTerm.toLowerCase()) || (tx.interestPeriod ? `${MONTHS[tx.interestPeriod.month - 1]} ${tx.interestPeriod.year}` : '').toLowerCase().includes(ledgerSearchTerm.toLowerCase());

            let matchesType = true;
            if (ledgerTypeFilters.length > 0) {
                const type = tx.entryType === 'REPAYMENT'
                    ? ((tx.interestPaid || 0) > 0 ? 'INTEREST' : 'REPAYMENT')
                    : tx.entryType;
                matchesType = ledgerTypeFilters.includes(type);
            }

            return matchesSearch && matchesType;
        }).sort((a, b) => {
            if (ledgerSortConfig.key === 'DATE') {
                const cmp = compareISODate(a.date, b.date);
                return ledgerSortConfig.direction === 'ASC' ? cmp : -cmp;
            } else if (ledgerSortConfig.key === 'AMOUNT') {
                const amtA = (a.amount || 0) + (a.principalPaid || 0) + (a.interestPaid || 0);
                const amtB = (b.amount || 0) + (b.principalPaid || 0) + (b.interestPaid || 0);
                return ledgerSortConfig.direction === 'ASC' ? amtA - amtB : amtB - amtA;
            }
            return 0;
        });
    }, [activeLoanTransactions, ledgerTypeFilters, ledgerSearchTerm, ledgerSortConfig]);

    const ledgerTotals = useMemo(() => {
        return filteredLedgerTransactions.reduce((acc, tx) => {
            const isDisbursal = tx.entryType === 'DISBURSAL';
            const isTopup = tx.entryType === 'TOPUP';
            const isOutflow = isDisbursal || isTopup;
            const amt = Number(tx.amount || 0);
            const p = Number(tx.principalPaid || 0);
            const i = Number(tx.interestPaid || 0);

            // For disbursals and topups, the amount is principal
            // For repayments, principalPaid is the principal portion
            const principalAmount = isOutflow ? amt : p;

            acc.amount += isOutflow ? amt : -amt;
            acc.principal += isOutflow ? amt : -principalAmount;
            acc.interest += i;
            return acc;
        }, { amount: 0, principal: 0, interest: 0 });
    }, [filteredLedgerTransactions]);

    const activeLoanSummary = useMemo(() => {
        if (!activeLoan) return null;

        const topupsTotal = loanTopups
            .filter(t => t.loanId === activeLoan.id)
            .reduce((sum, topup) => sum + Number(topup.amount || 0), 0);
        const principalRepaid = loanRepayments
            .filter(r => r.loanId === activeLoan.id)
            .reduce((sum, repayment) => sum + calculatePrincipalPaid(repayment), 0);
        const interestPaid = loanRepayments
            .filter(r => r.loanId === activeLoan.id)
            .reduce((sum, repayment) => sum + Number(repayment.interestPaid || 0), 0);

        return {
            topupsTotal,
            principalRepaid,
            interestPaid,
            liveBalance: getSpecialLoanOutstanding(activeLoan.id)
        };
    }, [activeLoan, getSpecialLoanOutstanding, loanRepayments, loanTopups]);

    const editLoanSummary = useMemo(() => {
        if (!activeLoan) return null;

        const revisedPrincipal = parseFloat(editForm.amount) || 0;
        const topupsTotal = loanTopups
            .filter(t => t.loanId === activeLoan.id)
            .reduce((sum, topup) => sum + Number(topup.amount || 0), 0);
        const principalRecovered = loanRepayments
            .filter(r => r.loanId === activeLoan.id)
            .reduce((sum, repayment) => sum + calculatePrincipalPaid(repayment), 0);
        const rawRemaining = roundCurrency(revisedPrincipal + topupsTotal - principalRecovered);

        return {
            revisedPrincipal,
            topupsTotal,
            principalRecovered,
            rawRemaining,
            remainingPrincipal: rawRemaining > 1 ? rawRemaining : 0
        };
    }, [activeLoan, editForm.amount, loanRepayments, loanTopups]);

    // Permissions
    const canCreateLoan = role === UserRole.ADMIN;
    const canRepayLoan = role === UserRole.ADMIN || role === UserRole.OPERATOR;

    // --- Logic & Memos ---
    const calculateEMI = (principal: number, ratePerMonth: number, months: number) => {
        const safeMonths = Math.max(1, months);
        const r = ratePerMonth / 100;
        if (r === 0) return roundCurrency(principal / safeMonths);
        const emi = (principal * r * Math.pow(1 + r, safeMonths)) / (Math.pow(1 + r, safeMonths) - 1);
        return roundCurrency(emi);
    };

    const loansInSelectedPeriod = useMemo((): EnrichedLoan[] => {
        const endOfMonth = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);
        const endOfMonthTime = endOfMonth.getTime();
        const selectedPeriod = { year: selectedYear, month: selectedMonth };

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
            const topupsForLoan = loanTopups.filter(t => t.loanId === loan.id);

            let historicalPrincipalPaid = 0;
            let historicalInterestPaid = 0;
            let historicalLateFeePaid = 0;
            let totalPaidInSelectedMonth = 0;
            let selectedMonthLateFee = 0;
            const selectedPeriodInterestPaid = getInterestPaidForPeriod(allRepayments, loan.id, selectedPeriod);
            const isPaidSelectedMonth = selectedPeriodInterestPaid > 0;

            allRepayments.forEach(r => {
                const rDate = isoDateToTimestamp(r.date, true);
                if (rDate <= endOfMonthTime) {
                    historicalPrincipalPaid += calculatePrincipalPaid(r);
                    historicalInterestPaid += (r.interestPaid || 0);
                    historicalLateFeePaid += (r.lateFee || 0);
                }
                const actualTxnPeriod = getISODateMonthYear(r.date);
                if (actualTxnPeriod.month === selectedMonth && actualTxnPeriod.year === selectedYear) {
                    selectedMonthLateFee += (r.lateFee || 0);
                }

                const assignedPeriod = getRepaymentInterestPeriod(r);
                if (assignedPeriod && getInterestPeriodKey(assignedPeriod) === getInterestPeriodKey(selectedPeriod)) {
                    totalPaidInSelectedMonth += (r.amount || 0) + (r.lateFee || 0);
                }
            });

            let historicalOutstanding = getSpecialLoanOutstanding(loan.id);
            let openingOutstanding = 0;
            let monthlyDue = 0;
            let principalComp = 0;
            let interestComp = 0;

            // ── INTEREST-ONLY logic for Special Loans ────────────────────────
            // Outstanding = original + topups before start-of-month − principal repaid before start-of-month
            if (loan.status === LoanStatus.ACTIVE) {
                const periodDue = getInterestDueForPeriod(loan, topupsForLoan, allRepayments, selectedPeriod, settings);
                openingOutstanding = periodDue.openingOutstanding;
                interestComp = periodDue.interestDue;
                principalComp = 0;  // No mandatory principal
                monthlyDue = interestComp;
            }

            // Determine if this month's payment is overdue
            // A payment is considered overdue only if we are now in a month AFTER the selectedMonth
            const todayDate = new Date();
            const isOverdueMonth =
                (todayDate.getFullYear() > selectedYear || (todayDate.getFullYear() === selectedYear && todayDate.getMonth() + 1 > selectedMonth)) &&
                loan.status === LoanStatus.ACTIVE &&
                monthlyDue > 0 &&
                !isPaidSelectedMonth;

            return {
                ...loan,
                memberName: member?.name || 'Unknown',
                memberPhone: member?.phone || '',
                historicalOutstanding,
                openingOutstanding,
                historicalPrincipalPaid,
                historicalInterestPaid,
                historicalLateFeePaid,
                selectedMonthLateFee,
                selectedPeriodInterestPaid,
                monthlyDue: Math.round(monthlyDue),
                principalComp: Math.round(principalComp),
                interestComp: Math.round(interestComp),
                isPaidSelectedMonth,
                totalPaidInSelectedMonth,
                isOverdueMonth,
                lastInterestPaymentDate: getLastInterestPaymentDate(allRepayments, loan.id)
            };
        }).filter(l => {
            const lowSearch = searchTerm.toLowerCase();
            return (
                l.memberName.toLowerCase().includes(lowSearch) ||
                String(l.memberId).toLowerCase().includes(lowSearch) ||
                (l.memberPhone && l.memberPhone.includes(searchTerm)) ||
                l.id.toLowerCase().includes(lowSearch)
            );
        }).sort((a, b) => {
            if (sortOrder === 'MEMBER_ID_ASC') return (parseInt(a.memberId) || 0) - (parseInt(b.memberId) || 0) || a.memberId.localeCompare(b.memberId);
            if (sortOrder === 'MEMBER_ID_DESC') return (parseInt(b.memberId) || 0) - (parseInt(a.memberId) || 0) || b.memberId.localeCompare(a.memberId);
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
        if (!autoGenLoan) {
            return {
                months: 0,
                totalInterest: 0,
                records: [],
                staleInterestCount: 0,
                staleInterestTotal: 0,
                exactDayOverrideCount: 0,
                stopDate: null as string | null
            };
        }
        const today = new Date();
        let endPeriod = { year: today.getFullYear(), month: today.getMonth() + 1 };
        if (settings.globalCutoffDate) {
            const cutoffParts = settings.globalCutoffDate.split('-');
            if (cutoffParts.length === 3) {
                endPeriod = { year: parseInt(cutoffParts[0]), month: parseInt(cutoffParts[1]) };
            }
        }
        const loanRepaymentsForLoan = loanRepayments.filter(r => r.loanId === autoGenLoan.id);
        const loanTopupsForLoan = loanTopups.filter(t => t.loanId === autoGenLoan.id);
        const stopDate = getAutoGenerationStopDate(autoGenLoan, loanTopupsForLoan, loanRepaymentsForLoan, endPeriod);
        const staleInterestRows = getInvalidInterestRepayments(autoGenLoan, loanTopupsForLoan, loanRepaymentsForLoan, endPeriod, settings);
        const missingPeriods = getMissingInterestPeriods(autoGenLoan, loanTopupsForLoan, loanRepaymentsForLoan, endPeriod, settings);
        const exactDayOverrideCount = loanRepaymentsForLoan.filter(r =>
            (r.interestPaid || 0) > 0 && r.interestCalculationType === 'PRORATED_DAYS'
        ).length;

        const missingRecords: Omit<LoanRepayment, 'id'>[] = missingPeriods.map(period => ({
            loanId: autoGenLoan.id,
            date: period.postingDate,
            amount: period.interestDue,
            interestPaid: period.interestDue,
            principalPaid: 0,
            lateFee: 0,
            interestForMonth: period.month,
            interestForYear: period.year,
            method: PaymentMethod.CASH,
            notes: 'Auto-generated historical interest'
        }));

        const totalInterest = missingRecords.reduce((sum, record) => sum + (record.interestPaid || 0), 0);
        const staleInterestTotal = staleInterestRows.reduce((sum, row) => sum + Number(row.interestPaid || 0), 0);

        return {
            months: missingRecords.length,
            totalInterest,
            records: missingRecords,
            staleInterestCount: staleInterestRows.length,
            staleInterestTotal,
            exactDayOverrideCount,
            stopDate
        };
    }, [autoGenLoan, loanRepayments, loanTopups, getSpecialLoanOutstanding, settings, roundCurrency]);

    const [isGenerating, setIsGenerating] = useState(false);
    const [generationProgress, setGenerationProgress] = useState(0);
    const [generationProgressLabel, setGenerationProgressLabel] = useState('');

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

    const handleCreateLoan = async () => {
        if (!canCreateLoan) return;
        setErrorMsg('');
        try {
            if (!createForm.memberId) throw new Error("Please select a member");
            if (loans.some(l => l.memberId === createForm.memberId && l.type === LoanType.SPECIAL && l.status === LoanStatus.ACTIVE)) {
                throw new Error("This member already has an active special loan. Record a top-up instead.");
            }
            const reqAmount = parseFloat(createForm.amount);
            if (isNaN(reqAmount) || reqAmount <= 0) throw new Error("Please enter a valid principal amount");
            const rate = parseFloat(createForm.rate);
            if (isNaN(rate) || rate <= 0) throw new Error("Please enter a valid interest rate");

            await createLoan({
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
        setActiveLoan(loan);
        const today = new Date();
        let defaultDate = today.toISOString().split('T')[0];
        if (selectedMonth !== today.getMonth() + 1 || selectedYear !== today.getFullYear()) {
            const d = new Date(selectedYear, selectedMonth - 1, 5);
            defaultDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        }

        const preview = getRepaymentPreview(loan, defaultDate);

        setRepayForm({
            principal: '0',
            interest: preview.totalSuggestedInterest.toString(),
            lateFee: '0',
            date: defaultDate,
            interestCalculationType: 'MONTHLY',
            interestDays: '',
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
            const preview = getRepaymentPreview(activeLoan, repayForm.date);

            if (compareISODate(repayForm.date, activeLoan.startDate) < 0) {
                throw new Error(`Repayment date cannot be before loan start date`);
            }
            if (repayForm.interestCalculationType === 'PRORATED_DAYS') {
                const dayCount = Number.parseInt(repayForm.interestDays || '', 10);
                if (!Number.isFinite(dayCount) || dayCount <= 0 || dayCount > preview.interestMonthDays) {
                    throw new Error(`Exact days must be between 1 and ${preview.interestMonthDays} for ${MONTHS[preview.collectionPeriod.month - 1]} ${preview.collectionPeriod.year}.`);
                }
            }
            if (iAmt + lFee <= 0 && pAmt <= 0) throw new Error("Enter at least interest or late fee amount");

            const currentOutstanding = getSpecialLoanOutstanding(activeLoan.id, repayForm.date);
            if (pAmt > currentOutstanding + 10) throw new Error(`Principal repaid (₹${pAmt}) exceeds outstanding balance (₹${currentOutstanding})`);

            let splitCount = 0;
            if (preview.missedMonthsDetails.length > 0) {
                const arrearsInterest = preview.missedMonthsDetails.reduce((sum, month) => sum + month.interest, 0);
                if (iAmt < arrearsInterest) {
                    throw new Error(`Interest amount must cover arrears first (minimum ₹${arrearsInterest}).`);
                }

                for (const missed of preview.missedMonthsDetails) {
                    await recordLoanRepayment({
                        loanId: activeLoan.id,
                        date: repayForm.date,
                        amount: missed.interest,
                        principalPaid: 0,
                        interestPaid: missed.interest,
                        lateFee: 0,
                        interestForMonth: missed.month,
                        interestForYear: missed.year,
                        interestCalculationType: 'MONTHLY',
                        method: repayForm.method,
                        notes: repayForm.notes || `Arrears interest for ${MONTHS[missed.month - 1]} ${missed.year}`
                    });
                    splitCount++;
                }

                const currentInterest = iAmt - arrearsInterest;
                if (currentInterest < 0) {
                    throw new Error("Current-period interest cannot be negative after clearing arrears.");
                }

                if (currentInterest > 0 || pAmt > 0 || lFee > 0) {
                    if (preview.currentPeriodAlreadyPaid && currentInterest > 0) {
                        throw new Error(`Interest for ${MONTHS[preview.collectionPeriod.month - 1]} ${preview.collectionPeriod.year} is already settled.`);
                    }
                    await recordLoanRepayment({
                        loanId: activeLoan.id,
                        date: repayForm.date,
                        amount: pAmt + currentInterest,
                        principalPaid: pAmt,
                        interestPaid: currentInterest,
                        lateFee: lFee,
                        interestForMonth: currentInterest > 0 ? preview.collectionPeriod.month : undefined,
                        interestForYear: currentInterest > 0 ? preview.collectionPeriod.year : undefined,
                        interestDays: currentInterest > 0 && repayForm.interestCalculationType === 'PRORATED_DAYS' ? preview.interestDays : undefined,
                        interestCalculationType: currentInterest > 0 ? repayForm.interestCalculationType : undefined,
                        method: repayForm.method,
                        notes: repayForm.notes
                    });
                    splitCount++;
                }
            } else {
                if (preview.currentPeriodAlreadyPaid && iAmt > 0) {
                    throw new Error(`Interest for ${MONTHS[preview.collectionPeriod.month - 1]} ${preview.collectionPeriod.year} is already settled. Record principal only or edit the existing entry.`);
                }
                await recordLoanRepayment({
                    loanId: activeLoan.id,
                    date: repayForm.date,
                    amount: pAmt + iAmt,
                    principalPaid: pAmt,
                    interestPaid: iAmt,
                    lateFee: lFee,
                    interestForMonth: iAmt > 0 ? preview.collectionPeriod.month : undefined,
                    interestForYear: iAmt > 0 ? preview.collectionPeriod.year : undefined,
                    interestDays: iAmt > 0 && repayForm.interestCalculationType === 'PRORATED_DAYS' ? preview.interestDays : undefined,
                    interestCalculationType: iAmt > 0 ? repayForm.interestCalculationType : undefined,
                    method: repayForm.method,
                    notes: repayForm.notes
                });
                splitCount = 1;
            }

            log('RECORD_REPAYMENT', 'loan_repayments', activeLoan.id, {
                memberName: activeLoan.memberName,
                interest: iAmt,
                principal: pAmt,
                lateFee: lFee,
                splitCount
            });

            // Auto-close if principal fully repaid
            if (pAmt > 0 && (currentOutstanding - pAmt) <= 1) {
                if (confirm("Outstanding balance is now zero. Close this loan?")) {
                    await closeLoan(activeLoan.id, repayForm.date);
                }
            }

            setModals({ ...modals, repay: false });
        } catch (error) {
            const e = error as Error;
            logger.error("Error recording repayment", e);
            setErrorMsg(e.message);
        }
    };

    const openInterestEditModal = (repaymentId: string) => {
        if (!activeLoan) return;
        const repayment = loanRepayments.find(row => row.id === repaymentId && row.loanId === activeLoan.id);
        if (!repayment) return;

        const interestPeriod = getRepaymentInterestPeriod(repayment);
        
        setInterestEditTarget(repayment);
        setInterestEditForm({
            interestCalculationType: repayment.interestCalculationType || 'MONTHLY',
            interestDays: String(interestPeriod ? getDefaultInterestDays(repayment, interestPeriod.year, interestPeriod.month) : ''),
            date: repayment.date,
            month: interestPeriod ? String(interestPeriod.month) : '',
            year: interestPeriod ? String(interestPeriod.year) : '',
            principalPaid: String(repayment.principalPaid || 0),
            interestPaid: String(repayment.interestPaid || 0),
            notes: repayment.notes || ''
        });
        setErrorMsg('');
        setModals({ ...modals, editInterest: true });
    };

    const handleUpdateRepayment = async () => {
        if (!activeLoan || !interestEditTarget) return;
        setErrorMsg('');

        try {
            const upMonth = interestEditForm.month ? parseInt(interestEditForm.month) : undefined;
            const upYear = interestEditForm.year ? parseInt(interestEditForm.year) : undefined;

            if (interestEditForm.interestCalculationType === 'PRORATED_DAYS' && interestEditPreview) {
                const dayCount = Number.parseInt(interestEditForm.interestDays || '', 10);
                if (!Number.isFinite(dayCount) || dayCount <= 0 || dayCount > interestEditPreview.monthDays) {
                    throw new Error(`Exact days must be between 1 and ${interestEditPreview.monthDays} for ${interestEditPreview.periodLabel}.`);
                }
            }

            const updatedRepayment: LoanRepayment = {
                ...interestEditTarget,
                date: interestEditForm.date,
                amount: roundCurrency(Number(interestEditForm.principalPaid) + Number(interestEditForm.interestPaid)),
                interestPaid: Number(interestEditForm.interestPaid),
                principalPaid: Number(interestEditForm.principalPaid),
                interestForMonth: upMonth,
                interestForYear: upYear,
                interestDays: interestEditForm.interestCalculationType === 'PRORATED_DAYS'
                    ? (interestEditPreview?.daysHeld || parseInt(interestEditForm.interestDays))
                    : undefined,
                interestCalculationType: interestEditForm.interestCalculationType,
                notes: interestEditForm.notes.trim() || undefined
            };

            await updateLoanRepayment(updatedRepayment);
            log('UPDATE_REPAYMENT', 'loan_repayments', interestEditTarget.id, {
                loanId: activeLoan.id,
                memberName: activeLoan.memberName,
                before: {
                    date: interestEditTarget.date,
                    amount: interestEditTarget.amount,
                    interestPaid: interestEditTarget.interestPaid,
                    principalPaid: interestEditTarget.principalPaid,
                    interestPeriod: getRepaymentInterestPeriod(interestEditTarget),
                },
                after: {
                    date: updatedRepayment.date,
                    amount: updatedRepayment.amount,
                    interestPaid: updatedRepayment.interestPaid,
                    principalPaid: updatedRepayment.principalPaid,
                    interestPeriod: { month: upMonth, year: upYear }
                }
            });

            setModals({ ...modals, editInterest: false });
            setInterestEditTarget(null);
        } catch (error) {
            const e = error as Error;
            logger.error("Error updating repayment", e);
            setErrorMsg(e.message);
        }
    };

    // ── Top-up handlers ──────────────────────────────────────────────────────
    const openTopupModal = (loan: EnrichedLoan) => {
        if (!canCreateLoan) return;
        setTopupLoan(loan);
        setTopupForm({
            amount: '',
            rate: loan.interestRate.toString(),
            date: new Date().toISOString().split('T')[0],
            notes: ''
        });
        setErrorMsg('');
        setModals({ ...modals, topup: true });
    };

    const handleEditTopup = (tx: any) => {
        if (!activeLoan) return;
        const topup = loanTopups.find(t => t.id === tx.id);
        if (!topup) return;

        setTopupLoan(activeLoan);
        setTopupEditTarget(topup);
        setTopupForm({
            amount: topup.amount.toString(),
            rate: topup.rate.toString(),
            date: topup.date,
            notes: topup.notes || ''
        });
        setErrorMsg('');
        setModals({ ...modals, topup: true });
    };

    const handleTopup = async () => {
        if (!topupLoan) return;
        setErrorMsg('');
        try {
            const amt = parseFloat(topupForm.amount);
            const rate = parseFloat(topupForm.rate);
            if (isNaN(amt) || amt <= 0) throw new Error("Please enter a valid top-up amount");
            if (isNaN(rate) || rate <= 0) throw new Error("Please enter a valid monthly rate");
            if (!topupForm.date) throw new Error("Please select a top-up date");
            if (compareISODate(topupForm.date, topupLoan.startDate) < 0) {
                throw new Error("Top-up date cannot be before the loan start date");
            }

            if (topupEditTarget) {
                // If loan was closed or had an end date, re-activate it because activity is resuming
                if (topupLoan.status === LoanStatus.CLOSED || topupLoan.endDate) {
                    await updateLoan({
                        ...topupLoan,
                        status: LoanStatus.ACTIVE,
                        endDate: null
                    });
                }
                await updateLoanTopup({
                    ...topupEditTarget,
                    amount: amt,
                    rate,
                    date: topupForm.date,
                    notes: topupForm.notes || undefined
                });
                log('UPDATE_TOPUP', 'loan_topups', topupLoan.id, { memberName: topupLoan.memberName, amount: amt, rate, date: topupForm.date });
            } else {
                // If loan was closed or had an end date, re-activate it because a brand new top-up implies activity
                if (topupLoan.status === LoanStatus.CLOSED || topupLoan.endDate) {
                    await updateLoan({
                        ...topupLoan,
                        status: LoanStatus.ACTIVE,
                        endDate: null
                    });
                }
                await addLoanTopup({
                    loanId: topupLoan.id,
                    amount: amt,
                    rate,
                    date: topupForm.date,
                    notes: topupForm.notes || undefined
                });
                log('ADD_TOPUP', 'loan_topups', topupLoan.id, { memberName: topupLoan.memberName, amount: amt, rate, date: topupForm.date });
            }
            setModals({ ...modals, topup: false });
            setTopupEditTarget(null);
        } catch (error) {
            const e = error as Error;
            logger.error("Error saving top-up", e);
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
            const lastPaymentDate = loanRepayments
                .filter(r => r.loanId === l.id)
                .map(r => r.date)
                .sort(compareISODate)
                .at(-1);

            return [
                l.memberId,
                l.memberName,
                l.startDate,
                l.principalAmount,
                topupTotal,
                topupDatesStr,
                outstanding,
                `${l.interestRate}%`,
                l.historicalInterestPaid,
                l.selectedMonthLateFee,
                lateFeesTotal,
                lastPaymentDate ? formatDisplayDate(lastPaymentDate) : '',
                l.status
            ];
        });

        const allRows = [headers, ...rows];
        const filename = `Special_Loans_Report_${MONTHS[selectedMonth - 1]}_${selectedYear}`;
        downloadAs(allRows, filename, reportFormat, `${MONTHS[selectedMonth - 1]} ${selectedYear}`);
    };

    /** Build ledger rows for a single loan (reusable for both single + bulk download) */
    const buildLedgerRowsForLoan = (loan: EnrichedLoan) => {
        const loanTopupsForLoan = loanTopups.filter(t => t.loanId === loan.id);
        const loanRepaymentsForLoan = loanRepayments.filter(r => r.loanId === loan.id);
        const topupsTotal = loanTopupsForLoan.reduce((s, t) => s + Number(t.amount || 0), 0);
        const principalRepaid = loanRepaymentsForLoan.reduce((sum, repayment) => {
            return sum + calculatePrincipalPaid(repayment);
        }, 0);
        const interestPaid = loanRepaymentsForLoan.reduce((s, r) => s + Number(r.interestPaid || 0), 0);
        const liveBalance = getSpecialLoanOutstanding(loan.id);

        const txs = buildLoanLedger(loan, loanTopupsForLoan, loanRepaymentsForLoan, settings);

        let pCount = 0;
        let tCount = 0;
        const ledgerRows = txs.map((tx, idx) => {
            const isDisbursal = tx.entryType === 'DISBURSAL';
            const isTopup = tx.entryType === 'TOPUP';
            const isRepayment = tx.entryType === 'REPAYMENT';
            const vchType = getVoucherTypeLabel(tx.entryType);
            let narration = '';

            if (isDisbursal) {
                narration = 'Original Loan Disbursement';
            } else if (isTopup) {
                tCount++;
                narration = `Top-up ${tCount} (@${tx.rate || loan.interestRate}%)`;
            } else if (isRepayment) {
                const pPaid = calculatePrincipalPaid(tx);
                if (pPaid > 0 && (tx.interestPaid || 0) === 0) {
                    pCount++;
                    narration = `Payment ${pCount}`;
                } else if ((tx.interestPaid || 0) > 0) {
                    const periodStr = tx.interestPeriod ? ` (${MONTHS[tx.interestPeriod.month - 1]} ${tx.interestPeriod.year})` : '';
                    const isWaived = tx.interestPeriod && isWaivedPeriod(tx.interestPeriod, settings.interestWaiverPeriods);
                    narration = isWaived ? `Interest Waived${periodStr}` : `Interest @${tx.rate || loan.interestRate}%${periodStr}`;
                } else if (tx.interestPeriod && isWaivedPeriod(tx.interestPeriod, settings.interestWaiverPeriods)) {
                    narration = `Interest Waived (${MONTHS[tx.interestPeriod.month - 1]} ${tx.interestPeriod.year})`;
                } else {
                    narration = tx.notes || 'Repayment';
                }
            }

            const debit = (isDisbursal || isTopup) ? (tx.amount || tx.principalDelta || 0) : 0;
            const credit = isRepayment ? calculatePrincipalPaid(tx) : 0;
            const interest = (tx.interestPaid || 0) > 0 ? tx.interestPaid : 0;

            return [
                idx + 1,
                formatDisplayDate(tx.date),
                tx.interestCalculationType || 'Monthly',
                tx.interestDays || 30,
                vchType,
                Number(debit).toFixed(2),
                Number(credit).toFixed(2),
                Number(interest).toFixed(2),
                (tx.balanceAfter || 0).toFixed(2),
                narration || tx.notes || ''
            ];
        });

        return [
            ['Member Name', loan.memberName],
            ['Member ID', loan.memberId],
            ['Loan ID', loan.id],
            ['Start Date', formatDisplayDate(loan.startDate)],
            ['Original Principal', loan.principalAmount],
            ['Top-Ups', topupsTotal],
            ['Principal Repaid', principalRepaid],
            ['Interest Paid', interestPaid],
            ['Live Balance', liveBalance],
            [],
            ['Sl.No', 'Date', 'CalcType', 'Days', 'Voucher Type', 'Debit', 'Credit', 'Interest', 'Balance', 'Narration'],
            ...ledgerRows
        ] as (string | number | null | undefined)[][];
    };

    const downloadActiveLoanLedger = () => {
        if (!activeLoan || !activeLoanSummary) return;
        const rows = buildLedgerRowsForLoan(activeLoan);
        const safeName = activeLoan.memberName.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || activeLoan.id;
        const filename = `Special_Loan_Audit_Ledger_${safeName}`;
        downloadAs(rows, filename, ledgerFormat, activeLoan.memberName.slice(0, 31));
    };

    const downloadAllLedgers = () => {
        if (loansInSelectedPeriod.length === 0) return;
        if (bulkDownloadFormat === 'XLSX') {
            const sheets = loansInSelectedPeriod.map(loan => ({
                name: (loan.memberName || loan.memberId).replace(/[:\\/?*[\]]/g, '_').slice(0, 31),
                rows: buildLedgerRowsForLoan(loan)
            }));
            const filename = `All_Audit_Ledgers_${MONTHS[selectedMonth - 1]}_${selectedYear}`;
            downloadMultiSheetXLSX(sheets, filename);
        } else {
            // CSV: download each loan as a separate file
            loansInSelectedPeriod.forEach(loan => {
                const rows = buildLedgerRowsForLoan(loan);
                const safeName = loan.memberName.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || loan.id;
                downloadAs(rows, `Audit_Ledger_${safeName}`, 'CSV');
            });
        }
    };

    const openEditModal = (loan: EnrichedLoan) => {
        setActiveLoan(loan);
        setEditForm({
            id: loan.id,
            amount: loan.principalAmount.toString(),
            rate: loan.interestRate.toString(),
            date: loan.startDate,
            status: loan.status,
            settleRemaining: false,
            settlementDate: loan.endDate || new Date().toISOString().split('T')[0],
            settlementMethod: PaymentMethod.CASH,
            settlementNotes: ''
        });
        setModals({ ...modals, edit: true });
    };

    const handleUpdateLoan = async () => {
        if (!activeLoan) return;
        try {
            if (!editLoanSummary) {
                throw new Error("Unable to calculate the revised loan balance.");
            }

            const revisedPrincipal = parseFloat(editForm.amount);
            const revisedRate = parseFloat(editForm.rate);
            if (!Number.isFinite(revisedPrincipal) || revisedPrincipal <= 0) {
                throw new Error("Please enter a valid loan amount.");
            }
            if (!Number.isFinite(revisedRate) || revisedRate <= 0) {
                throw new Error("Please enter a valid monthly rate.");
            }

            const newStartDate = editForm.date;
            const earliestEventDate = [...loanTopups.filter(t => t.loanId === activeLoan.id).map(t => t.date), ...loanRepayments.filter(r => r.loanId === activeLoan.id).map(r => r.date)]
                .sort(compareISODate)[0];
            if (earliestEventDate && compareISODate(newStartDate, earliestEventDate) > 0) {
                throw new Error(`Loan start date cannot be after the earliest transaction (${formatDisplayDate(earliestEventDate)}).`);
            }

            if (editLoanSummary.rawRemaining < -1) {
                throw new Error("Revised loan amount cannot be less than the principal already recovered.");
            }

            if (editForm.status === LoanStatus.CLOSED && editLoanSummary.remainingPrincipal > 0 && !editForm.settleRemaining) {
                throw new Error("This loan still has outstanding principal. Change status to Active or enable the remaining payment option.");
            }

            const shouldRecordRemainingSettlement = editForm.settleRemaining && editLoanSummary.remainingPrincipal > 0;
            const shouldCloseAfterSave = editForm.status === LoanStatus.CLOSED || shouldRecordRemainingSettlement;

            if (shouldCloseAfterSave) {
                if (compareISODate(editForm.settlementDate, newStartDate) < 0) {
                    throw new Error("Close date cannot be before the loan start date.");
                }
            }

            const nextStatus = shouldCloseAfterSave ? LoanStatus.CLOSED : editForm.status;
            const nextEndDate = shouldCloseAfterSave ? editForm.settlementDate : activeLoan.endDate;

            await updateLoan({
                ...activeLoan,
                principalAmount: revisedPrincipal,
                interestRate: revisedRate,
                startDate: newStartDate,
                endDate: nextEndDate,
                status: nextStatus,
                durationMonths: 0,
                calculationMethod: 'INTEREST_ONLY'
            });

            log('UPDATE_LOAN', 'loans', activeLoan.id, {
                memberName: activeLoan.memberName,
                before: {
                    principalAmount: activeLoan.principalAmount,
                    rate: activeLoan.interestRate,
                    status: activeLoan.status,
                    endDate: activeLoan.endDate || null
                },
                after: {
                    principalAmount: revisedPrincipal,
                    rate: revisedRate,
                    status: shouldCloseAfterSave ? LoanStatus.CLOSED : editForm.status,
                    remainingPrincipal: editLoanSummary.remainingPrincipal
                },
                settleRemaining: shouldRecordRemainingSettlement
            });

            if (shouldRecordRemainingSettlement) {
                await recordLoanRepayment({
                    loanId: activeLoan.id,
                    date: editForm.settlementDate,
                    amount: editLoanSummary.remainingPrincipal,
                    principalPaid: editLoanSummary.remainingPrincipal,
                    interestPaid: 0,
                    lateFee: 0,
                    method: editForm.settlementMethod,
                    notes: editForm.settlementNotes || 'Remaining principal settled after correcting loan amount'
                });
                log('RECORD_REPAYMENT', 'loan_repayments', activeLoan.id, {
                    memberName: activeLoan.memberName,
                    principal: editLoanSummary.remainingPrincipal,
                    source: 'EDIT_LOAN_REMAINING_SETTLEMENT',
                    date: editForm.settlementDate
                });
            }

            if (shouldCloseAfterSave) {
                await closeLoan(activeLoan.id, editForm.settlementDate);
                log('CLOSE_LOAN', 'loans', activeLoan.id, {
                    memberName: activeLoan.memberName,
                    date: editForm.settlementDate,
                    source: 'EDIT_LOAN_REMAINING_SETTLEMENT'
                });
            }

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
                await closeLoan(loan.id, new Date().toISOString().split('T')[0]);
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
                await wipeLoanInterest(target.id, target.memberName);
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
        if (isGenerating || !autoGenLoan) return;
        setIsGenerating(true);
        setGenerationProgress(0);
        setGenerationProgressLabel('Starting interest generation...');
        try {
            // 1. Snapshot the records from the memo to ensure we use what the user saw in preview
            const recordsToSave = [...autoGenPreview.records];
            const generationCount = autoGenPreview.months;
            const totalGenAmount = autoGenPreview.totalInterest;

            // 2. Cleanup stale/invalidRows first
            setGenerationProgress(20);
            const cleanedCount = await cleanupInvalidLoanInterest(autoGenLoan.id);
            setGenerationProgress(40);

            // 3. Save new records in smaller batches to reduce DB load
            if (recordsToSave.length > 0) {
                const batchSize = 10; // Smaller batches to reduce DB load

                for (let i = 0; i < recordsToSave.length; i += batchSize) {
                    const batch = recordsToSave.slice(i, i + batchSize);
                    try {
                        await bulkRecordLoanRepayments(batch);
                    } catch (batchError) {
                        // If a batch fails, note the partial success and report
                        logger.error(`Batch failed during interest generation`, batchError);
                        const totalBatches = Math.ceil(recordsToSave.length / batchSize);
                        throw new Error(`Interest generation partially failed. Check console for details.`);
                    }
                }
            }
            alert(`SUCCESS: ${generationCount} interest records generated and ${cleanedCount} stale records cleaned.`);
            setModals({ ...modals, autoGen: false });
        } catch (error) {
            const e = error as Error;
            logger.error("Error generating interest", e);
            alert("Interest Generation Failed: " + e.message);
        } finally {
            setIsGenerating(false);
            setGenerationProgress(0);
            setGenerationProgressLabel('');
        }
    };

    const handleGlobalZap = async () => {
        if (!confirm("This will analyze all active special loans, cleanup stale auto-generated records, and generate any missing interest. Continue?")) return;
        
        setIsGenerating(true);
        setGenerationProgress(0);
        setGenerationProgressLabel('Initializing Global Zap...');
        
        try {
            await globalAutoGenLoanInterest((prog, label) => {
                setGenerationProgress(prog);
                setGenerationProgressLabel(label);
            }, true); // true for clearStale (wipe and regenerate)
            
            alert("Global interest generation and reconciliation complete!");
            setModals({ ...modals, globalZap: false });
        } catch (error) {
            const e = error as Error;
            logger.error("Global Zap Failed", e);
            alert("Global Zap Failed: " + e.message);
        } finally {
            setIsGenerating(false);
            setGenerationProgress(0);
            setGenerationProgressLabel('');
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

                    <div className="flex flex-wrap gap-2 items-center">
                        {/* Report Download with format picker */}
                        <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden shadow-sm">
                            <Button variant="outline" icon={Download} onClick={downloadReport} className="rounded-none border-0 border-r border-slate-200 dark:border-slate-700">Report</Button>
                            <div className="flex text-[10px] font-bold">
                                {(['CSV', 'XLSX'] as const).map(fmt => (
                                    <button key={fmt} onClick={() => setReportFormat(fmt)}
                                        className={`px-2 py-1.5 transition-colors ${reportFormat === fmt ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-600'}`}>
                                        {fmt}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Bulk Download All Ledgers with format picker */}
                        <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden shadow-sm">
                            <Button variant="outline" icon={Download} onClick={downloadAllLedgers} className="rounded-none border-0 border-r border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/10" title={`Download all ${loansInSelectedPeriod.length} ledger(s) as ${bulkDownloadFormat}`}>
                                All Ledgers
                            </Button>
                            <div className="flex text-[10px] font-bold">
                                {(['CSV', 'XLSX'] as const).map(fmt => (
                                    <button key={fmt} onClick={() => setBulkDownloadFormat(fmt)}
                                        className={`px-2 py-1.5 transition-colors ${bulkDownloadFormat === fmt ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-600'}`}>
                                        {fmt}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <Button variant="outline" icon={Calculator} onClick={() => setModals({ ...modals, calc: true })}>Calc</Button>
                        <Button 
                            variant="outline" 
                            className="text-amber-600 border-amber-200 bg-amber-50/50 hover:bg-amber-100 dark:bg-amber-900/10" 
                            icon={Zap} 
                            onClick={() => setModals({ ...modals, globalZap: true })}
                        >
                            Zap Missing Interest
                        </Button>
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
                        placeholder="Search by name or member ID..."
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
                        <option value="MEMBER_ID_ASC">Member ID (Asc)</option>
                        <option value="MEMBER_ID_DESC">Member ID (Desc)</option>
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
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Member ID</th>
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
                                        <div className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded inline-block">
                                            {loan.memberId}
                                        </div>
                                    </td>
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
                                            {canRepayLoan && loan.status === LoanStatus.ACTIVE && (
                                                <Button size="sm" onClick={() => openRepayModal(loan)} title="Record Interest Payment" className="text-xs px-2 py-1">
                                                    {loan.isPaidSelectedMonth ? 'Repay' : 'Collect'}
                                                </Button>
                                            )}
                                            {canCreateLoan && (
                                                <Button size="sm" variant="ghost" onClick={() => openAutoGenModal(loan)} title="Auto-Generate / Repair Interest History" className="text-amber-600 dark:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 px-2">
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
            </Card>

            {/* CREATE SPECIAL LOAN MODAL */}
            <Modal isOpen={modals.create} onClose={() => setModals({ ...modals, create: false })} title="Disburse Special Loan" >
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

            {/* GLOBAL ZAP MODAL */}
            <Modal isOpen={modals.globalZap} onClose={() => !isGenerating && setModals({ ...modals, globalZap: false })} title="Global Interest Reconciliation" >
                <div className="space-y-6 py-4">
                    <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-100 dark:border-amber-800 flex items-start">
                        <Zap size={24} className="text-amber-600 mr-3 mt-1 shrink-0" />
                        <div>
                            <p className="text-sm font-bold text-amber-900 dark:text-amber-200 mb-1">Portfolio-Wide Interest Repair</p>
                            <p className="text-xs text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
                                This tool will scan all active special loans, identify missing interest periods up to the current date (or global cutoff), 
                                clean up any stale/incorrect auto-generated records, and perform a full reconciliation.
                            </p>
                        </div>
                    </div>

                    {!isGenerating ? (
                        <div className="flex flex-col gap-3">
                            <div className="text-sm text-slate-600 dark:text-slate-400 px-1">
                                <p className="mb-2"><strong>Wipe & Regenerate:</strong></p>
                                <ul className="list-disc list-inside space-y-1 text-xs">
                                    <li>Deletes invalid/stale interest rows</li>
                                    <li>Fills gaps in historical interest tracking</li>
                                    <li>Respects manual edits and principal repayments</li>
                                </ul>
                            </div>
                            <Button className="w-full py-6 text-lg font-bold shadow-lg" onClick={handleGlobalZap} icon={Zap}>
                                Start Reconciliation
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex justify-between text-sm font-medium">
                                <span className="text-amber-700 dark:text-amber-400 animate-pulse">{generationProgressLabel}</span>
                                <span className="text-slate-500">{generationProgress}%</span>
                            </div>
                            <div className="w-full h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden border border-slate-200 dark:border-slate-600">
                                <div 
                                    className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                                    style={{ width: `${generationProgress}%` }}
                                />
                            </div>
                            <p className="text-[10px] text-center text-slate-400">Do not close this window until the process completes.</p>
                        </div>
                    )}
                </div>
            </Modal>

            {/* REPAY MODAL — Interest Only Collection */}
            <Modal isOpen={modals.repay} onClose={() => setModals({ ...modals, repay: false })} title="Record Collection / Principal Repayment">
                {activeLoan && (
                    <div className="space-y-4">
                        <div className="bg-violet-50 dark:bg-violet-900/20 p-3 rounded-lg border border-violet-100 dark:border-violet-800">
                            <div className="text-xs text-violet-500 uppercase font-bold tracking-tight mb-1">Interest-Only Special Loan</div>
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-slate-800 dark:text-white">{activeLoan.memberName}</span>
                                <div className="text-right">
                                    <div className="text-violet-700 dark:text-violet-300 font-black text-sm">{formatCurrency(activeLoan.historicalOutstanding, settings.currency)} outstanding</div>
                                    <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                                        {repaymentPreview?.currentPeriodAlreadyPaid
                                            ? `Interest for ${MONTHS[repaymentPreview.collectionPeriod.month - 1]} ${repaymentPreview.collectionPeriod.year} already settled`
                                            : `Interest Due: ${formatCurrency(repaymentPreview?.currentInterestDue || 0, settings.currency)}`}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {errorMsg && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{errorMsg}</div>}

                        {repaymentPreviewSummary && (
                            <div className="p-3 bg-slate-50 text-slate-700 text-xs rounded-lg border border-slate-200">
                                {repaymentPreviewSummary}
                            </div>
                        )}

                        {repaymentPreview && repaymentPreview.missedMonthsDetails.length > 0 && (
                            <div className="p-3 bg-amber-50 text-amber-800 text-xs rounded-lg border border-amber-100">
                                {repaymentPreview.missedMonthsDetails.length <= 6 ? (
                                    <>
                                        Arrears to clear first:
                                        {' '}
                                        {repaymentPreview.missedMonthsDetails.map(period => `${MONTHS[period.month - 1]} ${period.year}`).join(', ')}
                                        {' '}
                                        ({formatCurrency(repaymentPreview.arrearsInterest, settings.currency)})
                                    </>
                                ) : (
                                    <>
                                        Arrears month list suppressed because the history is long. Use the summary above for the full range and total.
                                    </>
                                )}
                            </div>
                        )}

                        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/40 p-4 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Current Period Interest Basis</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Use full-month interest or record exact held days for partial-month cases like 15 or 20 days.</p>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {([
                                        { label: 'Full Month', value: 'MONTHLY' },
                                        { label: 'Exact Days', value: 'PRORATED_DAYS' }
                                    ] as const).map(option => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => {
                                                if (!activeLoan) return;
                                                const nextPreview = getRepaymentPreview(activeLoan, repayForm.date, option.value, repayForm.interestDays);
                                                setRepayForm(prev => ({
                                                    ...prev,
                                                    interestCalculationType: option.value,
                                                    interest: nextPreview.totalSuggestedInterest.toString()
                                                }));
                                            }}
                                            className={`rounded-xl border px-3 py-2 text-xs font-bold transition-all ${repayForm.interestCalculationType === option.value
                                                ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-sm dark:bg-primary-900/30 dark:text-primary-300'
                                                : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {repayForm.interestCalculationType === 'PRORATED_DAYS' && (
                                <div className="mt-4 grid grid-cols-1 sm:grid-cols-[160px,1fr] gap-4 items-start">
                                    <Input
                                        label="Exact Days Held"
                                        type="number"
                                        min={1}
                                        max={repaymentPreview?.interestMonthDays || 31}
                                        value={repayForm.interestDays}
                                        onChange={e => {
                                            if (!activeLoan) return;
                                            const nextDays = e.target.value;
                                            const nextPreview = getRepaymentPreview(activeLoan, repayForm.date, 'PRORATED_DAYS', nextDays);
                                            setRepayForm(prev => ({
                                                ...prev,
                                                interestDays: nextDays,
                                                interest: nextPreview.totalSuggestedInterest.toString()
                                            }));
                                        }}
                                        description={repaymentPreview ? `1 to ${repaymentPreview.interestMonthDays} days for ${MONTHS[repaymentPreview.collectionPeriod.month - 1]}` : undefined}
                                    />
                                    <div className="rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                                        <div className="font-semibold uppercase tracking-wide text-[10px] text-blue-600 dark:text-blue-300">Prorated Preview</div>
                                        <div className="mt-1">
                                            {repaymentPreview?.interestDays
                                                ? `${repaymentPreview.currentInterestFormula} = ${formatCurrency(repaymentPreview.currentInterestDue, settings.currency)}`
                                                : 'Enter the exact number of held days to auto-calculate a prorated current-period interest amount.'}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                label="Interest Amount"
                                type="number"
                                value={repayForm.interest}
                                onChange={e => setRepayForm({ ...repayForm, interest: e.target.value })}
                                description={repaymentPreview ? `Suggested total interest through ${MONTHS[repaymentPreview.collectionPeriod.month - 1]} ${repaymentPreview.collectionPeriod.year}` : 'Monthly interest due'}
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
                            onChange={e => {
                                if (!activeLoan) return;
                                const nextDate = e.target.value;
                                const preview = getRepaymentPreview(activeLoan, nextDate, repayForm.interestCalculationType, repayForm.interestDays);
                                setRepayForm(prev => ({
                                    ...prev,
                                    date: nextDate,
                                    interest: preview.totalSuggestedInterest.toString()
                                }));
                                setErrorMsg('');
                            }}
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

            <Modal isOpen={modals.topup} onClose={() => { setModals({ ...modals, topup: false }); setTopupEditTarget(null); }} title={topupEditTarget ? "Edit Top-Up Record" : "Add Top-Up to Special Loan"}>
                {topupForm && (
                    <div className="space-y-4">
                        <div className={`p-4 rounded-2xl border ${topupEditTarget ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800' : 'bg-violet-50 dark:bg-violet-900/20 border-violet-100 dark:border-violet-800'}`}>
                            <div className={`text-[10px] uppercase font-black tracking-widest mb-1 ${topupEditTarget ? 'text-amber-600' : 'text-violet-500'}`}>
                                {topupEditTarget ? 'Editing Existing Top-Up' : 'Disbursing Top-Up For'}
                            </div>
                            <div className="flex justify-between items-end">
                                <span className="font-black text-lg text-slate-800 dark:text-white leading-tight">{topupLoan?.memberName}</span>
                                <div className="text-right">
                                    <div className="text-[9px] text-slate-500 font-bold uppercase tracking-tight">Current Portfolio Balance</div>
                                    <div className="font-black text-xl text-amber-600 dark:text-amber-400">
                                        {topupLoan && formatCurrency(getSpecialLoanOutstanding(topupLoan.id) - (topupEditTarget?.amount || 0), settings.currency)}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-200/50 dark:border-slate-700/50 text-xs text-slate-500 dark:text-slate-400">
                                Current effective rate: <span className="font-semibold text-violet-600">{topupLoan?.interestRate}% / month</span>
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
                            label="Monthly Rate (% / Mo)"
                            type="number"
                            value={topupForm.rate}
                            onChange={e => setTopupForm({ ...topupForm, rate: e.target.value })}
                            description="If changed, this rate becomes effective for future interest calculations from the next due month."
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
                        <p>This will calculate missing interest from the loan start date ({autoGenLoan && formatDisplayDate(autoGenLoan.startDate)}) up to the earlier of today, the loan close date, or the date the principal reached zero. Any stale auto-interest dated after that cutoff will be cleaned automatically.</p>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                            <span className="text-slate-500 font-medium">Auto-Gen Cutoff Date</span>
                            <span className="font-bold text-slate-900 dark:text-white">{autoGenPreview.stopDate ? formatDisplayDate(autoGenPreview.stopDate) : 'N/A'}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                            <span className="text-slate-500 font-medium">Missing Months Detected</span>
                            <span className="font-bold text-slate-900 dark:text-white text-xl">{autoGenPreview.months}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                            <span className="text-slate-500 font-medium">Total Interest Calculated</span>
                            <span className="font-bold text-amber-600 text-xl">{formatCurrency(autoGenPreview.totalInterest, settings.currency)}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                            <span className="text-slate-500 font-medium">Invalid Interest Rows To Clean</span>
                            <span className="font-bold text-rose-600 text-xl">{autoGenPreview.staleInterestCount}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                            <span className="text-slate-500 font-medium">Exact-Day Overrides Protected</span>
                            <span className="font-bold text-blue-600 text-xl">{autoGenPreview.exactDayOverrideCount}</span>
                        </div>
                        {autoGenPreview.staleInterestCount > 0 && (
                            <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                                <span className="text-slate-500 font-medium">Invalid Interest Value</span>
                                <span className="font-bold text-rose-600 text-xl">{formatCurrency(autoGenPreview.staleInterestTotal, settings.currency)}</span>
                            </div>
                        )}
                        <p className="text-xs text-slate-400 mt-2">Interest is calculated month-by-month from historical outstanding principal. If the cutoff lands inside a month, that month can still be generated, but it will be dated on the actual close/payoff date instead of month-end.</p>
                        {autoGenPreview.exactDayOverrideCount > 0 && (
                            <p className="text-xs text-blue-600 dark:text-blue-300">
                                Exact-day rows are preserved during recalculation. Use wipe/regenerate carefully because it would remove those manual overrides.
                            </p>
                        )}
                    </div>

                    <div className="flex justify-between gap-3 mt-6">
                        {autoGenPreview.months === 0 && autoGenPreview.exactDayOverrideCount === 0 && loanRepayments.filter(r => r.loanId === (autoGenLoan?.id) && (r.interestPaid || 0) > 0).length > 0 && (
                            <Button variant="danger" onClick={handleWipeInterest} className="bg-red-50 text-red-600 hover:bg-red-100 border-red-200">
                                <Trash2 size={16} className="mr-2" />
                                Wipe & Re-gen
                            </Button>
                        )}
                        <div className="flex gap-3 ml-auto">
                            <Button variant="outline" onClick={() => setModals({ ...modals, autoGen: false })} disabled={isGenerating}>Cancel</Button>
                            <Button
                                onClick={handleGenerateInterest}
                                disabled={isGenerating || (autoGenPreview.months === 0 && autoGenPreview.staleInterestCount === 0)}
                                icon={isGenerating ? undefined : Zap}
                                className={isGenerating ? "animate-pulse" : ""}
                            >
                                {isGenerating ? "Processing..." : `Apply Auto-Fix (${autoGenPreview.months} new, ${autoGenPreview.staleInterestCount} clean)`}
                            </Button>
                            {isGenerating && (
                                <div className="mt-3">
                                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                                        <span>{generationProgressLabel || 'Generating interest...'}</span>
                                        <span>{generationProgress}%</span>
                                    </div>
                                    <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-amber-500 transition-all duration-300 ease-out"
                                            style={{ width: `${generationProgress}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Modal>

            {/* LOAN DETAILS MODAL — Expanded width for ledger stability */}
            <Modal isOpen={modals.history} onClose={() => setModals({ ...modals, history: false })} title={`Ledger: ${activeLoan?.memberName}`} maxWidth="5xl">
                {activeLoan && activeLoanSummary && (
                    <div className="space-y-6">
                        <div className="flex border-b border-slate-200 dark:border-slate-700 mb-4">
                            <button
                                className={`px-4 py-3 text-sm font-bold tracking-wide transition-colors ${ledgerViewTab === 'SUMMARY' ? 'border-b-2 border-emerald-500 text-emerald-700 dark:text-emerald-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                                onClick={() => setLedgerViewTab('SUMMARY')}
                            >
                                Transaction Summary
                            </button>
                            <button
                                className={`px-4 py-3 text-sm font-bold tracking-wide transition-colors ${ledgerViewTab === 'AUDIT' ? 'border-b-2 border-emerald-500 text-emerald-700 dark:text-emerald-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                                onClick={() => setLedgerViewTab('AUDIT')}
                            >
                                Audit Ledger
                            </button>
                        </div>
                        
                        {ledgerViewTab === 'SUMMARY' ? (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                                    <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                                        <p className="text-slate-400 text-[9px] uppercase font-bold mb-1">Original Principal</p>
                                        <p className="font-black text-slate-800 dark:text-white">{formatCurrency(activeLoan.principalAmount, settings.currency)}</p>
                                    </div>
                                    <div className="p-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-100 dark:border-violet-800 text-center">
                                        <p className="text-violet-500 text-[9px] uppercase font-bold mb-1">Total Top-Ups</p>
                                        <p className="font-black text-violet-800 dark:text-violet-200">{formatCurrency(activeLoanSummary.topupsTotal, settings.currency)}</p>
                                    </div>
                                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 text-center">
                                        <p className="text-blue-500 text-[9px] uppercase font-bold mb-1">Principal Repaid</p>
                                        <p className="font-black text-blue-800 dark:text-blue-200">{formatCurrency(activeLoanSummary.principalRepaid, settings.currency)}</p>
                                    </div>
                                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800 text-center">
                                        <p className="text-emerald-500 text-[9px] uppercase font-bold mb-1">Interest Paid</p>
                                        <p className="font-black text-emerald-800 dark:text-emerald-200">{formatCurrency(activeLoanSummary.interestPaid, settings.currency)}</p>
                                    </div>
                                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800 text-center shadow-inner">
                                        <p className="text-amber-600 text-[9px] uppercase font-bold mb-1">Live Balance</p>
                                        <p className="font-black text-xl text-amber-900 dark:text-amber-200">{formatCurrency(activeLoanSummary.liveBalance, settings.currency)}</p>
                                    </div>
                                </div>
                                
                                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm mt-4">
                                    <div className="max-h-[500px] overflow-y-auto overflow-x-auto">
                                        <table className="min-w-full text-xs">
                                            <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                                                <tr>
                                                    <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase">S.No</th>
                                                    <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase">Date</th>
                                                    <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase">Member</th>
                                                    <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase">Voucher</th>
                                                    <th className="px-4 py-3 text-right font-bold text-slate-500 uppercase">Debit (₹)</th>
                                                    <th className="px-4 py-3 text-right font-bold text-slate-500 uppercase">Credit (₹)</th>
                                                    <th className="px-4 py-3 text-center font-bold text-slate-500 uppercase">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                {filteredLedgerTransactions.map((tx: any, idx: number) => (
                                                    <tr key={`summary-${tx.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/20 transition-colors">
                                                        <td className="px-4 py-3 text-slate-500">{idx + 1}</td>
                                                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatDisplayDate(tx.date)}</td>
                                                        <td className="px-4 py-3">
                                                            <div className="font-bold text-slate-800 dark:text-white">{activeLoan.memberName}</div>
                                                            <div className="text-[10px] text-slate-500">ID: {activeLoan.memberId}</div>
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                                                            {getVoucherTypeLabel(tx.entryType)}
                                                        </td>
                                                        <td className="px-4 py-3 text-right font-bold text-blue-600 dark:text-blue-400">
                                                            {tx.entryType === 'DISBURSAL' || tx.entryType === 'TOPUP' ? formatCurrency(tx.amount || 0, settings.currency) : '—'}
                                                        </td>
                                                        <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                                            {tx.entryType === 'REPAYMENT' ? formatCurrency(calculatePrincipalPaid(tx) + (tx.interestPaid || 0) + (tx.lateFee || 0), settings.currency) : '—'}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            {tx.entryType === 'DISBURSAL' ? (
                                                                <span className="inline-block px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-black text-[10px] tracking-wider uppercase">CREATE LOAN</span>
                                                            ) : tx.entryType === 'TOPUP' ? (
                                                                <span className="inline-block px-3 py-1 rounded-full bg-amber-100 text-amber-700 font-black text-[10px] tracking-wider uppercase">ADD TOPUP</span>
                                                            ) : (
                                                                <span className="inline-block px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 font-black text-[10px] tracking-wider uppercase">ADD REPAYMENT</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-slate-50 dark:bg-slate-900/50 sticky bottom-0 z-10 border-t border-slate-200 dark:border-slate-700">
                                                <tr className="font-black">
                                                    <td colSpan={4} className="px-4 py-3 text-right uppercase tracking-widest text-[10px] text-slate-500">Total</td>
                                                    <td className="px-4 py-3 text-right text-blue-600 dark:text-blue-400">
                                                        {formatCurrency(filteredLedgerTransactions.reduce((acc: number, tx: any) => acc + (tx.entryType === 'DISBURSAL' || tx.entryType === 'TOPUP' ? (tx.amount || 0) : 0), 0), settings.currency)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">
                                                        {formatCurrency(filteredLedgerTransactions.reduce((acc: number, tx: any) => acc + (tx.entryType === 'REPAYMENT' ? (calculatePrincipalPaid(tx) + (tx.interestPaid || 0) + (tx.lateFee || 0)) : 0), 0), settings.currency)}
                                                    </td>
                                                    <td className="px-4 py-3 bg-white dark:bg-slate-800"></td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        ) : (
                        <div className="space-y-4 pt-2">
                            <div className="flex flex-col lg:flex-row justify-between items-center gap-4 bg-slate-50/50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest shrink-0">Transaction Audit Trail</h4>

                                <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
                                    <div className="relative flex-1 lg:flex-none">
                                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Search ledger entries..."
                                            value={ledgerSearchTerm}
                                            onChange={e => setLedgerSearchTerm(e.target.value)}
                                            className="pl-8 pr-3 py-1.5 text-[10px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 w-full lg:w-48"
                                        />
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {[
                                            { id: 'DISBURSAL', label: 'Disbursal', activeColor: 'bg-emerald-500 border-emerald-600 text-white', inactiveColor: 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700' },
                                            { id: 'TOPUP', label: 'Top-up', activeColor: 'bg-violet-500 border-violet-600 text-white', inactiveColor: 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700' },
                                            { id: 'REPAYMENT', label: 'Principal', activeColor: 'bg-blue-500 border-blue-600 text-white', inactiveColor: 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700' },
                                            { id: 'INTEREST', label: 'Interest', activeColor: 'bg-amber-500 border-amber-600 text-white', inactiveColor: 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700' }
                                        ].map(t => {
                                            const active = ledgerTypeFilters.includes(t.id);
                                            return (
                                                <button
                                                    key={t.id}
                                                    onClick={() => {
                                                        if (active) setLedgerTypeFilters(ledgerTypeFilters.filter(f => f !== t.id));
                                                        else setLedgerTypeFilters([...ledgerTypeFilters, t.id]);
                                                    }}
                                                    className={`px-3 py-1 rounded-full text-[9px] font-black tracking-tight transition-all border ${active ? t.activeColor : t.inactiveColor}`}
                                                >
                                                    {t.label}
                                                </button>
                                            );
                                        })}
                                        {ledgerTypeFilters.length > 0 && (
                                            <button
                                                onClick={() => setLedgerTypeFilters([])}
                                                className="px-2 py-1 text-[9px] font-bold text-slate-400 hover:text-red-500"
                                            >
                                                Reset
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <select
                                            value={`${ledgerSortConfig.key}_${ledgerSortConfig.direction}`}
                                            onChange={(e) => {
                                                const [key, direction] = e.target.value.split('_');
                                                setLedgerSortConfig({ key: key as any, direction: direction as any });
                                            }}
                                            className="px-2 py-1.5 text-[10px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer text-slate-600 dark:text-slate-300"
                                        >
                                            <option value="DATE_ASC">Date: Oldest First</option>
                                            <option value="DATE_DESC">Date: Newest First</option>
                                            <option value="AMOUNT_DESC">Amount: Highest First</option>
                                            <option value="AMOUNT_ASC">Amount: Lowest First</option>
                                        </select>
                                    </div>

                                    <div className="hidden lg:block h-6 w-px bg-slate-200 dark:bg-slate-800"></div>

                                    <div className="flex items-center gap-2">
                                        {/* Format picker + download */}
                                        <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden shadow-sm text-[10px] font-bold">
                                            <button
                                                onClick={downloadActiveLoanLedger}
                                                className="flex items-center gap-1 px-2 py-1.5 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border-r border-slate-200 dark:border-slate-700 transition-colors"
                                            >
                                                <Download size={11} /> Download
                                            </button>
                                            {(['CSV', 'XLSX'] as const).map(fmt => (
                                                <button key={fmt} onClick={() => setLedgerFormat(fmt)}
                                                    className={`px-2 py-1.5 transition-colors ${ledgerFormat === fmt ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-600'}`}>
                                                    {fmt}
                                                </button>
                                            ))}
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-[10px] h-8 px-2 text-red-500 hover:text-red-600"
                                            onClick={handleWipeInterest}
                                        >
                                            Wipe
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                                <div className="max-h-[400px] overflow-y-auto overflow-x-auto">
                                    <table className="min-w-full text-xs">
                                        <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                                            <tr>
                                                <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase">Date</th>
                                                <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase">Type</th>
                                                <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase">Interest Period</th>
                                                <th className="px-4 py-3 text-right font-bold text-slate-500 uppercase">Amount</th>
                                                <th className="px-4 py-3 text-right font-bold text-slate-500 uppercase">Principal</th>
                                                <th className="px-4 py-3 text-right font-bold text-slate-500 uppercase">Interest</th>
                                                <th className="px-4 py-3 text-right font-bold text-slate-500 uppercase">Balance</th>
                                                <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase">Notes</th>
                                                <th className="px-4 py-3 text-center font-bold text-slate-500 uppercase">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {filteredLedgerTransactions.map((tx: any) => (
                                                <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/20 transition-colors">
                                                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatDisplayDate(tx.date)}</td>
                                                    <td className="px-4 py-3">
                                                        {tx.entryType === 'DISBURSAL' ? (
                                                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px]">DISBURSAL</span>
                                                        ) : tx.entryType === 'TOPUP' ? (
                                                            <span className="px-2 py-0.5 rounded bg-violet-100 text-violet-700 font-bold text-[10px]">TOP-UP</span>
                                                        ) : calculatePrincipalPaid(tx) > 0 && (tx.interestPaid || 0) === 0 ? (
                                                            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-bold text-[10px]">REPAYMENT</span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px]">INTEREST</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-500">
                                                        <div className="space-y-1">
                                                            <div>{tx.interestPeriod ? `${MONTHS[tx.interestPeriod.month - 1]} ${tx.interestPeriod.year}` : '—'}</div>
                                                            {tx.interestCalculationType === 'PRORATED_DAYS' && tx.interestDays ? (
                                                                <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                                                    {tx.interestDays} Days
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold">
                                                        {tx.entryType === 'DISBURSAL' || tx.entryType === 'TOPUP' ? (
                                                            <span className="text-violet-600">+{formatCurrency(tx.amount || 0, settings.currency)}</span>
                                                        ) : calculatePrincipalPaid(tx) > 0 || (tx.interestPaid || 0) > 0 ? (
                                                            <span className="text-red-600">-{formatCurrency(calculatePrincipalPaid(tx) + (tx.interestPaid || 0), settings.currency)}</span>
                                                        ) : '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold">
                                                        {tx.entryType === 'DISBURSAL' ? (
                                                            <span className="text-emerald-700">{formatCurrency(tx.amount, settings.currency)}</span>
                                                        ) : (tx.entryType === 'TOPUP' || calculatePrincipalPaid(tx) > 0) ? (
                                                            <span className="text-blue-600">-{formatCurrency(tx.entryType === 'TOPUP' ? tx.amount : calculatePrincipalPaid(tx), settings.currency)}</span>
                                                        ) : '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold">
                                                        {(tx.interestPaid || 0) > 0 ? (
                                                            <span className="text-emerald-600">-{formatCurrency(tx.interestPaid, settings.currency)}</span>
                                                        ) : '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold">
                                                        <span className="text-slate-700">{formatCurrency(tx.balanceAfter, settings.currency)}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-500 italic max-w-[240px]">
                                                        <div className="truncate">{tx.notes || '—'}</div>
                                                        {tx.interestCalculationType === 'PRORATED_DAYS' && tx.interestDays ? (
                                                            <div className="mt-1 text-[10px] not-italic font-semibold text-blue-600 dark:text-blue-300">
                                                                Recorded using exact-day proration
                                                            </div>
                                                        ) : null}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <div className="flex justify-center gap-1">
                                                            {tx.entryType === 'DISBURSAL' ? (
                                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-blue-500" onClick={() => openEditModal(activeLoan)}><Edit size={12} /></Button>
                                                            ) : (
                                                                <>
                                                                    {tx.entryType === 'REPAYMENT' ? (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-6 w-6 text-blue-500"
                                                                            onClick={() => openInterestEditModal(tx.id)}
                                                                            title="Edit repayment"
                                                                        >
                                                                            <Edit size={12} />
                                                                        </Button>
                                                                    ) : tx.entryType === 'TOPUP' ? (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-6 w-6 text-violet-500"
                                                                            onClick={() => handleEditTopup(tx)}
                                                                            title="Edit Top-Up"
                                                                        >
                                                                            <Edit size={12} />
                                                                        </Button>
                                                                    ) : null}
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-6 w-6 text-red-500"
                                                                        onClick={async () => {
                                                                            if (confirm("Delete this transaction permanently?")) {
                                                                                try {
                                                                                    if (tx.entryType === 'TOPUP') await deleteLoanTopup(tx.id);
                                                                                    else await deleteLoanRepayment(tx.id);
                                                                                    log('DELETE_TRANSACTION', 'special_loans', activeLoan.id, { date: tx.date, type: tx.entryType, interestPeriod: tx.interestPeriod || null });
                                                                                } catch (e) { alert("Failed to delete record"); }
                                                                            }
                                                                        }}
                                                                    >
                                                                        <Trash2 size={12} />
                                                                    </Button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-slate-50 dark:bg-slate-900/50 sticky bottom-0 z-10 border-t border-slate-200 dark:border-slate-700">
                                            <tr className="font-black">
                                                <td colSpan={3} className="px-4 py-3 text-left uppercase tracking-widest text-[9px] text-slate-400">Ledger Totals (Filtered)</td>
                                                <td className="px-4 py-3 text-right text-slate-900 dark:text-white">
                                                    {ledgerTotals.amount >= 0 ? '+' : ''}{formatCurrency(ledgerTotals.amount, settings.currency)}
                                                </td>
                                                <td className="px-4 py-3 text-right text-blue-600 dark:text-blue-400">
                                                    {ledgerTotals.principal >= 0 ? '+' : ''}{formatCurrency(ledgerTotals.principal, settings.currency)}
                                                </td>
                                                <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">
                                                    -{formatCurrency(ledgerTotals.interest, settings.currency)}
                                                </td>
                                                <td colSpan={3} className="px-4 py-3 bg-white dark:bg-slate-800"></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setModals({ ...modals, history: false })}>Close Ledger</Button>
                            <Button className="flex-1 bg-amber-600 hover:bg-amber-700 text-white rounded-xl" onClick={() => { setModals({ ...modals, history: false, autoGen: true }); openAutoGenModal(activeLoan); }}>Recalculate Interest</Button>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal
                isOpen={modals.editInterest && !!activeLoan && !!interestEditTarget}
                onClose={() => {
                    setModals({ ...modals, editInterest: false });
                    setInterestEditTarget(null);
                }}
                title="Edit Repayment"
                maxWidth="max-w-2xl"
            >
                {activeLoan && interestEditTarget && (
                    <div className="space-y-5">
                        {errorMsg && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">{errorMsg}</div>}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input
                                label="Transaction Date"
                                type="date"
                                value={interestEditForm.date}
                                onChange={e => setInterestEditForm({ ...interestEditForm, date: e.target.value })}
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Int. Month</label>
                                    <select
                                        value={interestEditForm.month}
                                        onChange={e => setInterestEditForm({ ...interestEditForm, month: e.target.value })}
                                        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    >
                                        <option value="">None</option>
                                        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Int. Year</label>
                                    <select
                                        value={interestEditForm.year}
                                        onChange={e => setInterestEditForm({ ...interestEditForm, year: e.target.value })}
                                        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    >
                                        <option value="">None</option>
                                        {Array.from({ length: 20 }, (_, i) => 2020 + i).map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input
                                label="Principal Amount"
                                type="number"
                                value={interestEditForm.principalPaid}
                                onChange={e => setInterestEditForm({ ...interestEditForm, principalPaid: e.target.value })}
                                leftIcon={<span className="text-xs font-bold text-slate-400">{settings.currency}</span>}
                            />
                            <Input
                                label="Interest Amount"
                                type="number"
                                value={interestEditForm.interestPaid}
                                onChange={e => setInterestEditForm({ ...interestEditForm, interestPaid: e.target.value })}
                                leftIcon={<span className="text-xs font-bold text-slate-400">{settings.currency}</span>}
                            />
                        </div>

                        {interestEditPreview && (
                            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 p-4 space-y-4">
                                <div>
                                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Calculation Mode</p>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Switch a recorded month between default monthly interest and exact-day proration.</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { label: 'Monthly Default', value: 'MONTHLY' as InterestCalculationType },
                                        { label: 'Exact Days', value: 'PRORATED_DAYS' as InterestCalculationType }
                                    ].map(option => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setInterestEditForm({
                                                ...interestEditForm,
                                                interestCalculationType: option.value
                                            })}
                                            className={`rounded-2xl border px-4 py-3 text-left transition-all ${interestEditForm.interestCalculationType === option.value
                                                ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-200'
                                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                                                }`}
                                        >
                                            <div className="text-sm font-bold">{option.label}</div>
                                            <div className="mt-1 text-xs opacity-80">
                                                {option.value === 'MONTHLY'
                                                    ? `Match stored monthly amount ${formatCurrency(interestEditPreview.monthlyInterest, settings.currency)}`
                                                    : `Prorate for up to ${interestEditPreview.monthDays} exact days`}
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                {interestEditForm.interestCalculationType === 'PRORATED_DAYS' && (
                                    <Input
                                        label="Exact Days Held"
                                        type="number"
                                        min={1}
                                        max={interestEditPreview.monthDays}
                                        value={interestEditForm.interestDays}
                                        onChange={e => setInterestEditForm({
                                            ...interestEditForm,
                                            interestDays: e.target.value
                                        })}
                                        description={interestEditPreview.formula
                                            ? `${interestEditPreview.daysHeld} of ${interestEditPreview.monthDays} days. ${interestEditPreview.formula}`
                                            : `Use 1-${interestEditPreview.monthDays} days for ${interestEditPreview.periodLabel}.`}
                                    />
                                )}
                            </div>
                        )}

                        <Input
                            label="Notes"
                            type="text"
                            value={interestEditForm.notes}
                            onChange={e => setInterestEditForm({
                                ...interestEditForm,
                                notes: e.target.value
                            })}
                            placeholder="Optional note"
                        />

                        <div className="flex justify-end gap-3 pt-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setModals({ ...modals, editInterest: false });
                                    setInterestEditTarget(null);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button onClick={handleUpdateRepayment}>
                                Save Repayment
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* EDIT LOAN MODAL */}
            <Modal isOpen={modals.edit} onClose={() => setModals({ ...modals, edit: false })} title="Edit Special Loan" >
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
                        <Input
                            label="Start Date"
                            type="date"
                            value={editForm.date}
                            onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                        />
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

                    {editLoanSummary && (
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4 space-y-4">
                            <div className="grid gap-3 sm:grid-cols-3">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Revised Principal</p>
                                    <p className="mt-2 text-base font-bold text-slate-900 dark:text-white">{formatCurrency(editLoanSummary.revisedPrincipal, settings.currency)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Already Recovered</p>
                                    <p className="mt-2 text-base font-bold text-blue-700 dark:text-blue-300">{formatCurrency(editLoanSummary.principalRecovered, settings.currency)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Remaining Principal</p>
                                    <p className={`mt-2 text-base font-bold ${editLoanSummary.remainingPrincipal > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                                        {formatCurrency(Math.max(0, editLoanSummary.rawRemaining), settings.currency)}
                                    </p>
                                </div>
                            </div>

                            {editLoanSummary.remainingPrincipal > 0 ? (
                                <div className="space-y-4 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                                    <div className="flex items-start gap-3">
                                        <input
                                            id="settleRemaining"
                                            type="checkbox"
                                            checked={editForm.settleRemaining}
                                            onChange={e => setEditForm({ ...editForm, settleRemaining: e.target.checked })}
                                            className="mt-1 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                        />
                                        <label htmlFor="settleRemaining" className="text-sm text-slate-700 dark:text-slate-200">
                                            Record the remaining principal payment and close the loan after saving this correction.
                                        </label>
                                    </div>

                                    <p className="text-xs text-amber-800 dark:text-amber-200">
                                        Example: if a closed loan was entered as {formatCurrency(50000, settings.currency)} but should be {formatCurrency(100000, settings.currency)}, this option lets you save the correction and immediately collect the extra {formatCurrency(editLoanSummary.remainingPrincipal, settings.currency)}.
                                    </p>

                                    {editForm.settleRemaining && (
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <Input
                                                label="Remaining Payment Date"
                                                type="date"
                                                value={editForm.settlementDate}
                                                onChange={e => setEditForm({ ...editForm, settlementDate: e.target.value })}
                                            />
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Payment Method</label>
                                                <select
                                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                                                    value={editForm.settlementMethod}
                                                    onChange={(e) => setEditForm({ ...editForm, settlementMethod: e.target.value as PaymentMethod })}
                                                >
                                                    <option value={PaymentMethod.CASH}>Cash</option>
                                                    <option value={PaymentMethod.UPI}>UPI</option>
                                                    <option value={PaymentMethod.BANK_TRANSFER}>Bank Transfer</option>
                                                </select>
                                            </div>
                                            <div className="sm:col-span-2">
                                                <Input
                                                    label="Settlement Notes"
                                                    type="text"
                                                    value={editForm.settlementNotes}
                                                    onChange={e => setEditForm({ ...editForm, settlementNotes: e.target.value })}
                                                    placeholder="Optional note for the balancing payment"
                                                    description="Saving will add a principal repayment for the remaining balance and then close the loan."
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {!editForm.settleRemaining && editForm.status === LoanStatus.CLOSED && (
                                        <p className="text-xs font-medium text-rose-700 dark:text-rose-300">
                                            A closed loan cannot keep this remaining balance. Set status to Active or enable the remaining payment option.
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                                    This correction does not leave any principal pending.
                                </p>
                            )}
                        </div>
                    )}

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
