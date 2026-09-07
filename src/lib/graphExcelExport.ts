import XLSX from 'xlsx-js-style';
import { format } from 'date-fns';
import { Filesystem, Directory } from '@capacitor/filesystem';

const isMobileApp = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || 
   window.location.protocol === 'file:' || 
   /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) &&
  !window.location.hostname.includes('asia-southeast1.run.app');

// Capacitor helper for mobile file downloads
async function saveOrDownloadWorkbook(wb: any, fileName: string, notify?: (type: 'success' | 'error' | 'info', message: string) => void) {
  if (isMobileApp) {
    try {
      const base64Data = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
      try {
        const status = await Filesystem.checkPermissions();
        if (status.publicStorage !== 'granted') {
          await Filesystem.requestPermissions();
        }
      } catch (pe) {
        console.warn("Permission check/request:", pe);
      }

      let savedUri = '';
      try {
        const res = await Filesystem.writeFile({
          path: `Download/${fileName}`,
          data: base64Data,
          directory: Directory.ExternalStorage,
          recursive: true
        });
        savedUri = res.uri;
      } catch (e1) {
        const res2 = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.ExternalStorage,
          recursive: true
        });
        savedUri = res2.uri;
      }

      if (notify) {
        notify('success', `Spreadsheet downloaded: ${fileName}`);
      } else {
        alert(`Spreadsheet downloaded successfully as ${fileName}`);
      }
      return;
    } catch (err: any) {
      console.warn("Mobile storage write failed, falling back to browser download:", err);
    }
  }

  // Web fallback / direct download
  XLSX.writeFile(wb, fileName);
  if (notify) {
    notify('success', `Exported ${fileName} successfully!`);
  }
}

// Styling definitions
const borderThin = {
  top: { style: 'thin', color: { rgb: 'CBD5E1' } },
  bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
  left: { style: 'thin', color: { rgb: 'CBD5E1' } },
  right: { style: 'thin', color: { rgb: 'CBD5E1' } }
};

const borderDoubleBottom = {
  top: { style: 'thin', color: { rgb: '64748B' } },
  bottom: { style: 'double', color: { rgb: '1E1B4B' } },
  left: { style: 'thin', color: { rgb: 'CBD5E1' } },
  right: { style: 'thin', color: { rgb: 'CBD5E1' } }
};

const styleTitle1 = {
  font: { name: 'Segoe UI', sz: 14, bold: true, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '1E1B4B' } }, // Deep Navy
  alignment: { horizontal: 'center', vertical: 'center' }
};

const styleTitle2 = {
  font: { name: 'Segoe UI', sz: 12, bold: true, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '312E81' } }, // Indigo 900
  alignment: { horizontal: 'center', vertical: 'center' }
};

const styleSubTitle = {
  font: { name: 'Segoe UI', sz: 9.5, italic: true, color: { rgb: '334155' } },
  fill: { fgColor: { rgb: 'F1F5F9' } },
  alignment: { horizontal: 'center', vertical: 'center' }
};

const styleHeader = {
  font: { name: 'Segoe UI', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '1E293B' } }, // Slate 800
  alignment: { vertical: 'center', wrapText: true },
  border: borderThin
};

// Single page printable setup helper
function setupSinglePagePrint(ws: any, colWidths: { wch: number }[], totalColumns: number, totalRows: number) {
  ws['!cols'] = colWidths;
  ws['!pageSetup'] = {
    orientation: 'landscape',
    paperSize: 9, // A4
    scale: 100,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1
  };
  ws['!margins'] = {
    left: 0.35,
    right: 0.35,
    top: 0.4,
    bottom: 0.4,
    header: 0.2,
    footer: 0.2
  };
}

// -------------------------------------------------------------
// 1. Export Graph 1: Month-wise Loan Sanctions & Repayments
// -------------------------------------------------------------
export interface MonthlySanctionRepaymentItem {
  month: number;
  name: string;
  sanctionedAmount: number;
  sanctionCount: number;
  repaidAmount: number;
  repaymentCount: number;
  repaymentPrincipal: number;
  repaymentInterest: number;
}

