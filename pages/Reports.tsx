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

const COLORS_MAP: Record<string, string> = { 'Principal Recovery': '#3b82f6', 'Interest Income': '#10b981', 'Processing Fees': '#8b5cf6', 'Late Fees': '#f59e0b' };
const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const Reports: React.FC = () => {
  const { members } = useMembers();
  const { payments, loanRepayments, loans, loanTopups } = useFinancials();
  const { settings } = useSettings();

  const currentYear = new Date().getFullYear();
  const [filterYear, setFilterYear] = useState(currentYear);
  const [filterMonth, setFilterMonth] = useState(0); // 0 = all
  const [activeTab, setActiveTab] = useState<'summary' | 'loans' | 'members'>('summary');

  const years = useMemo(() => {
    const y = new Set<number>([currentYear]);
    loanRepayments.forEach(r => {
      const { year } = getISODateMonthYear(r.date);
      y.add(year);
    });
    return Array.from(y).sort((a, b) => b - a);
  }, [loanRepayments, currentYear]);

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
    const processingFees = filteredLoans.reduce((s, l) => s + (l.processingFee || 0), 0);
    const interestEarned = filteredRepayments.reduce((s, r) => s + (r.interestPaid || 0), 0);
    const principalRecovered = filteredRepayments.reduce((s, r) => s + (r.principalPaid || 0), 0);
    const loanLateFees = filteredRepayments.reduce((s, r) => s + (r.lateFee || 0), 0);
    
    const totalRevenue = processingFees + interestEarned + loanLateFees;
    
    return { processingFees, interestEarned, principalRecovered, loanLateFees, totalRevenue };
  }, [filteredRepayments, filteredLoans]);

  // Monthly trend chart data (for selected year, all months)
  const monthlyTrendData = useMemo(() => {
    return MONTHS.map((name, i) => {
      const m = i + 1;
      const interest = loanRepayments.filter(r => { 
        const loan = loans.find(l => l.id === r.loanId);
        if (loan?.type !== 'SPECIAL') return false;
        const { month: rMonth, year: rYear } = getISODateMonthYear(r.date);
        return rYear === filterYear && rMonth === m; 
      }).reduce((s, r) => s + (r.interestPaid || 0), 0);

      const principal = loanRepayments.filter(r => { 
        const loan = loans.find(l => l.id === r.loanId);
        if (loan?.type !== 'SPECIAL') return false;
        const { month: rMonth, year: rYear } = getISODateMonthYear(r.date);
        return rYear === filterYear && rMonth === m; 
      }).reduce((s, r) => s + (r.principalPaid || 0), 0);
      
      const processingFee = loans
        .filter(l => {
          if (l.type !== 'SPECIAL') return false;
          const { month: lMonth, year: lYear } = getISODateMonthYear(l.startDate);
          return lYear === filterYear && lMonth === m;
        })
        .reduce((s, l) => s + (l.processingFee || 0), 0);
      
      const lateFee = loanRepayments.filter(r => { 
            const loan = loans.find(l => l.id === r.loanId);
            if (loan?.type !== 'SPECIAL') return false;
            const { month: rMonth, year: rYear } = getISODateMonthYear(r.date);
            return rYear === filterYear && rMonth === m; 
        }).reduce((s, r) => s + (r.lateFee || 0), 0);
      
      return {
        name: name.substring(0, 3),
        'Principal Recovery': principal,
        'Interest Income': interest,
        'Processing Fees': processingFee,
        'Late Fees': lateFee,
      };
    });
  }, [loanRepayments, loans, filterYear]);

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

    // 1. Processing Fees & Late Fees (Outgoing Interest Paid removed)
    filteredPayments.forEach(p => {
      const m = members.find(x => x.id === p.memberId);
      const category = p.category;
      const voucher = nextVoucher();

      if (category === PaymentCategory.JOINING_FEE) {
        rows.push([voucher, formatDisplayDate(p.date), m?.id || p.memberId, `"${m?.name || p.memberId}"`, `"${m?.name || p.memberId}"`, 'Receipt', '', p.amount, '"Joining Fee"']);
      }

      if (p.lateFee && p.lateFee > 0) {
        rows.push([nextVoucher(), formatDisplayDate(p.date), m?.id || p.memberId, `"${m?.name || p.memberId}"`, `"${m?.name || p.memberId}"`, 'Receipt', '', p.lateFee, '"Late Fee"']);
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
      const mp = filteredRepayments.filter(r => {
          const loan = loans.find(l => l.id === r.loanId);
          return loan?.memberId === m.id;
      });
      const totalInterest = mp.reduce((s, r) => s + (r.interestPaid || 0), 0);
      const totalLateFees = mp.reduce((s, r) => s + (r.lateFee || 0), 0);
      const txns = mp.length;
      const last = mp.length > 0 ? [...mp].sort((a, b) => compareISODate(b.date, a.date))[0].date : null;
      return { ...m, totalInterest, totalLateFees, txns, last };
    }).sort((a, b) => b.totalInterest - a.totalInterest);
  }, [members, filteredRepayments, loans]);

  const tabs = [
    { id: 'summary', label: 'Summary' },
    { id: 'loans', label: 'Loan/Interest' },
    { id: 'members', label: 'Members' },
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
            ['Month', 'Principal Recovery', 'Interest Income', 'Processing Fees', 'Late Fees', 'Total'],
            monthlyTrendData.map(d => [d.name, d['Principal Recovery'], d['Interest Income'], d['Processing Fees'], d['Late Fees'], d['Principal Recovery'] + d['Interest Income'] + d['Processing Fees'] + d['Late Fees']]),
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
          { label: 'Principal Recovered', value: summary.principalRecovered, color: 'blue', icon: TrendingUp },
          { label: 'Interest Income', value: summary.interestEarned, color: 'emerald', icon: TrendingUp },
          { label: 'Late Fees Collected', value: summary.loanLateFees, color: 'amber', icon: AlertTriangle },
          { label: 'Processing Fees', value: summary.processingFees, color: 'violet', icon: TrendingUp }
        ].map(card => (
          <div key={card.label} className={`bg-${card.color}-50 dark:bg-${card.color}-900/20 p-4 rounded-xl border border-${card.color}-100 dark:border-${card.color}-800`}>
            <p className={`text-xs font-semibold text-${card.color}-600 dark:text-${card.color}-400 uppercase mb-1`}>{card.label}</p>
            <p className={`text-xl font-bold text-${card.color}-900 dark:text-${card.color}-200`}>{formatCurrency(card.value, settings.currency)}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 flex justify-between items-center">
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase">Total Revenue (Interest + Fees)</p>
            <p className="text-3xl font-bold text-slate-900 dark:text-white">{formatCurrency(summary.totalRevenue, settings.currency)}</p>
          </div>
          <TrendingUp size={48} className="text-blue-400" />
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

      {/* Loans/Interest Tab */}
      {activeTab === 'loans' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Loan Repayments & Interest</h3>
            <button onClick={() => downloadCSV(
              ['Date', 'Member ID', 'Member Name', 'Loan Type', 'Principal Paid', 'Interest Paid', 'Late Fee', 'Total Paid', 'Payment Method'],
              filteredRepayments.map(r => {
                const loan = loans.find(l => l.id === r.loanId);
                const member = loan ? members.find(m => m.id === loan.memberId) : null;
                const totalPaid = (r.principalPaid || 0) + (r.interestPaid || 0) + (r.lateFee || 0);
                return [
                  formatDisplayDate(r.date), 
                  member?.id || '', 
                  `"${member?.name || ''}"`, 
                  'SPECIAL', 
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
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0">
                <tr>
                  {['Date', 'Member Name', 'Collected', 'Interest Paid', 'Principal Paid', 'Late Fee', 'Method'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredRepayments.map(r => {
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
                <tr className="bg-blue-50 dark:bg-blue-900/20 text-sm">
                  <td colSpan={2} className="px-4 py-4 text-blue-800 dark:text-blue-300 font-extrabold uppercase tracking-widest text-right">Totals</td>
                  <td className="px-4 py-4 text-slate-900 dark:text-white font-black text-base">{formatCurrency(filteredRepayments.reduce((s, r) => s + r.amount, 0), settings.currency)}</td>
                  <td className="px-4 py-4 text-emerald-700 dark:text-emerald-400 font-black text-base">{formatCurrency(filteredRepayments.reduce((s, r) => s + (r.interestPaid || 0), 0), settings.currency)}</td>
                  <td className="px-4 py-4 text-blue-700 dark:text-blue-400 font-black text-base">{formatCurrency(filteredRepayments.reduce((s, r) => s + (r.principalPaid || 0), 0), settings.currency)}</td>
                  <td className="px-4 py-4 text-amber-700 dark:text-amber-400 font-black text-base">{formatCurrency(filteredRepayments.reduce((s, r) => s + (r.lateFee || 0), 0), settings.currency)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Member Loan Summary</h3>
            <button onClick={() => downloadCSV(['ID', 'Name', 'Address', 'Status', 'Interest Paid', 'Late Fees', 'Transactions'],
              memberReports.map(m => [m.id, `"${m.name}"`, `"${m.address}"`, m.isActive ? 'Active' : 'Inactive', m.totalInterest, m.totalLateFees, m.txns]),
              'Member_Report')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600">
              <Download size={16} /> Export
            </button>
          </div>
          <div className="overflow-x-auto max-h-[600px]">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0">
                <tr>
                  {['ID', 'Member', 'Address', 'Status', 'Txns', 'Late Fees', 'Interest Paid'].map(h => (
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
                    <td className="px-4 py-3 font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(m.totalInterest, settings.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
