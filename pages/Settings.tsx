import React, { useEffect, useState } from 'react';
import { Save, RotateCcw, Database } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { SocietySettings, AccentColor, ThemeMode, UserRole } from '../types';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

const THEME_OPTIONS: ThemeMode[] = ['light', 'dark', 'system'];
const ACCENT_OPTIONS: AccentColor[] = ['blue', 'emerald', 'violet', 'amber', 'rose', 'cyan'];

const SettingsPage: React.FC = () => {
  const { settings, updateSettings, resetSettings } = useSettings();
  const { role } = useAuth();
  const [form, setForm] = useState<SocietySettings>(settings);
  const [message, setMessage] = useState('');
  const canEdit = role === UserRole.ADMIN;

  useEffect(() => {
    setForm(settings);
  }, [settings]);

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
      bannerImage: form.bannerImage?.trim() || ''
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-slate-500 dark:text-slate-400">
          This page is aligned to the existing <code>app_settings</code> columns defined in <code>migration.sql</code>.
        </p>
        {!canEdit && (
          <p className="text-amber-600 dark:text-amber-400 text-sm">
            You are in read-only mode. Admin access is required to change system settings or access codes.
          </p>
        )}
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
            label="Banner Image URL"
            value={form.bannerImage ?? ''}
            onChange={e => setField('bannerImage', e.target.value)}
            className="md:col-span-2"
            disabled={!canEdit}
          />
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
            <code> viewer_code</code>, <code>theme_mode</code>, <code>accent_color</code>, and <code>banner_image</code>.
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
