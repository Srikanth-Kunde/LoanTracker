import { SocietySettings } from '../types';

/**
 * Returns the applicable interest rate for a specific date based on system rules.
 * Rules are evaluated by end date. If a date falls before or on a rule's end date, 
 * that rate is returned.
 */
export const getInterestRateForDate = (date: string, settings: SocietySettings): number => {
  if (!settings.interestRateRules || settings.interestRateRules.length === 0) {
    return settings.defaultLoanInterestRate || 1.5;
  }

  // Sort rules by end date ascending (earliest first)
  const sortedRules = [...settings.interestRateRules].sort((a, b) => {
    if (!a.endDate) return 1;
    if (!b.endDate) return -1;
    return a.endDate.localeCompare(b.endDate);
  });

  const rule = sortedRules.find(r => !r.endDate || date <= r.endDate);
  return rule ? rule.rate : (settings.defaultLoanInterestRate || 1.5);
};