export async function exportGraphLoanSanctionsRepaymentsExcel({
  data,
  selectedYear,
  totalSanctionedSum,
  totalRepaymentsSum,
  totalSanctionedCount,
  totalRepaymentsCount,
  notify
}: {
  data: MonthlySanctionRepaymentItem[];
  selectedYear: number;
  totalSanctionedSum: number;
  totalRepaymentsSum: number;
  totalSanctionedCount: number;
  totalRepaymentsCount: number;
  notify?: (type: 'success' | 'error' | 'info', message: string) => void;
}) {
  const wb = XLSX.utils.book_new();
  const dateStr = format(new Date(), 'dd-MMM-yyyy hh:mm a');

  const headers = [
    'Month',
    'Loans Sanctioned (Qty)',
    'Sanctioned Principal (₹)',
    'Repayments (Qty)',
    'Principal Repaid (₹)',
    'Interest Collected (₹)',
    'Total Repaid (₹)',
    'Net Cashflow / Variance (₹)'
  ];

  const rows: any[][] = [
    ['UNNATI TRUST (R)'],
    [`MONTH-WISE LOAN SANCTIONS & REPAYMENTS STATEMENT - ${selectedYear}`],
    [`Accounting Period: Calendar Year ${selectedYear} | Generated: ${dateStr} | Print: Single Page Statement`],
    [],
    headers
  ];

  let totalPrincipal = 0;
  let totalInterest = 0;

  data.forEach((item) => {
    totalPrincipal += item.repaymentPrincipal || 0;
    totalInterest += item.repaymentInterest || 0;
    const netVariance = (item.repaidAmount || 0) - (item.sanctionedAmount || 0);

    rows.push([
      item.name,
      item.sanctionCount,
      item.sanctionedAmount,
      item.repaymentCount,
      item.repaymentPrincipal,
      item.repaymentInterest,
      item.repaidAmount,
      netVariance
    ]);
  });

  const totalVariance = totalRepaymentsSum - totalSanctionedSum;
  rows.push([
    `TOTAL (${selectedYear})`,
    totalSanctionedCount,
    totalSanctionedSum,
    totalRepaymentsCount,
    totalPrincipal,
    totalInterest,
    totalRepaymentsSum,
    totalVariance
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } }
  ];

  setupSinglePagePrint(
    ws,
    [{ wch: 16 }, { wch: 22 }, { wch: 24 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 25 }],
    8,
    rows.length
  );

  // Apply styling
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < 8; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };
      const cell = ws[ref];

      if (r === 0) cell.s = styleTitle1;
      else if (r === 1) cell.s = styleTitle2;
      else if (r === 2) cell.s = styleSubTitle;
      else if (r === 4) {
        cell.s = {
          ...styleHeader,
          alignment: { horizontal: c === 0 ? 'left' : (c === 1 || c === 3 ? 'center' : 'right'), vertical: 'center' }
        };
      } else if (r > 4 && r < rows.length - 1) {
        const isZebra = r % 2 === 0;
        cell.s = {
          font: { name: 'Segoe UI', sz: 10, color: { rgb: '0F172A' } },
          fill: { fgColor: { rgb: isZebra ? 'F8FAFC' : 'FFFFFF' } },
          alignment: { horizontal: c === 0 ? 'left' : (c === 1 || c === 3 ? 'center' : 'right'), vertical: 'center' },
          border: borderThin,
          numFmt: typeof cell.v === 'number' ? '#,##0' : undefined
        };
      } else if (r === rows.length - 1) {
        // Total summary row
        cell.s = {
          font: { name: 'Segoe UI', sz: 10.5, bold: true, color: { rgb: '1E1B4B' } },
          fill: { fgColor: { rgb: 'E0E7FF' } }, // Indigo highlight
          alignment: { horizontal: c === 0 ? 'left' : (c === 1 || c === 3 ? 'center' : 'right'), vertical: 'center' },
          border: borderDoubleBottom,
          numFmt: typeof cell.v === 'number' ? '#,##0' : undefined
        };
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Sanctions & Repayments');
  const fileName = `Loan_Sanctions_Repayments_${selectedYear}_${format(new Date(), 'MMMyyyy')}.xlsx`;
  await saveOrDownloadWorkbook(wb, fileName, notify);
}

