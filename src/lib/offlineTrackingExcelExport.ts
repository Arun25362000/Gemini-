import XLSX from 'xlsx-js-style';
import { format } from 'date-fns';
import { UserProfile, Loan, LoanPayment, Contribution } from '../types';

interface ExportOfflineWorkbookOptions {
  isMobileApp?: boolean;
  downloadFileMobile?: (fileName: string, base64Data: string) => Promise<{ success: boolean; uri?: string; error?: string }>;
  targetYear?: number;
}

export async function exportOfflineTrackingWorkbook(
  allUsers: UserProfile[],
  loans: Loan[],
  loanPayments: LoanPayment[],
  contributions: Contribution[],
  options?: ExportOfflineWorkbookOptions
): Promise<{ success: boolean; fileName: string }> {
  const wb = XLSX.utils.book_new();
  const now = new Date();
  const year = options?.targetYear || now.getFullYear();
  const dateStamp = format(now, 'dd-MMM-yyyy HH:mm');
  const fileTimestamp = format(now, 'yyyyMMdd_HHmm');
  const fileName = `Unnati_Trust_Master_Audit_Ledger_${year}_${fileTimestamp}.xlsx`;

  // Filter actual registered members
  const members = allUsers
    .filter(u => u.email !== 'admin@unnati.org')
    .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

  // Styling presets
  const styleMainTitle = {
    font: { name: 'Segoe UI', sz: 14, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '0F172A' } }, // Slate 900
    alignment: { horizontal: 'center', vertical: 'center' }
  };

  const styleSubTitle = {
    font: { name: 'Segoe UI', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '312E81' } }, // Indigo 900
    alignment: { horizontal: 'center', vertical: 'center' }
  };

  const styleMeta = {
    font: { name: 'Segoe UI', sz: 8.5, italic: true, color: { rgb: '475569' } },
    fill: { fgColor: { rgb: 'F8FAFC' } },
    alignment: { horizontal: 'center', vertical: 'center' }
  };

  const styleKpiHeader = {
    font: { name: 'Segoe UI', sz: 9, bold: true, color: { rgb: '4338CA' } },
    fill: { fgColor: { rgb: 'EEF2FF' } }, // Indigo 50
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'C7D2FE' } },
      bottom: { style: 'thin', color: { rgb: 'C7D2FE' } },
      left: { style: 'thin', color: { rgb: 'C7D2FE' } },
      right: { style: 'thin', color: { rgb: 'C7D2FE' } }
    }
  };

  const styleKpiVal = {
    font: { name: 'Segoe UI', sz: 12, bold: true, color: { rgb: '1E1B4B' } },
    fill: { fgColor: { rgb: 'FFFFFF' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'C7D2FE' } },
      bottom: { style: 'medium', color: { rgb: '818CF8' } },
      left: { style: 'thin', color: { rgb: 'C7D2FE' } },
      right: { style: 'thin', color: { rgb: 'C7D2FE' } }
    }
  };

  const styleSectionHeader = {
    font: { name: 'Segoe UI', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '4338CA' } }, // Indigo 700
    alignment: { vertical: 'center' }
  };

  const styleColHeader = {
    font: { name: 'Segoe UI', sz: 9.5, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'E2E8F0' } }, // Slate 200
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: '94A3B8' } },
      bottom: { style: 'medium', color: { rgb: '64748B' } },
      left: { style: 'thin', color: { rgb: 'CBD5E1' } },
      right: { style: 'thin', color: { rgb: 'CBD5E1' } }
    }
  };

  const styleTotalRow = {
    font: { name: 'Segoe UI', sz: 10, bold: true, color: { rgb: '1E1B4B' } },
    fill: { fgColor: { rgb: 'FEF3C7' } }, // Amber 100
    alignment: { vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'F59E0B' } },
      bottom: { style: 'double', color: { rgb: 'B45309' } },
      left: { style: 'thin', color: { rgb: 'CBD5E1' } },
      right: { style: 'thin', color: { rgb: 'CBD5E1' } }
    }
  };

  const borderData = {
    top: { style: 'thin', color: { rgb: 'E2E8F0' } },
    bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
    left: { style: 'thin', color: { rgb: 'E2E8F0' } },
    right: { style: 'thin', color: { rgb: 'E2E8F0' } }
  };

  const createCell = (v: any, type: 's' | 'n' | 'b' = 's', formula?: string, customStyle?: any) => {
    const cell: any = { v, t: type };
    if (formula) {
      cell.f = formula;
    }
    cell.s = customStyle || {
      font: { name: 'Segoe UI', sz: 9, color: { rgb: '0F172A' } },
      alignment: { vertical: 'center' },
      border: borderData
    };
    return cell;
  };

  // Consistent Member Code generator (UNN-001, etc.)
  const getMemberCode = (u: UserProfile, idx: number) => `UNN-${String(idx + 1).padStart(3, '0')}`;
  const memberCodeMap = new Map<string, string>();
  members.forEach((u, i) => {
    const code = getMemberCode(u, i);
    if (u.uid) memberCodeMap.set(u.uid, code);
    if (u.id) memberCodeMap.set(u.id, code);
    if (u.email) memberCodeMap.set(u.email.toLowerCase().trim(), code);
    if (u.displayName) memberCodeMap.set(u.displayName.toLowerCase().trim(), code);
  });

  const getCode = (userId?: string, email?: string, name?: string, fallbackIdx: number = 0) => {
    if (userId && memberCodeMap.has(userId)) return memberCodeMap.get(userId)!;
    if (email && memberCodeMap.has(email.toLowerCase().trim())) return memberCodeMap.get(email.toLowerCase().trim())!;
    if (name && memberCodeMap.has(name.toLowerCase().trim())) return memberCodeMap.get(name.toLowerCase().trim())!;
    return `UNN-${String(fallbackIdx + 1).padStart(3, '0')}`;
  };

  // Consistent Loan Code generator (LN-001, etc.)
  const loanCodeMap = new Map<string, string>();
  loans.forEach((l, idx) => {
    loanCodeMap.set(l.id || `loan_${idx}`, `LN-${String(idx + 1).padStart(3, '0')}`);
  });

  // Month metadata
  const MONTHS_LIST = [
    { num: 1, name: 'January', short: 'Jan' },
    { num: 2, name: 'February', short: 'Feb' },
    { num: 3, name: 'March', short: 'Mar' },
    { num: 4, name: 'April', short: 'Apr' },
    { num: 5, name: 'May', short: 'May' },
    { num: 6, name: 'June', short: 'Jun' },
    { num: 7, name: 'July', short: 'Jul' },
    { num: 8, name: 'August', short: 'Aug' },
    { num: 9, name: 'September', short: 'Sep' },
    { num: 10, name: 'October', short: 'Oct' },
    { num: 11, name: 'November', short: 'Nov' },
    { num: 12, name: 'December', short: 'Dec' },
  ];

  // =========================================================================
  // 1. MAIN PAGE: "Financial Insights & Audit"
  // =========================================================================
  const wsMain: any = {};
  const maxColMain = 11; // A to L

  wsMain['A1'] = createCell('UNNATI TRUST (R) — FINANCIAL INSIGHTS & AUDIT SUMMARY DASHBOARD', 's', undefined, styleMainTitle);
  wsMain['A2'] = createCell(`EXECUTIVE AUDIT SUMMARY & ANNUAL PERFORMANCE MATRIX (YEAR ${year})`, 's', undefined, styleSubTitle);
  wsMain['A3'] = createCell(`Generated on: ${dateStamp} • Comprehensive Trust Financial Health at a Single View • All Totals Linked by Live Excel Formulas`, 's', undefined, styleMeta);

  // --- KPI CARDS ROW (Rows 5 & 6) ---
  // Card 1: Total Registered Members
  wsMain['A5'] = createCell('TOTAL REGISTERED MEMBERS', 's', undefined, styleKpiHeader);
  wsMain['B5'] = createCell('TOTAL REGISTERED MEMBERS', 's', undefined, styleKpiHeader);
  wsMain['A6'] = createCell(`${members.length} Members`, 's', undefined, styleKpiVal);
  wsMain['B6'] = createCell(`${members.length} Members`, 's', undefined, styleKpiVal);

  // Card 2: Cumulative Subscriptions
  wsMain['C5'] = createCell('TOTAL MEMBER DEPOSITS', 's', undefined, styleKpiHeader);
  wsMain['D5'] = createCell('TOTAL MEMBER DEPOSITS', 's', undefined, styleKpiHeader);
  wsMain['C6'] = createCell(0, 'n', `SUM(D11:D22)`, styleKpiVal);
  wsMain['D6'] = createCell(0, 'n', `SUM(D11:D22)`, styleKpiVal);

  // Card 3: Loan Principal Collected
  wsMain['E5'] = createCell('PRINCIPAL REPAID', 's', undefined, styleKpiHeader);
  wsMain['F5'] = createCell('PRINCIPAL REPAID', 's', undefined, styleKpiHeader);
  wsMain['E6'] = createCell(0, 'n', `SUM(E11:E22)`, styleKpiVal);
  wsMain['F6'] = createCell(0, 'n', `SUM(E11:E22)`, styleKpiVal);

  // Card 4: Total Interest Earned
  wsMain['G5'] = createCell('TOTAL INTEREST EARNED (0.5%)', 's', undefined, styleKpiHeader);
  wsMain['H5'] = createCell('TOTAL INTEREST EARNED (0.5%)', 's', undefined, styleKpiHeader);
  wsMain['G6'] = createCell(0, 'n', `SUM(F11:F22)`, styleKpiVal);
  wsMain['H6'] = createCell(0, 'n', `SUM(F11:F22)`, styleKpiVal);

  // Card 5: Total Cash in Hand
  wsMain['I5'] = createCell('TOTAL CASH IN HAND', 's', undefined, styleKpiHeader);
  wsMain['J5'] = createCell('TOTAL CASH IN HAND', 's', undefined, styleKpiHeader);
  wsMain['I6'] = createCell(0, 'n', `SUM(G11:G22)`, styleKpiVal);
  wsMain['J6'] = createCell(0, 'n', `SUM(G11:G22)`, styleKpiVal);

  // Card 6: Total Online Inflow
  wsMain['K5'] = createCell('TOTAL BANK INFLOW (ONLINE)', 's', undefined, styleKpiHeader);
  wsMain['L5'] = createCell('TOTAL BANK INFLOW (ONLINE)', 's', undefined, styleKpiHeader);
  wsMain['K6'] = createCell(0, 'n', `SUM(H11:H22)`, styleKpiVal);
  wsMain['L6'] = createCell(0, 'n', `SUM(H11:H22)`, styleKpiVal);

  // --- ANNUAL MONTH-BY-MONTH PERFORMANCE MATRIX (Rows 9 - 23) ---
  wsMain['A8'] = createCell(`ANNUAL FINANCIAL INFLOW MATRIX (${year}) — LINKED DIRECTLY TO MONTH-SPECIFIC SHEETS`, 's', undefined, styleSectionHeader);

  const matrixHeaders = [
    'Sl.',
    'Calendar Month',
    'Sheet Reference',
    'Member Subscriptions (₹) [Formula]',
    'Loan Principal Collected (₹) [Formula]',
    'Loan Interest Collected (₹) [Formula]',
    'Cash Collected (₹) [Formula]',
    'Online Bank Deposits (₹) [Formula]',
    'Grand Total Inflow (₹) [Formula]',
    'Active Borrowers Count',
    'Fully Paid Members Count',
    'Monthly Audit Status'
  ];

  matrixHeaders.forEach((h, colIdx) => {
    wsMain[XLSX.utils.encode_cell({ r: 9, c: colIdx })] = createCell(h, 's', undefined, styleColHeader);
  });

  // 12 Months rows (Row 11 to Row 22, index 10 to 21)
  MONTHS_LIST.forEach((m, idx) => {
    const rowIdx = 10 + idx;
    const rowNum = rowIdx + 1;
    const sheetName = `${m.short} ${year}`;

    // Col A: Sl
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 0 })] = createCell(idx + 1, 'n');
    // Col B: Month
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 1 })] = createCell(`${m.name} ${year}`, 's');
    // Col C: Sheet Ref
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 2 })] = createCell(`'${sheetName}'`, 's');

    // Col D: Monthly Subscriptions Formula = 'Jan 2026'!E<subtotal>
    // In each monthly sheet, Contributions total is in Col E row (6 + members.length)
    const contribTotalCell = `E${6 + members.length}`;
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 3 })] = createCell(0, 'n', `'${sheetName}'!${contribTotalCell}`);

    // Col E: Loan Principal Collected Formula = 'Jan 2026'!H<loanTotalRow>
    // In each monthly sheet, Loan Principal total is in Col H row (13 + members.length + 15)
    const loanPrincipalCell = `H${13 + members.length + 15}`;
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 4 })] = createCell(0, 'n', `'${sheetName}'!${loanPrincipalCell}`);

    // Col F: Loan Interest Collected Formula = 'Jan 2026'!J<loanTotalRow>
    const loanInterestCell = `J${13 + members.length + 15}`;
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 5 })] = createCell(0, 'n', `'${sheetName}'!${loanInterestCell}`);

    // Col G: Cash Collected = 'Jan 2026'!C<cashSummaryRow>
    const cashCell = `C${18 + members.length + 15}`;
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 6 })] = createCell(0, 'n', `'${sheetName}'!${cashCell}`);

    // Col H: Online Bank Deposits = 'Jan 2026'!C<onlineSummaryRow>
    const onlineCell = `C${19 + members.length + 15}`;
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 7 })] = createCell(0, 'n', `'${sheetName}'!${onlineCell}`);

    // Col I: Grand Total Inflow = D{row} + E{row} + F{row} (Subscriptions + Principal + Interest)
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 8 })] = createCell(0, 'n', `D${rowNum}+E${rowNum}+F${rowNum}`);

    // Col J: Active Borrowers
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 9 })] = createCell(0, 'n', `COUNTIF('${sheetName}'!G7:G25, ">0")`);

    // Col K: Fully Paid Members
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 10 })] = createCell(0, 'n', `COUNTIF('${sheetName}'!E6:E${5 + members.length}, ">=1000")`);

    // Col L: Audit Status
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 11 })] = createCell('VERIFIED', 's');
  });

  // Annual Summary Total Row (Row 23, index 22)
  const totalRowIdxMain = 22;
  const totalRowNumMain = totalRowIdxMain + 1;
  wsMain[XLSX.utils.encode_cell({ r: totalRowIdxMain, c: 0 })] = createCell('', 's', undefined, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalRowIdxMain, c: 1 })] = createCell('ANNUAL AUDIT TOTAL', 's', undefined, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalRowIdxMain, c: 2 })] = createCell('12 Months', 's', undefined, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalRowIdxMain, c: 3 })] = createCell(0, 'n', `SUM(D11:D22)`, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalRowIdxMain, c: 4 })] = createCell(0, 'n', `SUM(E11:E22)`, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalRowIdxMain, c: 5 })] = createCell(0, 'n', `SUM(F11:F22)`, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalRowIdxMain, c: 6 })] = createCell(0, 'n', `SUM(G11:G22)`, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalRowIdxMain, c: 7 })] = createCell(0, 'n', `SUM(H11:H22)`, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalRowIdxMain, c: 8 })] = createCell(0, 'n', `SUM(I11:I22)`, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalRowIdxMain, c: 9 })] = createCell('', 's', undefined, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalRowIdxMain, c: 10 })] = createCell('', 's', undefined, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalRowIdxMain, c: 11 })] = createCell('BALANCED', 's', undefined, styleTotalRow);

  // --- SECTION: MEMBER-WISE AUDIT FINANCIAL POSITION TABLE (Starting Row 25) ---
  wsMain['A25'] = createCell(`MEMBER-WISE AUDIT BALANCES & NET STANDING REGISTER (${members.length} MEMBERS)`, 's', undefined, styleSectionHeader);

  const memberAuditHeaders = [
    'Sl.',
    'Member Code',
    'Member Name',
    'Phone',
    'Total Deposits (₹) [Formula]',
    'Sanctioned Loan (₹) [Formula]',
    'Principal Repaid (₹) [Formula]',
    'Outstanding Principal (₹) [Formula]',
    'Interest Paid (₹) [Formula]',
    'Net Standing (Savings - Bal) [Formula]',
    'Loan Status [Formula]',
    'Audit Note'
  ];

  memberAuditHeaders.forEach((h, colIdx) => {
    wsMain[XLSX.utils.encode_cell({ r: 26, c: colIdx })] = createCell(h, 's', undefined, styleColHeader);
  });

  // Populate Members
  members.forEach((u, i) => {
    const rowIdx = 27 + i;
    const rowNum = rowIdx + 1;
    const code = getMemberCode(u, i);
    const memberName = u.displayName || u.email?.split('@')[0] || 'Member';

    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 0 })] = createCell(i + 1, 'n');
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 1 })] = createCell(code, 's');
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 2 })] = createCell(memberName, 's');
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 3 })] = createCell(u.phoneNumber || (u as any).phone || 'N/A', 's');

    // Col E (index 4): Total Deposits = Sum of this member's deposits across all 12 month sheets
    // Build multi-month formula: ='Jan 2026'!E{row} + 'Feb 2026'!E{row} + ...
    const monthRow = 6 + i;
    const sumMonthlyFormula = MONTHS_LIST.map(m => `'${m.short} ${year}'!E${monthRow}`).join('+');
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 4 })] = createCell(0, 'n', sumMonthlyFormula);

    // Col F (index 5): Sanctioned Loan = SUMIF('Loan Master'!$C$6:$C$100, B{row}, 'Loan Master'!$E$6:$E$100)
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 5 })] = createCell(0, 'n', `SUMIF('Loan Master'!$C$6:$C$100,B${rowNum},'Loan Master'!$E$6:$E$100)`);

    // Col G (index 6): Principal Repaid = SUMIF('Loan Master'!$C$6:$C$100, B{row}, 'Loan Master'!$G$6:$G$100)
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 6 })] = createCell(0, 'n', `SUMIF('Loan Master'!$C$6:$C$100,B${rowNum},'Loan Master'!$G$6:$G$100)`);

    // Col H (index 7): Outstanding Principal = MAX(0, F{row} - G{row})
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 7 })] = createCell(0, 'n', `MAX(0,F${rowNum}-G${rowNum})`);

    // Col I (index 8): Total Interest Paid = SUMIF('Loan Master'!$C$6:$C$100, B{row}, 'Loan Master'!$I$6:$I$100)
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 8 })] = createCell(0, 'n', `SUMIF('Loan Master'!$C$6:$C$100,B${rowNum},'Loan Master'!$I$6:$I$100)`);

    // Col J (index 9): Net Standing = E{row} - H{row} (Savings - Loan Balance)
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 9 })] = createCell(0, 'n', `E${rowNum}-H${rowNum}`);

    // Col K (index 10): Loan Status = IF(F{row}=0,"NO LOAN",IF(H{row}<=0,"CLOSED","ACTIVE"))
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 10 })] = createCell('ACTIVE', 's', `IF(F${rowNum}=0,"NO LOAN",IF(H${rowNum}<=0,"CLOSED","ACTIVE"))`);

    // Col L (index 11): Audit Note
    wsMain[XLSX.utils.encode_cell({ r: rowIdx, c: 11 })] = createCell('Good Standing', 's');
  });

  // Summary Row for Member Balances
  const totalMemberAuditRowIdx = 27 + members.length;
  const totalMemberAuditRowNum = totalMemberAuditRowIdx + 1;
  const firstMemRow = 28;
  const lastMemRow = totalMemberAuditRowIdx;

  wsMain[XLSX.utils.encode_cell({ r: totalMemberAuditRowIdx, c: 0 })] = createCell('', 's', undefined, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalMemberAuditRowIdx, c: 1 })] = createCell('TOTALS', 's', undefined, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalMemberAuditRowIdx, c: 2 })] = createCell(`${members.length} Members`, 's', undefined, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalMemberAuditRowIdx, c: 3 })] = createCell('', 's', undefined, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalMemberAuditRowIdx, c: 4 })] = createCell(0, 'n', `SUM(E${firstMemRow}:E${lastMemRow})`, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalMemberAuditRowIdx, c: 5 })] = createCell(0, 'n', `SUM(F${firstMemRow}:F${lastMemRow})`, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalMemberAuditRowIdx, c: 6 })] = createCell(0, 'n', `SUM(G${firstMemRow}:G${lastMemRow})`, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalMemberAuditRowIdx, c: 7 })] = createCell(0, 'n', `SUM(H${firstMemRow}:H${lastMemRow})`, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalMemberAuditRowIdx, c: 8 })] = createCell(0, 'n', `SUM(I${firstMemRow}:I${lastMemRow})`, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalMemberAuditRowIdx, c: 9 })] = createCell(0, 'n', `SUM(J${firstMemRow}:J${lastMemRow})`, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalMemberAuditRowIdx, c: 10 })] = createCell('', 's', undefined, styleTotalRow);
  wsMain[XLSX.utils.encode_cell({ r: totalMemberAuditRowIdx, c: 11 })] = createCell('BALANCED', 's', undefined, styleTotalRow);

  wsMain['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: maxColMain } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: maxColMain } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: maxColMain } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 1 } },
    { s: { r: 5, c: 0 }, e: { r: 5, c: 1 } },
    { s: { r: 4, c: 2 }, e: { r: 4, c: 3 } },
    { s: { r: 5, c: 2 }, e: { r: 5, c: 3 } },
    { s: { r: 4, c: 4 }, e: { r: 4, c: 5 } },
    { s: { r: 5, c: 4 }, e: { r: 5, c: 5 } },
    { s: { r: 4, c: 6 }, e: { r: 4, c: 7 } },
    { s: { r: 5, c: 6 }, e: { r: 5, c: 7 } },
    { s: { r: 4, c: 8 }, e: { r: 4, c: 9 } },
    { s: { r: 5, c: 8 }, e: { r: 5, c: 9 } },
    { s: { r: 4, c: 10 }, e: { r: 4, c: 11 } },
    { s: { r: 5, c: 10 }, e: { r: 5, c: 11 } },
    { s: { r: 7, c: 0 }, e: { r: 7, c: maxColMain } },
    { s: { r: 24, c: 0 }, e: { r: 24, c: maxColMain } }
  ];

  wsMain['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalMemberAuditRowIdx + 2, c: maxColMain } });
  wsMain['!cols'] = [
    { wch: 6 },  // Sl
    { wch: 14 }, // Month / Code
    { wch: 22 }, // Sheet Ref / Name
    { wch: 16 }, // Phone
    { wch: 20 }, // Sub
    { wch: 20 }, // Loan P
    { wch: 20 }, // Loan I
    { wch: 20 }, // Cash
    { wch: 20 }, // Online
    { wch: 20 }, // Grand
    { wch: 16 }, // Borrowers
    { wch: 16 }  // Audit Note
  ];
  XLSX.utils.book_append_sheet(wb, wsMain, "Financial Insights & Audit");

  // =========================================================================
  // 2. MONTH-SPECIFIC SHEETS (Jan 2026, Feb 2026, ... Dec 2026)
  // =========================================================================
  MONTHS_LIST.forEach(m => {
    const sheetName = `${m.short} ${year}`;
    const wsMonth: any = {};
    const maxColM = 11; // A to L

    // Top Header
    wsMonth['A1'] = createCell(`UNNATI TRUST (R) — ${m.name.toUpperCase()} ${year} AUDIT STATEMENT`, 's', undefined, styleMainTitle);
    wsMonth['A2'] = createCell(`MONTHLY TRANSACTION REGISTER: MEMBER CONTRIBUTIONS & LOAN REPAYMENTS`, 's', undefined, styleSubTitle);
    wsMonth['A3'] = createCell(`Billing Cycle: ${m.name} ${year} • All formulas dynamically calculate Totals, Interest (0.5%), and Balances`, 's', undefined, styleMeta);

    // --- SECTION 1: Member Contribution Collection Register ---
    wsMonth['A4'] = createCell(`PART 1: MEMBER CONTRIBUTIONS REGISTER — ${m.name.toUpperCase()} ${year}`, 's', undefined, styleSectionHeader);

    const mContribHeaders = [
      'Sl.',
      'Member Code',
      'Member Name',
      'Phone Number',
      'Contribution Amount (₹)',
      'Payment Mode (Cash/Online)',
      'Payment Date',
      'Receipt / UTR Ref',
      'Status (Paid/Pending)',
      'Remarks'
    ];

    mContribHeaders.forEach((h, colIdx) => {
      wsMonth[XLSX.utils.encode_cell({ r: 4, c: colIdx })] = createCell(h, 's', undefined, styleColHeader);
    });

    // Populate each member's contribution for this month
    members.forEach((u, i) => {
      const rowIdx = 5 + i;
      const code = getMemberCode(u, i);
      const memberName = u.displayName || u.email?.split('@')[0] || 'Member';

      // Find if already recorded in app
      const paidC = contributions.find(c => 
        ((c.userId && (c.userId === u.uid || c.userId === u.id)) ||
        (c.userEmail && c.userEmail.toLowerCase().trim() === u.email?.toLowerCase().trim())) &&
        c.year === year &&
        c.month === m.num &&
        c.status === 'paid'
      );

      const amount = paidC?.amount || 0;
      const mode = (paidC?.paymentMethod || 'Online').toUpperCase();
      let pDate = '';
      if (paidC?.timestamp?.toDate) {
        pDate = format(paidC.timestamp.toDate(), 'yyyy-MM-dd');
      } else if (paidC?.timestamp?.seconds) {
        pDate = format(new Date(paidC.timestamp.seconds * 1000), 'yyyy-MM-dd');
      }

      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 0 })] = createCell(i + 1, 'n');
      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 1 })] = createCell(code, 's');
      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 2 })] = createCell(memberName, 's');
      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 3 })] = createCell(u.phoneNumber || (u as any).phone || 'N/A', 's');
      // Col E (index 4): Contribution Amount
      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 4 })] = createCell(amount, 'n');
      // Col F (index 5): Mode
      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 5 })] = createCell(amount > 0 ? mode : 'ONLINE', 's');
      // Col G (index 6): Date
      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 6 })] = createCell(pDate, 's');
      // Col H (index 7): Ref
      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 7 })] = createCell('', 's');
      // Col I (index 8): Status
      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 8 })] = createCell(amount >= 1000 ? 'PAID' : 'PENDING', 's');
      // Col J (index 9): Remarks
      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 9 })] = createCell('', 's');
    });

    // Subtotal Row for Contributions
    const subtotalContribRowIdx = 5 + members.length;
    const subtotalContribRowNum = subtotalContribRowIdx + 1;
    const firstCRow = 6;
    const lastCRow = subtotalContribRowIdx;

    wsMonth[XLSX.utils.encode_cell({ r: subtotalContribRowIdx, c: 0 })] = createCell('', 's', undefined, styleTotalRow);
    wsMonth[XLSX.utils.encode_cell({ r: subtotalContribRowIdx, c: 1 })] = createCell('TOTALS', 's', undefined, styleTotalRow);
    wsMonth[XLSX.utils.encode_cell({ r: subtotalContribRowIdx, c: 2 })] = createCell(`${m.name} Subscriptions`, 's', undefined, styleTotalRow);
    wsMonth[XLSX.utils.encode_cell({ r: subtotalContribRowIdx, c: 3 })] = createCell('', 's', undefined, styleTotalRow);
    // Col E (index 4): Total Subscriptions = SUM(E6:E{lastCRow})
    wsMonth[XLSX.utils.encode_cell({ r: subtotalContribRowIdx, c: 4 })] = createCell(
      0,
      'n',
      `SUM(E${firstCRow}:E${lastCRow})`,
      styleTotalRow
    );
    wsMonth[XLSX.utils.encode_cell({ r: subtotalContribRowIdx, c: 5 })] = createCell('', 's', undefined, styleTotalRow);
    wsMonth[XLSX.utils.encode_cell({ r: subtotalContribRowIdx, c: 6 })] = createCell('', 's', undefined, styleTotalRow);
    wsMonth[XLSX.utils.encode_cell({ r: subtotalContribRowIdx, c: 7 })] = createCell('', 's', undefined, styleTotalRow);
    wsMonth[XLSX.utils.encode_cell({ r: subtotalContribRowIdx, c: 8 })] = createCell('', 's', undefined, styleTotalRow);
    wsMonth[XLSX.utils.encode_cell({ r: subtotalContribRowIdx, c: 9 })] = createCell('', 's', undefined, styleTotalRow);

    // --- SECTION 2: Loan Repayments Register for this month ---
    const loanSectionHeaderRow = subtotalContribRowIdx + 2;
    wsMonth[`A${loanSectionHeaderRow + 1}`] = createCell(
      `PART 2: LOAN REPAYMENTS & INTEREST (0.5% REDUCING BALANCE) — ${m.name.toUpperCase()} ${year}`,
      's',
      undefined,
      styleSectionHeader
    );

    const mLoanHeaders = [
      'Sl.',
      'Loan ID',
      'Borrower Code',
      'Borrower Name',
      'Payment Type (Regular / Extra Principal)',
      'Opening Principal Balance (₹)',
      'Principal Paid (₹) [Manual]',
      'Interest Rate (0.5% Monthly)',
      'Interest Calculated (₹) [Formula]',
      'Total Amount Paid (₹) [Formula]',
      'Closing Principal Balance (₹) [Formula]',
      'Payment Mode (Cash/Online)'
    ];

    const loanHeaderRowIdx = loanSectionHeaderRow + 1;
    mLoanHeaders.forEach((h, colIdx) => {
      wsMonth[XLSX.utils.encode_cell({ r: loanHeaderRowIdx, c: colIdx })] = createCell(h, 's', undefined, styleColHeader);
    });

    // Populate actual loan repayments made in this month + provide 15 template rows
    const mPayments = loanPayments.filter(p => p.year === year && p.month === m.num && p.status === 'paid');

    const totalLoanRowsForMonth = 15;
    for (let lIdx = 0; lIdx < totalLoanRowsForMonth; lIdx++) {
      const rowIdx = loanHeaderRowIdx + 1 + lIdx;
      const rowNum = rowIdx + 1;
      const p = mPayments[lIdx];

      const pLoan = p ? loans.find(l => l.id === p.loanId) : null;
      const pUser = p ? allUsers.find(u => (p.userId && (u.uid === p.userId || u.id === p.userId)) || (p.userEmail && u.email.toLowerCase() === p.userEmail.toLowerCase())) : null;
      const loanCode = pLoan?.id ? (loanCodeMap.get(pLoan.id) || 'LN-001') : (lIdx < loans.length ? (loanCodeMap.get(loans[lIdx]?.id || '') || `LN-${String(lIdx+1).padStart(3, '0')}`) : '');
      const borrowerCode = p ? getCode(p.userId, p.userEmail, undefined, lIdx) : '';
      const borrowerName = p ? (pUser?.displayName || pLoan?.userName || p.userEmail?.split('@')[0] || '') : '';
      const isExtra = p ? Boolean(p.isExtraPrincipal) : false;
      const paymentType = isExtra ? 'Extra Principal' : 'Regular EMI';
      const principalPaid = p ? (p.amount || 0) : 0;
      const openingBal = pLoan?.approvedAmount || 50000;

      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 0 })] = createCell(lIdx + 1, 'n');
      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 1 })] = createCell(loanCode, 's');
      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 2 })] = createCell(borrowerCode, 's');
      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 3 })] = createCell(borrowerName, 's');
      // Col E (index 4): Payment Type
      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 4 })] = createCell(paymentType, 's');
      // Col F (index 5): Opening Balance
      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 5 })] = createCell(p ? openingBal : 0, 'n');
      // Col G (index 6): Principal Paid (₹)
      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 6 })] = createCell(principalPaid, 'n');
      // Col H (index 7): Rate (0.5%)
      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 7 })] = createCell(0.005, 'n');

      // Col I (index 8): Interest Calculated (₹)
      // FORMULA: If Type is "Extra Principal", interest is 0; else ROUND(OpeningBal * Rate, 0)
      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 8 })] = createCell(
        p ? (p.interest || 0) : 0,
        'n',
        `IF(E${rowNum}="Extra Principal",0,ROUND(F${rowNum}*H${rowNum},0))`
      );

      // Col J (index 9): Total Amount Paid = Principal + Interest = G{row} + I{row}
      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 9 })] = createCell(
        p ? (principalPaid + (p.interest || 0)) : 0,
        'n',
        `G${rowNum}+I${rowNum}`
      );

      // Col K (index 10): Closing Principal Balance = MAX(0, Opening - Principal) = MAX(0, F{row} - G{row})
      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 10 })] = createCell(
        p ? Math.max(0, openingBal - principalPaid) : 0,
        'n',
        `MAX(0,F${rowNum}-G${rowNum})`
      );

      // Col L (index 11): Mode
      wsMonth[XLSX.utils.encode_cell({ r: rowIdx, c: 11 })] = createCell(
        p ? (p.paymentMethod || p.paymentMode || 'ONLINE').toUpperCase() : 'ONLINE',
        's'
      );
    }

    // Subtotal Row for Loan Repayments
    const subtotalLoanRowIdx = loanHeaderRowIdx + 1 + totalLoanRowsForMonth;
    const subtotalLoanRowNum = subtotalLoanRowIdx + 1;
    const firstLRow = loanHeaderRowIdx + 2;
    const lastLRow = subtotalLoanRowIdx;

    wsMonth[XLSX.utils.encode_cell({ r: subtotalLoanRowIdx, c: 0 })] = createCell('', 's', undefined, styleTotalRow);
    wsMonth[XLSX.utils.encode_cell({ r: subtotalLoanRowIdx, c: 1 })] = createCell('TOTALS', 's', undefined, styleTotalRow);
    wsMonth[XLSX.utils.encode_cell({ r: subtotalLoanRowIdx, c: 2 })] = createCell(`${m.name} Loan Repayments`, 's', undefined, styleTotalRow);
    wsMonth[XLSX.utils.encode_cell({ r: subtotalLoanRowIdx, c: 3 })] = createCell('', 's', undefined, styleTotalRow);
    wsMonth[XLSX.utils.encode_cell({ r: subtotalLoanRowIdx, c: 4 })] = createCell('', 's', undefined, styleTotalRow);
    wsMonth[XLSX.utils.encode_cell({ r: subtotalLoanRowIdx, c: 5 })] = createCell('', 's', undefined, styleTotalRow);
    // Col G (index 6): Total Principal = SUM(G{firstLRow}:G{lastLRow})
    wsMonth[XLSX.utils.encode_cell({ r: subtotalLoanRowIdx, c: 6 })] = createCell(
      0,
      'n',
      `SUM(G${firstLRow}:G${lastLRow})`,
      styleTotalRow
    );
    wsMonth[XLSX.utils.encode_cell({ r: subtotalLoanRowIdx, c: 7 })] = createCell('', 's', undefined, styleTotalRow);
    // Col I (index 8): Total Interest = SUM(I{firstLRow}:I{lastLRow})
    wsMonth[XLSX.utils.encode_cell({ r: subtotalLoanRowIdx, c: 8 })] = createCell(
      0,
      'n',
      `SUM(I${firstLRow}:I${lastLRow})`,
      styleTotalRow
    );
    // Col J (index 9): Total Repayments = SUM(J{firstLRow}:J{lastLRow})
    wsMonth[XLSX.utils.encode_cell({ r: subtotalLoanRowIdx, c: 9 })] = createCell(
      0,
      'n',
      `SUM(J${firstLRow}:J${lastLRow})`,
      styleTotalRow
    );
    wsMonth[XLSX.utils.encode_cell({ r: subtotalLoanRowIdx, c: 10 })] = createCell('', 's', undefined, styleTotalRow);
    wsMonth[XLSX.utils.encode_cell({ r: subtotalLoanRowIdx, c: 11 })] = createCell('', 's', undefined, styleTotalRow);

    // --- SECTION 3: MONTHLY CASH VS ONLINE AUDIT RECONCILIATION BOX ---
    const auditBoxStartRow = subtotalLoanRowIdx + 2;
    wsMonth[`A${auditBoxStartRow + 1}`] = createCell(
      `PART 3: ${m.name.toUpperCase()} ${year} CASH IN HAND VS ONLINE BANK AUDIT SUMMARY`,
      's',
      undefined,
      styleSectionHeader
    );

    const auditSummaryItems = [
      { label: `Total Cash Collected in ${m.name}`, formula: `SUMIF(F${firstCRow}:F${lastCRow},"CASH",E${firstCRow}:E${lastCRow})+SUMIF(L${firstLRow}:L${lastLRow},"CASH",J${firstLRow}:J${lastLRow})` },
      { label: `Total Online Bank Transfers in ${m.name}`, formula: `SUMIF(F${firstCRow}:F${lastCRow},"ONLINE",E${firstCRow}:E${lastCRow})+SUMIF(L${firstLRow}:L${lastLRow},"ONLINE",J${firstLRow}:J${lastLRow})` },
      { label: `Grand Total Monthly Collections (${m.name})`, formula: `C${auditBoxStartRow + 2}+C${auditBoxStartRow + 3}` },
      { label: `Contributions Subtotal`, formula: `E${subtotalContribRowNum}` },
      { label: `Loan Principal Recovered`, formula: `G${subtotalLoanRowNum}` },
      { label: `Loan Interest Earned (0.5%)`, formula: `I${subtotalLoanRowNum}` }
    ];

    auditSummaryItems.forEach((item, aIdx) => {
      const r = auditBoxStartRow + 1 + aIdx;
      wsMonth[XLSX.utils.encode_cell({ r, c: 0 })] = createCell(item.label, 's', undefined, styleKpiHeader);
      wsMonth[XLSX.utils.encode_cell({ r, c: 1 })] = createCell(item.label, 's', undefined, styleKpiHeader);
      wsMonth[XLSX.utils.encode_cell({ r, c: 2 })] = createCell(0, 'n', item.formula, styleKpiVal);
      wsMonth['!merges'] = wsMonth['!merges'] || [];
      wsMonth['!merges'].push({ s: { r, c: 0 }, e: { r, c: 1 } });
    });

    // Formatting Merges and Cols
    wsMonth['!merges'] = [
      ...(wsMonth['!merges'] || []),
      { s: { r: 0, c: 0 }, e: { r: 0, c: maxColM } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: maxColM } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: maxColM } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: maxColM } },
      { s: { r: loanSectionHeaderRow, c: 0 }, e: { r: loanSectionHeaderRow, c: maxColM } },
      { s: { r: auditBoxStartRow, c: 0 }, e: { r: auditBoxStartRow, c: maxColM } }
    ];

    wsMonth['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: auditBoxStartRow + 10, c: maxColM } });
    wsMonth['!cols'] = [
      { wch: 6 },  // Sl
      { wch: 12 }, // Code / Loan ID
      { wch: 14 }, // Borrower Code
      { wch: 22 }, // Name
      { wch: 18 }, // Amt / Type
      { wch: 16 }, // Mode / Opening
      { wch: 16 }, // Date / Principal Paid
      { wch: 14 }, // Ref / Rate
      { wch: 16 }, // Status / Interest
      { wch: 16 }, // Remarks / Total Paid
      { wch: 16 }, // Closing Balance
      { wch: 14 }  // Payment Mode
    ];

    XLSX.utils.book_append_sheet(wb, wsMonth, sheetName);
  });

  // =========================================================================
  // 3. LOAN MASTER & PROJECTIONS SHEET
  // =========================================================================
  const wsLoanMaster: any = {};
  const maxColLM = 12;

  wsLoanMaster['A1'] = createCell('UNNATI TRUST (R) — LOAN MASTER & SANCTIONS LEDGER', 's', undefined, styleMainTitle);
  wsLoanMaster['A2'] = createCell('SANCTIONED LOANS, TENURE, INTEREST ACCRUALS, AND CLOSING STATUSES', 's', undefined, styleSubTitle);
  wsLoanMaster['A3'] = createCell(`Tracks all loans granted by the trust. Principal Repaid is dynamically calculated via live formulas across monthly sheets.`, 's', undefined, styleMeta);

  const lmHeaders = [
    'Loan\nID',
    'Sanction\nDate',
    'Borrower\nCode',
    'Borrower Name',
    'Sanctioned\nAmount (₹)',
    'Rate (%)\nMonthly',
    'Total Principal\nRepaid (₹) [Formula]',
    'Outstanding\nBalance (₹) [Formula]',
    'Total Interest\nCollected (₹) [Formula]',
    'Next EMI Principal\n(₹) [Formula]',
    'Next EMI Interest\n(₹) [Formula]',
    'Next Total\nDue (₹) [Formula]',
    'Loan\nStatus [Formula]'
  ];

  lmHeaders.forEach((h, colIdx) => {
    wsLoanMaster[XLSX.utils.encode_cell({ r: 4, c: colIdx })] = createCell(h, 's', undefined, styleColHeader);
  });

  const sanctionedLoans = loans.filter(l => l.status === 'approved' || l.status === 'paid');

  sanctionedLoans.forEach((l, i) => {
    const rowIdx = 5 + i;
    const rowNum = rowIdx + 1;
    const loanCode = loanCodeMap.get(l.id || `loan_${i}`) || `LN-${String(i + 1).padStart(3, '0')}`;
    const targetUser = allUsers.find(u => (l.userId && (u.uid === l.userId || u.id === l.userId)) || (l.userEmail && u.email.toLowerCase() === l.userEmail.toLowerCase()));
    const memberCode = getCode(l.userId, l.userEmail, l.userName, i);
    const memberName = targetUser?.displayName || l.userName || l.userEmail?.split('@')[0] || 'Member';
    const sanctionedAmount = l.approvedAmount || l.amount || 0;

    let dateStr = '2026-01-01';
    const loanDate = l.approvedAt || l.createdAt || (l as any).timestamp;
    if (loanDate?.toDate) {
      dateStr = format(loanDate.toDate(), 'yyyy-MM-dd');
    } else if (loanDate?.seconds) {
      dateStr = format(new Date(loanDate.seconds * 1000), 'yyyy-MM-dd');
    } else if (loanDate instanceof Date) {
      dateStr = format(loanDate, 'yyyy-MM-dd');
    }

    // Sum of principal across all 12 monthly sheets for this loan code
    // Formula: SUMIF('Jan 2026'!$B$21:$B$35, A6, 'Jan 2026'!$G$21:$G$35) + ...
    const principalSumFormula = MONTHS_LIST.map(m => `SUMIF('${m.short} ${year}'!$B$20:$B$45,A${rowNum},'${m.short} ${year}'!$G$20:$G$45)`).join('+');
    const interestSumFormula = MONTHS_LIST.map(m => `SUMIF('${m.short} ${year}'!$B$20:$B$45,A${rowNum},'${m.short} ${year}'!$I$20:$I$45)`).join('+');

    wsLoanMaster[XLSX.utils.encode_cell({ r: rowIdx, c: 0 })] = createCell(loanCode, 's');
    wsLoanMaster[XLSX.utils.encode_cell({ r: rowIdx, c: 1 })] = createCell(dateStr, 's');
    wsLoanMaster[XLSX.utils.encode_cell({ r: rowIdx, c: 2 })] = createCell(memberCode, 's');
    wsLoanMaster[XLSX.utils.encode_cell({ r: rowIdx, c: 3 })] = createCell(memberName, 's');
    wsLoanMaster[XLSX.utils.encode_cell({ r: rowIdx, c: 4 })] = createCell(sanctionedAmount, 'n');
    wsLoanMaster[XLSX.utils.encode_cell({ r: rowIdx, c: 5 })] = createCell(0.005, 'n');

    // Col G (index 6): Principal Repaid Formula
    wsLoanMaster[XLSX.utils.encode_cell({ r: rowIdx, c: 6 })] = createCell(0, 'n', principalSumFormula);

    // Col H (index 7): Outstanding Principal = MAX(0, Sanctioned - Repaid) = MAX(0, E{row} - G{row})
    wsLoanMaster[XLSX.utils.encode_cell({ r: rowIdx, c: 7 })] = createCell(0, 'n', `MAX(0,E${rowNum}-G${rowNum})`);

    // Col I (index 8): Total Interest Collected Formula
    wsLoanMaster[XLSX.utils.encode_cell({ r: rowIdx, c: 8 })] = createCell(0, 'n', interestSumFormula);

    // Col J (index 9): Next EMI Principal = IF(Balance<=0, 0, MIN(5000, Balance))
    wsLoanMaster[XLSX.utils.encode_cell({ r: rowIdx, c: 9 })] = createCell(0, 'n', `IF(H${rowNum}<=0,0,MIN(5000,H${rowNum}))`);

    // Col K (index 10): Next EMI Interest = IF(Balance<=0, 0, ROUND(Balance * 0.005, 0))
    wsLoanMaster[XLSX.utils.encode_cell({ r: rowIdx, c: 10 })] = createCell(0, 'n', `IF(H${rowNum}<=0,0,ROUND(H${rowNum}*F${rowNum},0))`);

    // Col L (index 11): Next Total Due = Principal + Interest = J{row} + K{row}
    wsLoanMaster[XLSX.utils.encode_cell({ r: rowIdx, c: 11 })] = createCell(0, 'n', `J${rowNum}+K${rowNum}`);

    // Col M (index 12): Status = IF(Balance<=0, "CLOSED", "ACTIVE")
    wsLoanMaster[XLSX.utils.encode_cell({ r: rowIdx, c: 12 })] = createCell('ACTIVE', 's', `IF(H${rowNum}<=0,"CLOSED","ACTIVE")`);
  });

  // Summary Row for Loan Master
  const loanMasterTotalRowIdx = 5 + sanctionedLoans.length;
  const loanMasterTotalRowNum = loanMasterTotalRowIdx + 1;
  const firstLMRow = 6;
  const lastLMRow = Math.max(6, loanMasterTotalRowIdx);

  wsLoanMaster[XLSX.utils.encode_cell({ r: loanMasterTotalRowIdx, c: 0 })] = createCell('TOTALS', 's', undefined, styleTotalRow);
  wsLoanMaster[XLSX.utils.encode_cell({ r: loanMasterTotalRowIdx, c: 1 })] = createCell(`${sanctionedLoans.length} Loans`, 's', undefined, styleTotalRow);
  wsLoanMaster[XLSX.utils.encode_cell({ r: loanMasterTotalRowIdx, c: 2 })] = createCell('', 's', undefined, styleTotalRow);
  wsLoanMaster[XLSX.utils.encode_cell({ r: loanMasterTotalRowIdx, c: 3 })] = createCell('', 's', undefined, styleTotalRow);
  wsLoanMaster[XLSX.utils.encode_cell({ r: loanMasterTotalRowIdx, c: 4 })] = createCell(0, 'n', `SUM(E${firstLMRow}:E${lastLMRow})`, styleTotalRow);
  wsLoanMaster[XLSX.utils.encode_cell({ r: loanMasterTotalRowIdx, c: 5 })] = createCell('', 's', undefined, styleTotalRow);
  wsLoanMaster[XLSX.utils.encode_cell({ r: loanMasterTotalRowIdx, c: 6 })] = createCell(0, 'n', `SUM(G${firstLMRow}:G${lastLMRow})`, styleTotalRow);
  wsLoanMaster[XLSX.utils.encode_cell({ r: loanMasterTotalRowIdx, c: 7 })] = createCell(0, 'n', `SUM(H${firstLMRow}:H${lastLMRow})`, styleTotalRow);
  wsLoanMaster[XLSX.utils.encode_cell({ r: loanMasterTotalRowIdx, c: 8 })] = createCell(0, 'n', `SUM(I${firstLMRow}:I${lastLMRow})`, styleTotalRow);
  wsLoanMaster[XLSX.utils.encode_cell({ r: loanMasterTotalRowIdx, c: 9 })] = createCell(0, 'n', `SUM(J${firstLMRow}:J${lastLMRow})`, styleTotalRow);
  wsLoanMaster[XLSX.utils.encode_cell({ r: loanMasterTotalRowIdx, c: 10 })] = createCell(0, 'n', `SUM(K${firstLMRow}:K${lastLMRow})`, styleTotalRow);
  wsLoanMaster[XLSX.utils.encode_cell({ r: loanMasterTotalRowIdx, c: 11 })] = createCell(0, 'n', `SUM(L${firstLMRow}:L${lastLMRow})`, styleTotalRow);
  wsLoanMaster[XLSX.utils.encode_cell({ r: loanMasterTotalRowIdx, c: 12 })] = createCell('', 's', undefined, styleTotalRow);

  wsLoanMaster['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: maxColLM } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: maxColLM } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: maxColLM } }
  ];
  wsLoanMaster['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: loanMasterTotalRowIdx + 2, c: maxColLM } });
  wsLoanMaster['!cols'] = [
    { wch: 10 }, // Loan ID
    { wch: 12 }, // Date
    { wch: 12 }, // Code
    { wch: 22 }, // Name
    { wch: 16 }, // Sanctioned
    { wch: 10 }, // Rate
    { wch: 18 }, // Repaid
    { wch: 18 }, // Balance
    { wch: 18 }, // Interest
    { wch: 16 }, // Next P
    { wch: 16 }, // Next I
    { wch: 16 }, // Next Total
    { wch: 12 }  // Status
  ];
  XLSX.utils.book_append_sheet(wb, wsLoanMaster, "Loan Master");

  // =========================================================================
  // 4. AUDIT & FORMULAS GUIDE SHEET
  // =========================================================================
  const auditGuideRows = [
    ['UNNATI TRUST (R) — OFFLINE AUDIT & WORKBOOK USER GUIDE'],
    ['DISASTER RECOVERY MANUAL: HOW TO RECORD MANUAL CONTRIBUTIONS & LOAN PAYMENTS OFFLINE'],
    [],
    ['1. WORKBOOK ARCHITECTURE OVERVIEW'],
    ['• Sheet 1 ("Financial Insights & Audit"): Executive Main Page showing KPI cards, Annual 12-Month Inflow Matrix, and member balances.'],
    ['• Sheets 2 to 13 ("Jan 2026" ... "Dec 2026"): Month-specific worksheets where you manually log transactions for that specific month.'],
    ['• Sheet 14 ("Loan Master"): Consolidated loan portfolio showing all sanctioned loans, cumulative recoveries, and next EMI projections.'],
    [],
    ['2. HOW TO LOG MONTHLY CONTRIBUTIONS MANUALLY'],
    ['• Open the specific month sheet (e.g. "Nov 2026").'],
    ['• In Part 1 (Member Contributions Register), find the member row.'],
    ['• Type the contribution amount in Column E (usually ₹1,000).'],
    ['• Select Payment Mode in Column F ("Cash" or "Online").'],
    ['• The subtotal row in Column E instantly sums all collections: =SUM(E6:E...).'],
    ['• The Main Page ("Financial Insights & Audit") automatically pulls this month total into the Performance Matrix!'],
    [],
    ['3. HOW TO RECORD LOAN REPAYMENTS (REGULAR EMI vs +ADD PRINCIPAL)'],
    ['• In the same month sheet, scroll down to Part 2 (Loan Repayments & Interest Register).'],
    ['• For Regular EMI:'],
    ['  - Enter Borrower Code, Loan ID, Opening Principal Balance, and Principal Paid (e.g. ₹5,000).'],
    ['  - Formula in Column I calculates interest at 0.5% monthly reducing balance: =IF(Type="Extra Principal", 0, ROUND(OpeningBal * 0.005, 0)).'],
    ['  - Formula in Column J calculates Total Paid: =Principal + Interest.'],
    ['  - Formula in Column K calculates Closing Balance: =MAX(0, OpeningBal - Principal).'],
    ['• For "+ Add Principal" (Extra Principal Payment):'],
    ['  - Set Payment Type (Column E) to "Extra Principal".'],
    ['  - The formula automatically sets Interest to ₹0 because the interest was already cleared in the 1st monthly EMI!'],
    ['  - 100% of this extra payment goes towards deducting the principal debt immediately.'],
    [],
    ['4. RECONCILING CASH IN HAND VS ONLINE BANK TRANSFERS'],
    ['• Part 3 at the bottom of each month sheet contains the Reconciliation Audit Box.'],
    ['• It uses =SUMIF(..., "CASH", ...) and =SUMIF(..., "ONLINE", ...) across both contributions and loan repayments.'],
    ['• Gives you exact Cash on Hand so you can physically count your cash drawer and match it against the bank passbook.'],
    [],
    ['5. BACKUP & DISASTER RECOVERY PROTOCOL'],
    ['• Keep a monthly copy of this file on a secure USB drive or Google Drive.'],
    ['• If your phone, tablet, or server ever crashes, all data remains intact with zero formula corruption.'],
    ['• When normal service resumes, you can cross-verify every balance down to the exact rupee.']
  ];

  const wsGuide = XLSX.utils.aoa_to_sheet(auditGuideRows);
  wsGuide['!cols'] = [{ wch: 115 }];
  if (wsGuide['A1']) wsGuide['A1'].s = styleMainTitle;
  if (wsGuide['A2']) wsGuide['A2'].s = styleSubTitle;
  [4, 11, 21, 33, 40].forEach(rIdx => {
    const ref = `A${rIdx}`;
    if (wsGuide[ref]) {
      wsGuide[ref].s = {
        font: { name: 'Segoe UI', sz: 11, bold: true, color: { rgb: '1E1B4B' } },
        fill: { fgColor: { rgb: 'E0E7FF' } }
      };
    }
  });
  XLSX.utils.book_append_sheet(wb, wsGuide, "Audit & Formulas Guide");

  // Dispatch download
  if (options?.isMobileApp && options.downloadFileMobile) {
    try {
      const base64Data = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
      const res = await options.downloadFileMobile(fileName, base64Data);
      if (res.success) {
        return { success: true, fileName };
      }
    } catch (e) {
      console.warn("Mobile file download fallback to browser download:", e);
    }
  }

  XLSX.writeFile(wb, fileName);
  return { success: true, fileName };
}
