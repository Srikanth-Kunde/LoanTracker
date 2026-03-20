
import React, { useMemo, useState } from 'react';
import { useMembers } from '../context/MemberContext';
import { useFinancials } from '../context/FinancialContext';
import { useSettings } from '../context/SettingsContext';
import { Users, IndianRupee, AlertCircle, CheckCircle2, History, CalendarClock, TrendingUp, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MONTHS, formatCurrency } from '../constants';
import { getISODateMonthYear } from '../utils/date';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subtext?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, color, subtext }) => (
  <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 transition-colors duration-200">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{value}</p>
      </div>
      <div className={`p-3 rounded-full ${color}`}>
        <Icon size={24} className="text-white" />
      </div>
    </div>
    {subtext && <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">{subtext}</p>}
  </div>
);

const Dashboard: React.FC = () => {
  const { members } = useMembers();
  const { payments, loans, loanRepayments, loanTopups, getSpecialLoanOutstanding } = useFinancials();
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState<'overview' | 'past_dues'>('overview');

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const stats = useMemo(() => {
    const totalMembers = members.length;
    const activeMembers = members.filter(m => m.isActive).length;
    const inactiveMembers = totalMembers - activeMembers;

    const thisMonthRepayments = loanRepayments.filter(r => {
      const { month, year } = getISODateMonthYear(r.date);
      return month === currentMonth && year === currentYear;
    });

    const activeSpecialLoans = loans.filter(l => l.status === 'ACTIVE' && l.type === 'SPECIAL');
    const totalDisbursed = activeSpecialLoans.reduce((sum, l) => {
        const topups = loanTopups.filter(t => t.loanId === l.id).reduce((s, t) => s + t.amount, 0);
        return sum + l.principalAmount + topups;
    }, 0);

    const specialOutstanding = activeSpecialLoans.reduce((s, l) => s + getSpecialLoanOutstanding(l.id), 0);
    const totalInterestCollected = loanRepayments.reduce((sum, r) => sum + (r.interestPaid || 0), 0);
    const thisMonthInterest = thisMonthRepayments.reduce((sum, r) => sum + (r.interestPaid || 0), 0);
    const thisMonthPrincipal = thisMonthRepayments.reduce((sum, r) => sum + (r.principalPaid || 0), 0);

    return {
      totalMembers,
      activeMembers,
      totalDisbursed,
      specialOutstanding,
      totalInterestCollected,
      thisMonthInterest,
      thisMonthPrincipal,
      totalLoansActive: activeSpecialLoans.length,
      thisMonthTotalCollected: thisMonthInterest + thisMonthPrincipal + thisMonthRepayments.reduce((s, r) => s + (r.lateFee || 0), 0)
    };
  }, [members, payments, loans, loanRepayments, loanTopups, getSpecialLoanOutstanding, settings, currentMonth, currentYear]);

  const chartData = useMemo(() => {
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();

      const total = loanRepayments
        .filter(r => {
            const { month, year } = getISODateMonthYear(r.date);
            return month === m && year === y;
        })
        .reduce((sum, r) => sum + r.amount + (r.lateFee || 0), 0);

      data.push({
        name: MONTHS[m - 1].substring(0, 3),
        amount: total
      });
    }
    return data;
  }, [loanRepayments]);

  // Logic for Past Dues Collected This Month
  const pastDuesCollected = useMemo(() => {
    return payments.filter(p => {
      const [collYear, collMonth] = p.date.split('-').map(Number);
      // Collected in current calendar month
      const isCollectedThisMonth = collMonth === currentMonth && collYear === currentYear;
      // For a period strictly before current calendar month
      const isForPastPeriod = p.year < currentYear || (p.year === currentYear && p.month < currentMonth);

      return isCollectedThisMonth && isForPastPeriod;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [payments, currentMonth, currentYear]);

  const totalPastDuesCollected = pastDuesCollected.reduce((sum, p) => sum + p.amount + (p.lateFee || 0), 0);

  // Annual Summary Calculations
  const annualSummary = useMemo(() => {
    const summary = new Map<number, number>();
    let grandTotal = 0;

    loanRepayments.forEach(r => {
      const { year } = getISODateMonthYear(r.date);
      const total = r.amount + (r.lateFee || 0);
      summary.set(year, (summary.get(year) || 0) + total);
      grandTotal += total;
    });

    const years = Array.from(summary.keys()).sort((a, b) => b - a);
    return {
      years: years.map(year => ({ year, total: summary.get(year) || 0 })),
      grandTotal
    };
  }, [loanRepayments]);

  return (
    <div className="space-y-6 pb-8">
      {/* Banner Section */}
      <div className="relative w-full h-40 sm:h-52 rounded-2xl overflow-hidden shadow-md group">
        {/* Background Image */}
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
          style={{
            backgroundImage: `url('${settings.bannerImage || "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?ixlib=rb-1.2.1&auto=format&fit=crop&w=1200&q=80"}')`
          }}
        />
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

        {/* Content */}
        <div className="absolute bottom-0 left-0 p-6 sm:p-8 w-full text-white">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-2 drop-shadow-md">{settings.societyName}</h1>
          <div className="flex items-center text-white/90 space-x-4">
            <span className="flex items-center text-sm font-medium bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm border border-white/10">
              <Calendar size={14} className="mr-2" />
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-8">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center">
          <TrendingUp size={20} className="mr-2 text-primary-600" />
          Monthly Overview
        </h2>

        <div className="flex bg-white dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 sm:flex-none px-6 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${activeTab === 'overview'
              ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 shadow-sm ring-1 ring-primary-200 dark:ring-primary-800'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('past_dues')}
            className={`flex-1 sm:flex-none px-6 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${activeTab === 'past_dues'
              ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 shadow-sm ring-1 ring-primary-200 dark:ring-primary-800'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
          >
            Past Dues Collected
          </button>
        </div>
      </div>

      {activeTab === 'overview' ? (
        <>
          {/* Loan Portfolio Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex flex-col">
              <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Active Loans</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-white">{stats.totalLoansActive}</p>
              <p className="text-xs text-slate-400 mt-1">Special Loans</p>
            </div>
            <div className="flex flex-col">
              <p className="text-xs font-semibold text-amber-500 uppercase mb-1">Special Outstanding</p>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{formatCurrency(stats.specialOutstanding, settings.currency)}</p>
            </div>
          </div>

          {/* Top Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              title="Active Members"
              value={stats.activeMembers}
              icon={Users}
              color="bg-primary-500"
              subtext={`${stats.totalMembers} Total · ${stats.inactiveMembers} Inactive`}
            />
            <StatCard
              title="Total Disbursed"
              value={formatCurrency(stats.totalDisbursed, settings.currency)}
              icon={TrendingUp}
              color="bg-indigo-500"
              subtext="Principal + Top-ups"
            />
            <StatCard
              title="Interest Collected"
              value={formatCurrency(stats.totalInterestCollected, settings.currency)}
              icon={IndianRupee}
              color="bg-emerald-500"
              subtext="Lifetime Interest"
            />
            <StatCard
              title="This Month Revenue"
              value={formatCurrency(stats.thisMonthTotalCollected, settings.currency)}
              icon={CheckCircle2}
              color="bg-primary-600"
              subtext={`₹${stats.thisMonthInterest} Int · ₹${stats.thisMonthPrincipal} Prin`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-6">Collection Trends (6 Months)</h3>
              <div className="w-full min-w-0">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-700" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8' }} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `₹${value}`} tick={{ fill: '#94a3b8' }} />
                    <Tooltip
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{
                        borderRadius: '8px',
                        border: 'none',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        backgroundColor: '#fff',
                        color: '#1e293b'
                      }}
                    />
                    <Bar dataKey="amount" fill="rgb(var(--color-primary-500))" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Recent Activity</h3>
              <div className="space-y-4 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar">
                {loanRepayments.slice(-8).reverse().map(repayment => {
                  const loan = loans.find(l => l.id === repayment.loanId);
                  const member = members.find(m => m.id === loan?.memberId);
                  return (
                    <div key={repayment.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-750 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                          <IndianRupee size={14} className="text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{member?.name || 'Unknown'}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{new Date(repayment.date).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="block text-sm font-semibold text-green-600 dark:text-green-400">+{settings.currency}{repayment.amount}</span>
                        <span className="block text-[10px] text-slate-500 dark:text-slate-400">Repayment</span>
                      </div>
                    </div>
                  );
                })}
                {loanRepayments.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-4">No recent repayments</p>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Recovered Past Dues (This Month)</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{formatCurrency(totalPastDuesCollected, settings.currency)}</p>
                <p className="text-sm text-slate-400 mt-1">collected in {MONTHS[currentMonth - 1]}</p>
              </div>
              <div className="p-3 rounded-full bg-indigo-500">
                <History size={24} className="text-white" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center">
              <CalendarClock size={20} className="text-slate-500 dark:text-slate-400 mr-2" />
              <h3 className="font-semibold text-slate-800 dark:text-white">Past Dues Recovered Details</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                <thead className="bg-slate-50 dark:bg-slate-900/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Date Collected</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Member</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Paid For</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Fee</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Late Fee</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                  {pastDuesCollected.map(p => {
                    const member = members.find(m => m.id === p.memberId);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-750">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                          {new Date(p.date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-slate-900 dark:text-white">{member?.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-500">ID: {member?.id}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300 font-medium">
                          {MONTHS[p.month - 1]} {p.year}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-slate-600 dark:text-slate-400">
                          {settings.currency}{p.amount}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-amber-600 dark:text-amber-500">
                          {p.lateFee ? `+ ${settings.currency}${p.lateFee}` : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-primary-600 dark:text-primary-400">
                          {settings.currency}{p.amount + (p.lateFee || 0)}
                        </td>
                      </tr>
                    );
                  })}
                  {pastDuesCollected.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400 dark:text-slate-600">
                        <History size={32} className="mx-auto mb-2 opacity-20" />
                        <p>No past dues collected in {MONTHS[currentMonth - 1]}</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Annual Summary & Total Savings Section - Bottom */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center">
          <CheckCircle2 size={20} className="mr-2 text-indigo-600" />
          Financial Summary & Portfolio
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Total Revenue Card */}
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 text-white p-8 rounded-2xl shadow-lg flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <CheckCircle2 size={120} />
            </div>
            <div>
              <p className="text-indigo-100 font-medium mb-1">Total Lifetime Collection</p>
              <h3 className="text-4xl font-bold">{formatCurrency(annualSummary.grandTotal, settings.currency)}</h3>
              <p className="text-xs text-indigo-200 mt-4 opacity-80">
                Accumulated repayments (Interest + Principal) and late fees since inception.
              </p>
            </div>
            <div className="mt-8 pt-6 border-t border-indigo-500/30 flex items-center justify-between">
              <div>
                <span className="text-2xl font-bold block">{loanRepayments.length}</span>
                <span className="text-xs text-indigo-200">Total Transactions</span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold block">{new Date().getFullYear()}</span>
                <span className="text-xs text-indigo-200">Current Fiscal Year</span>
              </div>
            </div>
          </div>

          {/* Annual Breakdown List */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden flex flex-col min-w-0">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-semibold text-slate-800 dark:text-white">Annual Summary</h3>
            </div>
            <div className="flex-1 overflow-x-auto p-0">
              {annualSummary.years.length > 0 ? (
                <table className="w-full text-left border-collapse min-w-[300px]">
                  <thead className="bg-slate-50/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
                    <tr>
                      <th className="px-4 sm:px-6 py-3 font-medium">Year</th>
                      <th className="px-4 sm:px-6 py-3 font-medium text-right">Total Collection</th>
                      <th className="px-4 sm:px-6 py-3 font-medium text-right w-1/3">Contribution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {annualSummary.years.map((item) => {
                      const percentage = (item.total / annualSummary.grandTotal) * 100;
                      return (
                        <tr key={item.year} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                          <td className="px-4 sm:px-6 py-4 text-slate-900 dark:text-white font-medium">{item.year}</td>
                          <td className="px-4 sm:px-6 py-4 text-right text-slate-700 dark:text-slate-200 font-mono">
                            {formatCurrency(item.total, settings.currency)}
                          </td>
                          <td className="px-4 sm:px-6 py-4">
                            <div className="flex items-center justify-end gap-2 sm:gap-3">
                              <div className="hidden sm:block flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden max-w-[100px]">
                                <div
                                  className="h-full bg-indigo-500 rounded-full"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                              <span className="text-xs text-slate-400 w-10 text-right">{percentage.toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-slate-400">
                  <History size={48} className="mx-auto mb-2 opacity-20" />
                  <p>No annual data available yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
