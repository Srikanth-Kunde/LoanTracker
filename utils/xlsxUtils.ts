/**
 * xlsxUtils.ts
 * 
 * Thin wrappers around SheetJS (xlsx) and plain-CSV blob downloads.
 * All download helpers accept row data as (string | number | null | undefined)[][]
 * with the first row being headers.
 */

import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export type DownloadFormat = 'CSV' | 'XLSX' | 'PDF';

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
    downloadAsStylishXLSX(rows, filename, sheetName);
  } else if (format === 'PDF') {
    downloadAsPDF(rows, filename);
  } else {
    downloadAsCSV(rows, filename);
  }
};

/** Download 2D array as XLSX with styling using ExcelJS */
export const downloadAsStylishXLSX = async (
  rows: (string | number | null | undefined)[][],
  filename: string,
  sheetName = 'Ledger'
): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName.slice(0, 31));

  // Find the header row (has 'Sl.No')
  const headerIdx = rows.findIndex(r => r.includes('Sl.No'));
  const dataRows = rows;

  dataRows.forEach((row, i) => {
    const wsRow = worksheet.addRow(row);
    
    // Apply styling to the top summary block (before the main table)
    if (headerIdx !== -1 && i < headerIdx) {
      const cellA = wsRow.getCell(1);
      const cellB = wsRow.getCell(2);
      cellA.font = { bold: true };
      cellA.alignment = { horizontal: 'left' };
      cellB.alignment = { horizontal: 'right' };
      if (typeof row[1] === 'number') {
        cellB.numFmt = '#,##0.00';
      }
    }

    // Apply styling to the table header
    if (i === headerIdx) {
      wsRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF444444' }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        cell.alignment = { horizontal: 'center' };
      });
    }

    // Apply styling to table data
    if (headerIdx !== -1 && i > headerIdx) {
      wsRow.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        
        // Align numeric columns
        if ([6, 7, 8, 9].includes(colNumber)) {
          cell.alignment = { horizontal: 'right' };
          cell.numFmt = '#,##0.00';
        }

        // Highlight "GRAND TOTAL" row
        if (String(row[4]).includes('GRAND TOTAL')) {
          cell.font = { bold: true };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF0F0F0' }
          };
        }
      });
    }
  });

  // Auto-fit columns
  worksheet.columns.forEach(column => {
    let maxLen = 0;
    column.eachCell?.({ includeEmpty: true }, cell => {
      const len = cell.value ? String(cell.value).length : 5;
      if (len > maxLen) maxLen = len;
    });
    column.width = Math.min(maxLen + 2, 40);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  triggerDownload(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
};

/** Download generic 2D array table as XLSX with styling and proper numbers (non-Ledger specific) */
export const downloadStylishGenericXLSX = async (
  rows: (string | number | null | undefined)[][],
  filename: string,
  sheetName = 'Sheet1'
): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName.slice(0, 31));

  if (rows.length === 0) return;

  rows.forEach((row, i) => {
    const wsRow = worksheet.addRow(row);
    
    // Assume row 0 is headers
    if (i === 0) {
      wsRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF444444' }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    } else {
      wsRow.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        // Auto-cast strings that are actually numbers to numbers if they seem numeric (and aren't dates)
        // Wait, for Generic XLSX it's better if caller passes actual numbers
        if (typeof cell.value === 'number') {
          cell.alignment = { horizontal: 'right' };
          cell.numFmt = '#,##0.00';
        }
      });
    }
  });

  // Auto-fit columns
  worksheet.columns.forEach(column => {
    let maxLen = 0;
    column.eachCell?.({ includeEmpty: true }, cell => {
      const len = cell.value ? String(cell.value).length : 5;
      if (len > maxLen) maxLen = len;
    });
    // Add small padding, limit to 40 logic
    column.width = Math.min(Math.max(maxLen + 2, 10), 40);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  triggerDownload(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
};

/** Download 2D array as a Landscape PDF using jsPDF + AutoTable */
export const downloadAsPDF = (
  rows: (string | number | null | undefined)[][],
  filename: string
): void => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  // Find the header row (has 'Sl.No')
  const headerIdx = rows.findIndex(r => r.includes('Sl.No'));
  
  if (headerIdx === -1) {
    // If no table structure, just dump rows (fallback)
    doc.text(rows.map(r => r.join(' | ')).join('\n'), 10, 10);
  } else {
    // Top summary block
    const summary = rows.slice(0, headerIdx).filter(r => r.length > 0 && r[0]);
    let y = 15;
    
    doc.setFontSize(14);
    doc.text('Loan Ledger Report', 140, 10, { align: 'center' });
    doc.setFontSize(10);
    
    summary.forEach(row => {
      doc.setFont('helvetica', 'bold');
      doc.text(`${String(row[0])}:`, 15, y);
      doc.setFont('helvetica', 'normal');
      doc.text(`${String(row[1] ?? '')}`, 50, y);
      y += 5;
    });

    // Main Table
    const tableHeaders = rows[headerIdx];
    const tableData = rows.slice(headerIdx + 1);

    autoTable(doc, {
      startY: y + 5,
      head: [tableHeaders],
      body: tableData as any[][],
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [68, 68, 68], textColor: 255 },
      columnStyles: {
        5: { halign: 'right' }, // Debit
        6: { halign: 'right' }, // Credit
        7: { halign: 'right' }, // Interest
        8: { halign: 'right' }, // Balance
      },
      didParseCell: (data) => {
        // Bold the totals row
        const row = data.row.raw as any[];
        if (row && row[4] === 'GRAND TOTAL') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 240];
        }
      }
    });
  }

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
};

