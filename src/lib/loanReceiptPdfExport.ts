import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { Loan, LoanPayment, UserProfile } from '../types';
import { getSafeMemberDisplayName } from './utils';
import { universalQuickPrintPdf } from './printService';
import { numberToIndianWords } from './contributionReceiptPdfExport';

export interface LoanReceiptPdfOptions {
  payment: LoanPayment;
  loan: Loan;
  installmentNum?: number;
  installmentMonth?: number;
  installmentYear?: number;
  installmentDate?: Date;
  principal?: number;
  interest?: number;
  total?: number;
  paidPaymentsInMonth?: LoanPayment[];
  borrower?: UserProfile | null;
  societyName?: string;
  societyRegNo?: string;
  societyEmail?: string;
}

export interface LoanReceiptPdfResult {
  doc: jsPDF;
  fileName: string;
  receiptNumber: string;
  totalAmount: number;
}

export interface CumulativeLoanReceiptPdfOptions {
  loan: Loan;
  paidPayments: LoanPayment[];
  totalTenure?: number;
  borrower?: UserProfile | null;
  societyName?: string;
  societyRegNo?: string;
  societyEmail?: string;
}

export interface CumulativeLoanReceiptPdfResult {
  doc: jsPDF;
  fileName: string;
  receiptNumber: string;
  totalPaidAmount: number;
}

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Builds the official A4 PDF receipt for a single loan installment repayment.
 */
