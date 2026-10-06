import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { Loan, LoanPayment, UserProfile } from '../types';

export interface LoanListPdfOptions {
  loans: Loan[];
  loanPayments: LoanPayment[];
  allUsers: UserProfile[];
  filter?: 'all' | 'active' | 'settled';
  title?: string;
}

export interface LoanListPdfResult {
  doc: jsPDF;
  fileName: string;
  meta: {
    totalCount: number;
    activeCount: number;
    settledCount: number;
    totalSanctioned: number;
    totalRepaid: number;
    totalPendingPrincipal: number;
    totalInterestReceived: number;
    totalRemainingBalance?: number;
    totalCurrentDue: number;
  };
}

/**
 * Builds a pristine, print-ready PDF document for the current loan list view.
 * Includes member details, sanction dates, approved principals, repayment progress,
 * pending principal amounts, interest received from members, monthly dues, and live statuses.
 */
export function generateLoanListPdfDoc(options: LoanListPdfOptions): LoanListPdfResult {
  const { loans, loanPayments, allUsers, filter = 'active' } = options;
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Helper to determine if a loan payment belongs to a specific loan
  const isPaymentBelongingToLoan = (p: LoanPayment, loan: Loan): boolean => {
    if (p.loanId) return p.loanId === loan.id;
    const isMatchUser = (loan.userId && p.userId === loan.userId) ||
      (loan.userEmail && p.userEmail && loan.userEmail.toLowerCase().trim() === p.userEmail.toLowerCase().trim());
    if (isMatchUser) return true;
    const pEmail = (p.userEmail || '').toLowerCase().trim();
    const lEmail = (loan.userEmail || '').toLowerCase().trim();
    const isPraneshP = pEmail.includes('pranesh') || p.userId === 'imp5eagibVcvtfD5qleX4ISC1Nj2';
    const isPraneshL = lEmail.includes('pranesh') || loan.userId === 'imp5eagibVcvtfD5qleX4ISC1Nj2';
    return Boolean(isPraneshP && isPraneshL);
  };

  // Build enhanced loan records
  const processedLoans = loans
    .filter(l => l.status !== 'declined') // Exclude declined loans from portfolio
    .map(loan => {
      const payments = loanPayments.filter(p => isPaymentBelongingToLoan(p, loan));
      const paidPayments = payments.filter(p => p.status === 'paid');
      const totalPrincipalPaid = paidPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
      const totalInterestPaid = paidPayments.reduce((acc, p) => acc + (Number(p.interest) || 0), 0);
      const approvedAmount = loan.approvedAmount || loan.amount || 0;
      const remainingPrincipal = Math.max(0, approvedAmount - totalPrincipalPaid);
      const installments = loan.installments || 10;
      const standardPrincipal = 5000;

      // Calculate remaining total (Principal + 0.5% interest on declining balance with base 5000)
      let remainingTotal = 0;
      if (remainingPrincipal > 0 && standardPrincipal > 0) {
        const remainingInstallments = Math.ceil(remainingPrincipal / standardPrincipal);
        for (let i = 0; i < remainingInstallments; i++) {
          const currentBalance = remainingPrincipal - (i * standardPrincipal);
          const interest = Math.round(Math.max(0, currentBalance * 0.005));
          const principalForThisMonth = i === remainingInstallments - 1 
            ? (remainingPrincipal % standardPrincipal || standardPrincipal) 
            : standardPrincipal;
          remainingTotal += (principalForThisMonth + interest);
        }
      }

      // Next installment due calculation (Principal installment + current interest)
      const currentMonthInterest = Math.round(remainingPrincipal * 0.005);
      const currentMonthDue = remainingPrincipal > 0 ? (Math.min(5000, remainingPrincipal) + currentMonthInterest) : 0;

      // Match member profile
      const targetUser = allUsers.find(u =>
        (loan.userId && u.uid === loan.userId) ||
        (loan.userEmail && u.email?.toLowerCase().trim() === loan.userEmail.toLowerCase().trim())
      );
      const memberName = targetUser?.displayName || (loan.userEmail ? loan.userEmail.split('@')[0] : 'Member');
      const memberPhone = targetUser?.phoneNumber || (targetUser as any)?.phone || '-';

      // Date parsing
      let sanctionDateStr = '-';
      let sanctionDateObj: Date | null = null;
      if (loan.approvedAt?.toDate) {
        sanctionDateObj = loan.approvedAt.toDate();
      } else if (loan.createdAt?.toDate) {
        sanctionDateObj = loan.createdAt.toDate();
      } else if (loan.approvedAt) {
        sanctionDateObj = new Date(loan.approvedAt);
      } else if (loan.createdAt) {
        sanctionDateObj = new Date(loan.createdAt);
      }

      if (sanctionDateObj && !isNaN(sanctionDateObj.getTime())) {
        sanctionDateStr = format(sanctionDateObj, 'dd-MMM-yyyy');
      }

      // Monthly payment check for current month
      const isPaidThisMonth = payments.some(p => p.month === currentMonth && p.year === currentYear && p.status === 'paid');
      const isPendingThisMonth = payments.some(p => p.month === currentMonth && p.year === currentYear && p.status === 'pending');
      const isFullyPaid = loan.status === 'paid' || remainingPrincipal <= 0;
      const loanApprovedThisMonth = sanctionDateObj &&
        sanctionDateObj.getMonth() === (currentMonth - 1) &&
        sanctionDateObj.getFullYear() === currentYear;
      const isLate = !isFullyPaid && !isPaidThisMonth && !isPendingThisMonth && now.getDate() > 10 && !loanApprovedThisMonth;

      let statusLabel = 'ACTIVE';
      if (isFullyPaid) {
        statusLabel = 'CLOSED / SETTLED';
      } else if (isPaidThisMonth) {
        statusLabel = 'PAID (THIS MONTH)';
      } else if (isPendingThisMonth) {
        statusLabel = 'AWAITING APPROVAL';
      } else if (isLate) {
        statusLabel = 'OVERDUE';
      } else if (loanApprovedThisMonth) {
        statusLabel = 'STARTS NEXT MONTH';
      } else {
        statusLabel = 'PENDING (DUE)';
      }

      return {
        loan,
        memberName,
        memberPhone,
        memberEmail: targetUser?.email || loan.userEmail,
        sanctionDateStr,
        sanctionDateObj,
        approvedAmount,
        paidInstallmentsCount: paidPayments.length,
        totalInstallments: installments,
        totalPrincipalPaid,
        totalInterestPaid,
        remainingPrincipal,
        remainingTotal,
        currentMonthDue,
        isFullyPaid,
        isLate,
        statusLabel
      };
    });

  // Filter based on option
  const filteredLoans = processedLoans.filter(item => {
    if (filter === 'active') return !item.isFullyPaid;
    if (filter === 'settled') return item.isFullyPaid;
    return true; // 'all'
  });

  // Calculate totals
  const totalSanctioned = filteredLoans.reduce((sum, item) => sum + item.approvedAmount, 0);
  const totalRepaid = filteredLoans.reduce((sum, item) => sum + item.totalPrincipalPaid, 0);
  const totalPendingPrincipal = filteredLoans.reduce((sum, item) => sum + item.remainingPrincipal, 0);
  const totalInterestReceived = filteredLoans.reduce((sum, item) => sum + item.totalInterestPaid, 0);
  const totalRemainingBalance = filteredLoans.reduce((sum, item) => sum + item.remainingTotal, 0);
  const totalCurrentDue = filteredLoans.reduce((sum, item) => sum + item.currentMonthDue, 0);

  const activeCount = processedLoans.filter(l => !l.isFullyPaid).length;
  const settledCount = processedLoans.filter(l => l.isFullyPaid).length;

  // Initialize jsPDF in A4 Landscape
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Primary Colors
  const darkIndigo = [30, 27, 75]; // #1e1b4b
  const indigoPrimary = [79, 70, 229]; // #4f46e5
  const slate600 = [71, 85, 105];

  // Header Section
  doc.setFontSize(18);
  doc.setTextColor(darkIndigo[0], darkIndigo[1], darkIndigo[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('UNNATI TRUST (R)', pageWidth / 2, 14, { align: 'center' });

  doc.setFontSize(12);
  doc.setTextColor(indigoPrimary[0], indigoPrimary[1], indigoPrimary[2]);
  doc.setFont('helvetica', 'bold');
  const filterLabel = filter === 'active' ? 'Active Loans Portfolio' : (filter === 'settled' ? 'Settled / Closed Loans' : 'Complete Loan Portfolio');
  doc.text(`Loan Portfolio & Balances Statement (${filterLabel})`, pageWidth / 2, 20, { align: 'center' });

  doc.setFontSize(8.5);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Generated on: ${format(now, 'dd-MMM-yyyy hh:mm a')}  •  Cycle: ${format(now, 'MMMM yyyy')}  •  Total Records: ${filteredLoans.length}`,
    pageWidth / 2,
    25,
    { align: 'center' }
  );

  // Divider Line
  doc.setDrawColor(203, 213, 225); // Slate 300
  doc.setLineWidth(0.4);
  doc.line(14, 28, pageWidth - 14, 28);

  // Summary Metrics Bar (5 Cards at top)
  const boxY = 31;
  const boxHeight = 13;
  const marginX = 14;
  const availableWidth = pageWidth - (marginX * 2);
  const boxCount = 5;
  const boxGap = 3;
  const boxWidth = (availableWidth - (boxGap * (boxCount - 1))) / boxCount;

  const summaryBoxes = [
    { label: 'LOANS IN VIEW', value: `${filteredLoans.length} (${activeCount} Active / ${settledCount} Closed)`, bg: [248, 250, 252], border: [226, 232, 240], text: [15, 23, 42] },
    { label: 'TOTAL SANCTIONED', value: `Rs. ${totalSanctioned.toLocaleString('en-IN')}`, bg: [238, 242, 255], border: [199, 210, 254], text: [67, 56, 202] },
    { label: 'TOTAL PRINCIPAL REPAID', value: `Rs. ${totalRepaid.toLocaleString('en-IN')}`, bg: [236, 253, 245], border: [167, 243, 208], text: [4, 120, 87] },
    { label: 'PENDING PRINCIPAL', value: `Rs. ${totalPendingPrincipal.toLocaleString('en-IN')}`, bg: [255, 241, 242], border: [254, 205, 211], text: [190, 18, 60] },
    { label: 'INTEREST RECEIVED', value: `Rs. ${Math.round(totalInterestReceived).toLocaleString('en-IN')}`, bg: [254, 243, 199], border: [253, 230, 138], text: [180, 83, 9] },
  ];

  summaryBoxes.forEach((box, i) => {
    const curX = marginX + (i * (boxWidth + boxGap));
    doc.setFillColor(box.bg[0], box.bg[1], box.bg[2]);
    doc.setDrawColor(box.border[0], box.border[1], box.border[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(curX, boxY, boxWidth, boxHeight, 1.5, 1.5, 'FD');

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(box.label, curX + (boxWidth / 2), boxY + 4.5, { align: 'center' });

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(box.text[0], box.text[1], box.text[2]);
    doc.text(box.value, curX + (boxWidth / 2), boxY + 10, { align: 'center' });
  });

  // Table Body Rows
  const tableRows = filteredLoans.map((item, idx) => {
    return [
      String(idx + 1),
      `${item.memberName}\n${item.memberPhone}`,
      item.sanctionDateStr,
      `Rs. ${item.approvedAmount.toLocaleString('en-IN')}`,
      `${item.paidInstallmentsCount} / ${item.totalInstallments} Paid`,
      `Rs. ${item.totalPrincipalPaid.toLocaleString('en-IN')}`,
      `Rs. ${item.remainingPrincipal.toLocaleString('en-IN')}`,
      `Rs. ${Math.round(item.totalInterestPaid).toLocaleString('en-IN')}`,
      item.remainingPrincipal > 0 ? `Rs. ${Math.round(item.currentMonthDue).toLocaleString('en-IN')}` : '-',
      item.statusLabel
    ];
  });

  if (tableRows.length === 0) {
    tableRows.push(['-', 'No loans matching the selected filter', '-', '-', '-', '-', '-', '-', '-', '-']);
  }

  // Footer totals row
  const tableFoot = [
    [
      'TOTAL',
      `${filteredLoans.length} Loans`,
      '-',
      `Rs. ${totalSanctioned.toLocaleString('en-IN')}`,
      '-',
      `Rs. ${totalRepaid.toLocaleString('en-IN')}`,
      `Rs. ${totalPendingPrincipal.toLocaleString('en-IN')}`,
      `Rs. ${Math.round(totalInterestReceived).toLocaleString('en-IN')}`,
      `Rs. ${Math.round(totalCurrentDue).toLocaleString('en-IN')}`,
      '-'
    ]
  ];

  autoTable(doc, {
    startY: 48,
    head: [[
      '#',
      'Member Details',
      'Sanction Date',
      'Sanctioned (Rs.)',
      'Progress',
      'Principal Repaid',
      'Pending Principal',
      'Interest Received',
      `Due (${format(now, 'MMM')})`,
      'Status'
    ]],
    body: tableRows,
    foot: tableFoot,
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
      fillColor: [30, 27, 75],
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
      1: { cellWidth: 46 },
      2: { halign: 'center', cellWidth: 26 },
      3: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
      4: { halign: 'center', cellWidth: 24 },
      5: { halign: 'right', cellWidth: 28 },
      6: { halign: 'right', cellWidth: 28, fontStyle: 'bold', textColor: [190, 18, 60] },
      7: { halign: 'right', cellWidth: 30, fontStyle: 'bold', textColor: [180, 83, 9] },
      8: { halign: 'right', cellWidth: 26, fontStyle: 'bold', textColor: [67, 56, 202] },
      9: { halign: 'center', cellWidth: 23 }
    },
    didParseCell: (data) => {
      // Color status cells in the body
      if (data.section === 'body' && data.column.index === 9) {
        const text = String(data.cell.raw || '');
        if (text.includes('CLOSED')) {
          data.cell.styles.textColor = [4, 120, 87]; // emerald
          data.cell.styles.fontStyle = 'bold';
        } else if (text.includes('OVERDUE')) {
          data.cell.styles.textColor = [225, 29, 72]; // rose
          data.cell.styles.fontStyle = 'bold';
        } else if (text.includes('PAID')) {
          data.cell.styles.textColor = [16, 185, 129];
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = [79, 70, 229];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    didDrawPage: () => {
      // Page numbering & footer disclaimer
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(
        'Confidential • Unnati Trust (R) Internal Accounting & Audit Records • Print Ready Statement',
        14,
        pageHeight - 6
      );
      doc.text(
        `Page ${(doc as any).internal.getNumberOfPages()}`,
        pageWidth - 14,
        pageHeight - 6,
        { align: 'right' }
      );
    }
  });

  const fileName = `Unnati_Loan_Portfolio_${filter.toUpperCase()}_${format(now, 'ddMMMyyyy_HHmm')}.pdf`;

  return {
    doc,
    fileName,
    meta: {
      totalCount: filteredLoans.length,
      activeCount,
      settledCount,
      totalSanctioned,
      totalRepaid,
      totalPendingPrincipal,
      totalInterestReceived,
      totalRemainingBalance,
      totalCurrentDue
    }
  };
}

/**
 * Triggers instant printing of the generated PDF document.
 * Creates an invisible iframe or popup window with autoPrint enabled for 1-click quick printing.
 */
export function quickPrintLoanPdf(doc: jsPDF): void {
  try {
    doc.autoPrint();
    const blobUrl = String(doc.output('bloburl'));

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.src = blobUrl;
    document.body.appendChild(iframe);

    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          window.open(blobUrl, '_blank');
        }
      }, 350);
    };
  } catch (err) {
    console.error('Failed to trigger quick print iframe:', err);
    try {
      const blobUrl = String(doc.output('bloburl'));
      window.open(blobUrl, '_blank');
    } catch (openErr) {
      console.error('Failed to open PDF window:', openErr);
    }
  }
}
