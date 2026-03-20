import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SocietySettings, ThemeMode, AccentColor } from '../types';
import { DEFAULT_SETTINGS, COLOR_PALETTES } from '../constants';
import { supabase } from '../supabaseClient';

interface SettingsContextType {
  settings: SocietySettings;
  updateSettings: (settings: Partial<SocietySettings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const SETTINGS_ROW_ID = 'main';

const readStoredSettings = (): Partial<SocietySettings> | null => {
  try {
    const stored = localStorage.getItem('podhupu_settings');
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Stored settings payload is not an object');
    }

    return parsed as Partial<SocietySettings>;
  } catch (error) {
    console.warn('Ignoring invalid persisted settings and resetting local cache.', error);
    try {
      localStorage.removeItem('podhupu_settings');
    } catch (removeError) {
      console.warn('Failed to clear invalid persisted settings.', removeError);
    }
    return null;
  }
};

const persistSettings = (settings: SocietySettings) => {
  try {
    localStorage.setItem('podhupu_settings', JSON.stringify(settings));
  } catch (error) {
    console.warn('Failed to persist settings to local storage.', error);
  }
};

const mapDbRowToSettings = (row: any): Partial<SocietySettings> => ({
  societyName: row.society_name ?? DEFAULT_SETTINGS.societyName,
  monthlyFee: row.monthly_fee ?? DEFAULT_SETTINGS.monthlyFee,
  joiningFee: row.joining_fee ?? DEFAULT_SETTINGS.joiningFee,
  loanProcessingFee: row.loan_processing_fee ?? DEFAULT_SETTINGS.loanProcessingFee,
  annualMemberInterestRate: row.annual_member_interest_rate ?? DEFAULT_SETTINGS.annualMemberInterestRate,
  currency: row.currency ?? DEFAULT_SETTINGS.currency,
  address: row.address ?? DEFAULT_SETTINGS.address,
  lastSyncDate: row.last_sync_date ?? DEFAULT_SETTINGS.lastSyncDate,
  adminPassword: row.admin_password ?? DEFAULT_SETTINGS.adminPassword,
  operatorCode: row.operator_code ?? DEFAULT_SETTINGS.operatorCode,
  viewerCode: row.viewer_code ?? DEFAULT_SETTINGS.viewerCode,
  defaultLoanInterestRate: row.default_loan_interest_rate ?? DEFAULT_SETTINGS.defaultLoanInterestRate,
  defaultRegularLoanRate: row.default_regular_loan_rate ?? DEFAULT_SETTINGS.defaultRegularLoanRate,
  defaultSpecialLoanRate: row.default_special_loan_rate ?? DEFAULT_SETTINGS.defaultSpecialLoanRate,
  themeMode: (row.theme_mode as ThemeMode) ?? DEFAULT_SETTINGS.themeMode,
  accentColor: (row.accent_color as AccentColor) ?? DEFAULT_SETTINGS.accentColor,
  bannerImage: row.banner_image ?? DEFAULT_SETTINGS.bannerImage,
});

const mapSettingsToDbRow = (settings: SocietySettings) => ({
  id: SETTINGS_ROW_ID,
  society_name: settings.societyName,
  monthly_fee: settings.monthlyFee,
  joining_fee: settings.joiningFee,
  loan_processing_fee: settings.loanProcessingFee,
  annual_member_interest_rate: settings.annualMemberInterestRate,
  currency: settings.currency,
  address: settings.address,
  admin_password: settings.adminPassword,
  operator_code: settings.operatorCode,
  viewer_code: settings.viewerCode,
  default_loan_interest_rate: settings.defaultLoanInterestRate,
  default_regular_loan_rate: settings.defaultRegularLoanRate,
  default_special_loan_rate: settings.defaultSpecialLoanRate,
  theme_mode: settings.themeMode,
  accent_color: settings.accentColor,
  banner_image: settings.bannerImage,
  last_sync_date: settings.lastSyncDate,
  updated_at: new Date().toISOString()
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SocietySettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // 1. Try local storage first (for offline/instant load)
    const storedSettings = readStoredSettings();
    if (storedSettings) {
      setSettings({ ...DEFAULT_SETTINGS, ...storedSettings });
    }

    // 2. Fetch from Supabase (to sync across devices)
    const fetchSupabaseSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('*')
          .eq('id', SETTINGS_ROW_ID)
          .maybeSingle();

        if (data && !error) {
          setSettings((prev: SocietySettings) => ({ ...prev, ...mapDbRowToSettings(data) }));
        }
      } catch (error) {
        console.warn('Failed to fetch settings from Supabase.', error);
      }
    };
    fetchSupabaseSettings();
    setIsLoaded(true);
  }, []);

  // Persist Settings to LocalStorage and Supabase
  useEffect(() => {
    if (isLoaded) {
      persistSettings(settings);

      const syncToSupabase = async () => {
        await supabase.from('app_settings').upsert(mapSettingsToDbRow(settings));
      };
      syncToSupabase();
    }
  }, [settings, isLoaded]);

  // Apply Theme & Colors
  useEffect(() => {
    const root = window.document.documentElement;
    const theme = settings.themeMode || 'light';
    const accent = settings.accentColor || 'blue';

    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else if (theme === 'system') {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }

    const palette = COLOR_PALETTES[accent as AccentColor] || COLOR_PALETTES['blue'];
    root.style.setProperty('--color-primary-50', palette[50]);
    root.style.setProperty('--color-primary-100', palette[100]);
    root.style.setProperty('--color-primary-500', palette[500]);
    root.style.setProperty('--color-primary-600', palette[600]);
    root.style.setProperty('--color-primary-700', palette[700]);
  }, [settings.themeMode, settings.accentColor]);

  const updateSettings = useCallback((newSettings: Partial<SocietySettings>) => {
    setSettings((prev: SocietySettings) => ({ ...prev, ...newSettings }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within SettingsProvider');
  return context;
};
