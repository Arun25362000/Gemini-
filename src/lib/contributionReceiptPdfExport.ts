import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { Contribution, UserProfile } from '../types';
import { getSafeMemberDisplayName, normalizePhoneNumber } from './utils';

export interface PaymentReceiptPdfOptions {
  contribution: Contribution;
  member?: UserProfile | null;
  allContributions?: Contribution[];
  societyName?: string;
  societyRegNo?: string;
  societyEmail?: string;
}

export interface PaymentReceiptPdfResult {
  doc: jsPDF;
  fileName: string;
  receiptNumber: string;
  totalAmount: number;
  periodText: string;
  isAdvance: boolean;
  coveredMonthsList: Array<{ month: number; year: number; amount: number }>;
}

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Converts a positive number to Indian Rupees words (e.g. 5000 -> "Rupees Five Thousand Only")
 */
export function numberToIndianWords(amount: number): string {
  if (!amount || isNaN(amount) || amount <= 0) return 'Rupees Zero Only';

  const singleDigits = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n: number): string {
    if (n < 20) return singleDigits[n];
    const unit = n % 10;
    return `${tens[Math.floor(n / 10)]}${unit ? ` ${singleDigits[unit]}` : ''}`;
  }

  function convertThreeDigits(n: number): string {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    let res = '';
    if (hundred > 0) {
      res += `${singleDigits[hundred]} Hundred`;
      if (rest > 0) res += ' and ';
    }
    if (rest > 0) {
      res += convertTwoDigits(rest);
    }
    return res;
  }

  const integerPart = Math.floor(amount);
  const crore = Math.floor(integerPart / 10000000);
  const lakh = Math.floor((integerPart % 10000000) / 100000);
  const thousand = Math.floor((integerPart % 100000) / 1000);
  const remaining = integerPart % 1000;

  const parts: string[] = [];

  if (crore > 0) {
    parts.push(`${convertTwoDigits(crore)} Crore`);
  }
  if (lakh > 0) {
    parts.push(`${convertTwoDigits(lakh)} Lakh`);
  }
  if (thousand > 0) {
    parts.push(`${convertTwoDigits(thousand)} Thousand`);
  }
  if (remaining > 0) {
    parts.push(convertThreeDigits(remaining));
  }

  const words = parts.join(' ').trim();
  return words ? `Rupees ${words} Only` : 'Rupees Zero Only';
}

/**
 * Builds and returns the jsPDF document for a payment receipt (single-month or multi-month advance).
 */