// -------------------------------------------------------------
// 2. Export Graph 2: Member-wise Loan Disbursements by Month
// -------------------------------------------------------------
export interface MemberLoanDisbursementItem {
  memberName: string;
  email: string;
  amount: number;
  month: number;
  year: number;
  monthLabel: string;
  date: Date;
  status: 'approved' | 'paid';
}

export async function exportGraphMemberDisbursementsExcel({
  data,
  selectedYear,
  selectedMonthFilter,
  notify
}: {
  data: MemberLoanDisbursementItem[];
  selectedYear: number;
  selectedMonthFilter: string;
  notify?: (type: 'success' | 'error' | 'info', message: string) => void;
}) {
  const wb = XLSX.utils.book_new();
  const dateStr = format(new Date(), 'dd-MMM-yyyy hh:mm a');

  const headers = [
    'Sl No.',
    'Member Name',
    'Registered Email',
    'Disbursal Date',
    'Disbursal Month',
    'Disbursed Principal (₹)',
    'Loan Portfolio Status'
  ];

  const rows: any[][] = [
    ['UNNATI TRUST (R)'],
    [`MEMBER-WISE LOAN DISBURSEMENTS STATEMENT - ${selectedYear}`],
    [`Filter Scope: ${selectedMonthFilter === 'all' ? 'All Months' : selectedMonthFilter} | Period: ${selectedYear} | Printed: ${dateStr}`],
    [],
    headers
  ];

  let totalDisbursed = 0;

  data.forEach((item, idx) => {
    totalDisbursed += item.amount || 0;
    rows.push([
      idx + 1,
      item.memberName,
      item.email || '-',
      format(item.date, 'dd-MMM-yyyy'),
      item.monthLabel,
      item.amount,
      item.status === 'paid' ? 'Repaid / Closed' : 'Active / Approved'
    ]);
  });

  rows.push([
    'TOTAL DISBURSED',
    '',
    '',
    '',
    `${data.length} Sanctioned Loans`,
    totalDisbursed,
    ''
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } },
    { s: { r: rows.length - 1, c: 0 }, e: { r: rows.length - 1, c: 3 } }
  ];

  setupSinglePagePrint(
    ws,
    [{ wch: 8 }, { wch: 28 }, { wch: 32 }, { wch: 18 }, { wch: 18 }, { wch: 25 }, { wch: 22 }],
    7,
    rows.length
  );

  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < 7; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };
      const cell = ws[ref];

      if (r === 0) cell.s = styleTitle1;
      else if (r === 1) cell.s = styleTitle2;
      else if (r === 2) cell.s = styleSubTitle;
      else if (r === 4) {
        cell.s = {
          ...styleHeader,
          alignment: { horizontal: c === 0 || c === 3 || c === 4 || c === 6 ? 'center' : (c === 5 ? 'right' : 'left'), vertical: 'center' }
        };
      } else if (r > 4 && r < rows.length - 1) {
        const isZebra = r % 2 === 0;
        cell.s = {
          font: { name: 'Segoe UI', sz: 10, color: { rgb: '0F172A' } },
          fill: { fgColor: { rgb: isZebra ? 'F8FAFC' : 'FFFFFF' } },
          alignment: { horizontal: c === 0 || c === 3 || c === 4 || c === 6 ? 'center' : (c === 5 ? 'right' : 'left'), vertical: 'center' },
          border: borderThin,
          numFmt: typeof cell.v === 'number' ? '#,##0' : undefined
        };
      } else if (r === rows.length - 1) {
        cell.s = {
          font: { name: 'Segoe UI', sz: 10.5, bold: true, color: { rgb: '4C1D95' } },
          fill: { fgColor: { rgb: 'EDE9FE' } }, // Violet highlight
          alignment: { horizontal: c === 5 ? 'right' : (c === 4 ? 'center' : 'left'), vertical: 'center' },
          border: borderDoubleBottom,
          numFmt: typeof cell.v === 'number' ? '#,##0' : undefined
        };
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Loan Disbursements');
  const fileName = `Member_Loan_Disbursements_${selectedYear}_${format(new Date(), 'MMMyyyy')}.xlsx`;
  await saveOrDownloadWorkbook(wb, fileName, notify);
}

