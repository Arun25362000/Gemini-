import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { UserProfile } from '../types';
import { getSafeMemberDisplayName } from './utils';

export interface MemberDetailsPdfOptions {
  members: UserProfile[];
  title?: string;
  activeLoanUserIdentifiers?: Set<string>;
}

export interface MemberDetailsPdfResult {
  doc: jsPDF;
  fileName: string;
  meta: {
    totalCount: number;
    withPhoneCount: number;
    uniquePhoneCount: number;
    withEmailCount: number;
    uniqueEmailCount: number;
    withAddressCount: number;
  };
}

/**
 * Normalizes phone number to standard 10-digit format (or non-digit trimmed)
 * to ensure shared numbers (e.g. 9535173734) match regardless of formatting or +91 prefix.
 */
export const normalizePhoneNumber = (raw?: string | null): string => {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed === '-' || trimmed.toLowerCase() === 'n/a' || trimmed.toLowerCase() === 'nil') {
    return '';
  }
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
};

/**
 * Normalizes email address to lowercase trimmed string.
 */
export const normalizeEmailAddress = (raw?: string | null): string => {
  if (!raw) return '';
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed || trimmed === '-' || trimmed === 'n/a' || trimmed === 'nil' || trimmed === 'none' || trimmed === 'no-email') {
    return '';
  }
  return trimmed;
};

/**
 * Builds a pristine, A4 print-ready PDF document containing full Member Details.
 * Columns: SlNo, Name, PhNum, Address, EmailId, JoiningDate.
 */
export function generateMemberDetailsPdfDoc(options: MemberDetailsPdfOptions): MemberDetailsPdfResult {
  const { members, title = 'Member Directory & Details Statement' } = options;
  const now = new Date();
  const exportDateStr = format(now, 'dd-MMM-yyyy hh:mm a');

  // Format date helper
  const formatJoinDate = (d?: string): string => {
    if (!d) return '-';
    try {
      const parsed = new Date(d);
      if (!isNaN(parsed.getTime())) {
        return format(parsed, 'dd-MMM-yyyy');
      }
      return d;
    } catch {
      return d;
    }
  };

  // Initialize jsPDF in A4 Portrait (ready to print A4)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 10;

  // Primary Colors
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
    `Generated on: ${exportDateStr}   •   Total Registered Members: ${members.length}   •   Format: A4 Print Ready`,
    pageWidth / 2,
    24,
    { align: 'center' }
  );

  // Divider Line
  doc.setDrawColor(203, 213, 225); // Slate 300
  doc.setLineWidth(0.4);
  doc.line(marginX, 27, pageWidth - marginX, 27);

  // ==================== TOP METRIC CARDS ====================
  const uniquePhones = new Set<string>();
  const uniqueEmails = new Set<string>();
  let withPhoneCount = 0;
  let withEmailCount = 0;
  let withAddressCount = 0;

  members.forEach(u => {
    const rawPhone = u.phoneNumber || (u as any).phone;
    const normPhone = normalizePhoneNumber(rawPhone);
    if (normPhone) {
      uniquePhones.add(normPhone);
      withPhoneCount++;
    }

    const rawEmail = u.email;
    const normEmail = normalizeEmailAddress(rawEmail);
    if (normEmail) {
      uniqueEmails.add(normEmail);
      withEmailCount++;
    }

    if (u.address && u.address.trim().length > 0 && u.address.trim() !== '-') {
      withAddressCount++;
    }
  });

  const uniquePhoneCount = uniquePhones.size;
  const uniqueEmailCount = uniqueEmails.size;

  const boxY = 29.5;
  const boxHeight = 11;
  const availableWidth = pageWidth - (marginX * 2);
  const boxCount = 4;
  const boxGap = 3;
  const boxWidth = (availableWidth - (boxGap * (boxCount - 1))) / boxCount;

  const summaryBoxes = [
    {
      label: 'TOTAL MEMBERS',
      value: `${members.length} Registered`,
      bg: [238, 242, 255], // indigo-50
      border: [199, 210, 254],
      text: [67, 56, 202]
    },
    {
      label: 'UNIQUE PHONES',
      value: `${uniquePhoneCount} Unique (${withPhoneCount} Rec.)`,
      bg: [236, 253, 245], // emerald-50
      border: [167, 243, 208],
      text: [4, 120, 87]
    },
    {
      label: 'UNIQUE EMAILS',
      value: `${uniqueEmailCount} Unique (${withEmailCount} Rec.)`,
      bg: [240, 249, 255], // sky-50
      border: [186, 230, 253],
      text: [3, 105, 161]
    },
    {
      label: 'ADDRESS RECORDED',
      value: `${withAddressCount} Members (${Math.round((withAddressCount / (members.length || 1)) * 100)}%)`,
      bg: [254, 243, 199], // amber-50
      border: [253, 230, 138],
      text: [180, 83, 9]
    }
  ];

  summaryBoxes.forEach((box, i) => {
    const curX = marginX + (i * (boxWidth + boxGap));
    doc.setFillColor(box.bg[0], box.bg[1], box.bg[2]);
    doc.setDrawColor(box.border[0], box.border[1], box.border[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(curX, boxY, boxWidth, boxHeight, 1.2, 1.2, 'FD');

    doc.setFontSize(6.2);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(box.label, curX + (boxWidth / 2), boxY + 3.8, { align: 'center' });

    doc.setFontSize(7.6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(box.text[0], box.text[1], box.text[2]);
    doc.text(box.value, curX + (boxWidth / 2), boxY + 8.5, { align: 'center' });
  });

  // ==================== TABLE BODY ROWS ====================
  // Columns requested: SlNo Name PhNum Address EmailId JoiningDate
  const tableRows = members.map((u, idx) => {
    const rawName = u.displayName || 'Unnamed';
    const phone = u.phoneNumber || (u as any).phone || '-';
    const email = u.email || '-';
    const name = getSafeMemberDisplayName(rawName, phone, email);
    const address = u.address || '-';
    const joinDate = formatJoinDate(u.joinDate);

    return [
      String(idx + 1),
      name,
      phone,
      address,
      email,
      joinDate
    ];
  });

  if (tableRows.length === 0) {
    tableRows.push(['-', 'No members found', '-', '-', '-', '-']);
  }

  // Footer Row - only shown on the last page of the report
  const tableFoot = [
    [
      'TOTAL',
      `${members.length} Members`,
      `${uniquePhoneCount} Unique Phones`,
      `${withAddressCount} Addresses`,
      `${uniqueEmailCount} Unique Emails`,
      '-'
    ]
  ];

  autoTable(doc, {
    startY: 44,
    head: [[
      'SlNo',
      'Name',
      'PhNum',
      'Address',
      'EmailId',
      'JoiningDate'
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
      valign: 'middle',
      overflow: 'linebreak'
    },
    headStyles: {
      fillColor: [30, 27, 75], // Deep Indigo
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
      1: { cellWidth: 36, fontStyle: 'bold' },
      2: { halign: 'center', cellWidth: 28 },
      3: { cellWidth: 50 },
      4: { cellWidth: 44 },
      5: { halign: 'center', cellWidth: 22 }
    },
    didDrawPage: () => {
      // Footer with page numbering
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(
        'Confidential • Unnati Trust (R) Official Member Directory • A4 Print Ready',
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

  const fileName = `Unnati_Member_Details_${format(now, 'ddMMMyyyy_HHmm')}.pdf`;

  return {
    doc,
    fileName,
    meta: {
      totalCount: members.length,
      withPhoneCount,
      uniquePhoneCount,
      withEmailCount,
      uniqueEmailCount,
      withAddressCount
    }
  };
}
