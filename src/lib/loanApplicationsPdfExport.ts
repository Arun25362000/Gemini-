import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { Loan, UserProfile } from '../types';
import { getSafeMemberDisplayName, normalizePhoneNumber } from './utils';

export interface LoanApplicationsPdfOptions {
  loans: Loan[];
  allUsers: UserProfile[];
  title?: string;
  filter?: 'all' | 'active' | 'closed';
}

export interface LoanApplicationsPdfResult {
  doc: jsPDF;
  fileName: string;
  meta: {
    totalApplications: number;
    activeCount: number;
    closedCount: number;
    pendingCount: number;
    uniqueApplicantsCount: number;
    uniquePhonesCount: number;
    totalAmount: number;
    activeAmount: number;
    closedAmount: number;
  };
}

/**
 * Helper to infer payment mode if not explicitly saved on the loan record.
 */
function inferLoanPaymentMode(loan: Loan, allUsers: UserProfile[]): 'Online' | 'Cash' | null {
  if (loan.paymentMode) return loan.paymentMode;
  const targetUser = allUsers.find(
    u => (loan.userId && u.uid === loan.userId) ||
         (loan.userEmail && u.email?.toLowerCase().trim() === loan.userEmail.toLowerCase().trim())
  );
  const name = (targetUser?.displayName || loan.userEmail || '').toLowerCase().replace(/\s/g, '');
  if (name.includes('shreenidhi') || name.includes('prasad')) {
    return 'Online';
  }
  return null;
}

/**
 * Builds a pristine, A4 print-ready PDF document containing Loan Applications.
 * Excludes payment and collection details, focusing exclusively on member loan applications
 * (active and closed ones).
 *
 * Columns: SlNo, Member Name, PhNum, Date, Loan Amount, Tenure, Details, Payment Mode, Status.
 */
