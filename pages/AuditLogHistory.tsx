import React, { useEffect, useMemo, useState } from 'react';
import { History, RefreshCw, ShieldAlert } from 'lucide-react';
import { AuditLogEntry } from '../context/AuditLogContext';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { supabase } from '../supabaseClient';
import { UserRole } from '../types';
import { formatCurrency } from '../constants';

type AuditLogActionFilter = 'ALL' | AuditLogEntry['action'];

const formatDateTime = (value: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed);
};

const getAuditActionTone = (action: AuditLogEntry['action']) => {
  if (action === 'UPDATE_REPAYMENT') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
  }
  if (action === 'RECORD_REPAYMENT' || action === 'BULK_RECORD_INTEREST') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
  }
  if (action.includes('DELETE') || action === 'WIPE_INTEREST') {
    return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300';
  }
  return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
};

const getAuditHeadline = (entry: AuditLogEntry) => {
  const details = (entry.details || {}) as Record<string, unknown>;
  if (entry.action === 'UPDATE_REPAYMENT' && details.interestPeriod) {
    return `Interest override for ${String(details.interestPeriod)}`;
  }
  if (entry.action === 'BULK_RECORD_INTEREST' && typeof details.generatedCount === 'number') {
    return `Auto-generated ${details.generatedCount} missing interest month(s)`;
  }
  if (entry.action === 'RECORD_REPAYMENT') {
    return 'Repayment recorded';
  }
  if (entry.action === 'WIPE_INTEREST') {
    return 'Interest history wiped';
  }
  return entry.action.replaceAll('_', ' ');
};

const getAuditSearchText = (entry: AuditLogEntry) => {
  const details = entry.details || {};
  return [
    entry.action,
    entry.table_name,
    entry.record_id,
    entry.entity_id,
    JSON.stringify(details)
  ].filter(Boolean).join(' ').toLowerCase();
};

const escapeCsvValue = (value: string | number | null | undefined) => {
  const normalized = value == null ? '' : String(value);
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
};

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