/** Download multiple 2D arrays into a single multi-page PDF */
export const downloadAllAsPDF = (
  sheets: (string | number | null | undefined)[][][],
  filename: string
): void => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  sheets.forEach((rows, index) => {
    if (index > 0) doc.addPage();

    // Find the header row (has 'Sl.No')
    const headerIdx = rows.findIndex(r => r.includes('Sl.No'));
    
    if (headerIdx === -1) {
      doc.text(rows.map(r => r.join(' | ')).join('\n'), 10, 10);
    } else {
      // Top summary block
      const summary = rows.slice(0, headerIdx).filter(r => r.length > 0 && r[0]);
      let y = 15;
      
      doc.setFontSize(14);
      doc.text('Loan Ledger Report', 140, 10, { align: 'center' });
      doc.setFontSize(10);
      
      summary.forEach(row => {
        doc.setFont('helvetica', 'bold');
        doc.text(`${String(row[0])}:`, 15, y);
        doc.setFont('helvetica', 'normal');
        doc.text(`${String(row[1] ?? '')}`, 50, y);
        y += 5;
      });

      // Main Table
      const tableHeaders = rows[headerIdx];
      const tableData = rows.slice(headerIdx + 1);

      autoTable(doc, {
        startY: y + 5,
        head: [tableHeaders],
        body: tableData as any[][],
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [68, 68, 68], textColor: 255 },
        columnStyles: {
          5: { halign: 'right' }, // Debit
          6: { halign: 'right' }, // Credit
          7: { halign: 'right' }, // Interest
          8: { halign: 'right' }, // Balance
        },
        didParseCell: (data) => {
          // Bold the totals row
          const row = data.row.raw as any[];
          if (row && row[4] === 'GRAND TOTAL') {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [240, 240, 240];
          }
        }
      });
    }
  });

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
};

/**
 * Creates a ZIP file containing multiple CSV files
 * Each entry in 'files' should be { name: string, rows: 2D array }
 */
export const downloadAsZip = async (
  files: { name: string; rows: (string | number | null | undefined)[][] }[],
  zipFilename: string
): Promise<void> => {
  const zip = new JSZip();

  files.forEach(({ name, rows }) => {
    const csvContent = rows
      .map(row => row.map(escapeCsvValue).join(','))
      .join('\n');
    // Ensure filename ends with .csv
    const safeName = name.endsWith('.csv') ? name : `${name}.csv`;
    zip.file(safeName, '\uFEFF' + csvContent);
  });

  const content = await zip.generateAsync({ type: 'blob' });
  triggerDownload(content, zipFilename.endsWith('.zip') ? zipFilename : `${zipFilename}.zip`);
};

// ── Internal ──────────────────────────────────────────────────────────────────

/** Download generic 2D array table as Landscape PDF */
export const downloadGenericTableAsPDF = (
  rows: (string | number | null | undefined)[][],
  filename: string,
  title: string
): void => {
  if (rows.length === 0) return;
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  doc.setFontSize(14);
  doc.text(title, 140, 15, { align: 'center' });

  const headers = rows[0];
  const tableData = rows.slice(1);

  autoTable(doc, {
    startY: 25,
    head: [headers],
    body: tableData as any[][],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [68, 68, 68], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 20 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && typeof data.cell.raw === 'number') {
         data.cell.styles.halign = 'right';
      }
    }
  });

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
};

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
