export const parseISODateParts = (dateStr: string) => {
  const [yearStr = '', monthStr = '', dayStr = '1'] = dateStr.split('T')[0].split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (!year || !month || !day) {
    throw new Error(`Invalid ISO date: ${dateStr}`);
  }

  return { year, month, day };
};

export const isoDateToTimestamp = (dateStr: string, endOfDay = false) => {
  const { year, month, day } = parseISODateParts(dateStr);
  return Date.UTC(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
};

export const compareISODate = (a: string, b: string) => isoDateToTimestamp(a) - isoDateToTimestamp(b);

export const isISODateBefore = (a: string, b: string) => compareISODate(a, b) < 0;

export const isISODateOnOrBefore = (a: string, b: string) => compareISODate(a, b) <= 0;

export const getISODateMonthYear = (dateStr: string) => {
  const { year, month } = parseISODateParts(dateStr);
  return { year, month };
};

export const getLastDayOfMonthISO = (year: number, month: number) => {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
};

export const getFinancialYearBounds = (financialYear: string) => {
  if (financialYear === 'PRE-2026') {
    return { start: '1900-01-01', end: '2026-03-31' };
  }

  const [startYear] = financialYear.split('-').map(Number);
  return {
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`
  };
};

export const formatDisplayDate = (dateStr: string) => {
  const { year, month, day } = parseISODateParts(dateStr);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, day)));
};
