import React, { useState, useMemo } from 'react';
import { 
  Clipboard, 
  CheckCircle2, 
  AlertCircle, 
  UploadCloud, 
  Trash2, 
  ArrowRight,
  UserPlus,
  Zap,
  ChevronRight,
  ShieldCheck,
  FileSpreadsheet
} from 'lucide-react';
import { useFinancials } from '../context/FinancialContext';
import { useMembers } from '../context/MemberContext';
import { useSettings } from '../context/SettingsContext';
import { Member, Loan, LoanStatus, LoanType, PaymentMethod } from '../types';
import { normalizeISODate } from '../utils/date';
import { getInterestRateForDate } from '../utils/interest';
import { logger } from '../utils/logger';
import { supabase } from '../supabaseClient';

interface ImportRow {
  sno: string;
  date: string;
  memberId: string;
  memberName: string;
  voucher: string;
  debit: number;
  credit: number;
  narration: string;
  status: 'PENDING' | 'VALID' | 'INVALID' | 'DUPLICATE';
  errors: string[];
  mappedMemberId?: string;
  mappedLoanId?: string;
  action?: 'CREATE_MEMBER' | 'CREATE_LOAN' | 'ADD_TOPUP' | 'ADD_REPAYMENT' | 'SKIP';
}

export const ImportData: React.FC = () => {
  const { members, addMember } = useMembers();
  const { settings } = useSettings();
  const { loans, createLoan, addLoanTopup, recordLoanRepayment } = useFinancials();
  const [pasteContent, setPasteContent] = useState('');
  const [parsedRows, setParsedRows] = useState<ImportRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importStep, setImportStep] = useState<'INPUT' | 'PREVIEW' | 'SUCCESS'>('INPUT');
  const [importSummary, setImportSummary] = useState({
    members: 0,
    loans: 0,
    topups: 0,
    repayments: 0
  });

  const parseImportDate = (dateStr: string): string => {
    if (!dateStr) return '';
    return normalizeISODate(dateStr.trim());
  };

  const cleanAmount = (val: string): number => {
    if (!val) return 0;
    return Number(val.replace(/[₹,]/g, '').trim()) || 0;
  };

  const handleParsePaste = () => {
    if (!pasteContent.trim()) return;

    const lines = pasteContent.trim().split('\n');
    const membersInImport = new Set<string>();
    const newlyDiscoveredMembers = new Set<string>();
    const rows: ImportRow[] = [];
    
    lines.forEach((line, idx) => {
      // 1. Split by tabs first (primary Excel/Web format delimiter)
      let rawCols = line.split('\t');
      
      // If no tabs, try commas
      if (rawCols.length < 5) {
         rawCols = line.split(',');
      }
      
      // If still no tabs or commas, try 2+ spaces as a last resort
      if (rawCols.length < 5) {
         rawCols = line.split(/ {2,}/);
      }
      
      // 2. Trim and filter out completely empty cols
      const cols = rawCols.map(c => c.trim()).filter(c => c !== '');
      
      if (cols.length < 5) return; // Skip invalid rows
      
      // Skip headers
      const col1 = (cols[0] || '').toLowerCase();
      const col2 = (cols[1] || '').toLowerCase();
      if (col1.includes('s.no') || col2.includes('date') || col2.includes('member')) return;

      try {
        // 3. Robust Column Identification by pivoting on the Voucher type
        // This handles cases where S.No or Member ID might be missing or merged.
        const vIdx = cols.findIndex(c => {
            const lc = c.toLowerCase();
            return lc === 'loan' || lc === 'payment';
        });

        if (vIdx === -1 || vIdx < 1) return; // Need at least something before the voucher (Date or Name)

        let voucher = cols[vIdx]; // "Loan" or "Payment"
        let isLoan = voucher.toLowerCase() === 'loan';
        
        // Narrative is usually after the amount
        let narration = cols[vIdx + 2] || '';
        if (!narration && cols[vIdx + 1] && !cols[vIdx + 1].includes('₹') && isNaN(Number(cols[vIdx + 1].replace(/[₹,]/g, '')))) {
            // If col+1 doesn't look like an amount, maybe it's the narration?
            // But usually Amount is always there.
        }

        let amountStr = cols[vIdx + 1] || '';
        let debit = isLoan ? cleanAmount(amountStr) : 0;
        let credit = !isLoan ? cleanAmount(amountStr) : 0;

        // Work backwards from vIdx
        let memberName = cols[vIdx - 1] || '';
        let memberId = vIdx >= 2 ? cols[vIdx - 2] : '';
        let dateStr = vIdx >= 3 ? cols[vIdx - 3] : (vIdx === 2 ? cols[0] : '');
        
        // If vIdx was 2, it means: [Date, Name, Voucher]
        // If vIdx was 3, it means: [Date, ID, Name, Voucher]
        // If vIdx was 4, it means: [SNo, Date, ID, Name, Voucher]
        
        // Let's refine the backwards mapping based on common patterns
        let date = '';
        let sno = '';

        if (vIdx === 1) {
            // [Date/Name?, Voucher] -> Too sparse, but let's try
            date = parseImportDate(cols[0]);
            memberName = 'Unknown'; 
        } else if (vIdx === 2) {
            // [Date, Name, Voucher]
            date = parseImportDate(cols[0]);
            memberName = cols[1];
            memberId = '';
        } else if (vIdx === 3) {
            // [Date, ID, Name, Voucher]
            date = parseImportDate(cols[0]);
            memberId = cols[1];
            memberName = cols[2];
        } else if (vIdx >= 4) {
            // [SNo, Date, ID, Name, Voucher]
            sno = cols[0];
            date = parseImportDate(cols[1]);
            memberId = cols[2];
            memberName = cols[3];
        }

        const row: ImportRow = {
          sno,
          date,
          memberId,
          memberName,
          voucher,
          debit,
          credit,
          narration,
          status: 'PENDING',
          errors: []
        };

        // Validation
        if (!row.memberName || row.memberName === 'Unknown') row.errors.push('Missing Member Name');
        if (!row.date) row.errors.push('Invalid Date Format');
        if (row.voucher.toLowerCase() !== 'loan' && row.voucher.toLowerCase() !== 'payment') {
          row.errors.push(`Unknown Voucher: ${row.voucher}`);
        }

        // Map member
        const memberKey = (row.memberId || row.memberName || '').toLowerCase();
        const existingMember = members.find(m => 
          (row.memberId && m.id === row.memberId) || 
          (row.memberName && m.name.toLowerCase() === row.memberName.toLowerCase())
        );
        
        if (existingMember) {
          row.mappedMemberId = existingMember.id;
        } else if (memberKey && !newlyDiscoveredMembers.has(memberKey)) {
          row.action = 'CREATE_MEMBER';
          newlyDiscoveredMembers.add(memberKey);
        }

        // Action Refinement (Voucher Logic)
        if (row.errors.length === 0) {
          if (row.voucher === 'Loan') {
            if (row.narration.toLowerCase().includes('top-up') || membersInImport.has(memberKey)) {
              if (!membersInImport.has(memberKey)) {
                row.action = 'CREATE_LOAN';
                membersInImport.add(memberKey);
              } else {
                row.action = 'ADD_TOPUP';
              }
            } else {
              row.action = 'CREATE_LOAN';
              membersInImport.add(memberKey);
            }
          } else if (row.voucher === 'Payment') {
            row.action = 'ADD_REPAYMENT';
          }
        }

        row.status = row.errors.length > 0 ? 'INVALID' : 'VALID';
        rows.push(row);
      } catch (err) {
        console.error('Row parsing failed:', err);
      }
    });

    if (rows.length === 0) {
      alert('Could not detect any valid data rows. Please ensure you are copying the table correctly (including headers).');
      return;
    }

    setParsedRows(rows);
    setImportStep('PREVIEW');
  };

  const handleCommit = async () => {
    setIsProcessing(true);
    let memberCount = 0;
    let loanCount = 0;
    let topupCount = 0;
    let repaymentCount = 0;

    const memberMap = new Map<string, string>(); // Member Name/ImportID -> Real ID
    const loanMap = new Map<string, string>();   // MemberKey -> New Loan ID

    try {
      for (const row of parsedRows) {
        if (row.status === 'INVALID' || row.action === 'SKIP') continue;

        let currentMemberId = row.mappedMemberId;
        const memberKey = (row.memberId || row.memberName).toLowerCase();

        // 1. Ensure Member
        if (!currentMemberId && !memberMap.has(memberKey)) {
          const newMemberId = row.memberId || `mem_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
          await addMember({
            id: newMemberId,
            name: row.memberName,
            phone: '',
            address: '',
            email: '',
            joinDate: row.date,
            isActive: true
          });
          memberMap.set(memberKey, newMemberId);
          currentMemberId = newMemberId;
          memberCount++;
        } else if (!currentMemberId) {
          currentMemberId = memberMap.get(memberKey);
        }

        // 2. Ensure / Find Loan
        // Check local map first (loans created in this import)
        let currentLoanId = loanMap.get(memberKey);
        
        // Fallback to existing active loans if not in current import
        if (!currentLoanId) {
           currentLoanId = loans.find(l => l.memberId === currentMemberId && l.status === LoanStatus.ACTIVE)?.id;
        }

        if (row.action === 'CREATE_LOAN') {
          const newLoanId = `loan_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
          // Use direct supabase call to get the ID immediately and bypass stale state
          const { data: newLoan, error } = await supabase.from('loans').insert({
            id: newLoanId,
            member_id: currentMemberId!,
            principal_amount: row.debit,
            interest_rate: getInterestRateForDate(row.date, settings),
            start_date: row.date,
            status: LoanStatus.ACTIVE,
            loan_type: LoanType.SPECIAL,
            is_legacy: true,
            financial_year: 'PRE-2026'
          }).select().single();

          if (error) throw error;
          if (newLoan) {
             loanMap.set(memberKey, newLoan.id);
             loanCount++;
          }
        } else if (row.action === 'ADD_TOPUP') {
          const targetLoanId = loanMap.get(memberKey) || currentLoanId;
          if (targetLoanId) {
            await addLoanTopup({
              loanId: targetLoanId,
              amount: row.debit,
              rate: getInterestRateForDate(row.date, settings),
              date: row.date,
              notes: row.narration
            });
            topupCount++;
          }
        } else if (row.action === 'ADD_REPAYMENT') {
          const targetLoanId = loanMap.get(memberKey) || currentLoanId;
          if (targetLoanId) {
            await recordLoanRepayment({
              loanId: targetLoanId,
              date: row.date,
              amount: row.credit,
              principalPaid: row.credit, 
              interestPaid: 0,
              method: PaymentMethod.CASH,
              notes: row.narration
            });
            repaymentCount++;
          }
        }
      }

      setImportSummary({
        members: memberCount,
        loans: loanCount,
        topups: topupCount,
        repayments: repaymentCount
      });
      setImportStep('SUCCESS');
    } catch (err) {
      logger.error('Import failed:', err);
      alert('Import failed! Check logs.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getActionStyles = (action?: string) => {
    switch (action) {
      case 'CREATE_MEMBER': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300';
      case 'CREATE_LOAN': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
      case 'ADD_TOPUP': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
      case 'ADD_REPAYMENT': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
      default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <UploadCloud className="text-primary-600" />
            Legacy Data Importer
          </h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400 max-w-2xl">
            Digitize your paper ledgers instantly. Copy rows from Excel and paste them below. 
            The system will automatically link members, create loans, and record history.
          </p>
        </div>
        
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400 uppercase tracking-wider">
          <ShieldCheck size={14} className="text-emerald-500" />
          Safe Sandbox Mode
        </div>
      </div>

      {importStep === 'INPUT' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Instructions */}
          <div className="lg:col-span-1 space-y-6">
            <div className="rounded-3xl border border-white/60 bg-white/40 p-6 shadow-xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/50">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-4">
                <Zap className="text-amber-500" size={18} />
                Quick Start Guide
              </h3>
              <ul className="space-y-4">
                {[
                  { icon: FileSpreadsheet, text: "Open your Excel/Google Sheet" },
                  { icon: Clipboard, text: "Copy all rows (including headers)" },
                  { icon: CheckCircle2, text: "Paste into the box on the right" },
                  { icon: ArrowRight, text: "Review the dry-run summary" }
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-400 font-bold text-[10px]">
                      {i+1}
                    </div>
                    <span>{step.text}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 p-4 rounded-2xl bg-slate-50 border border-slate-100 dark:bg-slate-800/40 dark:border-slate-700/50">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Column Order Expected:</p>
                <div className="flex flex-wrap gap-1.5">
                  {['S.no', 'Date', 'ID', 'Name', 'Voucher', 'Debit', 'Credit', 'Narration'].map(c => (
                    <span key={c} className="px-2 py-1 rounded bg-white dark:bg-slate-900 text-[10px] border border-slate-100 dark:border-slate-800 font-mono">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Paste Area */}
          <div className="lg:col-span-2 space-y-4">
            <div className="group relative rounded-3xl border-2 border-dashed border-slate-200 bg-white p-2 transition-all hover:border-primary-400 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <textarea
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder="Paste your ledger rows here..."
                className="h-[400px] w-full resize-none bg-transparent p-6 text-sm font-mono focus:outline-none dark:text-slate-300"
              />
              {!pasteContent && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                  <Clipboard size={48} className="mb-4 opacity-20" />
                  <p className="text-sm">Clipboard data will appear here</p>
                </div>
              )}
            </div>
            
            <div className="flex justify-end">
              <button
                onClick={handleParsePaste}
                disabled={!pasteContent.trim()}
                className="flex items-center gap-2 rounded-2xl bg-primary-600 px-8 py-4 font-bold text-white shadow-lg shadow-primary-500/25 transition-all hover:bg-primary-500 hover:scale-[1.02] disabled:opacity-50 disabled:grayscale"
              >
                Analyze Data
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {importStep === 'PREVIEW' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-3xl border border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Rows</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-white">{parsedRows.length}</p>
            </div>
            <div className="rounded-3xl border border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1">New Members</p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {parsedRows.filter(r => r.action === 'CREATE_MEMBER').length}
              </p>
            </div>
            <div className="rounded-3xl border border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">New Loans</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {parsedRows.filter(r => r.action === 'CREATE_LOAN').length}
              </p>
            </div>
            <div className="rounded-3xl border border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-1">Top-ups</p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {parsedRows.filter(r => r.action === 'ADD_TOPUP').length}
              </p>
            </div>
          </div>

          {/* Preview Table */}
          <div className="rounded-3xl border border-slate-100 bg-white/80 overflow-hidden shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                    <th className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400 w-12 text-center text-[10px] uppercase tracking-wider">S.no</th>
                    <th className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-wider">Member</th>
                    <th className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-wider">Voucher</th>
                    <th className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400 text-right text-[10px] uppercase tracking-wider">Debit (₹)</th>
                    <th className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400 text-right text-[10px] uppercase tracking-wider">Credit (₹)</th>
                    <th className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-wider">Action</th>
                    <th className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {parsedRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 text-center text-slate-400 font-mono text-xs">{row.sno}</td>
                      <td className="px-6 py-4 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">{row.date}</td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900 dark:text-white capitalize">{row.memberName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">ID: {row.memberId || 'NEW'}</div>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-600 dark:text-slate-400">{row.voucher}</td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                        {row.debit > 0 ? `₹${row.debit.toLocaleString()}` : '—'}
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {row.credit > 0 ? `₹${row.credit.toLocaleString()}` : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getActionStyles(row.action)}`}>
                          {row.action?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 border-l border-slate-100 dark:border-slate-800">
                        {row.errors.length > 0 ? (
                           <div className="flex items-center gap-1.5 text-rose-500 text-xs font-medium">
                              <AlertCircle size={14} />
                              {row.errors[0]}
                           </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-emerald-500 text-xs font-medium">
                              <CheckCircle2 size={14} />
                              Ready
                           </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4">
            <button
               onClick={() => setImportStep('INPUT')}
               className="flex items-center gap-2 rounded-2xl border border-slate-200 px-6 py-3 font-bold text-slate-600 transition-all hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
               <Trash2 size={18} />
               Discard & Restart
            </button>

            <button
              onClick={handleCommit}
              disabled={isProcessing || parsedRows.some(r => r.status === 'INVALID')}
              className="flex items-center gap-2 rounded-2xl bg-primary-600 px-10 py-4 font-xl font-black text-white shadow-2xl shadow-primary-500/40 transition-all hover:bg-primary-500 hover:scale-[1.03] disabled:opacity-50 disabled:grayscale"
            >
              {isProcessing ? 'Writing to Ledger...' : 'Commit to Database'}
              {!isProcessing && <Zap size={18} className="fill-white" />}
            </button>
          </div>
        </div>
      )}

      {importStep === 'SUCCESS' && (
        <div className="py-12 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-500">
          <div className="mb-8 p-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 shadow-2xl shadow-emerald-500/20">
            <CheckCircle2 size={72} />
          </div>
          <h2 className="text-4xl font-black text-slate-900 dark:text-white mb-4">Import Successful!</h2>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mb-8">
            The legacy records have been successfully digitized and added to the audit ledger. 
            All interest calculations have been primed based on these historical milestones.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-2xl mb-12">
            {[
              { label: 'Members', val: importSummary.members, color: 'text-purple-600' },
              { label: 'Loans', val: importSummary.loans, color: 'text-blue-600' },
              { label: 'Top-ups', val: importSummary.topups, color: 'text-amber-600' },
              { label: 'Payments', val: importSummary.repayments, color: 'text-emerald-600' }
            ].map(s => (
              <div key={s.label} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{s.label}</p>
                <p className={`text-2xl font-black ${s.color}`}>{s.val}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-4">
             <button
               onClick={() => window.location.hash = '#/'}
               className="rounded-2xl border border-slate-200 px-8 py-4 font-bold text-slate-600 transition-all hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
             >
               Go to Special Loans
             </button>
             <button
               onClick={() => {
                 setPasteContent('');
                 setImportStep('INPUT');
               }}
               className="rounded-2xl bg-slate-900 px-8 py-4 font-bold text-white shadow-xl transition-all hover:bg-slate-800 dark:bg-primary-600 dark:hover:bg-primary-500"
             >
               Import More Data
             </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportData;