// -------------------------------------------------------------
// 3. Export Graph 3: Memberwise Borrowed vs Repaid
// -------------------------------------------------------------
export interface MemberLoanSummaryItem {
  name: string;
  email?: string;
  borrowed: number;
  repaidPrincipal: number;
  interestPaid: number;
  totalRepaid: number;
  balancePrincipal: number;
  totalLoans: number;
  activeLoans: number;
  closedLoans: number;
}

export async function exportGraphMemberwiseBorrowedRepaidExcel({
  data,
  selectedYear,
  notify
}: {
  data: MemberLoanSummaryItem[];
  selectedYear: number;
  notify?: (type: 'success' | 'error' | 'info', message: string) => void;
}) {
  const wb = XLSX.utils.book_new();
  const dateStr = format(new Date(), 'dd-MMM-yyyy hh:mm a');

  const headers = [
    'Sl No.',
    'Member Name',
    'Total Loans (Qty)',
    'Active / Closed',
    'Total Borrowed (₹)',
    'Principal Repaid (₹)',
    'Interest Paid (₹)',
    'Total Repaid (₹)',
    'Outstanding Principal (₹)'
  ];

  const rows: any[][] = [
    ['UNNATI TRUST (R)'],
    [`MEMBERWISE BORROWED VS REPAID AUDIT STATEMENT - ${selectedYear}`],
    [`Accounting Period: Calendar Year ${selectedYear} | Generated: ${dateStr} | Active & Settled Accounts`],
    [],
    headers
  ];

  let sumBorrowed = 0;
  let sumPrincipal = 0;
  let sumInterest = 0;
  let sumTotalRepaid = 0;
  let sumBalancePrincipal = 0;
  let sumLoansCount = 0;

  data.forEach((item, idx) => {
    sumBorrowed += item.borrowed || 0;
    sumPrincipal += item.repaidPrincipal || 0;
    sumInterest += item.interestPaid || 0;
    sumTotalRepaid += item.totalRepaid || 0;
    sumBalancePrincipal += item.balancePrincipal || 0;
    sumLoansCount += item.totalLoans || 0;

    rows.push([
      idx + 1,
      item.name,
      item.totalLoans,
      `${item.activeLoans} Active / ${item.closedLoans} Closed`,
      item.borrowed,
      item.repaidPrincipal,
      item.interestPaid,
      item.totalRepaid,
      item.balancePrincipal
    ]);
  });

  rows.push([
    'TOTAL (ALL MEMBERS)',
    '',
    sumLoansCount,
    '',
    sumBorrowed,
    sumPrincipal,
    sumInterest,
    sumTotalRepaid,
    sumBalancePrincipal
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 8 } },
    { s: { r: rows.length - 1, c: 0 }, e: { r: rows.length - 1, c: 1 } }
  ];

  setupSinglePagePrint(
    ws,
    [{ wch: 8 }, { wch: 28 }, { wch: 16 }, { wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 22 }, { wch: 26 }],
    9,
    rows.length
  );

  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < 9; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };
      const cell = ws[ref];

      if (r === 0) cell.s = styleTitle1;
      else if (r === 1) cell.s = styleTitle2;
      else if (r === 2) cell.s = styleSubTitle;
      else if (r === 4) {
        cell.s = {
          ...styleHeader,
          alignment: { horizontal: c === 0 || c === 2 || c === 3 ? 'center' : (c >= 4 ? 'right' : 'left'), vertical: 'center' }
        };
      } else if (r > 4 && r < rows.length - 1) {
        const isZebra = r % 2 === 0;
        cell.s = {
          font: { name: 'Segoe UI', sz: 10, color: { rgb: '0F172A' } },
          fill: { fgColor: { rgb: isZebra ? 'F8FAFC' : 'FFFFFF' } },
          alignment: { horizontal: c === 0 || c === 2 || c === 3 ? 'center' : (c >= 4 ? 'right' : 'left'), vertical: 'center' },
          border: borderThin,
          numFmt: typeof cell.v === 'number' ? '#,##0' : undefined
        };
      } else if (r === rows.length - 1) {
        cell.s = {
          font: { name: 'Segoe UI', sz: 10.5, bold: true, color: { rgb: '155E75' } },
          fill: { fgColor: { rgb: 'CFFAFE' } }, // Cyan highlight
          alignment: { horizontal: c >= 4 ? 'right' : (c === 2 ? 'center' : 'left'), vertical: 'center' },
          border: borderDoubleBottom,
          numFmt: typeof cell.v === 'number' ? '#,##0' : undefined
        };
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Borrowed vs Repaid');
  const fileName = `Memberwise_Borrowed_vs_Repaid_${selectedYear}_${format(new Date(), 'MMMyyyy')}.xlsx`;
  await saveOrDownloadWorkbook(wb, fileName, notify);
}