export function generateLoanReceiptPdfDoc(options: LoanReceiptPdfOptions): LoanReceiptPdfResult {
  const {
    payment: p,
    loan: l,
    installmentNum = 1,
    installmentMonth = p.month,
    installmentYear = p.year,
    installmentDate,
    principal = p.amount,
    interest = p.interest || 0,
    total = (p.amount + (p.interest || 0)),
    borrower,
    societyName = 'UNNATI TRUST (R)',
    societyRegNo = 'TRUST/BLR/2026',
    societyEmail = 'unnati.finance2026@gmail.com'
  } = options;

  const rawName = borrower?.displayName || (l as any).userName || l.userEmail?.split('@')[0] || 'Member';
  const memberPhone = borrower?.phoneNumber || (borrower as any)?.phone || '-';
  const memberEmail = borrower?.email || l.userEmail || '-';
  const memberName = getSafeMemberDisplayName(borrower || rawName, memberPhone, memberEmail) || rawName || 'Member';

  let paymentDateStr = 'Recent';
  let paymentDateObj: Date | null = installmentDate || null;
  if (!paymentDateObj) {
    if (p.timestamp?.toDate) {
      paymentDateObj = p.timestamp.toDate();
    } else if (p.timestamp?.seconds) {
      paymentDateObj = new Date(p.timestamp.seconds * 1000);
    } else if (p.timestamp instanceof Date) {
      paymentDateObj = p.timestamp;
    } else {
      paymentDateObj = new Date(installmentYear, installmentMonth - 1, 10);
    }
  }

  if (paymentDateObj && !isNaN(paymentDateObj.getTime())) {
    paymentDateStr = format(paymentDateObj, 'dd-MMM-yyyy hh:mm a');
  }

  const uniqueIdSuffix = (p.id || l.id || Math.random().toString(36).substring(2, 7)).slice(-6).toUpperCase();
  const receiptNumber = `UT-EMI-${installmentYear}-${String(installmentMonth).padStart(2, '0')}-${uniqueIdSuffix}`;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const contentWidth = pageWidth - (marginX * 2);

  const brandDark = [24, 24, 27];
  const primaryIndigo = [79, 70, 229];
  const slate600 = [71, 85, 105];
  const emeraldColor = [5, 150, 105];
  const slate200 = [226, 232, 240];

  // Outer Border
  doc.setDrawColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
  doc.setLineWidth(0.6);
  doc.roundedRect(marginX, 12, contentWidth, 268, 3, 3, 'S');

  // Inner Border
  doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
  doc.setLineWidth(0.2);
  doc.roundedRect(marginX + 1.5, 13.5, contentWidth - 3, 265, 2, 2, 'S');

  // Header
  doc.setFontSize(18);
  doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(societyName, pageWidth / 2, 24, { align: 'center' });

  doc.setFontSize(9);
  doc.setTextColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Registered Public Charitable Trust  •  Reg No: ${societyRegNo}`,
    pageWidth / 2,
    29.5,
    { align: 'center' }
  );

  doc.setFontSize(7.5);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Official Contact: ${societyEmail}   •   Loan Repayment Management System`,
    pageWidth / 2,
    34,
    { align: 'center' }
  );

  // Badge Banner
  doc.setFillColor(245, 247, 255);
  doc.setDrawColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(marginX + 8, 38, contentWidth - 16, 12, 2, 2, 'FD');

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
  doc.text('OFFICIAL LOAN INSTALLMENT REPAYMENT RECEIPT', pageWidth / 2, 45.5, { align: 'center' });

  // Receipt Number & Date
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
  doc.text(`Receipt No: ${receiptNumber}`, marginX + 10, 57);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.text(`Date & Time: ${paymentDateStr}`, pageWidth - marginX - 10, 57, { align: 'right' });

  // Member Particulars & Loan Details Info Box
  autoTable(doc, {
    startY: 62,
    margin: { left: marginX + 6, right: marginX + 6 },
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 3, textColor: [30, 41, 59] },
    headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold' },
    body: [
      [
        { content: 'Borrower Name:', styles: { fontStyle: 'bold', cellWidth: 35 } },
        { content: memberName },
        { content: 'Loan Account #:', styles: { fontStyle: 'bold', cellWidth: 35 } },
        { content: `LN-${(l.id || 'N/A').slice(-6).toUpperCase()}` }
      ],
      [
        { content: 'Contact Number:', styles: { fontStyle: 'bold' } },
        { content: memberPhone },
        { content: 'Sanctioned Amount:', styles: { fontStyle: 'bold' } },
        { content: `Rs. ${(l.approvedAmount || l.amount || 0).toLocaleString('en-IN')}` }
      ],
      [
        { content: 'Email Address:', styles: { fontStyle: 'bold' } },
        { content: memberEmail },
        { content: 'Installment Period:', styles: { fontStyle: 'bold' } },
        { content: `Inst. #${installmentNum} (${MONTH_NAMES[installmentMonth]} ${installmentYear})` }
      ],
      [
        { content: 'Repayment Mode:', styles: { fontStyle: 'bold' } },
        { content: (p.paymentMode || (p as any).mode || 'Online / UPI').toUpperCase() },
        { content: 'Payment Status:', styles: { fontStyle: 'bold' } },
        { content: 'SUCCESSFULLY RECEIVED & RECORDED', styles: { textColor: emeraldColor as any, fontStyle: 'bold' } }
      ]
    ]
  });

  const finalY1 = (doc as any).lastAutoTable?.finalY || 105;

  // Breakdown Item Table
  autoTable(doc, {
    startY: finalY1 + 6,
    margin: { left: marginX + 6, right: marginX + 6 },
    theme: 'striped',
    head: [['Sl No.', 'Description', 'Installment Schedule', 'Principal Amount', 'Interest (0.5%)', 'Net Amount (Rs.)']],
    body: [
      [
        '1',
        'Monthly Loan Principal & Interest Repayment',
        `Installment #${installmentNum} / ${l.installments || 10}`,
        `Rs. ${principal.toLocaleString('en-IN')}`,
        `Rs. ${interest.toLocaleString('en-IN')}`,
        `Rs. ${total.toLocaleString('en-IN')}`
      ]
    ],
    headStyles: {
      fillColor: primaryIndigo as any,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 4,
      halign: 'center'
    },
    columnStyles: {
      0: { cellWidth: 15, halign: 'center' },
      1: { cellWidth: 60, halign: 'left' },
      2: { cellWidth: 35, halign: 'center' },
      3: { cellWidth: 25, halign: 'right' },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 25, halign: 'right', fontStyle: 'bold' }
    }
  });

  const finalY2 = (doc as any).lastAutoTable?.finalY || 140;

  // Total Summary Box
  const summaryBoxY = finalY2 + 6;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
  doc.roundedRect(marginX + 6, summaryBoxY, contentWidth - 12, 28, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
  doc.text('Amount in Words:', marginX + 10, summaryBoxY + 8);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
  doc.text(numberToIndianWords(total), marginX + 10, summaryBoxY + 15);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(emeraldColor[0], emeraldColor[1], emeraldColor[2]);
  doc.text(`Total Received: Rs. ${total.toLocaleString('en-IN')}/-`, pageWidth - marginX - 10, summaryBoxY + 15, { align: 'right' });

  // Verification Note
  const noteY = summaryBoxY + 36;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.text('Terms & Conditions:', marginX + 10, noteY);
  doc.text('1. This receipt is computer generated and serves as an official confirmation of loan repayment.', marginX + 10, noteY + 5);
  doc.text('2. Principal repayments directly reduce your outstanding loan liability as per society bylaws.', marginX + 10, noteY + 9);
  doc.text('3. For any reconciliation or queries, quote the Loan Account Number and Receipt Number above.', marginX + 10, noteY + 13);

  // Signature Block
  const sigY = noteY + 32;
  doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
  doc.setLineWidth(0.3);
  doc.line(pageWidth - marginX - 55, sigY + 10, pageWidth - marginX - 10, sigY + 10);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
  doc.text('Authorized Signatory', pageWidth - marginX - 32.5, sigY + 15, { align: 'center' });
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.text(societyName, pageWidth - marginX - 32.5, sigY + 19, { align: 'center' });

  const safeMemberFileStr = memberName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `Loan_Receipt_${receiptNumber}_${safeMemberFileStr}.pdf`;

  return {
    doc,
    fileName,
    receiptNumber,
    totalAmount: total
  };
}

