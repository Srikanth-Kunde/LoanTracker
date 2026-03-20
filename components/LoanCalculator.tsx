import * as React from 'react';
import { useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { formatCurrency } from '../constants';
import { Calculator, Calendar, Percent, Banknote, Clock, ArrowRight } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Button } from './ui/Button';

interface LoanCalculatorProps {
  isOpen?: boolean;
  onClose?: () => void;
  initialValues?: any;
  repayments?: any;
}

export const LoanCalculator: React.FC<LoanCalculatorProps> = ({ 
  isOpen, 
  onClose, 
  initialValues, 
  repayments 
}: LoanCalculatorProps) => {
  const { settings } = useSettings();
  const [amount, setAmount] = useState<number>(100000);
  const [rate, setRate] = useState<number>(1.5);
  const [months, setMonths] = useState<number>(12);

  const monthlyInterest = Math.round(amount * (rate / 100));
  const totalInterest = monthlyInterest * months;
  const totalPayback = amount + totalInterest;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          label="Principal Amount"
          type="number"
          value={amount}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(Number(e.target.value))}
          icon={Banknote}
        />
        <Input
          label="Monthly Interest %"
          type="number"
          step="0.01"
          value={rate}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRate(Number(e.target.value))}
          icon={Percent}
        />
        <Input
          label="Duration (Expected Months)"
          type="number"
          value={months}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMonths(Number(e.target.value))}
          icon={Clock}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-primary-50 dark:bg-primary-900/20 p-4 rounded-xl border border-primary-100 dark:border-primary-800">
          <p className="text-xs font-semibold text-primary-600 dark:text-primary-400 uppercase mb-1">Monthly Interest</p>
          <p className="text-2xl font-bold text-primary-700 dark:text-primary-300">
            {formatCurrency(monthlyInterest, settings.currency)}
          </p>
          <p className="text-[10px] text-primary-500 mt-1 italic">Paid every month until principal return</p>
        </div>
        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800">
          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase mb-1">Total Payback</p>
          <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
            {formatCurrency(totalPayback, settings.currency)}
          </p>
          <p className="text-[10px] text-indigo-500 mt-1 italic">If loan continues for {months} months</p>
        </div>
      </div>

      <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center">
          <Calculator size={16} className="mr-2 text-primary-600" />
          Comparison (Over {months} Months)
        </h3>
        
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-sm text-slate-500">Total Principal</span>
            <span className="text-sm font-semibold text-slate-900 dark:text-white font-mono">{formatCurrency(amount, settings.currency)}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-sm text-slate-500">Total Interest (Accumulated)</span>
            <span className="text-sm font-semibold text-emerald-600 font-mono">+{formatCurrency(totalInterest, settings.currency)}</span>
          </div>
          <div className="flex justify-between items-center py-2 pt-3">
            <span className="text-base font-bold text-slate-900 dark:text-white">Total Outflow</span>
            <span className="text-base font-bold text-primary-600 font-mono">{formatCurrency(totalPayback, settings.currency)}</span>
          </div>
        </div>
      </div>

      {onClose && (
        <div className="flex justify-end pt-2">
          <Button onClick={onClose}>Close Calculator</Button>
        </div>
      )}
    </div>
  );
};