const AuditLogHistory: React.FC = () => {
  const { role } = useAuth();
  const { settings } = useSettings();
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [auditLogState, setAuditLogState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [auditActionFilter, setAuditActionFilter] = useState<AuditLogActionFilter>('ALL');
  const [auditSearchTerm, setAuditSearchTerm] = useState('');

  useEffect(() => {
    if (role !== UserRole.ADMIN) return;

    let isMounted = true;

    const fetchAuditLogs = async () => {
      setAuditLogState(current => current === 'ready' ? current : 'loading');
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (!isMounted) return;

      if (error) {
        setAuditLogState('error');
        return;
      }

      setAuditEntries((data || []) as AuditLogEntry[]);
      setAuditLogState('ready');
    };

    fetchAuditLogs();

    const channel = supabase
      .channel('audit_logs_realtime_admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, () => {
        fetchAuditLogs();
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [role]);

  const auditActionOptions = useMemo(() => {
    const actions = new Set<AuditLogEntry['action']>(['UPDATE_REPAYMENT']);
    auditEntries.forEach(entry => actions.add(entry.action));
    return ['ALL', ...Array.from(actions)] as AuditLogActionFilter[];
  }, [auditEntries]);

  const filteredAuditEntries = useMemo(() => {
    const normalizedSearch = auditSearchTerm.trim().toLowerCase();
    return auditEntries.filter(entry => {
      const matchesAction = auditActionFilter === 'ALL' || entry.action === auditActionFilter;
      const matchesSearch = !normalizedSearch || getAuditSearchText(entry).includes(normalizedSearch);
      return matchesAction && matchesSearch;
    });
  }, [auditActionFilter, auditEntries, auditSearchTerm]);

  const auditSummary = useMemo(() => {
    return filteredAuditEntries.reduce((summary, entry) => {
      summary.total += 1;
      if (entry.action === 'UPDATE_REPAYMENT') summary.interestOverrides += 1;
      if (entry.action.includes('DELETE') || entry.action === 'WIPE_INTEREST') summary.destructive += 1;
      return summary;
    }, {
      total: 0,
      interestOverrides: 0,
      destructive: 0
    });
  }, [filteredAuditEntries]);

  const handleAuditLogExport = () => {
    downloadCsv(
      ['Timestamp', 'Performed By', 'Action', 'Table', 'Record ID', 'Entity ID', 'Summary', 'Details'],
      filteredAuditEntries.map(entry => [
        entry.created_at,
        entry.performed_by,
        entry.action,
        entry.table_name,
        entry.record_id || '',
        entry.entity_id || '',
        getAuditHeadline(entry),
        JSON.stringify(entry.details || {})
      ]),
      'Audit_Log_History.csv'
    );
  };

  if (role !== UserRole.ADMIN) {
    return (
      <div className="rounded-2xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-800 p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-rose-100 p-3 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
            <ShieldAlert size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Admin Access Only</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Audit Log History is restricted to admin users. Operators and viewers cannot open this tab.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Audit Log History</h1>
          <p className="text-slate-500 dark:text-slate-400">Live database audit trail for edits, deletes, and month-interest overrides. Showing the latest 300 entries.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleAuditLogExport} className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-medium"><History size={16} className="mr-2" /> Audit Log CSV</button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
        <select
          value={auditActionFilter}
          onChange={e => setAuditActionFilter(e.target.value as AuditLogActionFilter)}
          className="px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
        >
          {auditActionOptions.map(action => (
            <option key={action} value={action}>
              {action === 'ALL' ? 'All Actions' : action.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={auditSearchTerm}
          onChange={e => setAuditSearchTerm(e.target.value)}
          placeholder="Search action, month, member, record ID"
          className="px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 min-w-[260px]"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-500 uppercase">Visible Log Entries</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{auditSummary.total}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <p className="text-xs font-semibold text-blue-600 uppercase">Interest Overrides</p>
          <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{auditSummary.interestOverrides}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <p className="text-xs font-semibold text-rose-600 uppercase">Destructive Actions</p>
          <p className="text-xl font-bold text-rose-700 dark:text-rose-300">{auditSummary.destructive}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Database Change Log</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Month-interest edits are recorded as <span className="font-semibold">UPDATE REPAYMENT</span> with before and after values.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <RefreshCw size={14} />
            <span>{auditLogState === 'loading' ? 'Loading logs' : auditLogState === 'error' ? 'Audit log unavailable' : 'Live updates enabled'}</span>
          </div>
        </div>

        {auditLogState === 'error' ? (
          <div className="px-6 py-8 text-sm text-rose-600 dark:text-rose-300">
            Audit log records could not be loaded from `audit_logs`.
          </div>
        ) : filteredAuditEntries.length === 0 ? (
          <div className="px-6 py-8 text-sm text-slate-500 dark:text-slate-400">
            No audit entries match the current filters.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {filteredAuditEntries.map(entry => {
              const details = (entry.details || {}) as Record<string, any>;
              const before = details.before as Record<string, any> | undefined;
              const after = details.after as Record<string, any> | undefined;

              return (
                <div key={entry.id} className="px-6 py-5 space-y-3">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${getAuditActionTone(entry.action)}`}>
                          {entry.action.replaceAll('_', ' ')}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(entry.created_at)}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">by {entry.performed_by}</span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{getAuditHeadline(entry)}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Table: {entry.table_name || '—'} • Record: {entry.record_id || '—'} • Entity: {entry.entity_id || '—'}
                      </div>
                    </div>
                    {details.memberName ? (
                      <div className="text-sm text-slate-600 dark:text-slate-300">
                        Member: <span className="font-semibold">{String(details.memberName)}</span>
                      </div>
                    ) : null}
                  </div>

                  {before && after ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Before</p>
                        <div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-300">
                          <div>Amount: {before.amount != null ? formatCurrency(Number(before.amount), settings.currency) : '—'}</div>
                          <div>Interest: {before.interestPaid != null ? formatCurrency(Number(before.interestPaid), settings.currency) : '—'}</div>
                          <div>Mode: {before.interestCalculationType || 'MONTHLY'}</div>
                          <div>Days: {before.interestDays ?? '—'}</div>
                        </div>
                      </div>
                      <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">After</p>
                        <div className="mt-2 space-y-1 text-sm text-emerald-900 dark:text-emerald-100">
                          <div>Amount: {after.amount != null ? formatCurrency(Number(after.amount), settings.currency) : '—'}</div>
                          <div>Interest: {after.interestPaid != null ? formatCurrency(Number(after.interestPaid), settings.currency) : '—'}</div>
                          <div>Mode: {after.interestCalculationType || 'MONTHLY'}</div>
                          <div>Days: {after.interestDays ?? '—'}</div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-6 gap-y-1">
                    {details.interestPeriod ? <span>Month: {String(details.interestPeriod)}</span> : null}
                    {typeof details.generatedCount === 'number' ? <span>Generated: {details.generatedCount}</span> : null}
                    {typeof details.cleanedCount === 'number' ? <span>Cleaned: {details.cleanedCount}</span> : null}
                    {typeof details.totalAmount === 'number' ? <span>Total: {formatCurrency(details.totalAmount, settings.currency)}</span> : null}
                    {details.loanId ? <span>Loan: {String(details.loanId)}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogHistory;
