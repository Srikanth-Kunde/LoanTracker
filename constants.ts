
import { PaymentMethod } from './types';
import { formatDisplayDate, parseISODateParts } from './utils/date';

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const DEFAULT_SETTINGS = {
  societyName: "Balapur Kuruma Sangam Podhupu",
  monthlyFee: 200,
  joiningFee: 100,
  loanProcessingFee: 50,
  annualMemberInterestRate: 0,
  currency: "₹",
  address: "Balapur,R.R. Dist, Telangana",
  lastSyncDate: null,
  googleDriveClientId: "",
  githubToken: "",
  githubRepo: "",
  githubBranch: "main",
  adminPassword: "admin",
  operatorCode: "operator",
  viewerCode: "viewer",
  defaultLoanInterestRate: 2,   // 2% per month (legacy / fallback)
  defaultRegularLoanRate: 0.8,  // 0.8% per month for Regular Loans
  defaultSpecialLoanRate: 1.5,  // 1.5% per month for Special Loans
  themeMode: 'light' as const,
  accentColor: 'blue' as const,
  bannerImage: "https://media.istockphoto.com/id/1417583870/photo/growth-financial-business-arrow-money-coin-on-increase-earnings-3d-background-with-economy.jpg?s=2048x2048&w=is&k=20&c=q0Ye2vGZ-swv_nwkMFnhzUXdb9388nIeyFPfhwUA6gQ="
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

const FIRST_NAMES = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Ayaan", "Krishna", "Ishaan",
  "Shaurya", "Atharva", "Neerav", "Dhruv", "Kabir", "Rian", "Aaryan", "Om", "Ansh", "Ray",
  "Rohan", "Aryan", "Aayush", "Siddharth", "Ayush", "Virat", "Arnav", "Advik", "Dev", "Samarth",
  "Riya", "Diya", "Ananya", "Aadhya", "Pari", "Saanvi", "Myra", "Kiara", "Prisha", "Anvi",
  "Aanya", "Aadya", "Amaira", "Kyra", "Navya", "Sara", "Shanaya", "Zara", "Aaradhya", "Kavya"
];

const LAST_NAMES = [
  "Sharma", "Verma", "Gupta", "Malhotra", "Bhatia", "Saxena", "Mehta", "Jain", "Singh", "Yadav",
  "Das", "Patel", "Shah", "Rao", "Nair", "Reddy", "Kumar", "Chopra", "Desai", "Joshi",
  "Kapoor", "Khan", "Agarwal", "Bansal", "Trivedi", "Iyengar", "Iyer", "Menon", "Pillai", "Gowda"
];

const generateMembers = (count: number) => {
  const members = [];
  for (let i = 1; i <= count; i++) {
    const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    const wing = ["A", "B", "C", "D", "E"][Math.floor(Math.random() * 5)];
    const floor = Math.floor(Math.random() * 8) + 1;
    const flat = Math.floor(Math.random() * 4) + 1;

    // Random join date in 2023
    const month = Math.floor(Math.random() * 12) + 1;
    const day = Math.floor(Math.random() * 28) + 1;
    const joinDate = `2023-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

    members.push({
      id: i.toString(),
      name: `${firstName} ${lastName}`,
      phone: `9${Math.floor(Math.random() * 900000000 + 100000000)}`,
      address: `${wing}-${floor}0${flat}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`,
      joinDate: joinDate,
      isActive: Math.random() > 0.05 // 95% active
    });
  }
  return members;
};

export const MOCK_MEMBERS = generateMembers(100);

// Generate some mock payments for previous months
export const generateMockPayments = () => {
  const payments = [];
  const year = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Generate for current year up to current month
  for (let m = 1; m < currentMonth; m++) {
    MOCK_MEMBERS.forEach(mem => {
      if (mem.isActive) {
        // 90% chance of paying
        if (Math.random() > 0.1) {
          // 10% chance of being late
          const isLate = Math.random() < 0.1;
          const amount = DEFAULT_SETTINGS.monthlyFee;
          const lateFee = isLate ? 50 : 0;

          payments.push({
            id: `pay_${mem.id}_${m}_${year}`,
            memberId: mem.id,
            amount: amount,
            lateFee: lateFee,
            date: new Date(year, m - 1, isLate ? 25 : 5).toISOString(),
            month: m,
            year: year,
            method: Math.random() > 0.6 ? PaymentMethod.UPI : PaymentMethod.CASH, // 60% UPI
            notes: isLate ? 'Late payment' : undefined
          });
        }
      }
    })
  }
  return payments;
};

export const FISCAL_YEARS = ['All', 'PRE-2026', '2026-2027', '2027-2028', '2028-2029'];

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
  } catch (e) {
    return dateString;
  }
};
