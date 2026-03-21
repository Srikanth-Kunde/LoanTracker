export const parseISODateParts = (dateStr: string) => {
  if (!dateStr) throw new Error("Empty date string");
  
  // Clean string and split by common delimiters (- or /)
  const clean = dateStr.split('T')[0].trim();
  const parts = clean.split(/[-/]/);
  
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }

  let year: number, month: number, day: number;

  // Detect format by checking where the 4-digit year is
  if (parts[0].length === 4) {
    // Treat as YYYY-MM-DD
    year = Number(parts[0]);
    month = Number(parts[1]);
    day = Number(parts[2]);
  } else if (parts[2].length === 4) {
    // Treat as DD-MM-YYYY or MM-DD-YYYY
    // Our system assumes Indian format DD-MM-YYYY for legacy manual data
    day = Number(parts[0]);
    month = Number(parts[1]);
    year = Number(parts[2]);
  } else {
    throw new Error(`Unrecognized date format (needs YYYY at start or end): ${dateStr}`);
  }

  if (isNaN(year) || isNaN(month) || isNaN(day) || !year || !month || !day) {
    throw new Error(`Invalid date values detected: ${dateStr}`);
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
  // Use 0 as the day to get the last day of the PREVIOUS month relative to 'month'
  // If month is 1 (Jan), day 0 gives Dec 31 of year-1
  const date = new Date(Date.UTC(year, month, 0));
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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
  if (!dateStr) return '—';
  try {
    const { year, month, day } = parseISODateParts(dateStr);
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(new Date(Date.UTC(year, month - 1, day)));
  } catch (e) {
    return dateStr;
  }
};
export const normalizeISODate = (dateStr: string) => {
  if (!dateStr) return '';
  try {
    const { year, month, day } = parseISODateParts(dateStr);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } catch (e) {
    return dateStr;
  }
};
