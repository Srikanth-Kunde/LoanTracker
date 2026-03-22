import React, { useMemo, useState } from 'react';
import { Download, ClipboardList } from 'lucide-react';
import { useMembers } from '../context/MemberContext';
import { useFinancials } from '../context/FinancialContext';
import { useSettings } from '../context/SettingsContext';
import { MONTHS, formatCurrency, getIndianFinancialYear } from '../constants';
import {
  compareISODate,
  formatDisplayDate,
  getFinancialYearBounds,
  getLastDayOfMonthISO,
  isISODateOnOrBefore
} from '../utils/date';

interface AuditRow {
  memberId: string;
  memberName: string;
  address: string;
  isActive: boolean;
  loanCount: number;
  originalLoanStartDate: string | null;
  originalLoanDisbursed: number;
  outstanding: number;
  topupsDisbursed: number;
  principalRecovered: number;
  interestCollected: number;
  lastActivity: string | null;
};

const escapeCsvValue = (value: string | number | null | undefined) => {
  const normalized = value == null ? '' : String(value);
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
};

const isDateWithinRange = (date: string, start: string, end: string) =>
  compareISODate(date, start) >= 0 && compareISODate(date, end) <= 0;

const AuditReport: React.FC = () => {
  const { members } = useMembers();
  const { loans, loanRepayments, loanTopups } = useFinancials();
  const { settings } = useSettings();

  const [filterFY, setFilterFY] = useState<string>('All');
  const [filterMonth, setFilterMonth] = useState<number>(0);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const allDates = useMemo(() => {
    return [
      ...loans.map(loan => loan.startDate),
      ...loanRepayments.map(repayment => repayment.date),
      ...loanTopups.map(topup => topup.date)
    ].filter(Boolean);
  }, [loanRepayments, loanTopups, loans]);

  const latestDataDate = useMemo(() => {
    if (allDates.length === 0) {
      return new Date().toISOString().split('T')[0];
    }
    return [...allDates].sort(compareISODate).at(-1)!;
  }, [allDates]);

  const availableFinancialYears = useMemo(() => {
    const years = new Set<string>(['All']);
    allDates.forEach(date => years.add(getIndianFinancialYear(date)));
    return Array.from(years).sort((a, b) => {
      if (a === 'All') return -1;
      if (b === 'All') return 1;
      return compareISODate(`${b.split('-')[0]}-04-01`, `${a.split('-')[0]}-04-01`);
    });
  }, [allDates]);

  const periodConfig = useMemo(() => {
    if (filterFY === 'All') {
      return {
        balanceEnd: latestDataDate,
        transactionStart: '1900-01-01',
        transactionEnd: latestDataDate,
        label: `All-time through ${formatDisplayDate(latestDataDate)}`
      };
    }

    const fyBounds = getFinancialYearBounds(filterFY);
    if (filterMonth === 0) {
      return {
        balanceEnd: fyBounds.end,
        transactionStart: fyBounds.start,
        transactionEnd: fyBounds.end,
        label: `${filterFY} (full financial year)`
      };
    }

    const [startYear] = filterFY.split('-').map(Number);
    const monthYear = filterMonth >= 4 ? startYear : startYear + 1;
    const transactionStart = `${monthYear}-${String(filterMonth).padStart(2, '0')}-01`;
    const transactionEnd = getLastDayOfMonthISO(monthYear, filterMonth);

    return {
      balanceEnd: transactionEnd,
      transactionStart,
      transactionEnd,
      label: `${MONTHS[filterMonth - 1]} ${monthYear}`
    };
  }, [filterFY, filterMonth, latestDataDate]);

  const filteredData = useMemo(() => {
    return members
      .filter(member => {
        const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? member.isActive : !member.isActive);
        const search = searchTerm.trim().toLowerCase();
        const matchesSearch = !search || member.name.toLowerCase().includes(search) || member.id.toLowerCase().includes(search);
        return matchesStatus && matchesSearch;
      })
      .map<AuditRow>(member => {
        const memberLoans = loans.filter(loan =>
          loan.memberId === member.id && loan.type === 'SPECIAL' && isISODateOnOrBefore(loan.startDate, periodConfig.balanceEnd)
        );
        const loanIds = new Set(memberLoans.map(loan => loan.id));
        const memberTopups = loanTopups.filter(t => loanIds.has(t.loanId) && isISODateOnOrBefore(t.date, periodConfig.balanceEnd));
        const memberRepayments = loanRepayments.filter(r => loanIds.has(r.loanId) && isISODateOnOrBefore(r.date, periodConfig.balanceEnd));

        const topupsDisbursed = memberTopups.reduce((s, t) => s + t.amount, 0);
        const principalRecovered = memberRepayments.reduce((s, r) => s + (r.principalPaid || 0), 0);
        const interestCollected = memberRepayments.reduce((s, r) => s + (r.interestPaid || 0), 0);
        const originalLoanDisbursed = memberLoans.reduce((s, l) => s + l.principalAmount, 0);
        const outstanding = Math.max(0, originalLoanDisbursed + topupsDisbursed - principalRecovered);
        const originalLoanStartDate = memberLoans
          .map(loan => loan.startDate)
          .sort(compareISODate)[0] || null;

        const lastActivity = [
          ...memberLoans.map(l => l.startDate),
          ...memberTopups.map(t => t.date),
          ...memberRepayments.map(r => r.date)
        ].sort(compareISODate).at(-1) || null;

        return {
          memberId: member.id,
          memberName: member.name,
          address: member.address,
          isActive: member.isActive,
          loanCount: memberLoans.length,
          originalLoanStartDate,
          originalLoanDisbursed,
          outstanding,
          topupsDisbursed,
          principalRecovered,
          interestCollected,
          lastActivity
        };
      })
      .filter(row => row.loanCount > 0 || row.outstanding > 0 || row.principalRecovered > 0 || row.interestCollected > 0)
      .sort((a, b) => b.outstanding - a.outstanding || a.memberName.localeCompare(b.memberName));
  }, [loanRepayments, loanTopups, loans, members, periodConfig.balanceEnd, searchTerm, statusFilter]);

  const tallyTransactions = useMemo(() => {
    const txs: { date: string; values: (string | number)[] }[] = [];
    const visibleMemberIds = new Set(filteredData.map(r => r.memberId));

    loans
      .filter(l => visibleMemberIds.has(l.memberId) && l.type === 'SPECIAL' && isDateWithinRange(l.startDate, periodConfig.transactionStart, periodConfig.transactionEnd))
      .forEach(l => {
        const m = members.find(mem => mem.id === l.memberId);
        txs.push({ date: l.startDate, values: ['', formatDisplayDate(l.startDate), m?.id || l.memberId, m?.name || l.memberId, m?.name || l.memberId, 'Payment', l.principalAmount, '', 'Special Loan Disbursal'] });
        if ((l.processingFee || 0) > 0) {
          txs.push({ date: l.startDate, values: ['', formatDisplayDate(l.startDate), m?.id || l.memberId, m?.name || l.memberId, m?.name || l.memberId, 'Receipt', '', l.processingFee || 0, 'Loan Processing Fee'] });
        }
      });

    loanTopups
      .filter(t => {
        const l = loans.find(ln => ln.id === t.loanId);
        return l && visibleMemberIds.has(l.memberId) && isDateWithinRange(t.date, periodConfig.transactionStart, periodConfig.transactionEnd);
      })
      .forEach(t => {
        const l = loans.find(ln => ln.id === t.loanId)!;
        const m = members.find(mem => mem.id === l.memberId);
        txs.push({ date: t.date, values: ['', formatDisplayDate(t.date), m?.id || l.memberId, m?.name || l.memberId, m?.name || l.memberId, 'Payment', t.amount, '', 'Special Loan Top-up'] });
      });

    loanRepayments
      .filter(r => {
        const l = loans.find(ln => ln.id === r.loanId);
        return l && visibleMemberIds.has(l.memberId) && l.type === 'SPECIAL' && isDateWithinRange(r.date, periodConfig.transactionStart, periodConfig.transactionEnd);
      })
      .forEach(r => {
        const l = loans.find(ln => ln.id === r.loanId)!;
        const m = members.find(mem => mem.id === l.memberId);
        if ((r.principalPaid || 0) > 0) txs.push({ date: r.date, values: ['', formatDisplayDate(r.date), m?.id || l.memberId, m?.name || l.memberId, m?.name || l.memberId, 'Receipt', '', r.principalPaid || 0, 'Special Loan Principal Recovery'] });
        if ((r.interestPaid || 0) > 0) txs.push({ date: r.date, values: ['', formatDisplayDate(r.date), m?.id || l.memberId, m?.name || l.memberId, m?.name || l.memberId, 'Receipt', '', r.interestPaid || 0, 'Special Loan Interest'] });
        if ((r.lateFee || 0) > 0) txs.push({ date: r.date, values: ['', formatDisplayDate(r.date), m?.id || l.memberId, m?.name || l.memberId, m?.name || l.memberId, 'Receipt', '', r.lateFee || 0, 'Manual Late Fee'] });
      });

    const sorted = txs.sort((a, b) => compareISODate(a.date, b.date));
    let counter = 1;
    return sorted.map(tx => {
      tx.values[0] = `AUD-${String(counter++).padStart(5, '0')}`;
      return tx.values;
    });
  }, [loans, loanRepayments, loanTopups, filteredData, periodConfig, members]);

  const totals = useMemo(() => {
    return filteredData.reduce((acc, row) => ({
      loanCount: acc.loanCount + row.loanCount,
      originalLoanDisbursed: acc.originalLoanDisbursed + row.originalLoanDisbursed,
      outstanding: acc.outstanding + row.outstanding,
      topupsDisbursed: acc.topupsDisbursed + row.topupsDisbursed,
      principalRecovered: acc.principalRecovered + row.principalRecovered,
      interestCollected: acc.interestCollected + row.interestCollected
    }), {
      loanCount: 0,
      originalLoanDisbursed: 0,
      outstanding: 0,
      topupsDisbursed: 0,
      principalRecovered: 0,
      interestCollected: 0
    });
  }, [filteredData]);

  const downloadCsv = (headers: string[], rows: (string | number)[][], filename: string) => {
    const csv = [headers.map(escapeCsvValue).join(','), ...rows.map(row => row.map(escapeCsvValue).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleAuditCsvExport = () => {
    downloadCsv(
      ['Balance As Of', 'Member ID', 'Member Name', 'Status', 'Loan Count', 'Original Loan Disbursed', 'Outstanding Principal', 'Top-ups Disbursed', 'Principal Recovered', 'Interest Collected', 'Last Activity'],
      filteredData.map(row => [periodConfig.balanceEnd, row.memberId, row.memberName, row.isActive ? 'Active' : 'Inactive', row.loanCount, row.originalLoanDisbursed, row.outstanding, row.topupsDisbursed, row.principalRecovered, row.interestCollected, row.lastActivity ? formatDisplayDate(row.lastActivity) : '']),
      `Audit_Report_${filterFY}${filterMonth ? `_${filterMonth}` : ''}.csv`
    );
  };

  const handleTallyExport = () => {
    downloadCsv(['Voucher No', 'Date', 'Member ID', 'Member Name', 'Ledger', 'Voucher Type', 'Debit', 'Credit', 'Narration'], tallyTransactions, `Audit_Tally_${filterFY}${filterMonth ? `_${filterMonth}` : ''}.csv`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Audit Report</h1>
          <p className="text-slate-500 dark:text-slate-400">Historical special-loan balances and transaction exports for {periodConfig.label}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleTallyExport} className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium"><Download size={16} className="mr-2" /> Audit Tally CSV</button>
          <button onClick={handleAuditCsvExport} className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-medium"><ClipboardList size={16} className="mr-2" /> Full Audit CSV</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
        <select value={filterFY} onChange={e => { setFilterFY(e.target.value); if (e.target.value === 'All') setFilterMonth(0); }} className="px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200">
          {availableFinancialYears.map(year => <option key={year} value={year}>{year}</option>)}
        </select>
        <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))} disabled={filterFY === 'All'} className="px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-50">
          <option value={0}>Full Period</option>
          {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')} className="px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200">
          <option value="ALL">All Members</option>
          <option value="ACTIVE">Active Members</option>
          <option value="INACTIVE">Inactive Members</option>
        </select>
        <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search name or ID" className="px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200" />
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-500 uppercase">Original Loan Disbursed</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(totals.originalLoanDisbursed, settings.currency)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-500 uppercase">Outstanding</p>
          <p className="text-xl font-bold text-violet-700 dark:text-violet-300">{formatCurrency(totals.outstanding, settings.currency)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-500 uppercase">Top-ups</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(totals.topupsDisbursed, settings.currency)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-500 uppercase">Principal Recovered</p>
          <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{formatCurrency(totals.principalRecovered, settings.currency)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-500 uppercase">Interest Collected</p>
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(totals.interestCollected, settings.currency)}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700"><h3 className="text-lg font-semibold text-slate-800 dark:text-white">Member Loan Balances</h3></div>
        <div className="overflow-x-auto max-h-[600px]">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0">
              <tr>{['ID', 'Member', 'Original Start Date', 'Original Disb.', 'Outstanding', 'Top-ups', 'Principal Rec.', 'Interest Col.', 'Last Activity'].map(header => <th key={header} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{header}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredData.map(row => (
                <tr key={row.memberId} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3 text-xs font-mono text-slate-400">{row.memberId}</td>
                  <td className="px-4 py-3"><div className="font-medium text-slate-900 dark:text-white">{row.memberName}</div><div className="text-xs text-slate-500 dark:text-slate-400">{row.address}</div></td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{row.originalLoanStartDate ? formatDisplayDate(row.originalLoanStartDate) : '-'}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatCurrency(row.originalLoanDisbursed, settings.currency)}</td>
                  <td className="px-4 py-3 font-semibold text-violet-700 dark:text-violet-300">{formatCurrency(row.outstanding, settings.currency)}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatCurrency(row.topupsDisbursed, settings.currency)}</td>
                  <td className="px-4 py-3 text-blue-700 dark:text-blue-300">{formatCurrency(row.principalRecovered, settings.currency)}</td>
                  <td className="px-4 py-3 text-emerald-700 dark:text-emerald-300">{formatCurrency(row.interestCollected, settings.currency)}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{row.lastActivity ? formatDisplayDate(row.lastActivity) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default AuditReport;
