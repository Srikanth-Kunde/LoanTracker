import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { Shield, KeyRound, Loader2 } from 'lucide-react';

export const LoginScreen = () => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const { settings } = useSettings();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;

    setError('');
    setIsLoading(true);
    
    try {
      const success = await login(code);
      if (!success) {
        setError('Invalid access code. Please try again.');
      }
    } catch (err) {
      setError('System error. Check connection.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-8 text-center bg-primary-600">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10 backdrop-blur-sm">
            <Shield className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">{settings.societyName}</h1>
          <p className="text-primary-100 text-sm">Special loan ledger and historical entry</p>
        </div>

        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Access Code
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <KeyRound size={18} className="text-slate-400" />
                </div>
                <input
                  type="password"
                  id="code"
                  value={code}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCode(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 dark:border-slate-700 rounded-xl leading-5 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent sm:text-sm transition-all"
                  placeholder="••••••••"
                  autoFocus
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400 text-center animate-shake">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !code}
              className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 transition-all duration-200"
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                'Open Loan Ledger'
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-700">
            <p className="text-center text-xs text-slate-400 uppercase tracking-widest font-semibold mb-4">Available Roles</p>
            <div className="grid grid-cols-3 gap-2 text-[10px] text-center">
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-500 font-bold uppercase">Admin</div>
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-500 font-bold uppercase">Operator</div>
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-500 font-bold uppercase">Viewer</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
