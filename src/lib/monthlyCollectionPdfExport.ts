import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { Contribution, Loan, LoanPayment, UserProfile } from '../types';
import { getSafeMemberDisplayName } from './utils';

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
  const monthlyContributionTotal = monthlyPaidContributions.reduce((acc, c) => acc + (c.amount || 0), 0);
  const monthlyContribCashReceived = monthlyPaidContributions
    .filter(c => (c.paymentMethod || (c as any).paymentMode || 'online').toString().toLowerCase() === 'cash')
    .reduce((acc, c) => acc + (c.amount || 0), 0);
  const monthlyContribOnlineReceived = monthlyPaidContributions
    .filter(c => (c.paymentMethod || (c as any).paymentMode || 'online').toString().toLowerCase() !== 'cash')
    .reduce((acc, c) => acc + (c.amount || 0), 0);

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

  // ==================== TOP METRIC CARDS (4 Cards) ====================
  const boxY = 30;
  const boxHeight = 13.5;
  const availableWidth = pageWidth - (marginX * 2);
  const boxCount = 4;
  const boxGap = 4;
  const boxWidth = (availableWidth - (boxGap * (boxCount - 1))) / boxCount;

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
      label: 'MEMBER SUBSCRIPTIONS',
      value: `Rs. ${monthlyContributionTotal.toLocaleString('en-IN')}`,
      sub: `${monthlyPaidContributions.length} Paid (Cash: Rs. ${monthlyContribCashReceived.toLocaleString('en-IN')} | Online: Rs. ${monthlyContribOnlineReceived.toLocaleString('en-IN')})`,
      bg: [238, 242, 255], // indigo-50
      border: [199, 210, 254], // indigo-200
      text: [67, 56, 202] // indigo-700
    },
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
  const part1SummaryRows = [
    [
      '1',
      'Total Received (Grand Total)',
      `Rs. ${grandTotalMonthlyReceived.toLocaleString('en-IN')}`,
      `Grand Total collections received (Cash: Rs. ${grandTotalCashReceived.toLocaleString('en-IN')}  |  Online: Rs. ${grandTotalOnlineReceived.toLocaleString('en-IN')})`
    ],
    [
      '2',
      'Member Subscriptions / Contributions',
      `Rs. ${monthlyContributionTotal.toLocaleString('en-IN')}`,
      `${monthlyPaidContributions.length} Paid Subscriptions @ Rs. 1,000 (Cash: Rs. ${monthlyContribCashReceived.toLocaleString('en-IN')}  |  Online: Rs. ${monthlyContribOnlineReceived.toLocaleString('en-IN')})`
    ],
    [
      '3',
      'Total Loan Repayments Collected',
      `Rs. ${monthlyLoanTotalCollected.toLocaleString('en-IN')}`,
      `${monthlyPaidLoanPayments.length} Total Loan Installments (Cash: Rs. ${monthlyLoanCashReceived.toLocaleString('en-IN')}  |  Online: Rs. ${monthlyLoanOnlineReceived.toLocaleString('en-IN')})`
    ],
    [
      '4',
      'Loan Principal Recovered',
      `Rs. ${monthlyLoanPrincipalCollected.toLocaleString('en-IN')}`,
      'Principal recovered towards member active loan balances'
    ],
    [
      '5',
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
    `Total Paid Members: ${monthlyPaidContributions.length}   •   Total Amount: Rs. ${monthlyContributionTotal.toLocaleString('en-IN')}`,
    marginX + 60,
    currentY
  );

  const memberRows = monthlyPaidContributions.map((c, idx) => {
    const member = allUsers.find(u =>
      (u.uid && c.userId && u.uid === c.userId) ||
      (u.email && c.userEmail && u.email.toLowerCase().trim() === c.userEmail.toLowerCase().trim())
    );
    const rawMemberName = member?.displayName || (c as any).userName || (c as any).displayName || (c.userEmail ? c.userEmail.split('@')[0] : `Member ${idx + 1}`);
    const memberPhone = member?.phoneNumber || (member as any)?.phone || '';
    const memberName = getSafeMemberDisplayName(rawMemberName, memberPhone, c.userEmail || member?.email);
    const dateObj = c.timestamp?.toDate ? c.timestamp.toDate() : (c.timestamp?.seconds ? new Date(c.timestamp.seconds * 1000) : null);
    const dateStr = dateObj ? format(dateObj, 'dd-MMM-yyyy') : '-';
    const mode = (c.paymentMethod || (c as any).paymentMode || 'Online').toUpperCase();

    return [
      String(idx + 1),
      memberName,
      `Rs. ${(c.amount || 1000).toLocaleString('en-IN')}`,
      mode,
      dateStr,
      (c.status || 'PAID').toUpperCase()
    ];
  });

  if (memberRows.length === 0) {
    memberRows.push(['-', 'No member contributions recorded for this month', '-', '-', '-', '-']);
  }

  const memberFoot = [
    [
      'TOTAL',
      `${monthlyPaidContributions.length} Paid Members`,
      `Rs. ${monthlyContributionTotal.toLocaleString('en-IN')}`,
      `Cash: Rs. ${monthlyContribCashReceived.toLocaleString('en-IN')}  •  Online: Rs. ${monthlyContribOnlineReceived.toLocaleString('en-IN')}`,
      '-',
      'PAID'
    ]
  ];

  autoTable(doc, {
    startY: currentY + 3,
    head: [[
      '#',
      'Member Name',
      'Contribution Amount (Rs.)',
      'Payment Mode',
      'Payment Date',
      'Status'
    ]],
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
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { cellWidth: 80, fontStyle: 'bold' },
      2: { halign: 'right', cellWidth: 42, fontStyle: 'bold', textColor: [67, 56, 202] },
      3: { halign: 'center', cellWidth: 32 },
      4: { halign: 'center', cellWidth: 35 },
      5: { halign: 'center', cellWidth: 30, textColor: [4, 120, 87], fontStyle: 'bold' }
    },
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
      (u.email && p.userEmail && u.email.toLowerCase().trim() === p.userEmail.toLowerCase().trim())
    );
    const rawBorrowerName = borrower?.displayName || (parentLoan as any)?.userName || parentLoan?.userEmail?.split('@')[0] || (p as any)?.userName || p.userEmail?.split('@')[0] || `Borrower ${idx + 1}`;
    const borrowerPhone = borrower?.phoneNumber || (borrower as any)?.phone || '';
    const borrowerName = getSafeMemberDisplayName(rawBorrowerName, borrowerPhone, parentLoan?.userEmail || p.userEmail || borrower?.email);
    const principal = p.amount || 0;
    const interest = p.interest || 0;
    const total = principal + interest;
    const paymentMode = (p.paymentMode || (p as any)?.paymentMethod || 'Online').toUpperCase();
    const dateObj = p.approvedAt?.toDate ? p.approvedAt.toDate() : (p.timestamp?.toDate ? p.timestamp.toDate() : (p.timestamp?.seconds ? new Date(p.timestamp.seconds * 1000) : null));
    const dateStr = dateObj ? format(dateObj, 'dd-MMM-yyyy') : '-';

    return [
      String(idx + 1),
      borrowerName,
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
      `Cash: Rs. ${monthlyLoanCashReceived.toLocaleString('en-IN')}  •  Online: Rs. ${monthlyLoanOnlineReceived.toLocaleString('en-IN')}`,
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
