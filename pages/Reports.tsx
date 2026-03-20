import React, { useState, useMemo } from 'react';
import { useMembers } from '../context/MemberContext';
import { useFinancials } from '../context/FinancialContext';
import { useSettings } from '../context/SettingsContext';
import { PaymentCategory } from '../types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { FileSpreadsheet, Download, TrendingUp, TrendingDown, Wallet, AlertTriangle } from 'lucide-react';
import { MONTHS, FISCAL_YEARS, formatCurrency } from '../constants';
import { compareISODate, formatDisplayDate, getISODateMonthYear } from '../utils/date';

const COLORS_MAP: Record<string, string> = { Savings: '#3b82f6', Interest: '#10b981', 'Late Fees': '#f59e0b' };
const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const Reports: React.FC = () => {
  const { members } = useMembers();
  const { payments, loanRepayments, loans, loanTopups } = useFinancials();
  const { settings } = useSettings();

  const currentYear = new Date().getFullYear();
  const [filterYear, setFilterYear] = useState(currentYear);
  const [filterMonth, setFilterMonth] = useState(0); // 0 = all
  const [activeTab, setActiveTab] = useState<'summary' | 'savings' | 'loans' | 'members' | 'cashflow'>('summary');

  const years = useMemo(() => {
    const y = new Set<number>([currentYear]);
    payments.forEach(p => y.add(p.year));
    return Array.from(y).sort((a, b) => b - a);
  }, [payments, currentYear]);

  // Filtered helpers
  const filteredPayments = useMemo(() =>
    payments.filter(p => p.year === filterYear && (filterMonth === 0 || p.month === filterMonth)),
    [payments, filterYear, filterMonth]);

  const filteredRepayments = useMemo(() =>
    loanRepayments.filter(r => {
      const loan = loans.find(l => l.id === r.loanId);
      if (loan?.type !== 'SPECIAL') return false;
      const [rYear, rMonth] = r.date.split('-').map(Number);
      return rYear === filterYear && (filterMonth === 0 || rMonth === filterMonth);
    }),
    [loanRepayments, loans, filterYear, filterMonth]);

  const filteredLoans = useMemo(() =>
    loans.filter(l => {
      if (l.type !== 'SPECIAL') return false;
      const [lYear, lMonth] = l.startDate.split('-').map(Number);
      return lYear === filterYear && (filterMonth === 0 || lMonth === filterMonth);
    }),
    [loans, filterYear, filterMonth]);

  const filteredTopups = useMemo(() =>
    loanTopups.filter(t => {
      const loan = loans.find(l => l.id === t.loanId);
      if (loan?.type !== 'SPECIAL') return false;
      const [tYear, tMonth] = t.date.split('-').map(Number);
      return tYear === filterYear && (filterMonth === 0 || tMonth === filterMonth);
    }),
    [loanTopups, loans, filterYear, filterMonth]);

  // Summary totals
  const summary = useMemo(() => {
    const savingsCollected = filteredPayments
      .filter(p => (p.category || PaymentCategory.SAVINGS) === PaymentCategory.SAVINGS)
      .reduce((s, p) => s + p.amount, 0);
    const joiningFees = filteredPayments
      .filter(p => p.category === PaymentCategory.JOINING_FEE)
      .reduce((s, p) => s + p.amount, 0);
    const annualInterestPaid = filteredPayments
      .filter(p => p.category === PaymentCategory.ANNUAL_MEMBER_INTEREST)
      .reduce((s, p) => s + p.amount, 0);
    const processingFees = filteredLoans.reduce((s, l) => s + (l.processingFee || 0), 0);
    const lateFees = filteredPayments.reduce((s, p) => s + (p.lateFee || 0), 0);
    const interestEarned = filteredRepayments.reduce((s, r) => s + (r.interestPaid || 0), 0);
    const loanLateFees = filteredRepayments.reduce((s, r) => s + (r.lateFee || 0), 0);
    const totalIncome = joiningFees + processingFees + lateFees + interestEarned + loanLateFees;
    const totalOutgoings = annualInterestPaid;
    const netIncome = totalIncome - totalOutgoings; // Profitability
    return { savingsCollected, joiningFees, annualInterestPaid, processingFees, lateFees, interestEarned, loanLateFees, totalIncome, totalOutgoings, netIncome };
  }, [filteredPayments, filteredRepayments, filteredLoans]);

  // Monthly trend chart data (for selected year, all months)
  const monthlyTrendData = useMemo(() => {
    return MONTHS.map((name, i) => {
      const m = i + 1;
      const savings = payments
        .filter(p => p.year === filterYear && p.month === m && (p.category || PaymentCategory.SAVINGS) === PaymentCategory.SAVINGS)
        .reduce((s, p) => s + p.amount, 0);
      const joiningFees = payments
        .filter(p => p.year === filterYear && p.month === m && p.category === PaymentCategory.JOINING_FEE)
        .reduce((s, p) => s + p.amount, 0);
      const annualInterestPaid = payments
        .filter(p => p.year === filterYear && p.month === m && p.category === PaymentCategory.ANNUAL_MEMBER_INTEREST)
        .reduce((s, p) => s + p.amount, 0);
      const interest = loanRepayments.filter(r => { 
        const loan = loans.find(l => l.id === r.loanId);
        if (loan?.type !== 'SPECIAL') return false;
        const [rYear, rMonth] = r.date.split('-').map(Number); 
        return rYear === filterYear && rMonth === m; 
      }).reduce((s, r) => s + (r.interestPaid || 0), 0);
      const processingFee = loans
        .filter(l => {
          if (l.type !== 'SPECIAL') return false;
          const [lYear, lMonth] = l.startDate.split('-').map(Number);
          return lYear === filterYear && lMonth === m;
        })
        .reduce((s, l) => s + (l.processingFee || 0), 0);
      
      const lateFee = payments.filter(p => p.year === filterYear && p.month === m).reduce((s, p) => s + (p.lateFee || 0), 0)
        + loanRepayments.filter(r => { 
            const loan = loans.find(l => l.id === r.loanId);
            if (loan?.type !== 'SPECIAL') return false;
            const [rYear, rMonth] = r.date.split('-').map(Number); 
            return rYear === filterYear && rMonth === m; 
        }).reduce((s, r) => s + (r.lateFee || 0), 0);
      
      return {
        name: name.substring(0, 3),
        Savings: savings,
        'Joining Fees': joiningFees,
        'Processing Fees': processingFee,
        Interest: interest,
        'Late Fees': lateFee,
        'Member Interest Paid': annualInterestPaid
      };
    });
  }, [payments, loanRepayments, loans, filterYear]);

  // Download helpers
  const downloadCSV = (headers: string[], rows: (string | number)[][], filename: string) => {
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `${filename}_${filterYear}${filterMonth ? '_' + MONTHS[filterMonth - 1] : ''}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const downloadTallySummary = () => {
    // Tally-compatible and traceable for CA review.
    const rows: (string | number)[][] = [];
    let voucherNo = 1;
    const nextVoucher = () => `RPT-${String(voucherNo++).padStart(5, '0')}`;

    // 1. Savings, Joining Fee, Annual Member Interest, and Savings Late Fees
    filteredPayments.forEach(p => {
      const m = members.find(x => x.id === p.memberId);
      const category = p.category || PaymentCategory.SAVINGS;
      const voucher = nextVoucher();

      if (category === PaymentCategory.SAVINGS) {
        rows.push([voucher, formatDisplayDate(p.date), m?.id || p.memberId, `"${m?.name || p.memberId}"`, `"${m?.name || p.memberId}"`, 'Receipt', '', p.amount, '"Monthly Savings"']);
      } else if (category === PaymentCategory.JOINING_FEE) {
        rows.push([voucher, formatDisplayDate(p.date), m?.id || p.memberId, `"${m?.name || p.memberId}"`, `"${m?.name || p.memberId}"`, 'Receipt', '', p.amount, '"Joining Fee"']);
      } else if (category === PaymentCategory.ANNUAL_MEMBER_INTEREST) {
        rows.push([voucher, formatDisplayDate(p.date), m?.id || p.memberId, `"${m?.name || p.memberId}"`, `"${m?.name || p.memberId}"`, 'Payment', p.amount, '', '"Annual Member Interest Payout"']);
      }

      if (p.lateFee && p.lateFee > 0) {
        rows.push([nextVoucher(), formatDisplayDate(p.date), m?.id || p.memberId, `"${m?.name || p.memberId}"`, `"${m?.name || p.memberId}"`, 'Receipt', '', p.lateFee, '"Late Fee (Savings)"']);
      }
    });

    // 2. Loan Disbursements / Processing Fees / Topups
    filteredLoans.forEach(l => {
      const m = members.find(x => x.id === l.memberId);
      const loanType = l.type || 'REGULAR';
      rows.push([nextVoucher(), formatDisplayDate(l.startDate), m?.id || l.memberId, `"${m?.name || l.memberId}"`, `"${m?.name || l.memberId}"`, 'Payment', l.principalAmount, '', `"Loan Disbursement - ${loanType}"`]);
      if ((l.processingFee || 0) > 0) {
        rows.push([nextVoucher(), formatDisplayDate(l.startDate), m?.id || l.memberId, `"${m?.name || l.memberId}"`, `"${m?.name || l.memberId}"`, 'Receipt', '', l.processingFee || 0, `"Loan Processing Fee - ${loanType}"`]);
      }
    });
    filteredTopups.forEach(t => {
      const loan = loans.find(l => l.id === t.loanId);
      const m = loan ? members.find(x => x.id === loan.memberId) : null;
      rows.push([nextVoucher(), formatDisplayDate(t.date), m?.id || t.loanId, `"${m?.name || t.loanId}"`, `"${m?.name || t.loanId}"`, 'Payment', t.amount, '', `"Loan Top-up - SPECIAL"`]);
    });

    // 3. Loan Repayments: Principal, Interest, Late Fees (Incoming)
    filteredRepayments.forEach(r => {
      const loan = loans.find(l => l.id === r.loanId);
      const member = loan ? members.find(m => m.id === loan.memberId) : null;
      const loanType = loan?.type || 'REGULAR';
      if ((r.principalPaid || 0) > 0)
        rows.push([nextVoucher(), formatDisplayDate(r.date), member?.id || r.loanId, `"${member?.name || r.loanId}"`, `"${member?.name || r.loanId}"`, 'Receipt', '', r.principalPaid, `"Loan Principal Recovery - ${loanType}"`]);
      if (r.interestPaid > 0)
        rows.push([nextVoucher(), formatDisplayDate(r.date), member?.id || r.loanId, `"${member?.name || r.loanId}"`, `"${member?.name || r.loanId}"`, 'Receipt', '', r.interestPaid, `"Loan Interest Income - ${loanType}"`]);
      if ((r.lateFee || 0) > 0)
        rows.push([nextVoucher(), formatDisplayDate(r.date), member?.id || r.loanId, `"${member?.name || r.loanId}"`, `"${member?.name || r.loanId}"`, 'Receipt', '', r.lateFee || 0, `"Loan Late Fee - ${loanType}"`]);
    });

    downloadCSV(['Voucher No', 'Date', 'Member ID', 'Member Name', 'Ledger', 'Voucher Type', 'Debit', 'Credit', 'Narration'], rows, 'Tally_Export');
  };

  const memberReports = useMemo(() => {
    return members.map(m => {
      const mp = payments.filter(p => p.memberId === m.id && p.year === filterYear && (filterMonth === 0 || p.month === filterMonth));
      const totalSavings = mp
        .filter(p => (p.category || PaymentCategory.SAVINGS) === PaymentCategory.SAVINGS)
        .reduce((s, p) => s + p.amount, 0);
      const totalLateFees = mp.reduce((s, p) => s + (p.lateFee || 0), 0);
      const txns = mp.length;
      const last = mp.length > 0 ? [...mp].sort((a, b) => compareISODate(b.date, a.date))[0].date : null;
      return { ...m, totalSavings, totalLateFees, txns, last };
    }).sort((a, b) => b.totalSavings - a.totalSavings);
  }, [members, payments, filterYear, filterMonth]);

  const tabs = [
    { id: 'summary', label: 'Summary' },
    { id: 'savings', label: 'Savings' },
    { id: 'loans', label: 'Loan/Interest' },
    { id: 'members', label: 'Members' },
    { id: 'cashflow', label: 'Cash Flow' },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Financial Reports</h1>
          <p className="text-slate-500 dark:text-slate-400">Categorised income and audit-ready exports</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={downloadTallySummary} className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">
            <Download size={16} className="mr-2" /> Tally Export
          </button>
          <button onClick={() => downloadCSV(
            ['Month', 'Savings', 'Joining Fees', 'Processing Fees', 'Interest', 'Late Fees', 'Member Interest Paid', 'Net'],
            monthlyTrendData.map(d => [d.name, d.Savings, d['Joining Fees'], d['Processing Fees'], d.Interest, d['Late Fees'], d['Member Interest Paid'], d.Savings + d['Joining Fees'] + d['Processing Fees'] + d.Interest + d['Late Fees'] - d['Member Interest Paid']]),
            'Annual_Summary'
          )} className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 text-sm">
            <FileSpreadsheet size={16} className="mr-2" /> Annual CSV
          </button>
        </div>
      </div>

      {/* Year/Month Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Filter:</span>
        <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} className="px-3 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200">
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))} className="px-3 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200">
          <option value={0}>Full Year</option>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
          { label: 'Savings Collected', value: summary.savingsCollected, color: 'blue', icon: TrendingUp },
          { label: 'Fees Earned', value: summary.joiningFees + summary.processingFees, color: 'violet', icon: TrendingUp },
          { label: 'Interest Earned', value: summary.interestEarned, color: 'emerald', icon: TrendingUp },
          { label: 'Late Fees', value: summary.lateFees + summary.loanLateFees, color: 'amber', icon: AlertTriangle }
        ].map(card => (
          <div key={card.label} className={`bg-${card.color}-50 dark:bg-${card.color}-900/20 p-4 rounded-xl border border-${card.color}-100 dark:border-${card.color}-800`}>
            <p className={`text-xs font-semibold text-${card.color}-600 dark:text-${card.color}-400 uppercase mb-1`}>{card.label}</p>
            <p className={`text-xl font-bold text-${card.color}-900 dark:text-${card.color}-200`}>{formatCurrency(card.value, settings.currency)}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex justify-between items-center">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase">Total Income</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(summary.totalIncome, settings.currency)}</p>
          </div>
          <TrendingUp size={32} className="text-blue-400" />
        </div>
        <div className={`border rounded-xl p-4 flex justify-between items-center ${summary.netIncome >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800'}`}>
          <div>
            <p className={`text-xs font-semibold uppercase ${summary.netIncome >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>Net Income</p>
            <p className={`text-2xl font-bold ${summary.netIncome >= 0 ? 'text-emerald-900 dark:text-emerald-200' : 'text-rose-900 dark:text-rose-200'}`}>{formatCurrency(summary.netIncome, settings.currency)}</p>
          </div>
          <Wallet size={32} className={summary.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === t.id ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Summary Tab: Annual Trend Chart */}
      {activeTab === 'summary' && (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Annual Trend — {filterYear}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyTrendData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {Object.keys(COLORS_MAP).map(k => <Bar key={k} dataKey={k} fill={COLORS_MAP[k]} radius={[3, 3, 0, 0]} stackId="income" />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Savings Tab */}
      {activeTab === 'savings' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Savings Transactions</h3>
            <button onClick={() => downloadCSV(['Date', 'Member ID', 'Member Name', 'Category', 'Month', 'Year', 'Amount', 'Late Fee', 'Method'],
              filteredPayments.map(p => [formatDisplayDate(p.date), p.memberId, `"${members.find(m => m.id === p.memberId)?.name || ''}"`, p.category || PaymentCategory.SAVINGS, p.month, p.year, p.amount, p.lateFee || 0, p.method]),
              'Savings_Transactions')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600">
              <Download size={16} /> Export
            </button>
          </div>
          <div className="overflow-x-auto max-h-[500px]">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0">
                <tr>
                  {['Date', 'Member', 'Category', 'Month/Year', 'Amount', 'Late Fee', 'Method'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredPayments.map(p => {
                  const m = members.find(x => x.id === p.memberId);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{formatDisplayDate(p.date)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{m?.name || p.memberId}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{p.category || PaymentCategory.SAVINGS}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{MONTHS[p.month - 1]} {p.year}</td>
                      <td className="px-4 py-3 text-sm font-bold text-blue-600 dark:text-blue-400">{settings.currency} {p.amount}</td>
                      <td className="px-4 py-3 text-sm text-amber-600 dark:text-amber-400">{p.lateFee ? `+${settings.currency}${p.lateFee}` : '-'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{p.method}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-900/50 font-bold border-t-2 border-slate-200 dark:border-slate-700">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">TOTAL ({filteredPayments.length} txns)</td>
                  <td className="px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
                    {formatCurrency(filteredPayments.reduce((s, p) => s + p.amount, 0), settings.currency)}
                  </td>
                  <td className="px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                    {formatCurrency(filteredPayments.reduce((s, p) => s + (p.lateFee || 0), 0), settings.currency)}
                  </td>
                  <td className="px-4 py-3 text-[10px] text-slate-500 font-normal">
                    {Object.entries(filteredPayments.reduce((acc, p) => {
                      acc[p.method] = (acc[p.method] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)).map(([m, c]) => `${m}: ${c}`).join(', ')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Loans/Interest Tab — Fix 5: member identity + type tags + late fee */}
      {activeTab === 'loans' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Loan Repayments &amp; Interest</h3>
            <button onClick={() => downloadCSV(
              ['Date', 'Member ID', 'Member Name', 'Loan Type', 'Principal Paid', 'Interest Paid', 'Late Fee', 'Total Paid', 'Payment Method'],
              filteredRepayments.map(r => {
                const loan = loans.find(l => l.id === r.loanId);
                const member = loan ? members.find(m => m.id === loan.memberId) : null;
                const loanType = (loan as any)?.type || 'REGULAR';
                const totalPaid = (r.principalPaid || 0) + (r.interestPaid || 0) + (r.lateFee || 0);
                return [
                  formatDisplayDate(r.date), 
                  member?.id || '', 
                  `"${member?.name || ''}"`, 
                  loanType, 
                  r.principalPaid || 0, 
                  r.interestPaid || 0, 
                  r.lateFee || 0, 
                  totalPaid,
                  r.method
                ];
              }),
              'Loan_Repayments')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600">
              <Download size={16} /> Export
            </button>
          </div>
          <div className="overflow-x-auto max-h-[700px]">
            {/* SPECIAL LOANS SECTION */}
            <div className="bg-violet-50/50 dark:bg-violet-900/10 px-4 py-2 border-b border-violet-100 dark:border-violet-900/50 mt-4">
              <h4 className="text-sm font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wider">Special Loan Repayments (Interest Only)</h4>
            </div>
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0">
                <tr>
                  {['Date', 'Member Name', 'Collected', 'Interest Paid', 'Principal Paid', 'Late Fee', 'Method'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredRepayments.filter(r => (loans.find(l => l.id === r.loanId)?.type) === 'SPECIAL').map(r => {
                  const loan = loans.find(l => l.id === r.loanId);
                  const member = loan ? members.find(m => m.id === loan.memberId) : null;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDisplayDate(r.date)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{member?.name || 'Unknown'}</td>
                      <td className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200">{settings.currency} {r.amount}</td>
                      <td className="px-4 py-3 font-bold text-emerald-600 dark:text-emerald-400">{settings.currency} {r.interestPaid || 0}</td>
                      <td className="px-4 py-3 text-blue-600 dark:text-blue-400">{settings.currency} {r.principalPaid || 0}</td>
                      <td className="px-4 py-3 text-amber-600 dark:text-amber-400">{r.lateFee ? `${settings.currency}${r.lateFee}` : '-'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{r.method}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-900/50 font-bold border-t border-slate-200 dark:border-slate-700">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-violet-700 dark:text-violet-400">SPECIAL TOTALS</td>
                  <td className="px-4 py-3 text-slate-900 dark:text-white">{formatCurrency(filteredRepayments.filter(r => (loans.find(l => l.id === r.loanId)?.type) === 'SPECIAL').reduce((s, r) => s + r.amount, 0), settings.currency)}</td>
                  <td className="px-4 py-3 text-emerald-600">{formatCurrency(filteredRepayments.filter(r => (loans.find(l => l.id === r.loanId)?.type) === 'SPECIAL').reduce((s, r) => s + (r.interestPaid || 0), 0), settings.currency)}</td>
                  <td className="px-4 py-3 text-blue-600">{formatCurrency(filteredRepayments.filter(r => (loans.find(l => l.id === r.loanId)?.type) === 'SPECIAL').reduce((s, r) => s + (r.principalPaid || 0), 0), settings.currency)}</td>
                  <td className="px-4 py-3 text-amber-600">{formatCurrency(filteredRepayments.filter(r => (loans.find(l => l.id === r.loanId)?.type) === 'SPECIAL').reduce((s, r) => s + (r.lateFee || 0), 0), settings.currency)}</td>
                  <td></td>
                </tr>
                <tr className="bg-blue-50 dark:bg-blue-900/20 border-t-2 border-blue-100 dark:border-blue-900/40 text-sm">
                  <td colSpan={2} className="px-4 py-4 text-blue-800 dark:text-blue-300 font-extrabold uppercase tracking-widest">Grand Totals (All Loans)</td>
                  <td className="px-4 py-4 text-slate-900 dark:text-white font-black text-base">{formatCurrency(filteredRepayments.reduce((s, r) => s + r.amount, 0), settings.currency)}</td>
                  <td className="px-4 py-4 text-emerald-700 dark:text-emerald-400 font-black text-base">{formatCurrency(filteredRepayments.reduce((s, r) => s + (r.interestPaid || 0), 0), settings.currency)}</td>
                  <td className="px-4 py-4 text-blue-700 dark:text-blue-400 font-black text-base">{formatCurrency(filteredRepayments.reduce((s, r) => s + (r.principalPaid || 0), 0), settings.currency)}</td>
                  <td className="px-4 py-4 text-amber-700 dark:text-amber-400 font-black text-base">{formatCurrency(filteredRepayments.reduce((s, r) => s + (r.lateFee || 0), 0), settings.currency)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {/* Section Summary - Clear visibility for late fee sum at the footer */}
          <div className="px-6 py-6 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-700">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Collection</p>
                <p className="text-xl font-black text-slate-900 dark:text-white">{formatCurrency(filteredRepayments.reduce((s, r) => s + r.amount, 0), settings.currency)}</p>
              </div>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Total Interest</p>
                <p className="text-xl font-black text-emerald-700 dark:text-emerald-400">{formatCurrency(filteredRepayments.reduce((s, r) => s + (r.interestPaid || 0), 0), settings.currency)}</p>
              </div>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1">Total Principal</p>
                <p className="text-xl font-black text-blue-700 dark:text-blue-400">{formatCurrency(filteredRepayments.reduce((s, r) => s + (r.principalPaid || 0), 0), settings.currency)}</p>
              </div>
              <div className="bg-amber-100/30 dark:bg-amber-900/10 p-4 rounded-xl border border-amber-200 dark:border-amber-900/50 shadow-sm">
                <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest mb-1">Total Late Fees (Loans)</p>
                <p className="text-xl font-black text-amber-900 dark:text-amber-200">{formatCurrency(filteredRepayments.reduce((s, r) => s + (r.lateFee || 0), 0), settings.currency)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Member Contribution Summary</h3>
            <button onClick={() => downloadCSV(['ID', 'Name', 'Address', 'Status', 'Savings', 'Late Fees', 'Transactions'],
              memberReports.map(m => [m.id, `"${m.name}"`, `"${m.address}"`, m.isActive ? 'Active' : 'Inactive', m.totalSavings, m.totalLateFees, m.txns]),
              'Member_Report')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600">
              <Download size={16} /> Export
            </button>
          </div>
          <div className="overflow-x-auto max-h-[600px]">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0">
                <tr>
                  {['ID', 'Member', 'Address', 'Status', 'Txns', 'Late Fees', 'Total Savings'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {memberReports.map(m => (
                  <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="px-4 py-3 text-xs text-slate-400 font-mono">{m.id}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{m.name}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{m.address}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${m.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>{m.isActive ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{m.txns}</td>
                    <td className="px-4 py-3 text-amber-600 dark:text-amber-400">{m.totalLateFees > 0 ? `${settings.currency} ${m.totalLateFees}` : '-'}</td>
                    <td className="px-4 py-3 font-bold text-blue-600 dark:text-blue-400">{formatCurrency(m.totalSavings, settings.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cash Flow Tab — Fix 8: Master Income vs Outgoing vs Net per month */}
      {activeTab === 'cashflow' && (() => {
          const cfData = MONTHS.map((name, i) => {
          const m = i + 1;
          const savings = payments.filter(p => p.year === filterYear && p.month === m && !p.isLegacy && (p.category || PaymentCategory.SAVINGS) === PaymentCategory.SAVINGS).reduce((s, p) => s + p.amount, 0);
          const joiningFees = payments.filter(p => p.year === filterYear && p.month === m && p.category === PaymentCategory.JOINING_FEE).reduce((s, p) => s + p.amount, 0);
          const annualInterestPaid = payments.filter(p => p.year === filterYear && p.month === m && p.category === PaymentCategory.ANNUAL_MEMBER_INTEREST).reduce((s, p) => s + p.amount, 0);
          const savingsLateFee = payments.filter(p => p.year === filterYear && p.month === m).reduce((s, p) => s + (p.lateFee || 0), 0);
          const interest = loanRepayments.filter(r => { 
            const loan = loans.find(l => l.id === r.loanId);
            if (loan?.type !== 'SPECIAL') return false;
            const [rYear, rMonth] = r.date.split('-').map(Number);
            return rYear === filterYear && rMonth === m; 
          }).reduce((s, r) => s + (r.interestPaid || 0), 0);
          const processingFees = loans.filter(l => {
            if (l.type !== 'SPECIAL') return false;
            const [lYear, lMonth] = l.startDate.split('-').map(Number);
            return lYear === filterYear && lMonth === m;
          }).reduce((s, l) => s + (l.processingFee || 0), 0);
          
          const loanLateFee = loanRepayments.filter(r => { 
            const loan = loans.find(l => l.id === r.loanId);
            if (loan?.type !== 'SPECIAL') return false;
            const [rYear, rMonth] = r.date.split('-').map(Number);
            return rYear === filterYear && rMonth === m; 
          }).reduce((s, r) => s + (r.lateFee || 0), 0);
          
          const totalIncome = savings + joiningFees + processingFees + savingsLateFee + interest + loanLateFee;
          
          const loansDisbursed = loans.filter(l => { 
            if (l.type !== 'SPECIAL') return false;
            const dStr = (l as any).startDate || (l as any).start_date;
            const [lYear, lMonth] = dStr.split('-').map(Number);
            return lYear === filterYear && lMonth === m && !(l as any).isLegacy; 
          }).reduce((s, l) => s + l.principalAmount, 0)
            + loanTopups.filter(t => { 
              const loan = loans.find(l => l.id === t.loanId);
              if (loan?.type !== 'SPECIAL') return false;
              const [tYear, tMonth] = t.date.split('-').map(Number);
              return tYear === filterYear && tMonth === m; 
            }).reduce((s, t) => s + t.amount, 0);
          
          const totalOut = loansDisbursed + annualInterestPaid;
          return { name: name.substring(0, 3), savings, joiningFees, processingFees, annualInterestPaid, savingsLateFee, interest, loanLateFee, totalIncome, loansDisbursed, totalOut, net: totalIncome - totalOut };
        });
        const grandIn = cfData.reduce((s, r) => s + r.totalIncome, 0);
        const grandOut = cfData.reduce((s, r) => s + r.totalOut, 0);
        const grandNet = grandIn - grandOut;
        return (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Monthly Cash Flow — {filterYear}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Income (savings + interest + late fees) vs Outgoing (loans disbursed)</p>
              </div>
              <button onClick={() => downloadCSV(
                ['Month', 'Savings', 'Joining Fees', 'Processing Fees', 'Savings Late Fee', 'Interest', 'Loan Late Fee', 'Total Income', 'Loans Disbursed', 'Member Interest Paid', 'Total Outgoing', 'Net Surplus / Deficit'],
                cfData.map(r => [r.name, r.savings, r.joiningFees, r.processingFees, r.savingsLateFee, r.interest, r.loanLateFee, r.totalIncome, r.loansDisbursed, r.annualInterestPaid, r.totalOut, r.net]),
                'Cash_Flow'
              )} className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600">
                <Download size={16} /> Export
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Month</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-blue-600 uppercase">Savings</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-emerald-600 uppercase">Interest</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-amber-600 uppercase">Late Fees</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-violet-600 uppercase">Fees</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-blue-700 dark:text-blue-300 uppercase">Total Income</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-violet-600 uppercase">Loans Disbursed</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-amber-700 uppercase">Member Interest</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-rose-700 dark:text-rose-300 uppercase">Total Outgoing</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Net Surplus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {cfData.map(row => (
                    <tr key={row.name} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{row.name}</td>
                      <td className="px-4 py-3 text-right text-blue-600 dark:text-blue-400">{row.savings > 0 ? formatCurrency(row.savings, settings.currency) : '-'}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">{row.interest > 0 ? formatCurrency(row.interest, settings.currency) : '-'}</td>
                      <td className="px-4 py-3 text-right text-amber-600 dark:text-amber-400">{(row.savingsLateFee + row.loanLateFee) > 0 ? formatCurrency(row.savingsLateFee + row.loanLateFee, settings.currency) : '-'}</td>
                      <td className="px-4 py-3 text-right text-violet-600 dark:text-violet-400">{(row.joiningFees + row.processingFees) > 0 ? formatCurrency(row.joiningFees + row.processingFees, settings.currency) : '-'}</td>
                      <td className="px-4 py-3 text-right font-bold text-blue-700 dark:text-blue-300">{formatCurrency(row.totalIncome, settings.currency)}</td>
                      <td className="px-4 py-3 text-right text-violet-600 dark:text-violet-400">{row.loansDisbursed > 0 ? formatCurrency(row.loansDisbursed, settings.currency) : '-'}</td>
                      <td className="px-4 py-3 text-right text-amber-700 dark:text-amber-300">{row.annualInterestPaid > 0 ? formatCurrency(row.annualInterestPaid, settings.currency) : '-'}</td>
                      <td className="px-4 py-3 text-right font-bold text-rose-700 dark:text-rose-300">{formatCurrency(row.totalOut, settings.currency)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold ${row.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {row.net >= 0 ? '+' : ''}{formatCurrency(row.net, settings.currency)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 dark:bg-slate-900/50 border-t-2 border-slate-300 dark:border-slate-600 font-bold">
                  <tr>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">Annual Total</td>
                    <td colSpan={4} className="px-4 py-3 text-right text-blue-700 dark:text-blue-300">{formatCurrency(grandIn, settings.currency)} income</td>
                    <td className="px-4 py-3 text-right text-blue-700 dark:text-blue-300">{formatCurrency(grandIn, settings.currency)}</td>
                    <td colSpan={2} className="px-4 py-3 text-right text-rose-700 dark:text-rose-300">{formatCurrency(grandOut, settings.currency)} outgoing</td>
                    <td className="px-4 py-3 text-right text-rose-700 dark:text-rose-300">{formatCurrency(grandOut, settings.currency)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-lg ${grandNet >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {grandNet >= 0 ? '+' : ''}{formatCurrency(grandNet, settings.currency)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default Reports;
