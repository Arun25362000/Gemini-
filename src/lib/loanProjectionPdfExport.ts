import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

export interface LoanProjectionScheduleItem {
  month: number;
  openingBalance: number;
  principalPayment: number;
  interestPayment: number;
  totalPayment: number;
  closingBalance: number;
}

export interface LoanProjectionData {
  principal: number;
  tenure: number;
  monthlyPrincipal: number;
  totalInterest: number;
  totalRepayable: number;
  firstMonthPayment: number;
  lastMonthPayment: number;
  schedule: LoanProjectionScheduleItem[];
}

export interface LoanProjectionPdfOptions {
  projection: LoanProjectionData;
  title?: string;
}

export interface LoanProjectionPdfResult {
  doc: jsPDF;
  fileName: string;
}

/**
 * Builds a clean, professional, A4 print-ready PDF containing the Loan Projection
 * & EMI Repayment Schedule for a selected loan amount.
 * 
 * NOTE: Intentionally contains NO member names as requested by the trust administration,
 * so it can be shared universally with any member inquiring about loan projections.
 */
export function generateLoanProjectionPdfDoc(options: LoanProjectionPdfOptions): LoanProjectionPdfResult {
  const { projection, title = 'Loan EMI Projection & Repayment Schedule' } = options;
  const now = new Date();
  const exportDateStr = format(now, 'dd-MMM-yyyy hh:mm a');

  // Initialize jsPDF in A4 Portrait (Print-Ready)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 10;

  // Primary Theme Colors
  const darkIndigo = [30, 27, 75]; // #1e1b4b
  const indigoPrimary = [79, 70, 229]; // #4f46e5
  const slate600 = [71, 85, 105];

  // ==================== DOCUMENT HEADER ====================
  doc.setFontSize(17);
  doc.setTextColor(darkIndigo[0], darkIndigo[1], darkIndigo[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('UNNATI TRUST (R)', pageWidth / 2, 13, { align: 'center' });

  doc.setFontSize(11.5);
  doc.setTextColor(indigoPrimary[0], indigoPrimary[1], indigoPrimary[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, 19, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Generated on: ${exportDateStr}   •   Format: A4 Print Ready   •   Interest Rate: 0.5% Monthly Reducing Balance`,
    pageWidth / 2,
    24,
    { align: 'center' }
  );

  // Divider Line
  doc.setDrawColor(203, 213, 225); // Slate 300
  doc.setLineWidth(0.4);
  doc.line(marginX, 27, pageWidth - marginX, 27);

  // ==================== TOP METRIC CARDS ====================
  const boxY = 29.5;
  const boxHeight = 13;
  const availableWidth = pageWidth - (marginX * 2);
  const boxCount = 4;
  const boxGap = 3;
  const boxWidth = (availableWidth - (boxGap * (boxCount - 1))) / boxCount;

  const summaryBoxes = [
    {
      label: 'PROPOSED LOAN AMOUNT',
      value: `Rs. ${projection.principal.toLocaleString('en-IN')}`,
      sub: 'Base Sanction Amount',
      bg: [238, 242, 255], // indigo-50
      border: [199, 210, 254],
      text: [67, 56, 202]
    },
    {
      label: 'CALCULATED TENURE',
      value: `${projection.tenure} Months`,
      sub: `Rs. ${projection.monthlyPrincipal.toLocaleString('en-IN')} / mo Principal`,
      bg: [240, 249, 255], // sky-50
      border: [186, 230, 253],
      text: [3, 105, 161]
    },
    {
      label: '1ST MONTH EMI (PEAK)',
      value: `Rs. ${projection.firstMonthPayment.toLocaleString('en-IN')}`,
      sub: `Last EMI: Rs. ${projection.lastMonthPayment.toLocaleString('en-IN')}`,
      bg: [254, 243, 199], // amber-50
      border: [253, 230, 138],
      text: [180, 83, 9]
    },
    {
      label: 'TOTAL DUE (P + INT)',
      value: `Rs. ${projection.totalRepayable.toLocaleString('en-IN')}`,
      sub: `Interest: Rs. ${projection.totalInterest.toLocaleString('en-IN')}`,
      bg: [236, 253, 245], // emerald-50
      border: [167, 243, 208],
      text: [4, 120, 87]
    }
  ];

  summaryBoxes.forEach((box, i) => {
    const curX = marginX + (i * (boxWidth + boxGap));
    doc.setFillColor(box.bg[0], box.bg[1], box.bg[2]);
    doc.setDrawColor(box.border[0], box.border[1], box.border[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(curX, boxY, boxWidth, boxHeight, 1.2, 1.2, 'FD');

    doc.setFontSize(5.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(box.label, curX + (boxWidth / 2), boxY + 3.6, { align: 'center' });

    doc.setFontSize(8.4);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(box.text[0], box.text[1], box.text[2]);
    doc.text(box.value, curX + (boxWidth / 2), boxY + 7.8, { align: 'center' });

    doc.setFontSize(5.8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(box.sub, curX + (boxWidth / 2), boxY + 11.2, { align: 'center' });
  });

  // ==================== POLICY & RULES BANNER ====================
  const bannerY = 44.5;
  const bannerHeight = 8;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, bannerY, availableWidth, bannerHeight, 1, 1, 'FD');

  doc.setFontSize(6.8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(
    '• Principal Reduction: Rs. 5,000 fixed / month   • Reducing Interest: 0.5% monthly on opening balance   • Payment Window: 1st to 10th of every month',
    pageWidth / 2,
    bannerY + 5.2,
    { align: 'center' }
  );

  // ==================== SCHEDULE TABLE ROWS ====================
  const tableRows = projection.schedule.map((row) => {
    const isFirst = row.month === 1;
    const isLast = row.month === projection.tenure;
    const tag = isFirst ? ' (1st EMI)' : (isLast ? ' (Final EMI)' : '');

    return [
      String(row.month),
      `Month ${row.month}${tag}`,
      `Rs. ${row.openingBalance.toLocaleString('en-IN')}`,
      `Rs. ${row.principalPayment.toLocaleString('en-IN')}`,
      `Rs. ${row.interestPayment.toLocaleString('en-IN')}`,
      `Rs. ${row.totalPayment.toLocaleString('en-IN')}`,
      row.closingBalance > 0 ? `Rs. ${row.closingBalance.toLocaleString('en-IN')}` : 'Rs. 0'
    ];
  });

  // Table Footer Row
  const tableFoot = [
    [
      'TOTAL',
      `${projection.tenure} Installments`,
      '-',
      `Rs. ${projection.principal.toLocaleString('en-IN')}`,
      `Rs. ${projection.totalInterest.toLocaleString('en-IN')}`,
      `Rs. ${projection.totalRepayable.toLocaleString('en-IN')}`,
      'Rs. 0'
    ]
  ];

  autoTable(doc, {
    startY: 55,
    head: [[
      '#',
      'Installment Month',
      'Opening Balance',
      'Principal (Rs.)',
      'Interest (0.5%)',
      'Monthly Due (Rs.)',
      'Closing Balance'
    ]],
    body: tableRows,
    foot: tableFoot,
    theme: 'striped',
    showHead: 'everyPage',
    showFoot: 'lastPage',
    styles: {
      font: 'helvetica',
      fontSize: 7.8,
      cellPadding: 2,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
      valign: 'middle'
    },
    headStyles: {
      fillColor: [30, 27, 75], // Deep Indigo
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center'
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
      1: { halign: 'left', cellWidth: 36, fontStyle: 'bold' },
      2: { halign: 'right', cellWidth: 30 },
      3: { halign: 'right', cellWidth: 26 },
      4: { halign: 'right', cellWidth: 26, textColor: [79, 70, 229] },
      5: { halign: 'right', cellWidth: 32, fontStyle: 'bold', textColor: [15, 23, 42] },
      6: { halign: 'right', cellWidth: 30 }
    },
    didDrawPage: () => {
      // Footer with page numbering
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(
        'Unnati Trust (R) Official Loan EMI Projection Statement • For General Member Distribution',
        marginX,
        pageHeight - 6
      );
      doc.text(
        `Page ${(doc as any).internal.getNumberOfPages()}`,
        pageWidth - marginX,
        pageHeight - 6,
        { align: 'right' }
      );
    }
  });

  const fileName = `Unnati_Loan_Projection_Rs${projection.principal}_${format(now, 'ddMMMyyyy_HHmm')}.pdf`;

  return {
    doc,
    fileName
  };
}