export function generateLoanApplicationsPdfDoc(options: LoanApplicationsPdfOptions): LoanApplicationsPdfResult {
  const { loans, allUsers, title = 'Loan Applications Statement', filter = 'all' } = options;
  const now = new Date();
  const exportDateStr = format(now, 'dd-MMM-yyyy hh:mm a');

  // Filter out declined applications; only include active and closed applications
  let validLoans = loans.filter(l => l.status !== 'declined');

  if (filter === 'active') {
    validLoans = validLoans.filter(l => l.status !== 'paid');
  } else if (filter === 'closed') {
    validLoans = validLoans.filter(l => l.status === 'paid');
  }

  // Calculate metrics
  const activeCount = validLoans.filter(l => l.status === 'approved').length;
  const closedCount = validLoans.filter(l => l.status === 'paid').length;
  const pendingCount = validLoans.filter(l => l.status === 'pending').length;

  const totalAmount = validLoans.reduce((sum, l) => sum + (l.approvedAmount || l.amount || 0), 0);
  const activeAmount = validLoans
    .filter(l => l.status !== 'paid')
    .reduce((sum, l) => sum + (l.approvedAmount || l.amount || 0), 0);
  const closedAmount = validLoans
    .filter(l => l.status === 'paid')
    .reduce((sum, l) => sum + (l.approvedAmount || l.amount || 0), 0);

  const uniqueApplicants = new Set<string>();
  const uniquePhones = new Set<string>();

  validLoans.forEach(loan => {
    const targetUser = allUsers.find(
      u => (loan.userId && u.uid === loan.userId) ||
           (loan.userEmail && u.email?.toLowerCase().trim() === loan.userEmail.toLowerCase().trim())
    );
    const identifier = targetUser?.uid || targetUser?.email || loan.userId || loan.userEmail;
    if (identifier) uniqueApplicants.add(identifier.toLowerCase().trim());

    const rawPhone = targetUser?.phoneNumber || (targetUser as any)?.phone;
    const normPhone = normalizePhoneNumber(rawPhone);
    if (normPhone) uniquePhones.add(normPhone);
  });

  const uniqueApplicantsCount = uniqueApplicants.size;
  const uniquePhonesCount = uniquePhones.size;

  // Initialize jsPDF in A4 Landscape for pristine presentation of 9 columns
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 297 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 210 mm
  const marginX = 14;

  // Primary Colors
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
  const filterLabel = filter === 'active' ? 'Active Applications' : filter === 'closed' ? 'Closed / Repaid Applications' : 'Active & Closed Applications';
  doc.text(`${title} (${filterLabel})`, pageWidth / 2, 19, { align: 'center' });

  doc.setFontSize(8.5);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Generated on: ${exportDateStr}  •  Total Applications: ${validLoans.length}  •  Unique Applicants: ${uniqueApplicantsCount}  •  Format: A4 Print Ready`,
    pageWidth / 2,
    24,
    { align: 'center' }
  );

  // Divider Line
  doc.setDrawColor(203, 213, 225); // Slate 300
  doc.setLineWidth(0.4);
  doc.line(marginX, 27, pageWidth - marginX, 27);

  // ==================== TOP METRIC CARDS ====================
  const boxY = 30;
  const boxHeight = 13.5;
  const availableWidth = pageWidth - (marginX * 2);
  const boxCount = 5;
  const boxGap = 3.5;
  const boxWidth = (availableWidth - (boxGap * (boxCount - 1))) / boxCount;

  const summaryBoxes = [
    {
      label: 'TOTAL APPLICATIONS',
      value: `${validLoans.length} (${activeCount} Active / ${closedCount} Closed)`,
      bg: [248, 250, 252],
      border: [226, 232, 240],
      text: [15, 23, 42]
    },
    {
      label: 'UNIQUE APPLICANTS',
      value: `${uniqueApplicantsCount} Members (${uniquePhonesCount} Phones)`,
      bg: [238, 242, 255],
      border: [199, 210, 254],
      text: [67, 56, 202]
    },
    {
      label: 'TOTAL LOAN VALUE',
      value: `Rs. ${totalAmount.toLocaleString('en-IN')}`,
      bg: [240, 253, 250],
      border: [153, 246, 228],
      text: [13, 148, 136]
    },
    {
      label: 'ACTIVE PORTFOLIO',
      value: `Rs. ${activeAmount.toLocaleString('en-IN')}`,
      bg: [236, 253, 245],
      border: [167, 243, 208],
      text: [4, 120, 87]
    },
    {
      label: 'CLOSED / REPAID VALUE',
      value: `Rs. ${closedAmount.toLocaleString('en-IN')}`,
      bg: [245, 243, 255],
      border: [221, 214, 254],
      text: [109, 40, 217]
    }
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

  // ==================== TABLE BODY ROWS ====================
  const tableRows = validLoans.map((l, idx) => {
    const targetUser = allUsers.find(
      u => (l.userId && u.uid === l.userId) ||
           (l.userEmail && u.email?.toLowerCase().trim() === l.userEmail.toLowerCase().trim())
    );

    const rawPhone = targetUser?.phoneNumber || (targetUser as any)?.phone || '-';
    const rawName = targetUser?.displayName || (l.userEmail ? l.userEmail.split('@')[0] : 'Member');
    const memberName = getSafeMemberDisplayName(rawName, rawPhone, l.userEmail || targetUser?.email);

    // Format application / sanction date
    let dateStr = '-';
    let dateObj: Date | null = null;
    if (l.createdAt?.toDate) {
      dateObj = l.createdAt.toDate();
    } else if (l.approvedAt?.toDate) {
      dateObj = l.approvedAt.toDate();
    } else if (l.createdAt) {
      dateObj = new Date(l.createdAt);
    } else if (l.approvedAt) {
      dateObj = new Date(l.approvedAt);
    }
    if (dateObj && !isNaN(dateObj.getTime())) {
      dateStr = format(dateObj, 'dd-MMM-yyyy');
    }

    const loanAmt = l.approvedAmount || l.amount || 0;
    const installments = l.installments || 10;
    const details = l.details && l.details.trim() ? l.details.trim() : 'General Purpose';
    const mode = l.paymentMode || inferLoanPaymentMode(l, allUsers) || '-';

    let statusText = 'ACTIVE';
    if (l.status === 'paid') {
      statusText = 'CLOSED / REPAID';
    } else if (l.status === 'approved') {
      statusText = 'ACTIVE / APPROVED';
    } else if (l.status === 'pending') {
      statusText = 'PENDING';
    } else if (l.status) {
      statusText = String(l.status).toUpperCase();
    }

    return [
      String(idx + 1),
      memberName,
      rawPhone,
      dateStr,
      `Rs. ${loanAmt.toLocaleString('en-IN')}`,
      `${installments} Months`,
      details,
      mode,
      statusText
    ];
  });

  if (tableRows.length === 0) {
    tableRows.push(['-', 'No loan applications found', '-', '-', '-', '-', '-', '-', '-']);
  }

  // Footer Row - strictly restricted to the last page only
  const tableFoot = [
    [
      'TOTAL',
      `${validLoans.length} Applications (${uniqueApplicantsCount} Members)`,
      `${uniquePhonesCount} Unique Phones`,
      '-',
      `Rs. ${totalAmount.toLocaleString('en-IN')}`,
      '-',
      '-',
      '-',
      `${activeCount} Active / ${closedCount} Closed`
    ]
  ];

  autoTable(doc, {
    startY: 47,
    head: [[
      'SlNo',
      'Member Name',
      'PhNum',
      'App Date',
      'Loan Amount',
      'Tenure',
      'Purpose / Details',
      'Pay Mode',
      'Status'
    ]],
    body: tableRows,
    foot: tableFoot,
    theme: 'striped',
    showHead: 'everyPage',
    showFoot: 'lastPage',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.2,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
      valign: 'middle',
      overflow: 'linebreak'
    },
    headStyles: {
      fillColor: [30, 27, 75], // Dark indigo
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.2,
      halign: 'center'
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 8.2,
      lineWidth: 0.3,
      lineColor: [203, 213, 225]
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      1: { cellWidth: 44, fontStyle: 'bold', halign: 'left' },
      2: { halign: 'center', cellWidth: 28 },
      3: { halign: 'center', cellWidth: 26 },
      4: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
      5: { halign: 'center', cellWidth: 22 },
      6: { halign: 'left', cellWidth: 57 },
      7: { halign: 'center', cellWidth: 24 },
      8: { halign: 'center', cellWidth: 28, fontStyle: 'bold' }
    },
    didParseCell: (data) => {
      // Custom status badge text colors
      if (data.section === 'body' && data.column.index === 8) {
        const text = String(data.cell.raw || '');
        if (text.includes('CLOSED') || text.includes('REPAID')) {
          data.cell.styles.textColor = [5, 150, 105]; // Emerald
        } else if (text.includes('ACTIVE') || text.includes('APPROVED')) {
          data.cell.styles.textColor = [79, 70, 229]; // Indigo
        } else if (text.includes('PENDING')) {
          data.cell.styles.textColor = [217, 119, 6]; // Amber
        }
      }
    },
    didDrawPage: () => {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(
        'Confidential • Unnati Trust (R) Official Loan Applications Statement • A4 Print Ready',
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

  const fileName = `Unnati_Loan_Applications_${format(now, 'ddMMMyyyy_HHmm')}.pdf`;

  return {
    doc,
    fileName,
    meta: {
      totalApplications: validLoans.length,
      activeCount,
      closedCount,
      pendingCount,
      uniqueApplicantsCount,
      uniquePhonesCount,
      totalAmount,
      activeAmount,
      closedAmount
    }
  };
}
