/**
 * xlsxUtils.ts
 * 
 * Thin wrappers around SheetJS (xlsx) and plain-CSV blob downloads.
 * All download helpers accept row data as (string | number | null | undefined)[][]
 * with the first row being headers.
 */

import * as XLSX from 'xlsx';

export type DownloadFormat = 'CSV' | 'XLSX';

// ── CSV helpers ───────────────────────────────────────────────────────────────

const escapeCsvValue = (value: string | number | null | undefined): string => {
  const normalized = value == null ? '' : String(value);
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
};

// ── Public API ────────────────────────────────────────────────────────────────

/** Download 2D array as CSV */
export const downloadAsCSV = (
  rows: (string | number | null | undefined)[][],
  filename: string
): void => {
  const csvContent = rows
    .map(row => row.map(escapeCsvValue).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
};

/** Download 2D array as XLSX (single worksheet) */
export const downloadAsXLSX = (
  rows: (string | number | null | undefined)[][],
  filename: string,
  sheetName = 'Sheet1'
): void => {
  const ws = XLSX.utils.aoa_to_sheet(rows as any[][]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31)); // Excel sheet name max 31 chars
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
};

/** Download multiple named sheets as a single XLSX workbook */
export const downloadMultiSheetXLSX = (
  sheets: { name: string; rows: (string | number | null | undefined)[][] }[],
  filename: string
): void => {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    const safeName = name.replace(/[:\\/?*[\]]/g, '_').slice(0, 31);
    const ws = XLSX.utils.aoa_to_sheet(rows as any[][]);
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  });
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
};

/** Dispatcher — calls the appropriate download based on format */
export const downloadAs = (
  rows: (string | number | null | undefined)[][],
  filename: string,
  format: DownloadFormat,
  sheetName?: string
): void => {
  if (format === 'XLSX') {
    downloadAsXLSX(rows, filename, sheetName);
  } else {
    downloadAsCSV(rows, filename);
  }
};

// ── Internal ──────────────────────────────────────────────────────────────────

const triggerDownload = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
