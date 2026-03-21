
export enum PaymentMethod {
  CASH = 'CASH',
  UPI = 'UPI',
  BANK_TRANSFER = 'BANK_TRANSFER'
}

export enum PaymentCategory {
  LOAN_REPAYMENT = 'LOAN_REPAYMENT',
  OTHER = 'OTHER'
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
  SPECIAL = 'SPECIAL'
}

export type LoanCalculationMethod = 'INTEREST_ONLY';

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
  interestForMonth?: number;
  interestForYear?: number;
  method: PaymentMethod;
  notes?: string;
  createdAt?: string;
}

export interface SocietySettings {
  societyName: string;
  loanProcessingFee?: number;
  currency: string;
  adminPassword?: string;
  operatorCode?: string;
  viewerCode?: string;
  defaultLoanInterestRate?: number;
  themeMode?: ThemeMode;
  accentColor?: AccentColor;
  bannerImage?: string;
}