/**
 * Builds the consolidated A4 PDF receipt for all installment payments made so far towards a loan.
 */
export function generateCumulativeLoanReceiptPdfDoc(options: CumulativeLoanReceiptPdfOptions): CumulativeLoanReceiptPdfResult {
  const {
    loan: l,
    paidPayments,
    totalTenure = l.installments || 10,
    borrower,
    societyName = 'UNNATI TRUST (R)',
    societyRegNo = 'TRUST/BLR/2026',
    societyEmail = 'unnati.finance2026@gmail.com'
  } = options;

  const rawName = borrower?.displayName || (l as any).userName || l.userEmail?.split('@')[0] || 'Member';
  const memberPhone = borrower?.phoneNumber || (borrower as any)?.phone || '-';
  const memberEmail = borrower?.email || l.userEmail || '-';
  const memberName = getSafeMemberDisplayName(borrower || rawName, memberPhone, memberEmail) || rawName || 'Member';

  const sortedPayments = [...paidPayments].sort((a, b) => {
    const timeA = a.timestamp?.seconds ? a.timestamp.seconds : (a.year * 100 + a.month);
    const timeB = b.timestamp?.seconds ? b.timestamp.seconds : (b.year * 100 + b.month);
    return timeA - timeB;
  });

  const totalPrincipalRepaid = sortedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalInterestRepaid = sortedPayments.reduce((sum, p) => sum + (p.interest || 0), 0);
  const grandTotalRepaid = totalPrincipalRepaid + totalInterestRepaid;
  const sanctionedAmount = l.approvedAmount || l.amount || 0;
  const outstandingPrincipal = Math.max(0, sanctionedAmount - totalPrincipalRepaid);

  const uniqueIdSuffix = (l.id || Math.random().toString(36).substring(2, 7)).slice(-6).toUpperCase();
  const receiptNumber = `UT-LOAN-CUM-${uniqueIdSuffix}`;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const contentWidth = pageWidth - (marginX * 2);

  const brandDark = [24, 24, 27];
  const primaryIndigo = [79, 70, 229];
  const slate600 = [71, 85, 105];
  const emeraldColor = [5, 150, 105];
  const slate200 = [226, 232, 240];

  // Outer Border
  doc.setDrawColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
  doc.setLineWidth(0.6);
  doc.roundedRect(marginX, 12, contentWidth, 268, 3, 3, 'S');

  // Inner Border
  doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
  doc.setLineWidth(0.2);
  doc.roundedRect(marginX + 1.5, 13.5, contentWidth - 3, 265, 2, 2, 'S');

  // Header
  doc.setFontSize(18);
  doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(societyName, pageWidth / 2, 24, { align: 'center' });

  doc.setFontSize(9);
  doc.setTextColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Registered Public Charitable Trust  •  Reg No: ${societyRegNo}`,
    pageWidth / 2,
    29.5,
    { align: 'center' }
  );

  doc.setFontSize(7.5);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Official Contact: ${societyEmail}   •   Consolidated Loan Repayment Statement`,
    pageWidth / 2,
    34,
    { align: 'center' }
  );

  // Badge Banner
  doc.setFillColor(245, 247, 255);
  doc.setDrawColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(marginX + 8, 38, contentWidth - 16, 12, 2, 2, 'FD');

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
  doc.text('CONSOLIDATED LOAN REPAYMENT STATEMENT & RECEIPT', pageWidth / 2, 45.5, { align: 'center' });

  // Receipt Number & Date
  const genDateStr = format(new Date(), 'dd-MMM-yyyy hh:mm a');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
  doc.text(`Statement Ref: ${receiptNumber}`, marginX + 10, 57);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.text(`Generated: ${genDateStr}`, pageWidth - marginX - 10, 57, { align: 'right' });

  // Borrower & Loan Particulars
  autoTable(doc, {
    startY: 62,
    margin: { left: marginX + 6, right: marginX + 6 },
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 3, textColor: [30, 41, 59] },
    headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold' },
    body: [
      [
        { content: 'Borrower Name:', styles: { fontStyle: 'bold', cellWidth: 35 } },
        { content: memberName },
        { content: 'Loan Account #:', styles: { fontStyle: 'bold', cellWidth: 35 } },
        { content: `LN-${(l.id || 'N/A').slice(-6).toUpperCase()}` }
      ],
      [
        { content: 'Contact Number:', styles: { fontStyle: 'bold' } },
        { content: memberPhone },
        { content: 'Sanctioned Principal:', styles: { fontStyle: 'bold' } },
        { content: `Rs. ${sanctionedAmount.toLocaleString('en-IN')}` }
      ],
      [
        { content: 'Installments Paid:', styles: { fontStyle: 'bold' } },
        { content: `${sortedPayments.length} of ${totalTenure} Paid` },
        { content: 'Outstanding Principal:', styles: { fontStyle: 'bold' } },
        { content: `Rs. ${outstandingPrincipal.toLocaleString('en-IN')}`, styles: { fontStyle: 'bold', textColor: outstandingPrincipal === 0 ? emeraldColor as any : [220, 38, 38] as any } }
      ]
    ]
  });

  const finalY1 = (doc as any).lastAutoTable?.finalY || 88;

  // Payments List Table
  const tableRows = sortedPayments.map((p, idx) => {
    let pDate = '-';
    if (p.timestamp?.toDate) {
      pDate = format(p.timestamp.toDate(), 'dd-MMM-yyyy');
    } else if (p.timestamp?.seconds) {
      pDate = format(new Date(p.timestamp.seconds * 1000), 'dd-MMM-yyyy');
    } else if (p.timestamp instanceof Date) {
      pDate = format(p.timestamp, 'dd-MMM-yyyy');
    }

    const principalAmt = p.amount || 0;
    const interestAmt = p.interest || 0;
    const totalAmt = principalAmt + interestAmt;
    const mode = (p.paymentMode || (p as any).mode || 'UPI').toUpperCase();

    return [
      String(idx + 1),
      `${MONTH_NAMES[p.month]} ${p.year}`,
      pDate,
      mode,
      `Rs. ${principalAmt.toLocaleString('en-IN')}`,
      `Rs. ${interestAmt.toLocaleString('en-IN')}`,
      `Rs. ${totalAmt.toLocaleString('en-IN')}`
    ];
  });

  autoTable(doc, {
    startY: finalY1 + 5,
    margin: { left: marginX + 6, right: marginX + 6 },
    theme: 'striped',
    head: [['#', 'Month & Year', 'Payment Date', 'Mode', 'Principal (Rs.)', 'Interest (Rs.)', 'Total (Rs.)']],
    body: tableRows.length > 0 ? tableRows : [['-', 'No repayments recorded yet', '-', '-', '0', '0', '0']],
    headStyles: {
      fillColor: primaryIndigo as any,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 3,
      halign: 'center'
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 35, halign: 'left' },
      2: { cellWidth: 28, halign: 'center' },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
      6: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
    }
  });

  const finalY2 = (doc as any).lastAutoTable?.finalY || 160;

  // Cumulative Summary Box
  const summaryBoxY = finalY2 + 5;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
  doc.roundedRect(marginX + 6, summaryBoxY, contentWidth - 12, 28, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
  doc.text(`Total Paid Towards Loan (In Words):`, marginX + 10, summaryBoxY + 7);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
  doc.text(numberToIndianWords(grandTotalRepaid), marginX + 10, summaryBoxY + 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(emeraldColor[0], emeraldColor[1], emeraldColor[2]);
  doc.text(
    `Principal: Rs. ${totalPrincipalRepaid.toLocaleString('en-IN')}  |  Interest: Rs. ${totalInterestRepaid.toLocaleString('en-IN')}  |  Total: Rs. ${grandTotalRepaid.toLocaleString('en-IN')}`,
    pageWidth - marginX - 10,
    summaryBoxY + 22,
    { align: 'right' }
  );

  // Signature Block
  const sigY = summaryBoxY + 36;
  doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
  doc.setLineWidth(0.3);
  doc.line(pageWidth - marginX - 55, sigY + 10, pageWidth - marginX - 10, sigY + 10);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
  doc.text('Authorized Signatory', pageWidth - marginX - 32.5, sigY + 15, { align: 'center' });
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.text(societyName, pageWidth - marginX - 32.5, sigY + 19, { align: 'center' });

  const safeMemberFileStr = memberName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `All_Payments_Receipt_${receiptNumber}_${safeMemberFileStr}.pdf`;

  return {
    doc,
    fileName,
    receiptNumber,
    totalPaidAmount: grandTotalRepaid
  };
}

/**
 * Direct download helper for single installment loan receipt
 */
export function downloadLoanReceiptPdf(
  options: LoanReceiptPdfOptions,
  isMobile?: boolean,
  downloadFileMobileFn?: (fileName: string, base64Data: string) => Promise<{ success: boolean; uri?: string }>
): LoanReceiptPdfResult {
  const result = generateLoanReceiptPdfDoc(options);
  if (isMobile && downloadFileMobileFn) {
    try {
      const dataUri = result.doc.output('datauristring');
      const base64Data = dataUri.split(',')[1] || dataUri;
      downloadFileMobileFn(result.fileName, base64Data);
      return result;
    } catch (e) {
      console.warn('Mobile download fallback:', e);
    }
  }
  result.doc.save(result.fileName);
  return result;
}

/**
 * Direct download helper for cumulative loan receipt
 */
export function downloadCumulativeLoanReceiptPdf(
  options: CumulativeLoanReceiptPdfOptions,
  isMobile?: boolean,
  downloadFileMobileFn?: (fileName: string, base64Data: string) => Promise<{ success: boolean; uri?: string }>
): CumulativeLoanReceiptPdfResult {
  const result = generateCumulativeLoanReceiptPdfDoc(options);
  if (isMobile && downloadFileMobileFn) {
    try {
      const dataUri = result.doc.output('datauristring');
      const base64Data = dataUri.split(',')[1] || dataUri;
      downloadFileMobileFn(result.fileName, base64Data);
      return result;
    } catch (e) {
      console.warn('Mobile cumulative download fallback:', e);
    }
  }
  result.doc.save(result.fileName);
  return result;
}

/**
 * Universal print helper for loan receipt
 */
export function quickPrintLoanReceiptPdf(doc: jsPDF, fileName: string = 'Loan_Receipt.pdf', documentTitle?: string): void {
  universalQuickPrintPdf(doc, fileName, documentTitle || 'Loan Receipt');
}
