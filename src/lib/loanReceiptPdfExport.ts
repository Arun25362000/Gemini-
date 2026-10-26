import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { Loan, LoanPayment, UserProfile } from '../types';
import { getSafeMemberDisplayName } from './utils';
import { numberToIndianWords } from './contributionReceiptPdfExport';

export interface LoanReceiptPdfOptions {
  loan: Loan;
  payment: LoanPayment;
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
  periodText: string;
}

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Builds and returns the jsPDF document for a Loan Installment Repayment Receipt.
 */
export function generateLoanReceiptPdfDoc(options: LoanReceiptPdfOptions): LoanReceiptPdfResult {
  const {
    loan: l,
    payment: p,
    installmentNum = p?.installmentNum || 1,
    installmentMonth = p?.month || 1,
    installmentYear = p?.year || 2026,
    installmentDate = new Date(installmentYear, installmentMonth - 1, 10),
    principal = p?.amount || 0,
    interest = p?.interest || 0,
    total = (principal + interest),
    paidPaymentsInMonth = [],
    borrower,
    societyName = 'UNNATI TRUST (R)',
    societyRegNo = 'TRUST/BLR/2026',
    societyEmail = 'unnati.finance2026@gmail.com'
  } = options;

  // Resolve borrower identification
  const rawName = borrower?.displayName || l.userName || (p as any)?.userName || l.userEmail?.split('@')[0] || 'Borrower';
  const borrowerPhone = borrower?.phoneNumber || (borrower as any)?.phone || l.phoneNumber || '-';
  const borrowerEmail = borrower?.email || l.userEmail || p.userEmail || '-';
  const borrowerName = getSafeMemberDisplayName(borrower || rawName, borrowerPhone, borrowerEmail) || rawName || 'Borrower';

  // Format period & payment date
  const periodText = `${MONTH_NAMES[installmentMonth] || format(installmentDate, 'MMMM')} ${installmentYear}`;

  let paymentDateStr = 'Recent';
  let paymentDateObj: Date | null = null;
  if (p?.timestamp?.toDate) {
    paymentDateObj = p.timestamp.toDate();
  } else if (p?.approvedAt?.toDate) {
    paymentDateObj = p.approvedAt.toDate();
  } else if (p?.timestamp?.seconds) {
    paymentDateObj = new Date(p.timestamp.seconds * 1000);
  } else if (p?.timestamp instanceof Date) {
    paymentDateObj = p.timestamp;
  } else {
    paymentDateObj = installmentDate;
  }

  if (paymentDateObj && !isNaN(paymentDateObj.getTime())) {
    paymentDateStr = format(paymentDateObj, 'dd-MMM-yyyy hh:mm a');
  }

  // Unique receipt number
  const uniqueIdSuffix = (p?.id || l?.id || Math.random().toString(36).substring(2, 7)).slice(-6).toUpperCase();
  const receiptNumber = `UT-EMI-${installmentYear}-${String(installmentMonth).padStart(2, '0')}-${uniqueIdSuffix}`;

  // Initialize jsPDF A4 portrait
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const marginX = 14;
  const contentWidth = pageWidth - (marginX * 2);

  // Color Palette
  const brandDark = [24, 24, 27]; // #18181b
  const primaryIndigo = [79, 70, 229]; // #4f46e5
  const emeraldColor = [5, 150, 105]; // #059669
  const slate600 = [71, 85, 105];
  const slate200 = [226, 232, 240];

  // Outer Decorative Receipt Border
  doc.setDrawColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
  doc.setLineWidth(0.6);
  doc.roundedRect(marginX, 12, contentWidth, 268, 3, 3, 'S');

  // Inner Subtle Border
  doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
  doc.setLineWidth(0.2);
  doc.roundedRect(marginX + 1.5, 13.5, contentWidth - 3, 265, 2, 2, 'S');

  // ==================== 1. HEADER SECTION ====================
  doc.setFontSize(18);
  doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(societyName, pageWidth / 2, 24, { align: 'center' });

  doc.setFontSize(9);
  doc.setTextColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(`REGISTRATION NO: ${societyRegNo} • BANGALORE, KARNATAKA`, pageWidth / 2, 30, { align: 'center' });

  doc.setFontSize(8.5);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'normal');
  doc.text(`Email: ${societyEmail} • Official Finance & Loan Cell`, pageWidth / 2, 35, { align: 'center' });

  // Receipt Badge Banner
  doc.setFillColor(brandDark[0], brandDark[1], brandDark[2]);
  doc.roundedRect(pageWidth / 2 - 48, 39, 96, 8, 2, 2, 'F');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('LOAN INSTALLMENT REPAYMENT RECEIPT', pageWidth / 2, 44.5, { align: 'center' });

  // Status Stamp
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(emeraldColor[0], emeraldColor[1], emeraldColor[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(pageWidth - marginX - 44, 20, 40, 14, 2, 2, 'FD');
  doc.setFontSize(8);
  doc.setTextColor(emeraldColor[0], emeraldColor[1], emeraldColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('[ VERIFIED & PAID ]', pageWidth - marginX - 24, 26, { align: 'center' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('INSTALLMENT CLEARED', pageWidth - marginX - 24, 30.5, { align: 'center' });

  // Divider Line
  doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
  doc.setLineWidth(0.4);
  doc.line(marginX + 4, 51, pageWidth - marginX - 4, 51);

  // ==================== 2. RECEIPT & LOAN METADATA GRID ====================
  const metaY = 56;
  const col1X = marginX + 6;
  const col2X = marginX + (contentWidth / 2) + 4;

  doc.setFontSize(8);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('RECEIPT NUMBER:', col1X, metaY);
  doc.text('LOAN REFERENCE ID:', col2X, metaY);

  doc.setFontSize(9.5);
  doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
  doc.setFont('courier', 'bold');
  doc.text(receiptNumber, col1X, metaY + 4.5);
  const loanRef = l.id ? `UT-LN-${l.id.slice(-6).toUpperCase()}` : 'UT-LN-PRIMARY';
  doc.text(loanRef, col2X, metaY + 4.5);

  doc.setFontSize(8);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('INSTALLMENT SCHEDULE:', col1X, metaY + 12);
  doc.text('PAYMENT DATE & TIME:', col2X, metaY + 12);

  doc.setFontSize(9);
  doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(`Installment #${installmentNum} (${periodText})`, col1X, metaY + 16.5);
  doc.setFont('helvetica', 'normal');
  doc.text(paymentDateStr, col2X, metaY + 16.5);

  doc.setFontSize(8);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('PAYMENT METHOD / MODE:', col1X, metaY + 24);
  doc.text('APPROVED LOAN AMOUNT:', col2X, metaY + 24);

  const paymentMode = p?.paymentMode || p?.paymentMethod || 'Online (Bank/UPI)';
  doc.setFontSize(9);
  doc.setTextColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(paymentMode.toUpperCase(), col1X, metaY + 28.5);

  const loanPrincipalFormatted = `Rs. ${(l.approvedAmount || l.amount || 0).toLocaleString('en-IN')} (0.5% Monthly Interest)`;
  doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(loanPrincipalFormatted, col2X, metaY + 28.5);

  // Divider
  doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
  doc.setLineWidth(0.3);
  doc.line(marginX + 4, metaY + 33, pageWidth - marginX - 4, metaY + 33);

  // ==================== 3. BORROWER PARTICULARS BOX ====================
  const borrowerBoxY = metaY + 36;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX + 4, borrowerBoxY, contentWidth - 8, 23, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setTextColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('RECEIVED WITH THANKS FROM (BORROWER PARTICULARS)', marginX + 8, borrowerBoxY + 5.5);

  doc.setFontSize(11);
  doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(borrowerName, marginX + 8, borrowerBoxY + 12);

  doc.setFontSize(8.5);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'normal');
  const borrowerContact = [
    borrowerPhone && borrowerPhone !== '-' ? `Mobile: ${borrowerPhone}` : '',
    borrowerEmail && borrowerEmail !== '-' ? `Email: ${borrowerEmail}` : ''
  ].filter(Boolean).join('  |  ');
  doc.text(borrowerContact || 'Registered Society Member', marginX + 8, borrowerBoxY + 18);

  // ==================== 4. INSTALLMENT BREAKDOWN TABLE ====================
  const tableStartY = borrowerBoxY + 28;

  const tableBody: any[] = [];

  if (paidPaymentsInMonth && paidPaymentsInMonth.length > 1) {
    // Detailed list of payments for this month
    paidPaymentsInMonth.forEach((pm, idx) => {
      const pmPrincipal = pm.amount || 0;
      const pmInterest = pm.interest || 0;
      const pmTotal = pmPrincipal + pmInterest;
      const pmDate = pm.timestamp?.toDate ? format(pm.timestamp.toDate(), 'dd-MMM-yyyy') : (pm.approvedAt?.toDate ? format(pm.approvedAt.toDate(), 'dd-MMM-yyyy') : '-');
      const pmMode = pm.paymentMode || pm.paymentMethod || 'Online';

      tableBody.push([
        String(idx + 1),
        `Principal Installment Part #${idx + 1} (${periodText})\nDate: ${pmDate} • Mode: ${pmMode}`,
        `Rs. ${pmPrincipal.toLocaleString('en-IN')}`,
        `Rs. ${pmInterest.toLocaleString('en-IN')}`,
        `Rs. ${pmTotal.toLocaleString('en-IN')}`
      ]);
    });
  } else {
    // Standard Single Installment Repayment Row
    tableBody.push([
      '1',
      `Monthly Principal Repayment (Installment #${installmentNum} of Tenure)`,
      `Rs. ${principal.toLocaleString('en-IN')}`,
      '-',
      `Rs. ${principal.toLocaleString('en-IN')}`
    ]);
    tableBody.push([
      '2',
      `Monthly Loan Interest (0.5% Flat/Outstanding Charge for ${periodText})`,
      '-',
      `Rs. ${interest.toLocaleString('en-IN')}`,
      `Rs. ${interest.toLocaleString('en-IN')}`
    ]);
  }

  // Add Grand Total Row
  tableBody.push([
    '',
    'GRAND TOTAL INSTALLMENT REPAYMENT RECEIVED',
    `Rs. ${principal.toLocaleString('en-IN')}`,
    `Rs. ${interest.toLocaleString('en-IN')}`,
    `Rs. ${total.toLocaleString('en-IN')}`
  ]);

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: marginX + 4, right: marginX + 4 },
    head: [['#', 'REPAYMENT PARTICULARS & DESCRIPTION', 'PRINCIPAL', 'INTEREST (0.5%)', 'TOTAL AMOUNT']],
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [79, 70, 229],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
      cellPadding: 3.5
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 28, halign: 'right' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' }
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [24, 24, 27],
      cellPadding: 3.5
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    didParseCell: (data) => {
      // Highlight the grand total row
      if (data.row.index === tableBody.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [243, 244, 246];
        data.cell.styles.textColor = [79, 70, 229];
        if (data.column.index === 4) {
          data.cell.styles.textColor = [5, 150, 105];
          data.cell.styles.fontSize = 9.5;
        }
      }
    }
  });

  const finalY = (doc as any).lastAutoTable?.finalY || (tableStartY + 45);

  // ==================== 5. AMOUNT IN WORDS BOX ====================
  const wordsBoxY = finalY + 5;
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.setLineWidth(0.4);
  doc.roundedRect(marginX + 4, wordsBoxY, contentWidth - 8, 16, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setTextColor(5, 150, 105);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL AMOUNT RECEIVED (IN WORDS):', marginX + 8, wordsBoxY + 5);

  const amountInWords = numberToIndianWords(total);
  doc.setFontSize(9);
  doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(amountInWords, marginX + 8, wordsBoxY + 11.5);

  // ==================== 6. LOAN REPAYMENT SUMMARY STRIP ====================
  const stripY = wordsBoxY + 20;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX + 4, stripY, contentWidth - 8, 20, 2, 2, 'FD');

  const stripCol1 = marginX + 8;
  const stripCol2 = marginX + 65;
  const stripCol3 = marginX + 125;

  doc.setFontSize(7.5);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('APPROVED PRINCIPAL:', stripCol1, stripY + 6);
  doc.text('INSTALLMENT STATUS:', stripCol2, stripY + 6);
  doc.text('PAYMENT REFERENCE:', stripCol3, stripY + 6);

  doc.setFontSize(8.5);
  doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
  doc.text(`Rs. ${(l.approvedAmount || l.amount || 0).toLocaleString('en-IN')}`, stripCol1, stripY + 13);
  doc.setTextColor(emeraldColor[0], emeraldColor[1], emeraldColor[2]);
  doc.text(`Cleared (Inst. #${installmentNum})`, stripCol2, stripY + 13);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('courier', 'normal');
  doc.text(p?.id ? p.id.slice(-8).toUpperCase() : uniqueIdSuffix, stripCol3, stripY + 13);

  // ==================== 7. SIGNATURES & VERIFICATION NOTE ====================
  const sigY = stripY + 28;

  // Left side: Computer generated notice
  doc.setFontSize(7.5);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'normal');
  doc.text('Note: This is an authentic computer-generated payment receipt.', marginX + 6, sigY);
  doc.text('Issued by Unnati Trust (R) Accounts & Loan Management Division.', marginX + 6, sigY + 4.5);
  doc.text(`Verified against central database records. Ref: ${receiptNumber}`, marginX + 6, sigY + 9);

  // Right side: Official Authorized Stamp & Seal
  const sigRightX = pageWidth - marginX - 55;
  doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
  doc.setLineWidth(0.3);
  doc.line(sigRightX, sigY + 14, sigRightX + 48, sigY + 14);

  doc.setFontSize(8);
  doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('FOR UNNATI TRUST (R)', sigRightX + 24, sigY + 18, { align: 'center' });

  doc.setFontSize(7);
  doc.setTextColor(emeraldColor[0], emeraldColor[1], emeraldColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('[ Electronically Verified & Signed ]', sigRightX + 24, sigY + 22, { align: 'center' });

  // Bottom Footer
  doc.setFontSize(7);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Generated on ${format(new Date(), 'dd-MMM-yyyy hh:mm a')} • Unnati Trust Loan Management System`,
    pageWidth / 2,
    275,
    { align: 'center' }
  );

  const safeBorrowerFileStr = borrowerName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `LoanReceipt_${receiptNumber}_${safeBorrowerFileStr}.pdf`;

  return {
    doc,
    fileName,
    receiptNumber,
    totalAmount: total,
    periodText
  };
}

/**
 * Triggers a download of the Loan Installment PDF receipt
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
      console.warn('Mobile download failed, falling back to doc.save', e);
    }
  }
  result.doc.save(result.fileName);
  return result;
}

/**
 * Triggers instant printing of the generated loan receipt PDF document
 */
export function quickPrintLoanReceiptPdf(doc: jsPDF): void {
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

    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (printErr) {
        console.warn('Iframe print failed, falling back to window.open', printErr);
        window.open(blobUrl, '_blank');
      }
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(blobUrl);
        } catch {
          // ignore cleanup errors
        }
      }, 60000);
    };

    document.body.appendChild(iframe);
  } catch (err) {
    console.error('Error triggering loan receipt print:', err);
  }
}
