import React, { useEffect, useState } from 'react';
import { Save, RotateCcw, Database, Plus, Trash2, Calendar } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { SocietySettings, AccentColor, ThemeMode, UserRole, InterestWaiverPeriod, ProrateOverrideDate } from '../types';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

const THEME_OPTIONS: ThemeMode[] = ['light', 'dark', 'system'];
const ACCENT_OPTIONS: AccentColor[] = ['blue', 'emerald', 'violet', 'amber', 'rose', 'cyan'];
const MONTH_OPTIONS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const YEAR_OPTIONS = Array.from({ length: new Date().getFullYear() - 2011 }, (_, i) => 2012 + i);

const SettingsPage: React.FC = () => {
  const { settings, updateSettings, resetSettings } = useSettings();
  const { role } = useAuth();
  const [form, setForm] = useState<SocietySettings>(settings);
  const [message, setMessage] = useState('');
  const canEdit = role === UserRole.ADMIN;

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  if (role !== UserRole.ADMIN) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-700">
        <div className="p-6 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 mb-6 shadow-2xl shadow-rose-500/20">
          <Database size={72} />
        </div>
        <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-2">Restricted Access</h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-md text-center">
          System settings and access codes are restricted to society administrators only. 
          Please contact our senior auditor if you believe you require access to this configuration hub.
        </p>
      </div>
    );
  }

  const setField = <K extends keyof SocietySettings>(key: K, value: SocietySettings[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (!canEdit) {
      setMessage('Only admins can update settings.');
      return;
    }
    updateSettings({
      societyName: form.societyName.trim() || settings.societyName,
      currency: form.currency.trim() || settings.currency,
      loanProcessingFee: Number(form.loanProcessingFee || 0),
      defaultLoanInterestRate: Number(form.defaultLoanInterestRate || 0),
      adminPassword: form.adminPassword?.trim() || settings.adminPassword,
      operatorCode: form.operatorCode?.trim() || settings.operatorCode,
      viewerCode: form.viewerCode?.trim() || settings.viewerCode,
      themeMode: form.themeMode,
      accentColor: form.accentColor,
      bannerImage: form.bannerImage?.trim() || '',
      interestRateRules: form.interestRateRules,
      globalCutoffDate: form.globalCutoffDate,
      interestWaiverPeriods: form.interestWaiverPeriods
    });
    setMessage('Settings saved to app_settings.');
  };

  const handleReset = () => {
    if (!canEdit) {
      setMessage('Only admins can reset settings.');
      return;
    }
    resetSettings();
    setMessage('Settings reset to defaults.');
  };

  const addRule = () => {
    const newRule = {
      id: `rule_${Date.now()}`,
      label: 'New Rule',
      rate: settings.defaultLoanInterestRate || 1.5,
      endDate: ''
    };
    setField('interestRateRules', [...(form.interestRateRules || []), newRule]);
  };

  const removeRule = (id: string) => {
    setField('interestRateRules', (form.interestRateRules || []).filter(r => r.id !== id));
  };

  const updateRule = (id: string, updates: Partial<any>) => {
    setField('interestRateRules', (form.interestRateRules || []).map(r => 
      r.id === id ? { ...r, ...updates } : r
    ));
  };

  const addWaiver = () => {
    const newWaiver: InterestWaiverPeriod = {
      id: `waiver_${Date.now()}`,
      label: 'New Waiver',
      fromMonth: 1,
      fromYear: 2020,
      toMonth: 1,
      toYear: 2020
    };
    setField('interestWaiverPeriods', [...(form.interestWaiverPeriods || []), newWaiver]);
  };

  const removeWaiver = (id: string) => {
    setField('interestWaiverPeriods', (form.interestWaiverPeriods || []).filter(w => w.id !== id));
  };

  const updateWaiver = (id: string, updates: Partial<InterestWaiverPeriod>) => {
    setField('interestWaiverPeriods', (form.interestWaiverPeriods || []).map(w =>
      w.id === id ? { ...w, ...updates } : w
    ));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-slate-500 dark:text-slate-400">
          This page is aligned to the existing <code>app_settings</code> columns defined in <code>migration.sql</code>.
        </p>
      </div>

      <Card title="General" subtitle="Core defaults used by the special-loan workflow">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Society Name"
            value={form.societyName}
            onChange={e => setField('societyName', e.target.value)}
            disabled={!canEdit}
          />
          <Input
            label="Currency"
            value={form.currency}
            onChange={e => setField('currency', e.target.value)}
            disabled={!canEdit}
          />
          <Input
            label="Default Monthly Interest Rate (%)"
            type="number"
            step="0.01"
            value={String(form.defaultLoanInterestRate ?? '')}
            onChange={e => setField('defaultLoanInterestRate', Number(e.target.value))}
            description="Used as the default rate when creating a new special loan."
            disabled={!canEdit}
          />
          <Input
            label="Loan Processing Fee"
            type="number"
            step="0.01"
            value={String(form.loanProcessingFee ?? '')}
            onChange={e => setField('loanProcessingFee', Number(e.target.value))}
            description="Optional manual fee recorded at disbursal time."
            disabled={!canEdit}
          />
          <Input
            onChange={e => setField('bannerImage', e.target.value)}
            className="md:col-span-2"
            disabled={!canEdit}
          />
          <Input
            label="Global Interest Cutoff Date (Optional)"
            type="date"
            value={form.globalCutoffDate || ''}
            onChange={e => setField('globalCutoffDate', e.target.value)}
            description="If set, auto-generation will stop at this date instead of the current month. Format: DD-MM-YYYY in display."
            disabled={!canEdit}
          />
        </div>
      </Card>

      <Card title="Interest Rate Schedule" subtitle="Define historical or future rate overrides based on end dates">
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="py-2 font-bold text-slate-500 dark:text-slate-400">Rule Label</th>
                  <th className="py-2 font-bold text-slate-500 dark:text-slate-400">End Date (Inclusive)</th>
                  <th className="py-2 font-bold text-slate-500 dark:text-slate-400">Monthly Rate (%)</th>
                  <th className="py-2 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {(form.interestRateRules || []).map((rule) => (
                  <tr key={rule.id}>
                    <td className="py-3 pr-4">
                      <input
                        className="w-full bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white p-0"
                        value={rule.label}
                        onChange={e => updateRule(rule.id, { label: e.target.value })}
                        placeholder="e.g. Legacy Period"
                        disabled={!canEdit}
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-slate-400" />
                        <input
                          type="date"
                          className="bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white p-0 text-xs"
                          value={rule.endDate || ''}
                          onChange={e => updateRule(rule.id, { endDate: e.target.value })}
                          disabled={!canEdit}
                        />
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        type="number"
                        step="0.01"
                        className="w-20 bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white p-0 font-mono"
                        value={rule.rate}
                        onChange={e => updateRule(rule.id, { rate: Number(e.target.value) })}
                        disabled={!canEdit}
                      />
                    </td>
                    <td className="py-3 text-right">
                      {canEdit && (
                        <button 
                          onClick={() => removeRule(rule.id)}
                          className="text-rose-500 hover:text-rose-600 p-1"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {(form.interestRateRules || []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400 italic">
                      No override rules defined. Global default rate applies to all dates.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {canEdit && (
            <button
              onClick={addRule}
              className="flex items-center gap-2 text-primary-600 hover:text-primary-700 font-bold text-xs mt-2"
            >
              <Plus size={14} />
              Add Interest Rule
            </button>
          )}
          
          <div className="mt-4 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 text-xs text-blue-700 dark:text-blue-300">
            <strong>How it works:</strong> Rules are checked in order of their End Date. The first rule whose end date is 
            greater than or equal to the loan/top-up date will be applied. If no rules match (or no end date is set), 
            the global default rate is used.
          </div>
        </div>
      </Card>

      <Card title="Interest Waiver Periods" subtitle="Define months where interest is waived for all loans (e.g., COVID-19 relief)">
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="py-2 font-bold text-slate-500 dark:text-slate-400">Label</th>
                  <th className="py-2 font-bold text-slate-500 dark:text-slate-400">From (Month / Year)</th>
                  <th className="py-2 font-bold text-slate-500 dark:text-slate-400">To (Month / Year)</th>
                  <th className="py-2 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {(form.interestWaiverPeriods || []).map((waiver) => (
                  <tr key={waiver.id}>
                    <td className="py-3 pr-4">
                      <input
                        className="w-full bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white p-0"
                        value={waiver.label}
                        onChange={e => updateWaiver(waiver.id, { label: e.target.value })}
                        placeholder="e.g. COVID-19 Relief"
                        disabled={!canEdit}
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <select
                          className="bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white p-0 text-xs"
                          value={waiver.fromMonth}
                          onChange={e => updateWaiver(waiver.id, { fromMonth: Number(e.target.value) })}
                          disabled={!canEdit}
                        >
                          {MONTH_OPTIONS.map((m, i) => (
                            <option key={i} value={i + 1}>{m}</option>
                          ))}
                        </select>
                        <select
                          className="bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white p-0 text-xs font-mono"
                          value={waiver.fromYear}
                          onChange={e => updateWaiver(waiver.id, { fromYear: Number(e.target.value) })}
                          disabled={!canEdit}
                        >
                          {YEAR_OPTIONS.map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <select
                          className="bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white p-0 text-xs"
                          value={waiver.toMonth}
                          onChange={e => updateWaiver(waiver.id, { toMonth: Number(e.target.value) })}
                          disabled={!canEdit}
                        >
                          {MONTH_OPTIONS.map((m, i) => (
                            <option key={i} value={i + 1}>{m}</option>
                          ))}
                        </select>
                        <select
                          className="bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white p-0 text-xs font-mono"
                          value={waiver.toYear}
                          onChange={e => updateWaiver(waiver.id, { toYear: Number(e.target.value) })}
                          disabled={!canEdit}
                        >
                          {YEAR_OPTIONS.map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      {canEdit && (
                        <button
                          onClick={() => removeWaiver(waiver.id)}
                          className="text-rose-500 hover:text-rose-600 p-1"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {(form.interestWaiverPeriods || []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400 italic">
                      No waiver periods defined. Interest is charged for all months.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {canEdit && (
            <button
              onClick={addWaiver}
              className="flex items-center gap-2 text-primary-600 hover:text-primary-700 font-bold text-xs mt-2"
            >
              <Plus size={14} />
              Add Waiver Period
            </button>
          )}

          <div className="mt-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 text-xs text-amber-700 dark:text-amber-300">
            <strong>How it works:</strong> For every month that falls within a waiver range, interest will be set to ₹0 for all loans.
            Auto-generated records will show the waived months with zero interest. Existing manually-entered interest records are not auto-deleted.
          </div>
        </div>
      </Card>

      <Card title="Prorate Date Overrides" subtitle="Snapshots of exact-day interest entries saved during interest wipes">
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-500 uppercase">Member / Loan</th>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-center text-[10px] font-bold text-slate-500 uppercase">Days</th>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-500 uppercase">Notes</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(!form.prorateOverrideDates || form.prorateOverrideDates.length === 0) ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400 italic">
                      No saved prorate overrides found. These are created automatically when you wipe a loan's interest.
                    </td>
                  </tr>
                ) : (
                  form.prorateOverrideDates.map((override) => (
                    <tr key={override.id} className="text-xs hover:bg-slate-50 dark:hover:bg-slate-900/20">
                      <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">
                        {override.memberLabel || 'Unknown Member'}
                        <div className="text-[10px] text-slate-400 font-mono">{override.loanId}</div>
                      </td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                        {override.date}
                        {override.interestForMonth && (
                          <div className="text-[9px] font-bold text-blue-500 uppercase">
                            Period: {MONTH_OPTIONS[override.interestForMonth - 1]} {override.interestForYear}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center font-bold text-blue-600">
                        {override.days}
                      </td>
                      <td className="px-4 py-2 text-slate-500 max-w-[150px] truncate" title={override.notes || ''}>
                        {override.notes || '—'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {canEdit && (
                          <button
                            onClick={() => {
                              const next = form.prorateOverrideDates?.filter(o => o.id !== override.id) || [];
                              setField('prorateOverrideDates', next);
                            }}
                            className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded"
                            title="Delete snapshot"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 rounded-xl text-[11px] text-blue-700 dark:text-blue-300">
            <p className="font-bold mb-1 uppercase tracking-tight">Manual Re-entry Requirement</p>
            These records serve as a <strong>reference library</strong>. After you regenerate interest for a loan, you must manually 
            re-enter these exact-day collections by editing the auto-generated row and selecting "Exact Days" mode.
          </div>
        </div>
      </Card>

      <Card title="Access Codes" subtitle="Matches admin_password, operator_code, and viewer_code in app_settings">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Admin Code"
            type="password"
            value={form.adminPassword ?? ''}
            onChange={e => setField('adminPassword', e.target.value)}
            disabled={!canEdit}
          />
          <Input
            label="Operator Code"
            type="password"
            value={form.operatorCode ?? ''}
            onChange={e => setField('operatorCode', e.target.value)}
            disabled={!canEdit}
          />
          <Input
            label="Viewer Code"
            type="password"
            value={form.viewerCode ?? ''}
            onChange={e => setField('viewerCode', e.target.value)}
            disabled={!canEdit}
          />
        </div>
      </Card>

      <Card title="Appearance" subtitle="Optional UI preferences stored in app_settings">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 ml-0.5">
              Theme Mode
            </label>
            <select
              value={form.themeMode ?? 'light'}
              onChange={e => setField('themeMode', e.target.value as ThemeMode)}
              className="block w-full rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white"
              disabled={!canEdit}
            >
              {THEME_OPTIONS.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 ml-0.5">
              Accent Color
            </label>
            <select
              value={form.accentColor ?? 'blue'}
              onChange={e => setField('accentColor', e.target.value as AccentColor)}
              className="block w-full rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white"
              disabled={!canEdit}
            >
              {ACCENT_OPTIONS.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <Card title="Schema Note" subtitle="The settings page intentionally stays inside your current schema">
        <div className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
          <Database size={18} className="mt-0.5 text-primary-600" />
          <p>
            Active columns used here: <code>society_name</code>, <code>currency</code>, <code>loan_processing_fee</code>,
            <code> default_loan_interest_rate</code>, <code>admin_password</code>, <code>operator_code</code>,
            <code> viewer_code</code>, <code>theme_mode</code>, <code>accent_color</code>, <code>banner_image</code>, and <code>prorate_override_dates</code>.
          </p>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button icon={Save} onClick={handleSave} disabled={!canEdit}>Save Settings</Button>
        <Button variant="outline" icon={RotateCcw} onClick={handleReset} disabled={!canEdit}>Reset Defaults</Button>
        {message && <span className="text-sm text-emerald-600 dark:text-emerald-400">{message}</span>}
      </div>
    </div>
  );
};

export default SettingsPage;
