import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { Contribution, Loan, LoanPayment, UserProfile } from '../types';
import { getSafeMemberDisplayName, isPraneshMember } from './utils';

export interface MonthlyCollectionPdfOptions {
  month: number; // 1-12
  year: number;  // e.g. 2026
  contributions: Contribution[];
  loans: Loan[];
  loanPayments: LoanPayment[];
  allUsers: UserProfile[];
}

export interface MonthlyCollectionPdfResult {
  doc: jsPDF;
  fileName: string;
  meta: {
    month: number;
    year: number;
    monthLabel: string;
    grandTotal: number;
    cashTotal: number;
    onlineTotal: number;
    contributionTotal: number;
    loanTotal: number;
    principalCollected: number;
    interestCollected: number;
    paidContributionsCount: number;
    paidLoanPaymentsCount: number;
  };
}

/**
 * Generates a print-ready, professional PDF statement for Monthly Collections.
 * Contains 3 parts in exact order:
 * 1. "Monthly Collection Summary"
 * 2. "Member collection details"
 * 3. "Loan Repayments"
 * Fully dynamic based on the selected Month and Year.
 */
export function generateMonthlyCollectionPdfDoc(options: MonthlyCollectionPdfOptions): MonthlyCollectionPdfResult {
  const { month, year, contributions, loans, loanPayments, allUsers } = options;
  const now = new Date();
  const monthDate = new Date(year, month - 1, 1);
  const monthLabel = format(monthDate, 'MMMM yyyy');
  const exportDateStr = format(now, 'dd-MMM-yyyy hh:mm a');

  // Filter paid contributions for this specific month & year
  const monthlyPaidContributions = contributions.filter(c =>
    c.status === 'paid' &&
    c.month === month &&
    c.year === year
  );
  // Helper to split a contribution into Base (₹1,000) and Late Fee / Penalty
  const getContribSplit = (c: Contribution) => {
    const rawLate = (c as any).lateFee !== undefined 
      ? Number((c as any).lateFee) 
      : (c as any).fine !== undefined 
        ? Number((c as any).fine) 
        : ((c.amount || 0) > 1000 ? (c.amount || 0) - 1000 : 0);
    const lateFee = Math.max(0, isNaN(rawLate) ? 0 : rawLate);
    const base = Math.max(0, (c.amount || 0) - lateFee);
    return { base, lateFee };
  };

  const monthlyContributionTotal = monthlyPaidContributions.reduce((acc, c) => acc + (c.amount || 0), 0);
  const monthlyBaseContributionsTotal = monthlyPaidContributions.reduce((acc, c) => acc + getContribSplit(c).base, 0);
  const monthlyLateFeesTotal = monthlyPaidContributions.reduce((acc, c) => acc + getContribSplit(c).lateFee, 0);
  const monthlyLateFeesCount = monthlyPaidContributions.filter(c => getContribSplit(c).lateFee > 0).length;

  const monthlyContribCashReceived = monthlyPaidContributions
    .filter(c => (c.paymentMethod || (c as any).paymentMode || 'online').toString().toLowerCase() === 'cash')
    .reduce((acc, c) => acc + (c.amount || 0), 0);
  const monthlyContribOnlineReceived = monthlyPaidContributions
    .filter(c => (c.paymentMethod || (c as any).paymentMode || 'online').toString().toLowerCase() !== 'cash')
    .reduce((acc, c) => acc + (c.amount || 0), 0);

  const monthlyBaseContribCash = monthlyPaidContributions
    .filter(c => (c.paymentMethod || (c as any).paymentMode || 'online').toString().toLowerCase() === 'cash')
    .reduce((acc, c) => acc + getContribSplit(c).base, 0);
  const monthlyBaseContribOnline = monthlyPaidContributions
    .filter(c => (c.paymentMethod || (c as any).paymentMode || 'online').toString().toLowerCase() !== 'cash')
    .reduce((acc, c) => acc + getContribSplit(c).base, 0);

  const monthlyLateFeesCash = monthlyPaidContributions
    .filter(c => (c.paymentMethod || (c as any).paymentMode || 'online').toString().toLowerCase() === 'cash')
    .reduce((acc, c) => acc + getContribSplit(c).lateFee, 0);
  const monthlyLateFeesOnline = monthlyPaidContributions
    .filter(c => (c.paymentMethod || (c as any).paymentMode || 'online').toString().toLowerCase() !== 'cash')
    .reduce((acc, c) => acc + getContribSplit(c).lateFee, 0);

  // Filter paid loan repayments for this specific month & year
  const monthlyPaidLoanPayments = loanPayments.filter(p =>
    p.status === 'paid' &&
    p.month === month &&
    p.year === year
  );
  const monthlyLoanPrincipalCollected = monthlyPaidLoanPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
  const monthlyLoanInterestCollected = monthlyPaidLoanPayments.reduce((acc, p) => acc + (p.interest || 0), 0);
  const monthlyLoanTotalCollected = monthlyLoanPrincipalCollected + monthlyLoanInterestCollected;
  const monthlyLoanCashReceived = monthlyPaidLoanPayments
    .filter(p => (p.paymentMode || p.paymentMethod || 'Online').toString().toLowerCase() === 'cash')
    .reduce((acc, p) => acc + (p.amount || 0) + (p.interest || 0), 0);
  const monthlyLoanOnlineReceived = monthlyPaidLoanPayments
    .filter(p => (p.paymentMode || p.paymentMethod || 'Online').toString().toLowerCase() !== 'cash')
    .reduce((acc, p) => acc + (p.amount || 0) + (p.interest || 0), 0);

  // Grand totals
  const grandTotalMonthlyReceived = monthlyContributionTotal + monthlyLoanTotalCollected;
  const grandTotalCashReceived = monthlyContribCashReceived + monthlyLoanCashReceived;
  const grandTotalOnlineReceived = monthlyContribOnlineReceived + monthlyLoanOnlineReceived;

  // Initialize jsPDF in A4 Landscape (matching Loan List Statement)
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  // Primary Theme Colors
  const darkIndigo = [30, 27, 75]; // #1e1b4b
  const indigoPrimary = [79, 70, 229]; // #4f46e5
  const slate600 = [71, 85, 105];

  // ==================== DOCUMENT HEADER ====================
  doc.setFontSize(18);
  doc.setTextColor(darkIndigo[0], darkIndigo[1], darkIndigo[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('UNNATI TRUST (R)', pageWidth / 2, 13, { align: 'center' });

  doc.setFontSize(12);
  doc.setTextColor(indigoPrimary[0], indigoPrimary[1], indigoPrimary[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(`Monthly Collection Statement — ${monthLabel.toUpperCase()}`, pageWidth / 2, 19, { align: 'center' });

  doc.setFontSize(8.5);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Generated on: ${exportDateStr}   •   Cycle: ${monthLabel}   •   Total Paid Members: ${monthlyPaidContributions.length}   •   Total Loan Payments: ${monthlyPaidLoanPayments.length}`,
    pageWidth / 2,
    24,
    { align: 'center' }
  );

  // Header Divider Line
  doc.setDrawColor(203, 213, 225); // Slate 300
  doc.setLineWidth(0.4);
  doc.line(marginX, 27, pageWidth - marginX, 27);

  // ==================== TOP METRIC CARDS (Dynamic 4 or 5 Cards) ====================
  const boxY = 30;
  const boxHeight = 13.5;
  const availableWidth = pageWidth - (marginX * 2);

  const summaryBoxes = [
    {
      label: 'TOTAL RECEIVED (GRAND TOTAL)',
      value: `Rs. ${grandTotalMonthlyReceived.toLocaleString('en-IN')}`,
      sub: `Cash: Rs. ${grandTotalCashReceived.toLocaleString('en-IN')}  |  Online: Rs. ${grandTotalOnlineReceived.toLocaleString('en-IN')}`,
      bg: [236, 253, 245], // emerald-50
      border: [167, 243, 208], // emerald-200
      text: [4, 120, 87] // emerald-700
    },
    {
      label: monthlyLateFeesTotal > 0 ? 'BASE CONTRIBUTIONS' : 'MEMBER CONTRIBUTIONS',
      value: `Rs. ${monthlyBaseContributionsTotal.toLocaleString('en-IN')}`,
      sub: `${monthlyPaidContributions.length} Paid (Cash: Rs. ${monthlyBaseContribCash.toLocaleString('en-IN')} | Online: Rs. ${monthlyBaseContribOnline.toLocaleString('en-IN')})`,
      bg: [238, 242, 255], // indigo-50
      border: [199, 210, 254], // indigo-200
      text: [67, 56, 202] // indigo-700
    },
    ...(monthlyLateFeesTotal > 0 ? [{
      label: 'GROUP PENALTIES (LATE FEES)',
      value: `Rs. ${monthlyLateFeesTotal.toLocaleString('en-IN')}`,
      sub: `${monthlyLateFeesCount} Late Fees (Cash: Rs. ${monthlyLateFeesCash.toLocaleString('en-IN')} | Online: Rs. ${monthlyLateFeesOnline.toLocaleString('en-IN')})`,
      bg: [255, 241, 242], // rose-50
      border: [254, 205, 211],
      text: [190, 18, 60] // rose-700
    }] : []),
    {
      label: 'LOAN REPAYMENTS',
      value: `Rs. ${monthlyLoanTotalCollected.toLocaleString('en-IN')}`,
      sub: `${monthlyPaidLoanPayments.length} Collected (Cash: Rs. ${monthlyLoanCashReceived.toLocaleString('en-IN')} | Online: Rs. ${monthlyLoanOnlineReceived.toLocaleString('en-IN')})`,
      bg: [250, 245, 255], // purple-50
      border: [233, 213, 255], // purple-200
      text: [126, 34, 206] // purple-700
    },
    {
      label: 'PRINCIPAL & INTEREST SPLIT',
      value: `Rs. ${monthlyLoanPrincipalCollected.toLocaleString('en-IN')} + Rs. ${monthlyLoanInterestCollected.toLocaleString('en-IN')}`,
      sub: `Principal: Rs. ${monthlyLoanPrincipalCollected.toLocaleString('en-IN')}  |  Interest: Rs. ${monthlyLoanInterestCollected.toLocaleString('en-IN')}`,
      bg: [254, 243, 199], // amber-50
      border: [253, 230, 138], // amber-200
      text: [180, 83, 9] // amber-700
    }
  ];

  const boxCount = summaryBoxes.length;
  const boxGap = 3.5;
  const boxWidth = (availableWidth - (boxGap * (boxCount - 1))) / boxCount;

  summaryBoxes.forEach((box, i) => {
    const curX = marginX + (i * (boxWidth + boxGap));
    doc.setFillColor(box.bg[0], box.bg[1], box.bg[2]);
    doc.setDrawColor(box.border[0], box.border[1], box.border[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(curX, boxY, boxWidth, boxHeight, 1.5, 1.5, 'FD');

    doc.setFontSize(6.2);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(box.label, curX + (boxWidth / 2), boxY + 4, { align: 'center' });

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(box.text[0], box.text[1], box.text[2]);
    doc.text(box.value, curX + (boxWidth / 2), boxY + 8.5, { align: 'center' });

    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(box.sub, curX + (boxWidth / 2), boxY + 12, { align: 'center' });
  });

  // Footer / Page numbering helper for all pages
  const attachFooter = () => {
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(
      'Confidential • Unnati Trust (R) Monthly Collection Statement • Internal Accounting Audit Record',
      marginX,
      pageHeight - 6
    );
    doc.text(
      `Page ${(doc as any).internal.getNumberOfPages()}`,
      pageWidth - marginX,
      pageHeight - 6,
      { align: 'right' }
    );
  };

  // ==================== PART 1: Monthly Collection Summary ====================
  let summaryItemIdx = 1;
  const part1SummaryRows: string[][] = [
    [
      String(summaryItemIdx++),
      'Total Received (Grand Total)',
      `Rs. ${grandTotalMonthlyReceived.toLocaleString('en-IN')}`,
      `Grand Total collections received (Cash: Rs. ${grandTotalCashReceived.toLocaleString('en-IN')}  |  Online: Rs. ${grandTotalOnlineReceived.toLocaleString('en-IN')})`
    ],
    [
      String(summaryItemIdx++),
      monthlyLateFeesTotal > 0 ? 'Member Base Contributions' : 'Member Contributions',
      `Rs. ${monthlyBaseContributionsTotal.toLocaleString('en-IN')}`,
      `${monthlyPaidContributions.length} Paid Subscriptions @ Rs. 1,000 (Cash: Rs. ${monthlyBaseContribCash.toLocaleString('en-IN')}  |  Online: Rs. ${monthlyBaseContribOnline.toLocaleString('en-IN')})`
    ],
    ...(monthlyLateFeesTotal > 0 ? [[
      String(summaryItemIdx++),
      'Group Penalties Earned (Late Fees)',
      `Rs. ${monthlyLateFeesTotal.toLocaleString('en-IN')}`,
      `${monthlyLateFeesCount} Late fee penalty charges collected for payments recorded after due date (10th) (Cash: Rs. ${monthlyLateFeesCash.toLocaleString('en-IN')}  |  Online: Rs. ${monthlyLateFeesOnline.toLocaleString('en-IN')})`
    ]] : []),
    [
      String(summaryItemIdx++),
      'Total Loan Repayments Collected',
      `Rs. ${monthlyLoanTotalCollected.toLocaleString('en-IN')}`,
      `${monthlyPaidLoanPayments.length} Total Loan Installments (Cash: Rs. ${monthlyLoanCashReceived.toLocaleString('en-IN')}  |  Online: Rs. ${monthlyLoanOnlineReceived.toLocaleString('en-IN')})`
    ],
    [
      String(summaryItemIdx++),
      'Loan Principal Recovered',
      `Rs. ${monthlyLoanPrincipalCollected.toLocaleString('en-IN')}`,
      'Principal recovered towards member active loan balances'
    ],
    [
      String(summaryItemIdx++),
      'Loan Interest Received [0.5%]',
      `Rs. ${monthlyLoanInterestCollected.toLocaleString('en-IN')}`,
      '0.5% monthly flat interest earnings on loans'
    ]
  ];

  autoTable(doc, {
    startY: 47,
    head: [[
      '#',
      'Monthly Collection Summary',
      'Amount (Rs.)',
      'Collection Breakdown & Remarks'
    ]],
    body: part1SummaryRows,
    theme: 'striped',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.2,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
      valign: 'middle'
    },
    headStyles: {
      fillColor: [30, 27, 75], // Deep indigo
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left'
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { cellWidth: 70, fontStyle: 'bold' },
      2: { halign: 'right', cellWidth: 38, fontStyle: 'bold', textColor: [4, 120, 87] },
      3: { cellWidth: pageWidth - (marginX * 2) - 10 - 70 - 38 }
    },
    didDrawPage: attachFooter
  });

  // ==================== PART 2: Member collection details ====================
  let currentY = (doc as any).lastAutoTable.finalY + 8;
  if (currentY + 35 > pageHeight - 15) {
    doc.addPage();
    currentY = 14;
  }

  // Section Header 2
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(darkIndigo[0], darkIndigo[1], darkIndigo[2]);
  doc.text('Member collection details', marginX, currentY);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.text(
    monthlyLateFeesTotal > 0
      ? `Total Paid Members: ${monthlyPaidContributions.length}   •   Total: Rs. ${monthlyContributionTotal.toLocaleString('en-IN')} (Base: Rs. ${monthlyBaseContributionsTotal.toLocaleString('en-IN')} | Penalties: Rs. ${monthlyLateFeesTotal.toLocaleString('en-IN')})`
      : `Total Paid Members: ${monthlyPaidContributions.length}   •   Total Collected: Rs. ${monthlyContributionTotal.toLocaleString('en-IN')}`,
    marginX + 60,
    currentY
  );

  const hasLateFees = monthlyLateFeesTotal > 0;

  const memberRows = monthlyPaidContributions.map((c, idx) => {
    const member = allUsers.find(u =>
      (u.uid && c.userId && u.uid === c.userId) ||
      (u.email && c.userEmail && u.email.toLowerCase().trim() === c.userEmail.toLowerCase().trim()) ||
      (isPraneshMember(c) && isPraneshMember(u))
    );
    const rawMemberName = member?.displayName || (c as any).userName || (c as any).displayName || (c.userEmail ? c.userEmail.split('@')[0] : `Member ${idx + 1}`);
    const memberPhone = member?.phoneNumber || (member as any)?.phone || '';
    const memberName = getSafeMemberDisplayName(rawMemberName, memberPhone, c.userEmail || member?.email);
    const dateObj = c.timestamp?.toDate ? c.timestamp.toDate() : (c.timestamp?.seconds ? new Date(c.timestamp.seconds * 1000) : null);
    const dateStr = dateObj ? format(dateObj, 'dd-MMM-yyyy') : '-';
    const mode = (c.paymentMethod || (c as any).paymentMode || 'Online').toUpperCase();
    const split = getContribSplit(c);

    if (hasLateFees) {
      return [
        String(idx + 1),
        memberName,
        `Rs. ${(c.amount || 1000).toLocaleString('en-IN')}`,
        `Rs. ${split.base.toLocaleString('en-IN')}`,
        split.lateFee > 0 ? `Rs. ${split.lateFee.toLocaleString('en-IN')}` : 'Rs. 0',
        mode,
        dateStr,
        (c.status || 'PAID').toUpperCase()
      ];
    } else {
      return [
        String(idx + 1),
        memberName,
        `Rs. ${(c.amount || 1000).toLocaleString('en-IN')}`,
        mode,
        dateStr,
        (c.status || 'PAID').toUpperCase()
      ];
    }
  });

  if (memberRows.length === 0) {
    memberRows.push(hasLateFees
      ? ['-', 'No member contributions recorded for this month', '-', '-', '-', '-', '-', '-']
      : ['-', 'No member contributions recorded for this month', '-', '-', '-', '-']
    );
  }

  const memberFoot = hasLateFees ? [
    [
      'TOTAL',
      `${monthlyPaidContributions.length} Paid Members`,
      `Rs. ${monthlyContributionTotal.toLocaleString('en-IN')}`,
      `Rs. ${monthlyBaseContributionsTotal.toLocaleString('en-IN')}`,
      `Rs. ${monthlyLateFeesTotal.toLocaleString('en-IN')}`,
      '',
      '-',
      'PAID'
    ]
  ] : [
    [
      'TOTAL',
      `${monthlyPaidContributions.length} Paid Members`,
      `Rs. ${monthlyContributionTotal.toLocaleString('en-IN')}`,
      '',
      '-',
      'PAID'
    ]
  ];

  const memberHead = hasLateFees ? [[
    '#',
    'Member Name',
    'Total Amount (Rs.)',
    'Base Contrib.',
    'Late Fee',
    'Payment Mode',
    'Payment Date',
    'Status'
  ]] : [[
    '#',
    'Member Name',
    'Contribution Amount (Rs.)',
    'Payment Mode',
    'Payment Date',
    'Status'
  ]];

  const memberColumnStyles: any = hasLateFees ? {
    0: { halign: 'center', cellWidth: 8 },
    1: { cellWidth: 68, fontStyle: 'bold' },
    2: { halign: 'right', cellWidth: 34, fontStyle: 'bold', textColor: [67, 56, 202] },
    3: { halign: 'right', cellWidth: 30, fontStyle: 'bold', textColor: [30, 41, 59] },
    4: { halign: 'right', cellWidth: 34, fontStyle: 'bold', textColor: [190, 18, 60] },
    5: { halign: 'center', cellWidth: 26 },
    6: { halign: 'center', cellWidth: 28 },
    7: { halign: 'center', cellWidth: 22, textColor: [4, 120, 87], fontStyle: 'bold' }
  } : {
    0: { halign: 'center', cellWidth: 10 },
    1: { cellWidth: 95, fontStyle: 'bold' },
    2: { halign: 'right', cellWidth: 48, fontStyle: 'bold', textColor: [67, 56, 202] },
    3: { halign: 'center', cellWidth: 38 },
    4: { halign: 'center', cellWidth: 42 },
    5: { halign: 'center', cellWidth: 36, textColor: [4, 120, 87], fontStyle: 'bold' }
  };

  autoTable(doc, {
    startY: currentY + 3,
    head: memberHead,
    body: memberRows,
    foot: memberFoot,
    theme: 'striped',
    showHead: 'everyPage',
    showFoot: 'lastPage',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
      valign: 'middle'
    },
    headStyles: {
      fillColor: [79, 70, 229], // Indigo primary
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left'
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 8,
      lineWidth: 0.3,
      lineColor: [203, 213, 225]
    },
    columnStyles: memberColumnStyles,
    didDrawPage: attachFooter
  });

  // ==================== PART 3: Loan Repayments ====================
  currentY = (doc as any).lastAutoTable.finalY + 8;
  if (currentY + 35 > pageHeight - 15) {
    doc.addPage();
    currentY = 14;
  }

  // Section Header 3
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(darkIndigo[0], darkIndigo[1], darkIndigo[2]);
  doc.text('Loan Repayments', marginX, currentY);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.text(
    `Total Collected: Rs. ${monthlyLoanTotalCollected.toLocaleString('en-IN')}   (Principal: Rs. ${monthlyLoanPrincipalCollected.toLocaleString('en-IN')}  •  Interest: Rs. ${monthlyLoanInterestCollected.toLocaleString('en-IN')})`,
    marginX + 45,
    currentY
  );

  const loanRepaymentRows = monthlyPaidLoanPayments.map((p, idx) => {
    const parentLoan = loans.find(l => l.id === p.loanId);
    const borrower = allUsers.find(u =>
      (u.uid && parentLoan?.userId && u.uid === parentLoan.userId) ||
      (u.email && parentLoan?.userEmail && u.email.toLowerCase().trim() === parentLoan.userEmail.toLowerCase().trim()) ||
      (u.uid && p.userId && u.uid === p.userId) ||
      (u.email && p.userEmail && u.email.toLowerCase().trim() === p.userEmail.toLowerCase().trim()) ||
      ((isPraneshMember(p) || (parentLoan && isPraneshMember(parentLoan))) && isPraneshMember(u))
    );
    const rawBorrowerName = borrower?.displayName || (parentLoan as any)?.userName || parentLoan?.userEmail?.split('@')[0] || (p as any)?.userName || p.userEmail?.split('@')[0] || `Borrower ${idx + 1}`;
    const borrowerPhone = borrower?.phoneNumber || (borrower as any)?.phone || '';
    const borrowerName = getSafeMemberDisplayName(rawBorrowerName, borrowerPhone, parentLoan?.userEmail || p.userEmail || borrower?.email);

    // Annotate with L# for all borrowers (L#1, L#2, etc.) irrespective of loan count
    const borrowerLoans = loans.filter(l =>
      (borrower && ((l.userId && (l.userId === borrower.uid || l.userId === borrower.id)) || (l.userEmail && borrower.email && l.userEmail.toLowerCase().trim() === borrower.email.toLowerCase().trim()))) ||
      (parentLoan && ((l.userId && l.userId === parentLoan.userId) || (l.userEmail && parentLoan.userEmail && l.userEmail.toLowerCase().trim() === parentLoan.userEmail.toLowerCase().trim()))) ||
      (p.userId && l.userId === p.userId) ||
      (p.userEmail && l.userEmail && l.userEmail.toLowerCase().trim() === p.userEmail.toLowerCase().trim())
    );
    const getSanctionTime = (l: Loan): number => {
      const lAny = l as any;
      if (lAny.disbursementDate) {
        const d = new Date(lAny.disbursementDate).getTime();
        if (!isNaN(d)) return d;
      }
      if (l.approvedAt?.toDate) return l.approvedAt.toDate().getTime();
      if (l.approvedAt?.seconds) return l.approvedAt.seconds * 1000;
      if (lAny.loanDate) {
        const d = new Date(lAny.loanDate).getTime();
        if (!isNaN(d)) return d;
      }
      if (lAny.date) {
        const d = new Date(lAny.date).getTime();
        if (!isNaN(d)) return d;
      }
      if (l.createdAt?.toDate) return l.createdAt.toDate().getTime();
      if (l.createdAt?.seconds) return l.createdAt.seconds * 1000;
      return 0;
    };
    const sortedBorrowerLoans = [...borrowerLoans].sort((a, b) => getSanctionTime(a) - getSanctionTime(b));
    const payToIdx = p.loanId ? sortedBorrowerLoans.findIndex(l => l.id === p.loanId) : -1;
    const payToNum = payToIdx >= 0 ? payToIdx + 1 : 1;
    const borrowerDisplayName = `${borrowerName} (L#${payToNum})`;

    const principal = p.amount || 0;
    const interest = p.interest || 0;
    const total = principal + interest;
    const paymentMode = (p.paymentMode || (p as any)?.paymentMethod || 'Online').toUpperCase();
    const dateObj = p.approvedAt?.toDate ? p.approvedAt.toDate() : (p.timestamp?.toDate ? p.timestamp.toDate() : (p.timestamp?.seconds ? new Date(p.timestamp.seconds * 1000) : null));
    const dateStr = dateObj ? format(dateObj, 'dd-MMM-yyyy') : '-';

    return [
      String(idx + 1),
      borrowerDisplayName,
      `Rs. ${principal.toLocaleString('en-IN')}`,
      `Rs. ${interest.toLocaleString('en-IN')}`,
      `Rs. ${total.toLocaleString('en-IN')}`,
      paymentMode,
      dateStr,
      (p.status || 'PAID').toUpperCase()
    ];
  });

  if (loanRepaymentRows.length === 0) {
    loanRepaymentRows.push(['-', 'No loan repayments recorded for this month', '-', '-', '-', '-', '-', '-']);
  }

  const loanFoot = [
    [
      'TOTAL',
      `${monthlyPaidLoanPayments.length} Loan Repayments`,
      `Rs. ${monthlyLoanPrincipalCollected.toLocaleString('en-IN')}`,
      `Rs. ${monthlyLoanInterestCollected.toLocaleString('en-IN')}`,
      `Rs. ${monthlyLoanTotalCollected.toLocaleString('en-IN')}`,
      '',
      '-',
      'PAID'
    ]
  ];

  autoTable(doc, {
    startY: currentY + 3,
    head: [[
      '#',
      'Borrower Name',
      'Principal (Rs.)',
      'Interest (Rs.)',
      'Total Repayment (Rs.)',
      'Payment Mode',
      'Payment Date',
      'Status'
    ]],
    body: loanRepaymentRows,
    foot: loanFoot,
    theme: 'striped',
    showHead: 'everyPage',
    showFoot: 'lastPage',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
      valign: 'middle'
    },
    headStyles: {
      fillColor: [126, 34, 206], // Purple primary
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left'
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 8,
      lineWidth: 0.3,
      lineColor: [203, 213, 225]
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { cellWidth: 65, fontStyle: 'bold' },
      2: { halign: 'right', cellWidth: 32 },
      3: { halign: 'right', cellWidth: 28, textColor: [180, 83, 9], fontStyle: 'bold' },
      4: { halign: 'right', cellWidth: 36, fontStyle: 'bold', textColor: [126, 34, 206] },
      5: { halign: 'center', cellWidth: 26 },
      6: { halign: 'center', cellWidth: 30 },
      7: { halign: 'center', cellWidth: 22, textColor: [4, 120, 87], fontStyle: 'bold' }
    },
    didDrawPage: attachFooter
  });

  const fileName = `Unnati_Monthly_Collection_Statement_${format(monthDate, 'MMMM_yyyy')}_${format(now, 'ddMMMyyyy_HHmm')}.pdf`;

  return {
    doc,
    fileName,
    meta: {
      month,
      year,
      monthLabel,
      grandTotal: grandTotalMonthlyReceived,
      cashTotal: grandTotalCashReceived,
      onlineTotal: grandTotalOnlineReceived,
      contributionTotal: monthlyContributionTotal,
      loanTotal: monthlyLoanTotalCollected,
      principalCollected: monthlyLoanPrincipalCollected,
      interestCollected: monthlyLoanInterestCollected,
      paidContributionsCount: monthlyPaidContributions.length,
      paidLoanPaymentsCount: monthlyPaidLoanPayments.length
    }
  };
}
