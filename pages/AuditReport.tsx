import React, { useMemo, useState } from 'react';
import { Download, ClipboardList } from 'lucide-react';
import { useMembers } from '../context/MemberContext';
import { useFinancials } from '../context/FinancialContext';
import { useSettings } from '../context/SettingsContext';
import { FISCAL_YEARS, MONTHS, formatCurrency } from '../constants';
import { PaymentCategory } from '../types';
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
  legacySavings: number;
  currentSavings: number;
  totalSavings: number;
  specialLoanBalance: number;
  netPosition: number;
}

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
  const { payments, loans, loanRepayments, loanTopups } = useFinancials();
  const { settings } = useSettings();

  const [filterFY, setFilterFY] = useState<string>('2026-2027');
  const [filterMonth, setFilterMonth] = useState<number>(0);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const latestDataDate = useMemo(() => {
    const dates = [
      ...payments.map(payment => payment.date),
      ...loans.map(loan => loan.startDate),
      ...loanRepayments.map(repayment => repayment.date),
      ...loanTopups.map(topup => topup.date)
    ].filter(Boolean);

    if (dates.length === 0) {
      return new Date().toISOString().split('T')[0];
    }

    return [...dates].sort(compareISODate).at(-1)!;
  }, [loanRepayments, loanTopups, loans, payments]);

  const periodConfig = useMemo(() => {
    if (filterFY === 'All') {
      return {
        balanceEnd: latestDataDate,
        transactionStart: '1900-01-01',
        transactionEnd: latestDataDate,
        label: `All-time through ${formatDisplayDate(latestDataDate)}`
      };
    }

    if (filterFY === 'PRE-2026') {
      const cappedMonth = filterMonth >= 1 && filterMonth <= 3 ? filterMonth : 3;
      const balanceEnd = filterMonth === 0 ? '2026-03-31' : getLastDayOfMonthISO(2026, cappedMonth);
      return {
        balanceEnd,
        transactionStart: filterMonth === 0 ? '1900-01-01' : `2026-${String(cappedMonth).padStart(2, '0')}-01`,
        transactionEnd: balanceEnd,
        label: filterMonth === 0
          ? 'Legacy balances through 31/03/2026'
          : `Legacy balances through ${formatDisplayDate(balanceEnd)}`
      };
    }

    const fyBounds = getFinancialYearBounds(filterFY);
    if (filterMonth === 0) {
      return {
        balanceEnd: fyBounds.end,
        transactionStart: fyBounds.start,
        transactionEnd: fyBounds.end,
        label: `${filterFY} (as of ${formatDisplayDate(fyBounds.end)})`
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
      label: `${MONTHS[filterMonth - 1]} ${monthYear} (as of ${formatDisplayDate(transactionEnd)})`
    };
  }, [filterFY, filterMonth, latestDataDate]);

  const filteredData = useMemo(() => {
    return members
      .filter(member => {
        const matchesStatus = statusFilter === 'ALL'
          ? true
          : statusFilter === 'ACTIVE'
            ? member.isActive
            : !member.isActive;

        const search = searchTerm.trim().toLowerCase();
        const matchesSearch = !search
          || member.name.toLowerCase().includes(search)
          || member.id.toLowerCase().includes(search);

        return matchesStatus && matchesSearch;
      })
      .map<AuditRow>(member => {
        const memberPayments = payments.filter(payment =>
          payment.memberId === member.id && isISODateOnOrBefore(payment.date, periodConfig.balanceEnd)
        );

        const legacySavings = memberPayments
          .filter(payment => payment.isLegacy || payment.financialYear === 'PRE-2026')
          .reduce((sum, payment) => sum + payment.amount, 0);

        const currentSavings = memberPayments
          .filter(payment =>
            !(payment.isLegacy || payment.financialYear === 'PRE-2026')
            && (payment.category || PaymentCategory.SAVINGS) === PaymentCategory.SAVINGS
          )
          .reduce((sum, payment) => sum + payment.amount, 0);

        let specialLoanBalance = 0;

        loans
          .filter(loan =>
            loan.memberId === member.id
            && loan.type === 'SPECIAL'
            && isISODateOnOrBefore(loan.startDate, periodConfig.balanceEnd)
          )
          .forEach(loan => {
            const principalRepaid = loanRepayments
              .filter(repayment =>
                repayment.loanId === loan.id
                && isISODateOnOrBefore(repayment.date, periodConfig.balanceEnd)
              )
              .reduce((sum, repayment) => sum + (repayment.principalPaid || 0), 0);

            const topupTotal = loanTopups
              .filter(topup =>
                topup.loanId === loan.id
                && isISODateOnOrBefore(topup.date, periodConfig.balanceEnd)
              )
              .reduce((sum, topup) => sum + topup.amount, 0);

            const outstanding = Math.max(0, loan.principalAmount + topupTotal - principalRepaid);
            specialLoanBalance += outstanding;
          });

        const totalSavings = legacySavings + currentSavings;
        const netPosition = totalSavings - specialLoanBalance;

        return {
          memberId: member.id,
          memberName: member.name,
          address: member.address,
          isActive: member.isActive,
          legacySavings,
          currentSavings,
          totalSavings,
          specialLoanBalance,
          netPosition
        };
      })
      .sort((a, b) => a.memberName.localeCompare(b.memberName));
  }, [loanRepayments, loanTopups, loans, members, payments, periodConfig.balanceEnd, searchTerm, statusFilter]);

  const totals = useMemo(() => {
    return filteredData.reduce((acc, row) => ({
      legacySavings: acc.legacySavings + row.legacySavings,
      currentSavings: acc.currentSavings + row.currentSavings,
      totalSavings: acc.totalSavings + row.totalSavings,
      specialLoanBalance: acc.specialLoanBalance + row.specialLoanBalance,
      netPosition: acc.netPosition + row.netPosition
    }), {
      legacySavings: 0,
      currentSavings: 0,
      totalSavings: 0,
      specialLoanBalance: 0,
      netPosition: 0
    });
  }, [filteredData]);

  const downloadCsv = (headers: string[], rows: (string | number)[][], filename: string) => {
    const csv = [
      headers.map(escapeCsvValue).join(','),
      ...rows.map(row => row.map(escapeCsvValue).join(','))
    ].join('\n');

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
    const rows: (string | number)[][] = [
      ...filteredData.map(row => [
        'Member Summary',
        periodConfig.balanceEnd,
        row.memberId,
        row.memberName,
        row.isActive ? 'Active' : 'Inactive',
        row.legacySavings,
        row.currentSavings,
        row.totalSavings,
        row.specialLoanBalance,
        row.netPosition
      ])
    ];

    downloadCsv(
      [
        'Section',
        'Balance As Of',
        'Member ID',
        'Member Name',
        'Status',
        'Legacy Savings',
        'Current Savings',
        'Total Savings',
        'Special Loan Balance',
        'Net Position'
      ],
      rows,
      `Audit_Report_${filterFY}${filterMonth ? `_${String(filterMonth).padStart(2, '0')}` : ''}.csv`
    );
  };

  const handleTallyExport = () => {
    const rows: { date: string; values: (string | number)[] }[] = [];
    let voucherCounter = 1;
    const nextVoucher = () => `AUD-${String(voucherCounter++).padStart(5, '0')}`;

    payments
      .filter(payment => isDateWithinRange(payment.date, periodConfig.transactionStart, periodConfig.transactionEnd))
      .sort((a, b) => compareISODate(a.date, b.date))
      .forEach(payment => {
        const member = members.find(entry => entry.id === payment.memberId);
        const category = payment.category || PaymentCategory.SAVINGS;
        const baseNarration = category === PaymentCategory.JOINING_FEE
          ? 'Joining Fee'
          : category === PaymentCategory.ANNUAL_MEMBER_INTEREST
            ? 'Annual Member Interest Payout'
            : `Savings Collection - ${MONTHS[payment.month - 1]} ${payment.year}`;

        if (category === PaymentCategory.ANNUAL_MEMBER_INTEREST) {
          rows.push({
            date: payment.date,
            values: [
              nextVoucher(),
              formatDisplayDate(payment.date),
              member?.id || payment.memberId,
              member?.name || payment.memberId,
              member?.name || payment.memberId,
              'Payment',
              payment.amount,
              '',
              baseNarration
            ]
          });
        } else {
          rows.push({
            date: payment.date,
            values: [
              nextVoucher(),
              formatDisplayDate(payment.date),
              member?.id || payment.memberId,
              member?.name || payment.memberId,
              member?.name || payment.memberId,
              'Receipt',
              '',
              payment.amount,
              baseNarration
            ]
          });
        }

        if ((payment.lateFee || 0) > 0) {
          rows.push({
            date: payment.date,
            values: [
              nextVoucher(),
              formatDisplayDate(payment.date),
              member?.id || payment.memberId,
              member?.name || payment.memberId,
              member?.name || payment.memberId,
              'Receipt',
              '',
              payment.lateFee || 0,
              'Savings Late Fee'
            ]
          });
        }
      });

    loans
      .filter(loan => loan.type === 'SPECIAL' && isDateWithinRange(loan.startDate, periodConfig.transactionStart, periodConfig.transactionEnd))
      .sort((a, b) => compareISODate(a.startDate, b.startDate))
      .forEach(loan => {
        const member = members.find(entry => entry.id === loan.memberId);
        const loanType = loan.type || 'REGULAR';

        rows.push({
          date: loan.startDate,
          values: [
            nextVoucher(),
            formatDisplayDate(loan.startDate),
            member?.id || loan.memberId,
            member?.name || loan.memberId,
            member?.name || loan.memberId,
            'Payment',
            loan.principalAmount,
            '',
            `Loan Disbursal - ${loanType}`
          ]
        });

        if ((loan.processingFee || 0) > 0) {
          rows.push({
            date: loan.startDate,
            values: [
              nextVoucher(),
              formatDisplayDate(loan.startDate),
              member?.id || loan.memberId,
              member?.name || loan.memberId,
              member?.name || loan.memberId,
              'Receipt',
              '',
              loan.processingFee || 0,
              `Loan Processing Fee - ${loanType}`
            ]
          });
        }
      });

    loanTopups
      .filter(topup => isDateWithinRange(topup.date, periodConfig.transactionStart, periodConfig.transactionEnd))
      .sort((a, b) => compareISODate(a.date, b.date))
      .forEach(topup => {
        const loan = loans.find(entry => entry.id === topup.loanId);
        const member = loan ? members.find(entry => entry.id === loan.memberId) : null;

        rows.push({
          date: topup.date,
          values: [
            nextVoucher(),
            formatDisplayDate(topup.date),
            member?.id || (loan?.memberId || topup.loanId),
            member?.name || (loan?.memberId || topup.loanId),
            member?.name || (loan?.memberId || topup.loanId),
            'Payment',
            topup.amount,
            '',
            'Special Loan Top-up'
          ]
        });
      });

    loanRepayments
      .filter(repayment => {
        const loan = loans.find(entry => entry.id === repayment.loanId);
        return loan?.type === 'SPECIAL' && isDateWithinRange(repayment.date, periodConfig.transactionStart, periodConfig.transactionEnd);
      })
      .sort((a, b) => compareISODate(a.date, b.date))
      .forEach(repayment => {
        const loan = loans.find(entry => entry.id === repayment.loanId);
        const member = loan ? members.find(entry => entry.id === loan.memberId) : null;
        const loanType = loan?.type || 'REGULAR';

        if ((repayment.principalPaid || 0) > 0) {
          rows.push({
            date: repayment.date,
            values: [
              nextVoucher(),
              formatDisplayDate(repayment.date),
              member?.id || (loan?.memberId || repayment.loanId),
              member?.name || (loan?.memberId || repayment.loanId),
              member?.name || (loan?.memberId || repayment.loanId),
              'Receipt',
              '',
              repayment.principalPaid || 0,
              `Loan Principal Recovery - ${loanType}`
            ]
          });
        }

        if ((repayment.interestPaid || 0) > 0) {
          rows.push({
            date: repayment.date,
            values: [
              nextVoucher(),
              formatDisplayDate(repayment.date),
              member?.id || (loan?.memberId || repayment.loanId),
              member?.name || (loan?.memberId || repayment.loanId),
              member?.name || (loan?.memberId || repayment.loanId),
              'Receipt',
              '',
              repayment.interestPaid || 0,
              `Loan Interest Income - ${loanType}`
            ]
          });
        }

        if ((repayment.lateFee || 0) > 0) {
          rows.push({
            date: repayment.date,
            values: [
              nextVoucher(),
              formatDisplayDate(repayment.date),
              member?.id || (loan?.memberId || repayment.loanId),
              member?.name || (loan?.memberId || repayment.loanId),
              member?.name || (loan?.memberId || repayment.loanId),
              'Receipt',
              '',
              repayment.lateFee || 0,
              `Loan Late Fee - ${loanType}`
            ]
          });
        }
      });

    if (filterFY === 'All' || filterFY === 'PRE-2026') {
      filteredData.forEach(row => {
        if (row.legacySavings > 0) {
          rows.push({
            date: '2026-03-31',
            values: [
              nextVoucher(),
              formatDisplayDate('2026-03-31'),
              row.memberId,
              row.memberName,
              row.memberName,
              'Receipt',
              '',
              row.legacySavings,
              'Legacy Opening Savings'
            ]
          });
        }
      });
    }

    filteredData.forEach(row => {
      if (row.specialLoanBalance > 0) {
        rows.push({
          date: periodConfig.balanceEnd,
          values: [
            nextVoucher(),
            formatDisplayDate(periodConfig.balanceEnd),
            row.memberId,
            row.memberName,
            row.memberName,
            'Payment',
            row.specialLoanBalance,
            '',
            `Special Loan Outstanding as of ${formatDisplayDate(periodConfig.balanceEnd)}`
          ]
        });
      }
    });

    downloadCsv(
      ['Voucher No', 'Date', 'Member ID', 'Member Name', 'Ledger', 'Voucher Type', 'Debit', 'Credit', 'Narration'],
      rows.sort((a, b) => compareISODate(a.date, b.date)).map(row => row.values),
      `Audit_Tally_${filterFY}${filterMonth ? `_${String(filterMonth).padStart(2, '0')}` : ''}.csv`
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Audit Report</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Period-faithful member balances and CA-ready exports for {periodConfig.label}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleTallyExport}
            className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium"
          >
            <Download size={16} className="mr-2" /> Audit Tally CSV
          </button>
          <button
            onClick={handleAuditCsvExport}
            className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-medium"
          >
            <ClipboardList size={16} className="mr-2" /> Full Audit CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
        <select
          value={filterFY}
          onChange={e => setFilterFY(e.target.value)}
          className="px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
        >
          {FISCAL_YEARS.map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
        <select
          value={filterMonth}
          onChange={e => setFilterMonth(Number(e.target.value))}
          className="px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
        >
          <option value={0}>Full Period</option>
          {MONTHS.map((month, index) => (
            <option key={month} value={index + 1}>{month}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
          className="px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
        >
          <option value="ALL">All Members</option>
          <option value="ACTIVE">Active Members</option>
          <option value="INACTIVE">Inactive Members</option>
        </select>
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search name or ID"
          className="px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
        />
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl p-4">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Member balances are calculated as of <strong>{formatDisplayDate(periodConfig.balanceEnd)}</strong>.
          Transaction exports use actual in-period dates from {formatDisplayDate(periodConfig.transactionStart)} to {formatDisplayDate(periodConfig.transactionEnd)}.
        </p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-500 uppercase">Total Savings</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(totals.totalSavings, settings.currency)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-500 uppercase">Special Outstanding</p>
          <p className="text-xl font-bold text-violet-700 dark:text-violet-300">{formatCurrency(totals.specialLoanBalance, settings.currency)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-500 uppercase">Net Position</p>
          <p className={`text-xl font-bold ${totals.netPosition >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
            {formatCurrency(totals.netPosition, settings.currency)}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Member Balances</h3>
        </div>
        <div className="overflow-x-auto max-h-[600px]">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0">
              <tr>
                {['ID', 'Member', 'Status', 'Legacy Savings', 'Current Savings', 'Total Savings', 'Special Loan', 'Net Position'].map(header => (
                  <th key={header} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredData.map(row => (
                <tr key={row.memberId} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3 text-xs font-mono text-slate-500">{row.memberId}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-white">{row.memberName}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{row.address || '-'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${row.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                      {row.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{formatCurrency(row.legacySavings, settings.currency)}</td>
                  <td className="px-4 py-3 text-blue-700 dark:text-blue-300">{formatCurrency(row.currentSavings, settings.currency)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{formatCurrency(row.totalSavings, settings.currency)}</td>
                  <td className="px-4 py-3 text-violet-700 dark:text-violet-300">{formatCurrency(row.specialLoanBalance, settings.currency)}</td>
                  <td className={`px-4 py-3 font-semibold ${row.netPosition >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                    {formatCurrency(row.netPosition, settings.currency)}
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">No members match the selected filters.</td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-slate-50 dark:bg-slate-900/50 font-bold border-t border-slate-200 dark:border-slate-700">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-slate-700 dark:text-slate-200">TOTALS</td>
                <td className="px-4 py-3">{formatCurrency(totals.legacySavings, settings.currency)}</td>
                <td className="px-4 py-3">{formatCurrency(totals.currentSavings, settings.currency)}</td>
                <td className="px-4 py-3">{formatCurrency(totals.totalSavings, settings.currency)}</td>
                <td className="px-4 py-3">{formatCurrency(totals.specialLoanBalance, settings.currency)}</td>
                <td className="px-4 py-3">{formatCurrency(totals.netPosition, settings.currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AuditReport;
