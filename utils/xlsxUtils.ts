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
  sheetName?: string,
  societyName?: string
): void => {
  if (format === 'XLSX') {
    downloadAsStylishXLSX(rows, filename, sheetName);
  } else if (format === 'PDF') {
    downloadAsPDF(rows, filename, societyName);
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

/** Helper to draw a structured 3-column summary grid */
const drawSummaryGrid = (doc: jsPDF, summary: (string | number | null | undefined)[][], startY: number): number => {
  const margin = 15;
  const colWidth = 90; 
  let x = margin;
  let y = startY;
  
  doc.setFontSize(9);
  
  summary.forEach((row, i) => {
    const label = String(row[0] || '');
    const value = String(row[1] ?? '');
    
    // Draw background for label
    doc.setFillColor(248, 250, 252); // slate-50
    doc.rect(x, y - 4, colWidth - 5, 6, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`${label}:`, x + 2, y);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text(value, x + 35, y);
    
    if ((i + 1) % 3 === 0) {
      x = margin;
      y += 8;
    } else {
      x += colWidth;
    }
  });

  return (summary.length % 3 === 0) ? y : y + 8;
};

/** Download 2D array as a Landscape PDF using jsPDF + AutoTable */
export const downloadAsPDF = (
  rows: (string | number | null | undefined)[][],
  filename: string,
  societyName?: string
): void => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const headerIdx = rows.findIndex(r => r.includes('Sl.No'));
  
  if (headerIdx === -1) {
    doc.text(rows.map(r => r.join(' | ')).join('\n'), 10, 10);
  } else {
    // Top Header & Branding
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(societyName || 'Society Ledger System', 15, 10);
    
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text('Loan Ledger Report', 282, 12, { align: 'right' });
    
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.line(15, 15, 282, 15);

    const summary = rows.slice(0, headerIdx).filter(r => r.length > 0 && r[0]);
    const finalGridY = drawSummaryGrid(doc, summary, 25);

    const tableHeaders = rows[headerIdx];
    const tableData = rows.slice(headerIdx + 1);

    autoTable(doc, {
      startY: finalGridY + 5,
      head: [tableHeaders],
      body: tableData as any[][],
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2, lineColor: [226, 232, 240] },
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' }, 
      alternateRowStyles: { fillColor: [248, 250, 252] }, 
      columnStyles: {
        5: { halign: 'right' }, 
        6: { halign: 'right' }, 
        7: { halign: 'right' }, 
        8: { halign: 'right' }, 
      },
      didParseCell: (data) => {
        const row = data.row.raw as any[];
        if (row && row[4] === 'GRAND TOTAL') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [226, 232, 240]; 
          data.cell.styles.textColor = [30, 41, 59];
        }
      }
    });

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Page ${i} of ${pageCount}`, 282, 205, { align: 'right' });
    }
  }

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
};

/** Download multiple 2D arrays into a single multi-page PDF */
export const downloadAllAsPDF = (
  sheets: (string | number | null | undefined)[][][],
  filename: string,
  societyName?: string
): void => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  sheets.forEach((rows, index) => {
    if (index > 0) doc.addPage();

    const headerIdx = rows.findIndex(r => r.includes('Sl.No'));
    
    if (headerIdx === -1) {
      doc.text(rows.map(r => r.join(' | ')).join('\n'), 10, 10);
    } else {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(148, 163, 184);
      doc.text(societyName || 'Society Ledger System', 15, 10);
      
      doc.setFontSize(18);
      doc.setTextColor(30, 41, 59);
      doc.text('Loan Ledger Report', 282, 12, { align: 'right' });
      
      doc.setDrawColor(226, 232, 240);
      doc.line(15, 15, 282, 15);

      const summary = rows.slice(0, headerIdx).filter(r => r.length > 0 && r[0]);
      const finalGridY = drawSummaryGrid(doc, summary, 25);

      const tableHeaders = rows[headerIdx];
      const tableData = rows.slice(headerIdx + 1);

      autoTable(doc, {
        startY: finalGridY + 5,
        head: [tableHeaders],
        body: tableData as any[][],
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2, lineColor: [226, 232, 240] },
        headStyles: { fillColor: [51, 65, 85], textColor: 255 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          5: { halign: 'right' },
          6: { halign: 'right' },
          7: { halign: 'right' },
          8: { halign: 'right' },
        },
        didParseCell: (data) => {
          const row = data.row.raw as any[];
          if (row && row[4] === 'GRAND TOTAL') {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [226, 232, 240];
          }
        }
      });
    }
  });

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${i} of ${pageCount}`, 282, 205, { align: 'right' });
  }

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
  title: string,
  societyName?: string
): void => {
  if (rows.length === 0) return;
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(societyName || 'Society Ledger System', 15, 10);
  
  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text(title, 282, 12, { align: 'right' });
  
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.line(15, 15, 282, 15);

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
