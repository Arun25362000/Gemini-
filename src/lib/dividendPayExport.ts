import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import XLSX from 'xlsx-js-style';
import { UserProfile, Contribution, Loan, LoanPayment } from '../types';
import { getSafeMemberDisplayName, GURURAJ_PHONE, GURURAJ_EMAIL, GURURAJ_ENGLISH_NAME } from './utils';

export const SYSTEM_ADMIN_EMAIL = 'unnati.finance2026@gmail.com';

export interface Denominations {
  n500: number;
  n200: number;
  n100: number;
  n50: number;
  n20: number;
  n10: number;
}

/**
 * Calculates greedy cash currency note breakdown (₹500, ₹200, ₹100, ₹50, ₹20, ₹10)
 * for an amount rounded to nearest ₹10.
 * Example for ₹150: 500: 0, 200: 0, 100: 1, 50: 1, 20: 0, 10: 0.
 */
export function calculateDenominations(amount: number): Denominations {
  let rem = Math.max(0, Math.round(amount));
  const n500 = Math.floor(rem / 500);
  rem %= 500;
  const n200 = Math.floor(rem / 200);
  rem %= 200;
  const n100 = Math.floor(rem / 100);
  rem %= 100;
  const n50 = Math.floor(rem / 50);
  rem %= 50;
  const n20 = Math.floor(rem / 20);
  rem %= 20;
  const n10 = Math.floor(rem / 10);
  rem %= 10;
  return { n500, n200, n100, n50, n20, n10 };
}

export interface MemberDividendRow {
  slNo: number;
  memberId: string;
  memberName: string;
  email: string;
  phone: string;
  address?: string;
  joinDate: string;
  paidMonthsCountYear: number;
  paidAmountYear: number;
  interestPaidByMemberYear: number;
  rawDividendPay: number; // Raw exact dividend before rounding
  dividendPay: number; // Dividend amount rounded off to nearest Rs 10
  denominations: Denominations;
  status: string;
}

export interface DividendCalculationResult {
  targetYear: number | 'all';
  isAllTime: boolean;
  totalRegisteredMembers: number;
  totalInterestEarned: number;
  dividendPerMember: number; // Rounded to nearest Rs 10
  exactDividendPerMember: number; // Raw exact calculation
  totalDividendDistributed: number;
  totalSavingsCorpusYear: number;
  totalSanctionedLoansYear: number;
  members: MemberDividendRow[];
  totalDenominations: Denominations;
  generatedAt: Date;
}

/**
 * Calculates the exact dividend distribution for registered members.
 * Core Formula:
 * Dividend Per Member = Total Interest Earned ÷ Total Registered Members
 * Rounded off to nearest Rs 10 for cash disbursement with exact denomination breakdown.
 */