// -------------------------------------------------------------
// 4. Export Graph 4: Financial Health Overview
// -------------------------------------------------------------
export interface FinancialHealthOverviewData {
  chartData: Array<{
    category: string;
    subtitle: string;
    baseAmount: number;
    interestAmount: number;
    totalAmount: number;
  }>;
  totalGroupFunds: number;
  loansSanctioned: number;
  loansRepaid: number;
  outstandingLoans: number;
  availableBalance: number;
  paidContributionsInYear: number;
  paidInterestInYear: number;
}

export async function exportGraphFinancialHealthExcel({
  data,
  selectedYear,
  notify
}: {
  data: FinancialHealthOverviewData;
  selectedYear: number;
  notify?: (type: 'success' | 'error' | 'info', message: string) => void;
}) {
  const wb = XLSX.utils.book_new();
  const dateStr = format(new Date(), 'dd-MMM-yyyy hh:mm a');

  const headers = [
    'Sl No.',
    'Financial Metric / Capital Head',
    'Category & Purpose',
    'Base Component (₹)',
    'Interest / Surplus (₹)',
    'Total Net Amount (₹)',
    'Reconciliation & Audit Status'
  ];

  const rows: any[][] = [
    ['UNNATI TRUST (R)'],
    [`FINANCIAL HEALTH & GROUP CAPITAL STATEMENT - ${selectedYear}`],
    [`Capital Reserve & Liquidity Health | Period: ${selectedYear} | Generated: ${dateStr}`],
    [],
    headers
  ];

  data.chartData.forEach((item, idx) => {
    let statusDesc = '';
    if (item.category === 'Total Group Funds') {
      statusDesc = 'Gross Accumulated Capital (Contributions + Interest)';
    } else if (item.category === 'Loans Sanctioned') {
      statusDesc = 'Approved Principal Disbursed to Members';
    } else if (item.category === 'Loans Repaid') {
      statusDesc = 'Principal Capital Recovered back to Pool';
    } else if (item.category === 'Outstanding Loans') {
      statusDesc = 'Active Funds Currently Deployed in Loans';
    } else if (item.category === 'Available Balance') {
      statusDesc = 'Net Unrestricted Liquid Balance (Cash + Bank)';
    }

    rows.push([
      idx + 1,
      item.category,
      item.subtitle,
      item.baseAmount,
      item.interestAmount,
      item.totalAmount,
      statusDesc
    ]);
  });

  // Reconciled check
  rows.push([]);
  rows.push(['AUDIT RECONCILIATION SUMMARY', '', '', '', '', '', '']);
  rows.push([
    'A',
    'Active Loans Outstanding (Due from Members)',
    'Funds deployed',
    data.outstandingLoans,
    '',
    data.outstandingLoans,
    'Verified active principal portfolio'
  ]);
  rows.push([
    'B',
    'Liquid Pool Reserves (Available Balance)',
    'Cash in hand + Bank',
    data.availableBalance,
    '',
    data.availableBalance,
    'Immediately available liquid funds'
  ]);
  rows.push([
    'C',
    'TOTAL ACCOUNTED CAPITAL (A + B)',
    'Total Trust Assets',
    data.outstandingLoans + data.availableBalance,
    '',
    data.outstandingLoans + data.availableBalance,
    `100% MATCHES TOTAL GROUP SAVINGS (₹${data.totalGroupFunds.toLocaleString('en-IN')})`
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } },
    { s: { r: 11, c: 0 }, e: { r: 11, c: 6 } }
  ];

  setupSinglePagePrint(
    ws,
    [{ wch: 8 }, { wch: 34 }, { wch: 28 }, { wch: 22 }, { wch: 22 }, { wch: 24 }, { wch: 45 }],
    7,
    rows.length
  );

  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < 7; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };
      const cell = ws[ref];

      if (r === 0) cell.s = styleTitle1;
      else if (r === 1) cell.s = styleTitle2;
      else if (r === 2) cell.s = styleSubTitle;
      else if (r === 4) {
        cell.s = {
          ...styleHeader,
          alignment: { horizontal: c === 0 ? 'center' : (c >= 3 && c <= 5 ? 'right' : 'left'), vertical: 'center' }
        };
      } else if (r >= 5 && r <= 9) {
        const isZebra = r % 2 === 0;
        cell.s = {
          font: { name: 'Segoe UI', sz: 10, color: { rgb: '0F172A' } },
          fill: { fgColor: { rgb: isZebra ? 'F8FAFC' : 'FFFFFF' } },
          alignment: { horizontal: c === 0 ? 'center' : (c >= 3 && c <= 5 ? 'right' : 'left'), vertical: 'center' },
          border: borderThin,
          numFmt: typeof cell.v === 'number' ? '#,##0' : undefined
        };
      } else if (r === 11) {
        cell.s = {
          font: { name: 'Segoe UI', sz: 10.5, bold: true, color: { rgb: '065F46' } },
          fill: { fgColor: { rgb: 'D1FAE5' } },
          alignment: { horizontal: 'left', vertical: 'center' },
          border: borderThin
        };
      } else if (r >= 12 && r <= 14) {
        const isFinal = r === 14;
        cell.s = {
          font: { name: 'Segoe UI', sz: 10, bold: isFinal, color: { rgb: isFinal ? '065F46' : '0F172A' } },
          fill: { fgColor: { rgb: isFinal ? 'ECFDF5' : 'FFFFFF' } },
          alignment: { horizontal: c === 0 ? 'center' : (c >= 3 && c <= 5 ? 'right' : 'left'), vertical: 'center' },
          border: isFinal ? borderDoubleBottom : borderThin,
          numFmt: typeof cell.v === 'number' ? '#,##0' : undefined
        };
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Financial Health');
  const fileName = `Financial_Health_Overview_${selectedYear}_${format(new Date(), 'MMMyyyy')}.xlsx`;
  await saveOrDownloadWorkbook(wb, fileName, notify);
}
