
export enum PaymentMethod {
  CASH = 'CASH',
  UPI = 'UPI',
  BANK_TRANSFER = 'BANK_TRANSFER'
}

export enum PaymentCategory {
  SAVINGS = 'SAVINGS',
  JOINING_FEE = 'JOINING_FEE',
  ANNUAL_MEMBER_INTEREST = 'ANNUAL_MEMBER_INTEREST'
}

export enum UserRole {
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
  VIEWER = 'VIEWER'
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentColor = 'blue' | 'emerald' | 'violet' | 'amber' | 'rose' | 'cyan';

export interface Member {
  id: string;
  name: string;
  phone: string;
  address: string;
  email: string;
  joinDate: string;
  isActive: boolean;
}

export interface Payment {
  id: string;
  memberId: string;
  amount: number;
  lateFee?: number;
  date: string; // ISO Date string
  month: number; // 1-12
  year: number;
  method: PaymentMethod;
  notes?: string;
  isLegacy?: boolean;
  financialYear?: string;
  description?: string;
  category?: PaymentCategory;
}

export enum LoanStatus {
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
  REJECTED = 'REJECTED'
}

export enum LoanType {
  REGULAR = 'REGULAR',
  SPECIAL = 'SPECIAL'
}

export type LoanCalculationMethod = 'REDUCING_VARIABLE' | 'EMI_FLAT' | 'INTEREST_ONLY';

export interface LoanTopup {
  id: string;
  loanId: string;
  amount: number;
  rate: number;           // rate at time of top-up
  date: string;           // ISO date — top-up disbursement date
  notes?: string;
  createdAt?: string;
}

export interface Loan {
  id: string;
  memberId: string;
  principalAmount: number;
  processingFee?: number;
  interestRate: number; // Percentage per month
  durationMonths?: number;
  calculationMethod?: LoanCalculationMethod;
  startDate: string;
  endDate?: string;
  status: LoanStatus;
  type: LoanType;
  remarks?: string;
  isLegacy?: boolean;
  financialYear?: string;
  description?: string;
  surety1Id?: string;
  surety2Id?: string;
  
  // Dynamically added for UI rendering
  isSpecial?: boolean;
  disbursed?: number;
  topupsTotal?: number;
  missedMonths?: string[];
  missedMonthsDetails?: {
    month: number;
    year: number;
    principal: number;
    interest: number;
    lateFee: number;
  }[];
}

export interface LoanRepayment {
  id: string;
  loanId: string;
  date: string;
  amount: number; // Total paid (principal + interest) excluding late fee usually, or including? 
  // Typically amount = principal + interest. Late fee is separate.
  interestPaid: number;
  principalPaid: number;
  lateFee?: number;
  method: PaymentMethod;
  notes?: string;
}

export interface SocietySettings {
  societyName: string;
  monthlyFee: number;
  joiningFee?: number;
  loanProcessingFee?: number;
  annualMemberInterestRate?: number;
  currency: string;
  address: string;
  lastSyncDate: string | null;
  googleDriveClientId?: string;
  githubToken?: string;
  githubRepo?: string;
  githubBranch?: string;
  adminPassword?: string;
  operatorCode?: string;
  viewerCode?: string;
  defaultLoanInterestRate?: number; // Monthly interest rate % (legacy field)
  defaultRegularLoanRate?: number;  // Monthly interest rate % for Regular Loans
  defaultSpecialLoanRate?: number;  // Monthly interest rate % for Special Loans
  themeMode?: ThemeMode;
  accentColor?: AccentColor;
  bannerImage?: string;
}

export interface AppState {
  members: Member[];
  payments: Payment[];
  loans: Loan[];
  loanRepayments: LoanRepayment[];
  settings: SocietySettings;
}

export interface PaymentStatus {
  member: Member;
  isPaid: boolean;
  payment?: Payment;
}