export function calculateDividendPayout(params: {
  allUsers: UserProfile[];
  contributions: Contribution[];
  loans: Loan[];
  loanPayments: LoanPayment[];
  targetYear: number | 'all';
}): DividendCalculationResult {
  const { allUsers, contributions, loans, loanPayments, targetYear } = params;
  const isAllTime = targetYear === 'all';

  // 1. Registered Members: all members excluding system robot administrator
  const registeredUsers = allUsers
    .filter(u => {
      const email = (u.email || '').toLowerCase().trim();
      return email !== SYSTEM_ADMIN_EMAIL.toLowerCase() && !email.includes('unnati.finance2026');
    })
    .sort((a, b) => {
      const nameA = getSafeMemberDisplayName(a) || a.displayName || a.email || '';
      const nameB = getSafeMemberDisplayName(b) || b.displayName || b.email || '';
      return nameA.localeCompare(nameB);
    });

  const totalRegisteredMembers = registeredUsers.length;

  // 2. Total Interest Earned from paid loan payments
  const relevantLoanPayments = loanPayments.filter(p => {
    if (p.status !== 'paid') return false;
    if (isAllTime) return true;
    let paymentYear = p.year ? Number(p.year) : undefined;
    if (!paymentYear && (p as any).date) {
      const parsedYear = new Date((p as any).date).getFullYear();
      if (!isNaN(parsedYear)) paymentYear = parsedYear;
    }
    if (!paymentYear && p.approvedAt?.toDate) {
      paymentYear = p.approvedAt.toDate().getFullYear();
    }
    if (!paymentYear && p.timestamp?.toDate) {
      paymentYear = p.timestamp.toDate().getFullYear();
    }
    return paymentYear === Number(targetYear);
  });

  const totalInterestEarned = relevantLoanPayments.reduce((sum, p) => sum + (Number(p.interest) || 0), 0);

  // 3. Exact dividend per member calculation & nearest Rs 10 rounding
  const exactDividendPerMember = totalRegisteredMembers > 0 
    ? (totalInterestEarned / totalRegisteredMembers) 
    : 0;

  // Round off to nearest Rs 10 (e.g. 153 -> 150, 156 -> 160)
  const dividendPerMember = Math.round(exactDividendPerMember / 10) * 10;
  const totalDividendDistributed = dividendPerMember * totalRegisteredMembers;

  // 4. Inflows & loans context for the target year
  const relevantContributions = contributions.filter(c => {
    if (c.status !== 'paid') return false;
    if (isAllTime) return true;
    return (c.year || 0) === targetYear;
  });
  const totalSavingsCorpusYear = relevantContributions.reduce((sum, c) => sum + (c.amount || 0), 0);

  const relevantLoans = loans.filter(l => {
    if (l.status !== 'approved' && l.status !== 'paid') return false;
    if (isAllTime) return true;
    const lYear = l.approvedAt?.toDate ? l.approvedAt.toDate().getFullYear() : 
      (l.createdAt?.toDate ? l.createdAt.toDate().getFullYear() : (l as any).year);
    return lYear === targetYear;
  });
  const totalSanctionedLoansYear = relevantLoans.reduce((sum, l) => sum + (l.approvedAmount || l.amount || 0), 0);

  // 5. Build member-by-member dividend rows with denominations
  const members: MemberDividendRow[] = registeredUsers.map((u, idx) => {
    const uUid = u.uid || u.id || '';
    const uEmail = (u.email || '').toLowerCase().trim();

    const userContribs = relevantContributions.filter(c => 
      (uUid && c.userId === uUid) || 
      (uEmail && c.userEmail && c.userEmail.toLowerCase().trim() === uEmail)
    );
    const paidMonthsCountYear = userContribs.length;
    const paidAmountYear = userContribs.reduce((sum, c) => sum + (c.amount || 0), 0);

    const userLoanPayments = relevantLoanPayments.filter(p => {
      const parentLoan = loans.find(l => l.id === p.loanId);
      if (parentLoan) {
        const matchLoanUid = uUid && parentLoan.userId && parentLoan.userId === uUid;
        const matchLoanEmail = uEmail && parentLoan.userEmail && parentLoan.userEmail.toLowerCase().trim() === uEmail;
        if (matchLoanUid || matchLoanEmail) return true;
      }
      const matchDirectUid = uUid && p.userId && p.userId === uUid;
      const matchDirectEmail = uEmail && p.userEmail && p.userEmail.toLowerCase().trim() === uEmail;
      return matchDirectUid || matchDirectEmail;
    });
    const interestPaidByMemberYear = userLoanPayments.reduce((sum, p) => sum + (p.interest || 0), 0);

    const rawName = getSafeMemberDisplayName(u) || u.displayName || uEmail.split('@')[0] || 'Member';
    const isGururaj = uEmail === GURURAJ_EMAIL || (u.phoneNumber && u.phoneNumber.replace(/\D/g, '').endsWith(GURURAJ_PHONE));
    const memberName = isGururaj ? GURURAJ_ENGLISH_NAME : rawName;
    const phone = isGururaj ? GURURAJ_PHONE : (u.phoneNumber || (u as any).phone || 'N/A');

    const denominations = calculateDenominations(dividendPerMember);

    return {
      slNo: idx + 1,
      memberId: uUid || uEmail,
      memberName,
      email: u.email || 'N/A',
      phone,
      address: u.address || '',
      joinDate: u.joinDate || 'N/A',
      paidMonthsCountYear,
      paidAmountYear,
      interestPaidByMemberYear,
      rawDividendPay: Math.round(exactDividendPerMember * 100) / 100,
      dividendPay: dividendPerMember,
      denominations,
      status: 'Active Member'
    };
  });

  const totalDenominations: Denominations = {
    n500: members.reduce((sum, m) => sum + m.denominations.n500, 0),
    n200: members.reduce((sum, m) => sum + m.denominations.n200, 0),
    n100: members.reduce((sum, m) => sum + m.denominations.n100, 0),
    n50: members.reduce((sum, m) => sum + m.denominations.n50, 0),
    n20: members.reduce((sum, m) => sum + m.denominations.n20, 0),
    n10: members.reduce((sum, m) => sum + m.denominations.n10, 0),
  };

  return {
    targetYear,
    isAllTime,
    totalRegisteredMembers,
    totalInterestEarned,
    dividendPerMember,
    exactDividendPerMember,
    totalDividendDistributed,
    totalSavingsCorpusYear,
    totalSanctionedLoansYear,
    members,
    totalDenominations,
    generatedAt: new Date()
  };
}