export function generatePaymentReceiptPdfDoc(options: PaymentReceiptPdfOptions): PaymentReceiptPdfResult {
  const {
    contribution: c,
    member,
    allContributions = [],
    societyName = 'UNNATI TRUST (R)',
    societyRegNo = 'TRUST/BLR/2026',
    societyEmail = 'unnati.finance2026@gmail.com'
  } = options;

  // Resolve member identification
  const rawName = member?.displayName || (c as any).userName || c.userEmail?.split('@')[0] || 'Member';
  const memberPhone = member?.phoneNumber || (member as any)?.phone || '-';
  const memberEmail = member?.email || c.userEmail || '-';
  const memberName = getSafeMemberDisplayName(member || rawName, memberPhone, memberEmail) || rawName || 'Member';

  // Determine if this is a multi-month advance payment
  let isAdvance = Boolean(c.isAdvance || (c.coveredMonths && c.coveredMonths.length > 1));
  let coveredMonthsList: Array<{ month: number; year: number; amount: number }> = [];

  if (c.coveredMonths && c.coveredMonths.length > 0) {
    isAdvance = true;
    coveredMonthsList = [...c.coveredMonths];
  } else if (c.transactionGroupId && allContributions.length > 0) {
    const groupItems = allContributions.filter(item => item.transactionGroupId === c.transactionGroupId);
    if (groupItems.length > 1) {
      isAdvance = true;
      coveredMonthsList = groupItems
        .sort((a, b) => (a.year * 100 + a.month) - (b.year * 100 + b.month))
        .map(item => ({ month: item.month, year: item.year, amount: item.amount }));
    }
  }

  if (coveredMonthsList.length === 0) {
    coveredMonthsList = [{ month: c.month, year: c.year, amount: c.amount }];
  }

  const totalAmount = coveredMonthsList.reduce((sum, item) => sum + (item.amount || 0), 0);

  // Period label
  let periodText = '';
  if (isAdvance && coveredMonthsList.length > 1) {
    const first = coveredMonthsList[0];
    const last = coveredMonthsList[coveredMonthsList.length - 1];
    periodText = `${MONTH_NAMES[first.month]} ${first.year} — ${MONTH_NAMES[last.month]} ${last.year} (${coveredMonthsList.length} Months)`;
  } else {
    periodText = `${MONTH_NAMES[c.month]} ${c.year}`;
  }

  // Format payment date
  let paymentDateStr = 'Recent';
  let paymentDateObj: Date | null = null;
  if (c.timestamp?.toDate) {
    paymentDateObj = c.timestamp.toDate();
  } else if (c.timestamp?.seconds) {
    paymentDateObj = new Date(c.timestamp.seconds * 1000);
  } else if (c.timestamp instanceof Date) {
    paymentDateObj = c.timestamp;
  } else {
    paymentDateObj = new Date(c.year, c.month - 1, 10);
  }

  if (paymentDateObj && !isNaN(paymentDateObj.getTime())) {
    paymentDateStr = format(paymentDateObj, 'dd-MMM-yyyy hh:mm a');
  }

  // Unique receipt number
  const uniqueIdSuffix = (c.id || Math.random().toString(36).substring(2, 7)).slice(-6).toUpperCase();
  const receiptNumber = isAdvance
    ? `UT-ADV-${c.year}-${String(c.month).padStart(2, '0')}-${uniqueIdSuffix}`
    : `UT-REC-${c.year}-${String(c.month).padStart(2, '0')}-${uniqueIdSuffix}`;

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
  const slate600 = [71, 85, 105];
  const emeraldColor = [5, 150, 105]; // #059669
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
    `Official Contact: ${societyEmail}   •   Contribution Acknowledgement System`,
    pageWidth / 2,
    34,
    { align: 'center' }
  );

  // Receipt Badge Banner
  doc.setFillColor(245, 247, 255); // very soft indigo
  doc.setDrawColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(marginX + 8, 38, contentWidth - 16, 12, 2, 2, 'FD');

  doc.setFontSize(11);
  doc.setTextColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(
    isAdvance ? 'PAYMENT RECEIPT (ADVANCE CONTRIBUTION)' : 'PAYMENT RECEIPT (MONTHLY CONTRIBUTION)',
    pageWidth / 2,
    45.5,
    { align: 'center' }
  );

  // Receipt Number & Date
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
  doc.text(`Receipt No: ${receiptNumber}`, marginX + 10, 57);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.text(`Date & Time: ${paymentDateStr}`, pageWidth - marginX - 10, 57, { align: 'right' });

  // Member Particulars & Contribution Details Info Box (matching Loan Receipt Excel cells format)
  autoTable(doc, {
    startY: 62,
    margin: { left: marginX + 6, right: marginX + 6 },
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 3, textColor: [30, 41, 59] },
    headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold' },
    body: [
      [
        { content: 'Member Name:', styles: { fontStyle: 'bold', cellWidth: 35 } },
        { content: memberName },
        { content: 'Reference ID:', styles: { fontStyle: 'bold', cellWidth: 35 } },
        { content: c.id ? c.id.slice(0, 16) : 'N/A' }
      ],
      [
        { content: 'Contact Number:', styles: { fontStyle: 'bold' } },
        { content: memberPhone },
        { content: 'Payment Type:', styles: { fontStyle: 'bold' } },
        { content: isAdvance ? 'Multi-Month Advance' : 'Regular Contribution' }
      ],
      [
        { content: 'Email Address:', styles: { fontStyle: 'bold' } },
        { content: memberEmail },
        { content: 'Subscription Period:', styles: { fontStyle: 'bold' } },
        { content: periodText }
      ],
      [
        { content: 'Payment Mode:', styles: { fontStyle: 'bold' } },
        { content: (c.paymentMethod || 'Online').toUpperCase() },
        { content: 'Payment Status:', styles: { fontStyle: 'bold' } },
        { content: 'SUCCESSFULLY RECEIVED & RECORDED', styles: { textColor: emeraldColor as any, fontStyle: 'bold' } }
      ]
    ]
  });

  const finalY1 = (doc as any).lastAutoTable?.finalY || 105;

  // ==================== 4. CONTRIBUTION PARTICULARS TABLE ====================
  const tableStartY = finalY1 + 6;

  const tableRows = coveredMonthsList.map((item, index) => {
    const monthName = MONTH_NAMES[item.month] || `Month ${item.month}`;
    const periodLabel = `${monthName} ${item.year}`;
    const desc = isAdvance 
      ? `Advance Group Contribution (${periodLabel})`
      : `Monthly member Contribution (${periodLabel})`;

    return [
      String(index + 1),
      desc,
      periodLabel,
      (c.paymentMethod || 'Online').toUpperCase(),
      `Rs. ${(item.amount || 0).toLocaleString('en-IN')}`
    ];
  });

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: marginX + 6, right: marginX + 6 },
    head: [['#', 'Particulars / Description', 'Period', 'Payment Mode', 'Amount']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [79, 70, 229], // Primary indigo
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left',
      cellPadding: 3
    },
    bodyStyles: {
      textColor: [30, 41, 59],
      fontSize: 8.5,
      cellPadding: 3
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 68 },
      2: { cellWidth: 36, halign: 'center' },
      3: { cellWidth: 26, halign: 'center' },
      4: { cellWidth: 28, halign: 'right', fontStyle: 'bold' }
    }
  });

  const finalTableY = (doc as any).lastAutoTable?.finalY || tableStartY + 25;

  // ==================== 5. TOTALS & WORDS BOX ====================
  const totalsBoxY = finalTableY + 6;
  doc.setFillColor(245, 247, 255);
  doc.setDrawColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(marginX + 6, totalsBoxY, contentWidth - 12, 22, 1.5, 1.5, 'FD');

  // Amount in Figures
  doc.setFontSize(9);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL AMOUNT RECEIVED:', marginX + 8, totalsBoxY + 7);

  doc.setFontSize(14);
  doc.setTextColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(`Rs. ${totalAmount.toLocaleString('en-IN')}`, marginX + contentWidth - 10, totalsBoxY + 7.5, { align: 'right' });

  // Amount in Words
  doc.setFontSize(8.5);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('AMOUNT IN WORDS:', marginX + 8, totalsBoxY + 14);

  doc.setFontSize(9);
  doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(numberToIndianWords(totalAmount), marginX + 44, totalsBoxY + 14);

  doc.setFontSize(7.5);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Months Covered: ${coveredMonthsList.length} month(s)  •  Payment Status: Formally Approved and Verified`, marginX + 8, totalsBoxY + 19);

  // ==================== 6. PAYMENT NOTES & AUDIT FOOTER ====================
  const notesY = totalsBoxY + 27;

  doc.setFontSize(8);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('RECEIPT TERMS & ACKNOWLEDGEMENT:', marginX + 6, notesY);

  doc.setFontSize(7.5);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'normal');
  doc.text('1. This official payment receipt is issued by Unnati Trust (R) towards member subscription contributions.', marginX + 6, notesY + 4.5);
  doc.text('2. All contributions are credited to the corpus / lending pool of the trust for welfare and member financing.', marginX + 6, notesY + 8.5);
  doc.text('3. In case of any discrepancies or questions regarding this receipt, please contact trust management.', marginX + 6, notesY + 12.5);

  // Stamp / Authorized Signatory Box
  const signY = notesY + 18;
  const signBoxW = 60;
  const signBoxX = marginX + contentWidth - signBoxW - 6;

  doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(signBoxX, signY, signBoxW, 25, 1.5, 1.5, 'S');

  // Electronically Verified Stamp Badge inside Sign box
  doc.setDrawColor(emeraldColor[0], emeraldColor[1], emeraldColor[2]);
  doc.setFillColor(236, 253, 245);
  doc.setLineWidth(0.4);
  doc.roundedRect(signBoxX + 4, signY + 3, signBoxW - 8, 8, 1, 1, 'FD');

  doc.setFontSize(7.5);
  doc.setTextColor(emeraldColor[0], emeraldColor[1], emeraldColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('ELECTRONICALLY VERIFIED', signBoxX + (signBoxW / 2), signY + 8, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('For UNNATI TRUST (R)', signBoxX + (signBoxW / 2), signY + 16, { align: 'center' });

  doc.setFontSize(6.5);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'normal');
  doc.text('Authorized Signatory / System Audit', signBoxX + (signBoxW / 2), signY + 20, { align: 'center' });

  // Bottom Notice
  doc.setFontSize(7.5);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'italic');
  doc.text(
    'This is a computer-generated official receipt and requires no physical signature.',
    pageWidth / 2,
    273,
    { align: 'center' }
  );

  const safeMemberFileStr = memberName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `Receipt_${receiptNumber}_${safeMemberFileStr}.pdf`;

  return {
    doc,
    fileName,
    receiptNumber,
    totalAmount,
    periodText,
    isAdvance,
    coveredMonthsList
  };
}

/**
 * Triggers a download of the PDF receipt (with support for mobile app Capacitor download)
 */
export function downloadPaymentReceiptPdf(
  options: PaymentReceiptPdfOptions,
  isMobile?: boolean,
  downloadFileMobileFn?: (fileName: string, base64Data: string) => Promise<{ success: boolean; uri?: string }>
): PaymentReceiptPdfResult {
  const result = generatePaymentReceiptPdfDoc(options);
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

import { universalQuickPrintPdf } from './printService';

/**
 * Triggers instant printing of the generated payment receipt PDF document across all devices (Android APK, mobile, tablet, desktop).
 */
export function quickPrintPaymentReceiptPdf(doc: jsPDF, fileName: string = 'Payment_Receipt.pdf', documentTitle?: string): void {
  universalQuickPrintPdf(doc, fileName, documentTitle || 'Payment Receipt');
}
