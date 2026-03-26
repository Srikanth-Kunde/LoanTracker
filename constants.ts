import { formatDisplayDate, parseISODateParts } from './utils/date';

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const DEFAULT_SETTINGS = {
  societyName: "LoanTracker (Special Edition)",
  loanProcessingFee: 0,
  currency: "₹",
  adminPassword: "admin",
  operatorCode: "operator",
  viewerCode: "viewer",
  defaultLoanInterestRate: 1.5,
  themeMode: 'light' as const,
  accentColor: 'blue' as const,
  bannerImage: "https://media.istockphoto.com/id/1417583870/photo/growth-financial-business-arrow-money-coin-on-increase-earnings-3d-background-with-economy.jpg?s=2048x2048&w=is&k=20&c=q0Ye2vGZ-swv_nwkMFnhzUXdb9388nIeyFPfhwUA6gQ=",
  interestRateRules: [],
  globalCutoffDate: "",
  interestWaiverPeriods: []
};

// RGB values for Tailwind CSS variables (without 'rgb()')
export const COLOR_PALETTES = {
  blue: {
    50: '239 246 255',
    100: '219 234 254',
    500: '59 130 246',
    600: '37 99 235',
    700: '29 78 216',
  },
  emerald: {
    50: '236 253 245',
    100: '209 250 229',
    500: '16 185 129',
    600: '5 150 105',
    700: '4 120 87',
  },
  violet: {
    50: '245 243 255',
    100: '237 233 254',
    500: '139 92 246',
    600: '124 58 237',
    700: '109 40 217',
  },
  amber: {
    50: '255 251 235',
    100: '254 243 199',
    500: '245 158 11',
    600: '217 119 6',
    700: '180 83 9',
  },
  rose: {
    50: '255 241 242',
    100: '255 228 230',
    500: '244 63 94',
    600: '225 29 72',
    700: '190 18 60',
  },
  cyan: {
    50: '236 254 255',
    100: '207 250 254',
    500: '6 182 212',
    600: '8 145 178',
    700: '14 116 144',
  }
};

// ── Shared Formatters ────────────────────────────────────────────────────────
export const getIndianFinancialYear = (dateStr: string | Date): string => {
  const safeDate = typeof dateStr === 'string'
    ? parseISODateParts(dateStr)
    : {
        year: dateStr.getUTCFullYear(),
        month: dateStr.getUTCMonth() + 1
      };

  const year = safeDate.year;
  if (safeDate.month >= 4) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
};

export const formatCurrency = (amount: number, currency: string = '₹') => {
  return `${currency} ${Math.abs(amount).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  })}`;
};

export const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return '-';
  try {
    return formatDisplayDate(dateString);
  } catch {
    return dateString;
  }
};