/**
 * Generates and downloads the Excel (.xlsx) report with exact columns:
 * Sl.No, MemberName, Dividend, 500, 200, 100, 50, 20, 10
 */
export async function exportDividendPayExcel(
  calculation: DividendCalculationResult,
  options?: {
    isMobileApp?: boolean;
    downloadFileMobile?: (fileName: string, base64Data: string) => Promise<{ success: boolean; uri?: string; error?: string }>;
  }
): Promise<{ success: boolean; fileName: string }> {
  const wb = XLSX.utils.book_new();
  const yearLabel = calculation.isAllTime ? 'All Recorded Years' : `Year ${calculation.targetYear}`;
  const fileYearStr = calculation.isAllTime ? 'Cumulative' : `${calculation.targetYear}`;
  const fileName = `Unnati_Dividend_Pay_Report_${fileYearStr}_${format(new Date(), 'yyyyMMdd')}.xlsx`;
  const exportDateStr = format(calculation.generatedAt, 'dd-MMM-yyyy HH:mm:ss');

  const borderThin = {
    top: { style: 'thin', color: { rgb: 'CBD5E1' } },
    bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
    left: { style: 'thin', color: { rgb: 'CBD5E1' } },
    right: { style: 'thin', color: { rgb: 'CBD5E1' } }
  };

  const styleTitle = {
    font: { name: 'Segoe UI', sz: 13, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '0F172A' } }, // Slate 900
    alignment: { horizontal: 'center', vertical: 'center' }
  };

  const styleSubTitle = {
    font: { name: 'Segoe UI', sz: 10, italic: true, color: { rgb: '334155' } },
    fill: { fgColor: { rgb: 'F1F5F9' } },
    alignment: { horizontal: 'center', vertical: 'center' }
  };

  const styleFormula = {
    font: { name: 'Segoe UI', sz: 9.5, bold: true, color: { rgb: '92400E' } },
    fill: { fgColor: { rgb: 'FEF3C7' } }, // Amber 100
    alignment: { horizontal: 'center', vertical: 'center' },
    border: borderThin
  };

  const styleHeader = {
    font: { name: 'Segoe UI', sz: 10.5, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1E293B' } }, // Slate 800
    alignment: { horizontal: 'center', vertical: 'center' },
    border: borderThin
  };

  const styleHeaderDividend = {
    font: { name: 'Segoe UI', sz: 10.5, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '047857' } }, // Emerald 700
    alignment: { horizontal: 'center', vertical: 'center' },
    border: borderThin
  };

  // Build rows with exact columns requested:
  // Sl.No, MemberName, Dividend, 500, 200, 100, 50, 20, 10
  const memberDataRows = calculation.members.map((m) => [
    m.slNo,
    m.memberName,
    m.dividendPay,
    m.denominations.n500,
    m.denominations.n200,
    m.denominations.n100,
    m.denominations.n50,
    m.denominations.n20,
    m.denominations.n10
  ]);

  const totalRow = [
    'TOTAL',
    `${calculation.totalRegisteredMembers} Members`,
    calculation.totalDividendDistributed,
    calculation.totalDenominations.n500,
    calculation.totalDenominations.n200,
    calculation.totalDenominations.n100,
    calculation.totalDenominations.n50,
    calculation.totalDenominations.n20,
    calculation.totalDenominations.n10
  ];

  const sigNameRow = ['President', '', '', 'Secretary', '', '', 'Treasurer', '', ''];
  const sigSubRow = ['(Signature & Approval)', '', '', '(Signature & Approval)', '', '', '(Signature & Approval)', '', ''];

  const aoa: any[][] = [
    ['UNNATI TRUST (R) - DIVIDEND PAY REPORT'],
    [`Period: ${yearLabel} | Generated on: ${exportDateStr}`],
    [`Formula: Total Interest Earned (₹${calculation.totalInterestEarned.toLocaleString('en-IN')}) ÷ ${calculation.totalRegisteredMembers} Registered Members = ₹${calculation.exactDividendPerMember.toFixed(2)} → Rounded off to nearest ₹10: ₹${calculation.dividendPerMember}`],
    [],
    ['Sl.No', 'MemberName', 'Dividend', '500', '200', '100', '50', '20', '10'],
    ...memberDataRows,
    totalRow,
    ['', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    sigNameRow,
    sigSubRow
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths: Sl.No, MemberName, Dividend, 500, 200, 100, 50, 20, 10
  ws['!cols'] = [
    { wch: 8 },  // Sl.No
    { wch: 30 }, // MemberName
    { wch: 14 }, // Dividend
    { wch: 8 },  // 500
    { wch: 8 },  // 200
    { wch: 8 },  // 100
    { wch: 8 },  // 50
    { wch: 8 },  // 20
    { wch: 8 },  // 10
  ];

  const headerRowIdx = 4;
  const totalRowIdx = 4 + memberDataRows.length + 1;
  const sigNameRowIdx = totalRowIdx + 3;
  const sigSubRowIdx = totalRowIdx + 4;

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 8 } },
    { s: { r: sigNameRowIdx, c: 0 }, e: { r: sigNameRowIdx, c: 2 } },
    { s: { r: sigSubRowIdx, c: 0 }, e: { r: sigSubRowIdx, c: 2 } },
    { s: { r: sigNameRowIdx, c: 3 }, e: { r: sigNameRowIdx, c: 5 } },
    { s: { r: sigSubRowIdx, c: 3 }, e: { r: sigSubRowIdx, c: 5 } },
    { s: { r: sigNameRowIdx, c: 6 }, e: { r: sigNameRowIdx, c: 8 } },
    { s: { r: sigSubRowIdx, c: 6 }, e: { r: sigSubRowIdx, c: 8 } },
  ];

  ws['!rows'] = [];
  ws['!rows'][totalRowIdx + 1] = { hpt: 15 };
  ws['!rows'][totalRowIdx + 2] = { hpt: 25 };
  ws['!rows'][sigNameRowIdx] = { hpt: 22 };
  ws['!rows'][sigSubRowIdx] = { hpt: 18 };

  for (let r = 0; r < aoa.length; r++) {
    for (let c = 0; c < 9; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) continue;
      const cell = ws[ref];

      if (r === 0) cell.s = styleTitle;
      else if (r === 1) cell.s = styleSubTitle;
      else if (r === 2) cell.s = styleFormula;
      else if (r === headerRowIdx) {
        cell.s = c === 2 ? styleHeaderDividend : styleHeader;
      } else if (r === totalRowIdx) {
        // Summary Footer Row
        cell.s = {
          font: { name: 'Segoe UI', sz: 10.5, bold: true, color: { rgb: '065F46' } },
          fill: { fgColor: { rgb: 'D1FAE5' } }, // Emerald 100
          alignment: { horizontal: c === 1 ? 'left' : (c === 2 ? 'right' : 'center'), vertical: 'center' },
          border: borderThin,
          numFmt: c === 2 ? '₹#,##0' : undefined
        };
      } else if (r > headerRowIdx && r < totalRowIdx) {
        // Member Data Rows
        const isDividendCol = c === 2;
        const bg = r % 2 === 0 ? 'F8FAFC' : 'FFFFFF';
        cell.s = {
          font: { 
            name: 'Segoe UI', 
            sz: 10, 
            bold: isDividendCol || c === 1, 
            color: { rgb: isDividendCol ? '047857' : '0F172A' } 
          },
          fill: { fgColor: { rgb: isDividendCol ? 'ECFDF5' : bg } },
          alignment: { 
            horizontal: c === 1 ? 'left' : (c === 2 ? 'right' : 'center'), 
            vertical: 'center' 
          },
          border: borderThin,
          numFmt: isDividendCol ? '₹#,##0' : undefined
        };
      } else if (r === sigNameRowIdx) {
        cell.s = {
          font: { name: 'Segoe UI', sz: 11, bold: true, color: { rgb: '0F172A' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: {
            top: { style: 'thin', color: { rgb: '475569' } }
          }
        };
      } else if (r === sigSubRowIdx) {
        cell.s = {
          font: { name: 'Segoe UI', sz: 9, italic: true, color: { rgb: '64748B' } },
          alignment: { horizontal: 'center', vertical: 'center' }
        };
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, "Dividend Pay");

  // Mobile / Browser Dispatch
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

/**
 * Builds a clean, smart, audit-ready PDF document for the "Dividend pay" report
 * with exact columns: Sl.No, MemberName, Dividend, 500, 200, 100, 50, 20, 10.
 * Live Metric Badges have been removed as requested.
 */
export function generateDividendPayPdfDoc(calculation: DividendCalculationResult): {
  doc: jsPDF;
  fileName: string;
} {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const yearLabel = calculation.isAllTime ? 'All Recorded Years' : `Year ${calculation.targetYear}`;
  const fileYearStr = calculation.isAllTime ? 'Cumulative' : `${calculation.targetYear}`;
  const fileName = `Unnati_Dividend_Pay_Report_${fileYearStr}_${format(new Date(), 'yyyyMMdd')}.pdf`;
  const exportDateStr = format(calculation.generatedAt, 'dd-MMM-yyyy HH:mm:ss');

  // --- Official Smart Header ---
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, 210, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('UNNATI TRUST (R)', 14, 9);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`DIVIDEND PAY REPORT • ${yearLabel.toUpperCase()}`, 14, 16);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(`Generated: ${exportDateStr}`, 196, 16, { align: 'right' });

  // --- Derivation Formula Strip (Smart, clean, concise) ---
  doc.setFillColor(254, 243, 199); // Amber 100
  doc.setDrawColor(245, 158, 11); // Amber 500
  doc.setLineWidth(0.3);
  doc.roundedRect(14, 26, 182, 11, 1.5, 1.5, 'FD');

  doc.setTextColor(146, 64, 14); // Amber 900
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('FORMULA & ROUNDING:', 18, 33);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    `Total Interest (₹${calculation.totalInterestEarned.toLocaleString('en-IN')}) ÷ Registered Members (${calculation.totalRegisteredMembers}) = ₹${calculation.exactDividendPerMember.toFixed(2)} → Rounded off to nearest ₹10: ₹${calculation.dividendPerMember} / member`,
    58,
    33
  );

  // Exact columns: Sl.No, MemberName, Dividend, 500, 200, 100, 50, 20, 10
  const tableData = calculation.members.map((m) => [
    m.slNo.toString(),
    m.memberName,
    `₹${m.dividendPay.toLocaleString('en-IN')}`,
    m.denominations.n500.toString(),
    m.denominations.n200.toString(),
    m.denominations.n100.toString(),
    m.denominations.n50.toString(),
    m.denominations.n20.toString(),
    m.denominations.n10.toString()
  ]);

  const footData = [[
    'TOTAL',
    `${calculation.totalRegisteredMembers} Members`,
    `₹${calculation.totalDividendDistributed.toLocaleString('en-IN')}`,
    calculation.totalDenominations.n500.toString(),
    calculation.totalDenominations.n200.toString(),
    calculation.totalDenominations.n100.toString(),
    calculation.totalDenominations.n50.toString(),
    calculation.totalDenominations.n20.toString(),
    calculation.totalDenominations.n10.toString()
  ]];

  autoTable(doc, {
    startY: 40,
    head: [[
      'Sl.No',
      'MemberName',
      'Dividend',
      '500',
      '200',
      '100',
      '50',
      '20',
      '10'
    ]],
    body: tableData,
    foot: footData,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59], // Slate 800
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center',
      cellPadding: 2
    },
    footStyles: {
      fillColor: [209, 250, 229], // Emerald 100
      textColor: [6, 95, 70],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center',
      cellPadding: 2.2
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 1.8,
      textColor: [15, 23, 42]
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 14 },
      1: { halign: 'left', cellWidth: 58, fontStyle: 'bold' },
      2: { halign: 'right', cellWidth: 26, fontStyle: 'bold', textColor: [4, 120, 87] },
      3: { halign: 'center', cellWidth: 14 },
      4: { halign: 'center', cellWidth: 14 },
      5: { halign: 'center', cellWidth: 14 },
      6: { halign: 'center', cellWidth: 14 },
      7: { halign: 'center', cellWidth: 14 },
      8: { halign: 'center', cellWidth: 14 }
    },
    margin: { left: 14, right: 14, top: 22, bottom: 20 },
    didDrawPage: (data) => {
      const pageCount = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(
        `UNNATI TRUST (R) • Dividend pay Report • Page ${data.pageNumber} of ${pageCount}`,
        14,
        287
      );
      doc.text(
        `Dividend rounded to nearest ₹10 with cash currency denomination breakdown`,
        196,
        287,
        { align: 'right' }
      );
    }
  });

  // Signature Block on final page
  const finalY = (doc as any).lastAutoTable?.finalY || 240;
  if (finalY < 260) {
    const sigY = Math.min(270, finalY + 12);
    doc.setDrawColor(203, 213, 225);
    doc.line(20, sigY, 65, sigY);
    doc.line(85, sigY, 130, sigY);
    doc.line(145, sigY, 190, sigY);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text('President', 42.5, sigY + 4, { align: 'center' });
    doc.text('Secretary', 107.5, sigY + 4, { align: 'center' });
    doc.text('Treasurer', 167.5, sigY + 4, { align: 'center' });
  }

  return { doc, fileName };
}

import { universalQuickPrintPdf } from './printService';

/**
 * Triggers instant printing of the generated PDF document across all devices (Android APK, mobile, tablet, desktop).
 */
export function quickPrintDividendPdf(doc: jsPDF, fileName: string = 'Unnati_Dividend_Pay_Report.pdf', documentTitle?: string): void {
  universalQuickPrintPdf(doc, fileName, documentTitle || 'Dividend Pay Report');
}
